// Team-Chat für Admins und Moderatoren: Gruppen, live (alle paar Sekunden aktualisiert), mit @KI
import { t, LOCALE } from './i18n.js';
import { markdown, enhance } from './render.js';

const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const root = $('#team');
let current = null; // { id, name, canManage, lastId }
let pollTimer = null;
let listTimer = null;
let toastFn = (m) => console.log(m);

async function api(path, body, method) {
  const res = await fetch(`/api/groups${path}`, {
    method: method ?? (body ? 'POST' : 'GET'),
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || t('Etwas ist schiefgelaufen.', 'Something went wrong.'));
  return data;
}
const when = (ts) => {
  const d = new Date(ts);
  const today = new Date().toDateString() === d.toDateString();
  return today ? d.toLocaleTimeString(LOCALE, { hour: '2-digit', minute: '2-digit' }) : d.toLocaleDateString(LOCALE, { day: 'numeric', month: 'short' });
};
function show(pane) {
  root.querySelectorAll('[data-pane]').forEach((p) => { p.hidden = p.dataset.pane !== pane; });
  $('#team-back').hidden = pane === 'list';
  $('#team-members-btn').hidden = pane !== 'chat';
}

// ── Liste ─────────────────────────────────────────────────────────
async function loadList() {
  try {
    const { groups } = await api('');
    $('#team-list').innerHTML = groups.length ? groups.map((g) => `
      <li><button type="button" class="team-row" data-open-group="${esc(g.id)}">
        <span class="team-avatar" aria-hidden="true">${esc(g.name.slice(0, 1).toUpperCase())}</span>
        <span class="team-row-text"><b>${esc(g.name)}</b><small>${esc(g.last || t('Noch keine Nachrichten', 'No messages yet'))}</small></span>
        <span class="team-row-meta">${g.lastAt ? `<small>${when(g.lastAt)}</small>` : ''}${g.unread ? `<i class="team-unread">${g.unread}</i>` : ''}</span>
      </button></li>`).join('')
      : `<li class="team-empty">${t('Noch keine Gruppe. Leg eine an und lade andere Admins oder Mods ein.', 'No group yet. Create one and invite other admins or mods.')}</li>`;
    const unread = groups.reduce((n, g) => n + g.unread, 0);
    document.querySelectorAll('[data-team-unread]').forEach((el) => { el.textContent = unread || ''; el.hidden = !unread; });
  } catch (err) { toastFn(err.message); }
}

async function openCreate() {
  show('create');
  $('#team-name').value = '';
  try {
    const { staff } = await api('/staff');
    $('#team-pick').innerHTML = staff.length ? staff.map((u) => `<li><label><input type="checkbox" value="${u.id}"> <span>${esc(u.name)}</span><small>${u.admin ? 'Admin' : 'Mod'}</small></label></li>`).join('')
      : `<li class="team-empty">${t('Es gibt noch keine anderen Admins oder Mods. Mach im Admin-Bereich jemanden zum Mod.', 'There are no other admins or mods yet. Make someone a mod in the admin area.')}</li>`;
  } catch (err) { toastFn(err.message); }
  $('#team-name').focus();
}

// ── Gespräch ──────────────────────────────────────────────────────
function renderMessages(list, append) {
  const box = $('#team-msgs');
  if (!append) box.innerHTML = '';
  const nearBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 120;
  for (const m of list) {
    const li = document.createElement('li');
    li.className = `team-msg${m.mine ? ' mine' : ''}${m.ai ? ' ai' : ''}`;
    li.innerHTML = `${m.mine ? '' : `<p class="team-from">${m.ai ? '✦ ' : ''}${esc(m.name)}</p>`}<div class="team-bubble md"></div><time>${when(m.at)}</time>`;
    const bubble = li.querySelector('.team-bubble');
    if (m.ai) { bubble.innerHTML = markdown(m.text); enhance(bubble); } else bubble.textContent = m.text;
    box.append(li);
  }
  if (!append || nearBottom || list.some((m) => m.mine)) box.scrollTop = box.scrollHeight;
}
async function poll(first = false) {
  if (!current) return;
  clearTimeout(pollTimer);
  try {
    const d = await api(`/${encodeURIComponent(current.id)}/messages?after=${first ? 0 : current.lastId}`);
    current.canManage = d.group.canManage;
    current.members = d.members;
    $('#team-title').textContent = d.group.name;
    $('#team-sub').textContent = d.members.map((m) => m.name).join(', ');
    if (d.messages.length || first) {
      renderMessages(d.messages, !first);
      if (d.messages.length) current.lastId = d.messages.at(-1).id;
    }
    $('#team-thinking').hidden = !d.thinking;
  } catch (err) {
    if (first) { toastFn(err.message); return closeChat(); }
  }
  pollTimer = setTimeout(() => poll(), document.hidden ? 15000 : 2500);
}
function openChat(id) {
  current = { id, lastId: 0 };
  show('chat');
  $('#team-msgs').innerHTML = '';
  $('#team-title').textContent = '…';
  poll(true);
  setTimeout(() => $('#team-input').focus(), 50);
}
function closeChat() {
  current = null;
  clearTimeout(pollTimer);
  show('list');
  loadList();
}

// ── Öffnen/Schließen ──────────────────────────────────────────────
export function openTeam(groupId = null, opts = {}) {
  if (opts.toast) toastFn = opts.toast;
  root.hidden = false;
  if (groupId) openChat(groupId); else { show('list'); loadList(); }
  clearInterval(listTimer);
  listTimer = setInterval(() => { if (!current && !root.hidden) loadList(); }, 10000);
}
export function closeTeam() {
  root.hidden = true;
  current = null;
  clearTimeout(pollTimer);
  clearInterval(listTimer);
  if (location.hash.startsWith('#g/')) history.replaceState(null, '', location.pathname);
}
export const refreshTeamBadge = loadList;

$('#team-close').addEventListener('click', closeTeam);
$('#team-back').addEventListener('click', () => (current ? closeChat() : show('list')));
$('#team-new').addEventListener('click', openCreate);
$('#team-list').addEventListener('click', (e) => {
  const b = e.target.closest('[data-open-group]');
  if (b) openChat(b.dataset.openGroup);
});
$('#team-create').addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = $('#team-name').value.trim();
  if (!name) return toastFn(t('Bitte gib der Gruppe einen Namen.', 'Please give the group a name.'));
  const memberIds = [...root.querySelectorAll('#team-pick input:checked')].map((i) => Number(i.value));
  try { const d = await api('', { name, memberIds }); openChat(d.id); } catch (err) { toastFn(err.message); }
});
$('#team-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const input = $('#team-input');
  const text = input.value.trim();
  if (!text || !current) return;
  input.value = '';
  try {
    const d = await api(`/${encodeURIComponent(current.id)}/messages`, { text });
    if (d.ai) $('#team-thinking').hidden = false;
    poll();
  } catch (err) { toastFn(err.message); input.value = text; }
});
$('#team-input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey && !matchMedia('(pointer: coarse)').matches) { e.preventDefault(); $('#team-form').requestSubmit(); }
});
$('#team-ki').addEventListener('click', () => {
  const input = $('#team-input');
  if (!/@ki\b/i.test(input.value)) input.value = `@KI ${input.value}`.trimEnd() + ' ';
  input.focus();
});
// Mitglieder
$('#team-members-btn').addEventListener('click', async () => {
  if (!current) return;
  show('members');
  const box = $('#team-members');
  let staff = [];
  try { staff = (await api('/staff')).staff; } catch { /* egal */ }
  const inside = new Set((current.members ?? []).map((m) => m.id));
  box.innerHTML = `
    <p class="team-label">${t('Mitglieder', 'Members')}</p>
    <ul class="team-pick">${(current.members ?? []).map((m) => `<li><span>${esc(m.name)}</span>${current.canManage ? `<button type="button" class="team-small" data-remove="${m.id}">${t('Entfernen', 'Remove')}</button>` : ''}</li>`).join('')}</ul>
    ${current.canManage && staff.some((s) => !inside.has(s.id)) ? `<p class="team-label">${t('Hinzufügen', 'Add')}</p>
    <ul class="team-pick">${staff.filter((s) => !inside.has(s.id)).map((s) => `<li><span>${esc(s.name)}</span><button type="button" class="team-small" data-add="${s.id}">${t('Hinzufügen', 'Add')}</button></li>`).join('')}</ul>` : ''}
    <div class="team-actions"><button type="button" class="btn ghost-btn" data-leave>${t('Gruppe verlassen', 'Leave group')}</button>
    ${current.canManage ? `<button type="button" class="btn ghost-btn danger-text" data-delete>${t('Gruppe löschen', 'Delete group')}</button>` : ''}</div>`;
});
$('#team-members').addEventListener('click', async (e) => {
  const id = current?.id;
  if (!id) return;
  try {
    const add = e.target.closest('[data-add]');
    const rem = e.target.closest('[data-remove]');
    if (add || rem) {
      await api(`/${encodeURIComponent(id)}/members`, add ? { add: [Number(add.dataset.add)] } : { remove: [Number(rem.dataset.remove)] });
      const d = await api(`/${encodeURIComponent(id)}/messages?after=${current.lastId}`);
      current.members = d.members;
      $('#team-members-btn').click();
      return;
    }
    if (e.target.closest('[data-leave]')) {
      if (!confirm(t('Gruppe wirklich verlassen?', 'Really leave the group?'))) return;
      await api(`/${encodeURIComponent(id)}/leave`, {});
      return closeChat();
    }
    if (e.target.closest('[data-delete]')) {
      if (!confirm(t('Gruppe mit allen Nachrichten löschen?', 'Delete the group with all messages?'))) return;
      await api(`/${encodeURIComponent(id)}`, null, 'DELETE');
      return closeChat();
    }
  } catch (err) { toastFn(err.message); }
});
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !root.hidden) closeTeam(); });
document.addEventListener('visibilitychange', () => { if (!document.hidden && current) poll(); });

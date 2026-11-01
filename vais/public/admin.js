// Admin-Seite von VAIs
import { t, LOCALE, translateDom } from './i18n.js';

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const num = (n) => Number(n).toLocaleString(LOCALE);
const when = (ts) => new Date(ts).toLocaleString(LOCALE, { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
const MODE = { agent: 'Agent X', battle: 'Battle', sxs: t('Nebeneinander', 'Side by side'), direct: t('Direkt', 'Direct') };

let toastTimer;
function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 2600);
}

async function api(path, body) {
  const res = await fetch(`/api/admin/${path}`, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {});
  if (res.status === 401) location.replace('/login');
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || t('Fehler', 'Error'));
  return data;
}

function tiles(c) {
  const list = [
    [t('Nutzer', 'Users'), c.users, t(`${num(c.new7)} neu in 7 Tagen`, `${num(c.new7)} new in 7 days`)],
    [t('Aktiv heute', 'Active today'), c.active1, t(`${num(c.active7)} in 7 Tagen`, `${num(c.active7)} in 7 days`)],
    [t('Fragen heute', 'Questions today'), c.questions24, t(`${num(c.chats)} Chats insgesamt`, `${num(c.chats)} chats in total`)],
    [t('Stimmen', 'Votes'), c.votes, t('im Battle', 'in battles')],
    [t('Fehler heute', 'Errors today'), c.errors24, t(`${num(c.fallbacks24)} Ersatz-Modelle`, `${num(c.fallbacks24)} fallbacks`), c.errors24 > 0],
    [t('Gesperrt', 'Blocked'), c.blocked, t(`${num(c.verified)} bestätigt`, `${num(c.verified)} verified`)],
  ];
  $('#tiles').innerHTML = list.map(([label, value, sub, warn]) => `
    <div class="adm-tile${warn ? ' warn' : ''}"><span class="adm-tile-label">${esc(label)}</span><b>${num(value)}</b><small>${esc(sub)}</small></div>`).join('');
}

function perDay(rows) {
  const max = Math.max(1, ...rows.map((r) => r.n));
  $('#per-day').innerHTML = rows.map((r, i) => {
    const d = new Date(`${r.day}T12:00:00`);
    const label = d.toLocaleDateString(LOCALE, { weekday: 'short', day: 'numeric', month: 'numeric' });
    const show = i === rows.length - 1 || r.n === max;
    return `<div class="adm-col" tabindex="0" aria-label="${esc(label)}: ${r.n}">
      <span class="adm-col-val"${show && r.n ? '' : ' hidden'}>${num(r.n)}</span>
      <span class="adm-col-bar" style="height:${Math.max(r.n ? 3 : 0, (r.n / max) * 100)}%"></span>
      <span class="adm-tip">${esc(label)}: <b>${num(r.n)}</b></span>
      <small>${i % 2 === rows.length % 2 ? '' : d.getDate()}</small>
    </div>`;
  }).join('');
}

function models(list, modes) {
  const max = Math.max(1, ...list.map((m) => m.n));
  $('#models').innerHTML = list.length ? list.map((m) => `
    <li><span class="adm-bar-name">${esc(m.name || m.id)}<small>${esc(m.maker || '')}</small></span>
      <span class="adm-bar"><i style="width:${(m.n / max) * 100}%"></i></span><b>${num(m.n)}</b></li>`).join('')
    : `<li class="adm-empty">${t('Noch keine Antworten.', 'No answers yet.')}</li>`;
  $('#modes').textContent = modes.length ? `${t('Modi', 'Modes')}: ${modes.map((m) => `${MODE[m.mode] ?? m.mode} ${num(m.n)}`).join(' · ')}` : '';
}

function events(list, busy) {
  $('#busy').textContent = busy.length ? `${t('Gerade ausgelastet', 'Busy right now')}: ${busy.slice(0, 8).join(', ')}${busy.length > 8 ? ` +${busy.length - 8}` : ''}` : t('Alle Modelle sind gerade frei.', 'All models are available right now.');
  const KIND = { error: t('Fehler', 'Error'), fallback: t('Ersatz', 'Fallback'), admin: 'Admin' };
  $('#events').innerHTML = list.length ? list.map((e) => `
    <li class="${e.kind}"><span class="adm-ev-kind">${esc(KIND[e.kind] ?? e.kind)}</span>
      <span class="adm-ev-text">${e.model ? `<b>${esc(e.model)}</b> ` : ''}${esc(e.detail)}</span>
      <time>${when(e.at)}</time></li>`).join('')
    : `<li class="adm-empty">${t('Keine Probleme. 🎉', 'No problems. 🎉')}</li>`;
}

function boardState(resetAt) {
  $('#board-state').textContent = resetAt
    ? t(`Zurückgesetzt am ${when(resetAt)} – gezählt werden Stimmen ab dann.`, `Reset on ${when(resetAt)} – votes since then are counted.`)
    : t('Alle Stimmen werden gezählt.', 'All votes are counted.');
  $('#undo-board').hidden = !resetAt;
}

async function load() {
  $('#refresh').classList.add('spin');
  try {
    const d = await api('overview');
    $('#demo').hidden = !d.demo;
    tiles(d.counts);
    perDay(d.perDay);
    models(d.models, d.modes);
    events(d.events, d.busy);
    boardState(d.boardResetAt);
  } catch (err) {
    toast(err.message);
  } finally {
    $('#refresh').classList.remove('spin');
  }
}

// ── Nutzer ────────────────────────────────────────────────────────
let qTimer;
async function loadUsers() {
  try {
    const { users } = await api(`users?q=${encodeURIComponent($('#user-q').value.trim())}`);
    $('#users').innerHTML = users.length ? users.map((u) => `
      <li class="${u.blocked ? 'blocked' : ''}">
        <span class="adm-user"><b>${esc(u.email)}</b>
          <small>${t('seit', 'since')} ${new Date(u.created).toLocaleDateString(LOCALE)} · ${num(u.chats)} Chats${u.lastActive ? ` · ${t('aktiv', 'active')} ${when(u.lastActive)}` : ''}${u.verified ? '' : ` · ${t('nicht bestätigt', 'not verified')}`}</small></span>
        ${u.admin ? '<span class="adm-pill">Admin</span>' : `<button class="adm-btn small${u.blocked ? '' : ' danger'}" data-block="${u.id}" data-to="${u.blocked ? '0' : '1'}" data-email="${esc(u.email)}">${u.blocked ? t('Entsperren', 'Unblock') : t('Sperren', 'Block')}</button>`}
      </li>`).join('') : `<li class="adm-empty">${t('Niemand gefunden.', 'Nobody found.')}</li>`;
  } catch (err) {
    toast(err.message);
  }
}
$('#user-q').addEventListener('input', () => { clearTimeout(qTimer); qTimer = setTimeout(loadUsers, 250); });
$('#users').addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-block]');
  if (!btn) return;
  const block = btn.dataset.to === '1';
  if (block && !confirm(t(`${btn.dataset.email} sperren? Die Person wird sofort abgemeldet.`, `Block ${btn.dataset.email}? They will be signed out immediately.`))) return;
  btn.disabled = true;
  try {
    await api('block', { userId: Number(btn.dataset.block), blocked: block });
    toast(block ? t('Gesperrt.', 'Blocked.') : t('Entsperrt.', 'Unblocked.'));
    await Promise.all([loadUsers(), load()]);
  } catch (err) {
    toast(err.message);
    btn.disabled = false;
  }
});

// ── Bestenliste ──────────────────────────────────────────────────
$('#reset-board').addEventListener('click', async () => {
  if (!confirm(t('Bestenliste wirklich zurücksetzen? Danach zählen nur neue Stimmen.', 'Really reset the leaderboard? Only new votes will count.'))) return;
  try { boardState((await api('reset-board', {})).boardResetAt); toast(t('Bestenliste zurückgesetzt.', 'Leaderboard reset.')); load(); } catch (err) { toast(err.message); }
});
$('#undo-board').addEventListener('click', async () => {
  try { boardState((await api('reset-board', { undo: true })).boardResetAt); toast(t('Alte Stimmen zählen wieder.', 'Old votes count again.')); load(); } catch (err) { toast(err.message); }
});
$('#refresh').addEventListener('click', () => { load(); loadUsers(); });

translateDom();
load();
loadUsers();

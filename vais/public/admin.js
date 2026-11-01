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
    [t('Gesperrt', 'Blocked'), c.blocked, t(`${num(c.verified)} bestätigt · ${num(c.blocked24 ?? 0)} Anfragen geblockt`, `${num(c.verified)} verified · ${num(c.blocked24 ?? 0)} requests blocked`)],
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
  const KIND = { error: t('Fehler', 'Error'), fallback: t('Ersatz', 'Fallback'), admin: 'Admin', blocked: t('Geblockt', 'Blocked'), alarm: t('Alarm', 'Alarm') };
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

let role = 'admin';
let annLoaded = false;
async function load() {
  $('#refresh').classList.add('spin');
  try {
    const d = await api('overview');
    $('#demo').hidden = !d.demo;
    role = d.role;
    document.querySelectorAll('[data-admin-only]').forEach((el) => { el.hidden = role !== 'admin'; });
    $('.adm-badge').textContent = role === 'admin' ? 'Admin' : 'Mod';
    if (role === 'admin' && !annLoaded) { annLoaded = true; loadAnnHistory(); }
    tiles(d.counts);
    perDay(d.perDay);
    models(d.models, d.modes);
    events(d.events, d.busy);
    boardState(d.boardResetAt);
    $('#safety-on').checked = d.safety !== false;
    $('#alarms-on').checked = d.alarms !== false;
  } catch (err) {
    toast(err.message);
  } finally {
    $('#refresh').classList.remove('spin');
  }
}

$('#alarms-on').addEventListener('change', async (e) => {
  try { await api('alarms', { on: e.target.checked }); toast(e.target.checked ? t('Warnungen sind an.', 'Alarms are on.') : t('Warnungen sind aus.', 'Alarms are off.')); } catch (err) { toast(err.message); e.target.checked = !e.target.checked; }
});
$('#alarm-test').addEventListener('click', async () => {
  try { await api('alarms/test', {}); toast(t('Gesendet – schau auf dein Handy.', 'Sent – check your phone.')); load(); } catch (err) { toast(err.message); }
});
$('#safety-on').addEventListener('change', async (e) => {
  try { await api('safety', { on: e.target.checked }); toast(e.target.checked ? t('Jugendschutz ist an.', 'Youth protection is on.') : t('Jugendschutz ist aus.', 'Youth protection is off.')); } catch (err) { toast(err.message); e.target.checked = !e.target.checked; }
});

// ── Nutzer ────────────────────────────────────────────────────────
let qTimer;
async function loadUsers() {
  try {
    const { users } = await api(`users?q=${encodeURIComponent($('#user-q').value.trim())}`);
    $('#users').innerHTML = users.length ? users.map((u) => {
      const limitText = u.limit === null ? t('unbegrenzt', 'unlimited') : `${num(u.used)} / ${num(u.limit)} ${t('Punkte', 'points')}${u.custom !== null && u.custom !== -1 ? ` (${t('eigenes Limit', 'custom')})` : ''}`;
      return `
      <li class="${u.blocked ? 'blocked' : ''}" data-user="${u.id}">
        <div class="adm-user-row">
          <span class="adm-user"><b>${esc(u.email)}</b>
            <small>${t('seit', 'since')} ${new Date(u.created).toLocaleDateString(LOCALE)} · ${num(u.chats)} Chats${u.lastActive ? ` · ${t('aktiv', 'active')} ${when(u.lastActive)}` : ''}${u.verified ? '' : ` · ${t('nicht bestätigt', 'not verified')}`}</small></span>
          ${u.mod ? '<span class="adm-pill mod">Mod</span>' : ''}
          ${u.admin ? '<span class="adm-pill">Admin</span>' : `${role === 'admin' ? `<button class="adm-btn small" data-role="${u.id}" data-to="${u.mod ? '' : 'mod'}" data-email="${esc(u.email)}">${u.mod ? t('Mod entziehen', 'Remove mod') : t('Zum Mod machen', 'Make mod')}</button>` : ''}${u.mod && role !== 'admin' ? '' : `<button class="adm-btn small${u.blocked ? '' : ' danger'}" data-block="${u.id}" data-to="${u.blocked ? '0' : '1'}" data-email="${esc(u.email)}">${u.blocked ? t('Entsperren', 'Unblock') : t('Sperren', 'Block')}</button>`}`}
        </div>
        <div class="adm-use">
          <span class="adm-bar${u.percent >= 100 ? ' full' : ''}"><i style="width:${u.limit === null ? 0 : u.percent}%"></i></span>
          <span class="adm-use-text">${u.limit === null ? '∞' : `${u.percent} %`} · ${esc(limitText)}</span>
          ${u.admin || role !== 'admin' ? '' : `<button class="adm-link" data-edit="${u.id}" data-custom="${u.custom ?? ''}">${t('Limit', 'Limit')}</button>`}
          ${u.used ? `<button class="adm-link" data-reset="${u.id}">${t('Auf 0 %', 'Reset')}</button>` : ''}
        </div>
      </li>`;
    }).join('') : `<li class="adm-empty">${t('Niemand gefunden.', 'Nobody found.')}</li>`;
  } catch (err) {
    toast(err.message);
  }
}
$('#user-q').addEventListener('input', () => { clearTimeout(qTimer); qTimer = setTimeout(loadUsers, 250); });
$('#users').addEventListener('click', async (e) => {
  const roleBtn = e.target.closest('[data-role]');
  if (roleBtn) {
    const make = roleBtn.dataset.to === 'mod';
    if (!confirm(make ? t(`${roleBtn.dataset.email} zum Moderator machen? Mods können Nutzer sperren, Webseiten entfernen und die Übersicht sehen – aber keine Schlüssel, Limits oder Einstellungen ändern.`, `Make ${roleBtn.dataset.email} a moderator? Mods can block users, remove websites and see the overview – but cannot change keys, limits or settings.`) : t(`${roleBtn.dataset.email} die Mod-Rolle entziehen?`, `Remove the mod role from ${roleBtn.dataset.email}?`))) return;
    try { await api('role', { userId: Number(roleBtn.dataset.role), role: make ? 'mod' : null }); toast(make ? t('Ist jetzt Mod ✓', 'Is now a mod ✓') : t('Mod-Rolle entzogen.', 'Mod role removed.')); loadUsers(); } catch (err) { toast(err.message); }
    return;
  }
  const edit = e.target.closest('[data-edit]');
  if (edit) return openLimitEditor(edit);
  const reset = e.target.closest('[data-reset]');
  if (reset) {
    try { await api('reset-usage', { userId: Number(reset.dataset.reset) }); toast(t('Verbrauch auf 0 % gesetzt.', 'Usage reset to 0 %.')); loadUsers(); } catch (err) { toast(err.message); }
    return;
  }
  const save = e.target.closest('[data-save-limit]');
  if (save) {
    const box = save.closest('.adm-limit-edit');
    const mode = box.querySelector('input[name^="lm"]:checked')?.value;
    const limit = mode === 'default' ? null : mode === 'unlimited' ? -1 : box.querySelector('.adm-input').value;
    if (mode === 'custom' && limit === '') return toast(t('Bitte eine Zahl eingeben.', 'Please enter a number.'));
    try { await api('user-limit', { userId: Number(save.dataset.saveLimit), limit }); toast(t('Limit gespeichert.', 'Limit saved.')); loadUsers(); } catch (err) { toast(err.message); }
    return;
  }
  if (e.target.closest('[data-cancel-limit]')) return e.target.closest('.adm-limit-edit').remove();
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

function openLimitEditor(btn) {
  const li = btn.closest('li');
  li.querySelector('.adm-limit-edit')?.remove();
  const id = btn.dataset.edit;
  const custom = btn.dataset.custom === '' ? null : Number(btn.dataset.custom);
  const mode = custom === null ? 'default' : custom === -1 ? 'unlimited' : 'custom';
  const box = document.createElement('div');
  box.className = 'adm-limit-edit';
  box.innerHTML = `
    <label><input type="radio" name="lm${id}" value="default"${mode === 'default' ? ' checked' : ''}> ${t('Standard', 'Default')} (${num(limitsCache?.daily ?? 0)})</label>
    <label><input type="radio" name="lm${id}" value="custom"${mode === 'custom' ? ' checked' : ''}> ${t('Eigenes:', 'Custom:')}
      <input class="adm-input small" type="number" min="0" max="100000" inputmode="numeric" value="${mode === 'custom' ? custom : ''}" aria-label="${t('Punkte pro Tag', 'Points per day')}"></label>
    <label><input type="radio" name="lm${id}" value="unlimited"${mode === 'unlimited' ? ' checked' : ''}> ${t('Unbegrenzt', 'Unlimited')}</label>
    <div class="adm-row"><button class="adm-btn small primary" type="button" data-save-limit="${id}">${t('Speichern', 'Save')}</button><button class="adm-btn small" type="button" data-cancel-limit>${t('Abbrechen', 'Cancel')}</button></div>`;
  box.querySelector('.adm-input').addEventListener('focus', () => { box.querySelector('input[value="custom"]').checked = true; });
  li.append(box);
}

// ── Tageslimit & Kosten ──────────────────────────────────────────
const LIMIT_LABELS = {
  daily: [t('Punkte pro Tag', 'Points per day'), t('für jeden Nutzer', 'for every user')],
  costText: [t('Normale Antwort', 'Normal answer'), t('Text/Code, pro Modell', 'text/code, per model')],
  costWeb: [t('Websuche', 'Web search'), t('pro Antwort', 'per answer')],
  costImage: [t('Bild', 'Image'), t('pro Bild', 'per image')],
  costAgent: [t('Agent X', 'Agent X'), t('pro Auftrag', 'per task')],
  costPremium: [t('Premium-Modell', 'Premium model'), t('kostet echtes Guthaben', 'costs real credit')],
  paidDaily: [t('Premium pro Tag', 'Premium per day'), t('Antworten, zusätzlich', 'answers, extra cap')],
  burst: [t('Schutz vor Spam', 'Spam protection'), t('Antworten in 5 Minuten', 'answers in 5 minutes')],
};
let limitsCache = null;
function limitExample() {
  const f = Object.fromEntries([...document.querySelectorAll('#limit-fields input')].map((i) => [i.name, Number(i.value) || 0]));
  const per = (c) => (c ? Math.floor(f.daily / c) : '∞');
  $('#limit-example').textContent = t(
    `Damit schafft jeder pro Tag z. B. ${per(f.costText)} normale Antworten, ${per(f.costText * 2)} Battles, ${per(f.costAgent)} Agent-X-Aufträge oder ${per(f.costImage)} Bilder.`,
    `That's e.g. ${per(f.costText)} normal answers, ${per(f.costText * 2)} battles, ${per(f.costAgent)} Agent X tasks or ${per(f.costImage)} images per day.`,
  );
}
async function loadLimits() {
  try {
    const { limits, fields } = await api('limits');
    limitsCache = limits;
    $('#limit-fields').innerHTML = Object.keys(fields).map((k) => `
      <label class="adm-field"><span><b>${esc(LIMIT_LABELS[k]?.[0] ?? k)}</b><small>${esc(LIMIT_LABELS[k]?.[1] ?? '')}</small></span>
        <input class="adm-input small" type="number" name="${k}" min="${fields[k].min}" max="${fields[k].max}" inputmode="numeric" value="${limits[k]}"></label>`).join('');
    limitExample();
  } catch (err) { toast(err.message); }
}
$('#limit-fields').addEventListener('input', limitExample);
$('#limits-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const limits = Object.fromEntries([...document.querySelectorAll('#limit-fields input')].map((i) => [i.name, Number(i.value)]));
  try { limitsCache = (await api('limits', { limits })).limits; toast(t('Gespeichert.', 'Saved.')); loadUsers(); } catch (err) { toast(err.message); }
});

// ── API-Schlüssel ────────────────────────────────────────────────
function renderKeys(providers) {
  const STATE = { ok: t('frei', 'free'), partly: t('teilweise voll', 'partly full'), full: t('voll', 'full') };
  $('#keys').innerHTML = providers.map((p) => `
    <div class="adm-keys">
      <p class="adm-keys-head"><b>${esc(p.label)}</b><small>${p.keys.length ? `${p.keys.length} ${p.keys.length === 1 ? t('Schlüssel', 'key') : t('Schlüssel', 'keys')}` : t('kein Schlüssel', 'no key')}</small></p>
      ${p.keys.length ? `<ul>${p.keys.map((k, i) => `
        <li><span class="adm-key-role">${i === 0 ? t('Haupt', 'Main') : `${t('Notfall', 'Backup')} ${i}`}</span><code>${esc(k.id)}</code>
          <span class="adm-key-state ${k.state}">${STATE[k.state]}${k.until ? ` ${t('bis', 'until')} ${when(k.until)}` : ''}</span>
          <small>${k.source === 'render' ? 'Render' : 'Admin'}</small>
          ${k.source === 'admin' ? `<button class="adm-link danger" data-rm-key="${esc(k.id)}" data-provider="${p.provider}">${t('Entfernen', 'Remove')}</button>` : ''}
        </li>`).join('')}</ul>` : ''}
    </div>`).join('');
  const sel = $('#key-provider');
  if (!sel.options.length) sel.innerHTML = providers.map((p) => `<option value="${p.provider}"${p.provider === 'groq' ? ' selected' : ''}>${esc(p.label)}</option>`).join('');
}
async function loadKeys() {
  try { renderKeys((await api('keys')).providers); } catch (err) { toast(err.message); }
}
$('#key-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const key = $('#key-value').value.trim();
  if (!key) return toast(t('Bitte einen Schlüssel einfügen.', 'Please paste a key.'));
  const btn = e.currentTarget.querySelector('button');
  btn.disabled = true;
  btn.textContent = t('Teste …', 'Testing …');
  try {
    const data = await api('keys', { provider: $('#key-provider').value, key });
    $('#key-value').value = '';
    renderKeys(data.providers);
    toast(t('Schlüssel funktioniert und ist gespeichert ✓', 'Key works and is saved ✓'));
  } catch (err) {
    toast(err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = t('Hinzufügen', 'Add');
  }
});
$('#keys').addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-rm-key]');
  if (!btn || !confirm(t(`Schlüssel ${btn.dataset.rmKey} entfernen?`, `Remove key ${btn.dataset.rmKey}?`))) return;
  try { renderKeys((await api('keys/remove', { provider: btn.dataset.provider, id: btn.dataset.rmKey })).providers); toast(t('Entfernt.', 'Removed.')); } catch (err) { toast(err.message); }
});

// ── Mitteilungen ─────────────────────────────────────────────────
const chosen = new Map(); // id → E-Mail
function paintChosen() {
  $('#ann-chosen').textContent = chosen.size ? `${t('Ausgewählt', 'Selected')}: ${[...chosen.values()].join(', ')}` : t('Noch niemand ausgewählt.', 'Nobody selected yet.');
}
async function loadPick() {
  try {
    const { users } = await api(`users?q=${encodeURIComponent($('#ann-q').value.trim())}`);
    $('#ann-list').innerHTML = users.map((u) => `<li><label><input type="checkbox" data-pick="${u.id}" data-email="${esc(u.email)}"${chosen.has(u.id) ? ' checked' : ''}> <span>${esc(u.email)}</span></label></li>`).join('') || `<li class="adm-empty">${t('Niemand gefunden.', 'Nobody found.')}</li>`;
  } catch (err) { toast(err.message); }
}
document.querySelectorAll('input[name="ann-target"]').forEach((r) => r.addEventListener('change', () => {
  const some = document.querySelector('input[name="ann-target"]:checked').value === 'users';
  $('#ann-pick').hidden = !some;
  if (some) { loadPick(); paintChosen(); }
}));
let pickTimer;
$('#ann-q').addEventListener('input', () => { clearTimeout(pickTimer); pickTimer = setTimeout(loadPick, 250); });
$('#ann-list').addEventListener('change', (e) => {
  const box = e.target.closest('[data-pick]');
  if (!box) return;
  if (box.checked) chosen.set(Number(box.dataset.pick), box.dataset.email); else chosen.delete(Number(box.dataset.pick));
  paintChosen();
});
$('#ann-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const target = document.querySelector('input[name="ann-target"]:checked').value;
  const title = $('#ann-title').value.trim();
  const body = $('#ann-body').value.trim();
  if (!title || !body) return toast(t('Bitte Titel und Text ausfüllen.', 'Please fill in title and text.'));
  const who = target === 'all' ? t('alle Nutzer', 'all users') : t(`${chosen.size} Personen`, `${chosen.size} people`);
  if (!confirm(t(`Mitteilung an ${who} senden?`, `Send message to ${who}?`))) return;
  const btn = e.currentTarget.querySelector('button[type=submit]');
  btn.disabled = true;
  try {
    const d = await api('announce', { title, body, target, userIds: [...chosen.keys()] });
    toast(t(`Gesendet ✓ – erreicht ${d.reach} Personen, ${d.pushed} Benachrichtigungen`, `Sent ✓ – reaches ${d.reach} people, ${d.pushed} notifications`));
    $('#ann-title').value = ''; $('#ann-body').value = ''; chosen.clear(); paintChosen();
    loadAnnHistory(); load();
  } catch (err) { toast(err.message); } finally { btn.disabled = false; }
});
async function loadAnnHistory() {
  try {
    const { announcements } = await api('announcements');
    $('#ann-history').innerHTML = announcements.map((a) => `<li class="admin"><span class="adm-ev-kind">📢</span><span class="adm-ev-text"><b>${esc(a.title)}</b> – ${esc(a.body.slice(0, 80))}${a.body.length > 80 ? '…' : ''}<br><small>${a.all ? t('an alle', 'to everyone') : t(`an ${a.count}`, `to ${a.count}`)} · ${t(`${a.reads} gelesen`, `${a.reads} read`)}</small></span><time>${when(a.created)}</time></li>`).join('');
  } catch { /* egal */ }
}

// ── Bewertungen ──────────────────────────────────────────────────
const REASON_LABEL = {
  wrong: t('falsch', 'wrong'), misunderstood: t('nicht verstanden', 'misunderstood'), long: t('zu lang', 'too long'), short: t('zu kurz', 'too short'),
  code: t('Code geht nicht', 'code broken'), outdated: t('veraltet', 'outdated'), language: t('falsche Sprache', 'wrong language'), rude: t('unpassend', 'inappropriate'),
};
async function loadFeedback() {
  try {
    const { models } = await api('feedback');
    $('#feedback').innerHTML = models.length ? models.map((m) => {
      const total = m.up + m.down;
      const pct = total ? Math.round((m.up / total) * 100) : 0;
      const reasons = Object.entries(m.reasons).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, n]) => `${esc(REASON_LABEL[k] ?? k)} ${n}×`).join(' · ');
      return `<li><div class="adm-fb-top"><b>${esc(m.name || m.model)}</b><span>👍 ${num(m.up)} · 👎 ${num(m.down)}</span></div>
        <span class="adm-bar adm-fb-bar" title="${pct} % ${t('positiv', 'positive')}"><i style="width:${pct}%"></i></span>
        ${reasons ? `<small>${t('Kritik', 'Criticism')}: ${reasons}</small>` : ''}</li>`;
    }).join('') : `<li class="adm-empty">${t('Noch keine Bewertungen.', 'No ratings yet.')}</li>`;
  } catch (err) { toast(err.message); }
}

// ── Veröffentlichte Webseiten ────────────────────────────────────
async function loadSitesAdmin() {
  try {
    const { sites } = await api('sites');
    $('#sites').innerHTML = sites.length ? sites.map((x) => `
      <li><div class="adm-user-row"><span class="adm-user"><b><a href="/w/${esc(x.id)}" target="_blank" rel="noopener">${esc(x.title || x.id)}</a></b>
        <small>${esc(x.email ?? '–')} · ${when(x.created)} · ${num(x.views)} ${t('Aufrufe', 'views')}</small></span>
        <button class="adm-btn small danger" data-rm-site="${esc(x.id)}">${t('Entfernen', 'Remove')}</button></div></li>`).join('')
      : `<li class="adm-empty">${t('Noch keine.', 'None yet.')}</li>`;
  } catch (err) { toast(err.message); }
}
$('#sites').addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-rm-site]');
  if (!btn || !confirm(t('Diese Webseite entfernen?', 'Remove this website?'))) return;
  try { await api('sites/remove', { id: btn.dataset.rmSite }); toast(t('Entfernt.', 'Removed.')); loadSitesAdmin(); } catch (err) { toast(err.message); }
});

// ── Bestenliste ──────────────────────────────────────────────────
$('#reset-board').addEventListener('click', async () => {
  if (!confirm(t('Bestenliste wirklich zurücksetzen? Danach zählen nur neue Stimmen.', 'Really reset the leaderboard? Only new votes will count.'))) return;
  try { boardState((await api('reset-board', {})).boardResetAt); toast(t('Bestenliste zurückgesetzt.', 'Leaderboard reset.')); load(); } catch (err) { toast(err.message); }
});
$('#undo-board').addEventListener('click', async () => {
  try { boardState((await api('reset-board', { undo: true })).boardResetAt); toast(t('Alte Stimmen zählen wieder.', 'Old votes count again.')); load(); } catch (err) { toast(err.message); }
});
$('#refresh').addEventListener('click', () => { load(); loadUsers(); if (role === 'admin') loadKeys(); });

translateDom();
// Erst die Rolle kennen (Admin oder Mod), dann den Rest laden
load().then(() => {
  loadUsers();
  loadSitesAdmin();
  loadFeedback();
  if (role === 'admin') { loadLimits(); loadKeys(); }
});

import { t, LANG, LOCALE, LANGUAGES, EXTRA_LANGS, translateDom, setLang, getTheme, setTheme } from './i18n.js';
import { markdown, enhance } from './render.js';
import { startTour, tourDone } from './tour.js';
import { CHANGES, LATEST } from './changelog.js';
import { openTeam, refreshTeamBadge } from './team.js';
import { Listener, canRecord, toText } from './listen.js';

const $ = (sel, root = document) => root.querySelector(sel);
translateDom();

// ── Icons ─────────────────────────────────────────────────────────
const svg = (paths) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
const ICON = {
  battle: svg('<path d="M14.5 17.5 3 6V3h3l11.5 11.5M13 19l6-6M16 16l4 4M19 21l2-2M14.5 6.5 18 3h3v3l-3.5 3.5M5 14l4 4M7 17l-3 3M3 19l2 2"/>'),
  sxs: svg('<path d="M14 9a2 2 0 0 1-2 2H6l-4 4V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2z"/><path d="M18 9h2a2 2 0 0 1 2 2v11l-4-4h-6a2 2 0 0 1-2-2v-1"/>'),
  direct: svg('<path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/>'),
  chev: svg('<path d="m6 9 6 6 6-6"/>').replace('<svg ', '<svg class="chev" '),
  check: svg('<path d="M20 6 9 17l-5-5"/>'),
  regen: svg('<path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/>'),
  copy: svg('<rect width="13" height="13" x="9" y="9" rx="2"/><path d="M5 15a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2"/>'),
  expand: svg('<path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/>'),
  next: svg('<path d="M5 12h14M13 6l6 6-6 6"/>'),
  prev: svg('<path d="M19 12H5M11 6l-6 6 6 6"/>'),
  send: svg('<path d="M5 12h14M13 6l6 6-6 6"/>'),
  stop: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="7" y="7" width="10" height="10" rx="2" fill="currentColor"/></svg>',
};

// Zweites Menü: Art der Anfrage (wie „Modality“ bei Arena), von oben nach unten
const MODALITIES = {
  video: { label: t('Video', 'Video'), desc: t('Videos erstellen', 'Create videos'), soon: true },
  image: { label: t('Bild', 'Image'), desc: t('Bilder aus Text erstellen', 'Create images from text'), cap: 'image' },
  web: { label: t('Websuche', 'Web search'), desc: t('Mit aktuellen Infos aus dem Internet', 'With current info from the internet'), cap: 'web' },
  code: { label: 'Code', desc: t('Webseiten und Apps programmieren', 'Build websites and apps'), cap: 'code' },
  text: { label: 'Text', desc: t('Chatten mit Text-Modellen', 'Chat with text models'), cap: 'text' },
  auto: { label: 'Auto', desc: t('Wählt automatisch passende Modelle', 'Picks suitable models automatically'), cap: 'text' },
};
Object.assign(ICON, {
  download: svg('<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>'),
  speak: svg('<path d="M11 5 6 9H3v6h3l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13"/>'),
  speakStop: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="7" y="7" width="10" height="10" rx="2" fill="currentColor"/></svg>',
  edit: svg('<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m13.5 6.5 4 4"/>'),
  rename: svg('<path d="M4 20h4L19 9l-4-4L4 16z"/>'),
  up: svg('<path d="M7 10v11M15 5.9 14 10h5.8a2 2 0 0 1 1.9 2.6l-2.3 7A2 2 0 0 1 17.5 21H7V10l4.4-7.2A1.9 1.9 0 0 1 15 4.3z"/><path d="M3 10h4v11H3z"/>'),
  down: svg('<path d="M17 14V3M9 18.1 10 14H4.2a2 2 0 0 1-1.9-2.6l2.3-7A2 2 0 0 1 6.5 3H17v11l-4.4 7.2A1.9 1.9 0 0 1 9 19.7z"/><path d="M21 14h-4V3h4z"/>'),
  brain: svg('<path d="M9.5 4A2.5 2.5 0 0 0 7 6.5v.1A3 3 0 0 0 4.5 9.5c0 .8.3 1.5.8 2a3 3 0 0 0 .7 4.8V17a3 3 0 0 0 3 3 2.5 2.5 0 0 0 3-1.7V5.6A2.5 2.5 0 0 0 9.5 4z"/><path d="M14.5 4A2.5 2.5 0 0 1 17 6.5v.1a3 3 0 0 1 2.5 2.9c0 .8-.3 1.5-.8 2a3 3 0 0 1-.7 4.8V17a3 3 0 0 1-3 3 2.5 2.5 0 0 1-3-1.7"/>'),
  agent: svg('<path d="M12 2.5 14 8l5.5 2-5.5 2-2 5.5-2-5.5L4.5 10 10 8z"/><path d="M19 15.5l.9 2.1 2.1.9-2.1.9-.9 2.1-.9-2.1-2.1-.9 2.1-.9z"/>'),
  's-search': svg('<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>'),
  's-read': svg('<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6M8 13h8M8 17h5"/>'),
  's-calc': svg('<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M8 7h8M8 12h.01M12 12h.01M16 12h.01M8 16h.01M12 16h.01M16 16h.01"/>'),
  's-time': svg('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'),
  's-error': svg('<circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16h.01"/>'),
  's-other': svg('<circle cx="12" cy="12" r="3"/>'),
  pin: svg('<path d="M9 4h6l-1 6 3 3H7l3-3zM12 13v7"/>'),
  folder: svg('<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>'),
  more: svg('<circle cx="5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="19" cy="12" r="1.3"/>'),
  close: svg('<path d="M6 6l12 12M18 6 6 18"/>'),
  's-inbox': svg('<path d="M12 5v14M5 12h14"/>'),
  's-edit': svg('<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m13 7 4 4"/>'),
  's-reminder': svg('<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2M5 3 2 6M19 3l3 3"/>'),
  's-video': svg('<rect x="2.5" y="5" width="19" height="14" rx="4"/><path d="m10 9.5 5 2.5-5 2.5z"/>'),
  's-memory': svg('<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-4 10.5c.8.8 1 1.5 1 2.5h6c0-1 .2-1.7 1-2.5A6 6 0 0 0 12 3z"/>'),
  's-wiki': svg('<path d="M3 6.5 7.5 18 12 8l4.5 10L21 6.5"/>'),
  's-check': svg('<path d="m9 12 2 2 4-4"/><path d="M4 5h16v12H4zM9 21h6"/>'),
  's-look': svg('<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>'),
  'm-video': svg('<rect x="3.5" y="4.5" width="17" height="15" rx="2"/><path d="m10 9 5 3-5 3z"/>'),
  'm-image': svg('<rect x="3.5" y="3.5" width="17" height="17" rx="1.5"/><circle cx="15.5" cy="8.5" r="1.8"/><path d="m3.5 17 5-5 5 5 2-2 5 5"/>'),
  'm-web': svg('<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3Z"/>'),
  'm-code': svg('<path d="m8 7-5 5 5 5M16 7l5 5-5 5M14 4l-4 16"/>'),
  'm-text': svg('<path d="M5 5h14M12 5v15M9 20h6"/>'),
  'm-auto': svg('<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>'),
  preview: svg('<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>'),
});

const MODES = {
  agent: { label: 'Agent X', desc: t('Sucht, liest und rechnet selbstständig – der stärkste Modus', 'Searches, reads and calculates on its own – the strongest mode') },
  battle: { label: 'Battle', desc: t('2 anonyme Modelle im Vergleich', '2 anonymous models head to head') },
  sxs: { label: 'Side by Side', desc: t('2 Modelle deiner Wahl vergleichen', 'Compare 2 models of your choice') },
  direct: { label: t('Direkt', 'Direct'), desc: t('Mit 1 Modell chatten', 'Chat with 1 model') },
};

const canSpeak = 'speechSynthesis' in window;
const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;

// ── Kleine Helfer ─────────────────────────────────────────────────
const store = {
  get(key, fallback) { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } },
  set(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* egal */ } },
};
// ── Offline: letzte Chats auf dem Gerät, damit man sie ohne Internet lesen kann ──
const OFFLINE_KEY = 'vais_offline_v1';
const OFFLINE_CHATS = 25;
let offline = false;
const offlineData = () => store.get(OFFLINE_KEY, null);
function slimForOffline(data) {
  const big = (url) => typeof url === 'string' && url.startsWith('data:') && url.length > 80_000;
  return {
    ...data,
    savedAt: Date.now(),
    turns: (data.turns ?? []).map((tn) => ({
      ...tn,
      attachments: (tn.attachments ?? []).map((a) => (a.kind === 'image' && big(a.url) ? { kind: 'file', name: `🖼 ${a.name}`, text: '' } : a.kind === 'file' ? { kind: 'file', name: a.name, text: (a.text ?? '').slice(0, 4000) } : a)),
      answers: tn.answers.map((a) => {
        const images = (a.images ?? []).filter((img) => !big(img?.url ?? img));
        const lost = (a.images?.length ?? 0) - images.length;
        return { ...a, thinking: '', images, text: a.text || (lost ? t('_(Bild – offline nicht gespeichert)_', '_(Image – not saved offline)_') : '') };
      }),
    })),
  };
}
function saveOffline(patch) {
  const cur = offlineData() ?? { chats: {}, order: [] };
  const next = { ...cur, ...patch, savedAt: Date.now() };
  for (let keep = OFFLINE_CHATS; keep >= 0; keep -= 5) {
    next.order = (next.order ?? []).slice(0, keep);
    next.chats = Object.fromEntries(next.order.filter((id) => next.chats?.[id]).map((id) => [id, next.chats[id]]));
    try { localStorage.setItem(OFFLINE_KEY, JSON.stringify(next)); return; } catch { /* zu groß → weniger Chats */ }
  }
}
function rememberChat(data) {
  if (!data?.id || data.incognito) return;
  const cur = offlineData() ?? { chats: {}, order: [] };
  saveOffline({ chats: { ...cur.chats, [data.id]: slimForOffline(data) }, order: [data.id, ...(cur.order ?? []).filter((id) => id !== data.id)] });
}
async function refreshOfflineChat(id) {
  if (state.chat?.id === id && state.chat.incognito) return;
  try {
    const res = await fetch(`/api/chat/${encodeURIComponent(id)}`);
    if (res.ok) rememberChat(await res.json());
  } catch { /* egal */ }
}
async function forgetOffline() {
  try { localStorage.removeItem(OFFLINE_KEY); } catch { /* egal */ }
  try { for (const key of await caches.keys()) { const c = await caches.open(key); await c.delete('/'); } } catch { /* egal */ }
}
function setOffline(on) {
  offline = on;
  document.body.classList.toggle('is-offline', on);
  $('#offline-banner').hidden = !on;
  updateSend?.();
}

// Kurzes Vibrieren als Rückmeldung (nur Geräte, die das können; nie bei „weniger Bewegung“)
const quietMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)');
function haptic(kind = 'tap') {
  if (!navigator.vibrate || quietMotion?.matches) return;
  try { navigator.vibrate({ tap: 8, send: 12, success: [10, 40, 14], error: [30, 50, 30] }[kind] ?? 8); } catch { /* egal */ }
}

const escapeHtml = (s) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

let toastTimer;
function toast(text) {
  const el = $('#toast');
  el.textContent = text;
  el.classList.remove('action');
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
}

// Hinweis mit Knopf (z. B. „Rückgängig“)
function toastAction(text, label, fn) {
  const el = $('#toast');
  el.textContent = `${text} `;
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'toast-btn';
  b.textContent = label;
  b.addEventListener('click', () => { fn(); el.classList.remove('show', 'action'); }, { once: true });
  el.append(b);
  el.classList.add('show', 'action');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show', 'action'), 6000);
}

async function post(url, body) {
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (res.status === 401) location.replace('/login');
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || t('Etwas ist schiefgelaufen.', 'Something went wrong.'));
  return data;
}

// Hersteller-Logo eines Modells (farbig als Bild, einfarbige Logos per CSS-Maske in Textfarbe)
function modelLogo(m) {
  if (m?.icon) {
    const src = `/icons/${encodeURIComponent(m.icon)}.svg`;
    return /-color$/.test(m.icon)
      ? `<img class="logo" src="${src}" alt="">`
      : `<span class="logo mono" style="--icon:url('${src}')"></span>`;
  }
  const label = m?.maker || '?';
  let h = 0;
  for (const c of label) h = (h * 31 + c.charCodeAt(0)) % 360;
  return `<span class="logo pav" style="background:hsl(${h} 42% 42%)">${escapeHtml(label.trim()[0]?.toUpperCase() ?? '?')}</span>`;
}

// ── Zustand ───────────────────────────────────────────────────────
const state = {
  mode: store.get('vais.mode', 'battle'),
  modality: store.get('vais.modality', 'auto'),
  picks: store.get('vais.picks', [null, null]),
  models: [],
  queue: [], // vorgemerkte Nachrichten (während die KI antwortet)
  incognito: false, // nächster Chat wird nicht gespeichert
  pending: [], // Anhänge für die nächste Nachricht: { kind: 'image', name, url } | { kind: 'file', name, text }
  chat: null, // { id, mode, labels, names, winner, turns: [{ user, answers: [{ text, status, error }] }] }
  controllers: new Set(),
};
if (!MODES[state.mode]) state.mode = 'battle';
if (!MODALITIES[state.modality] || MODALITIES[state.modality].soon) state.modality = 'auto';

const el = {
  stage: $('#stage'),
  home: $('#home'),
  thread: $('#thread'),
  board: $('#board'),
  stats: $('#stats'),
  dock: $('.dock'),
  drawer: $('#drawer'),
  dList: $('#d-list'),
  dSearch: $('#d-search'),
  title: $('#chat-title'),
  newChat: $('#new-chat'),
  form: $('#composer'),
  prompt: $('#prompt'),
  send: $('#send'),
  modeBtn: $('#mode-btn'),
  modalityBtn: $('#modality-btn'),
  modalityMenu: $('#modality-menu'),
  modeMenu: $('#mode-menu'),
  chips: [...document.querySelectorAll('.model-chip')],
  vote: $('#vote'),
  voteResult: $('#vote-result'),
  sheet: $('#model-sheet'),
  search: $('#model-search'),
  list: $('#model-list'),
};

const busy = () => state.controllers.size > 0;
const modelById = (id) => state.models.find((m) => m.id === id);

// ── Steuerung unten (Modus + Modelle) ─────────────────────────────
function renderControls() {
  el.modeBtn.innerHTML = ICON[state.mode] + ICON.chev;
  el.modeBtn.setAttribute('aria-label', `${t('Modus', 'Mode')}: ${MODES[state.mode].label}`);
  el.modalityBtn.hidden = state.mode === 'agent';
  el.modalityBtn.innerHTML = ICON[`m-${state.modality}`] + ICON.chev;
  el.modalityBtn.setAttribute('aria-label', `${t('Art', 'Type')}: ${MODALITIES[state.modality].label}`);
  el.chips.forEach((chip, slot) => {
    const show = state.mode === 'sxs' || (state.mode === 'direct' && slot === 0);
    chip.hidden = !show;
    if (!show) return;
    const m = modelById(state.picks[slot]);
    chip.innerHTML = m
      ? `${modelLogo(m)}<span class="name">${escapeHtml(m.name)}</span>${ICON.chev}`
      : `<span class="name">${t('Modell wählen', 'Choose model')}</span>${ICON.chev}`;
    chip.setAttribute('aria-label', `${t('Modell', 'Model')} ${slot + 1}: ${m?.name ?? t('keins gewählt', 'none chosen')}`);
  });
  el.prompt.placeholder = state.chat ? t('Folgefrage stellen …', 'Ask a follow-up …') : t('Frag irgendwas …', 'Ask anything …');
}

function renderModeMenu() {
  el.modeMenu.innerHTML = Object.entries(MODES).map(([key, m]) => `
    <button type="button" class="mode-item" role="menuitemradio" aria-checked="${key === state.mode}" data-mode="${key}">
      ${ICON[key]}<span><b>${m.label}</b><small>${m.desc}</small></span>${key === state.mode ? ICON.check.replace('<svg ', '<svg class="check" ') : '<span></span>'}
    </button>`).join('');
}

function toggleModeMenu(open = el.modeMenu.hidden) {
  if (open) renderModeMenu();
  el.modeMenu.hidden = !open;
  el.modeBtn.setAttribute('aria-expanded', String(open));
  if (open) $('.mode-item[aria-checked="true"]', el.modeMenu)?.focus();
}

el.modeBtn.addEventListener('click', (e) => { e.stopPropagation(); el.modalityMenu.hidden = true; toggleModeMenu(); });
el.modeMenu.addEventListener('click', (e) => {
  const item = e.target.closest('[data-mode]');
  if (!item) return;
  toggleModeMenu(false);
  const mode = item.dataset.mode;
  if (mode === state.mode) return;
  state.mode = mode;
  store.set('vais.mode', mode);
  if (state.chat) { resetChat(); toast(`${t('Neuer Chat', 'New chat')}: ${MODES[mode].label}`); }
  renderControls();
  el.prompt.focus();
});

// ── Art der Anfrage (Auto, Text, Code, Websuche …) ─────────────────
const currentCap = () => MODALITIES[state.modality].cap;

function renderModalityMenu() {
  el.modalityMenu.innerHTML = Object.entries(MODALITIES).map(([key, m]) => `
    <button type="button" class="mode-item${m.soon ? ' soon' : ''}" role="menuitemradio" aria-checked="${key === state.modality}" aria-disabled="${!!m.soon}" data-modality="${key}">
      ${ICON[`m-${key}`]}<span><b>${m.label}${m.soon ? ` <em>${t('bald', 'soon')}</em>` : ''}</b><small>${m.desc}</small></span>${key === state.modality ? ICON.check.replace('<svg ', '<svg class="check" ') : '<span></span>'}
    </button>`).join('');
}

function toggleModalityMenu(open = el.modalityMenu.hidden) {
  if (open) { renderModalityMenu(); toggleModeMenu(false); }
  el.modalityMenu.hidden = !open;
  el.modalityBtn.setAttribute('aria-expanded', String(open));
  if (open) $('.mode-item[aria-checked="true"]', el.modalityMenu)?.focus();
}

// Gewählte Modelle passend zur Art machen (z. B. bei „Websuche“ nur Such-Modelle)
function fitPicks() {
  const cap = currentCap();
  const fitting = state.models.filter((m) => m.caps.includes(cap) && !m.agent); // Agent X nur, wenn man ihn selbst wählt
  [0, 1].forEach((slot) => {
    if (modelById(state.picks[slot])?.caps.includes(cap)) return;
    state.picks[slot] = fitting.find((m) => m.id !== state.picks[1 - slot])?.id ?? state.picks[slot];
  });
}

el.modalityBtn.addEventListener('click', (e) => { e.stopPropagation(); toggleModalityMenu(); });
el.modalityMenu.addEventListener('click', (e) => {
  const item = e.target.closest('[data-modality]');
  if (!item) return;
  const key = item.dataset.modality;
  if (MODALITIES[key].soon) return toast(`${MODALITIES[key].label} ${t('kommt bald', 'is coming soon')}`);
  toggleModalityMenu(false);
  if (key === state.modality) return;
  state.modality = key;
  store.set('vais.modality', key);
  fitPicks();
  if (state.chat) { resetChat(); toast(`${t('Neuer Chat', 'New chat')}: ${MODALITIES[key].label}`); }
  renderControls();
  el.prompt.focus();
});

// ── Modellauswahl ─────────────────────────────────────────────────
let sheetSlot = 0;
let sheetCap = 'text';
const CAP_EMPTY = {
  image: t('Gerade ist kein Bild-Modell verfügbar.', 'No image model is available right now.'),
  web: t('Für Websuche bitte einen Groq-Schlüssel eintragen (GROQ_API_KEY).', 'For web search, please add a Groq key (GROQ_API_KEY).'),
};
function renderModelList() {
  document.querySelectorAll('.cap-tab').forEach((t) => t.setAttribute('aria-selected', String(t.dataset.cap === sheetCap)));
  const q = el.search.value.trim().toLowerCase();
  const other = state.mode === 'sxs' ? state.picks[1 - sheetSlot] : null;
  const items = state.models
    .filter((m) => m.caps.includes(sheetCap))
    .filter((m) => !q || m.name.toLowerCase().includes(q) || m.maker.toLowerCase().includes(q));
  el.list.innerHTML = items.length
    ? items.map((m) => {
        const selected = m.id === state.picks[sheetSlot];
        return `<li><button type="button" class="model-opt${selected ? ' selected' : ''}${m.id === other ? ' taken' : ''}${m.busy ? ' busy' : ''}${m.agent ? ' is-agent' : ''}" data-id="${escapeHtml(m.id)}">
          ${modelLogo(m)}<span class="name">${escapeHtml(m.name)}</span>${m.agent ? `<span class="agent-tag">${t('Agent', 'Agent')}</span>` : ''}${m.caps.includes('vision') ? `<span class="vis" title="${t('Kann Bilder ansehen', 'Can see images')}">${ICON.preview}</span>` : ''}
          ${selected ? ICON.check.replace('<svg ', '<svg width="18" height="18" ') : ''}
          <span class="prov">${m.agent ? t('VAIs · der Stärkste', 'VAIs · the strongest') : m.busy ? t('ausgelastet', 'busy') : `${m.paid ? '<span class="premium">Premium</span> ' : ''}${escapeHtml(m.maker)}`}</span></button></li>`;
      }).join('')
    : `<li class="model-empty">${q ? t('Kein Modell gefunden.', 'No model found.') : CAP_EMPTY[sheetCap] ?? t('Keine Modelle in dieser Kategorie.', 'No models in this category.')}</li>`;
}

document.querySelectorAll('.cap-tab').forEach((tab) => tab.addEventListener('click', () => {
  sheetCap = tab.dataset.cap;
  renderModelList();
}));

function openSheet(slot) {
  sheetSlot = slot;
  el.search.value = '';
  sheetCap = currentCap();
  renderModelList();
  el.sheet.hidden = false;
  requestAnimationFrame(() => (matchMedia('(pointer: fine)').matches ? el.search : $('.model-opt.selected', el.list) ?? el.search)?.focus());
}
const closeSheet = () => { el.sheet.hidden = true; el.chips[sheetSlot].focus(); };

el.chips.forEach((chip, slot) => chip.addEventListener('click', () => openSheet(slot)));
el.search.addEventListener('input', renderModelList);
el.sheet.addEventListener('click', (e) => {
  if (e.target.closest('[data-close]')) return closeSheet();
  const opt = e.target.closest('.model-opt');
  if (!opt) return;
  const id = opt.dataset.id;
  const other = 1 - sheetSlot;
  if (state.mode === 'sxs' && state.picks[other] === id) state.picks[other] = state.picks[sheetSlot]; // tauschen
  const changed = state.picks[sheetSlot] !== id;
  state.picks[sheetSlot] = id;
  store.set('vais.picks', state.picks);
  closeSheet();
  if (changed && state.chat) { resetChat(); toast(t('Neuer Chat mit anderem Modell', 'New chat with another model')); }
  renderControls();
});

// ── Chat ──────────────────────────────────────────────────────────
function labelFor(chat, side) {
  if (chat.mode === 'agent') return 'Agent X';
  if (chat.mode === 'battle') return chat.names ? chat.names[side] : `${t('Assistent', 'Assistant')} ${'AB'[side]}`;
  return chat.labels[side];
}

// Ansicht: 'home' (Start), 'thread' (Chat) oder 'board' (Bestenliste)
function showView(view) {
  el.home.hidden = view !== 'home';
  el.thread.hidden = view !== 'thread';
  const q = $('#queue');
  if (q) q.hidden = view !== 'thread';
  el.board.hidden = view !== 'board';
  el.stats.hidden = view !== 'stats';
  el.dock.hidden = view === 'board' || view === 'stats';
  el.newChat.hidden = view === 'home';
  $('#share-chat').hidden = view !== 'thread';
  $('#suggest').hidden = view !== 'home';
  if (view === 'home' || view === 'thread') paintIncognito();
  else { $('#incognito-btn').hidden = true; $('#incognito-banner').hidden = true; }
  if (view === 'board' || view === 'stats') el.title.textContent = '';
}

// ── Vorschläge auf der Startseite ─────────────────────────────────
const SUGGESTIONS = [
  {
    title: t('Landingpage erstellen', 'Create a landing page'), desc: t('Eine schlichte, moderne Webseite', 'A clean, modern website'),
    icon: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 8h18M6 6h.01M8.5 6h.01M14 13l2 5 1-2 2-1z"/>',
    prompt: t('Erstelle eine schlichte, moderne Landingpage als einzelne HTML-Datei (mit CSS) für ein kleines Café namens „Bohne“. Mit Startbereich, Speisekarte und Kontakt.', 'Create a clean, modern landing page as a single HTML file (with CSS) for a small café called “Bean”. With a hero section, menu and contact.'),
  },
  {
    title: t('Einfach erklären', 'Explain simply'), desc: t('Ein Thema verständlich erklärt', 'A topic made easy'),
    icon: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6V14M12 17h.01"/>',
    prompt: t('Erkläre mir so einfach wie möglich, wie künstliche Intelligenz funktioniert. Mit einem Beispiel aus dem Alltag.', 'Explain as simply as possible how artificial intelligence works. With an everyday example.'),
  },
  {
    title: t('Text verbessern', 'Improve text'), desc: t('Rechtschreibung und Stil prüfen', 'Check spelling and style'),
    icon: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m13.5 6.5 4 4"/>',
    prompt: t('Verbessere Rechtschreibung, Grammatik und Stil in diesem Text und erkläre kurz die wichtigsten Änderungen:\n\n', 'Improve spelling, grammar and style in this text and briefly explain the main changes:\n\n'),
  },
  {
    title: t('Code reparieren', 'Fix code'), desc: t('Fehler finden und erklären', 'Find and explain bugs'),
    icon: '<path d="m8 7-5 5 5 5M16 7l5 5-5 5"/>',
    prompt: t('Finde den Fehler in diesem Code, erkläre ihn und zeig mir die korrigierte Version:\n\n', 'Find the bug in this code, explain it and show me the fixed version:\n\n'),
  },
  {
    title: t('Reise planen', 'Plan a trip'), desc: t('Ein Wochenende voller Ideen', 'A weekend full of ideas'),
    icon: '<path d="M12 21s-7-6.1-7-11a7 7 0 1 1 14 0c0 4.9-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/>',
    prompt: t('Plane mir ein entspanntes Wochenende in Hamburg: Sehenswürdigkeiten, gutes Essen und ein Tipp für schlechtes Wetter.', 'Plan a relaxed weekend in London for me: sights, good food and a tip for bad weather.'),
  },
  {
    title: t('Ideen sammeln', 'Brainstorm ideas'), desc: t('Brainstorming für dein Projekt', 'Brainstorming for your project'),
    icon: '<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.4 1 1.1 1 1.8V16h5v-.3c0-.7.4-1.4 1-1.8A6 6 0 0 0 12 3z"/>',
    prompt: t('Gib mir 10 kreative Ideen für ein eigenes Roblox-Spiel, jeweils mit einem Satz zur Spielidee.', 'Give me 10 creative ideas for my own Roblox game, each with one sentence about the idea.'),
  },
];

$('#suggest-track').innerHTML = SUGGESTIONS.map((s, i) => `
  <button type="button" class="suggest-card" data-suggest="${i}">
    <span class="suggest-icon">${svg(s.icon)}</span>
    <span class="suggest-text"><b>${escapeHtml(s.title)}</b><small>${escapeHtml(s.desc)}</small></span>
  </button>`).join('');

$('#suggest-track').addEventListener('click', (e) => {
  const card = e.target.closest('[data-suggest]');
  if (!card) return;
  el.prompt.value = SUGGESTIONS[card.dataset.suggest].prompt;
  autosize();
  el.prompt.focus();
  el.prompt.setSelectionRange(el.prompt.value.length, el.prompt.value.length);
});

// Inkognito-Chat verlassen → sofort löschen
function forgetIncognito(chat) {
  if (!chat?.incognito || !chat.id) return;
  post('/api/chat/forget', { chatId: chat.id }).catch(() => {});
}
window.addEventListener('pagehide', () => {
  if (state.chat?.incognito) navigator.sendBeacon?.('/api/chat/forget', new Blob([JSON.stringify({ chatId: state.chat.id })], { type: 'application/json' }));
});
function paintIncognito() {
  const on = state.chat ? !!state.chat.incognito : state.incognito;
  $('#incognito-btn').setAttribute('aria-pressed', String(on));
  $('#incognito-btn').hidden = !!state.chat && !state.chat.incognito; // in normalen Chats nicht umschaltbar
  $('#incognito-banner').hidden = !on;
  document.body.classList.toggle('incognito', on);
}
$('#incognito-btn').addEventListener('click', () => {
  if (state.chat) return toast(t('Inkognito gilt für diesen ganzen Chat. Starte einen neuen Chat, um es zu ändern.', 'Incognito applies to this whole chat. Start a new chat to change it.'));
  state.incognito = !state.incognito;
  haptic('tap');
  paintIncognito();
  toast(state.incognito ? t('Inkognito an – der nächste Chat wird nicht gespeichert 🕶️', 'Incognito on – the next chat will not be saved 🕶️') : t('Inkognito aus', 'Incognito off'));
});

function resetChat() {
  forgetIncognito(state.chat);
  if (!$('#preview').hidden) closePreview();
  stopSpeaking();
  for (const c of state.controllers) c.abort();
  state.controllers.clear();
  state.chat = null;
  el.thread.innerHTML = '';
  $('#queue')?.remove();
  el.title.textContent = '';
  el.vote.hidden = true;
  el.voteResult.hidden = true;
  showView('home');
  renderControls();
  updateSend();
}

el.newChat.addEventListener('click', () => { go(''); el.prompt.focus(); });

// Deine Nachricht fürs Modell: Text + Dateiinhalte, Bilder als eigene Teile
function userContent(turn) {
  const att = turn.attachments ?? [];
  const files = att.filter((a) => a.kind === 'file')
    .map((a) => `\n\n--- ${t('Datei', 'File')}: ${a.name} ---\n\`\`\`\n${a.text}\n\`\`\``).join('');
  const text = `${turn.user || (att.length ? t('Siehe Anhang.', 'See attachment.') : '')}${files}`;
  const images = att.filter((a) => a.kind === 'image');
  if (!images.length) return text;
  return [{ type: 'text', text }, ...images.map((a) => ({ type: 'image_url', image_url: { url: a.url } }))];
}

function buildMessages(turnIndex, side) {
  const msgs = [];
  state.chat.turns.slice(0, turnIndex + 1).forEach((t, i) => {
    msgs.push({ role: 'user', content: userContent(t) });
    const a = t.answers[side];
    if (i < turnIndex && a.text && a.status === 'done') msgs.push({ role: 'assistant', content: a.text });
    else if (i < turnIndex) msgs.pop(); // Frage ohne Antwort weglassen
  });
  return msgs;
}

function renderTurn(turnIndex) {
  const turn = state.chat.turns[turnIndex];
  const n = turn.answers.length;
  const node = document.createElement('div');
  node.className = 'turn';
  node.dataset.index = turnIndex;
  node.innerHTML = `
    <div class="turn-user"><div class="bubble"></div></div>
    <div class="answers${n === 1 ? ' single' : ''}">
      <div class="track">
        ${turn.answers.map((_, side) => {
          const actions = `
                <button class="card-btn" data-act="regen" aria-label="${t('Neu generieren', 'Regenerate')}" title="${t('Neu generieren', 'Regenerate')}">${ICON.regen}</button>
                <button class="card-btn" data-act="copy" aria-label="${t('Kopieren', 'Copy')}" title="${t('Kopieren', 'Copy')}">${ICON.copy}</button>
                <button class="card-btn" data-act="speak" aria-label="${t('Vorlesen', 'Read aloud')}" title="${t('Vorlesen', 'Read aloud')}" aria-pressed="false"${canSpeak ? '' : ' hidden'}>${ICON.speak}</button>
                <button class="card-btn" data-act="preview" aria-label="${t('Vorschau', 'Preview')}" title="${t('Vorschau', 'Preview')}" hidden>${ICON.preview}</button>
                <button class="card-btn" data-act="expand" aria-label="${t('Vollbild', 'Full screen')}" title="${t('Vollbild', 'Full screen')}">${ICON.expand}</button>`;
          // Einzel-Antwort (Direkt, Agent X): Knöpfe unter der Nachricht wie bei Arena, mit 👍/👎
          return n === 1 ? `
          <article class="card" data-side="${side}">
            <header class="card-head"><span class="card-label"></span></header>
            <div class="card-body md"></div>
            <div class="card-foot">
                <button class="card-btn" data-act="like" aria-label="${t('Gute Antwort', 'Good answer')}" title="${t('Gute Antwort', 'Good answer')}" aria-pressed="false">${ICON.up}</button>
                <button class="card-btn" data-act="dislike" aria-label="${t('Schlechte Antwort', 'Bad answer')}" title="${t('Schlechte Antwort', 'Bad answer')}" aria-pressed="false">${ICON.down}</button>${actions}
            </div>` : `
          <article class="card" data-side="${side}">
            <header class="card-head">
              <span class="card-label"></span>
              <div class="card-actions">${actions}
              </div>
            </header>
            <div class="card-body md"></div>`;
        }).map((html) => `${html}
          </article>`).join('')}
      </div>
      ${n > 1 ? `
        <button class="nav-btn next" data-go="1" aria-label="${t('Antwort B zeigen', 'Show answer B')}">${ICON.next}</button>
        <button class="nav-btn prev" data-go="0" aria-label="${t('Antwort A zeigen', 'Show answer A')}" hidden>${ICON.prev}</button>
        <div class="dots">${turn.answers.map((_, i) => `<button class="dot${i ? '' : ' active'}" data-go="${i}" aria-label="${t('Antwort', 'Answer')} ${'AB'[i]}"></button>`).join('')}</div>` : ''}
    </div>`;
  const bubble = $('.bubble', node);
  bubble.textContent = turn.user;
  if (!turn.user) bubble.remove();
  $('.turn-user', node).insertAdjacentHTML('beforeend', `
    <div class="user-actions">
      <button type="button" class="mini-btn" data-uact="copy" aria-label="${t('Nachricht kopieren', 'Copy message')}" title="${t('Kopieren', 'Copy')}">${ICON.copy}</button>
      <button type="button" class="mini-btn" data-uact="edit" aria-label="${t('Nachricht bearbeiten', 'Edit message')}" title="${t('Bearbeiten', 'Edit')}">${ICON.edit}</button>
    </div>`);
  if (turn.attachments?.length) {
    const box = document.createElement('div');
    box.className = 'att-list';
    for (const a of turn.attachments) {
      if (a.kind === 'image') {
        const img = Object.assign(document.createElement('img'), { src: a.url, alt: a.name, className: 'att-img', loading: 'lazy' });
        img.addEventListener('click', () => {
          $('#expand-title').textContent = a.name;
          $('#expand-body').innerHTML = '';
          $('#expand-body').append(Object.assign(document.createElement('img'), { src: a.url, alt: a.name, className: 'att-full' }));
          $('#expand').hidden = false;
        });
        box.append(img);
      } else {
        const chip = document.createElement('span');
        chip.className = 'att-file';
        chip.innerHTML = ICON['s-read'];
        chip.append(Object.assign(document.createElement('span'), { textContent: a.name }));
        box.append(chip);
      }
    }
    $('.turn-user', node).prepend(box);
  }
  el.thread.append(node);

  const track = $('.track', node);
  if (n > 1) {
    track.addEventListener('scroll', () => {
      const max = track.scrollWidth - track.clientWidth;
      const idx = max > 0 && track.scrollLeft > max / 2 ? 1 : 0;
      node.querySelectorAll('.dot').forEach((d, i) => d.classList.toggle('active', i === idx));
      $('.nav-btn.next', node).hidden = idx === 1;
      $('.nav-btn.prev', node).hidden = idx === 0;
    }, { passive: true });
  }
  turn.answers.forEach((_, side) => updateCard(turnIndex, side));
  paintReactions(turnIndex);
  return node;
}

function cardEl(turnIndex, side) {
  return el.thread.querySelector(`.turn[data-index="${turnIndex}"] .card[data-side="${side}"]`);
}

function paintLabel(card, side) {
  const chat = state.chat;
  const label = $('.card-label', card);
  label.textContent = labelFor(chat, side);
  const won = (chat.winner === 'a' && side === 0) || (chat.winner === 'b' && side === 1);
  card.classList.toggle('winner', won);
  if (won) label.insertAdjacentHTML('beforeend', `<span class="badge">✓ ${t('Gewinner', 'Winner')}</span>`);
  // Notfall-Modell: das gewählte Modell war voll, ein anderes hat diese Antwort geschrieben
  const a = chat.turns[Number(card.closest('.turn')?.dataset.index)]?.answers[side];
  if (a?.fallback && chat.mode !== 'battle') {
    const note = document.createElement('span');
    note.className = 'fallback-tag';
    note.title = t('Das gewählte Modell war gerade voll – dieses hat für dich geantwortet.', 'The chosen model was full – this one answered for you.');
    note.textContent = `⚡ ${t('Notfall', 'Backup')}: ${a.fallback.name}`;
    label.append(note);
  }
}

// Emoji-Reaktion von Agent X an deiner Nachricht (wie im Messenger)
function paintReactions(turnIndex) {
  const node = el.thread.querySelector(`.turn[data-index="${turnIndex}"]`);
  const turn = state.chat?.turns[turnIndex];
  if (!node || !turn) return;
  const holder = $('.turn-user', node);
  const emojis = [...new Set(turn.answers.map((a) => a.reaction).filter(Boolean))];
  let box = $('.reactions', holder);
  if (!emojis.length) { box?.remove(); return; }
  if (!box) {
    box = document.createElement('div');
    box.className = 'reactions';
    $('.bubble', holder).after(box);
  }
  const now = box.dataset.e || '';
  if (now === emojis.join('')) return;
  box.dataset.e = emojis.join('');
  box.innerHTML = emojis.map((e) => `<span class="reaction" role="img" aria-label="${t('Agent X reagiert mit', 'Agent X reacted with')} ${e}">${e}</span>`).join('');
  box.classList.remove('pop');
  void box.offsetWidth;
  box.classList.add('pop');
}

function updateLabels() {
  state.chat.turns.forEach((t, ti) => t.answers.forEach((_, side) => paintLabel(cardEl(ti, side), side)));
}

function updateCard(turnIndex, side) {
  const chat = state.chat;
  const a = chat.turns[turnIndex].answers[side];
  const card = cardEl(turnIndex, side);
  if (!card) return;
  const isLast = turnIndex === chat.turns.length - 1;
  paintLabel(card, side);
  const actBtn = (name) => card.querySelector(`.card-actions [data-act="${name}"], .card-foot [data-act="${name}"]`);
  actBtn('regen').disabled = !isLast || a.status === 'streaming';
  const pics = a.images ?? [];
  actBtn('copy').disabled = !a.text;
  actBtn('expand').disabled = !a.text && !pics.length;
  actBtn('speak').disabled = !a.text || a.status === 'streaming';
  actBtn('preview').hidden = !(a.status === 'done' && htmlBlock(a.text));
  const foot = $('.card-foot', card);
  if (foot) {
    foot.hidden = a.status === 'streaming';
    $('[data-act="like"]', foot).setAttribute('aria-pressed', String(a.feedback === 1));
    $('[data-act="dislike"]', foot).setAttribute('aria-pressed', String(a.feedback === -1));
    $('[data-act="like"]', foot).hidden = $('[data-act="dislike"]', foot).hidden = !a.text && !pics.length;
  }

  // Hinweis, wenn ältere Nachrichten zusammengefasst wurden
  let sumNote = $('.sum-note', card);
  if (a.summarized && !sumNote) {
    sumNote = document.createElement('p');
    sumNote.className = 'sum-note';
    sumNote.textContent = t(`📝 Der Chat ist lang – ${a.summarized} ältere Nachrichten wurden zusammengefasst, damit alles reinpasst.`, `📝 This chat is long – ${a.summarized} older messages were summarized so everything fits.`);
    $('.card-body', card).before(sumNote);
  } else if (!a.summarized) sumNote?.remove();
  const body = $('.card-body', card);
  const part = websitePart(a.text);
  renderBuild(card, a, part);
  renderThinking(card, a);
  renderSteps(card, a);
  renderSources(card, a, turnIndex === chat.turns.length - 1);
  if (pv.turn === turnIndex && pv.side === side) refreshPreview();
  if (pics.length || (chat.modality === 'image' && a.status === 'streaming')) {
    // Bild-Antwort: Platzhalter beim Erstellen, danach das Bild mit Download
    body.innerHTML = pics.length
      ? pics.map((src, i) => `<figure class="gen-img"><img alt="${escapeHtml(chat.turns[turnIndex].user || t('Erstelltes Bild', 'Generated image'))}" data-pic="${i}"><a class="pic-dl" data-pic-dl="${i}" aria-label="${t('Bild herunterladen', 'Download image')}" title="${t('Herunterladen', 'Download')}">${ICON.download}</a><button type="button" class="pic-edit" data-pic-edit="${i}">${ICON['s-edit']}<span>${t('Bearbeiten', 'Edit')}</span></button></figure>`).join('')
      : `<div class="pic-wait"><span class="shimmer">${t('Erstellt Bild …', 'Creating image …')}</span>${a.startedAt ? ` <small data-since="${a.startedAt}"></small>` : ''}</div>`;
    body.querySelectorAll('[data-pic]').forEach((img) => { img.src = pics[Number(img.dataset.pic)]; });
    body.querySelectorAll('[data-pic-dl]').forEach((link) => {
      const src = pics[Number(link.dataset.picDl)];
      link.href = src;
      link.download = `vais-${Date.now()}.${(/^data:image\/(\w+)/.exec(src)?.[1] || 'png').replace('jpeg', 'jpg').replace('svg+xml', 'svg')}`;
    });
    if (a.status === 'error') body.insertAdjacentHTML('beforeend', `<p class="card-error"></p>${isLast ? `<button class="retry" data-act="regen">${t('Erneut versuchen', 'Try again')}</button>` : ''}`);
    if (a.status === 'error') $('.card-error', body).textContent = a.error;
    tickTimers();
  } else if (part || (codeChat() && a.status === 'streaming')) {
    // Webseite: Code als kompakter Datei-Chip statt riesigem Codeblock, dazu Fortschritt
    const lines = part ? part.code.split('\n').filter((l, i, all) => l || i < all.length - 1).length : 0;
    const chip = part ? `<button type="button" class="code-chip" data-act="code">${ICON['m-code']}<span>index.html</span><small>${lines} ${t('Zeilen', 'lines')}</small></button>` : '';
    const gen = a.status === 'streaming'
      ? `<p class="gen"><span class="gen-dots"></span><span class="shimmer">${part ? t('Baut …', 'Building …') : t('Generiert …', 'Generating …')}</span>${a.startedAt ? ` <small data-since="${a.startedAt}"></small>` : ''}</p>`
      : '';
    const err = a.status === 'error' ? '<p class="card-error"></p>' : '';
    body.innerHTML = `${part?.before.trim() ? markdown(part.before) : (!part && a.text ? markdown(a.text) : '')}${chip}${part?.after.trim() ? markdown(part.after) : ''}${gen}${err}`;
    if (err) $('.card-error', body).textContent = a.error;
    tickTimers();
  } else if (a.status === 'error') {
    body.innerHTML = `${a.text ? markdown(a.text) : ''}<p class="card-error"></p>${isLast ? `<button class="retry" data-act="regen">${t('Erneut versuchen', 'Try again')}</button>` : ''}`;
    $('.card-error', body).textContent = a.error;
  } else if (!a.text && a.reaction && a.status === 'done') {
    body.innerHTML = `<p class="react-only">${t('Hat mit', 'Reacted with')} <span>${escapeHtml(a.reaction)}</span> ${t('reagiert', '')}</p>`;
  } else if (!a.text) {
    body.innerHTML = a.status === 'stopped'
      ? `<p class="card-error" style="color:var(--muted)">${t('Gestoppt.', 'Stopped.')}</p>`
      : `<div class="typing" aria-label="${t('Schreibt …', 'Typing …')}"><span></span><span></span><span></span></div>`;
  } else {
    body.innerHTML = markdown(a.text);
  }
  enhance(body);
}

// „Denkt nach …“: Gedanken laufen schnell durch, klappen zu, sobald die Antwort beginnt
function renderThinking(card, a) {
  let box = $('.think', card);
  if (!a.thinking) { box?.remove(); return; }
  if (!box) {
    box = document.createElement('div');
    box.className = 'think';
    box.innerHTML = `<button type="button" class="think-head" data-act="think">${ICON.brain}<span></span>${ICON.chev}</button><div class="think-body"><p></p></div>`;
    ($('.agent-steps', card) ?? $('.card-body', card)).before(box);
  }
  const live = a.status === 'streaming' && !a.text;
  const open = live || a.thinkOpen;
  box.classList.toggle('live', live);
  box.classList.toggle('open', open);
  const secs = Math.max(1, Math.round((a.thinkMs || 0) / 1000));
  $('.think-head span', box).textContent = live ? t('Denkt nach …', 'Thinking …') : `${t('Gedacht', 'Thought')}${a.thinkMs ? ` · ${secs} s` : ''}`;
  $('.think-head', box).setAttribute('aria-expanded', String(open));
  const body = $('.think-body', box);
  $('p', body).textContent = a.thinking;
  if (live) { const p = $("p", body); p.scrollTop = p.scrollHeight; } // schnell mitscrollen
}

// „Sucht im Web …“ und danach aufklappbare Quellen
function renderSources(card, a) {
  let box = $('.sources', card);
  const searching = a.status === 'streaming' && !a.text && !a.sources?.length
    && state.chat?.modality === 'web' && state.chat?.mode !== 'agent';
  if (!a.sources?.length && !searching) { box?.remove(); return; }
  if (!box) {
    box = document.createElement('div');
    box.className = 'sources';
    $('.card-body', card).before(box);
  }
  box.classList.toggle('searching', searching);
  box.classList.toggle('open', !!a.sourcesOpen);
  if (searching) {
    box.innerHTML = `<div class="sources-head">${ICON['m-web']}<span class="shimmer">${t('Sucht im Web …', 'Searching the web …')}</span></div>`;
    return;
  }
  box.innerHTML = `
    <button type="button" class="sources-head" data-act="sources" aria-expanded="${!!a.sourcesOpen}">
      ${ICON['m-web']}<span>${t('Quellen', 'Sources')} <small>${a.sources.length}</small></span>${ICON.chev}
    </button>
    <ol class="sources-list">${a.sources.map((src, i) => `
      <li><a target="_blank" rel="noopener noreferrer">
        <img alt="" loading="lazy">
        <span class="src-text"><b><span class="cite">${i + 1}</span><span class="src-title"></span></b><small></small></span>
      </a></li>`).join('')}
    </ol>`;
  box.querySelectorAll('.sources-list a').forEach((link, i) => {
    const src = a.sources[i];
    let host = '';
    try { host = new URL(src.url).hostname; } catch { /* egal */ }
    link.href = /^https?:/i.test(src.url) ? src.url : '#';
    $('.src-title', link).textContent = src.title || host;
    $('small', link).textContent = src.url;
    const img = $('img', link);
    img.src = `/favicon/${encodeURIComponent(host)}`;
    img.onerror = () => { img.replaceWith(Object.assign(document.createElement('span'), { className: 'src-fallback', textContent: (host.replace(/^www\./, '')[0] || '?').toUpperCase() })); };
  });
}

// Arbeitsschritte von Agent X über der Antwort anzeigen
const STEP_EN = { inbox: 'Your addition', edit: 'Editing', reminder: 'Reminder', video: 'Watching', memory: 'Remembering', search: 'Searching', wiki: 'Wikipedia', read: 'Reading', calc: 'Calculating', time: 'Checking', check: 'Testing', look: 'Looking at', error: 'Problem', other: 'Using' };
const STEP_DE = { inbox: 'Nachtrag', edit: 'Bearbeitet', reminder: 'Erinnerung', video: 'Schaut Video', memory: 'Merkt sich', search: 'Sucht', wiki: 'Wikipedia', read: 'Liest', calc: 'Rechnet', time: 'Prüft', check: 'Testet', look: 'Sieht an', error: 'Problem', other: 'Nutzt' };
const STEP_LABEL = Object.fromEntries(Object.keys(STEP_EN).map((k) => [k, t(STEP_DE[k], STEP_EN[k])]));
function renderSteps(card, a) {
  let box = $('.agent-steps', card);
  if (!a.steps?.length) { box?.remove(); return; }
  if (!box) {
    box = document.createElement('ol');
    box.className = 'agent-steps';
    $('.card-body', card).before(box);
  }
  const working = a.status === 'streaming' && !a.text;
  box.innerHTML = a.steps.map((st, i) => `
    <li class="agent-step ${st.kind}${working && i === a.steps.length - 1 ? ' active' : ''}">
      ${ICON[`s-${st.kind}`] ?? ICON['s-other']}<span><b>${STEP_LABEL[st.kind] ?? t('Schritt', 'Step')}</b> <span class="t"></span></span>
    </li>`).join('');
  box.querySelectorAll('.t').forEach((t, i) => { t.textContent = a.steps[i].text; });
}

// Beim Streamen höchstens einmal pro Frame neu zeichnen
const pending = new Set();
function scheduleUpdate(turnIndex, side) {
  const key = `${turnIndex}:${side}`;
  if (pending.has(key)) return;
  pending.add(key);
  requestAnimationFrame(() => {
    pending.delete(key);
    const stick = el.stage.scrollHeight - el.stage.scrollTop - el.stage.clientHeight < 140;
    updateCard(turnIndex, side);
    if (stick) el.stage.scrollTop = el.stage.scrollHeight;
  });
}

async function runSide(turnIndex, side) {
  const chat = state.chat;
  const a = chat.turns[turnIndex].answers[side];
  Object.assign(a, { text: '', status: 'streaming', error: null, steps: [], thinking: '', thinkMs: 0, thinkStart: 0, thinkOpen: false, sources: [], sourcesOpen: false, images: [], reaction: null, fallback: null, summarized: null, startedAt: Date.now(), buildMs: 0 });
  paintReactions(turnIndex);
  updateCard(turnIndex, side);

  const ctrl = new AbortController();
  state.controllers.add(ctrl);
  updateSend();
  try {
    const res = await fetch('/api/chat/stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chatId: chat.id, side, turn: turnIndex, messages: buildMessages(turnIndex, side),
        display: { text: chat.turns[turnIndex].user, attachments: chat.turns[turnIndex].attachments ?? [] },
      }),
      signal: ctrl.signal,
    });
    if (res.status === 401) location.replace('/login');
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || t('Das Modell konnte nicht antworten.', 'The model could not answer.'));

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let finished = false;
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let nl;
      while ((nl = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, nl);
        buffer = buffer.slice(nl + 1);
        if (!line.trim()) continue;
        const msg = JSON.parse(line);
        if (msg.error) throw new Error(msg.error);
        if (msg.r) {
          if (!a.thinkStart) a.thinkStart = Date.now();
          a.thinking += msg.r;
          scheduleUpdate(turnIndex, side);
        }
        if (msg.t) {
          if (a.thinkStart && !a.thinkMs) a.thinkMs = Date.now() - a.thinkStart;
          a.text += msg.t;
          scheduleUpdate(turnIndex, side);
        }
        if (msg.step) { a.steps.push(msg.step); scheduleUpdate(turnIndex, side); }
        if (msg.sources) { a.sources = msg.sources; scheduleUpdate(turnIndex, side); }
        if (msg.image) { a.images = [...(a.images ?? []), msg.image]; scheduleUpdate(turnIndex, side); }
        if (msg.react !== undefined) {
          a.reaction = msg.react || null;
          paintReactions(turnIndex);
          if (a.reaction && a.reaction !== '👀') haptic('tap');
        }
        if (msg.fallback) { a.fallback = msg.fallback; scheduleUpdate(turnIndex, side); }
        if (msg.summarized) { a.summarized = msg.summarized; scheduleUpdate(turnIndex, side); }
        if (msg.done) finished = true;
      }
    }
    if (!finished) throw new Error(t('Die Verbindung wurde unterbrochen.', 'The connection was interrupted.'));
    const got = a.text || a.images?.length || a.reaction;
    a.status = got ? 'done' : 'error';
    if (!got) a.error = t('Das Modell hat keine Antwort geliefert.', 'The model returned no answer.');
  } catch (err) {
    const agentSide = chat.mode === 'agent' || (chat.labels?.[side] === 'Agent X');
    if (ctrl.signal.aborted) a.status = a.text || a.images?.length ? 'done' : 'stopped';
    else if (agentSide && (err instanceof TypeError || /unterbrochen|interrupted/i.test(err.message))) {
      // Verbindung weg, aber Agent X arbeitet auf dem Server weiter
      Object.assign(a, { status: 'streaming', background: true });
      watchBackground(chat.id);
    } else Object.assign(a, { status: 'error', error: err.message || t('Das Modell konnte nicht antworten.', 'The model could not answer.') });
  } finally {
    a.buildMs = Date.now() - a.startedAt;
    state.controllers.delete(ctrl);
    if (state.chat === chat) updateCard(turnIndex, side);
    updateSend();
  }
}

function afterTurn() {
  const chat = state.chat;
  if (!chat || chat.mode === 'direct' || chat.mode === 'agent' || chat.winner) return;
  const last = chat.turns.at(-1);
  if (!last) return;
  el.vote.hidden = !last.answers.every((a) => a.status === 'done' && (a.text || a.images?.length));
}

async function send() {
  const text = el.prompt.value.trim();
  const attachments = state.pending;
  if (!text && !attachments.length) return;
  if (busy()) return queueMessage();
  if (offline) return toast(t('Du bist offline – Chats kannst du nur lesen.', 'You are offline – chats are read-only.'));
  if (pendingReads) return toast(t('Anhänge werden noch geladen …', 'Attachments are still loading …'));
  if (!state.models.length) return toast(t('Modelle konnten nicht geladen werden. Lade die Seite neu.', 'Models could not be loaded. Reload the page.'));
  const hasImages = attachments.some((a) => a.kind === 'image');
  const imageChat = (state.chat?.modality ?? state.modality) === 'image';
  if (hasImages && !imageChat && ['sxs', 'direct'].includes(state.chat?.mode ?? state.mode)) {
    const need = (state.chat?.mode ?? state.mode) === 'sxs' ? 2 : 1;
    const blind = state.picks.slice(0, need).findIndex((id) => !modelById(id)?.caps.includes('vision'));
    if (blind !== -1) {
      toast(t('Dieses Modell kann keine Bilder ansehen. Wähle eins mit 👁.', 'This model cannot see images. Choose one with 👁.'));
      if (!state.chat) return openSheet(blind);
      return;
    }
  }

  if (!state.chat) {
    if (state.mode === 'sxs' || state.mode === 'direct') {
      const need = state.mode === 'sxs' ? 2 : 1;
      const missing = state.picks.slice(0, need).findIndex((id) => !modelById(id));
      if (missing !== -1) return openSheet(missing);
    }
    const title = text || attachments.map((a) => a.name).join(', ') || t('Anhang', 'Attachment');
    const body = { mode: state.mode, modality: state.modality, title: title.slice(0, 80), images: hasImages, incognito: state.incognito };
    if (state.mode === 'sxs') body.models = state.picks.slice(0, 2);
    if (state.mode === 'direct') body.models = [state.picks[0]];
    el.send.disabled = true;
    try {
      const data = await post('/api/chat/start', body);
      state.chat = { id: data.id, mode: state.mode, modality: state.modality, labels: data.models, names: null, winner: null, turns: [], incognito: state.incognito };
    } catch (err) {
      return toast(err.message);
    } finally {
      el.send.disabled = false;
    }
    el.title.textContent = title.length > 40 ? `${title.slice(0, 40)}…` : title;
    history.pushState(null, '', `#c/${state.chat.id}`);
    historyDirty = true;
    showView('thread');
    renderControls();
  }

  const chat = state.chat;
  historyDirty = true;
  haptic('send');
  recognition?.stop();
  el.prompt.value = '';
  state.pending = [];
  renderTray();
  el.prompt.placeholder = t('Folgefrage stellen …', 'Ask a follow-up …');
  autosize();
  el.vote.hidden = true;
  el.voteResult.hidden = true;
  clearFollowups();

  await runTurn(chat, text, attachments);
}

// Eine Frage stellen und die Antwort(en) holen
async function runTurn(chat, text, attachments) {
  const sides = chat.mode === 'direct' || chat.mode === 'agent' ? 1 : 2;
  chat.turns.push({ user: text, attachments, answers: Array.from({ length: sides }, () => ({ text: '', status: 'streaming', error: null, steps: [], thinking: '', thinkMs: 0 })) });
  const index = chat.turns.length - 1;
  if (index > 0) chat.turns[index - 1].answers.forEach((_, s) => updateCard(index - 1, s)); // „Neu generieren“ dort abschalten
  const node = renderTurn(index);
  node.scrollIntoView({ behavior: 'smooth', block: 'start' });

  await Promise.all(chat.turns[index].answers.map((_, side) => runSide(index, side)));
  if (state.chat === chat) afterTurn();
  await loadExtras(chat, index);
  refreshOfflineChat(chat.id);
  processQueue(chat);
}

// ── Vorgemerkte Nachrichten (geschrieben, während die KI noch antwortet) ──
let queueId = 0;
function queueMessage() {
  const text = el.prompt.value.trim();
  const attachments = state.pending;
  if (!text && !attachments.length) return;
  if (!state.chat) return toast(t('Warte kurz, bis der Chat gestartet ist.', 'Wait a moment until the chat has started.'));
  state.queue.push({ id: ++queueId, chatId: state.chat.id, text, attachments });
  el.prompt.value = '';
  state.pending = [];
  renderTray();
  autosize();
  haptic('tap');
  renderQueue();
}
function renderQueue() {
  let box = $('#queue');
  const items = state.queue.filter((q) => q.chatId === state.chat?.id);
  if (!items.length) { box?.remove(); return; }
  if (!box) {
    box = document.createElement('div');
    box.id = 'queue';
    box.className = 'queue';
  }
  el.thread.after(box);
  const agentRunning = state.chat?.mode === 'agent' || state.chat?.labels?.includes?.('Agent X');
  box.innerHTML = items.map((q) => `
    <div class="queued" data-q="${q.id}">
      <div class="bubble"><span></span>${q.attachments.length ? `<small>📎 ${q.attachments.length}</small>` : ''}</div>
      <div class="queued-bar">
        <small>${t('Wartet – kommt dran, sobald die Antwort fertig ist', 'Waiting – sent when the answer is done')}</small>
        <button type="button" data-q-now="${q.id}">${agentRunning ? t('↑ Jetzt einbringen', '↑ Add now') : t('↑ Jetzt senden', '↑ Send now')}</button>
        <button type="button" data-q-del="${q.id}" aria-label="${t('Entfernen', 'Remove')}">✕</button>
      </div>
    </div>`).join('');
  box.querySelectorAll('.queued .bubble span').forEach((span, i) => { span.textContent = items[i].text; });
  box.scrollIntoView({ behavior: 'smooth', block: 'end' });
}
function processQueue(chat) {
  if (state.chat !== chat || busy()) return;
  const i = state.queue.findIndex((q) => q.chatId === chat.id);
  if (i === -1) return renderQueue();
  const [item] = state.queue.splice(i, 1);
  renderQueue();
  el.prompt.value = item.text;
  state.pending = item.attachments;
  renderTray();
  send();
}
document.addEventListener('click', async (e) => {
  const del = e.target.closest('[data-q-del]');
  if (del) {
    state.queue = state.queue.filter((q) => q.id !== Number(del.dataset.qDel));
    return renderQueue();
  }
  const now = e.target.closest('[data-q-now]');
  if (!now) return;
  const item = state.queue.find((q) => q.id === Number(now.dataset.qNow));
  const chat = state.chat;
  if (!item || !chat) return;
  const ti = chat.turns.length - 1;
  if (busy() && !item.attachments.length) {
    // Agent X: Nachricht direkt in die laufende Arbeit geben
    try {
      const data = await post('/api/chat/inject', { chatId: chat.id, turn: ti, text: item.text });
      if (data.injected) {
        state.queue = state.queue.filter((q) => q !== item);
        chat.turns[ti].user = `${chat.turns[ti].user}\n\n➕ ${item.text}`;
        const bubble = el.thread.querySelector(`.turn[data-index="${ti}"] .turn-user .bubble`);
        if (bubble) bubble.append(Object.assign(document.createElement('span'), { className: 'addon', textContent: `➕ ${item.text}` }));
        haptic('success');
        toast(t('Agent X berücksichtigt das jetzt ✓', 'Agent X is taking this into account ✓'));
        return renderQueue();
      }
    } catch { /* dann eben neu senden */ }
  }
  // Sonst: laufende Antwort stoppen und sofort senden
  if (busy()) {
    chat.turns[ti]?.answers.forEach((a, side) => { if (a.status === 'streaming') post('/api/chat/stop', { chatId: chat.id, turn: ti, side }).catch(() => {}); });
    for (const c of state.controllers) c.abort();
    await new Promise((r) => setTimeout(r, 150));
  }
  state.queue = state.queue.filter((q) => q !== item);
  state.queue.unshift(item);
  processQueue(chat);
});

// ── ✨ Nachricht verbessern ────────────────────────────────────────
let improving = false;
$('#improve-btn').addEventListener('click', async () => {
  const before = el.prompt.value;
  if (before.trim().length < 3 || improving) return;
  improving = true;
  const btn = $('#improve-btn');
  btn.hidden = false;
  btn.classList.add('busy');
  el.prompt.classList.add('improving');
  try {
    const data = await post('/api/chat/improve', { text: before, mode: state.chat?.mode ?? state.mode, modality: state.chat?.modality ?? state.modality });
    el.prompt.value = data.text;
    autosize();
    haptic('success');
    toastAction(t('Nachricht verbessert ✨', 'Message improved ✨'), t('Rückgängig', 'Undo'), () => { el.prompt.value = before; autosize(); });
  } catch (err) {
    toast(err.message);
  } finally {
    improving = false;
    btn.classList.remove('busy');
    el.prompt.classList.remove('improving');
    updateSend();
  }
});

// Nach einer Antwort: automatischer Titel (beim ersten Mal) + 3 Vorschläge für die nächste Frage
async function loadExtras(chat, index) {
  const turn = chat.turns[index];
  if (!turn?.answers.some((a) => a.status === 'done')) return;
  let data;
  try {
    data = await post('/api/chat/extras', { chatId: chat.id, turn: index });
  } catch { return; }
  if (data.title && !chat.incognito) {
    const item = historyItems.find((c) => c.id === chat.id);
    if (item) { item.title = data.title; renderHistory(); } else historyDirty = true;
    if (state.chat === chat) el.title.textContent = data.title.length > 40 ? `${data.title.slice(0, 40)}…` : data.title;
  }
  if (state.chat !== chat || index !== chat.turns.length - 1 || !data.suggestions?.length) return;
  const node = el.thread.querySelector(`.turn[data-index="${index}"]`);
  if (!node || node.querySelector('.followups')) return;
  const box = document.createElement('div');
  box.className = 'followups';
  box.setAttribute('role', 'group');
  box.setAttribute('aria-label', t('Vorschläge für die nächste Frage', 'Suggested follow-ups'));
  for (const text of data.suggestions) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'followup';
    b.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg><span></span>`;
    b.querySelector('span').textContent = text;
    b.addEventListener('click', () => {
      if (busy()) return;
      el.prompt.value = text;
      send();
    });
    box.append(b);
  }
  node.append(box);
  if (el.stage.scrollHeight - el.stage.scrollTop - el.stage.clientHeight < 220) box.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

const clearFollowups = () => el.thread.querySelectorAll('.followups').forEach((n) => n.remove());

// Plan von Agent X bestätigen oder ändern (nur beim neuesten Plan)
el.thread.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-plan]');
  if (!btn) return;
  const turnNode = btn.closest('.turn');
  if (!state.chat || Number(turnNode?.dataset.index) !== state.chat.turns.length - 1) return toast(t('Das ist ein älterer Plan.', 'That is an older plan.'));
  if (busy()) return;
  if (btn.dataset.plan === 'go') {
    el.prompt.value = t('Ja, leg los mit dem Plan!', 'Yes, go ahead with the plan!');
    send();
  } else {
    el.prompt.value = t('Ändere den Plan: ', 'Change the plan: ');
    autosize();
    el.prompt.focus();
    el.prompt.setSelectionRange(el.prompt.value.length, el.prompt.value.length);
  }
});

// Erstelltes Bild bearbeiten: als Anhang für die nächste Nachricht übernehmen
el.thread.addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-pic-edit]');
  if (!btn) return;
  const img = btn.closest('.gen-img')?.querySelector('img');
  if (!img?.src) return;
  let url = img.src;
  // SVG (Demo) in PNG umwandeln, damit Bildmodelle es lesen können
  if (!/^data:image\/(png|jpeg|webp)/.test(url)) {
    try {
      const c = document.createElement('canvas');
      c.width = img.naturalWidth || 1024; c.height = img.naturalHeight || 1024;
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      url = c.toDataURL('image/jpeg', 0.9);
    } catch { return toast(t('Dieses Bild lässt sich nicht bearbeiten.', 'This image cannot be edited.')); }
  }
  state.pending = [{ kind: 'image', name: t('Bild zum Bearbeiten', 'Image to edit'), url }];
  renderTray();
  el.prompt.placeholder = t('Was soll ich ändern? z. B. „Mach den Himmel lila“', 'What should I change? e.g. “Make the sky purple”');
  el.prompt.focus();
  haptic('tap');
});

// 👎: Was war nicht gut? (hilft zu sehen, welche Modelle wofür Kritik bekommen)
const REASONS = () => [
  ['wrong', t('Falsch', 'Wrong')], ['misunderstood', t('Frage nicht verstanden', 'Misunderstood')], ['long', t('Zu lang', 'Too long')],
  ['short', t('Zu kurz', 'Too short')], ['code', t('Code geht nicht', 'Code broken')], ['outdated', t('Veraltet', 'Outdated')],
  ['language', t('Falsche Sprache', 'Wrong language')], ['rude', t('Unpassend', 'Inappropriate')],
];
function renderReasons(turnIndex, side, show) {
  const card = cardEl(turnIndex, side);
  if (!card) return;
  let box = $('.fb-reasons', card);
  if (!show) { box?.remove(); return; }
  if (!box) {
    box = document.createElement('div');
    box.className = 'fb-reasons';
    ($('.card-foot', card) ?? $('.card-body', card)).after(box);
  }
  const a = state.chat.turns[turnIndex].answers[side];
  box.innerHTML = `<p>${t('Was war nicht gut? (optional)', 'What was wrong? (optional)')}</p>${REASONS().map(([k, label]) => `<button type="button" class="fb-chip" data-act="reason" data-reason="${k}" aria-pressed="${(a.reasons ?? []).includes(k)}">${label}</button>`).join('')}`;
}

// ── Abstimmen ─────────────────────────────────────────────────────
el.vote.addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-vote]');
  if (!btn || !state.chat) return;
  const chat = state.chat;
  el.vote.setAttribute('aria-busy', 'true');
  try {
    const data = await post('/api/chat/vote', { chatId: chat.id, winner: btn.dataset.vote });
    haptic('success');
    chat.names = data.models;
    chat.winner = data.winner;
    refreshOfflineChat(chat.id);
    updateLabels();
    el.vote.hidden = true;
    el.voteResult.innerHTML = chat.mode === 'battle'
      ? t('Danke für deine Stimme! A war <strong></strong>, B war <strong></strong>.', 'Thanks for your vote! A was <strong></strong>, B was <strong></strong>.')
      : t('Danke für deine Stimme!', 'Thanks for your vote!');
    const strongs = el.voteResult.querySelectorAll('strong');
    if (strongs.length) { strongs[0].textContent = data.models[0]; strongs[1].textContent = data.models[1]; }
    el.voteResult.hidden = false;
  } catch (err) {
    toast(err.message);
  } finally {
    el.vote.removeAttribute('aria-busy');
  }
});

// ── Aktionen in den Antwortkarten ─────────────────────────────────
el.thread.addEventListener('click', async (e) => {
  const turnNode = e.target.closest('.turn');
  if (!turnNode || !state.chat) return;
  const turnIndex = Number(turnNode.dataset.index);

  const go = e.target.closest('[data-go]');
  if (go) {
    const track = $('.track', turnNode);
    track.scrollTo({ left: go.dataset.go === '1' ? track.scrollWidth : 0, behavior: 'smooth' });
    return;
  }

  const uact = e.target.closest('[data-uact]');
  if (uact) return userAction(uact.dataset.uact, turnIndex, turnNode);

  const btn = e.target.closest('[data-act]');
  if (!btn || btn.disabled) return;
  const side = Number(btn.closest('.card').dataset.side);
  const a = state.chat.turns[turnIndex].answers[side];
  const act = btn.dataset.act;

  if (act === 'like' || act === 'dislike') {
    const value = act === 'like' ? 1 : -1;
    const before = a.feedback ?? 0;
    a.feedback = before === value ? 0 : value;
    if (a.feedback) haptic('tap');
    updateCard(turnIndex, side);
    if (a.feedback) cardEl(turnIndex, side)?.querySelector(`[data-act="${act}"]`)?.classList.add('bump');
    if (a.feedback !== -1) a.reasons = [];
    try {
      await post('/api/chat/feedback', { chatId: state.chat.id, turn: turnIndex, side, value: a.feedback, reasons: a.reasons ?? [] });
      if (a.feedback === 1) toast(t('Danke für dein Feedback 👍', 'Thanks for your feedback 👍'));
      renderReasons(turnIndex, side, a.feedback === -1);
    } catch (err) {
      a.feedback = before;
      updateCard(turnIndex, side);
      toast(err.message);
    }
    return;
  }

  if (act === 'reason') {
    const r = btn.dataset.reason;
    a.reasons = (a.reasons ?? []).includes(r) ? a.reasons.filter((x) => x !== r) : [...(a.reasons ?? []), r];
    btn.setAttribute('aria-pressed', String(a.reasons.includes(r)));
    haptic('tap');
    post('/api/chat/feedback', { chatId: state.chat.id, turn: turnIndex, side, value: -1, reasons: a.reasons }).catch((err) => toast(err.message));
    return;
  }

  if (act === 'sources') {
    a.sourcesOpen = !a.sourcesOpen;
    renderSources(btn.closest('.card'), a);
    return;
  }

  if (act === 'think') {
    if (a.status === 'streaming' && !a.text) return;
    a.thinkOpen = !a.thinkOpen;
    renderThinking(btn.closest('.card'), a);
    return;
  }

  if (act === 'copy') {
    try {
      await navigator.clipboard.writeText(a.text);
      haptic('tap');
      btn.innerHTML = ICON.check;
      setTimeout(() => (btn.innerHTML = ICON.copy), 1500);
      toast(t('Kopiert', 'Copied'));
    } catch {
      toast(t('Kopieren nicht möglich', 'Copying not possible'));
    }
  } else if (act === 'speak') {
    speak(btn, btn.closest('.card'));
  } else if (act === 'preview' || act === 'code') {
    openPreview(turnIndex, side, act === 'code' ? 'code' : 'view');
  } else if (act === 'expand') {
    $('#expand-title').textContent = labelFor(state.chat, side);
    $('#expand-body').innerHTML = a.text ? markdown(a.text) : '';
    for (const src of a.images ?? []) $('#expand-body').append(Object.assign(document.createElement('img'), { src, className: 'att-full', alt: '' }));
    enhance($('#expand-body'));
    $('#expand').hidden = false;
    $('#expand [data-close]').focus();
  } else if (act === 'regen') {
    if (turnIndex !== state.chat.turns.length - 1 || a.status === 'streaming') return;
    el.vote.hidden = true;
    const chat = state.chat;
    await runSide(turnIndex, side);
    if (state.chat === chat) afterTurn();
  }
});

// ── Eigene Nachricht kopieren / bearbeiten ────────────────────────
async function userAction(act, turnIndex, turnNode) {
  const chat = state.chat;
  const turn = chat.turns[turnIndex];
  if (act === 'copy') {
    try { await navigator.clipboard.writeText(turn.user); toast(t('Kopiert', 'Copied')); } catch { toast(t('Kopieren nicht möglich', 'Copying not possible')); }
    return;
  }
  if (act === 'edit') {
    if (busy()) return toast(t('Warte, bis die Antwort fertig ist.', 'Wait until the answer is finished.'));
    if (chat.mode === 'battle' && chat.winner) return toast(t('Nach der Abstimmung kann das Battle nicht mehr geändert werden.', 'The battle cannot be changed after voting.'));
    const box = $('.turn-user', turnNode);
    box.classList.add('editing');
    box.insertAdjacentHTML('beforeend', `
      <div class="edit-box">
        <textarea rows="2" aria-label="${t('Nachricht bearbeiten', 'Edit message')}"></textarea>
        <div class="edit-actions">
          <button type="button" class="link" data-uact="cancel">${t('Abbrechen', 'Cancel')}</button>
          <button type="button" class="edit-send" data-uact="save">${t('Senden', 'Send')}</button>
        </div>
      </div>`);
    const area = $('.edit-box textarea', box);
    area.value = turn.user;
    const fit = () => { area.style.height = 'auto'; area.style.height = `${Math.min(area.scrollHeight, 260)}px`; };
    area.addEventListener('input', fit);
    area.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { e.stopPropagation(); userAction('cancel', turnIndex, turnNode); }
      if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && matchMedia('(pointer: fine)').matches) { e.preventDefault(); userAction('save', turnIndex, turnNode); }
    });
    fit();
    area.focus();
    area.setSelectionRange(area.value.length, area.value.length);
    return;
  }
  if (act === 'cancel') {
    const box = $('.turn-user', turnNode);
    box.classList.remove('editing');
    $('.edit-box', box)?.remove();
    return;
  }
  if (act === 'save') {
    const text = $('.edit-box textarea', turnNode).value.trim();
    if (!text && !turn.attachments?.length) return;
    if (busy()) return;
    try {
      await post('/api/chat/truncate', { chatId: chat.id, fromTurn: turnIndex });
    } catch (err) {
      return toast(err.message);
    }
    const attachments = turn.attachments ?? [];
    chat.turns.length = turnIndex;
    el.thread.querySelectorAll('.turn').forEach((n) => { if (Number(n.dataset.index) >= turnIndex) n.remove(); });
    el.vote.hidden = true;
    el.voteResult.hidden = true;
    historyDirty = true;
    await runTurn(chat, text, attachments);
  }
}

// ── Vorlesen ──────────────────────────────────────────────────────
let speakingBtn = null;

// Sprache einer Antwort grob erkennen (Antworten können anders sein als die Oberfläche)
function guessLang(text) {
  const words = text.toLowerCase().match(/[a-zäöüß]+/g) ?? [];
  let de = 0;
  let en = 0;
  for (const w of words.slice(0, 300)) {
    if (/^(der|die|das|und|ist|nicht|ich|du|mit|auf|für|eine?|wird|sind|auch|oder)$/.test(w)) de++;
    if (/^(the|and|is|not|you|with|for|are|this|that|of|to|it|or|be)$/.test(w)) en++;
  }
  return de === en ? LANG : de > en ? 'de' : 'en';
}

function speakableText(card) {
  const body = $('.card-body', card).cloneNode(true);
  body.querySelectorAll('pre, .code-chip').forEach((n) => n.replaceWith(document.createTextNode(` ${t('(Code)', '(code)')} `)));
  body.querySelectorAll('.cite, .gen, .retry').forEach((n) => n.remove());
  return body.textContent.replace(/\s+/g, ' ').trim();
}

// Lange Texte in Stücke teilen (manche Browser brechen sonst ab)
function speechChunks(text) {
  const out = [];
  let cur = '';
  for (const sentence of text.split(/(?<=[.!?…:;])\s+/)) {
    if ((cur + ' ' + sentence).length > 220 && cur) { out.push(cur); cur = ''; }
    cur = cur ? `${cur} ${sentence}` : sentence;
    while (cur.length > 260) { out.push(cur.slice(0, 260)); cur = cur.slice(260); }
  }
  if (cur.trim()) out.push(cur);
  return out;
}

function stopSpeaking() {
  if (!canSpeak) return;
  speechSynthesis.cancel();
  if (speakingBtn) {
    speakingBtn.setAttribute('aria-pressed', 'false');
    speakingBtn.innerHTML = ICON.speak;
  }
  speakingBtn = null;
}

// Stimme fürs Vorlesen: in den Einstellungen gewählt (pro Sprache), sonst die beste vorhandene
const voicePrefs = () => ({ rate: 1, pitch: 1, de: '', en: '', ...store.get('vais.voice', {}) });
const voicesFor = (lang) => (canSpeak ? speechSynthesis.getVoices() : []).filter((v) => v.lang?.toLowerCase().replace('_', '-').startsWith(lang));
function pickVoice(lang) {
  const list = voicesFor(lang);
  const wanted = voicePrefs()[lang];
  // Ohne Auswahl: natürliche/online Stimmen bevorzugen (klingen meist besser)
  return list.find((v) => v.voiceURI === wanted) ?? list.find((v) => /natural|neural|online|premium|enhanced/i.test(v.name)) ?? list.find((v) => v.default) ?? list[0] ?? null;
}
function paintVoices() {
  const box = $('#set-voice-group');
  if (!canSpeak) { box.hidden = true; return; }
  const prefs = voicePrefs();
  for (const lang of ['de', 'en']) {
    const sel = $(`#set-voice-${lang}`);
    const list = voicesFor(lang);
    sel.innerHTML = `<option value="">${t('Automatisch', 'Automatic')}</option>${list.map((v) => `<option value="${escapeHtml(v.voiceURI)}">${escapeHtml(v.name.replace(/^(Microsoft|Google)\s+/, ''))}${v.localService ? '' : ' ☁'}</option>`).join('')}`;
    sel.value = list.some((v) => v.voiceURI === prefs[lang]) ? prefs[lang] : '';
    sel.closest('label').hidden = !list.length;
  }
  $('#set-voice-rate').value = prefs.rate;
  $('#set-voice-pitch').value = prefs.pitch;
  $('#set-voice-rate-val').textContent = `${Number(prefs.rate).toFixed(1)}×`;
  $('#set-voice-pitch-val').textContent = Number(prefs.pitch).toFixed(1);
}
if (canSpeak) { try { speechSynthesis.getVoices(); } catch { /* egal */ } }
if (canSpeak) speechSynthesis.addEventListener?.('voiceschanged', () => { if (!$('#settings').hidden) paintVoices(); });
function saveVoice() {
  store.set('vais.voice', {
    de: $('#set-voice-de').value, en: $('#set-voice-en').value,
    rate: Number($('#set-voice-rate').value) || 1, pitch: Number($('#set-voice-pitch').value) || 1,
  });
  $('#set-voice-rate-val').textContent = `${Number($('#set-voice-rate').value).toFixed(1)}×`;
  $('#set-voice-pitch-val').textContent = Number($('#set-voice-pitch').value).toFixed(1);
}
['#set-voice-de', '#set-voice-en', '#set-voice-rate', '#set-voice-pitch'].forEach((sel) => $(sel)?.addEventListener('input', saveVoice));
$('#set-voice-test')?.addEventListener('click', () => {
  if (!canSpeak) return;
  stopSpeaking();
  const prefs = voicePrefs();
  const u = new SpeechSynthesisUtterance(t('Hallo! So klinge ich, wenn ich dir Antworten vorlese.', 'Hi! This is how I sound when I read answers to you.'));
  u.lang = LOCALE;
  const v = pickVoice(LANG);
  if (v) u.voice = v;
  u.rate = prefs.rate;
  u.pitch = prefs.pitch;
  speechSynthesis.speak(u);
});

function speak(btn, card) {
  if (!canSpeak) return;
  if (speakingBtn === btn) return stopSpeaking();
  stopSpeaking();
  const text = speakableText(card);
  const parts = speechChunks(text);
  if (!parts.length) return;
  const lang = EXTRA_LANGS.includes(LANG) ? LANG : guessLang(text);
  const voice = pickVoice(lang);
  const prefs = voicePrefs();
  speakingBtn = btn;
  btn.setAttribute('aria-pressed', 'true');
  btn.innerHTML = ICON.speakStop;
  parts.forEach((part, i) => {
    const u = new SpeechSynthesisUtterance(part);
    u.lang = { de: 'de-DE', en: 'en-US' }[lang] ?? LOCALE;
    if (voice) u.voice = voice;
    u.rate = prefs.rate;
    u.pitch = prefs.pitch;
    if (i === parts.length - 1) u.onend = () => { if (speakingBtn === btn) stopSpeaking(); };
    u.onerror = (e) => { if (e.error !== 'interrupted' && e.error !== 'canceled' && speakingBtn === btn) stopSpeaking(); };
    speechSynthesis.speak(u);
  });
}

// ── Spracheingabe (Mikrofon) ──────────────────────────────────────
let recognition = null;
const micBtn = $('#mic');
// Auf dem iPhone (und wo es keine Spracherkennung gibt): aufnehmen + Whisper, sonst die des Browsers (zeigt live Text)
const iosDevice = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const dictateByRecording = canRecord && (iosDevice || !SpeechRec);
let dictation = null;
if (dictateByRecording || SpeechRec) {
  micBtn.hidden = false;
  micBtn.addEventListener('click', () => {
    if (dictateByRecording) return dictation ? dictation.stopNow() : dictateRecording();
    return recognition ? recognition.stop() : startListening();
  });
}
async function dictateRecording() {
  const listener = new Listener();
  try { await listener.open(); } catch { return toast(t('Bitte erlaube den Zugriff aufs Mikrofon.', 'Please allow access to the microphone.')); }
  dictation = listener;
  micBtn.classList.add('live');
  micBtn.setAttribute('aria-pressed', 'true');
  const before = el.prompt.placeholder;
  el.prompt.placeholder = t('Sprich jetzt … (🎙 nochmal tippen = fertig)', 'Speak now … (tap 🎙 again = done)');
  const blob = await listener.record({ silenceMs: 2200, noSpeechMs: 12_000 }).catch(() => null);
  listener.close(); // Mikrofon sofort wieder freigeben
  dictation = null;
  micBtn.classList.remove('live');
  micBtn.setAttribute('aria-pressed', 'false');
  if (!blob) { el.prompt.placeholder = before; return; }
  el.prompt.placeholder = t('Erkennt …', 'Recognising …');
  try {
    const text = await toText(blob, LOCALE);
    if (text) { el.prompt.value = [el.prompt.value.trim(), text].filter(Boolean).join(' '); autosize(); el.prompt.focus(); }
  } catch (err) {
    toast(err.unsupported ? t('Spracherkennung ist gerade nicht verfügbar.', 'Speech recognition is not available right now.') : err.message);
  } finally { el.prompt.placeholder = before; }
}

function startListening() {
  const rec = new SpeechRec();
  rec.lang = LOCALE;
  rec.interimResults = true;
  rec.continuous = true;
  const base = el.prompt.value.trim();
  let finalText = '';
  rec.onresult = (e) => {
    let interim = '';
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const res = e.results[i];
      if (res.isFinal) finalText += res[0].transcript;
      else interim += res[0].transcript;
    }
    el.prompt.value = [base, `${finalText}${interim}`.trim()].filter(Boolean).join(' ');
    autosize();
  };
  rec.onerror = (e) => {
    if (e.error === 'not-allowed' || e.error === 'service-not-allowed') toast(t('Bitte erlaube den Zugriff aufs Mikrofon.', 'Please allow access to the microphone.'));
    else if (e.error !== 'no-speech' && e.error !== 'aborted') toast(t('Spracheingabe hat nicht geklappt.', 'Voice input did not work.'));
  };
  rec.onend = () => {
    recognition = null;
    micBtn.classList.remove('live');
    micBtn.setAttribute('aria-pressed', 'false');
  };
  try {
    rec.start();
    recognition = rec;
    micBtn.classList.add('live');
    micBtn.setAttribute('aria-pressed', 'true');
    el.prompt.focus();
  } catch {
    recognition = null;
  }
}

// ── Sprach-Modus: zuhören → senden → vorlesen → wieder zuhören ─────
// Aufnahme über das Mikrofon + Whisper (zuverlässig auch auf dem iPhone); nur wenn das nicht geht,
// die eingebaute Spracherkennung des Browsers – dann „Tippen zum Sprechen“.
const voiceEl = $('#voice');
const voice = { on: false, paused: false, rec: null, phase: 'idle', mode: 'record', misses: 0, listener: null };
if ((canRecord || SpeechRec) && canSpeak) $('#voice-btn').hidden = false;
function voicePhase(phase, said) {
  voice.phase = phase;
  voiceEl.dataset.phase = phase;
  $('#voice-state').textContent = {
    listen: t('Ich höre zu …', 'Listening …'),
    think: t('Denkt nach …', 'Thinking …'),
    speak: t('Spricht …', 'Speaking …'),
    paused: t('Pausiert', 'Paused'),
    tap: t('Tippe auf den Kreis und sprich', 'Tap the circle and speak'),
  }[phase] ?? '';
  if (said !== undefined) $('#voice-said').textContent = said;
  $('#voice-hint').textContent = phase === 'listen'
    ? t('Tippe auf den Kreis, wenn du fertig bist', 'Tap the circle when you are done')
    : phase === 'speak' ? t('Tippe auf den Kreis zum Unterbrechen', 'Tap the circle to interrupt') : '';
  $('#voice-pause').textContent = phase === 'paused' || phase === 'tap' ? t('▶ Weiter', '▶ Resume') : phase === 'speak' ? t('Unterbrechen', 'Interrupt') : t('Pause', 'Pause');
}
const orbLevel = (lvl) => voiceEl.style.setProperty('--lvl', String(lvl));

async function voiceListen() {
  if (!voice.on || voice.paused) return;
  if (voice.mode === 'browser') return voiceListenBrowser();
  voicePhase('listen', '');
  let blob = null;
  try {
    blob = await voice.listener.record({ onLevel: orbLevel });
  } catch { blob = null; }
  if (!voice.on || voice.paused) return;
  if (!blob) {
    // Nichts gehört: ein paar Mal weiter zuhören, dann pausieren statt endlos zu laufen
    if (++voice.misses >= 3) { voice.paused = true; voice.misses = 0; return voicePhase('tap', t('Ich habe nichts gehört.', 'I didn’t hear anything.')); }
    return voiceListen();
  }
  voice.misses = 0;
  voicePhase('think', '…');
  let text = '';
  try {
    text = await toText(blob, LOCALE);
  } catch (err) {
    if (err.unsupported && SpeechRec) { voice.mode = 'browser'; voice.paused = true; return voicePhase('tap', ''); }
    toast(err.message);
    voice.paused = true;
    return voicePhase('tap', '');
  }
  if (!voice.on) return;
  if (!text) return voiceListen();
  voiceAsk(text);
}
// Notlösung: Spracherkennung des Browsers – startet nur per Tipp (sonst bleibt sie auf dem iPhone stumm)
function voiceListenBrowser() {
  const rec = new SpeechRec();
  rec.lang = LOCALE;
  rec.interimResults = true;
  rec.continuous = false;
  let finalText = '';
  rec.onresult = (e) => {
    let interim = '';
    for (let i = e.resultIndex; i < e.results.length; i++) {
      if (e.results[i].isFinal) finalText += e.results[i][0].transcript;
      else interim += e.results[i][0].transcript;
    }
    $('#voice-said').textContent = `${finalText}${interim}`.trim();
  };
  rec.onerror = (e) => {
    if (e.error === 'not-allowed' || e.error === 'service-not-allowed') toast(t('Bitte erlaube den Zugriff aufs Mikrofon (und auf dem iPhone die Diktierfunktion).', 'Please allow microphone access (and dictation on iPhone).'));
  };
  rec.onend = () => {
    voice.rec = null;
    if (!voice.on) return;
    const text = finalText.trim();
    if (!text) { voice.paused = true; return voicePhase('tap', ''); }
    voiceAsk(text);
  };
  try { rec.start(); voice.rec = rec; voicePhase('listen', ''); } catch { voice.paused = true; voicePhase('tap', ''); }
}
async function voiceAsk(text) {
  voicePhase('think', text);
  if (busy() || offline) { voicePhase('paused'); voice.paused = true; return; }
  el.prompt.value = text;
  try { await send(); } catch { /* Fehler zeigt die Karte */ }
  const chat = state.chat;
  const turn = chat?.turns.at(-1);
  if (!voice.on || !turn) return;
  const answer = turn.answers.find((a) => a.status === 'done' && a.text) ?? turn.answers[0];
  const card = cardEl(chat.turns.length - 1, turn.answers.indexOf(answer));
  const spoken = answer?.text && card ? speakableText(card) : answer?.reaction ? '' : t('Das hat leider nicht geklappt.', 'Sorry, that did not work.');
  if (!spoken) return voiceListen(); // nur ein Emoji als Antwort
  voicePhase('speak', spoken.length > 220 ? `${spoken.slice(0, 220)} …` : spoken);
  const lang = EXTRA_LANGS.includes(LANG) ? LANG : guessLang(spoken);
  const v = pickVoice(lang);
  const prefs = voicePrefs();
  const parts = speechChunks(spoken);
  speechSynthesis.cancel();
  let ended = false;
  const done = () => { if (ended) return; ended = true; if (voice.on && !voice.paused && voice.phase === 'speak') voiceListen(); };
  parts.forEach((part, i) => {
    const u = new SpeechSynthesisUtterance(part);
    u.lang = { de: 'de-DE', en: 'en-US' }[lang] ?? LOCALE;
    if (v) u.voice = v;
    u.rate = prefs.rate;
    u.pitch = prefs.pitch;
    if (i === parts.length - 1) { u.onend = done; u.onerror = done; }
    speechSynthesis.speak(u);
  });
  // Sicherheitsnetz: manche Handys melden das Ende des Vorlesens nicht
  setTimeout(() => { if (!speechSynthesis.speaking) done(); }, Math.max(4000, spoken.length * 90));
}
async function startVoice() {
  if (!canSpeak || !(canRecord || SpeechRec)) return toast(t('Dein Browser kann leider keine Sprache erkennen.', 'Your browser cannot recognize speech.'));
  if (offline) return toast(t('Du bist offline.', 'You are offline.'));
  stopSpeaking();
  recognition?.stop();
  // iPhone: Vorlesen einmal durch den Tipp freischalten
  try { speechSynthesis.speak(new SpeechSynthesisUtterance('')); } catch { /* egal */ }
  voice.on = true;
  voice.paused = false;
  voice.misses = 0;
  voice.mode = canRecord ? 'record' : 'browser';
  voiceEl.hidden = false;
  haptic('tap');
  if (voice.mode === 'record') {
    try {
      voice.listener = new Listener();
      await voice.listener.open();
    } catch {
      voice.listener = null;
      if (SpeechRec) voice.mode = 'browser';
      else { toast(t('Bitte erlaube den Zugriff aufs Mikrofon.', 'Please allow access to the microphone.')); return stopVoice(); }
    }
  }
  voiceListen();
}
function stopVoice() {
  // Zuerst schließen – egal, was danach passiert
  voiceEl.hidden = true;
  voice.on = false;
  voice.paused = false;
  try { voice.rec?.abort(); } catch { /* egal */ }
  voice.rec = null;
  try { voice.listener?.close(); } catch { /* egal */ }
  voice.listener = null;
  try { speechSynthesis.cancel(); } catch { /* egal */ }
  orbLevel(0);
}
function voiceTap() {
  if (!voice.on) return;
  if (voice.phase === 'listen') {
    if (voice.mode === 'record') voice.listener?.stopNow(); else { try { voice.rec?.stop(); } catch { /* egal */ } }
    return;
  }
  if (voice.phase === 'speak') { speechSynthesis.cancel(); voice.paused = false; return voiceListen(); }
  if (voice.phase === 'paused' || voice.phase === 'tap') { voice.paused = false; return voiceListen(); }
}
// pointerup statt click: reagiert auch, wenn das iPhone gerade mit dem Mikrofon beschäftigt ist
const onTap = (sel, fn) => {
  const node = $(sel);
  let handled = 0;
  node.addEventListener('pointerup', (e) => { handled = Date.now(); e.preventDefault(); fn(); });
  node.addEventListener('click', () => { if (Date.now() - handled > 600) fn(); });
};
$('#voice-btn').addEventListener('click', startVoice);
onTap('#voice-close', stopVoice);
onTap('#voice-end', stopVoice);
onTap('#voice-orb', voiceTap);
onTap('#voice-pause', () => {
  if (voice.phase === 'speak') { speechSynthesis.cancel(); return voiceListen(); } // unterbrechen und gleich zuhören
  if (voice.paused) { voice.paused = false; return voiceListen(); }
  voice.paused = true;
  try { voice.listener?.cancel(); voice.rec?.abort(); } catch { /* egal */ }
  voicePhase('paused');
});
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && voice.on) stopVoice(); });

// ── Live-Übersetzer: zwei Leute, zwei Sprachen ────────────────────
const TR_LANGS = [
  ['de-DE', 'Deutsch', '🇩🇪'], ['en-US', 'English', '🇬🇧'], ['tr-TR', 'Türkçe', '🇹🇷'], ['es-ES', 'Español', '🇪🇸'], ['fr-FR', 'Français', '🇫🇷'],
  ['it-IT', 'Italiano', '🇮🇹'], ['pl-PL', 'Polski', '🇵🇱'], ['ru-RU', 'Русский', '🇷🇺'], ['uk-UA', 'Українська', '🇺🇦'], ['ar-SA', 'العربية', '🇸🇦'],
  ['nl-NL', 'Nederlands', '🇳🇱'], ['pt-PT', 'Português', '🇵🇹'], ['el-GR', 'Ελληνικά', '🇬🇷'], ['hr-HR', 'Hrvatski', '🇭🇷'], ['ro-RO', 'Română', '🇷🇴'],
  ['zh-CN', '中文', '🇨🇳'], ['ja-JP', '日本語', '🇯🇵'], ['ko-KR', '한국어', '🇰🇷'], ['hi-IN', 'हिन्दी', '🇮🇳'], ['fa-IR', 'فارسی', '🇮🇷'],
];
const trEl = $('#tr');
const tr = { rec: null, busy: false };
const trLang = (code) => TR_LANGS.find((l) => l[0] === code) ?? TR_LANGS[0];
function trPaint() {
  const [a, b] = [$('#tr-a').value, $('#tr-b').value];
  store.set('vais.tr', { a, b });
  [['#tr-mic-a', a], ['#tr-mic-b', b]].forEach(([sel, code]) => {
    const [, name, flag] = trLang(code);
    $(`${sel} .tr-flag`).textContent = flag;
    $(`${sel} b`).textContent = name;
    $(sel).hidden = !(canRecord || SpeechRec);
  });
}
function openTranslator() {
  closeDrawer();
  const saved = store.get('vais.tr', { a: LOCALE, b: LANG === 'en' ? 'de-DE' : 'en-US' });
  for (const sel of ['#tr-a', '#tr-b']) {
    $(sel).innerHTML = TR_LANGS.map(([code, name, flag]) => `<option value="${code}">${flag} ${name}</option>`).join('');
  }
  $('#tr-a').value = saved.a;
  $('#tr-b').value = saved.b;
  trPaint();
  if (!$('#tr-log').children.length) $('#tr-log').innerHTML = `<li class="tr-hint">${canRecord || SpeechRec ? t('Tippe auf deine Sprache und sprich. VAIs übersetzt und liest die Übersetzung laut vor – dann ist die andere Person dran.', 'Tap your language and speak. VAIs translates and reads the translation aloud – then it is the other person’s turn.') : t('Tippe deinen Satz unten ein – VAIs übersetzt ihn.', 'Type your sentence below – VAIs translates it.')}</li>`;
  trEl.hidden = false;
}
function closeTranslator() {
  try { tr.rec?.abort(); } catch { /* egal */ }
  tr.rec = null;
  try { tr.listener?.close(); } catch { /* egal */ }
  tr.listener = null;
  if (canSpeak) speechSynthesis.cancel();
  document.querySelectorAll('.tr-mic.live').forEach((b) => b.classList.remove('live'));
  trEl.hidden = true;
}
async function trTranslate(text, fromCode, toCode, side) {
  if (!text.trim()) return;
  $('#tr-log .tr-hint')?.remove();
  const item = document.createElement('li');
  item.className = `tr-item ${side}`;
  item.innerHTML = '<p class="tr-orig"></p><p class="tr-out"><span class="gen-dots"></span></p>';
  item.querySelector('.tr-orig').textContent = `${trLang(fromCode)[2]} ${text}`;
  $('#tr-log').append(item);
  item.scrollIntoView({ behavior: 'smooth', block: 'end' });
  tr.busy = true;
  try {
    const data = await post('/api/chat/translate', { text, from: trLang(fromCode)[1], to: trLang(toCode)[1] });
    const out = item.querySelector('.tr-out');
    out.textContent = `${trLang(toCode)[2]} ${data.text}`;
    out.dir = /^(ar|fa)/.test(toCode) ? 'rtl' : 'auto';
    item.scrollIntoView({ behavior: 'smooth', block: 'end' });
    if (canSpeak) {
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(data.text);
      u.lang = toCode;
      const v = speechSynthesis.getVoices().find((x) => x.lang?.replace('_', '-').toLowerCase() === toCode.toLowerCase())
        ?? speechSynthesis.getVoices().find((x) => x.lang?.toLowerCase().startsWith(toCode.slice(0, 2)));
      if (v) u.voice = v;
      u.rate = voicePrefs().rate;
      speechSynthesis.speak(u);
    }
    haptic('tap');
  } catch (err) {
    item.querySelector('.tr-out').textContent = err.message;
    item.classList.add('error');
  } finally { tr.busy = false; }
}
async function trListen(btn, fromCode, toCode, side) {
  if (tr.rec) { try { tr.rec.stop(); } catch { /* egal */ } return; }
  if (tr.listener?.recording) return tr.listener.stopNow(); // zweiter Tipp = fertig gesprochen
  if (tr.busy) return;
  if (canSpeak) speechSynthesis.cancel();
  if (canRecord && !tr.browserOnly) {
    const small = btn.querySelector('small');
    try {
      if (!tr.listener) { tr.listener = new Listener(); await tr.listener.open(); }
    } catch {
      tr.listener = null;
      if (!SpeechRec) return toast(t('Bitte erlaube den Zugriff aufs Mikrofon.', 'Please allow access to the microphone.'));
      tr.browserOnly = true;
      return trListen(btn, fromCode, toCode, side);
    }
    btn.classList.add('live');
    small.textContent = t('hört zu … (nochmal tippen = fertig)', 'listening … (tap again = done)');
    haptic('tap');
    const blob = await tr.listener.record({ silenceMs: 1500, onLevel: (l) => btn.style.setProperty('--lvl', String(l)) });
    btn.classList.remove('live');
    btn.style.removeProperty('--lvl');
    if (!blob) { small.textContent = t('tippen & sprechen', 'tap and speak'); return; }
    small.textContent = t('erkennt …', 'recognising …');
    try {
      const text = await toText(blob, fromCode);
      small.textContent = t('tippen & sprechen', 'tap and speak');
      if (text) trTranslate(text, fromCode, toCode, side);
    } catch (err) {
      small.textContent = t('tippen & sprechen', 'tap and speak');
      if (err.unsupported && SpeechRec) { tr.browserOnly = true; toast(t('Tippe nochmal und sprich.', 'Tap again and speak.')); } else toast(err.message);
    }
    return;
  }
  if (!SpeechRec) return;
  const rec = new SpeechRec();
  rec.lang = fromCode;
  rec.interimResults = true;
  rec.continuous = false;
  let finalText = '';
  rec.onresult = (e) => {
    let interim = '';
    for (let i = e.resultIndex; i < e.results.length; i++) {
      if (e.results[i].isFinal) finalText += e.results[i][0].transcript;
      else interim += e.results[i][0].transcript;
    }
    btn.querySelector('small').textContent = `${finalText}${interim}`.slice(-60) || t('hört zu …', 'listening …');
  };
  rec.onerror = (e) => { if (e.error === 'not-allowed') toast(t('Bitte erlaube den Zugriff aufs Mikrofon.', 'Please allow access to the microphone.')); };
  rec.onend = () => {
    tr.rec = null;
    btn.classList.remove('live');
    btn.querySelector('small').textContent = t('tippen & sprechen', 'tap and speak');
    if (finalText.trim()) trTranslate(finalText.trim(), fromCode, toCode, side);
  };
  try { rec.start(); tr.rec = rec; btn.classList.add('live'); btn.querySelector('small').textContent = t('hört zu …', 'listening …'); haptic('tap'); } catch { tr.rec = null; }
}
$('#d-translate').addEventListener('click', openTranslator);
$('#tr-close').addEventListener('click', closeTranslator);
$('#tr-a').addEventListener('change', trPaint);
$('#tr-b').addEventListener('change', trPaint);
$('#tr-swap').addEventListener('click', () => { const a = $('#tr-a').value; $('#tr-a').value = $('#tr-b').value; $('#tr-b').value = a; trPaint(); });
$('#tr-mic-a').addEventListener('click', (e) => trListen(e.currentTarget, $('#tr-a').value, $('#tr-b').value, 'a'));
$('#tr-mic-b').addEventListener('click', (e) => trListen(e.currentTarget, $('#tr-b').value, $('#tr-a').value, 'b'));
$('#tr-type').addEventListener('submit', (e) => {
  e.preventDefault();
  const text = $('#tr-input').value.trim();
  if (!text || tr.busy) return;
  $('#tr-input').value = '';
  trTranslate(text, $('#tr-a').value, $('#tr-b').value, 'a');
});
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !trEl.hidden) closeTranslator(); });

// ── Webseiten (Code-Modus) ────────────────────────────────────────
const codeChat = () => state.chat?.modality === 'code';

// Letzte HTML-Webseite in einer Antwort finden – auch während sie noch geschrieben wird
function websitePart(text = '') {
  const fence = /^[ \t]*```([\w-]*)[^\n]*$/gm;
  const isHtml = (lang, code) => lang === 'html' || lang === 'htm' || (!lang && /^\s*<(!doctype|html)/i.test(code));
  let open = null;
  let found = null;
  let m;
  while ((m = fence.exec(text))) {
    if (!open) {
      open = { lang: m[1].toLowerCase(), start: m.index, codeStart: m.index + m[0].length + 1 };
    } else {
      const code = text.slice(open.codeStart, m.index);
      if (isHtml(open.lang, code)) found = { ...open, code, end: m.index + m[0].length, done: true };
      open = null;
    }
  }
  if (open) {
    const code = text.slice(open.codeStart);
    if (isHtml(open.lang, code)) found = { ...open, code, end: text.length, done: false };
  }
  if (!found) return null;
  // Nur ganze Seiten zeigen wir als Webseite; kleine Schnipsel nur im Code-Modus
  if (!codeChat() && !/<(!doctype|html|body)/i.test(found.code)) return null;
  return { before: text.slice(0, found.start), code: found.code, after: text.slice(found.end), done: found.done };
}
const htmlBlock = (text) => { const p = websitePart(text); return p?.done ? p.code : null; };

const BRICKS = '<span class="bricks"><i></i><i></i><i></i><i></i><i></i><i></i></span>';

// „Baut …“-Karte oben in der Antwort
function renderBuild(card, a, part) {
  let box = $('.build', card);
  const show = part || (codeChat() && a.status === 'streaming');
  if (!show || (a.status !== 'streaming' && !part?.done)) { box?.remove(); return; }
  if (!box) {
    box = document.createElement('button');
    box.type = 'button';
    box.className = 'build';
    box.dataset.act = 'preview';
    $('.card-head', card).after(box);
  }
  const ready = part?.done;
  box.classList.toggle('ready', !!ready);
  const secs = a.buildMs ? ` · ${(a.buildMs / 1000).toFixed(1)} s` : '';
  box.innerHTML = `
    <span class="build-icon">${ready ? ICON['m-code'] : BRICKS.replace('bricks', 'bricks live')}</span>
    <span class="build-text"><b>${ready ? t('Webseite fertig', 'Website ready') : t('Baut …', 'Building …')}</b><small>${ready ? `${t('Tippe, um sie anzusehen', 'Tap to view it')}${secs}` : t('Vorschau bald verfügbar', 'Preview available soon')}</small></span>
    ${ready ? ICON.preview : ''}`;
}

// Laufende Zeit („Baut … 12.3 s“)
function tickTimers() {
  const now = Date.now();
  document.querySelectorAll('[data-since]').forEach((t) => {
    t.textContent = `(${((now - Number(t.dataset.since)) / 1000).toFixed(1)} s)`;
  });
}
setInterval(tickTimers, 100);

// Vorschau-Fenster: 👁 Webseite oder </> Code, Neu laden, Herunterladen
const pv = { turn: null, side: null, tab: 'view', shown: null, code: null };

function previewAnswer() {
  return state.chat?.turns[pv.turn]?.answers[pv.side] ?? null;
}

function openPreview(turnIndex, side, tab = 'view') {
  Object.assign(pv, { turn: turnIndex, side, tab, shown: null, code: null });
  $('#preview').hidden = false;
  refreshPreview();
  $(`[data-ptab="${tab}"]`).focus();
}

// Webseite in der abgeschirmten Vorschau-Seite anzeigen (eigene Sicherheitsregeln, kein Zugriff auf VAIs)
let frameHtml = null;
window.addEventListener('message', (e) => {
  const frame = $('#preview-frame');
  if (e.source === frame.contentWindow && e.data?.type === 'vais-sandbox-ready' && frameHtml !== null) {
    frame.contentWindow.postMessage({ type: 'vais-render', html: frameHtml }, '*');
  }
});
function showInFrame(html) {
  frameHtml = html;
  $('#preview-frame').src = `/sandbox.html?v=${Date.now()}`;
}
function clearFrame() {
  frameHtml = null;
  $('#preview-frame').removeAttribute('src');
}

function closePreview() {
  $('#preview').hidden = true;
  clearFrame();
  Object.assign(pv, { turn: null, side: null, shown: null, code: null });
}

function refreshPreview() {
  if ($('#preview').hidden) return;
  const a = previewAnswer();
  if (!a) return closePreview();
  const part = websitePart(a.text);
  const ready = !!part?.done;
  document.querySelectorAll('[data-ptab]').forEach((t) => t.setAttribute('aria-selected', String(t.dataset.ptab === pv.tab)));

  const frame = $('#preview-frame');
  const build = $('#preview-build');
  const codeBox = $('#preview-code');
  frame.hidden = pv.tab !== 'view' || !ready;
  build.hidden = pv.tab !== 'view' || ready;
  codeBox.hidden = pv.tab !== 'code';
  $('#preview-download').disabled = !part?.code;

  if (pv.tab === 'view' && ready && pv.shown !== part.code) {
    showInFrame(part.code);
    pv.shown = part.code;
  }
  if (!ready) {
    const working = a.status === 'streaming';
    $('#preview-build-title').textContent = working ? t('Baut …', 'Building …') : t('Keine Webseite', 'No website');
    $('#preview-build-text').textContent = working
      ? t('Die Vorschau erscheint, sobald die Webseite fertig ist.', 'The preview appears as soon as the website is ready.')
      : t('In dieser Antwort wurde keine vollständige Webseite gefunden.', 'No complete website was found in this answer.');
    $('.bricks', build).classList.toggle('live', working);
  }
  if (pv.tab === 'code') {
    const code = part?.code ?? '';
    if (pv.code !== code) {
      const pre = $('pre', codeBox);
      const stick = pre.scrollHeight - pre.scrollTop - pre.clientHeight < 60;
      $('code', codeBox).innerHTML = code.split('\n').map((l) => `<span>${escapeHtml(l)}</span>`).join('');
      pv.code = code;
      if (a.status === 'streaming' && stick) pre.scrollTop = pre.scrollHeight;
    }
  }
}

$('#preview').addEventListener('click', (e) => {
  if (e.target.closest('[data-close]')) return closePreview();
  const tab = e.target.closest('[data-ptab]');
  if (tab) { pv.tab = tab.dataset.ptab; pv.code = null; refreshPreview(); }
});
$('#preview-reload').addEventListener('click', () => {
  if (pv.tab !== 'view' || !pv.shown) return;
  showInFrame(pv.shown);
});
$('#preview-download').addEventListener('click', () => {
  const part = websitePart(previewAnswer()?.text ?? '');
  if (!part?.code) return;
  const url = URL.createObjectURL(new Blob([part.code], { type: 'text/html' }));
  const link = Object.assign(document.createElement('a'), { href: url, download: 'index.html' });
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
});

$('#expand').addEventListener('click', (e) => { if (e.target.closest('[data-close]')) $('#expand').hidden = true; });

// ── Anhänge (+) ───────────────────────────────────────────────────
const MAX_ATTACHMENTS = 4;
const MAX_FILE_BYTES = 200_000;
let pendingReads = 0;

// Bilder verkleinern (max. 1280 px, JPEG), damit sie schnell hochgeladen sind
async function shrinkImage(file) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1280 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close?.();
  return canvas.toDataURL('image/jpeg', 0.82);
}

// Text aus PDFs lesen (pdf.js wird erst bei Bedarf geladen)
const MAX_PDF_CHARS = 60_000;
async function pdfText(file) {
  const pdfjs = await import('/vendor/pdf.mjs');
  pdfjs.GlobalWorkerOptions.workerSrc = '/vendor/pdf.worker.mjs';
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  let text = '';
  let cut = 0;
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    text += `${content.items.map((it) => `${it.str}${it.hasEOL ? '\n' : ' '}`).join('')}\n\n`;
    if (text.length > MAX_PDF_CHARS) { cut = i; break; }
  }
  return { text: text.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim().slice(0, MAX_PDF_CHARS), pages: doc.numPages, cut: cut && cut < doc.numPages ? cut : 0 };
}

async function addFiles(fileList) {
  for (const file of [...fileList]) {
    if (state.pending.length + pendingReads >= MAX_ATTACHMENTS) { toast(t(`Höchstens ${MAX_ATTACHMENTS} Anhänge pro Nachricht.`, `At most ${MAX_ATTACHMENTS} attachments per message.`)); break; }
    pendingReads++;
    try {
      if (file.type.startsWith('image/')) {
        state.pending.push({ kind: 'image', name: file.name || t('Bild', 'Image'), url: await shrinkImage(file) });
      } else if (file.type === 'application/pdf' || /\.pdf$/i.test(file.name)) {
        if (file.size > 15_000_000) { toast(t(`„${file.name}“ ist zu groß (max. 15 MB).`, `“${file.name}” is too large (max. 15 MB).`)); continue; }
        toast(t(`PDF wird gelesen …`, `Reading PDF …`));
        const { text, pages, cut } = await pdfText(file);
        if (!text.trim()) toast(t(`„${file.name}“ enthält keinen lesbaren Text (z. B. eingescannt).`, `“${file.name}” contains no readable text (e.g. scanned).`));
        else {
          state.pending.push({ kind: 'file', name: file.name, text });
          if (cut) toast(t(`Nur die ersten ${cut} von ${pages} Seiten passen in die Nachricht.`, `Only the first ${cut} of ${pages} pages fit into the message.`));
        }
      } else if (/zip|octet-stream|word|excel|powerpoint|audio|video/.test(file.type)) {
        toast(t(`„${file.name}“: Nur Bilder und Textdateien werden unterstützt.`, `“${file.name}”: only images and text files are supported.`));
      } else if (file.size > MAX_FILE_BYTES) {
        toast(t(`„${file.name}“ ist zu groß (max. 200 KB).`, `“${file.name}” is too large (max. 200 KB).`));
      } else {
        const text = await file.text();
        if (/\u0000/.test(text.slice(0, 2000))) toast(t(`„${file.name}“ ist keine Textdatei.`, `“${file.name}” is not a text file.`));
        else state.pending.push({ kind: 'file', name: file.name, text });
      }
    } catch {
      toast(t(`„${file.name}“ konnte nicht gelesen werden.`, `“${file.name}” could not be read.`));
    } finally {
      pendingReads--;
      renderTray();
      updateSend();
    }
  }
}

function renderTray() {
  const tray = $('#tray');
  tray.hidden = !state.pending.length;
  tray.innerHTML = '';
  state.pending.forEach((a, i) => {
    const item = document.createElement('div');
    item.className = `tray-item ${a.kind}`;
    if (a.kind === 'image') item.append(Object.assign(document.createElement('img'), { src: a.url, alt: '' }));
    else {
      item.innerHTML = ICON['s-read'];
      item.append(Object.assign(document.createElement('span'), { textContent: a.name }));
    }
    const del = Object.assign(document.createElement('button'), { type: 'button', className: 'tray-del', ariaLabel: `${a.name} ${t('entfernen', 'remove')}` });
    del.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M7 7l10 10M17 7 7 17"/></svg>';
    del.addEventListener('click', () => { state.pending.splice(i, 1); renderTray(); updateSend(); });
    item.append(del);
    tray.append(item);
  });
}

// „+“: auf dem Handy Auswahl zwischen Kamera und Datei, am Computer direkt die Datei
const attachMenu = $('#attach-menu');
$('#attach-btn').addEventListener('click', (e) => {
  e.stopPropagation();
  if (!matchMedia('(pointer: coarse)').matches) return $('#attach-input').click();
  attachMenu.hidden = !attachMenu.hidden;
  if (!attachMenu.hidden) {
    // Das Eingabefeld schneidet überstehende Teile ab → Menü frei über dem Knopf platzieren
    const r = e.currentTarget.getBoundingClientRect();
    attachMenu.style.left = `${Math.max(8, r.left)}px`;
    attachMenu.style.bottom = `${window.innerHeight - r.top + 8}px`;
  }
});
attachMenu.addEventListener('click', (e) => {
  const opt = e.target.closest('[data-attach]');
  if (!opt) return;
  attachMenu.hidden = true;
  $(opt.dataset.attach === 'camera' ? '#camera-input' : '#attach-input').click();
});
document.addEventListener('click', (e) => { if (!attachMenu.hidden && !attachMenu.contains(e.target)) attachMenu.hidden = true; });
$('#camera-input').addEventListener('change', (e) => { addFiles(e.target.files); e.target.value = ''; el.prompt.focus(); });
$('#attach-input').addEventListener('change', (e) => { addFiles(e.target.files); e.target.value = ''; el.prompt.focus(); });
// Bilder einfügen (Strg+V) und per Drag & Drop
el.prompt.addEventListener('paste', (e) => {
  const files = [...(e.clipboardData?.files ?? [])];
  if (files.length) { e.preventDefault(); addFiles(files); }
});
el.form.addEventListener('dragover', (e) => { e.preventDefault(); el.form.classList.add('drop'); });
el.form.addEventListener('dragleave', () => el.form.classList.remove('drop'));
el.form.addEventListener('drop', (e) => { e.preventDefault(); el.form.classList.remove('drop'); addFiles(e.dataTransfer.files); });

// ── Eingabefeld ───────────────────────────────────────────────────
function autosize() {
  el.prompt.style.height = 'auto';
  el.prompt.style.height = `${Math.min(el.prompt.scrollHeight, 200)}px`;
  updateSend();
}

function updateSend() {
  const isBusy = busy();
  const hasText = !!el.prompt.value.trim() || state.pending.length > 0;
  // Während die KI antwortet: mit Text → vormerken, ohne Text → stoppen
  const stop = isBusy && !hasText;
  el.send.classList.toggle('stop', stop);
  el.send.classList.toggle('ready', hasText);
  el.send.innerHTML = stop ? ICON.stop : ICON.send;
  el.send.setAttribute('aria-label', stop ? t('Stoppen', 'Stop') : isBusy ? t('Vormerken', 'Queue') : t('Senden', 'Send'));
  $('#improve-btn').hidden = el.prompt.value.trim().length < 3 || improving;
}

el.prompt.addEventListener('input', autosize);
el.prompt.addEventListener('keydown', (e) => {
  const touch = matchMedia('(pointer: coarse)').matches;
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && !touch) {
    e.preventDefault();
    el.form.requestSubmit();
  }
});
el.form.addEventListener('submit', (e) => {
  e.preventDefault();
  if (busy() && (el.prompt.value.trim() || state.pending.length)) return queueMessage();
  if (busy()) {
    // Agent X läuft auf dem Server weiter, wenn nur die Verbindung abbricht – „Stopp“ muss es ihm sagen
    const chat = state.chat;
    const ti = chat ? chat.turns.length - 1 : -1;
    chat?.turns[ti]?.answers.forEach((a, side) => { if (a.status === 'streaming') post('/api/chat/stop', { chatId: chat.id, turn: ti, side }).catch(() => {}); });
    for (const c of state.controllers) c.abort();
    return;
  }
  send();
});

// ── Menüs schließen ───────────────────────────────────────────────
document.addEventListener('click', (e) => {
  if (!el.modeMenu.hidden && !el.modeMenu.contains(e.target)) toggleModeMenu(false);
  if (!el.modalityMenu.hidden && !el.modalityMenu.contains(e.target)) toggleModalityMenu(false);
  if (!$('#account-menu').hidden && !$('.account').contains(e.target)) toggleAccount(false);
});
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  if (!$('#share-sheet').hidden) closeShare();
  else if (!$('#settings').hidden) closeSettings();
  else if (!$('#preview').hidden) closePreview();
  else if (!el.modalityMenu.hidden) { toggleModalityMenu(false); el.modalityBtn.focus(); }
  else if (!el.drawer.hidden) closeDrawer();
  else if (!$('#expand').hidden) $('#expand').hidden = true;
  else if (!el.sheet.hidden) closeSheet();
  else if (!el.modeMenu.hidden) { toggleModeMenu(false); el.modeBtn.focus(); }
  else toggleAccount(false);
});

// ── Konto ─────────────────────────────────────────────────────────
const avatar = $('#avatar');
function toggleAccount(open) {
  $('#account-menu').hidden = !open;
  avatar.setAttribute('aria-expanded', String(open));
}
avatar.addEventListener('click', (e) => { e.stopPropagation(); toggleAccount($('#account-menu').hidden); });
$('#logout').addEventListener('click', async () => {
  await forgetOffline();
  try {
    const sub = await currentSub();
    if (sub) { await post('/api/chat/push/unsubscribe', { endpoint: sub.endpoint }).catch(() => {}); await sub.unsubscribe(); }
  } catch { /* egal */ }
  await fetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
  location.replace('/login');
});

// Handy-Tastatur: Höhe an den sichtbaren Bereich anpassen, damit das Eingabefeld sichtbar bleibt
if (window.visualViewport) {
  const fit = () => { $('.shell').style.height = `${window.visualViewport.height}px`; };
  window.visualViewport.addEventListener('resize', fit);
  fit();
}

// ── Navigation (#c/<id> = Chat, #bestenliste = Bestenliste) ───────
function go(hash) {
  if (location.hash !== hash) history.pushState(null, '', hash || location.pathname);
  route();
}

async function route() {
  const h = location.hash;
  if (h.startsWith('#g/')) return; // Team-Chat (öffnet sich als eigenes Fenster)
  if (h === '#bestenliste') return showBoard();
  if (h === '#statistik') return showStats();
  if (h.startsWith('#c/')) {
    const id = decodeURIComponent(h.slice(3));
    if (state.chat?.id === id) return showView('thread');
    return loadChat(id);
  }
  if (state.chat) resetChat();
  showView('home');
}
window.addEventListener('popstate', route);

async function loadChat(id) {
  if (state.chat?.id !== id) forgetIncognito(state.chat);
  for (const c of state.controllers) c.abort();
  let data;
  const cached = offlineData()?.chats?.[id];
  try {
    if (offline) throw new TypeError('offline');
    const res = await fetch(`/api/chat/${encodeURIComponent(id)}`);
    if (res.status === 401) return location.replace('/login');
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || t('Chat nicht gefunden.', 'Chat not found.'));
    data = await res.json();
    rememberChat(data);
  } catch (err) {
    if (err instanceof TypeError && cached) {
      data = cached; // kein Internet: gespeicherte Fassung zeigen
      if (!offline) setOffline(true);
    } else {
      toast(err instanceof TypeError ? t('Dieser Chat ist offline nicht gespeichert.', 'This chat is not saved offline.') : err.message);
      return go('');
    }
  }
  state.chat = {
    id: data.id,
    mode: data.mode,
    labels: data.labels,
    names: data.mode === 'battle' && data.winner ? data.labels : null,
    winner: data.winner,
    modality: data.modality,
    shared: data.shared,
    incognito: data.incognito,
    turns: data.turns,
  };
  state.mode = data.mode;
  if (MODALITIES[data.modality] && !MODALITIES[data.modality].soon) state.modality = data.modality;
  if (data.models?.every((m) => modelById(m))) data.models.forEach((m, i) => { state.picks[i] = m; });
  el.thread.innerHTML = '';
  el.vote.hidden = true;
  el.voteResult.hidden = true;
  state.chat.turns.forEach((_, i) => renderTurn(i));
  renderQueue();
  el.title.textContent = data.title.length > 40 ? `${data.title.slice(0, 40)}…` : data.title;
  showView('thread');
  renderControls();
  updateSend();
  afterTurn();
  requestAnimationFrame(() => { el.stage.scrollTop = el.stage.scrollHeight; });
  if (!data.shared && data.turns.some((tn) => tn.answers.some((a) => a.status === 'streaming'))) watchBackground(data.id);
}

// Agent X arbeitet im Hintergrund: alle paar Sekunden nachsehen, bis er fertig ist
let bgTimer = null;
function watchBackground(id) {
  clearTimeout(bgTimer);
  const note = () => {
    const card = el.thread.querySelector('.turn:last-child .card');
    if (card && !$('.bg-note', card)) {
      const p = document.createElement('p');
      p.className = 'bg-note';
      p.textContent = t('Agent X arbeitet im Hintergrund weiter. Du kannst die App schließen – mit eingeschalteten Erinnerungen bekommst du eine Benachrichtigung, wenn er fertig ist.', 'Agent X keeps working in the background. You can close the app – with notifications on, you will be notified when he is done.');
      $('.card-body', card).before(p);
    }
  };
  note();
  bgTimer = setTimeout(async () => {
    if (state.chat?.id !== id) return;
    if (document.hidden) return watchBackground(id);
    try {
      const res = await fetch(`/api/chat/${encodeURIComponent(id)}`);
      if (!res.ok) return;
      const data = await res.json();
      const still = data.turns.some((tn) => tn.answers.some((a) => a.status === 'streaming'));
      if (still) return watchBackground(id);
      if (state.chat?.id === id && !busy()) { state.chat = null; loadChat(id); haptic('success'); }
    } catch { watchBackground(id); }
  }, 4000);
}
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && state.chat && state.chat.turns.some((tn) => tn.answers.some((a) => a.background))) watchBackground(state.chat.id);
});

// ── Seitenleiste mit Verlauf ──────────────────────────────────────
let historyDirty = true;
let historyItems = [];

function groupLabel(ts) {
  const day = 24 * 3600 * 1000;
  const start = new Date(); start.setHours(0, 0, 0, 0);
  const t0 = start.getTime();
  if (ts >= t0) return t('Heute', 'Today');
  if (ts >= t0 - day) return t('Gestern', 'Yesterday');
  if (ts >= t0 - 7 * day) return t('Letzte 7 Tage', 'Previous 7 days');
  if (ts >= t0 - 30 * day) return t('Letzte 30 Tage', 'Previous 30 days');
  return t('Älter', 'Older');
}

const openFolders = new Set(store.get('vais.folders.open', []));
function chatRow(c) {
  const active = state.chat?.id === c.id ? ' active' : '';
  return `<div class="drawer-chat${active}" data-row="${escapeHtml(c.id)}">
      <button class="drawer-chat-open" data-open="${escapeHtml(c.id)}">${c.pinned ? ICON.pin : ICON[c.mode] ?? ''}<span data-title="${escapeHtml(c.id)}"></span></button>
      <button class="drawer-chat-more" data-more="${escapeHtml(c.id)}" aria-label="${t('Mehr', 'More')}" title="${t('Mehr', 'More')}" aria-haspopup="menu">${ICON.more}</button>
    </div>`;
}
function renderHistory() {
  // Ein offenes Menü bleibt offen, solange es den Chat noch gibt (die Liste lädt manchmal im Hintergrund neu)
  if (chatMenu && !historyItems.some((c) => c.id === chatMenu.dataset.for)) closeChatMenu();
  const q = el.dSearch.value.trim().toLowerCase();
  const items = historyItems.filter((c) => !q || c.title.toLowerCase().includes(q) || (c.folder ?? '').toLowerCase().includes(q));
  if (!items.length) {
    el.dList.innerHTML = `<p class="drawer-empty">${q ? t('Nichts gefunden.', 'Nothing found.') : t('Noch keine Chats.', 'No chats yet.')}</p>`;
    return;
  }
  let html = '';
  // Angeheftet ganz oben, dann Ordner, dann der Rest nach Datum (bei der Suche alles nach Datum)
  const pinned = q ? [] : items.filter((c) => c.pinned);
  if (pinned.length) html += `<p class="drawer-group">${t('Angeheftet', 'Pinned')}</p>${pinned.map(chatRow).join('')}`;
  const rest = items.filter((c) => q || !c.pinned);
  const folders = q ? [] : [...new Set(rest.map((c) => c.folder).filter(Boolean))].sort((x, y) => x.localeCompare(y));
  if (folders.length) {
    html += `<p class="drawer-group">${t('Ordner', 'Folders')}</p>`;
    for (const f of folders) {
      const inside = rest.filter((c) => c.folder === f);
      const open = openFolders.has(f);
      html += `<div class="drawer-folder${open ? ' open' : ''}">
        <button class="drawer-folder-head" data-folder="${escapeHtml(f)}" aria-expanded="${open}">${ICON.folder}<span></span><small>${inside.length}</small>${ICON.chev}</button>
        <div class="drawer-folder-body"${open ? '' : ' hidden'}>${inside.map(chatRow).join('')}</div>
      </div>`;
    }
  }
  let last = '';
  for (const c of rest.filter((x) => q || !x.folder)) {
    const g = groupLabel(c.updated);
    if (g !== last) { html += `<p class="drawer-group">${g}</p>`; last = g; }
    html += chatRow(c);
  }
  el.dList.innerHTML = html;
  // Titel und Ordnernamen sicher als Text einsetzen
  el.dList.querySelectorAll('[data-title]').forEach((span) => { span.textContent = historyItems.find((c) => c.id === span.dataset.title)?.title ?? ''; });
  el.dList.querySelectorAll('[data-folder] span').forEach((span) => { span.textContent = span.parentElement.dataset.folder; });
}

// Menü „⋯“ an einem Chat: anheften, Ordner, umbenennen, löschen
let chatMenu = null;
function closeChatMenu() { chatMenu?.remove(); chatMenu = null; }
function openChatMenu(id, btn) {
  closeChatMenu();
  const item = historyItems.find((c) => c.id === id);
  if (!item) return;
  const menu = document.createElement('div');
  menu.className = 'chat-menu';
  menu.setAttribute('role', 'menu');
  const folders = [...new Set(historyItems.map((c) => c.folder).filter(Boolean))].sort((x, y) => x.localeCompare(y));
  const main = () => {
    menu.innerHTML = `
      <button role="menuitem" data-cm="pin">${ICON.pin}<span>${item.pinned ? t('Lösen', 'Unpin') : t('Anheften', 'Pin')}</span></button>
      <button role="menuitem" data-cm="folder">${ICON.folder}<span>${item.folder ? t('Ordner ändern', 'Change folder') : t('In Ordner verschieben', 'Move to folder')}</span></button>
      <button role="menuitem" data-cm="rename">${ICON.rename}<span>${t('Umbenennen', 'Rename')}</span></button>
      <button role="menuitem" data-cm="delete" class="danger"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg><span>${t('Löschen', 'Delete')}</span></button>`;
  };
  const folderStep = () => {
    menu.innerHTML = `
      <p class="chat-menu-title">${t('Ordner wählen', 'Choose folder')}</p>
      ${folders.map((f, i) => `<button role="menuitem" data-cm-folder="${i}"${f === item.folder ? ' aria-current="true"' : ''}>${ICON.folder}<span></span>${f === item.folder ? ICON.check : ''}</button>`).join('')}
      ${item.folder ? `<button role="menuitem" data-cm="nofolder">${ICON.close}<span>${t('Aus dem Ordner nehmen', 'Remove from folder')}</span></button>` : ''}
      <form class="chat-menu-new"><input class="input" maxlength="40" placeholder="${t('Neuer Ordner …', 'New folder …')}" aria-label="${t('Neuer Ordner', 'New folder')}"><button type="submit">${t('OK', 'OK')}</button></form>`;
    menu.querySelectorAll('[data-cm-folder] span').forEach((sp, i) => { sp.textContent = folders[i]; });
    menu.querySelector('.chat-menu-new').addEventListener('submit', (e) => {
      e.preventDefault();
      const name = e.currentTarget.querySelector('input').value.replace(/\s+/g, ' ').trim();
      if (name) setFolder(name);
    });
    if (!folders.length) menu.querySelector('.chat-menu-new input').focus();
  };
  const organize = async (patch) => {
    try {
      await post('/api/chat/organize', { chatId: id, ...patch });
      Object.assign(item, patch);
      if (patch.folder) { openFolders.add(patch.folder); store.set('vais.folders.open', [...openFolders]); }
      closeChatMenu();
      renderHistory();
    } catch (err) { toast(err.message); }
  };
  const setFolder = (name) => organize({ folder: name });
  menu.addEventListener('click', async (e) => {
    e.stopPropagation();
    const f = e.target.closest('[data-cm-folder]');
    if (f) return setFolder(folders[Number(f.dataset.cmFolder)]);
    const act = e.target.closest('[data-cm]')?.dataset.cm;
    if (act === 'pin') return organize({ pinned: !item.pinned });
    if (act === 'folder') return folderStep();
    if (act === 'nofolder') return organize({ folder: null });
    if (act === 'rename') { closeChatMenu(); return startRename(id, el.dList.querySelector(`[data-row="${CSS.escape(id)}"]`)); }
    if (act === 'delete') {
      closeChatMenu();
      if (!confirm(t('Diesen Chat löschen?', 'Delete this chat?'))) return;
      const res = await fetch(`/api/chat/${encodeURIComponent(id)}`, { method: 'DELETE' });
      if (!res.ok) return toast(t('Löschen fehlgeschlagen.', 'Deleting failed.'));
      historyItems = historyItems.filter((c) => c.id !== id);
      closeChatMenu();
      renderHistory();
      if (state.chat?.id === id) go('');
      toast(t('Chat gelöscht', 'Chat deleted'));
    }
  });
  main();
  const panel = btn.closest('.drawer-panel') ?? el.drawer;
  panel.append(menu);
  const r = btn.getBoundingClientRect();
  const pr = panel.getBoundingClientRect();
  menu.style.right = `${Math.max(8, pr.right - r.right)}px`;
  const below = r.bottom - pr.top + 4;
  menu.style.top = `${Math.min(below, pr.height - menu.offsetHeight - 12)}px`;
  menu.dataset.for = id;
  chatMenu = menu;
  menu.querySelector('button')?.focus({ preventScroll: true });
}
document.addEventListener('click', (e) => { if (chatMenu && !chatMenu.contains(e.target) && !e.target.closest('[data-more]')) closeChatMenu(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && chatMenu) { e.stopPropagation(); closeChatMenu(); } }, true);

async function openDrawer() {
  el.drawer.hidden = false;
  $('#open-drawer').setAttribute('aria-expanded', 'true');
  if (historyDirty || !historyItems.length) {
    if (!historyItems.length) el.dList.innerHTML = `<p class="drawer-empty">${t('Lädt …', 'Loading …')}</p>`;
    try {
      if (offline) throw new TypeError('offline');
      const res = await fetch('/api/chat/list');
      historyItems = (await res.json()).chats ?? [];
      historyDirty = false;
      saveOffline({ list: historyItems.slice(0, 200) });
    } catch {
      const saved = offlineData();
      if (saved?.order?.length) {
        // Offline: nur die Chats zeigen, die auf dem Gerät gespeichert sind
        historyItems = saved.order.filter((id) => saved.chats?.[id]).map((id) => {
          const c = saved.chats[id];
          return { ...(saved.list?.find((x) => x.id === id) ?? {}), id, title: c.title, mode: c.mode, updated: c.savedAt ?? saved.savedAt };
        }).sort((a, b) => b.updated - a.updated);
      } else {
        el.dList.innerHTML = `<p class="drawer-empty">${t('Verlauf konnte nicht geladen werden.', 'History could not be loaded.')}</p>`;
        return;
      }
    }
  }
  renderHistory();
}
function closeDrawer() {
  el.drawer.hidden = true;
  $('#open-drawer').setAttribute('aria-expanded', 'false');
}

$('#open-drawer').addEventListener('click', openDrawer);
el.dSearch.addEventListener('input', renderHistory);
$('#d-new').addEventListener('click', () => { closeDrawer(); go(''); el.prompt.focus(); });
$('#d-board').addEventListener('click', () => { closeDrawer(); go('#bestenliste'); });
$('#d-stats').addEventListener('click', () => { closeDrawer(); go('#statistik'); });
el.drawer.addEventListener('click', async (e) => {
  if (e.target.closest('[data-close-drawer]')) return closeDrawer();
  const open = e.target.closest('[data-open]');
  if (open) { closeDrawer(); return go(`#c/${open.dataset.open}`); }
  const more = e.target.closest('[data-more]');
  if (more) {
    if (chatMenu?.dataset.for === more.dataset.more) return closeChatMenu();
    return openChatMenu(more.dataset.more, more);
  }
  const folder = e.target.closest('[data-folder]');
  if (folder) {
    const name = folder.dataset.folder;
    if (openFolders.has(name)) openFolders.delete(name); else openFolders.add(name);
    store.set('vais.folders.open', [...openFolders]);
    renderHistory();
  }
});

// Chat in der Seitenleiste umbenennen
function startRename(id, row) {
  const item = historyItems.find((c) => c.id === id);
  if (!item || !row) return;
  const input = Object.assign(document.createElement('input'), { className: 'drawer-rename', value: item.title, maxLength: 80 });
  input.setAttribute('aria-label', t('Neuer Name', 'New name'));
  row.replaceChildren(input);
  row.classList.add('renaming');
  input.focus();
  input.select();
  let done = false;
  const commit = async (save) => {
    if (done) return;
    done = true;
    const title = input.value.replace(/\s+/g, ' ').trim();
    if (!save || !title || title === item.title) return renderHistory();
    try {
      const data = await post('/api/chat/rename', { chatId: id, title });
      item.title = data.title;
      if (state.chat?.id === id) el.title.textContent = data.title.length > 40 ? `${data.title.slice(0, 40)}…` : data.title;
    } catch (err) {
      toast(err.message);
    }
    renderHistory();
  };
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); commit(true); }
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); commit(false); }
  });
  input.addEventListener('blur', () => commit(true));
}

// ── Bestenliste ───────────────────────────────────────────────────
let boardCat = 'all';
document.querySelectorAll('[data-board]').forEach((tab) => tab.addEventListener('click', () => {
  boardCat = tab.dataset.board;
  showBoard();
}));

async function showBoard() {
  if (state.chat) resetChat();
  showView('board');
  document.querySelectorAll('[data-board]').forEach((tab) => tab.setAttribute('aria-selected', String(tab.dataset.board === boardCat)));
  const list = $('#board-list');
  const sub = $('#board-sub');
  sub.textContent = t('Lädt …', 'Loading …');
  list.innerHTML = '';
  try {
    const res = await fetch(`/api/chat/leaderboard?cat=${encodeURIComponent(boardCat)}`);
    const data = await res.json();
    if (!data.models?.length) {
      sub.textContent = boardCat === 'all'
        ? t('Noch keine Stimmen. Starte ein Battle, stimme ab, und die Modelle landen hier.', 'No votes yet. Start a battle, vote, and the models will show up here.')
        : t('In dieser Kategorie gibt es noch keine Stimmen.', 'There are no votes in this category yet.');
      list.innerHTML = `<li class="board-empty"><button class="btn" id="board-start">${t('Battle starten', 'Start a battle')}</button></li>`;
      $('#board-start').addEventListener('click', () => {
        state.mode = 'battle';
        store.set('vais.mode', 'battle');
        if (boardCat === 'code' || boardCat === 'web') { state.modality = boardCat; store.set('vais.modality', boardCat); }
        go('');
        renderControls();
        el.prompt.focus();
      });
      return;
    }
    const n = data.totalVotes;
    sub.textContent = t(
      `Elo-Wertung aus ${n} ${n === 1 ? 'Stimme' : 'Stimmen'} im Battle-Modus. Siegquote: Siege plus halbe Unentschieden.`,
      `Elo rating from ${n} ${n === 1 ? 'vote' : 'votes'} in battle mode. Win rate: wins plus half of the ties.`,
    );
    list.innerHTML = data.models.map((m, i) => `
      <li class="board-row" title="${t(`${m.wins} Siege · ${m.ties} Unentschieden · ${m.losses} Niederlagen`, `${m.wins} wins · ${m.ties} ties · ${m.losses} losses`)}">
        <span class="b-rank">${i + 1}</span>
        ${modelLogo(m)}
        <span class="b-name"><b></b><small></small><span class="b-bar" aria-hidden="true"><i style="width:${m.winRate}%"></i></span></span>
        <span class="b-score"><b>${m.rating}</b><small>${m.winRate} % · ${m.votes} ${m.votes === 1 ? 'Battle' : 'Battles'}</small></span>
      </li>`).join('');
    list.querySelectorAll('.b-name').forEach((nameEl, i) => {
      nameEl.querySelector('b').textContent = data.models[i].name;
      nameEl.querySelector('small').textContent = data.models[i].maker;
    });
  } catch {
    sub.textContent = t('Die Bestenliste konnte nicht geladen werden.', 'The leaderboard could not be loaded.');
  }
}

// ── Chat teilen ───────────────────────────────────────────────────
const shareSheet = $('#share-sheet');
let shareUrl = '';

function paintShare() {
  const shared = !!state.chat?.shared;
  $('#share-text').textContent = shared
    ? t('Jeder mit diesem Link kann den Chat lesen (ohne Konto). Neue Nachrichten erscheinen dort automatisch.', 'Anyone with this link can read the chat (no account needed). New messages appear there automatically.')
    : t('Erstelle einen Link, mit dem andere diesen Chat lesen können – ohne Konto. Bilder werden mitgeteilt, Dateiinhalte nicht.', 'Create a link so others can read this chat – no account needed. Images are shared, file contents are not.');
  $('#share-link-box').hidden = !shared;
  $('#share-create').hidden = shared;
  $('#share-stop').hidden = !shared;
  $('#share-native').hidden = !shared || !navigator.share;
  $('#share-link').value = shareUrl;
  paintQr('#share-qr', shared ? shareUrl : '');
}
// QR-Code zum Scannen (wird auf dem Server erzeugt)
function paintQr(sel, url) {
  const box = $(sel);
  if (!box) return;
  box.hidden = !url;
  if (url) box.querySelector('img').src = `/qr?url=${encodeURIComponent(url)}`;
}

async function openShare() {
  if (!state.chat) return;
  shareUrl = '';
  if (state.chat.shared) {
    try {
      const data = await post('/api/chat/share', { chatId: state.chat.id });
      shareUrl = location.origin + data.url;
    } catch (err) { return toast(err.message); }
  }
  paintShare();
  shareSheet.hidden = false;
}
const closeShare = () => { shareSheet.hidden = true; };

$('#share-chat').addEventListener('click', openShare);
shareSheet.addEventListener('click', (e) => { if (e.target.closest('[data-close]')) closeShare(); });
$('#share-create').addEventListener('click', async () => {
  try {
    const data = await post('/api/chat/share', { chatId: state.chat.id });
    state.chat.shared = true;
    shareUrl = location.origin + data.url;
    paintShare();
    $('#share-link').select();
  } catch (err) { toast(err.message); }
});
$('#share-copy').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText(shareUrl); toast(t('Link kopiert', 'Link copied')); } catch { $('#share-link').select(); }
});
$('#share-native').addEventListener('click', () => {
  navigator.share?.({ title: el.title.textContent || 'VAIs', url: shareUrl }).catch(() => {});
});
$('#share-stop').addEventListener('click', async () => {
  try {
    await post('/api/chat/unshare', { chatId: state.chat.id });
    state.chat.shared = false;
    shareUrl = '';
    paintShare();
    toast(t('Der Link funktioniert nicht mehr.', 'The link no longer works.'));
  } catch (err) { toast(err.message); }
});
$('#share-link').addEventListener('focus', (e) => e.target.select());

// ── Meine Statistik ───────────────────────────────────────────────
// Tagesverbrauch als Balken von 0 bis 100 %
function renderUsage(u) {
  const box = $('#usage-card');
  if (!u) { box.hidden = true; return; }
  const reset = new Date(u.resetsAt).toLocaleTimeString(LOCALE, { hour: '2-digit', minute: '2-digit' });
  const c = u.costs ?? {};
  const costs = [
    [t('Antwort', 'Answer'), c.text], ['Battle', (c.text ?? 0) * 2], [t('Websuche', 'Web search'), c.web],
    [t('Bild', 'Image'), c.image], ['Agent X', c.agent],
  ].filter(([, n]) => n !== undefined).map(([name, n]) => `<span>${name} <b>${n}</b></span>`).join('');
  if (u.limit === null) {
    box.innerHTML = `<div class="usage-top"><span>${t('Heute genutzt', 'Used today')}</span><b>∞</b></div>
      <p class="usage-sub">${t('Du hast kein Tageslimit.', 'You have no daily limit.')} ${t(`Heute ${u.used} Punkte genutzt.`, `${u.used} points used today.`)}</p>`;
  } else {
    const level = u.percent >= 100 ? 'full' : u.percent >= 80 ? 'high' : '';
    const note = level === 'full' ? t('Voll – um Mitternacht geht es weiter.', 'Full – resets at midnight.')
      : level === 'high' ? t('Fast voll', 'Almost full') : t(`Wieder 0 % um ${reset} Uhr`, `Back to 0 % at ${reset}`);
    box.innerHTML = `
      <div class="usage-top"><span>${t('Heute genutzt', 'Used today')}</span><b>${u.percent} %</b></div>
      <div class="usage-bar ${level}" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${u.percent}" aria-label="${t('Tageslimit', 'Daily limit')}"><i style="width:${u.percent}%"></i></div>
      <p class="usage-sub"><span>${t(`${u.used} von ${u.limit} Punkten`, `${u.used} of ${u.limit} points`)}</span><span class="usage-note ${level}">${note}</span></p>
      <p class="usage-costs"><small>${t('Kosten in Punkten:', 'Cost in points:')}</small>${costs}</p>`;
  }
  box.hidden = false;
}

async function showStats() {
  if (state.chat) resetChat();
  showView('stats');
  const sub = $('#stats-sub');
  sub.textContent = t('Lädt …', 'Loading …');
  ['#stat-grid', '#stat-modes', '#stat-fav', '#stat-used'].forEach((sel) => { $(sel).innerHTML = ''; });
  $('#usage-card').hidden = true;
  try {
    const res = await fetch('/api/chat/stats');
    if (res.status === 401) return location.replace('/login');
    const d = await res.json();
    const since = d.since ? new Date(d.since).toLocaleDateString(LOCALE, { day: 'numeric', month: 'long', year: 'numeric' }) : '';
    sub.textContent = since ? t(`Dabei seit ${since}.`, `Member since ${since}.`) : '';
    const tiles = [
      [d.chats, t('Chats', 'Chats')],
      [d.questions, t('Fragen gestellt', 'Questions asked')],
      [d.votes, t('Battle-Stimmen', 'Battle votes')],
      [d.likes, t('Antworten mit 👍', 'Answers with 👍')],
    ];
    renderUsage(d.usage);
    $('#stat-grid').innerHTML = tiles.map(([n, label]) => `<div class="stat-tile"><b>${Number(n) || 0}</b><span>${label}</span></div>`).join('');

    const total = Object.values(d.modes).reduce((a, b) => a + b, 0);
    $('#stat-modes').innerHTML = total
      ? Object.keys(MODES).filter((k) => d.modes[k]).map((k) => {
          const pct = Math.round((d.modes[k] / total) * 100);
          return `<div class="stat-mode">${ICON[k]}<span class="sm-name">${MODES[k].label}</span><span class="sm-bar"><i style="width:${pct}%"></i></span><span class="sm-n">${d.modes[k]}</span></div>`;
        }).join('')
      : `<p class="set-hint">${t('Noch keine Chats.', 'No chats yet.')}</p>`;

    const fill = (sel, list, unit, empty) => {
      const ol = $(sel);
      if (!list.length) { ol.innerHTML = `<li class="board-empty"><p class="set-hint">${empty}</p></li>`; return; }
      ol.innerHTML = list.map((m, i) => `
        <li class="board-row">
          <span class="b-rank">${i + 1}</span>${modelLogo(m)}
          <span class="b-name"><b></b><small></small></span>
          <span class="b-score"><b>${m.n}</b><small>${unit(m.n)}</small></span>
        </li>`).join('');
      ol.querySelectorAll('.b-name').forEach((n, i) => {
        n.querySelector('b').textContent = list[i].name;
        n.querySelector('small').textContent = list[i].maker;
      });
    };
    fill('#stat-fav', d.favorites, (n) => (n === 1 ? t('Sieg', 'win') : t('Siege', 'wins')), t('Stimme in Battles ab, dann siehst du hier deine Lieblinge.', 'Vote in battles and your favorites will show up here.'));
    fill('#stat-used', d.mostUsed, (n) => (n === 1 ? 'Chat' : 'Chats'), t('Nutze „Direkt“ oder „Side by Side“, dann erscheinen hier deine Modelle.', 'Use “Direct” or “Side by Side” and your models will show up here.'));
  } catch {
    sub.textContent = t('Die Statistik konnte nicht geladen werden.', 'Stats could not be loaded.');
  }
}

// ── Einstellungen ─────────────────────────────────────────────────
const settingsEl = $('#settings');
let installPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installPrompt = e; });
window.addEventListener('appinstalled', () => { installPrompt = null; toast(t('VAIs wurde installiert 🎉', 'VAIs was installed 🎉')); });

function paintSettings() {
  const theme = getTheme();
  document.querySelectorAll('[data-theme-opt]').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.themeOpt === theme)));
  const langSel = $('#set-lang-select');
  if (!langSel.options.length) langSel.innerHTML = LANGUAGES.map(([code, name]) => `<option value="${code}">${name}</option>`).join('');
  langSel.value = LANG;
  $('#set-lang-hint').hidden = !EXTRA_LANGS.includes(LANG);
  const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  $('#set-install-group').hidden = standalone;
  $('#set-install').hidden = !installPrompt;
  $('#set-install-text').textContent = installPrompt
    ? t('Installiere VAIs als App – mit eigenem Symbol auf deinem Startbildschirm.', 'Install VAIs as an app – with its own icon on your home screen.')
    : ios
      ? t('Tippe im Browser auf „Teilen“ (□↑) und dann auf „Zum Home-Bildschirm“. Danach startet VAIs wie eine App.', 'In your browser, tap “Share” (□↑) and then “Add to Home Screen”. VAIs will then open like an app.')
      : t('Öffne das Browser-Menü (⋮) und wähle „App installieren“ oder „Zum Startbildschirm hinzufügen“.', 'Open the browser menu (⋮) and choose “Install app” or “Add to home screen”.');
}

// ── Persönliches: eigene Anweisungen und Gedächtnis ─────────────
let profileData = null;
async function loadProfile() {
  try {
    const res = await fetch('/api/chat/profile');
    if (!res.ok) return;
    profileData = await res.json();
    $('#set-instr').value = profileData.instructions ?? '';
    countInstr();
    $('#set-memory-on').checked = profileData.memoryOn;
    $('#set-plan-on').checked = profileData.planFirst !== false;
    renderMemories();
  } catch { /* offline */ }
}
function countInstr() { $('#set-instr-count').textContent = `${$('#set-instr').value.length} / 1500`; }
function renderMemories() {
  const list = $('#set-memories');
  const items = profileData?.memories ?? [];
  $('#set-memory-clear').hidden = !items.length;
  if (!items.length) {
    list.innerHTML = `<li class="mem-empty">${profileData?.memoryOn ? t('Noch nichts gemerkt. Erzähl Agent X etwas über dich, z. B. „Merk dir, dass ich Fußball mag“.', 'Nothing yet. Tell Agent X something about you, e.g. “Remember that I like football”.') : t('Das Gedächtnis ist aus.', 'Memory is off.')}</li>`;
    return;
  }
  list.innerHTML = items.map((m) => `<li><span></span><button type="button" class="mem-del" data-mem="${m.id}" aria-label="${t('Vergessen', 'Forget')}" title="${t('Vergessen', 'Forget')}">×</button></li>`).join('');
  list.querySelectorAll('li > span').forEach((sp, i) => { sp.textContent = items[i].text; });
}
$('#set-instr').addEventListener('input', countInstr);
$('#set-instr-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.currentTarget;
  try {
    await post('/api/chat/profile', { instructions: $('#set-instr').value });
    setMsg(form, t('Gespeichert – gilt ab der nächsten Nachricht.', 'Saved – applies from your next message.'), 'ok');
  } catch (err) { setMsg(form, err.message, 'error'); }
});
$('#set-memory-on').addEventListener('change', async (e) => {
  try {
    await post('/api/chat/profile', { memoryOn: e.target.checked });
    if (profileData) profileData.memoryOn = e.target.checked;
    renderMemories();
  } catch (err) { toast(err.message); e.target.checked = !e.target.checked; }
});
$('#set-plan-on').addEventListener('change', async (e) => {
  try { await post('/api/chat/profile', { planFirst: e.target.checked }); } catch (err) { toast(err.message); e.target.checked = !e.target.checked; }
});
$('#set-memories').addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-mem]');
  if (!btn) return;
  try {
    await post('/api/chat/profile/memory/delete', { id: Number(btn.dataset.mem) });
    profileData.memories = profileData.memories.filter((m) => m.id !== Number(btn.dataset.mem));
    renderMemories();
  } catch (err) { toast(err.message); }
});
$('#set-memory-clear').addEventListener('click', async () => {
  if (!confirm(t('Alles vergessen, was Agent X über dich weiß?', 'Forget everything Agent X knows about you?'))) return;
  try { await post('/api/chat/profile/memory/clear', {}); profileData.memories = []; renderMemories(); } catch (err) { toast(err.message); }
});

// ── Erinnerungen: Benachrichtigungen einschalten, offene Erinnerungen ──
const pushSupported = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
const isIos = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const isStandalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
let pushInfo = null;
const b64ToBytes = (b64) => {
  const s = atob((b64 + '='.repeat((4 - (b64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
};
async function currentSub() {
  if (!pushSupported) return null;
  const reg = await navigator.serviceWorker.getRegistration();
  return reg ? reg.pushManager.getSubscription() : null;
}
async function loadPush() {
  const on = $('#set-push-on');
  const test = $('#set-push-test');
  const text = $('#set-push-text');
  try {
    const res = await fetch('/api/chat/push');
    if (!res.ok) return;
    pushInfo = await res.json();
  } catch { return; }
  const sub = await currentSub().catch(() => null);
  const granted = pushSupported && Notification.permission === 'granted' && sub;
  on.hidden = !!granted;
  test.hidden = !granted;
  if (!pushSupported) {
    on.hidden = true;
    text.textContent = isIos && !isStandalone()
      ? t('Auf dem iPhone gehen Benachrichtigungen nur, wenn VAIs als App installiert ist (Teilen → „Zum Home-Bildschirm“).', 'On iPhone, notifications only work when VAIs is installed as an app (Share → “Add to Home Screen”).')
      : t('Dieser Browser kann leider keine Benachrichtigungen.', 'This browser does not support notifications.');
  } else if (Notification.permission === 'denied') {
    on.hidden = true;
    text.textContent = t('Benachrichtigungen sind blockiert. Erlaube sie in den Browser- bzw. Handy-Einstellungen für diese Seite.', 'Notifications are blocked. Allow them for this site in your browser or phone settings.');
  } else if (granted) {
    text.textContent = t('✓ Benachrichtigungen sind an. Sag Agent X z. B. „Erinnere mich morgen um 8 an Mathe“.', '✓ Notifications are on. Tell Agent X e.g. “Remind me tomorrow at 8 about maths”.');
  }
  const list = $('#set-reminders');
  const items = pushInfo.reminders ?? [];
  list.innerHTML = items.map((r) => `<li><span></span><button type="button" class="mem-del" data-rem="${r.id}" aria-label="${t('Löschen', 'Delete')}" title="${t('Löschen', 'Delete')}">×</button></li>`).join('');
  list.querySelectorAll('li > span').forEach((sp, i) => {
    const when = new Date(items[i].due).toLocaleString(LOCALE, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
    sp.textContent = `⏰ ${when} – ${items[i].text}`;
  });
}
$('#set-push-on').addEventListener('click', async () => {
  try {
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') { toast(t('Benachrichtigungen wurden nicht erlaubt.', 'Notifications were not allowed.')); return loadPush(); }
    const reg = await navigator.serviceWorker.ready;
    if (!pushInfo) await loadPush();
    const sub = (await reg.pushManager.getSubscription()) ?? await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(pushInfo.publicKey) });
    await post('/api/chat/push/subscribe', { subscription: sub.toJSON() });
    haptic('success');
    toast(t('Benachrichtigungen sind an ✓', 'Notifications are on ✓'));
  } catch (err) {
    toast(err.message || t('Das hat nicht geklappt.', 'That did not work.'));
  }
  loadPush();
});
$('#set-push-test').addEventListener('click', async () => {
  try { await post('/api/chat/push/test', {}); toast(t('Gesendet – gleich sollte sie erscheinen.', 'Sent – it should appear in a moment.')); } catch (err) { toast(err.message); }
});
$('#set-reminders').addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-rem]');
  if (!btn) return;
  try { await post('/api/chat/push/reminders/delete', { id: Number(btn.dataset.rem) }); loadPush(); } catch (err) { toast(err.message); }
});

// ── Webseiten veröffentlichen ─────────────────────────────────────
const siteSheet = $('#site-sheet');
let siteNow = null;
function showSite(site) {
  siteNow = site;
  const url = location.origin + site.path;
  $('#site-link').value = url;
  $('#site-open').href = url;
  $('#site-native').hidden = !navigator.share;
  paintQr('#site-qr', url);
  siteSheet.hidden = false;
  $('#site-link').select();
}
$('#preview-publish').addEventListener('click', async (e) => {
  const chat = state.chat;
  if (!chat || pv.turn === null) return;
  const btn = e.currentTarget;
  btn.disabled = true;
  try {
    const data = await post('/api/chat/sites/publish', { chatId: chat.id, turn: pv.turn, side: pv.side ?? 0 });
    haptic('success');
    showSite(data);
  } catch (err) { toast(err.message); } finally { btn.disabled = false; }
});
siteSheet.addEventListener('click', (e) => { if (e.target.closest('[data-close]')) siteSheet.hidden = true; });
$('#site-copy').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText($('#site-link').value); toast(t('Link kopiert', 'Link copied')); } catch { $('#site-link').select(); }
});
$('#site-native').addEventListener('click', () => navigator.share?.({ title: siteNow?.title || 'VAIs', url: $('#site-link').value }).catch(() => {}));
$('#site-stop').addEventListener('click', async () => {
  if (!siteNow || !confirm(t('Webseite offline nehmen? Der Link funktioniert dann nicht mehr.', 'Take the website offline? The link will stop working.'))) return;
  try { await post('/api/chat/sites/unpublish', { id: siteNow.id }); siteSheet.hidden = true; toast(t('Offline genommen', 'Taken offline')); } catch (err) { toast(err.message); }
});
async function loadSites() {
  try {
    const res = await fetch('/api/chat/sites');
    if (!res.ok) return;
    const { sites } = await res.json();
    $('#set-sites-group').hidden = !sites.length;
    const list = $('#set-sites');
    list.innerHTML = sites.map((x) => `<li><a href="/w/${escapeHtml(x.id)}" target="_blank" rel="noopener"></a><small>${x.views} ${x.views === 1 ? t('Aufruf', 'view') : t('Aufrufe', 'views')}</small><button type="button" class="mem-del" data-site-off="${escapeHtml(x.id)}" aria-label="${t('Offline nehmen', 'Take offline')}" title="${t('Offline nehmen', 'Take offline')}">×</button></li>`).join('');
    list.querySelectorAll('li > a').forEach((a, i) => { a.textContent = `🌐 ${sites[i].title}`; });
  } catch { /* offline */ }
}
$('#set-sites').addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-site-off]');
  if (!btn || !confirm(t('Webseite offline nehmen?', 'Take the website offline?'))) return;
  try { await post('/api/chat/sites/unpublish', { id: btn.dataset.siteOff }); loadSites(); } catch (err) { toast(err.message); }
});

function openSettings() {
  toggleAccount(false);
  closeDrawer();
  paintSettings();
  paintVoices();
  // iPhone lädt die Stimmen erst nach und meldet das nicht immer → kurz danach nochmal
  [400, 1500].forEach((ms) => setTimeout(() => { if (!settingsEl.hidden) paintVoices(); }, ms));
  loadProfile();
  loadPush();
  loadSites();
  settingsEl.querySelectorAll('.msg').forEach((m) => { m.textContent = ''; m.className = m.className.replace(/ (ok|error)$/, ''); });
  settingsEl.hidden = false;
  $('.settings-head [data-close]', settingsEl).focus();
}
function closeSettings() { settingsEl.hidden = true; }

$('#open-settings').addEventListener('click', openSettings);
$('#set-lang-select').addEventListener('change', (e) => { if (e.target.value !== LANG) setLang(e.target.value); });
$('#d-settings').addEventListener('click', openSettings);
settingsEl.addEventListener('click', (e) => {
  if (e.target.closest('[data-close]')) return closeSettings();
  const th = e.target.closest('[data-theme-opt]');
  if (th) { setTheme(th.dataset.themeOpt); paintSettings(); }

});
$('#set-install').addEventListener('click', async () => {
  if (!installPrompt) return;
  installPrompt.prompt();
  await installPrompt.userChoice.catch(() => {});
  installPrompt = null;
  paintSettings();
});

function setMsg(form, text, kind) {
  const m = $('.msg', form);
  m.textContent = text;
  m.classList.remove('ok', 'error');
  if (kind) m.classList.add(kind);
}

$('#set-password').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.currentTarget;
  const current = $('#set-current').value;
  const password = $('#set-new').value;
  if (password.length < 8) return setMsg(form, t('Das neue Passwort muss mindestens 8 Zeichen lang sein.', 'The new password must be at least 8 characters long.'), 'error');
  const btn = $('button[type="submit"]', form);
  btn.disabled = true;
  try {
    await post('/api/auth/password', { current, password });
    $('#set-current').value = '';
    $('#set-new').value = '';
    setMsg(form, t('Passwort geändert. Andere Geräte wurden abgemeldet.', 'Password changed. Other devices were signed out.'), 'ok');
  } catch (err) {
    setMsg(form, err.message, 'error');
  } finally {
    btn.disabled = false;
  }
});

$('#set-clear').addEventListener('click', async () => {
  if (!confirm(t('Wirklich alle Chats löschen? Das kann nicht rückgängig gemacht werden.', 'Really delete all chats? This cannot be undone.'))) return;
  try {
    await post('/api/chat/clear', {});
    saveOffline({ chats: {}, order: [], list: [] });
    historyItems = [];
    historyDirty = true;
    if (state.chat) go('');
    toast(t('Alle Chats gelöscht', 'All chats deleted'));
  } catch (err) {
    toast(err.message);
  }
});

$('#set-delete').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.currentTarget;
  const password = $('#set-delete-pw').value;
  if (!password) return setMsg(form, t('Bitte gib dein Passwort ein.', 'Please enter your password.'), 'error');
  if (!confirm(t('Konto wirklich endgültig löschen? Alle Chats gehen verloren.', 'Really delete your account permanently? All chats will be lost.'))) return;
  try {
    await post('/api/auth/delete', { password });
    await forgetOffline();
    location.replace('/login');
  } catch (err) {
    setMsg(form, err.message, 'error');
  }
});

// ── „Was ist neu?“ ───────────────────────────────────────────────
function showNews(since = 0) {
  const groups = CHANGES().filter((c) => c.id > since);
  const list = groups.length ? groups : CHANGES().slice(0, 2);
  $('#news-list').innerHTML = list.map((g) => `
    <li class="news-group"><p class="news-date">${new Date(g.date).toLocaleDateString(LOCALE, { day: 'numeric', month: 'long', year: 'numeric' })}</p>
      <ul>${g.items.map(([icon, title, text]) => `<li><span class="news-icon" aria-hidden="true">${icon}</span><span><b>${escapeHtml(title)}</b><small>${escapeHtml(text)}</small></span></li>`).join('')}</ul></li>`).join('');
  const sheet = $('#news-sheet');
  sheet.hidden = false;
  return new Promise((resolve) => {
    const close = () => { sheet.hidden = true; store.set('vais.news', LATEST()); resolve(); };
    $('#news-ok').onclick = close;
    sheet.querySelector('.sheet-backdrop').onclick = close;
  });
}
$('#set-news').addEventListener('click', () => { closeSettings(); showNews(0); });

// ── Mitteilungen vom Admin (einmal anzeigen, dann als gelesen merken) ──
async function showAnnouncements() {
  let list = [];
  try {
    const res = await fetch('/api/chat/announcements');
    if (!res.ok) return;
    list = (await res.json()).announcements ?? [];
  } catch { return; }
  const sheet = $('#ann-sheet');
  const next = () => {
    const a = list.shift();
    if (!a) { sheet.hidden = true; return; }
    $('#ann-title').textContent = a.title;
    $('#ann-body').textContent = a.body;
    $('#ann-date').textContent = new Date(a.created).toLocaleDateString(LOCALE, { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
    sheet.hidden = false;
    $('#ann-ok').onclick = () => { post('/api/chat/announcements/read', { id: a.id }).catch(() => {}); next(); };
  };
  next();
}

// ── Start ─────────────────────────────────────────────────────────
async function init() {
  let user;
  try {
    const me = await fetch('/api/auth/me');
    if (me.status === 401) { await forgetOffline(); return location.replace('/login'); }
    if (!me.ok) throw new TypeError('server');
    user = (await me.json()).user;
    saveOffline({ email: user.email });
  } catch (err) {
    const saved = offlineData();
    if (!(err instanceof TypeError) || !saved?.email) return location.replace('/login');
    user = { email: saved.email };
    setOffline(true);
  }
  window.addEventListener('online', () => { if (offline) location.reload(); });
  avatar.textContent = user.email[0].toUpperCase();
  avatar.setAttribute('aria-label', `${t('Konto', 'Account')}: ${user.email}`);
  $('#menu-email').textContent = user.email;
  const staff = !!(user.admin || user.mod);
  $('#d-team').hidden = !staff;
  if (staff) {
    $('#d-team').addEventListener('click', () => { closeDrawer(); openTeam(null, { toast }); });
    refreshTeamBadge();
    if (location.hash.startsWith('#g/')) openTeam(decodeURIComponent(location.hash.slice(3)), { toast });
  }
  ['#open-admin', '#d-admin', '#set-admin'].forEach((sel) => {
    $(sel).hidden = !(user.admin || user.mod);
    if (user.mod) $(sel).querySelector('span')?.replaceChildren(t('Moderation', 'Moderation'));
  });
  if (user.mod && $('#set-admin')) $('#set-admin').textContent = t('Moderation öffnen', 'Open moderation');
  $('#d-avatar').textContent = user.email[0].toUpperCase();
  $('#d-email').textContent = user.email;
  $('#set-email').textContent = user.email;
  $('#set-username').value = user.email;

  renderControls();
  updateSend();
  try {
    if (offline) throw new Error('offline');
    const res = await fetch('/api/chat/models');
    const data = await res.json();
    state.models = data.models ?? [];
    $('#demo-note').hidden = !data.demo;
    saveOffline({ models: state.models });
  } catch {
    if (offline) state.models = offlineData()?.models ?? [];
    else toast(t('Modelle konnten nicht geladen werden.', 'Models could not be loaded.'));
  }
  // Gespeicherte Auswahl prüfen, sonst die ersten Modelle nehmen
  const normal = state.models.filter((m) => !m.agent);
  state.picks = [0, 1].map((i) => (modelById(state.picks[i]) ? state.picks[i] : normal[i]?.id ?? null));
  if (state.picks[0] && state.picks[0] === state.picks[1]) state.picks[1] = normal.find((m) => m.id !== state.picks[0])?.id ?? null;
  fitPicks();
  renderControls();
  await route();
  const seen = Number(store.get('vais.news', 0));
  if (!tourDone() && !offline && !location.hash) {
    store.set('vais.news', LATEST()); // Neue Nutzer bekommen die Tour statt der Neuigkeiten
    setTimeout(startTour, 500);
  } else if (!offline) {
    setTimeout(async () => {
      if (seen < LATEST()) await showNews(seen);
      showAnnouncements();
    }, 800);
  }
}

$('#set-tour').addEventListener('click', () => {
  closeSettings();
  go('');
  setTimeout(startTour, 350);
});

init();

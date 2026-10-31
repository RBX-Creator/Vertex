const $ = (sel, root = document) => root.querySelector(sel);

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
  video: { label: 'Video', desc: 'Videos erstellen', soon: true },
  image: { label: 'Bild', desc: 'Bilder erstellen', soon: true },
  web: { label: 'Websuche', desc: 'Mit aktuellen Infos aus dem Internet', cap: 'web' },
  code: { label: 'Code', desc: 'Webseiten und Apps programmieren', cap: 'code' },
  text: { label: 'Text', desc: 'Chatten mit Text-Modellen', cap: 'text' },
  auto: { label: 'Auto', desc: 'Wählt automatisch passende Modelle', cap: 'text' },
};
Object.assign(ICON, {
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
  'm-video': svg('<rect x="3.5" y="4.5" width="17" height="15" rx="2"/><path d="m10 9 5 3-5 3z"/>'),
  'm-image': svg('<rect x="3.5" y="3.5" width="17" height="17" rx="1.5"/><circle cx="15.5" cy="8.5" r="1.8"/><path d="m3.5 17 5-5 5 5 2-2 5 5"/>'),
  'm-web': svg('<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3Z"/>'),
  'm-code': svg('<path d="m8 7-5 5 5 5M16 7l5 5-5 5M14 4l-4 16"/>'),
  'm-text': svg('<path d="M5 5h14M12 5v15M9 20h6"/>'),
  'm-auto': svg('<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>'),
  preview: svg('<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>'),
});

const MODES = {
  agent: { label: 'Agent X', desc: 'Sucht, liest und rechnet selbstständig – der stärkste Modus' },
  battle: { label: 'Battle', desc: '2 anonyme Modelle im Vergleich' },
  sxs: { label: 'Side by Side', desc: '2 Modelle deiner Wahl vergleichen' },
  direct: { label: 'Direkt', desc: 'Mit 1 Modell chatten' },
};

// ── Kleine Helfer ─────────────────────────────────────────────────
const store = {
  get(key, fallback) { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } },
  set(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* egal */ } },
};
const escapeHtml = (s) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

let toastTimer;
function toast(text) {
  const el = $('#toast');
  el.textContent = text;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
}

async function post(url, body) {
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (res.status === 401) location.replace('/login');
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Etwas ist schiefgelaufen.');
  return data;
}

if (window.DOMPurify) {
  DOMPurify.addHook('afterSanitizeAttributes', (node) => {
    if (node.tagName === 'A') { node.setAttribute('target', '_blank'); node.setAttribute('rel', 'noopener noreferrer'); }
  });
}
function markdown(text) {
  text = text.replace(/\s*【[^】]*】/g, ''); // Quellen-Marker der Websuche ausblenden
  if (window.marked && window.DOMPurify) return DOMPurify.sanitize(marked.parse(text, { gfm: true, breaks: true }));
  return escapeHtml(text).replace(/\n/g, '<br>');
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
  el.modeBtn.setAttribute('aria-label', `Modus: ${MODES[state.mode].label}`);
  el.modalityBtn.hidden = state.mode === 'agent';
  el.modalityBtn.innerHTML = ICON[`m-${state.modality}`] + ICON.chev;
  el.modalityBtn.setAttribute('aria-label', `Art: ${MODALITIES[state.modality].label}`);
  el.chips.forEach((chip, slot) => {
    const show = state.mode === 'sxs' || (state.mode === 'direct' && slot === 0);
    chip.hidden = !show;
    if (!show) return;
    const m = modelById(state.picks[slot]);
    chip.innerHTML = m
      ? `${modelLogo(m)}<span class="name">${escapeHtml(m.name)}</span>${ICON.chev}`
      : `<span class="name">Modell wählen</span>${ICON.chev}`;
    chip.setAttribute('aria-label', `Modell ${slot + 1}: ${m?.name ?? 'keins gewählt'}`);
  });
  el.prompt.placeholder = state.chat ? 'Folgefrage stellen …' : 'Frag irgendwas …';
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
  if (state.chat) { resetChat(); toast(`Neuer Chat: ${MODES[mode].label}`); }
  renderControls();
  el.prompt.focus();
});

// ── Art der Anfrage (Auto, Text, Code, Websuche …) ─────────────────
const currentCap = () => MODALITIES[state.modality].cap;

function renderModalityMenu() {
  el.modalityMenu.innerHTML = Object.entries(MODALITIES).map(([key, m]) => `
    <button type="button" class="mode-item${m.soon ? ' soon' : ''}" role="menuitemradio" aria-checked="${key === state.modality}" aria-disabled="${!!m.soon}" data-modality="${key}">
      ${ICON[`m-${key}`]}<span><b>${m.label}${m.soon ? ' <em>bald</em>' : ''}</b><small>${m.desc}</small></span>${key === state.modality ? ICON.check.replace('<svg ', '<svg class="check" ') : '<span></span>'}
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
  const fitting = state.models.filter((m) => m.caps.includes(cap));
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
  if (MODALITIES[key].soon) return toast(`${MODALITIES[key].label} kommt bald`);
  toggleModalityMenu(false);
  if (key === state.modality) return;
  state.modality = key;
  store.set('vais.modality', key);
  fitPicks();
  if (state.chat) { resetChat(); toast(`Neuer Chat: ${MODALITIES[key].label}`); }
  renderControls();
  el.prompt.focus();
});

// ── Modellauswahl ─────────────────────────────────────────────────
let sheetSlot = 0;
let sheetCap = 'text';
const CAP_EMPTY = {
  image: 'Bild-Modelle kommen bald.',
  web: 'Für Websuche bitte einen Groq-Schlüssel eintragen (GROQ_API_KEY).',
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
        return `<li><button type="button" class="model-opt${selected ? ' selected' : ''}${m.id === other ? ' taken' : ''}" data-id="${escapeHtml(m.id)}">
          ${modelLogo(m)}<span class="name">${escapeHtml(m.name)}</span>
          ${selected ? ICON.check.replace('<svg ', '<svg width="18" height="18" ') : ''}
          <span class="prov">${escapeHtml(m.maker)}</span></button></li>`;
      }).join('')
    : `<li class="model-empty">${q ? 'Kein Modell gefunden.' : CAP_EMPTY[sheetCap] ?? 'Keine Modelle in dieser Kategorie.'}</li>`;
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
  if (changed && state.chat) { resetChat(); toast('Neuer Chat mit anderem Modell'); }
  renderControls();
});

// ── Chat ──────────────────────────────────────────────────────────
function labelFor(chat, side) {
  if (chat.mode === 'agent') return 'Agent X';
  if (chat.mode === 'battle') return chat.names ? chat.names[side] : `Assistent ${'AB'[side]}`;
  return chat.labels[side];
}

// Ansicht: 'home' (Start), 'thread' (Chat) oder 'board' (Bestenliste)
function showView(view) {
  el.home.hidden = view !== 'home';
  el.thread.hidden = view !== 'thread';
  el.board.hidden = view !== 'board';
  el.dock.hidden = view === 'board';
  el.newChat.hidden = view === 'home';
  $('#suggest').hidden = view !== 'home';
  if (view === 'board') el.title.textContent = '';
}

// ── Vorschläge auf der Startseite ─────────────────────────────────
const SUGGESTIONS = [
  {
    title: 'Landingpage erstellen', desc: 'Eine schlichte, moderne Webseite',
    icon: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 8h18M6 6h.01M8.5 6h.01M14 13l2 5 1-2 2-1z"/>',
    prompt: 'Erstelle eine schlichte, moderne Landingpage als einzelne HTML-Datei (mit CSS) für ein kleines Café namens „Bohne“. Mit Startbereich, Speisekarte und Kontakt.',
  },
  {
    title: 'Einfach erklären', desc: 'Ein Thema verständlich erklärt',
    icon: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6V14M12 17h.01"/>',
    prompt: 'Erkläre mir so einfach wie möglich, wie künstliche Intelligenz funktioniert. Mit einem Beispiel aus dem Alltag.',
  },
  {
    title: 'Text verbessern', desc: 'Rechtschreibung und Stil prüfen',
    icon: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m13.5 6.5 4 4"/>',
    prompt: 'Verbessere Rechtschreibung, Grammatik und Stil in diesem Text und erkläre kurz die wichtigsten Änderungen:\n\n',
  },
  {
    title: 'Code reparieren', desc: 'Fehler finden und erklären',
    icon: '<path d="m8 7-5 5 5 5M16 7l5 5-5 5"/>',
    prompt: 'Finde den Fehler in diesem Code, erkläre ihn und zeig mir die korrigierte Version:\n\n',
  },
  {
    title: 'Reise planen', desc: 'Ein Wochenende voller Ideen',
    icon: '<path d="M12 21s-7-6.1-7-11a7 7 0 1 1 14 0c0 4.9-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/>',
    prompt: 'Plane mir ein entspanntes Wochenende in Hamburg: Sehenswürdigkeiten, gutes Essen und ein Tipp für schlechtes Wetter.',
  },
  {
    title: 'Ideen sammeln', desc: 'Brainstorming für dein Projekt',
    icon: '<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.4 1 1.1 1 1.8V16h5v-.3c0-.7.4-1.4 1-1.8A6 6 0 0 0 12 3z"/>',
    prompt: 'Gib mir 10 kreative Ideen für ein eigenes Roblox-Spiel, jeweils mit einem Satz zur Spielidee.',
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

function resetChat() {
  for (const c of state.controllers) c.abort();
  state.controllers.clear();
  state.chat = null;
  el.thread.innerHTML = '';
  el.title.textContent = '';
  el.vote.hidden = true;
  el.voteResult.hidden = true;
  showView('home');
  renderControls();
  updateSend();
}

el.newChat.addEventListener('click', () => { go(''); el.prompt.focus(); });

function buildMessages(turnIndex, side) {
  const msgs = [];
  state.chat.turns.slice(0, turnIndex + 1).forEach((t, i) => {
    msgs.push({ role: 'user', content: t.user });
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
                <button class="card-btn" data-act="regen" aria-label="Neu generieren" title="Neu generieren">${ICON.regen}</button>
                <button class="card-btn" data-act="copy" aria-label="Kopieren" title="Kopieren">${ICON.copy}</button>
                <button class="card-btn" data-act="preview" aria-label="Vorschau" title="Vorschau" hidden>${ICON.preview}</button>
                <button class="card-btn" data-act="expand" aria-label="Vollbild" title="Vollbild">${ICON.expand}</button>`;
          // Einzel-Antwort (Direkt, Agent X): Knöpfe unter der Nachricht wie bei Arena, mit 👍/👎
          return n === 1 ? `
          <article class="card" data-side="${side}">
            <header class="card-head"><span class="card-label"></span></header>
            <div class="card-body md"></div>
            <div class="card-foot">
                <button class="card-btn" data-act="like" aria-label="Gute Antwort" title="Gute Antwort" aria-pressed="false">${ICON.up}</button>
                <button class="card-btn" data-act="dislike" aria-label="Schlechte Antwort" title="Schlechte Antwort" aria-pressed="false">${ICON.down}</button>${actions}
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
        <button class="nav-btn next" data-go="1" aria-label="Antwort B zeigen">${ICON.next}</button>
        <button class="nav-btn prev" data-go="0" aria-label="Antwort A zeigen" hidden>${ICON.prev}</button>
        <div class="dots">${turn.answers.map((_, i) => `<button class="dot${i ? '' : ' active'}" data-go="${i}" aria-label="Antwort ${'AB'[i]}"></button>`).join('')}</div>` : ''}
    </div>`;
  $('.bubble', node).textContent = turn.user;
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
  if (won) label.insertAdjacentHTML('beforeend', '<span class="badge">✓ Gewinner</span>');
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
  $('[data-act="regen"]', card).disabled = !isLast || a.status === 'streaming';
  $('[data-act="copy"]', card).disabled = !a.text;
  $('[data-act="expand"]', card).disabled = !a.text;
  $('[data-act="preview"]', card).hidden = !(a.status === 'done' && htmlBlock(a.text));
  const foot = $('.card-foot', card);
  if (foot) {
    foot.hidden = a.status === 'streaming';
    $('[data-act="like"]', foot).setAttribute('aria-pressed', String(a.feedback === 1));
    $('[data-act="dislike"]', foot).setAttribute('aria-pressed', String(a.feedback === -1));
    $('[data-act="like"]', foot).hidden = $('[data-act="dislike"]', foot).hidden = !a.text;
  }

  const body = $('.card-body', card);
  renderThinking(card, a);
  renderSteps(card, a);
  if (a.status === 'error') {
    body.innerHTML = `${a.text ? markdown(a.text) : ''}<p class="card-error"></p>${isLast ? '<button class="retry" data-act="regen">Erneut versuchen</button>' : ''}`;
    $('.card-error', body).textContent = a.error;
  } else if (!a.text) {
    body.innerHTML = a.status === 'stopped'
      ? '<p class="card-error" style="color:var(--muted)">Gestoppt.</p>'
      : '<div class="typing" aria-label="Schreibt …"><span></span><span></span><span></span></div>';
  } else {
    body.innerHTML = markdown(a.text);
  }
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
  $('.think-head span', box).textContent = live ? 'Denkt nach …' : `Gedacht${a.thinkMs ? ` · ${secs} s` : ''}`;
  $('.think-head', box).setAttribute('aria-expanded', String(open));
  const body = $('.think-body', box);
  $('p', body).textContent = a.thinking;
  if (live) { const p = $("p", body); p.scrollTop = p.scrollHeight; } // schnell mitscrollen
}

// Arbeitsschritte von Agent X über der Antwort anzeigen
const STEP_LABEL = { search: 'Sucht', read: 'Liest', calc: 'Rechnet', time: 'Prüft', error: 'Problem', other: 'Nutzt' };
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
      ${ICON[`s-${st.kind}`] ?? ICON['s-other']}<span><b>${STEP_LABEL[st.kind] ?? 'Schritt'}</b> <span class="t"></span></span>
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
  Object.assign(a, { text: '', status: 'streaming', error: null, steps: [], thinking: '', thinkMs: 0, thinkStart: 0, thinkOpen: false });
  updateCard(turnIndex, side);

  const ctrl = new AbortController();
  state.controllers.add(ctrl);
  updateSend();
  try {
    const res = await fetch('/api/chat/stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chatId: chat.id, side, turn: turnIndex, messages: buildMessages(turnIndex, side) }),
      signal: ctrl.signal,
    });
    if (res.status === 401) location.replace('/login');
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Das Modell konnte nicht antworten.');

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
        if (msg.done) finished = true;
      }
    }
    if (!finished) throw new Error('Die Verbindung wurde unterbrochen.');
    a.status = a.text ? 'done' : 'error';
    if (!a.text) a.error = 'Das Modell hat keine Antwort geliefert.';
  } catch (err) {
    if (ctrl.signal.aborted) a.status = a.text ? 'done' : 'stopped';
    else Object.assign(a, { status: 'error', error: err.message || 'Das Modell konnte nicht antworten.' });
  } finally {
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
  el.vote.hidden = !last.answers.every((a) => a.status === 'done' && a.text);
}

async function send() {
  const text = el.prompt.value.trim();
  if (!text || busy()) return;
  if (!state.models.length) return toast('Modelle konnten nicht geladen werden. Lade die Seite neu.');

  if (!state.chat) {
    if (state.mode === 'sxs' || state.mode === 'direct') {
      const need = state.mode === 'sxs' ? 2 : 1;
      const missing = state.picks.slice(0, need).findIndex((id) => !modelById(id));
      if (missing !== -1) return openSheet(missing);
    }
    const body = { mode: state.mode, modality: state.modality, title: text.slice(0, 80) };
    if (state.mode === 'sxs') body.models = state.picks.slice(0, 2);
    if (state.mode === 'direct') body.models = [state.picks[0]];
    el.send.disabled = true;
    try {
      const data = await post('/api/chat/start', body);
      state.chat = { id: data.id, mode: state.mode, labels: data.models, names: null, winner: null, turns: [] };
    } catch (err) {
      return toast(err.message);
    } finally {
      el.send.disabled = false;
    }
    el.title.textContent = text.length > 40 ? `${text.slice(0, 40)}…` : text;
    history.pushState(null, '', `#c/${state.chat.id}`);
    historyDirty = true;
    showView('thread');
    renderControls();
  }

  const chat = state.chat;
  historyDirty = true;
  el.prompt.value = '';
  autosize();
  el.vote.hidden = true;
  el.voteResult.hidden = true;

  const sides = chat.mode === 'direct' || chat.mode === 'agent' ? 1 : 2;
  chat.turns.push({ user: text, answers: Array.from({ length: sides }, () => ({ text: '', status: 'streaming', error: null, steps: [], thinking: '', thinkMs: 0 })) });
  const index = chat.turns.length - 1;
  if (index > 0) chat.turns[index - 1].answers.forEach((_, s) => updateCard(index - 1, s)); // „Neu generieren“ dort abschalten
  const node = renderTurn(index);
  node.scrollIntoView({ behavior: 'smooth', block: 'start' });

  await Promise.all(chat.turns[index].answers.map((_, side) => runSide(index, side)));
  if (state.chat === chat) afterTurn();
}

// ── Abstimmen ─────────────────────────────────────────────────────
el.vote.addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-vote]');
  if (!btn || !state.chat) return;
  const chat = state.chat;
  el.vote.setAttribute('aria-busy', 'true');
  try {
    const data = await post('/api/chat/vote', { chatId: chat.id, winner: btn.dataset.vote });
    chat.names = data.models;
    chat.winner = data.winner;
    updateLabels();
    el.vote.hidden = true;
    el.voteResult.innerHTML = chat.mode === 'battle'
      ? `Danke für deine Stimme! A war <strong></strong>, B war <strong></strong>.`
      : 'Danke für deine Stimme!';
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

  const btn = e.target.closest('[data-act]');
  if (!btn || btn.disabled) return;
  const side = Number(btn.closest('.card').dataset.side);
  const a = state.chat.turns[turnIndex].answers[side];
  const act = btn.dataset.act;

  if (act === 'like' || act === 'dislike') {
    const value = act === 'like' ? 1 : -1;
    const before = a.feedback ?? 0;
    a.feedback = before === value ? 0 : value;
    updateCard(turnIndex, side);
    try {
      await post('/api/chat/feedback', { chatId: state.chat.id, turn: turnIndex, side, value: a.feedback });
      if (a.feedback) toast(a.feedback === 1 ? 'Danke für dein Feedback 👍' : 'Danke, wir merken uns das 👎');
    } catch (err) {
      a.feedback = before;
      updateCard(turnIndex, side);
      toast(err.message);
    }
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
      btn.innerHTML = ICON.check;
      setTimeout(() => (btn.innerHTML = ICON.copy), 1500);
      toast('Kopiert');
    } catch {
      toast('Kopieren nicht möglich');
    }
  } else if (act === 'preview') {
    const code = htmlBlock(a.text);
    if (!code) return;
    $('#preview-frame').srcdoc = code;
    $('#preview').hidden = false;
    $('#preview [data-close]').focus();
  } else if (act === 'expand') {
    $('#expand-title').textContent = labelFor(state.chat, side);
    $('#expand-body').innerHTML = markdown(a.text);
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

// Letzten ```html-Codeblock einer Antwort finden (für die Vorschau)
function htmlBlock(text) {
  const blocks = [...text.matchAll(/```html[^\n]*\n([\s\S]*?)```/gi)];
  return blocks.length ? blocks.at(-1)[1] : null;
}
$('#preview').addEventListener('click', (e) => {
  if (e.target.closest('[data-close]')) { $('#preview').hidden = true; $('#preview-frame').srcdoc = ''; }
});

$('#expand').addEventListener('click', (e) => { if (e.target.closest('[data-close]')) $('#expand').hidden = true; });

// ── Eingabefeld ───────────────────────────────────────────────────
function autosize() {
  el.prompt.style.height = 'auto';
  el.prompt.style.height = `${Math.min(el.prompt.scrollHeight, 200)}px`;
  updateSend();
}

function updateSend() {
  const isBusy = busy();
  el.send.classList.toggle('stop', isBusy);
  el.send.classList.toggle('ready', !isBusy && !!el.prompt.value.trim());
  el.send.innerHTML = isBusy ? ICON.stop : ICON.send;
  el.send.setAttribute('aria-label', isBusy ? 'Stoppen' : 'Senden');
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
  if (busy()) {
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
  if (!$('#preview').hidden) { $('#preview').hidden = true; $('#preview-frame').srcdoc = ''; }
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
  await fetch('/api/auth/logout', { method: 'POST' });
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
  if (h === '#bestenliste') return showBoard();
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
  for (const c of state.controllers) c.abort();
  let data;
  try {
    const res = await fetch(`/api/chat/${encodeURIComponent(id)}`);
    if (res.status === 401) return location.replace('/login');
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Chat nicht gefunden.');
    data = await res.json();
  } catch (err) {
    toast(err.message);
    return go('');
  }
  state.chat = {
    id: data.id,
    mode: data.mode,
    labels: data.labels,
    names: data.mode === 'battle' && data.winner ? data.labels : null,
    winner: data.winner,
    turns: data.turns,
  };
  state.mode = data.mode;
  if (MODALITIES[data.modality] && !MODALITIES[data.modality].soon) state.modality = data.modality;
  if (data.models?.every((m) => modelById(m))) data.models.forEach((m, i) => { state.picks[i] = m; });
  el.thread.innerHTML = '';
  el.vote.hidden = true;
  el.voteResult.hidden = true;
  state.chat.turns.forEach((_, i) => renderTurn(i));
  el.title.textContent = data.title.length > 40 ? `${data.title.slice(0, 40)}…` : data.title;
  showView('thread');
  renderControls();
  updateSend();
  afterTurn();
  requestAnimationFrame(() => { el.stage.scrollTop = el.stage.scrollHeight; });
}

// ── Seitenleiste mit Verlauf ──────────────────────────────────────
let historyDirty = true;
let historyItems = [];

function groupLabel(ts) {
  const day = 24 * 3600 * 1000;
  const start = new Date(); start.setHours(0, 0, 0, 0);
  const t = start.getTime();
  if (ts >= t) return 'Heute';
  if (ts >= t - day) return 'Gestern';
  if (ts >= t - 7 * day) return 'Letzte 7 Tage';
  if (ts >= t - 30 * day) return 'Letzte 30 Tage';
  return 'Älter';
}

function renderHistory() {
  const q = el.dSearch.value.trim().toLowerCase();
  const items = historyItems.filter((c) => !q || c.title.toLowerCase().includes(q));
  if (!items.length) {
    el.dList.innerHTML = `<p class="drawer-empty">${q ? 'Nichts gefunden.' : 'Noch keine Chats.'}</p>`;
    return;
  }
  let html = '';
  let last = '';
  for (const c of items) {
    const g = groupLabel(c.updated);
    if (g !== last) { html += `<p class="drawer-group">${g}</p>`; last = g; }
    const active = state.chat?.id === c.id ? ' active' : '';
    html += `<div class="drawer-chat${active}">
      <button class="drawer-chat-open" data-open="${escapeHtml(c.id)}">${ICON[c.mode] ?? ''}<span></span></button>
      <button class="drawer-chat-del" data-del="${escapeHtml(c.id)}" aria-label="Chat löschen" title="Löschen">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg>
      </button>
    </div>`;
  }
  el.dList.innerHTML = html;
  // Titel sicher als Text einsetzen
  el.dList.querySelectorAll('[data-open] span').forEach((span, i) => { span.textContent = items[i].title; });
}

async function openDrawer() {
  el.drawer.hidden = false;
  $('#open-drawer').setAttribute('aria-expanded', 'true');
  if (historyDirty || !historyItems.length) {
    if (!historyItems.length) el.dList.innerHTML = '<p class="drawer-empty">Lädt …</p>';
    try {
      const res = await fetch('/api/chat/list');
      historyItems = (await res.json()).chats ?? [];
      historyDirty = false;
    } catch {
      el.dList.innerHTML = '<p class="drawer-empty">Verlauf konnte nicht geladen werden.</p>';
      return;
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
el.drawer.addEventListener('click', async (e) => {
  if (e.target.closest('[data-close-drawer]')) return closeDrawer();
  const open = e.target.closest('[data-open]');
  if (open) { closeDrawer(); return go(`#c/${open.dataset.open}`); }
  const del = e.target.closest('[data-del]');
  if (del) {
    if (!confirm('Diesen Chat löschen?')) return;
    const id = del.dataset.del;
    const res = await fetch(`/api/chat/${encodeURIComponent(id)}`, { method: 'DELETE' });
    if (!res.ok) return toast('Löschen fehlgeschlagen.');
    historyItems = historyItems.filter((c) => c.id !== id);
    renderHistory();
    if (state.chat?.id === id) go('');
    toast('Chat gelöscht');
  }
});

// ── Bestenliste ───────────────────────────────────────────────────
async function showBoard() {
  if (state.chat) resetChat();
  showView('board');
  const list = $('#board-list');
  const sub = $('#board-sub');
  sub.textContent = 'Lädt …';
  list.innerHTML = '';
  try {
    const res = await fetch('/api/chat/leaderboard');
    const data = await res.json();
    if (!data.models?.length) {
      sub.textContent = 'Noch keine Stimmen. Starte ein Battle, stimme ab, und die Modelle landen hier.';
      list.innerHTML = '<li class="board-empty"><button class="btn" id="board-start">Battle starten</button></li>';
      $('#board-start').addEventListener('click', () => {
        state.mode = 'battle';
        store.set('vais.mode', 'battle');
        go('');
        renderControls();
        el.prompt.focus();
      });
      return;
    }
    sub.textContent = `Elo-Wertung aus ${data.totalVotes} ${data.totalVotes === 1 ? 'Stimme' : 'Stimmen'} im Battle-Modus.`;
    list.innerHTML = data.models.map((m, i) => `
      <li class="board-row">
        <span class="b-rank">${i + 1}</span>
        ${modelLogo(m)}
        <span class="b-name"><b></b><small></small></span>
        <span class="b-score"><b>${m.rating}</b><small>${m.votes} ${m.votes === 1 ? 'Stimme' : 'Stimmen'}</small></span>
      </li>`).join('');
    list.querySelectorAll('.b-name').forEach((n, i) => {
      n.querySelector('b').textContent = data.models[i].name;
      n.querySelector('small').textContent = data.models[i].maker;
    });
  } catch {
    sub.textContent = 'Die Bestenliste konnte nicht geladen werden.';
  }
}

// ── Start ─────────────────────────────────────────────────────────
async function init() {
  const me = await fetch('/api/auth/me');
  if (!me.ok) return location.replace('/login');
  const { user } = await me.json();
  avatar.textContent = user.email[0].toUpperCase();
  avatar.setAttribute('aria-label', `Konto: ${user.email}`);
  $('#menu-email').textContent = user.email;
  $('#d-avatar').textContent = user.email[0].toUpperCase();
  $('#d-email').textContent = user.email;

  renderControls();
  updateSend();
  try {
    const res = await fetch('/api/chat/models');
    const data = await res.json();
    state.models = data.models ?? [];
    $('#demo-note').hidden = !data.demo;
  } catch {
    toast('Modelle konnten nicht geladen werden.');
  }
  // Gespeicherte Auswahl prüfen, sonst die ersten Modelle nehmen
  state.picks = [0, 1].map((i) => (modelById(state.picks[i]) ? state.picks[i] : state.models[i]?.id ?? null));
  if (state.picks[0] && state.picks[0] === state.picks[1]) state.picks[1] = state.models.find((m) => m.id !== state.picks[0])?.id ?? null;
  fitPicks();
  renderControls();
  route();
}

init();

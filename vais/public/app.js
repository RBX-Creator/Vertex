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

const MODES = {
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
  picks: store.get('vais.picks', [null, null]),
  models: [],
  chat: null, // { id, mode, labels, names, winner, turns: [{ user, answers: [{ text, status, error }] }] }
  controllers: new Set(),
};
if (!MODES[state.mode]) state.mode = 'battle';

const el = {
  stage: $('#stage'),
  home: $('#home'),
  thread: $('#thread'),
  title: $('#chat-title'),
  newChat: $('#new-chat'),
  form: $('#composer'),
  prompt: $('#prompt'),
  send: $('#send'),
  modeBtn: $('#mode-btn'),
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

el.modeBtn.addEventListener('click', (e) => { e.stopPropagation(); toggleModeMenu(); });
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
  const current = modelById(state.picks[slot]);
  sheetCap = current?.caps.includes('text') || !current ? 'text' : current.caps[0];
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
  if (chat.mode === 'battle') return chat.names ? chat.names[side] : `Assistent ${'AB'[side]}`;
  return chat.labels[side];
}

function showThread(on) {
  el.home.hidden = on;
  el.thread.hidden = !on;
  el.newChat.hidden = !on;
}

function resetChat() {
  for (const c of state.controllers) c.abort();
  state.controllers.clear();
  state.chat = null;
  el.thread.innerHTML = '';
  el.title.textContent = '';
  el.vote.hidden = true;
  el.voteResult.hidden = true;
  showThread(false);
  renderControls();
  updateSend();
}

el.newChat.addEventListener('click', () => { resetChat(); el.prompt.focus(); });

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
        ${turn.answers.map((_, side) => `
          <article class="card" data-side="${side}">
            <header class="card-head">
              <span class="card-label"></span>
              <div class="card-actions">
                <button class="card-btn" data-act="regen" aria-label="Neu generieren" title="Neu generieren">${ICON.regen}</button>
                <button class="card-btn" data-act="copy" aria-label="Kopieren" title="Kopieren">${ICON.copy}</button>
                <button class="card-btn" data-act="expand" aria-label="Vollbild" title="Vollbild">${ICON.expand}</button>
              </div>
            </header>
            <div class="card-body md"></div>
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

  const body = $('.card-body', card);
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
  Object.assign(a, { text: '', status: 'streaming', error: null });
  updateCard(turnIndex, side);

  const ctrl = new AbortController();
  state.controllers.add(ctrl);
  updateSend();
  try {
    const res = await fetch('/api/chat/stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chatId: chat.id, side, messages: buildMessages(turnIndex, side) }),
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
        if (msg.t) { a.text += msg.t; scheduleUpdate(turnIndex, side); }
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
  if (!chat || chat.mode === 'direct' || chat.winner) return;
  const last = chat.turns.at(-1);
  el.vote.hidden = !last.answers.every((a) => a.status === 'done' && a.text);
}

async function send() {
  const text = el.prompt.value.trim();
  if (!text || busy()) return;
  if (!state.models.length) return toast('Modelle konnten nicht geladen werden. Lade die Seite neu.');

  if (!state.chat) {
    if (state.mode !== 'battle') {
      const need = state.mode === 'sxs' ? 2 : 1;
      const missing = state.picks.slice(0, need).findIndex((id) => !modelById(id));
      if (missing !== -1) return openSheet(missing);
    }
    const body = { mode: state.mode };
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
    showThread(true);
    renderControls();
  }

  const chat = state.chat;
  el.prompt.value = '';
  autosize();
  el.vote.hidden = true;
  el.voteResult.hidden = true;

  const sides = chat.mode === 'direct' ? 1 : 2;
  chat.turns.push({ user: text, answers: Array.from({ length: sides }, () => ({ text: '', status: 'streaming', error: null })) });
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

  if (act === 'copy') {
    try {
      await navigator.clipboard.writeText(a.text);
      btn.innerHTML = ICON.check;
      setTimeout(() => (btn.innerHTML = ICON.copy), 1500);
      toast('Kopiert');
    } catch {
      toast('Kopieren nicht möglich');
    }
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
  if (!$('#account-menu').hidden && !$('.account').contains(e.target)) toggleAccount(false);
});
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  if (!$('#expand').hidden) $('#expand').hidden = true;
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

// ── Start ─────────────────────────────────────────────────────────
async function init() {
  const me = await fetch('/api/auth/me');
  if (!me.ok) return location.replace('/login');
  const { user } = await me.json();
  avatar.textContent = user.email[0].toUpperCase();
  avatar.setAttribute('aria-label', `Konto: ${user.email}`);
  $('#menu-email').textContent = user.email;

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
  renderControls();
}

init();

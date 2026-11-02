// Willkommens-Tour beim ersten Besuch: hebt nacheinander die wichtigsten Knöpfe hervor
import { t } from './i18n.js';

const KEY = 'vais_tour_done';
const STEPS = () => [
  { title: t('Willkommen bei VAIs 👋', 'Welcome to VAIs 👋'), text: t('Hier nutzt du die besten KI-Modelle kostenlos – und vergleichst sie miteinander. Eine kurze Tour?', 'Use the best AI models for free – and compare them. A quick tour?') },
  { target: '#mode-btn', title: t('Modus', 'Mode'), text: t('Agent X erledigt Aufgaben selbstständig. Im Battle antworten zwei geheime Modelle und du stimmst ab. Oder nutze zwei Modelle nebeneinander bzw. eins direkt.', 'Agent X does tasks on its own. In Battle two hidden models answer and you vote. Or use two models side by side, or one directly.') },
  { target: '#modality-btn', title: t('Was soll entstehen?', 'What do you want?'), text: t('Text, Code und Webseiten, Websuche mit Quellen oder Bilder.', 'Text, code and websites, web search with sources, or images.') },
  { target: '.composer', title: t('Frag irgendwas', 'Ask anything'), text: t('Mit + hängst du Bilder und PDFs an, mit dem Mikrofon sprichst du deine Frage.', 'Use + to attach images and PDFs, or tap the microphone to speak.') },
  { target: '#open-drawer', title: t('Verlauf & Bestenliste', 'History & leaderboard'), text: t('Hier findest du deine Chats, die Bestenliste der Modelle, deine Statistik und die Einstellungen.', 'Here you find your chats, the model leaderboard, your stats and settings.') },
];

export function tourDone() {
  try { return !!localStorage.getItem(KEY); } catch { return true; }
}

export function startTour() {
  if (document.querySelector('.tour')) return;
  const steps = STEPS();
  let i = 0;
  const root = document.createElement('div');
  root.className = 'tour';
  root.innerHTML = `
    <div class="tour-spot" aria-hidden="true"></div>
    <div class="tour-card" role="dialog" aria-modal="true" aria-labelledby="tour-title">
      <div class="tour-top">
        <p class="tour-count"></p>
        <button type="button" class="tour-skip">${t('Überspringen', 'Skip')}</button>
      </div>
      <h2 id="tour-title"></h2>
      <p class="tour-text"></p>
      <div class="tour-actions">
        <span class="tour-dots" aria-hidden="true">${steps.map(() => '<i></i>').join('')}</span>
        <button type="button" class="tour-back">${t('Zurück', 'Back')}</button>
        <button type="button" class="tour-next"></button>
      </div>
    </div>`;
  document.body.append(root);
  const spot = root.querySelector('.tour-spot');
  const card = root.querySelector('.tour-card');
  const prevFocus = document.activeElement;

  function place() {
    const step = steps[i];
    const target = step.target && document.querySelector(step.target);
    const rect = target && target.offsetParent !== null ? target.getBoundingClientRect() : null;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    if (rect) {
      const pad = 6;
      Object.assign(spot.style, { opacity: '1', left: `${rect.left - pad}px`, top: `${rect.top - pad}px`, width: `${rect.width + pad * 2}px`, height: `${rect.height + pad * 2}px` });
      root.classList.remove('center');
      const cw = Math.min(340, vw - 32);
      const left = Math.min(Math.max(16, rect.left + rect.width / 2 - cw / 2), vw - cw - 16);
      card.style.width = `${cw}px`;
      card.style.left = `${left}px`;
      const below = rect.bottom + 14;
      const h = card.offsetHeight;
      if (below + h < vh - 16) { card.style.top = `${below}px`; card.style.bottom = ''; }
      else { card.style.top = `${Math.max(16, rect.top - 14 - h)}px`; card.style.bottom = ''; }
    } else {
      Object.assign(spot.style, { opacity: '0', left: '50%', top: '50%', width: '0px', height: '0px' });
      root.classList.add('center');
      card.style.width = card.style.left = card.style.top = card.style.bottom = '';
    }
  }

  function show() {
    const step = steps[i];
    root.querySelector('.tour-count').textContent = `${i + 1} / ${steps.length}`;
    root.querySelector('#tour-title').textContent = step.title;
    root.querySelector('.tour-text').textContent = step.text;
    root.querySelector('.tour-back').hidden = i === 0;
    root.querySelector('.tour-skip').style.visibility = i === steps.length - 1 ? 'hidden' : '';
    root.querySelector('.tour-next').textContent = i === 0 ? t('Tour starten', 'Start tour') : i === steps.length - 1 ? t('Los geht’s', 'Let’s go') : t('Weiter', 'Next');
    root.querySelectorAll('.tour-dots i').forEach((d, k) => d.classList.toggle('on', k === i));
    card.classList.remove('in');
    void card.offsetWidth; // Animation neu starten
    card.classList.add('in');
    place();
    root.querySelector('.tour-next').focus({ preventScroll: true });
  }

  function end() {
    try { localStorage.setItem(KEY, '1'); } catch { /* egal */ }
    window.removeEventListener('resize', place);
    document.removeEventListener('keydown', onKey, true);
    root.classList.add('out');
    setTimeout(() => root.remove(), 200);
    prevFocus?.focus?.({ preventScroll: true });
  }
  function onKey(e) {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); end(); }
    if (e.key === 'ArrowRight') root.querySelector('.tour-next').click();
    if (e.key === 'ArrowLeft' && i > 0) { i--; show(); }
  }
  root.querySelector('.tour-next').addEventListener('click', () => { if (i === steps.length - 1) end(); else { i++; show(); } });
  root.querySelector('.tour-back').addEventListener('click', () => { if (i > 0) { i--; show(); } });
  root.querySelector('.tour-skip').addEventListener('click', end);
  window.addEventListener('resize', place);
  document.addEventListener('keydown', onKey, true);
  show();
}

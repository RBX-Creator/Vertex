// Sprachen der Oberfläche. Deutsch und Englisch stehen direkt im Code:
// Im HTML: data-en="English" (Text), data-en-placeholder, data-en-aria-label, data-en-title
// Im Code: t('Deutsch', 'English')
// Türkisch, Spanisch, Französisch und Ukrainisch übersetzt VAIs aus dem Englischen (/i18n/<sprache>.json).
export const EXTRA_LANGS = ['tr', 'es', 'fr', 'uk'];
export const LANGUAGES = [
  ['de', 'Deutsch'], ['en', 'English'], ['tr', 'Türkçe'], ['es', 'Español'], ['fr', 'Français'], ['uk', 'Українська'],
];
const raw = document.documentElement.dataset.lang;
export const LANG = LANGUAGES.some(([code]) => code === raw) ? raw : 'de';
export const LOCALE = { de: 'de-DE', en: 'en-US', tr: 'tr-TR', es: 'es-ES', fr: 'fr-FR', uk: 'uk-UA' }[LANG];

let DICT = {};
if (EXTRA_LANGS.includes(LANG)) {
  const key = `vais.dict.${LANG}`;
  try { DICT = JSON.parse(localStorage.getItem(key)) || {}; } catch { DICT = {}; }
  const fresh = fetch(`/i18n/${LANG}.json`).then((r) => r.json()).then((d) => {
    try { localStorage.setItem(key, JSON.stringify(d.dict ?? {})); } catch { /* egal */ }
    return d.dict ?? {};
  }).catch(() => null);
  // Beim ersten Mal auf die Übersetzung warten, danach sofort starten und still aktualisieren
  if (!Object.keys(DICT).length) DICT = (await fresh) ?? {};
  else fresh.then((d) => { if (d) DICT = d; });
}
const tr = (en) => DICT[en] ?? en;

export const t = (de, en) => (LANG === 'de' ? de : LANG === 'en' ? en : tr(en));

export function translateDom(root = document) {
  if (LANG === 'de') {
    const de = document.querySelector('meta[name="title-de"]')?.content;
    if (de) document.title = de;
    return;
  }
  const map = (v) => (LANG === 'en' ? v : tr(v));
  root.querySelectorAll('[data-en]').forEach((el) => { el.textContent = map(el.dataset.en); });
  for (const attr of ['placeholder', 'aria-label', 'title']) {
    root.querySelectorAll(`[data-en-${attr}]`).forEach((el) => el.setAttribute(attr, map(el.getAttribute(`data-en-${attr}`))));
  }
  const title = document.querySelector('meta[name="title-en"]')?.content;
  if (title) document.title = map(title);
}

function save(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* egal */ }
}

export function setLang(lang) {
  save('vais.lang', lang);
  document.cookie = `vais_lang=${lang}; path=/; max-age=31536000; samesite=lax`;
  location.reload();
}

// 'system' | 'light' | 'dark'
export function getTheme() {
  try { return JSON.parse(localStorage.getItem('vais.theme')) || 'system'; } catch { return 'system'; }
}
export function setTheme(theme) {
  save('vais.theme', theme);
  if (theme === 'light' || theme === 'dark') document.documentElement.dataset.theme = theme;
  else delete document.documentElement.dataset.theme;
  window.__vaisPaintBar?.();
}

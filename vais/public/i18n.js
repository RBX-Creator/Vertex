// Deutsch / Englisch für die Oberfläche.
// Im HTML: data-en="English" (Text), data-en-placeholder, data-en-aria-label, data-en-title
// Im Code: t('Deutsch', 'English')
export const LANG = document.documentElement.dataset.lang === 'en' ? 'en' : 'de';
export const t = (de, en) => (LANG === 'en' ? en : de);
export const LOCALE = LANG === 'en' ? 'en-US' : 'de-DE';

export function translateDom(root = document) {
  if (LANG !== 'en') return;
  root.querySelectorAll('[data-en]').forEach((el) => { el.textContent = el.dataset.en; });
  for (const attr of ['placeholder', 'aria-label', 'title']) {
    root.querySelectorAll(`[data-en-${attr}]`).forEach((el) => el.setAttribute(attr, el.getAttribute(`data-en-${attr}`)));
  }
  const title = document.querySelector('meta[name="title-en"]')?.content;
  if (title) document.title = title;
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

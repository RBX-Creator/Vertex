// Sprache pro Anfrage (Deutsch/Englisch), damit Meldungen überall passend übersetzt werden.
import { AsyncLocalStorage } from 'node:async_hooks';

const store = new AsyncLocalStorage();

export function langFromRequest(req) {
  const cookie = /(?:^|;\s*)vais_lang=(en|de|tr|es|fr|uk)\b/.exec(req.headers.cookie || '')?.[1];
  if (cookie) return cookie;
  // sonst die Sprache des Browsers, wenn wir sie haben – ansonsten Deutsch
  const accept = (req.headers['accept-language'] || '').slice(0, 2).toLowerCase();
  return ['de', 'en', ...EXTRA_LANGS].includes(accept) ? accept : 'de';
}

export function langMiddleware(req, res, next) {
  store.run({ lang: langFromRequest(req) }, next);
}

export const lang = () => store.getStore()?.lang ?? 'de';
// Code in einer bestimmten Sprache ausführen (z. B. für den Telegram-Bot, ohne Web-Anfrage)
export const withLang = (l, fn) => store.run({ lang: ['de', 'en', ...['tr', 'es', 'fr', 'uk']].includes(l) ? l : 'de' }, fn);

// Weitere Sprachen: übersetzt aus dem Englischen (src/ui-i18n.js)
export const EXTRA_LANGS = ['tr', 'es', 'fr', 'uk'];
const dicts = {};
export const setDict = (l, d) => { dicts[l] = d; };

// t('Deutscher Text', 'English text')
export const t = (de, en) => {
  const l = lang();
  if (l === 'de') return de;
  if (l === 'en') return en;
  return dicts[l]?.[en] ?? en;
};

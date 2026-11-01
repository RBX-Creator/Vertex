// Sprache pro Anfrage (Deutsch/Englisch), damit Meldungen überall passend übersetzt werden.
import { AsyncLocalStorage } from 'node:async_hooks';

const store = new AsyncLocalStorage();

export function langFromRequest(req) {
  const cookie = /(?:^|;\s*)vais_lang=(en|de)\b/.exec(req.headers.cookie || '')?.[1];
  if (cookie) return cookie;
  return /^de\b/i.test(req.headers['accept-language'] || '') ? 'de' : 'en';
}

export function langMiddleware(req, res, next) {
  store.run({ lang: langFromRequest(req) }, next);
}

export const lang = () => store.getStore()?.lang ?? 'de';

// t('Deutscher Text', 'English text')
export const t = (de, en) => (lang() === 'en' ? en : de);

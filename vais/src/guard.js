// Schutz gegen „Limit-Diebstahl“: Wer die KI-Schnittstellen missbrauchen will (viele Konten, Skripte,
// Helfer-Funktionen in Dauerschleife), stößt hier an Grenzen – normale Nutzer merken davon nichts.
// Alles im Speicher, pro Tag (deutsche Zeit); nach einem Neustart fängt es neu an.
import { t } from './i18n.js';
import { HttpError } from './auth.js';
const DAY = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit' });
const dayKey = () => DAY.format(new Date());

const counters = new Map(); // 'tag|art|wer' → Anzahl
let today = dayKey();
function bump(kind, who, max) {
  const d = dayKey();
  if (d !== today) { counters.clear(); today = d; }
  const key = `${kind}|${who}`;
  const n = (counters.get(key) ?? 0) + 1;
  if (n > max) return false;
  counters.set(key, n);
  return true;
}
const ipOf = (req) => String(req.ip ?? req.socket?.remoteAddress ?? '?');

// Helfer-Funktionen (✨ verbessern, Vorschläge, Spracheingabe …): Tagesgrenze pro Konto und pro Netz
const HELPER_DAILY = { extras: 400, improve: 120, transcribe: 400, tts: 400, summary: 200 };
export function helperQuota(req, name) {
  const max = HELPER_DAILY[name] ?? 200;
  if (!bump(`h:${name}`, `u:${req.user?.id}`, max) || !bump(`h:${name}`, `ip:${ipOf(req)}`, max * 6)) {
    throw new HttpError(429, t('Diese Funktion ist für heute ausgeschöpft. Morgen geht es weiter.', 'This feature is used up for today. It resets tomorrow.'));
  }
}

// Antworten über viele Konten aus demselben Netz: großzügige Grenze (Schulen/WLAN teilen sich eine Adresse)
export function ipAnswerQuota(ip, kind, perUserDefault) {
  if (!ip || !perUserDefault) return;
  if (!bump(`a:${kind}`, `ip:${ip}`, Math.max(50, perUserDefault * 10))) {
    throw new HttpError(429, t('Aus deinem Netz kamen heute sehr viele Anfragen. Bitte versuch es morgen wieder.', 'Very many requests came from your network today. Please try again tomorrow.'), { usage: true });
  }
}
export function undoIpAnswer(ip, kind) {
  const key = `a:${kind}|ip:${ip}`;
  const n = counters.get(key);
  if (n) counters.set(key, n - 1);
}

// Neue Konten: höchstens ein paar pro Netz und Tag, keine Wegwerf-Adressen
const DISPOSABLE = new Set([
  'mailinator.com', 'guerrillamail.com', 'guerrillamail.de', 'sharklasers.com', 'grr.la', '10minutemail.com', '10minutemail.net', 'temp-mail.org', 'tempmail.com',
  'tempmail.net', 'tempmailo.com', 'tempr.email', 'throwawaymail.com', 'yopmail.com', 'yopmail.fr', 'getnada.com', 'nada.email', 'trashmail.com', 'trashmail.de',
  'dispostable.com', 'maildrop.cc', 'mintemail.com', 'mohmal.com', 'emailondeck.com', 'fakeinbox.com', 'mailnesia.com', 'mytemp.email', 'tempail.com',
  'spamgourmet.com', 'wegwerfmail.de', 'wegwerfmail.net', 'einrot.com', 'byom.de', 'trash-mail.com', 'mail-temp.com', 'luxusmail.org', 'emailfake.com',
  'mailpoof.com', 'inboxkitten.com', 'discard.email', 'burnermail.io', 'moakt.com', 'tmail.ws', 'tmpmail.org', 'tmpmail.net', 'cuvox.de', 'armyspy.com', 'dayrep.com',
  'fleckens.hu', 'gustr.com', 'jourrapide.com', 'rhyta.com', 'superrito.com', 'teleworm.us', 'spambog.com', 'spambog.de', 'sofort-mail.de', 'trashinbox.net',
]);
export function signupGuard(req, email) {
  const domain = String(email).split('@')[1]?.toLowerCase() ?? '';
  if (DISPOSABLE.has(domain) || [...DISPOSABLE].some((d) => domain.endsWith(`.${d}`))) {
    throw new HttpError(400, t('Bitte nutze eine richtige E-Mail-Adresse (keine Wegwerf-Adresse).', 'Please use a real email address (no disposable address).'));
  }
  if (!bump('signup', `ip:${ipOf(req)}`, Number(process.env.SIGNUPS_PER_IP_DAY || 6))) {
    throw new HttpError(429, t('Aus deinem Netz wurden heute schon viele Konten erstellt. Bitte versuch es morgen wieder.', 'Many accounts were already created from your network today. Please try again tomorrow.'));
  }
}

// Bestätigungs-/Reset-Codes: begrenzt pro Adresse und pro Netz (gegen Raten und Mail-Spam)
export function codeGuard(req, email) {
  if (!bump('code', `e:${email}`, 8) || (req && !bump('code', `ip:${ipOf(req)}`, Number(process.env.CODES_PER_IP_DAY || 30)))) {
    throw new HttpError(429, t('Für heute wurden zu viele Codes angefordert. Bitte versuch es morgen wieder.', 'Too many codes were requested today. Please try again tomorrow.'));
  }
}

// Für Tests
export const __resetGuard = () => counters.clear();

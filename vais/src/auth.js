import { Router } from 'express';
import { randomBytes, randomInt, scrypt, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';
import { get, run, purgeChats } from './db.js';
import { t } from './i18n.js';
import { isAdmin } from './config.js';
import { sendCode } from './mailer.js';

const scryptAsync = promisify(scrypt);

const CODE_TTL = 10 * 60 * 1000;          // Code 10 Minuten gültig
const RESEND_COOLDOWN = 45 * 1000;        // frühestens alle 45 s neu senden
const MAX_ATTEMPTS = 5;                   // Fehlversuche pro Code
const SESSION_TTL = 30 * 24 * 3600 * 1000; // 30 Tage eingeloggt
const COOKIE = 'vais_session';

const sha256 = (s) => createHash('sha256').update(s).digest('hex');

// ── Passwörter ────────────────────────────────────────────────────
async function hashPassword(password) {
  const salt = randomBytes(16);
  const key = await scryptAsync(password, salt, 64);
  return `scrypt$${salt.toString('hex')}$${key.toString('hex')}`;
}

async function checkPassword(password, stored) {
  const [, saltHex, keyHex] = stored.split('$');
  const key = await scryptAsync(password, Buffer.from(saltHex, 'hex'), 64);
  return timingSafeEqual(key, Buffer.from(keyHex, 'hex'));
}

// ── Eingaben prüfen ───────────────────────────────────────────────
const normEmail = (e) => String(e ?? '').trim().toLowerCase();
const validEmail = (e) => e.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e);
const validPassword = (p) => typeof p === 'string' && p.length >= 8 && p.length <= 200;

export class HttpError extends Error {
  constructor(status, message, extra = {}) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
}

// ── Einmal-Codes ──────────────────────────────────────────────────
async function issueCode(email, purpose) {
  const existing = await get('SELECT sent_at FROM codes WHERE email = ? AND purpose = ?', email, purpose);
  const now = Date.now();
  if (existing && now - existing.sent_at < RESEND_COOLDOWN) {
    const wait = Math.ceil((RESEND_COOLDOWN - (now - existing.sent_at)) / 1000);
    throw new HttpError(429, t(`Bitte warte noch ${wait} Sekunden.`, `Please wait ${wait} more seconds.`), { retryAfter: wait });
  }
  const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
  await run(`
    INSERT INTO codes (email, purpose, code_hash, expires_at, sent_at, attempts)
    VALUES (?, ?, ?, ?, ?, 0)
    ON CONFLICT(email, purpose) DO UPDATE SET
      code_hash = excluded.code_hash, expires_at = excluded.expires_at,
      sent_at = excluded.sent_at, attempts = 0
  `, email, purpose, sha256(`${email}:${code}`), now + CODE_TTL, now);

  try {
    await sendCode(email, code, purpose);
  } catch (err) {
    console.error('E-Mail-Versand fehlgeschlagen:', err.message);
    await run('DELETE FROM codes WHERE email = ? AND purpose = ?', email, purpose);
    throw new HttpError(502, t('Die E-Mail konnte nicht gesendet werden. Bitte versuche es später erneut.', 'The email could not be sent. Please try again later.'));
  }
}

async function consumeCode(email, purpose, code) {
  const row = await get('SELECT * FROM codes WHERE email = ? AND purpose = ?', email, purpose);
  if (!row || row.expires_at < Date.now()) {
    throw new HttpError(400, t('Der Code ist abgelaufen. Fordere einen neuen an.', 'The code has expired. Request a new one.'));
  }
  if (row.attempts >= MAX_ATTEMPTS) {
    throw new HttpError(429, t('Zu viele Fehlversuche. Fordere einen neuen Code an.', 'Too many failed attempts. Request a new code.'));
  }
  const given = Buffer.from(sha256(`${email}:${String(code ?? '').trim()}`));
  if (!timingSafeEqual(given, Buffer.from(row.code_hash))) {
    await run('UPDATE codes SET attempts = attempts + 1 WHERE email = ? AND purpose = ?', email, purpose);
    const left = MAX_ATTEMPTS - row.attempts - 1;
    throw new HttpError(400, left > 0 ? t(`Falscher Code. Noch ${left} Versuch${left === 1 ? '' : 'e'}.`, `Wrong code. ${left} attempt${left === 1 ? '' : 's'} left.`) : t('Zu viele Fehlversuche. Fordere einen neuen Code an.', 'Too many failed attempts. Request a new code.'));
  }
  await run('DELETE FROM codes WHERE email = ? AND purpose = ?', email, purpose);
}

// ── Sessions ──────────────────────────────────────────────────────
async function startSession(res, userId) {
  if ((await get('SELECT blocked FROM users WHERE id = ?', userId))?.blocked) {
    throw new HttpError(403, t('Dieses Konto wurde gesperrt. Schreib uns, wenn du denkst, dass das ein Fehler ist.', 'This account has been blocked. Contact us if you think this is a mistake.'));
  }
  const token = randomBytes(32).toString('base64url');
  await run('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)', sha256(token), userId, Date.now() + SESSION_TTL);
  res.cookie(COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.COOKIE_SECURE === 'true',
    maxAge: SESSION_TTL,
    path: '/',
  });
}

function readCookie(req) {
  const header = req.headers.cookie || '';
  for (const part of header.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === COOKIE) return decodeURIComponent(v.join('='));
  }
  return null;
}

export async function currentUser(req) {
  const token = readCookie(req);
  if (!token) return null;
  return (await get(`
    SELECT u.id, u.email, u.created_at FROM sessions s
    JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = ? AND s.expires_at > ? AND (u.blocked IS NULL OR u.blocked = 0)
  `, sha256(token), Date.now())) ?? null;
}

// ── Einfaches Rate-Limit pro IP ───────────────────────────────────
const hits = new Map();
function rateLimit(req, res, next) {
  const now = Date.now();
  const windowMs = 10 * 60 * 1000;
  const list = (hits.get(req.ip) || []).filter((t) => now - t < windowMs);
  list.push(now);
  hits.set(req.ip, list);
  if (list.length > 60) return res.status(429).json({ error: t('Zu viele Anfragen. Bitte warte ein paar Minuten.', 'Too many requests. Please wait a few minutes.') });
  next();
}
setInterval(() => {
  const now = Date.now();
  for (const [ip, list] of hits) if (list.every((t) => now - t > 10 * 60 * 1000)) hits.delete(ip);
}, 5 * 60 * 1000).unref();

// ── Routen ────────────────────────────────────────────────────────
export const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

export const auth = Router();
auth.use(rateLimit);

// Schritt 1: E-Mail eingeben → anmelden oder registrieren?
auth.post('/start', wrap(async (req, res) => {
  const email = normEmail(req.body?.email);
  if (!validEmail(email)) throw new HttpError(400, t('Bitte gib eine gültige E-Mail-Adresse ein.', 'Please enter a valid email address.'));
  const user = await get('SELECT verified FROM users WHERE email = ?', email);
  res.json({ mode: user?.verified ? 'login' : 'register' });
}));

// Registrieren → Bestätigungscode per E-Mail
auth.post('/register', wrap(async (req, res) => {
  const email = normEmail(req.body?.email);
  const { password } = req.body ?? {};
  if (!validEmail(email)) throw new HttpError(400, t('Bitte gib eine gültige E-Mail-Adresse ein.', 'Please enter a valid email address.'));
  if (!validPassword(password)) throw new HttpError(400, t('Das Passwort muss mindestens 8 Zeichen lang sein.', 'The password must be at least 8 characters long.'));

  const user = await get('SELECT id, verified FROM users WHERE email = ?', email);
  if (user?.verified) throw new HttpError(409, t('Zu dieser E-Mail gibt es schon ein Konto. Melde dich an.', 'An account with this email already exists. Please sign in.'));

  const hash = await hashPassword(password);
  if (user) {
    // Noch nicht bestätigtes Konto: Passwort darf neu gesetzt werden
    await run('UPDATE users SET password_hash = ? WHERE id = ?', hash, user.id);
  } else {
    await run('INSERT INTO users (email, password_hash, verified, created_at) VALUES (?, ?, 0, ?)', email, hash, Date.now());
  }
  await issueCode(email, 'verify');
  res.json({ next: 'verify' });
}));

// Code aus der E-Mail eingeben → Konto aktiv + eingeloggt
auth.post('/verify', wrap(async (req, res) => {
  const email = normEmail(req.body?.email);
  const user = await get('SELECT id, verified FROM users WHERE email = ?', email);
  if (!user) throw new HttpError(400, t('Kein Konto zu dieser E-Mail gefunden.', 'No account found for this email.'));
  await consumeCode(email, 'verify', req.body?.code);
  await run('UPDATE users SET verified = 1 WHERE id = ?', user.id);
  await startSession(res, user.id);
  res.json({ ok: true });
}));

// Code erneut senden
auth.post('/resend', wrap(async (req, res) => {
  const email = normEmail(req.body?.email);
  const purpose = req.body?.purpose === 'reset' ? 'reset' : 'verify';
  const user = await get('SELECT verified FROM users WHERE email = ?', email);
  const allowed = purpose === 'verify' ? user && !user.verified : user?.verified;
  if (allowed) await issueCode(email, purpose);
  res.json({ ok: true });
}));

// Schutz vor Passwort-Raten: max. 8 Fehlversuche pro E-Mail in 15 Minuten
const failed = new Map();
const FAIL_WINDOW = 15 * 60 * 1000;
function tooManyFails(email) {
  const now = Date.now();
  const list = (failed.get(email) || []).filter((ts) => now - ts < FAIL_WINDOW);
  failed.set(email, list);
  return list.length >= 8;
}
function noteFail(email) { failed.set(email, [...(failed.get(email) || []), Date.now()]); }
setInterval(() => {
  const now = Date.now();
  for (const [k, list] of failed) if (list.every((ts) => now - ts > FAIL_WINDOW)) failed.delete(k);
}, 5 * 60 * 1000).unref();
const lockedError = () => new HttpError(429, t('Zu viele falsche Passwörter. Warte 15 Minuten oder setze dein Passwort zurück.', 'Too many wrong passwords. Wait 15 minutes or reset your password.'));

// Anmelden
auth.post('/login', wrap(async (req, res) => {
  const email = normEmail(req.body?.email);
  const { password } = req.body ?? {};
  if (tooManyFails(email)) throw lockedError();
  const user = await get('SELECT id, password_hash, verified FROM users WHERE email = ?', email);
  const ok = user && typeof password === 'string' && (await checkPassword(password, user.password_hash));
  if (!ok) {
    noteFail(email);
    throw new HttpError(401, t('E-Mail oder Passwort ist falsch.', 'Email or password is incorrect.'));
  }
  failed.delete(email);
  if (!user.verified) {
    await issueCode(email, 'verify').catch((e) => { if (e.status !== 429) throw e; });
    return res.json({ next: 'verify' });
  }
  await startSession(res, user.id);
  res.json({ ok: true });
}));

// Passwort vergessen → Reset-Code
auth.post('/forgot', wrap(async (req, res) => {
  const email = normEmail(req.body?.email);
  if (!validEmail(email)) throw new HttpError(400, t('Bitte gib eine gültige E-Mail-Adresse ein.', 'Please enter a valid email address.'));
  const user = await get('SELECT verified FROM users WHERE email = ?', email);
  if (user?.verified) await issueCode(email, 'reset');
  res.json({ next: 'reset' });
}));

// Neues Passwort mit Reset-Code setzen
auth.post('/reset', wrap(async (req, res) => {
  const email = normEmail(req.body?.email);
  const { password, code } = req.body ?? {};
  if (!validPassword(password)) throw new HttpError(400, t('Das Passwort muss mindestens 8 Zeichen lang sein.', 'The password must be at least 8 characters long.'));
  const user = await get('SELECT id FROM users WHERE email = ? AND verified = 1', email);
  if (!user) throw new HttpError(400, t('Der Code ist abgelaufen. Fordere einen neuen an.', 'The code has expired. Request a new one.'));
  await consumeCode(email, 'reset', code);
  await run('UPDATE users SET password_hash = ? WHERE id = ?', await hashPassword(password), user.id);
  await run('DELETE FROM sessions WHERE user_id = ?', user.id); // überall abmelden
  await startSession(res, user.id);
  res.json({ ok: true });
}));

auth.post('/logout', wrap(async (req, res) => {
  const token = readCookie(req);
  if (token) await run('DELETE FROM sessions WHERE token_hash = ?', sha256(token));
  res.clearCookie(COOKIE, { path: '/' });
  res.json({ ok: true });
}));

// Passwort ändern (andere Geräte werden abgemeldet)
auth.post('/password', wrap(async (req, res) => {
  const me = await currentUser(req);
  if (!me) throw new HttpError(401, t('Nicht angemeldet.', 'Not signed in.'));
  const { current, password } = req.body ?? {};
  if (tooManyFails(me.email)) throw lockedError();
  const row = await get('SELECT password_hash FROM users WHERE id = ?', me.id);
  if (typeof current !== 'string' || !(await checkPassword(current, row.password_hash))) {
    noteFail(me.email);
    throw new HttpError(400, t('Das aktuelle Passwort ist falsch.', 'The current password is incorrect.'));
  }
  if (!validPassword(password)) throw new HttpError(400, t('Das neue Passwort muss mindestens 8 Zeichen lang sein.', 'The new password must be at least 8 characters long.'));
  await run('UPDATE users SET password_hash = ? WHERE id = ?', await hashPassword(password), me.id);
  await run('DELETE FROM sessions WHERE user_id = ? AND token_hash != ?', me.id, sha256(readCookie(req)));
  res.json({ ok: true });
}));

// Konto endgültig löschen
auth.post('/delete', wrap(async (req, res) => {
  const me = await currentUser(req);
  if (!me) throw new HttpError(401, t('Nicht angemeldet.', 'Not signed in.'));
  if (tooManyFails(me.email)) throw lockedError();
  const row = await get('SELECT password_hash FROM users WHERE id = ?', me.id);
  if (typeof req.body?.password !== 'string' || !(await checkPassword(req.body.password, row.password_hash))) {
    noteFail(me.email);
    throw new HttpError(400, t('Das Passwort ist falsch.', 'The password is incorrect.'));
  }
  await purgeChats(me.id);
  await run('DELETE FROM sessions WHERE user_id = ?', me.id);
  await run('DELETE FROM codes WHERE email = ?', me.email);
  await run('DELETE FROM users WHERE id = ?', me.id);
  res.clearCookie(COOKIE, { path: '/' });
  res.json({ ok: true });
}));

auth.get('/me', wrap(async (req, res) => {
  const user = await currentUser(req);
  if (!user) return res.status(401).json({ error: t('Nicht angemeldet.', 'Not signed in.') });
  res.json({ user: { email: user.email, admin: isAdmin(user) || undefined } });
}));

// Fehler einheitlich als JSON zurückgeben
export function errorHandler(err, req, res, _next) {
  if (err instanceof HttpError) return res.status(err.status).json({ error: err.message, ...err.extra });
  console.error(err);
  res.status(500).json({ error: t('Etwas ist schiefgelaufen. Bitte versuche es erneut.', 'Something went wrong. Please try again.') });
}
auth.use(errorHandler);

// Erinnerungen per Push-Benachrichtigung (Web Push, kostenlos).
// Die Schlüssel (VAPID) erzeugt VAIs beim ersten Start selbst und speichert sie in der Datenbank.
import { Router } from 'express';
import webpush from 'web-push';
import { get, run, all, getSetting, setSetting } from './db.js';
import { t } from './i18n.js';
import { HttpError, wrap } from './auth.js';
import { OWNER } from './config.js';

await run(`CREATE TABLE IF NOT EXISTS push_subs (
  endpoint TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  sub TEXT NOT NULL,
  created_at INTEGER NOT NULL
)`);
await run(`CREATE TABLE IF NOT EXISTS reminders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  text TEXT NOT NULL,
  due_at INTEGER NOT NULL,
  sent_at INTEGER,
  created_at INTEGER NOT NULL
)`);
await run('CREATE INDEX IF NOT EXISTS reminders_due ON reminders (sent_at, due_at)');

let keys = null;
try { keys = JSON.parse(await getSetting('vapid', 'null')); } catch { keys = null; }
if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) keys = { publicKey: process.env.VAPID_PUBLIC_KEY, privateKey: process.env.VAPID_PRIVATE_KEY };
if (!keys?.publicKey) {
  keys = webpush.generateVAPIDKeys();
  await setSetting('vapid', JSON.stringify(keys));
}
webpush.setVapidDetails(`mailto:${OWNER.email}`, keys.publicKey, keys.privateKey);

export const MAX_REMINDERS = 30;

// „2026-11-02T08:00“ ohne Zeitzone = deutsche Zeit
export function parseWhen(raw) {
  const s = String(raw ?? '').trim();
  if (!s) return NaN;
  if (/[zZ]|[+-]\d\d:?\d\d$/.test(s)) return Date.parse(s);
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (!m) return Date.parse(s);
  const [, y, mo, d, h, mi, se] = m.map(Number);
  const guess = Date.UTC(y, mo - 1, d, h, mi, se || 0);
  // Abstand zwischen UTC und Berlin zu diesem Zeitpunkt ermitteln
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Berlin', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
    .formatToParts(new Date(guess)).map((p) => [p.type, p.value]));
  const asBerlin = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
  return guess - (asBerlin - guess);
}

export async function addReminder(userId, text, when, inMinutes) {
  const due = Number.isFinite(Number(inMinutes)) && Number(inMinutes) > 0 ? Date.now() + Number(inMinutes) * 60_000 : parseWhen(when);
  if (!Number.isFinite(due)) throw new Error('Ungültige Zeit. Nutze das Format JJJJ-MM-TTTHH:MM (deutsche Zeit) oder in_minutes.');
  if (due < Date.now() - 60_000) throw new Error('Dieser Zeitpunkt liegt in der Vergangenheit.');
  if (due > Date.now() + 366 * 24 * 3600 * 1000) throw new Error('Höchstens ein Jahr im Voraus.');
  const open = await get('SELECT COUNT(*) AS n FROM reminders WHERE user_id = ? AND sent_at IS NULL', userId);
  if (Number(open?.n ?? 0) >= MAX_REMINDERS) throw new Error(`Es gibt schon ${MAX_REMINDERS} offene Erinnerungen.`);
  const clean = String(text ?? '').replace(/\s+/g, ' ').trim().slice(0, 200) || 'Erinnerung';
  await run('INSERT INTO reminders (user_id, text, due_at, created_at) VALUES (?, ?, ?, ?)', userId, clean, due, Date.now());
  const subs = await get('SELECT COUNT(*) AS n FROM push_subs WHERE user_id = ?', userId);
  const when2 = new Date(due).toLocaleString('de-DE', { timeZone: 'Europe/Berlin', dateStyle: 'full', timeStyle: 'short' });
  return `Erinnerung gespeichert für ${when2} (deutsche Zeit): „${clean}“.${Number(subs?.n ?? 0) ? '' : ' ACHTUNG: Der Nutzer hat Benachrichtigungen noch nicht erlaubt – sag ihm, dass er sie in den Einstellungen unter „Erinnerungen“ einschalten muss.'}`;
}

export const notifyUser = (userId, payload) => sendTo(userId, payload);

async function sendTo(userId, payload) {
  const subs = await all('SELECT endpoint, sub FROM push_subs WHERE user_id = ?', userId);
  let ok = 0;
  for (const s of subs) {
    try {
      await webpush.sendNotification(JSON.parse(s.sub), JSON.stringify(payload), { TTL: 6 * 3600 });
      ok++;
    } catch (err) {
      if (err.statusCode === 404 || err.statusCode === 410) await run('DELETE FROM push_subs WHERE endpoint = ?', s.endpoint);
      else console.error('Push fehlgeschlagen:', err.statusCode ?? '', err.message);
    }
  }
  return ok;
}

// Alle 30 Sekunden fällige Erinnerungen verschicken. Schläft der kostenlose Server,
// kommen sie beim Aufwachen (dann mit „verspätet“).
let busy = false;
async function tick() {
  if (busy) return;
  busy = true;
  try {
    const due = await all('SELECT id, user_id, text, due_at FROM reminders WHERE sent_at IS NULL AND due_at <= ? ORDER BY due_at LIMIT 50', Date.now());
    for (const r of due) {
      const late = Date.now() - Number(r.due_at) > 10 * 60_000;
      await run('UPDATE reminders SET sent_at = ? WHERE id = ?', Date.now(), r.id);
      await sendTo(Number(r.user_id), { title: late ? '⏰ Erinnerung (verspätet)' : '⏰ Erinnerung', body: r.text, tag: `rem-${r.id}`, url: '/' });
    }
    await run('DELETE FROM reminders WHERE sent_at IS NOT NULL AND sent_at < ?', Date.now() - 30 * 24 * 3600 * 1000);
  } catch (err) {
    console.error('Erinnerungen:', err.message);
  } finally {
    busy = false;
  }
}
setInterval(tick, 30_000).unref();
setTimeout(tick, 5_000).unref();

export const push = Router();

push.get('/', wrap(async (req, res) => {
  const [subs, list] = await Promise.all([
    get('SELECT COUNT(*) AS n FROM push_subs WHERE user_id = ?', req.user.id),
    all('SELECT id, text, due_at FROM reminders WHERE user_id = ? AND sent_at IS NULL ORDER BY due_at', req.user.id),
  ]);
  res.json({ publicKey: keys.publicKey, devices: Number(subs?.n ?? 0), reminders: list.map((r) => ({ id: Number(r.id), text: r.text, due: Number(r.due_at) })) });
}));

push.post('/subscribe', wrap(async (req, res) => {
  const sub = req.body?.subscription;
  const endpoint = String(sub?.endpoint ?? '');
  if (!/^https:\/\//.test(endpoint) || endpoint.length > 1000 || !sub?.keys?.p256dh || !sub?.keys?.auth) throw new HttpError(400, t('Ungültiges Abo.', 'Invalid subscription.'));
  const clean = { endpoint, keys: { p256dh: String(sub.keys.p256dh).slice(0, 200), auth: String(sub.keys.auth).slice(0, 100) } };
  await run('INSERT INTO push_subs (endpoint, user_id, sub, created_at) VALUES (?, ?, ?, ?) ON CONFLICT(endpoint) DO UPDATE SET user_id = excluded.user_id, sub = excluded.sub',
    endpoint, req.user.id, JSON.stringify(clean), Date.now());
  // höchstens 10 Geräte pro Nutzer
  await run('DELETE FROM push_subs WHERE user_id = ? AND endpoint NOT IN (SELECT endpoint FROM push_subs WHERE user_id = ? ORDER BY created_at DESC LIMIT 10)', req.user.id, req.user.id);
  res.json({ ok: true });
}));

push.post('/unsubscribe', wrap(async (req, res) => {
  await run('DELETE FROM push_subs WHERE endpoint = ? AND user_id = ?', String(req.body?.endpoint ?? ''), req.user.id);
  res.json({ ok: true });
}));

push.post('/test', wrap(async (req, res) => {
  const n = await sendTo(req.user.id, { title: t('Benachrichtigungen sind an ✓', 'Notifications are on ✓'), body: t('So sehen deine Erinnerungen aus.', 'This is how your reminders will look.'), tag: 'test', url: '/' });
  if (!n) throw new HttpError(400, t('Auf diesem Gerät sind Benachrichtigungen noch nicht eingeschaltet.', 'Notifications are not enabled on this device yet.'));
  res.json({ ok: true });
}));

push.post('/reminders', wrap(async (req, res) => {
  try {
    res.json({ ok: true, message: await addReminder(req.user.id, req.body?.text, req.body?.when, req.body?.inMinutes) });
  } catch (err) { throw new HttpError(400, err.message); }
}));
push.post('/reminders/delete', wrap(async (req, res) => {
  await run('DELETE FROM reminders WHERE id = ? AND user_id = ?', Number(req.body?.id), req.user.id);
  res.json({ ok: true });
}));

export async function deleteUserPush(userId) {
  await run('DELETE FROM push_subs WHERE user_id = ?', userId);
  await run('DELETE FROM reminders WHERE user_id = ?', userId);
}

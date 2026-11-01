// Admin-Alarm: Benachrichtigung aufs Handy der Admins, wenn etwas schiefläuft
// (viele Fehler in kurzer Zeit, ein Schlüssel ist voll/ungültig, ein ganzer Anbieter ist voll).
import { all, get, getSetting, setSetting, logEvent } from './db.js';
import { ADMIN_EMAILS } from './config.js';
import { notifyUser } from './push.js';
import { setAlarmHandler, keyStatus } from './models.js';

const COOLDOWN = 60 * 60 * 1000; // dieselbe Warnung höchstens einmal pro Stunde
const lastSent = new Map();
let enabled = null;
export async function alarmsOn() {
  if (enabled === null) enabled = (await getSetting('alarms', 'on')) !== 'off';
  return enabled;
}
export async function setAlarms(on) {
  enabled = !!on;
  await setSetting('alarms', on ? 'on' : 'off');
}

export async function alarm(key, title, body) {
  if (!(await alarmsOn())) return;
  const now = Date.now();
  if ((lastSent.get(key) ?? 0) > now - COOLDOWN) return;
  lastSent.set(key, now);
  await logEvent('alarm', null, `${title} – ${body}`);
  if (!ADMIN_EMAILS.length) return;
  const admins = await all(`SELECT id FROM users WHERE lower(email) IN (${ADMIN_EMAILS.map(() => '?').join(',')})`, ...ADMIN_EMAILS);
  for (const a of admins) await notifyUser(Number(a.id), { title: `⚠️ ${title}`, body, tag: `alarm-${key}`, url: '/admin' }).catch(() => {});
}

// Meldungen aus der Modell-Verwaltung (Schlüssel voll/ungültig)
setAlarmHandler((type, info) => {
  const status = keyStatus().find((p) => p.provider === info.provider);
  const free = status ? status.keys.filter((k) => k.state !== 'full').length : 0;
  if (type === 'key-full') {
    if (free === 0) alarm(`provider-${info.provider}`, `${info.label} ist komplett voll`, `Alle ${status?.keys.length ?? ''} Schlüssel haben ihr Tageslimit erreicht. Ab Mitternacht (UTC) geht es wieder – bis dahin antworten Notfall-Modelle anderer Anbieter.`);
    else alarm(`key-${info.id}`, `${info.label}-Schlüssel voll`, `Schlüssel ${info.id} hat sein Tageslimit erreicht. Noch ${free} ${free === 1 ? 'Schlüssel' : 'Schlüssel'} frei.`);
  }
  if (type === 'key-invalid') alarm(`invalid-${info.id}`, `${info.label}-Schlüssel ungültig`, `Schlüssel ${info.id} wird abgelehnt (gesperrt oder gelöscht?). Prüfe ihn im Admin-Bereich.`);
});

// Viele Fehler in kurzer Zeit? (alle 5 Minuten prüfen)
const ERROR_LIMIT = 8;
setInterval(async () => {
  try {
    const n = await get("SELECT COUNT(*) n FROM events WHERE kind = 'error' AND created_at > ?", Date.now() - 10 * 60 * 1000);
    const count = Number(n?.n ?? 0);
    if (count >= ERROR_LIMIT) alarm('errors', 'Viele Fehler', `${count} Fehler in den letzten 10 Minuten. Schau im Admin-Bereich unter „Probleme“ nach.`);
  } catch { /* egal */ }
}, 5 * 60 * 1000).unref();

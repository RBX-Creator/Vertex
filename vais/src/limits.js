// Tageslimit pro Nutzer: jede Antwort kostet Punkte, jeder hat pro Tag ein Punkte-Budget.
// So bleibt für alle genug übrig. Alles im Admin-Bereich einstellbar.
import { get, run, all, getSetting, setSetting } from './db.js';
import { t } from './i18n.js';
import { HttpError } from './auth.js';
import { isAdmin } from './config.js';

export const LIMIT_FIELDS = {
  daily: { min: 1, max: 100000, def: Number(process.env.USER_DAILY_POINTS) || 100 }, // Punkte pro Tag
  costText: { min: 0, max: 1000, def: 1 }, // normale Antwort (Text/Code), pro Modell
  costWeb: { min: 0, max: 1000, def: 2 }, // Antwort mit Websuche
  costImage: { min: 0, max: 1000, def: 3 }, // Bild
  costAgent: { min: 0, max: 1000, def: 4 }, // Agent X (viele Schritte)
  costPremium: { min: 0, max: 1000, def: 5 }, // Premium-Modell (kostet echtes Guthaben)
  paidDaily: { min: 0, max: 10000, def: Number(process.env.PAID_DAILY_LIMIT ?? 20) }, // Premium-Antworten pro Tag
  burst: { min: 1, max: 1000, def: 40 }, // höchstens so viele Antworten in 5 Minuten
  maxChats: { min: 0, max: 1000, def: 10 }, // so viele gespeicherte Chats pro Person (0 = unbegrenzt)
};

let cached = null;
let cachedAt = 0;
export async function limitSettings() {
  if (cached && Date.now() - cachedAt < 30_000) return cached;
  let saved = {};
  try { saved = JSON.parse(await getSetting('limits', '{}')) || {}; } catch { saved = {}; }
  cached = Object.fromEntries(Object.entries(LIMIT_FIELDS).map(([k, f]) => [k, Number.isFinite(saved[k]) ? saved[k] : f.def]));
  cachedAt = Date.now();
  return cached;
}
export async function saveLimitSettings(input) {
  const cur = await limitSettings();
  const next = { ...cur };
  for (const [k, f] of Object.entries(LIMIT_FIELDS)) {
    if (input?.[k] === undefined) continue;
    const n = Math.round(Number(input[k]));
    if (!Number.isFinite(n) || n < f.min || n > f.max) throw new HttpError(400, t(`Ungültiger Wert für „${k}“ (${f.min}–${f.max}).`, `Invalid value for “${k}” (${f.min}–${f.max}).`));
    next[k] = n;
  }
  await setSetting('limits', JSON.stringify(next));
  cached = next;
  cachedAt = Date.now();
  return next;
}

// Der Tag wechselt um Mitternacht deutscher Zeit
const DAY_FMT = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit' });
export const dayKey = (d = new Date()) => DAY_FMT.format(d);
export function nextReset() {
  // Mitternacht liegt immer auf einer Viertelstunde → in 15-Minuten-Schritten suchen (klappt auch bei Zeitumstellung)
  const step = 15 * 60 * 1000;
  const today = dayKey();
  let ts = Math.floor(Date.now() / step) * step;
  while (dayKey(new Date(ts)) === today) ts += step;
  return ts;
}

// Limit eines Nutzers: eigenes (vom Admin gesetzt) oder Standard; null = unbegrenzt
export async function userLimit(user) {
  if (isAdmin(user)) return null;
  const row = await get('SELECT daily_limit FROM users WHERE id = ?', user.id);
  const own = row?.daily_limit;
  if (own === -1) return null;
  if (Number.isInteger(Number(own)) && own !== null) return Number(own);
  return (await limitSettings()).daily;
}

export async function usedToday(userId) {
  return Number((await get('SELECT points FROM usage WHERE user_id = ? AND day = ?', userId, dayKey()))?.points ?? 0);
}

export async function usageOf(user) {
  const [used, max] = await Promise.all([usedToday(user.id), userLimit(user)]);
  return {
    used,
    limit: max,
    percent: max === null ? 0 : Math.min(100, Math.round((used / Math.max(1, max)) * 100)),
    resetsAt: nextReset(),
  };
}

// Punkte abziehen – oder ablehnen, wenn das Budget nicht reicht
export async function charge(user, cost, what) {
  if (!cost) return 0;
  const max = await userLimit(user);
  if (max !== null) {
    const used = await usedToday(user.id);
    if (used + cost > max) {
      const left = Math.max(0, max - used);
      throw new HttpError(429, used >= max
        ? t('Du hast dein Tageslimit erreicht (100 %). Um Mitternacht geht es weiter.', 'You reached your daily limit (100 %). It resets at midnight.')
        : t(`Dafür reicht dein Tageslimit heute nicht mehr (${what} kostet ${cost} Punkte, du hast noch ${left}). Probier eine normale Antwort.`, `Your daily limit is not enough for this (${what} costs ${cost} points, you have ${left} left). Try a normal answer.`), { usage: true });
    }
  }
  await run('INSERT INTO usage (user_id, day, points) VALUES (?, ?, ?) ON CONFLICT(user_id, day) DO UPDATE SET points = points + excluded.points', user.id, dayKey(), cost);
  return cost;
}
// Hat das Modell gar nicht geantwortet, gibt es die Punkte zurück
export async function refund(user, cost) {
  if (!cost) return;
  await run('UPDATE usage SET points = MAX(0, points - ?) WHERE user_id = ? AND day = ?', cost, user.id, dayKey()).catch(() => {});
}
export async function resetUsage(userId) {
  await run('DELETE FROM usage WHERE user_id = ? AND day = ?', userId, dayKey());
}
export async function usageMap() {
  const rows = await all('SELECT user_id, points FROM usage WHERE day = ?', dayKey());
  return new Map(rows.map((r) => [Number(r.user_id), Number(r.points)]));
}
// Alte Tage aufräumen (älter als 60 Tage)
setInterval(() => {
  run('DELETE FROM usage WHERE day < ?', dayKey(new Date(Date.now() - 60 * 24 * 3600 * 1000))).catch(() => {});
}, 6 * 3600 * 1000).unref();

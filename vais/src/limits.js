// Tageslimit pro Nutzer: jeder bekommt pro Tag eine feste Anzahl Antworten, Websuchen, Bilder und Agent-X-Aufträge.
// So bleibt für alle genug übrig. Alles im Admin-Bereich einstellbar.
import { get, run, all, getSetting, setSetting } from './db.js';
import { t } from './i18n.js';
import { HttpError } from './auth.js';
import { isAdmin } from './config.js';

// Wie viele Antworten jeder pro Tag bekommt – getrennt nach Art (keine Punkte mehr)
export const LIMIT_FIELDS = {
  text: { min: 0, max: 100000, def: Number(process.env.USER_DAILY_ANSWERS) || 100 }, // normale Antworten (Text/Code, Übersetzer, Team-KI)
  web: { min: 0, max: 100000, def: 30 }, // Antworten mit Websuche
  image: { min: 0, max: 100000, def: 20 }, // Bilder
  agent: { min: 0, max: 100000, def: 15 }, // Agent-X-Aufträge
  paidDaily: { min: 0, max: 10000, def: Number(process.env.PAID_DAILY_LIMIT ?? 20) }, // Premium-Antworten pro Tag
  burst: { min: 1, max: 1000, def: 40 }, // höchstens so viele Antworten in 5 Minuten
  maxChats: { min: 0, max: 1000, def: 10 }, // so viele gespeicherte Chats pro Person (0 = unbegrenzt)
};
export const KINDS = ['text', 'web', 'image', 'agent'];
const KIND_NAME = {
  text: () => t('Antworten', 'answers'), web: () => t('Websuchen', 'web searches'), image: () => t('Bilder', 'images'), agent: () => t('Agent-X-Aufträge', 'Agent X tasks'),
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

// Eigenes Limit eines Nutzers (vom Admin): null = Standard, -1 = unbegrenzt, sonst Prozent vom Standard (200 = doppelt)
async function userFactor(user) {
  if (isAdmin(user)) return null;
  const own = (await get('SELECT daily_limit FROM users WHERE id = ?', user.id))?.daily_limit;
  if (own === -1 || own === '-1') return null;
  return own === null || own === undefined ? 1 : Math.max(0, Number(own)) / 100;
}
export const scaled = (base, factor) => (factor === null ? null : Math.round(base * factor));

await run(`CREATE TABLE IF NOT EXISTS usage_kinds (
  user_id INTEGER NOT NULL, day TEXT NOT NULL, kind TEXT NOT NULL, n INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, day, kind)
)`);

async function countsToday(userId) {
  const rows = await all('SELECT kind, n FROM usage_kinds WHERE user_id = ? AND day = ?', userId, dayKey());
  return Object.fromEntries(KINDS.map((k) => [k, Number(rows.find((r) => r.kind === k)?.n ?? 0)]));
}

// Verbrauch heute je Art, mit Prozent (0–100) – für die Statistik
export async function usageOf(user) {
  const [L, factor, used] = await Promise.all([limitSettings(), userFactor(user), countsToday(user.id)]);
  const kinds = Object.fromEntries(KINDS.map((k) => {
    const max = scaled(L[k], factor);
    return [k, { used: used[k], limit: max, percent: max === null ? 0 : max === 0 ? 100 : Math.min(100, Math.round((used[k] / max) * 100)) }];
  }));
  return {
    unlimited: factor === null,
    kinds,
    percent: Math.max(...Object.values(kinds).map((x) => (x.limit === null ? 0 : x.percent))),
    resetsAt: nextReset(),
  };
}

// Eine Antwort zählen – oder ablehnen, wenn für diese Art heute nichts mehr übrig ist
// cost: wie viele Antworten das zählt (z. B. „Denken“ = 2)
export async function charge(user, kind, cost = 1) {
  if (!KINDS.includes(kind)) return null;
  const [L, factor] = await Promise.all([limitSettings(), userFactor(user)]);
  const max = scaled(L[kind], factor);
  if (max !== null) {
    const used = (await countsToday(user.id))[kind];
    if (cost > 1 && used < max && used + cost > max) {
      throw new HttpError(429, t(`„Denken“ zählt als ${cost} Antworten – du hast heute nur noch ${max - used}. Schalte „Denken“ aus, dann geht es weiter.`, `“Think” counts as ${cost} answers – you only have ${max - used} left today. Turn “Think” off to continue.`), { usage: true });
    }
    if (used >= max) {
      const other = kind === 'text' ? '' : t(' Normale Antworten gehen noch.', ' Normal answers still work.');
      throw new HttpError(429, max === 0
        ? t(`${KIND_NAME[kind]()[0].toUpperCase()}${KIND_NAME[kind]().slice(1)} sind für dich gerade nicht freigeschaltet.`, `${KIND_NAME[kind]()} are not enabled for you right now.`)
        : t(`Du hast heute alle ${max} ${KIND_NAME[kind]()} genutzt (100 %). Um Mitternacht geht es weiter.${other}`, `You used all ${max} ${KIND_NAME[kind]()} for today (100 %). It resets at midnight.${other}`), { usage: true });
    }
  }
  await run('INSERT INTO usage_kinds (user_id, day, kind, n) VALUES (?, ?, ?, ?) ON CONFLICT(user_id, day, kind) DO UPDATE SET n = n + excluded.n', user.id, dayKey(), kind, cost);
  return kind;
}
// Hat das Modell gar nicht geantwortet, zählt es nicht
export async function refund(user, kind, cost = 1) {
  if (!KINDS.includes(kind)) return;
  await run('UPDATE usage_kinds SET n = MAX(0, n - ?) WHERE user_id = ? AND day = ? AND kind = ?', cost, user.id, dayKey(), kind).catch(() => {});
}
export async function resetUsage(userId) {
  await run('DELETE FROM usage_kinds WHERE user_id = ? AND day = ?', userId, dayKey());
  await run('DELETE FROM usage WHERE user_id = ? AND day = ?', userId, dayKey()).catch(() => {});
}
// Für den Admin: Verbrauch heute je Nutzer → { text, web, image, agent }
export async function usageMap() {
  const rows = await all('SELECT user_id, kind, n FROM usage_kinds WHERE day = ?', dayKey());
  const map = new Map();
  for (const r of rows) {
    const id = Number(r.user_id);
    if (!map.has(id)) map.set(id, Object.fromEntries(KINDS.map((k) => [k, 0])));
    map.get(id)[r.kind] = Number(r.n);
  }
  return map;
}
export async function usageHistory(userId) {
  const rows = await all('SELECT day, kind, n FROM usage_kinds WHERE user_id = ? ORDER BY day', userId);
  const days = new Map();
  for (const r of rows) { if (!days.has(r.day)) days.set(r.day, { day: r.day }); days.get(r.day)[r.kind] = Number(r.n); }
  return [...days.values()];
}
// Alte Tage aufräumen (älter als 60 Tage)
setInterval(() => {
  const old = dayKey(new Date(Date.now() - 60 * 24 * 3600 * 1000));
  run('DELETE FROM usage_kinds WHERE day < ?', old).catch(() => {});
  run('DELETE FROM usage WHERE day < ?', old).catch(() => {});
}, 6 * 3600 * 1000).unref();

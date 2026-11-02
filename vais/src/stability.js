// Stabilität: Speicher im Blick behalten, Abstürze und Browser-Fehler mitschreiben,
// und jede Stunde prüfen, welche Modelle wirklich funktionieren (kaputte werden ausgeblendet).
import { Router } from 'express';
import { logEvent } from './db.js';
import { wrap, currentUser } from './auth.js';
import { listModels, complete, lastOkOf, markBroken, healthCooldown } from './models.js';

// ── Speicher ────────────────────────────────────────────────────────
// Render (kostenlos) hat 512 MB. Zwischenspeicher melden sich hier an und werden geleert, wenn es eng wird.
const caches = new Map(); // Name → Funktion zum Leeren
export const registerCache = (name, clear) => caches.set(name, clear);
const MB = 1024 * 1024;
const LIMIT_RSS = Number(process.env.MEMORY_SOFT_LIMIT_MB || 400) * MB;
let peak = 0;
let lastClear = 0;
export function memory() {
  const m = process.memoryUsage();
  return { rss: Math.round(m.rss / MB), heap: Math.round(m.heapUsed / MB), heapTotal: Math.round(m.heapTotal / MB), peak: Math.round(peak / MB), limit: Math.round(LIMIT_RSS / MB), uptime: Math.round(process.uptime()), lastClear: lastClear || null, keepAlive: globalThis.__vaisKeepAlive ?? null };
}
function checkMemory() {
  const { rss } = process.memoryUsage();
  peak = Math.max(peak, rss);
  if (rss < LIMIT_RSS) return;
  for (const [, clear] of caches) { try { clear(); } catch { /* egal */ } }
  globalThis.gc?.();
  lastClear = Date.now();
  logEvent('memory', null, `Speicher knapp (${Math.round(rss / MB)} MB) – Zwischenspeicher geleert`).catch(() => {});
}
setInterval(checkMemory, 30_000).unref();

// ── Abstürze ────────────────────────────────────────────────────────
// Nicht gleich den ganzen Server sterben lassen – mitschreiben und weiterlaufen.
let crashes = 0;
process.on('unhandledRejection', (err) => {
  console.error('Unbehandelter Fehler:', err);
  if (crashes++ < 200) logEvent('crash', null, `Promise: ${String(err?.stack ?? err).slice(0, 400)}`).catch(() => {});
});
process.on('uncaughtException', (err) => {
  console.error('Absturz verhindert:', err);
  if (crashes++ < 200) logEvent('crash', null, `Ausnahme: ${String(err?.stack ?? err).slice(0, 400)}`).catch(() => {});
});

// ── Fehler aus dem Browser (Fehler-Tagebuch) ─────────────────────────
const seen = new Map(); // gleiche Meldung nicht hundertmal
const perIp = new Map();
setInterval(() => { seen.clear(); perIp.clear(); }, 60 * 60 * 1000).unref();
export const clientLog = Router();
clientLog.post('/', wrap(async (req, res) => {
  const ip = req.ip;
  const n = (perIp.get(ip) ?? 0) + 1;
  perIp.set(ip, n);
  if (n > 30) return res.json({ ok: true });
  const msg = String(req.body?.message ?? '').slice(0, 300);
  if (!msg) return res.json({ ok: true });
  const where = String(req.body?.where ?? '').replace(/[?#].*$/, '').slice(0, 80);
  const line = String(req.body?.line ?? '').slice(0, 20);
  const key = `${msg}|${where}|${line}`;
  if (seen.has(key)) return res.json({ ok: true });
  seen.set(key, 1);
  const user = await currentUser(req).catch(() => null);
  const ua = String(req.headers['user-agent'] ?? '');
  const device = /iPhone|iPad/.test(ua) ? 'iOS' : /Android/.test(ua) ? 'Android' : /Mac/.test(ua) ? 'Mac' : /Windows/.test(ua) ? 'Windows' : 'anderes';
  await logEvent('client', null, `${msg} · ${where}${line ? `:${line}` : ''} · ${device}${user ? ` · ${user.email}` : ''}`);
  res.json({ ok: true });
}));

// ── Modell-Gesundheit ───────────────────────────────────────────────
// Stündlich: jedes freie Text-Modell, das in der letzten Stunde nicht erfolgreich war, bekommt eine Mini-Frage.
const health = new Map(); // Modell → { ok, at, ms, error }
export const healthList = () => [...health.entries()].map(([id, h]) => ({ id, ...h, hiddenFor: healthCooldown(id) }));
const HOUR = 60 * 60 * 1000;
async function checkModels() {
  let models;
  try { models = (await listModels()).filter((m) => m.caps.includes('text') && !m.paid && !m.id.startsWith('demo:') && !m.id.endsWith('#search')); } catch { return; }
  const due = models.filter((m) => Date.now() - lastOkOf(m.id) > HOUR).slice(0, 14);
  for (const m of due) {
    const started = Date.now();
    try {
      const msg = await complete({ model: m.id, messages: [{ role: 'user', content: 'Antworte nur mit: OK' }], maxTokens: 16, timeoutMs: 25_000, reasoningEffort: 'low' });
      health.set(m.id, { name: m.name, ok: true, at: Date.now(), ms: Date.now() - started, empty: !String(msg.content ?? '').trim() });
    } catch (err) {
      const limited = err.status === 429; // voll ≠ kaputt
      health.set(m.id, { name: m.name, ok: limited, at: Date.now(), ms: Date.now() - started, error: String(err.message).slice(0, 160), limited });
      if (!limited && [400, 404, 500, 502, 503, 504].includes(err.status)) {
        markBroken(m.id, err.status === 404 ? 6 * HOUR : 30 * 60 * 1000);
        logEvent('health', m.id, `ausgeblendet: ${String(err.message).slice(0, 200)}`).catch(() => {});
      }
    }
    await new Promise((ok) => setTimeout(ok, 1500));
  }
}
if (process.env.NODE_ENV !== 'test' && !process.env.NO_HEALTH_CHECK) {
  setTimeout(() => { checkModels().catch(() => {}); setInterval(() => checkModels().catch(() => {}), HOUR).unref(); }, 3 * 60 * 1000).unref();
}
export const runHealthCheck = checkModels;

// ── Keep-Alive: Render (kostenlos) schläft nach ~15 Minuten ohne Besucher ein ─────────
// Alle 10 Minuten ruft sich der Server über seine öffentliche Adresse selbst auf, damit er wach bleibt.
// Abschalten mit KEEP_ALIVE=off. (Render setzt RENDER_EXTERNAL_URL automatisch.)
const PUBLIC_URL = (process.env.APP_URL || process.env.RENDER_EXTERNAL_URL || '').replace(/\/$/, '');
export const keepAlive = { on: false, last: null, ok: null };
globalThis.__vaisKeepAlive = keepAlive;
if (PUBLIC_URL && process.env.KEEP_ALIVE !== 'off' && process.env.NODE_ENV !== 'test') {
  keepAlive.on = true;
  const ping = async () => {
    try {
      const r = await fetch(`${PUBLIC_URL}/healthz?keepalive=1`, { signal: AbortSignal.timeout(20_000), headers: { 'User-Agent': 'VAIs-KeepAlive' } });
      keepAlive.ok = r.ok;
    } catch { keepAlive.ok = false; }
    keepAlive.last = Date.now();
  };
  setTimeout(ping, 60_000).unref();
  setInterval(ping, 10 * 60 * 1000).unref();
  console.log(`Keep-Alive aktiv: ${PUBLIC_URL}/healthz alle 10 Minuten`);
}

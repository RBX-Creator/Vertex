// Wartungsmodus: Wenn an, können nur Admins und Mods Neues starten – alle anderen sehen einen Hinweis.
import { getSetting } from './db.js';
import { t } from './i18n.js';
import { isStaff } from './config.js';

let cache = { at: 0, value: null };

export async function maintenance() {
  if (Date.now() - cache.at < 5000 && cache.value) return cache.value;
  let value = { on: false, message: '', since: null };
  try { value = { ...value, ...JSON.parse(await getSetting('maintenance', '{}') || '{}') }; } catch { /* Standard */ }
  cache = { at: Date.now(), value };
  return value;
}
export function forgetMaintenance() { cache = { at: 0, value: null }; }

export const maintenanceText = (m) => m.message || t('VAIs wird gerade gewartet. Bitte versuch es gleich nochmal.', 'VAIs is under maintenance. Please try again shortly.');

// Middleware für den Chat: Schreiben (POST) ist im Wartungsmodus nur für Admins und Mods erlaubt
const GENERATING = new Set(['/start', '/stream', '/inject', '/organize', '/extras', '/tts', '/transcribe', '/improve', '/translate', '/sites/publish']);
export async function blockDuringMaintenance(req, res, next) {
  if (req.method !== 'POST' || !GENERATING.has(req.path) || isStaff(req.user)) return next();
  const m = await maintenance();
  if (!m.on) return next();
  res.status(503).json({ error: `🛠️ ${maintenanceText(m)}`, maintenance: true });
}

// Kontostand-Tool: eigener Kontostand mit Einnahmen (+) und Ausgaben (−), Verlauf und Monatsübersicht.
// Beträge werden in Cent gespeichert (keine Rundungsfehler). „Kontostand eintragen“ legt eine Korrektur-
// Buchung an, damit der Stand danach genau stimmt. Agent X kann lesen und auf Wunsch buchen.
import { Router } from 'express';
import { get, run, all } from './db.js';
import { t } from './i18n.js';
import { HttpError, wrap } from './auth.js';

await run(`CREATE TABLE IF NOT EXISTS ledger (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  amount INTEGER NOT NULL,
  note TEXT,
  day TEXT NOT NULL,
  kind TEXT,
  created_at INTEGER NOT NULL
)`);
await run('CREATE INDEX IF NOT EXISTS ledger_user ON ledger (user_id, day)');

const MAX_ENTRIES = 5000;
const MAX_CENTS = 100_000_000_00; // 100 Mio. €
const DAY = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit' });
const today = () => DAY.format(new Date());
const euro = (cents) => (cents / 100).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });

// „12,50“, „-3.2“, „+1.000,99“, 7 → Cent
export function parseCents(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? Math.round(v * 100) : NaN;
  let s = String(v ?? '').trim().replace(/\s|€|eur/gi, '');
  if (!s) return NaN;
  if (/,\d{1,2}$/.test(s)) s = s.replace(/\./g, '').replace(',', '.'); // deutsches Format
  else s = s.replace(/,/g, '');
  if (!/^[+-]?\d+(\.\d{1,2})?$/.test(s)) return NaN;
  return Math.round(Number(s) * 100);
}
const validDay = (d) => (/^\d{4}-\d{2}-\d{2}$/.test(String(d ?? '')) && !Number.isNaN(Date.parse(d)) ? d : today());

export async function ledgerOf(userId) {
  const rows = await all('SELECT id, amount, note, day, kind, created_at FROM ledger WHERE user_id = ? ORDER BY day, id', userId);
  let balance = 0;
  const points = new Map(); // Tag → Stand am Ende des Tages
  const months = new Map(); // JJJJ-MM → { plus, minus }
  const entries = rows.map((r) => {
    const amount = Number(r.amount);
    balance += amount;
    points.set(r.day, balance);
    if (r.kind !== 'set') {
      const m = months.get(r.day.slice(0, 7)) ?? { plus: 0, minus: 0 };
      if (amount >= 0) m.plus += amount; else m.minus += -amount;
      months.set(r.day.slice(0, 7), m);
    }
    return { id: Number(r.id), amount, note: r.note || '', day: r.day, kind: r.kind || 'entry', balance };
  });
  return {
    balance,
    count: entries.length,
    entries: entries.slice(-300).reverse(),
    series: [...points.entries()].slice(-120).map(([day, value]) => ({ day, value })),
    months: [...months.entries()].slice(-12).map(([month, m]) => ({ month, ...m })),
  };
}

export async function addEntry(userId, { amount, note, day } = {}) {
  const cents = parseCents(amount);
  if (!Number.isFinite(cents) || cents === 0 || Math.abs(cents) > MAX_CENTS) throw new HttpError(400, t('Bitte gib einen gültigen Betrag ein (z. B. 12,50 oder -4,99).', 'Please enter a valid amount (e.g. 12.50 or -4.99).'));
  const n = Number((await get('SELECT COUNT(*) n FROM ledger WHERE user_id = ?', userId))?.n ?? 0);
  if (n >= MAX_ENTRIES) throw new HttpError(400, t(`Höchstens ${MAX_ENTRIES} Buchungen.`, `At most ${MAX_ENTRIES} entries.`));
  await run('INSERT INTO ledger (user_id, amount, note, day, kind, created_at) VALUES (?, ?, ?, ?, ?, ?)', userId, cents, String(note ?? '').replace(/\s+/g, ' ').trim().slice(0, 120) || null, validDay(day), 'entry', Date.now());
  return cents;
}

// Kontostand auf einen Wert setzen (Korrektur-Buchung mit der Differenz)
export async function setBalance(userId, { balance, day } = {}) {
  const target = parseCents(balance);
  if (!Number.isFinite(target) || Math.abs(target) > MAX_CENTS) throw new HttpError(400, t('Bitte gib einen gültigen Kontostand ein.', 'Please enter a valid balance.'));
  const now = Number((await get('SELECT COALESCE(SUM(amount), 0) s FROM ledger WHERE user_id = ?', userId))?.s ?? 0);
  const diff = target - now;
  if (diff !== 0) await run('INSERT INTO ledger (user_id, amount, note, day, kind, created_at) VALUES (?, ?, ?, ?, ?, ?)', userId, diff, t('Kontostand eingetragen', 'Balance set'), validDay(day), 'set', Date.now());
  return target;
}

export const removeEntry = (userId, id) => run('DELETE FROM ledger WHERE id = ? AND user_id = ?', Number(id), userId);
export const clearLedger = (userId) => run('DELETE FROM ledger WHERE user_id = ?', userId);

// Für Agent X: kurze Übersicht als Text
export async function ledgerText(userId) {
  const l = await ledgerOf(userId);
  if (!l.count) return 'Der Nutzer hat im Kontostand-Tool noch nichts eingetragen.';
  const month = l.months.at(-1);
  return [
    `Aktueller Kontostand: ${euro(l.balance)}`,
    month ? `Monat ${month.month}: Einnahmen ${euro(month.plus)}, Ausgaben ${euro(month.minus)}` : '',
    'Letzte Buchungen (neueste zuerst):',
    ...l.entries.slice(0, 20).map((e) => `- ${e.day}: ${e.amount >= 0 ? '+' : '−'}${euro(Math.abs(e.amount))}${e.note ? ` (${e.note})` : ''} → Stand ${euro(e.balance)}`),
  ].filter(Boolean).join('\n');
}
export async function ledgerAddText(userId, args = {}) {
  const cents = await addEntry(userId, { amount: args.betrag ?? args.amount, note: args.notiz ?? args.note, day: args.datum ?? args.day });
  const l = await ledgerOf(userId);
  return `Gebucht: ${cents >= 0 ? '+' : '−'}${euro(Math.abs(cents))}${args.notiz ? ` (${args.notiz})` : ''}. Neuer Kontostand: ${euro(l.balance)}.`;
}

export const ledger = Router();
ledger.get('/', wrap(async (req, res) => res.json(await ledgerOf(req.user.id))));
ledger.post('/add', wrap(async (req, res) => { await addEntry(req.user.id, req.body ?? {}); res.json(await ledgerOf(req.user.id)); }));
ledger.post('/set', wrap(async (req, res) => { await setBalance(req.user.id, req.body ?? {}); res.json(await ledgerOf(req.user.id)); }));
ledger.post('/delete', wrap(async (req, res) => { await removeEntry(req.user.id, req.body?.id); res.json(await ledgerOf(req.user.id)); }));
ledger.post('/clear', wrap(async (req, res) => { await clearLedger(req.user.id); res.json(await ledgerOf(req.user.id)); }));

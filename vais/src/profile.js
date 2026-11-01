// Persönliches: eigene Anweisungen („So soll die KI antworten“) und das Gedächtnis von Agent X
import { Router } from 'express';
import { get, run, all } from './db.js';
import { t } from './i18n.js';
import { HttpError, wrap } from './auth.js';

export const MAX_INSTRUCTIONS = 1500;
export const MAX_MEMORIES = 60;
const MAX_MEMORY_CHARS = 240;

export async function personalFor(userId) {
  const u = await get('SELECT instructions, memory_off FROM users WHERE id = ?', userId);
  const memoryOn = !u?.memory_off;
  const memories = memoryOn ? await all('SELECT id, text FROM memories WHERE user_id = ? ORDER BY id', userId) : [];
  return { instructions: String(u?.instructions ?? '').trim(), memoryOn, memories: memories.map((m) => ({ id: Number(m.id), text: m.text })) };
}

export async function remember(userId, raw) {
  const text = String(raw ?? '').replace(/\s+/g, ' ').trim().slice(0, MAX_MEMORY_CHARS);
  if (!text) throw new Error('Leerer Eintrag.');
  const u = await get('SELECT memory_off FROM users WHERE id = ?', userId);
  if (u?.memory_off) return 'Das Gedächtnis ist ausgeschaltet – nichts gespeichert.';
  const same = await get('SELECT id FROM memories WHERE user_id = ? AND lower(text) = lower(?)', userId, text);
  if (same) return 'Schon gespeichert.';
  await run('INSERT INTO memories (user_id, text, created_at) VALUES (?, ?, ?)', userId, text, Date.now());
  // Nur die neuesten behalten
  await run(`DELETE FROM memories WHERE user_id = ? AND id NOT IN (SELECT id FROM memories WHERE user_id = ? ORDER BY id DESC LIMIT ${MAX_MEMORIES})`, userId, userId);
  return 'Gespeichert.';
}

// Systemnachricht mit den eigenen Anweisungen (für alle Modelle)
export function instructionsPrompt(instructions) {
  if (!instructions) return null;
  return `Der Nutzer hat in seinen Einstellungen festgelegt, wie du antworten sollst. Halte dich daran, solange es nicht gegen Sicherheit oder Fakten geht:\n"""\n${instructions}\n"""`;
}

export const profile = Router();

profile.get('/', wrap(async (req, res) => {
  res.json(await personalFor(req.user.id).then(async (p) => ({
    ...p,
    memories: p.memoryOn ? p.memories : (await all('SELECT id, text FROM memories WHERE user_id = ? ORDER BY id', req.user.id)).map((m) => ({ id: Number(m.id), text: m.text })),
  })));
}));

profile.post('/', wrap(async (req, res) => {
  const { instructions, memoryOn } = req.body ?? {};
  if (instructions !== undefined) {
    const text = String(instructions ?? '').trim();
    if (text.length > MAX_INSTRUCTIONS) throw new HttpError(400, t(`Höchstens ${MAX_INSTRUCTIONS} Zeichen.`, `At most ${MAX_INSTRUCTIONS} characters.`));
    await run('UPDATE users SET instructions = ? WHERE id = ?', text || null, req.user.id);
  }
  if (memoryOn !== undefined) await run('UPDATE users SET memory_off = ? WHERE id = ?', memoryOn ? null : 1, req.user.id);
  res.json({ ok: true });
}));

profile.post('/memory/delete', wrap(async (req, res) => {
  const id = Number(req.body?.id);
  await run('DELETE FROM memories WHERE id = ? AND user_id = ?', id, req.user.id);
  res.json({ ok: true });
}));
profile.post('/memory/clear', wrap(async (req, res) => {
  await run('DELETE FROM memories WHERE user_id = ?', req.user.id);
  res.json({ ok: true });
}));

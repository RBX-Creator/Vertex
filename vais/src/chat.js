import { Router } from 'express';
import { randomBytes } from 'node:crypto';
import { get, run } from './db.js';
import { currentUser, HttpError, wrap, errorHandler } from './auth.js';
import { listModels, findModel, streamChat, displayName, demoMode } from './models.js';

const MAX_MESSAGES = 40;          // so viele Nachrichten gehen max. ans Modell
const MAX_CHARS = 20_000;         // pro Nachricht
const WINNERS = new Set(['a', 'b', 'tie', 'bad']);

export const chat = Router();

// Nur für angemeldete Nutzer
chat.use(wrap(async (req, res, next) => {
  req.user = await currentUser(req);
  if (!req.user) throw new HttpError(401, 'Bitte melde dich erneut an.');
  next();
}));

// Einfaches Limit: 40 Antworten pro 5 Minuten und Nutzer
const usage = new Map();
function limit(userId) {
  const now = Date.now();
  const list = (usage.get(userId) || []).filter((t) => now - t < 5 * 60 * 1000);
  if (list.length >= 40) throw new HttpError(429, 'Du sendest gerade sehr viele Nachrichten. Warte kurz.');
  list.push(now);
  usage.set(userId, list);
}

chat.get('/models', wrap(async (req, res) => {
  res.json({ models: await listModels(), demo: demoMode });
}));

// Neuen Chat anlegen. Im Battle wählt der Server zwei zufällige Modelle und verrät sie erst nach der Abstimmung.
chat.post('/start', wrap(async (req, res) => {
  const { mode, models = [] } = req.body ?? {};
  let picked;
  if (mode === 'battle') {
    const all = await listModels();
    if (all.length < 2) throw new HttpError(503, 'Gerade sind nicht genug Modelle verfügbar.');
    const i = Math.floor(Math.random() * all.length);
    let j = Math.floor(Math.random() * (all.length - 1));
    if (j >= i) j++;
    picked = [all[i].id, all[j].id];
  } else if (mode === 'sxs' || mode === 'direct') {
    const need = mode === 'sxs' ? 2 : 1;
    if (!Array.isArray(models) || models.length !== need) throw new HttpError(400, 'Bitte wähle die Modelle aus.');
    for (const id of models) if (!(await findModel(id))) throw new HttpError(400, 'Dieses Modell ist nicht verfügbar.');
    picked = models;
  } else {
    throw new HttpError(400, 'Unbekannter Modus.');
  }

  const id = randomBytes(12).toString('base64url');
  await run(
    'INSERT INTO chats (id, user_id, mode, model_a, model_b, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    id, req.user.id, mode, picked[0], picked[1] ?? null, Date.now(),
  );
  res.json({ id, models: mode === 'battle' ? null : picked.map(displayName) });
}));

// Antwort einer Seite (0 = A, 1 = B) als NDJSON-Stream
chat.post('/stream', wrap(async (req, res) => {
  const { chatId, side = 0, messages } = req.body ?? {};
  const row = await get('SELECT * FROM chats WHERE id = ? AND user_id = ?', String(chatId ?? ''), req.user.id);
  if (!row) throw new HttpError(404, 'Chat nicht gefunden. Starte einen neuen Chat.');
  const model = side === 1 ? row.model_b : row.model_a;
  if (!model) throw new HttpError(400, 'Ungültige Seite.');

  if (!Array.isArray(messages) || !messages.length) throw new HttpError(400, 'Keine Nachricht.');
  const clean = messages.slice(-MAX_MESSAGES).map((m) => {
    if (!m || !['user', 'assistant'].includes(m.role) || typeof m.content !== 'string') throw new HttpError(400, 'Ungültige Nachricht.');
    return { role: m.role, content: m.content.slice(0, MAX_CHARS) };
  });
  if (clean.at(-1).role !== 'user') throw new HttpError(400, 'Die letzte Nachricht muss von dir sein.');
  limit(req.user.id);

  res.set({
    'Content-Type': 'application/x-ndjson; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders();

  const controller = new AbortController();
  res.on('close', () => { if (!res.writableFinished) controller.abort(); });

  try {
    await streamChat({
      model,
      messages: clean,
      signal: controller.signal,
      onText: (t) => res.write(`${JSON.stringify({ t })}\n`),
    });
    res.write(`${JSON.stringify({ done: true })}\n`);
  } catch (err) {
    if (!controller.signal.aborted) {
      console.error(`Stream-Fehler (${model}):`, err.message);
      res.write(`${JSON.stringify({ error: err.message || 'Das Modell konnte nicht antworten.' })}\n`);
    }
  }
  res.end();
}));

// Abstimmen (einmal pro Chat). Gibt die Modellnamen zurück → Auflösung im Battle.
chat.post('/vote', wrap(async (req, res) => {
  const { chatId, winner } = req.body ?? {};
  if (!WINNERS.has(winner)) throw new HttpError(400, 'Ungültige Stimme.');
  const row = await get('SELECT * FROM chats WHERE id = ? AND user_id = ?', String(chatId ?? ''), req.user.id);
  if (!row || !row.model_b) throw new HttpError(404, 'Chat nicht gefunden.');
  if (!row.winner) {
    await run('UPDATE chats SET winner = ?, voted_at = ? WHERE id = ?', winner, Date.now(), row.id);
  }
  res.json({ models: [displayName(row.model_a), displayName(row.model_b)], winner: row.winner ?? winner });
}));

chat.use(errorHandler);

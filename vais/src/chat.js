import { Router } from 'express';
import { randomBytes } from 'node:crypto';
import { get, run, all } from './db.js';
import { currentUser, HttpError, wrap, errorHandler } from './auth.js';
import { runAgent } from './agent.js';
import { listModels, findModel, streamChat, displayName, describeModel, modelKey, demoMode } from './models.js';

const MAX_MESSAGES = 40;          // so viele Nachrichten gehen max. ans Modell
const MAX_CHARS = 20_000;         // pro Nachricht
const WINNERS = new Set(['a', 'b', 'tie', 'bad']);
// Art der Anfrage → welche Modelle passen
const MODALITY_CAP = { auto: 'text', text: 'text', code: 'code', web: 'web' };
const CODE_PROMPT = 'Du bist ein erfahrener Entwickler. Antworte in der Sprache des Nutzers. Wenn eine Webseite, ein Spiel oder eine App gewünscht ist, liefere eine vollständige, lauffähige einzelne HTML-Datei (CSS und JavaScript eingebettet) in genau einem ```html-Codeblock und erkläre danach kurz, was sie macht.';

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
  const { mode, models = [], title } = req.body ?? {};
  const modality = MODALITY_CAP[req.body?.modality] ? req.body.modality : 'auto';
  let picked;
  if (mode === 'agent') {
    picked = ['agent'];
  } else if (mode === 'battle') {
    const all = (await listModels()).filter((m) => m.caps.includes(MODALITY_CAP[modality]));
    if (all.length < 2) throw new HttpError(503, modality === 'web' ? 'Für ein Websuche-Battle sind gerade nicht genug Such-Modelle verfügbar.' : 'Gerade sind nicht genug Modelle verfügbar.');
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
  const now = Date.now();
  await run(
    'INSERT INTO chats (id, user_id, mode, modality, model_a, model_b, title, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    id, req.user.id, mode, modality, picked[0], picked[1] ?? null, String(title ?? '').trim().slice(0, 80) || 'Neuer Chat', now, now,
  );
  res.json({ id, models: mode === 'battle' ? null : await Promise.all(picked.map(displayName)) });
}));

// Antwort einer Seite (0 = A, 1 = B) als NDJSON-Stream
chat.post('/stream', wrap(async (req, res) => {
  const { chatId, side = 0, messages, turn } = req.body ?? {};
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
  const turnNo = Number.isInteger(turn) && turn >= 0 && turn < 1000 ? turn : null;
  limit(req.user.id);

  // Verlauf speichern: deine Frage sofort, die Antwort am Ende
  const steps = [];
  let thinking = '';
  let thinkStart = 0;
  let thinkMs = 0;
  const save = (s, content, status = 'done', error = null) => (turnNo === null ? null : run(
    `INSERT INTO messages (chat_id, turn, side, content, status, error, meta, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(chat_id, turn, side) DO UPDATE SET content = excluded.content, status = excluded.status, error = excluded.error, meta = excluded.meta`,
    row.id, turnNo, s, content, status, error,
    s >= 0 && (steps.length || thinking) ? JSON.stringify({ steps, thinking: thinking.slice(0, 20_000), thinkMs }) : null, Date.now(),
  ).catch((e) => console.error('Verlauf speichern fehlgeschlagen:', e.message)));
  await save(-1, clean.at(-1).content);
  await run('UPDATE chats SET updated_at = ? WHERE id = ?', Date.now(), row.id);

  res.set({
    'Content-Type': 'application/x-ndjson; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders();

  const controller = new AbortController();
  res.on('close', () => { if (!res.writableFinished) controller.abort(); });

  let text = '';
  try {
    const onText = (t) => {
      if (thinkStart && !thinkMs) thinkMs = Date.now() - thinkStart;
      text += t;
      res.write(`${JSON.stringify({ t })}\n`);
    };
    const onReasoning = (r) => {
      if (!thinkStart) thinkStart = Date.now();
      thinking += r;
      res.write(`${JSON.stringify({ r })}\n`);
    };
    if (row.mode === 'agent') {
      await runAgent({
        messages: clean,
        signal: controller.signal,
        onText,
        onReasoning,
        onStep: (step) => { steps.push(step); res.write(`${JSON.stringify({ step })}\n`); },
      });
    } else {
      await streamChat({
        model,
        messages: row.modality === 'code' ? [{ role: 'system', content: CODE_PROMPT }, ...clean] : clean,
        signal: controller.signal,
        onText,
        onReasoning,
      });
    }
    res.write(`${JSON.stringify({ done: true })}\n`);
    await save(side === 1 ? 1 : 0, text, text ? 'done' : 'error', text ? null : 'Das Modell hat keine Antwort geliefert.');
  } catch (err) {
    if (controller.signal.aborted) {
      await save(side === 1 ? 1 : 0, text, text ? 'done' : 'stopped');
    } else {
      console.error(`Stream-Fehler (${model}):`, err.message);
      const message = err.message || 'Das Modell konnte nicht antworten.';
      res.write(`${JSON.stringify({ error: message })}\n`);
      await save(side === 1 ? 1 : 0, text, 'error', message);
    }
  }
  res.end();
}));

// ── Verlauf ───────────────────────────────────────────────────────
chat.get('/list', wrap(async (req, res) => {
  const rows = await all(
    `SELECT id, title, mode, COALESCE(updated_at, created_at) AS updated FROM chats
     WHERE user_id = ? AND EXISTS (SELECT 1 FROM messages WHERE messages.chat_id = chats.id)
     ORDER BY updated DESC LIMIT 200`,
    req.user.id,
  );
  res.json({ chats: rows.map((r) => ({ id: r.id, title: r.title || 'Chat', mode: r.mode, updated: r.updated })) });
}));

// ── Bestenliste (Elo aus den Battle-Stimmen) ──────────────────────
let board = { at: 0, data: null };
chat.get('/leaderboard', wrap(async (req, res) => {
  if (board.data && Date.now() - board.at < 60_000) return res.json(board.data);
  const rows = await all("SELECT model_a, model_b, winner FROM chats WHERE mode = 'battle' AND winner IS NOT NULL AND model_b IS NOT NULL ORDER BY voted_at");
  const stats = new Map();
  const entry = (id) => {
    const key = modelKey(id);
    if (!stats.has(key)) stats.set(key, { id, rating: 1000, votes: 0, wins: 0 });
    return stats.get(key);
  };
  for (const r of rows) {
    const a = entry(r.model_a);
    const b = entry(r.model_b);
    const expectedA = 1 / (1 + 10 ** ((b.rating - a.rating) / 400));
    const scoreA = r.winner === 'a' ? 1 : r.winner === 'b' ? 0 : 0.5; // Unentschieden & „beide schlecht“ = halbe Punkte
    a.rating += 32 * (scoreA - expectedA);
    b.rating -= 32 * (scoreA - expectedA);
    a.votes++; b.votes++;
    if (r.winner === 'a') a.wins++;
    if (r.winner === 'b') b.wins++;
  }
  const models = await Promise.all([...stats.values()].map(async (m) => ({
    ...(await describeModel(m.id)), rating: Math.round(m.rating), votes: m.votes, wins: m.wins,
  })));
  models.sort((x, y) => y.rating - x.rating || y.votes - x.votes);
  board = { at: Date.now(), data: { models, totalVotes: rows.length } };
  res.json(board.data);
}));

// Einen gespeicherten Chat laden (Battle-Modelle bleiben geheim, bis abgestimmt wurde)
chat.get('/:id', wrap(async (req, res) => {
  const row = await get('SELECT * FROM chats WHERE id = ? AND user_id = ?', req.params.id, req.user.id);
  if (!row) throw new HttpError(404, 'Chat nicht gefunden.');
  const msgs = await all('SELECT turn, side, content, status, error, meta FROM messages WHERE chat_id = ? ORDER BY turn, side', row.id);
  const sides = row.mode === 'direct' || row.mode === 'agent' ? 1 : 2;
  const turns = [];
  for (const m of msgs) {
    turns[m.turn] ??= { user: '', answers: Array.from({ length: sides }, () => ({ text: '', status: 'stopped', error: null })) };
    if (m.side < 0) turns[m.turn].user = m.content;
    else if (m.side < sides) {
      let meta = {};
      try { meta = JSON.parse(m.meta || '{}'); } catch { /* egal */ }
      turns[m.turn].answers[m.side] = {
        text: m.content, status: m.status, error: m.error,
        steps: meta.steps ?? [], thinking: meta.thinking ?? '', thinkMs: meta.thinkMs ?? 0,
      };
    }
  }
  const ids = [row.model_a, row.model_b].filter(Boolean);
  const names = await Promise.all(ids.map(displayName));
  const reveal = row.mode !== 'battle' || row.winner;
  res.json({
    id: row.id,
    mode: row.mode,
    modality: row.modality || 'auto',
    title: row.title || 'Chat',
    winner: row.winner,
    models: row.mode === 'battle' || row.mode === 'agent' ? null : ids,
    labels: reveal ? names : null,
    turns: turns.filter((t) => t && t.user),
  });
}));

chat.delete('/:id', wrap(async (req, res) => {
  const row = await get('SELECT id FROM chats WHERE id = ? AND user_id = ?', req.params.id, req.user.id);
  if (!row) throw new HttpError(404, 'Chat nicht gefunden.');
  await run('DELETE FROM messages WHERE chat_id = ?', row.id);
  // Battle-Stimmen bleiben für die Bestenliste erhalten, nur der Inhalt wird gelöscht
  if (row && (await get('SELECT winner FROM chats WHERE id = ?', row.id))?.winner) {
    await run("UPDATE chats SET user_id = 0, title = NULL WHERE id = ?", row.id);
  } else {
    await run('DELETE FROM chats WHERE id = ?', row.id);
  }
  res.json({ ok: true });
}));

// Abstimmen (einmal pro Chat). Gibt die Modellnamen zurück → Auflösung im Battle.
chat.post('/vote', wrap(async (req, res) => {
  const { chatId, winner } = req.body ?? {};
  if (!WINNERS.has(winner)) throw new HttpError(400, 'Ungültige Stimme.');
  const row = await get('SELECT * FROM chats WHERE id = ? AND user_id = ?', String(chatId ?? ''), req.user.id);
  if (!row || !row.model_b) throw new HttpError(404, 'Chat nicht gefunden.');
  if (!row.winner) {
    await run('UPDATE chats SET winner = ?, voted_at = ? WHERE id = ?', winner, Date.now(), row.id);
    board.at = 0; // Bestenliste neu berechnen
  }
  res.json({ models: [await displayName(row.model_a), await displayName(row.model_b)], winner: row.winner ?? winner });
}));

chat.use(errorHandler);

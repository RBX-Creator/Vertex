import { Router } from 'express';
import { randomBytes } from 'node:crypto';
import { get, run, all, purgeChats } from './db.js';
import { t } from './i18n.js';
import { currentUser, HttpError, wrap, errorHandler } from './auth.js';
import { runAgent } from './agent.js';
import { sourcesFromText } from './models.js';
import { pickAvailable } from './models.js';
import { listModels, findModel, streamChat, displayName, describeModel, modelKey, demoMode } from './models.js';

const MAX_MESSAGES = 40;          // so viele Nachrichten gehen max. ans Modell
const MAX_CHARS = 20_000;         // pro Nachricht
const WINNERS = new Set(['a', 'b', 'tie', 'bad']);
const MAX_IMAGES = 4;               // so viele Bilder gehen max. ans Modell (die neuesten)
const MAX_IMAGE_CHARS = 3_000_000;  // ~2,2 MB pro Bild (base64)
const IMAGE_URL = /^data:image\/(png|jpe?g|webp|gif);base64,[A-Za-z0-9+/=]+$/;

// Nachricht prüfen: Text oder (nur vom Nutzer) eine Liste aus Text- und Bild-Teilen
function cleanMessage(m) {
  if (!m || !['user', 'assistant'].includes(m.role)) throw new HttpError(400, t('Ungültige Nachricht.', 'Invalid message.'));
  if (typeof m.content === 'string') return { role: m.role, content: m.content.slice(0, MAX_CHARS) };
  if (m.role !== 'user' || !Array.isArray(m.content) || m.content.length > 12) throw new HttpError(400, t('Ungültige Nachricht.', 'Invalid message.'));
  return {
    role: 'user',
    content: m.content.map((p) => {
      if (p?.type === 'text' && typeof p.text === 'string') return { type: 'text', text: p.text.slice(0, MAX_CHARS * 3) };
      const url = p?.image_url?.url;
      if (p?.type === 'image_url' && typeof url === 'string' && url.length <= MAX_IMAGE_CHARS && IMAGE_URL.test(url)) {
        return { type: 'image_url', image_url: { url } };
      }
      throw new HttpError(400, t('Dieses Bild kann nicht verarbeitet werden.', 'This image cannot be processed.'));
    }),
  };
}
const imageCount = (msgs) => msgs.reduce((n, m) => n + (Array.isArray(m.content) ? m.content.filter((p) => p.type === 'image_url').length : 0), 0);

// Nur die neuesten Bilder behalten, ältere durch einen Hinweis ersetzen
function limitImages(msgs) {
  let keep = MAX_IMAGES;
  for (let i = msgs.length - 1; i >= 0; i--) {
    if (!Array.isArray(msgs[i].content)) continue;
    msgs[i].content = msgs[i].content.map((p) => {
      if (p.type !== 'image_url') return p;
      if (keep > 0) { keep--; return p; }
      return { type: 'text', text: '[älteres Bild]' };
    });
  }
  return msgs;
}
// Für Modelle ohne Bilder: Teile zu reinem Text zusammenfügen
const flatten = (msgs) => msgs.map((m) => (Array.isArray(m.content)
  ? { ...m, content: m.content.map((p) => (p.type === 'text' ? p.text : '[Bild]')).join('\n') }
  : m));
// Art der Anfrage → welche Modelle passen
const MODALITY_CAP = { auto: 'text', text: 'text', code: 'code', web: 'web' };
const CODE_PROMPT = 'Du bist ein erfahrener Entwickler. Antworte in der Sprache des Nutzers. Wenn eine Webseite, ein Spiel oder eine App gewünscht ist, liefere eine vollständige, lauffähige einzelne HTML-Datei (CSS und JavaScript eingebettet) in genau einem ```html-Codeblock und erkläre danach kurz, was sie macht.';

export const chat = Router();

// Nur für angemeldete Nutzer
chat.use(wrap(async (req, res, next) => {
  req.user = await currentUser(req);
  if (!req.user) throw new HttpError(401, t('Bitte melde dich erneut an.', 'Please sign in again.'));
  next();
}));

// Premium-Modelle (kosten Guthaben): höchstens PAID_DAILY_LIMIT Antworten pro Nutzer und Tag
const PAID_DAILY_LIMIT = Math.max(0, Number(process.env.PAID_DAILY_LIMIT ?? 20));
const paidUse = new Map();
const today = () => new Date().toISOString().slice(0, 10);
function paidAllowed(userId) {
  const key = `${userId}:${today()}`;
  return (paidUse.get(key) ?? 0) < PAID_DAILY_LIMIT;
}
function countPaid(userId) {
  const key = `${userId}:${today()}`;
  paidUse.set(key, (paidUse.get(key) ?? 0) + 1);
  if (paidUse.size > 5000) for (const k of paidUse.keys()) if (!k.endsWith(today())) paidUse.delete(k);
}
const premiumError = () => Object.assign(
  new Error(t(`Du hast dein Tageslimit für Premium-Modelle erreicht (${PAID_DAILY_LIMIT} pro Tag). Wähle ein kostenloses Modell.`, `You reached your daily limit for premium models (${PAID_DAILY_LIMIT} per day). Choose a free model.`)),
  { status: 429, premium: true },
);

// Limits pro Nutzer: 40 Antworten in 5 Minuten und USER_DAILY_LIMIT pro Tag (Standard 500)
const USER_DAILY_LIMIT = Math.max(1, Number(process.env.USER_DAILY_LIMIT ?? 500));
const usage = new Map();
const daily = new Map();
function limit(userId) {
  const now = Date.now();
  const list = (usage.get(userId) || []).filter((ts) => now - ts < 5 * 60 * 1000);
  if (list.length >= 40) throw new HttpError(429, t('Du sendest gerade sehr viele Nachrichten. Warte kurz.', 'You are sending a lot of messages. Please wait a moment.'));
  const dayKey = `${userId}:${today()}`;
  if ((daily.get(dayKey) ?? 0) >= USER_DAILY_LIMIT) {
    throw new HttpError(429, t(`Du hast dein Tageslimit von ${USER_DAILY_LIMIT} Antworten erreicht. Morgen geht es weiter.`, `You reached your daily limit of ${USER_DAILY_LIMIT} answers. See you tomorrow.`));
  }
  list.push(now);
  usage.set(userId, list);
  daily.set(dayKey, (daily.get(dayKey) ?? 0) + 1);
}
setInterval(() => {
  const now = Date.now();
  for (const [k, list] of usage) if (list.every((ts) => now - ts > 5 * 60 * 1000)) usage.delete(k);
  for (const k of daily.keys()) if (!k.endsWith(today())) daily.delete(k);
}, 10 * 60 * 1000).unref();

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
    const cap = req.body?.images ? 'vision' : MODALITY_CAP[modality];
    const first = await pickAvailable(cap);
    const second = first && await pickAvailable(cap, [first.id]);
    if (!first || !second) throw new HttpError(503, modality === 'web' ? t('Für ein Websuche-Battle sind gerade nicht genug Such-Modelle frei. Versuche es gleich noch einmal.', 'Not enough search models are free for a web search battle right now. Try again in a moment.') : t('Gerade sind nicht genug Modelle frei. Versuche es gleich noch einmal.', 'Not enough models are free right now. Try again in a moment.'));
    picked = [first.id, second.id];
  } else if (mode === 'sxs' || mode === 'direct') {
    const need = mode === 'sxs' ? 2 : 1;
    if (!Array.isArray(models) || models.length !== need) throw new HttpError(400, t('Bitte wähle die Modelle aus.', 'Please choose the models.'));
    for (const id of models) if (!(await findModel(id))) throw new HttpError(400, t('Dieses Modell ist nicht verfügbar.', 'This model is not available.'));
    picked = models;
  } else {
    throw new HttpError(400, t('Unbekannter Modus.', 'Unknown mode.'));
  }

  const id = randomBytes(12).toString('base64url');
  const now = Date.now();
  await run(
    'INSERT INTO chats (id, user_id, mode, modality, model_a, model_b, title, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    id, req.user.id, mode, modality, picked[0], picked[1] ?? null, String(title ?? '').trim().slice(0, 80) || t('Neuer Chat', 'New chat'), now, now,
  );
  res.json({ id, models: mode === 'battle' ? null : await Promise.all(picked.map(displayName)) });
}));

// Antwort einer Seite (0 = A, 1 = B) als NDJSON-Stream
chat.post('/stream', wrap(async (req, res) => {
  const { chatId, side = 0, messages, turn, display } = req.body ?? {};
  const row = await get('SELECT * FROM chats WHERE id = ? AND user_id = ?', String(chatId ?? ''), req.user.id);
  if (!row) throw new HttpError(404, t('Chat nicht gefunden. Starte einen neuen Chat.', 'Chat not found. Start a new chat.'));
  let model = side === 1 ? row.model_b : row.model_a;
  if (!model) throw new HttpError(400, t('Ungültige Seite.', 'Invalid side.'));

  if (!Array.isArray(messages) || !messages.length) throw new HttpError(400, t('Keine Nachricht.', 'No message.'));
  let clean = limitImages(messages.slice(-MAX_MESSAGES).map(cleanMessage));
  if (clean.at(-1).role !== 'user') throw new HttpError(400, t('Die letzte Nachricht muss von dir sein.', 'The last message must be yours.'));
  const hasImages = imageCount(clean) > 0;
  if (hasImages && row.mode === 'agent') throw new HttpError(400, t('Agent X kann noch keine Bilder ansehen. Nutze „Direkt“ mit einem Modell mit 👁-Symbol.', 'Agent X cannot look at images yet. Use “Direct” with a model that has the 👁 icon.'));
  if (hasImages && model !== 'agent' && !(await findModel(model))?.caps.includes('vision')) {
    if (row.mode === 'battle') {
      // Im Battle still ein Modell nehmen, das Bilder sehen kann
      const fresh = await get('SELECT model_a, model_b FROM chats WHERE id = ?', row.id);
      const next = await pickAvailable('vision', [side === 1 ? fresh.model_a : fresh.model_b]);
      if (!next) throw new HttpError(503, t('Gerade ist kein Modell frei, das Bilder ansehen kann.', 'No model that can see images is free right now.'));
      model = next.id;
      await run(`UPDATE chats SET ${side === 1 ? 'model_b' : 'model_a'} = ? WHERE id = ?`, model, row.id);
    } else {
      throw new HttpError(400, t('Dieses Modell kann keine Bilder ansehen. Wähle ein Modell mit 👁-Symbol.', 'This model cannot see images. Choose a model with the 👁 icon.'));
    }
  }
  // Ältere Bilder für Modelle ohne Bild-Fähigkeit nicht mitschicken
  if (!hasImages) clean = flatten(clean);
  const turnNo = Number.isInteger(turn) && turn >= 0 && turn < 1000 ? turn : null;
  limit(req.user.id);

  // Verlauf speichern: deine Frage sofort, die Antwort am Ende
  const steps = [];
  let thinking = '';
  const sources = new Map();
  const onSources = (list) => {
    let added = false;
    for (const src of list) {
      if (!src?.url || sources.has(src.url) || sources.size >= 12) continue;
      sources.set(src.url, src);
      added = true;
    }
    if (added) res.write(`${JSON.stringify({ sources: [...sources.values()] })}\n`);
  };
  let thinkStart = 0;
  let thinkMs = 0;
  const save = (s, content, status = 'done', error = null, attachments = null) => (turnNo === null ? null : run(
    `INSERT INTO messages (chat_id, turn, side, content, status, error, meta, attachments, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(chat_id, turn, side) DO UPDATE SET content = excluded.content, status = excluded.status, error = excluded.error,
       meta = excluded.meta, attachments = COALESCE(excluded.attachments, messages.attachments)`,
    row.id, turnNo, s, content, status, error,
    s >= 0 && (steps.length || thinking || sources.size)
      ? JSON.stringify({ steps, thinking: thinking.slice(0, 20_000), thinkMs, sources: [...sources.values()] }) : null,
    attachments, Date.now(),
  ).catch((e) => console.error('Verlauf speichern fehlgeschlagen:', e.message)));
  // Deine Frage so speichern, wie sie angezeigt wird (Text + Anhänge), nicht als Modell-Format
  const shown = typeof display?.text === 'string' ? display.text.slice(0, MAX_CHARS) : (typeof clean.at(-1).content === 'string' ? clean.at(-1).content : '');
  const files = Array.isArray(display?.attachments) ? display.attachments.slice(0, 8).map((a) => (a?.kind === 'image' && typeof a.url === 'string' && a.url.length <= MAX_IMAGE_CHARS && IMAGE_URL.test(a.url)
    ? { kind: 'image', name: String(a.name ?? 'Bild').slice(0, 120), url: a.url }
    : { kind: 'file', name: String(a?.name ?? 'Datei').slice(0, 120), text: String(a?.text ?? '').slice(0, MAX_CHARS * 3) })) : [];
  await save(-1, shown, 'done', null, files.length ? JSON.stringify(files) : null);
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
        onSources,
        onStep: (step) => { steps.push(step); res.write(`${JSON.stringify({ step })}\n`); },
      });
    } else {
      // Im Battle springt bei einem Ausfall still ein anderes Modell ein (Namen sind ja geheim)
      const tried = [model];
      for (let attempt = 0; ; attempt++) {
        try {
          if ((await findModel(model))?.paid) {
            if (!paidAllowed(req.user.id)) throw premiumError();
            countPaid(req.user.id);
          }
          await streamChat({
            model,
            messages: row.modality === 'code' ? [{ role: 'system', content: CODE_PROMPT }, ...(hasImages ? clean : flatten(clean))] : clean,
            signal: controller.signal,
            onText,
            onReasoning,
            onSources,
          });
          break;
        } catch (err) {
          if (controller.signal.aborted || text || row.mode !== 'battle' || attempt >= 3) throw err;
          const fresh = await get('SELECT model_a, model_b FROM chats WHERE id = ?', row.id);
          const other = side === 1 ? fresh.model_a : fresh.model_b;
          const premiumIds = paidAllowed(req.user.id) ? [] : (await listModels()).filter((m) => m.paid).map((m) => m.id);
          const next = await pickAvailable(hasImages ? 'vision' : (MODALITY_CAP[row.modality] ?? 'text'), [...tried, other, ...premiumIds]);
          if (!next) throw err;
          console.log(`Battle-Ersatz: ${model} → ${next.id} (${err.message})`);
          model = next.id;
          tried.push(model);
          thinking = '';
          await run(`UPDATE chats SET ${side === 1 ? 'model_b' : 'model_a'} = ? WHERE id = ?`, model, row.id);
        }
      }
      // Websuche: zusätzlich Links aus der Antwort als Quellen sammeln
      if (row.modality === 'web' || /#search$|compound/.test(model)) onSources(sourcesFromText(text));
    }
    res.write(`${JSON.stringify({ done: true })}\n`);
    await save(side === 1 ? 1 : 0, text, text ? 'done' : 'error', text ? null : t('Das Modell hat keine Antwort geliefert.', 'The model returned no answer.'));
  } catch (err) {
    if (controller.signal.aborted) {
      await save(side === 1 ? 1 : 0, text, text ? 'done' : 'stopped');
    } else {
      console.error(`Stream-Fehler (${model}):`, err.message);
      const message = err.message || t('Das Modell konnte nicht antworten.', 'The model could not answer.');
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
  res.json({ chats: rows.map((r) => ({ id: r.id, title: r.title || t('Chat', 'Chat'), mode: r.mode, updated: r.updated })) });
}));

// ── Bestenliste (Elo aus den Battle-Stimmen) ──────────────────────
// Kategorien: all, text (Auto/Text), code, web
const BOARD_CATS = {
  all: '',
  text: "AND (modality IS NULL OR modality IN ('auto', 'text'))",
  code: "AND modality = 'code'",
  web: "AND modality = 'web'",
};
const boards = new Map();
chat.get('/leaderboard', wrap(async (req, res) => {
  const cat = BOARD_CATS[req.query.cat] !== undefined ? req.query.cat : 'all';
  const cached = boards.get(cat);
  if (cached && Date.now() - cached.at < 60_000) return res.json(cached.data);
  const rows = await all(`SELECT model_a, model_b, winner FROM chats
    WHERE mode = 'battle' AND winner IS NOT NULL AND model_b IS NOT NULL ${BOARD_CATS[cat]} ORDER BY voted_at`);
  const stats = new Map();
  const entry = (id) => {
    const key = modelKey(id);
    if (!stats.has(key)) stats.set(key, { id, rating: 1000, votes: 0, wins: 0, losses: 0, ties: 0 });
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
    if (r.winner === 'a') { a.wins++; b.losses++; } else if (r.winner === 'b') { b.wins++; a.losses++; } else { a.ties++; b.ties++; }
  }
  const models = await Promise.all([...stats.values()].map(async (m) => ({
    ...(await describeModel(m.id)),
    rating: Math.round(m.rating),
    votes: m.votes,
    wins: m.wins,
    losses: m.losses,
    ties: m.ties,
    winRate: m.votes ? Math.round(((m.wins + m.ties / 2) / m.votes) * 100) : 0,
  })));
  models.sort((x, y) => y.rating - x.rating || y.votes - x.votes);
  const data = { cat, models, totalVotes: rows.length };
  boards.set(cat, { at: Date.now(), data });
  res.json(data);
}));

// ── Verlauf bearbeiten ────────────────────────────────────────────
// Ab einer Frage alles löschen (zum Bearbeiten einer Nachricht)
chat.post('/truncate', wrap(async (req, res) => {
  const { chatId, fromTurn } = req.body ?? {};
  const row = await get('SELECT id, mode, winner FROM chats WHERE id = ? AND user_id = ?', String(chatId ?? ''), req.user.id);
  if (!row) throw new HttpError(404, t('Chat nicht gefunden.', 'Chat not found.'));
  if (!Number.isInteger(fromTurn) || fromTurn < 0) throw new HttpError(400, t('Ungültige Nachricht.', 'Invalid message.'));
  if (row.mode === 'battle' && row.winner) throw new HttpError(400, t('Nach der Abstimmung kann das Battle nicht mehr geändert werden.', 'The battle cannot be changed after voting.'));
  await run('DELETE FROM messages WHERE chat_id = ? AND turn >= ?', row.id, fromTurn);
  res.json({ ok: true });
}));

// Chat umbenennen
chat.post('/rename', wrap(async (req, res) => {
  const { chatId } = req.body ?? {};
  const title = String(req.body?.title ?? '').replace(/\s+/g, ' ').trim().slice(0, 80);
  if (!title) throw new HttpError(400, t('Der Name darf nicht leer sein.', 'The name cannot be empty.'));
  const row = await get('SELECT id FROM chats WHERE id = ? AND user_id = ?', String(chatId ?? ''), req.user.id);
  if (!row) throw new HttpError(404, t('Chat nicht gefunden.', 'Chat not found.'));
  await run('UPDATE chats SET title = ? WHERE id = ?', title, row.id);
  res.json({ ok: true, title });
}));

// Alle eigenen Chats löschen
chat.post('/clear', wrap(async (req, res) => {
  await purgeChats(req.user.id);
  res.json({ ok: true });
}));

// Einen gespeicherten Chat laden (Battle-Modelle bleiben geheim, bis abgestimmt wurde)
chat.get('/:id', wrap(async (req, res) => {
  const row = await get('SELECT * FROM chats WHERE id = ? AND user_id = ?', req.params.id, req.user.id);
  if (!row) throw new HttpError(404, t('Chat nicht gefunden.', 'Chat not found.'));
  const msgs = await all('SELECT turn, side, content, status, error, meta, feedback, attachments FROM messages WHERE chat_id = ? ORDER BY turn, side', row.id);
  const sides = row.mode === 'direct' || row.mode === 'agent' ? 1 : 2;
  const turns = [];
  for (const m of msgs) {
    turns[m.turn] ??= { user: '', answers: Array.from({ length: sides }, () => ({ text: '', status: 'stopped', error: null })) };
    if (m.side < 0) {
      turns[m.turn].user = m.content;
      try { turns[m.turn].attachments = JSON.parse(m.attachments || '[]'); } catch { turns[m.turn].attachments = []; }
    }
    else if (m.side < sides) {
      let meta = {};
      try { meta = JSON.parse(m.meta || '{}'); } catch { /* egal */ }
      turns[m.turn].answers[m.side] = {
        text: m.content, status: m.status, error: m.error,
        steps: meta.steps ?? [], thinking: meta.thinking ?? '', thinkMs: meta.thinkMs ?? 0, feedback: m.feedback ?? 0,
        sources: meta.sources ?? [],
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
    turns: turns.filter((t) => t && (t.user || t.attachments?.length)),
  });
}));

// 👍 / 👎 zu einer Antwort (1, -1 oder 0 zum Zurücknehmen)
chat.post('/feedback', wrap(async (req, res) => {
  const { chatId, turn, side, value } = req.body ?? {};
  if (![1, -1, 0].includes(value) || !Number.isInteger(turn) || ![0, 1].includes(side)) throw new HttpError(400, t('Ungültige Bewertung.', 'Invalid rating.'));
  const row = await get('SELECT id FROM chats WHERE id = ? AND user_id = ?', String(chatId ?? ''), req.user.id);
  if (!row) throw new HttpError(404, t('Chat nicht gefunden.', 'Chat not found.'));
  await run('UPDATE messages SET feedback = ? WHERE chat_id = ? AND turn = ? AND side = ?', value || null, row.id, turn, side);
  res.json({ ok: true });
}));

chat.delete('/:id', wrap(async (req, res) => {
  const row = await get('SELECT id FROM chats WHERE id = ? AND user_id = ?', req.params.id, req.user.id);
  if (!row) throw new HttpError(404, t('Chat nicht gefunden.', 'Chat not found.'));
  await purgeChats(req.user.id, row.id); // Battle-Stimmen bleiben für die Bestenliste erhalten
  res.json({ ok: true });
}));

// Abstimmen (einmal pro Chat). Gibt die Modellnamen zurück → Auflösung im Battle.
chat.post('/vote', wrap(async (req, res) => {
  const { chatId, winner } = req.body ?? {};
  if (!WINNERS.has(winner)) throw new HttpError(400, t('Ungültige Stimme.', 'Invalid vote.'));
  const row = await get('SELECT * FROM chats WHERE id = ? AND user_id = ?', String(chatId ?? ''), req.user.id);
  if (!row || !row.model_b) throw new HttpError(404, t('Chat nicht gefunden.', 'Chat not found.'));
  if (!row.winner) {
    await run('UPDATE chats SET winner = ?, voted_at = ? WHERE id = ?', winner, Date.now(), row.id);
    boards.clear(); // Bestenliste neu berechnen
  }
  res.json({ models: [await displayName(row.model_a), await displayName(row.model_b)], winner: row.winner ?? winner });
}));

chat.use(errorHandler);

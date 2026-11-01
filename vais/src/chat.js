import { Router } from 'express';
import { randomBytes } from 'node:crypto';
import { get, run, all, purgeChats, getSetting, logEvent } from './db.js';
import { t } from './i18n.js';
import { currentUser, HttpError, wrap, errorHandler } from './auth.js';
import { runAgent, quickReaction } from './agent.js';
import { profile, personalFor, instructionsPrompt, remember } from './profile.js';
import { push, addReminder } from './push.js';
import { limitSettings, charge, refund, usageOf } from './limits.js';
import { sourcesFromText } from './models.js';
import { pickAvailable, isBusy } from './models.js';
import { generateImage, helperModel, complete } from './models.js';
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
  if (typeof m.content === 'string') return { role: m.role, content: m.content.slice(0, MAX_CHARS * 3) }; // Platz für Dateien/PDFs
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
const MODALITY_CAP = { auto: 'text', text: 'text', code: 'code', web: 'web', image: 'image' };
const CODE_PROMPT = 'Du bist ein erfahrener Entwickler. Antworte in der Sprache des Nutzers. Wenn eine Webseite, ein Spiel oder eine App gewünscht ist, liefere eine vollständige, lauffähige einzelne HTML-Datei (CSS und JavaScript eingebettet) in genau einem ```html-Codeblock und erkläre danach kurz, was sie macht.';

export const chat = Router();

// Nur für angemeldete Nutzer
chat.use(wrap(async (req, res, next) => {
  req.user = await currentUser(req);
  if (!req.user) throw new HttpError(401, t('Bitte melde dich erneut an.', 'Please sign in again.'));
  next();
}));

chat.use('/profile', profile);
chat.use('/push', push);

// Premium-Modelle (kosten Guthaben): höchstens „paidDaily“ Antworten pro Nutzer und Tag (im Admin-Bereich einstellbar)
const paidUse = new Map();
const today = () => new Date().toISOString().slice(0, 10);
function paidAllowed(userId, max) {
  return (paidUse.get(`${userId}:${today()}`) ?? 0) < max;
}
function countPaid(userId) {
  const key = `${userId}:${today()}`;
  paidUse.set(key, (paidUse.get(key) ?? 0) + 1);
  if (paidUse.size > 5000) for (const k of paidUse.keys()) if (!k.endsWith(today())) paidUse.delete(k);
}
const premiumError = (max) => Object.assign(
  new Error(t(`Du hast dein Tageslimit für Premium-Modelle erreicht (${max} pro Tag). Wähle ein kostenloses Modell.`, `You reached your daily limit for premium models (${max} per day). Choose a free model.`)),
  { status: 429, premium: true },
);

// Schutz vor Dauerfeuer: höchstens „burst“ Antworten in 5 Minuten (das Tageslimit steht in limits.js)
const usage = new Map();
function limit(userId, burst) {
  const now = Date.now();
  const list = (usage.get(userId) || []).filter((ts) => now - ts < 5 * 60 * 1000);
  if (list.length >= burst) throw new HttpError(429, t('Du sendest gerade sehr viele Nachrichten. Warte kurz.', 'You are sending a lot of messages. Please wait a moment.'));
  list.push(now);
  usage.set(userId, list);
}
setInterval(() => {
  const now = Date.now();
  for (const [k, list] of usage) if (list.every((ts) => now - ts > 5 * 60 * 1000)) usage.delete(k);
}, 10 * 60 * 1000).unref();

// Agent X steht als eigenes „Modell“ ganz oben in der Liste
const AGENT_MODEL = { id: 'agent', provider: 'vais', name: 'Agent X', maker: 'VAIs', icon: 'vais', caps: ['text', 'code', 'web', 'vision'], agent: true };
chat.get('/models', wrap(async (req, res) => {
  res.json({ models: [AGENT_MODEL, ...(await listModels())], demo: demoMode });
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
    if ((!first || !second) && modality === 'image') throw new HttpError(503, t('Für ein Bild-Battle gibt es gerade nicht genug Bild-Modelle. Nutze „Direkt“.', 'There are not enough image models for an image battle right now. Use “Direct”.'));
    if (!first || !second) throw new HttpError(503, modality === 'web' ? t('Für ein Websuche-Battle sind gerade nicht genug Such-Modelle frei. Versuche es gleich noch einmal.', 'Not enough search models are free for a web search battle right now. Try again in a moment.') : t('Gerade sind nicht genug Modelle frei. Versuche es gleich noch einmal.', 'Not enough models are free right now. Try again in a moment.'));
    picked = [first.id, second.id];
  } else if (mode === 'sxs' || mode === 'direct') {
    const need = mode === 'sxs' ? 2 : 1;
    if (!Array.isArray(models) || models.length !== need) throw new HttpError(400, t('Bitte wähle die Modelle aus.', 'Please choose the models.'));
    for (const id of models) if (id !== 'agent' && !(await findModel(id))) throw new HttpError(400, t('Dieses Modell ist nicht verfügbar.', 'This model is not available.'));
    if (mode === 'sxs' && models[0] === models[1]) throw new HttpError(400, t('Bitte wähle zwei verschiedene Modelle.', 'Please choose two different models.'));
    if (modality === 'image') {
      for (const id of models) if (id === 'agent' || !(await findModel(id))?.caps.includes('image')) throw new HttpError(400, t('Bitte wähle ein Bild-Modell.', 'Please choose an image model.'));
    }
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

// Eine einzige Systemnachricht vorne (manche Anbieter mögen keine mehreren)
function withSystem(parts, messages) {
  const text = parts.filter(Boolean).join('\n\n');
  return text ? [{ role: 'system', content: text }, ...messages] : messages;
}

// Notfall-Modelle: ist das gewählte Modell voll, antwortet ein starkes freies Modell (bevorzugt Groq)
const NOTFALL_STATUS = new Set([401, 403, 404, 429, 500, 502, 503, 504]);
const EMERGENCY = {
  text: [/^groq:openai\/gpt-oss-120b$/, /^groq:moonshotai\/kimi-k2/, /^groq:.*llama-3\.3-70b/, /^groq:qwen\/qwen3/, /^groq:openai\/gpt-oss-20b$/, /^groq:/, /^gemini:/, /^cerebras:/, /^mistral:/, /^openrouter:.*:free$/],
  code: [/^groq:openai\/gpt-oss-120b$/, /^groq:moonshotai\/kimi-k2/, /^groq:qwen\/qwen3/, /^groq:/, /^gemini:/, /^openrouter:.*:free$/],
  web: [/^groq:groq\/compound$/, /^groq:openai\/gpt-oss-120b#search$/, /^groq:.*compound/, /#search$/],
  vision: [/^groq:meta-llama\/llama-4-maverick/, /^groq:meta-llama\/llama-4-scout/, /^gemini:/, /^openrouter:.*:free$/],
  image: [/^pollinations:/],
};
async function pickEmergency(cap, exclude) {
  const all = (await listModels()).filter((m) => m.caps.includes(cap) && !m.busy && !exclude.includes(m.id));
  for (const re of EMERGENCY[cap] ?? EMERGENCY.text) {
    const hit = all.find((m) => re.test(m.id));
    if (hit) return hit;
  }
  return all[0] ?? null;
}

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
  if (hasImages && model !== 'agent' && row.modality !== 'image' && !(await findModel(model))?.caps.includes('vision')) {
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
  const L = await limitSettings();
  limit(req.user.id, L.burst);
  // Punkte fürs Tageslimit: je nach Art der Antwort
  const info = model === 'agent' ? null : await findModel(model);
  const quick = model === 'agent' ? quickReaction(clean) : null; // „ok“, „danke“ … → nur Emoji, kostet nichts
  const [cost, what] = quick ? [0, ''] : model === 'agent' ? [L.costAgent, 'Agent X']
    : row.modality === 'image' ? [L.costImage, t('Ein Bild', 'An image')]
      : info?.paid ? [L.costPremium, t('Ein Premium-Modell', 'A premium model')]
        : row.modality === 'web' || info?.caps.includes('web') ? [L.costWeb, t('Websuche', 'Web search')]
          : [L.costText, t('Eine Antwort', 'An answer')];
  const charged = await charge(req.user, cost, what);
  const personal = await personalFor(req.user.id);
  const custom = row.modality === 'image' ? null : instructionsPrompt(personal.instructions);

  // Verlauf speichern: deine Frage sofort, die Antwort am Ende
  const steps = [];
  const images = [];
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
  let reaction = null; // Emoji-Reaktion von Agent X auf deine Nachricht
  let fallback = null; // Notfall-Modell, falls das gewählte voll war
  const save = (s, content, status = 'done', error = null, attachments = null) => (turnNo === null ? null : run(
    `INSERT INTO messages (chat_id, turn, side, content, status, error, meta, attachments, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(chat_id, turn, side) DO UPDATE SET content = excluded.content, status = excluded.status, error = excluded.error,
       meta = excluded.meta, attachments = COALESCE(excluded.attachments, messages.attachments)`,
    row.id, turnNo, s, content, status, error,
    s >= 0 && (steps.length || thinking || sources.size || images.length || reaction || fallback)
      ? JSON.stringify({ steps, thinking: thinking.slice(0, 20_000), thinkMs, sources: [...sources.values()], images, reaction, fallback }) : null,
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
    const onReact = (emoji) => { reaction = emoji || null; res.write(`${JSON.stringify({ react: reaction ?? '' })}\n`); };
    if (model === 'agent') {
      if (quick) onReact(quick);
      else {
        await runAgent({
          messages: clean,
          signal: controller.signal,
          onText,
          onReasoning,
          onSources,
          onReact,
          personal,
          onRemember: (fact) => remember(req.user.id, fact),
          onReminder: (args) => addReminder(req.user.id, args.text, args.when, args.in_minutes),
          onStep: (step) => { steps.push(step); res.write(`${JSON.stringify({ step })}\n`); },
        });
      }
    } else {
      // Im Battle springt bei einem Ausfall still ein anderes Modell ein (Namen sind ja geheim)
      const tried = [model];
      for (let attempt = 0; ; attempt++) {
        try {
          if ((await findModel(model))?.paid) {
            if (!paidAllowed(req.user.id, L.paidDaily)) throw premiumError(L.paidDaily);
            countPaid(req.user.id);
          }
          if (row.modality === 'image') {
            // Bild erstellen: Beschreibung = deine letzte Nachricht
            const last = clean.at(-1).content;
            const prompt = (typeof display?.text === 'string' && display.text.trim())
              || (Array.isArray(last) ? last.filter((x) => x.type === 'text').map((x) => x.text).join(' ') : last);
            const img = await generateImage({ model, prompt, signal: controller.signal });
            if (img) { images.push(img); res.write(`${JSON.stringify({ image: img })}\n`); }
            break;
          }
          await streamChat({
            model,
            messages: withSystem([row.modality === 'code' ? CODE_PROMPT : null, custom], clean),
            signal: controller.signal,
            onText,
            onReasoning,
            onSources,
          });
          break;
        } catch (err) {
          if (controller.signal.aborted || text || images.length || attempt >= 3 || err.premium) throw err;
          const battle = row.mode === 'battle';
          // In „Direkt“ und „Nebeneinander“ nur, wenn das Modell voll/nicht erreichbar ist – nicht bei anderen Fehlern
          if (!battle && !NOTFALL_STATUS.has(err.status) && !isBusy(model)) throw err;
          const fresh = await get('SELECT model_a, model_b FROM chats WHERE id = ?', row.id);
          const other = side === 1 ? fresh.model_a : fresh.model_b;
          const premiumIds = paidAllowed(req.user.id, L.paidDaily) ? [] : (await listModels()).filter((m) => m.paid).map((m) => m.id);
          const needCap = row.modality === 'image' ? 'image' : hasImages ? 'vision' : (MODALITY_CAP[row.modality] ?? 'text');
          const next = battle ? await pickAvailable(needCap, [...tried, other, ...premiumIds]) : await pickEmergency(needCap, [...tried, ...premiumIds]);
          if (!next) throw err;
          console.log(`${battle ? 'Battle-Ersatz' : 'Notfall-Modell'}: ${model} → ${next.id} (${err.message})`);
          logEvent('fallback', model, err.message);
          model = next.id;
          tried.push(model);
          thinking = '';
          if (battle) await run(`UPDATE chats SET ${side === 1 ? 'model_b' : 'model_a'} = ? WHERE id = ?`, model, row.id);
          else {
            // Dein gewähltes Modell bleibt im Chat – diese eine Antwort kommt vom Notfall-Modell
            fallback = { id: next.id, name: next.name, maker: next.maker, icon: next.icon };
            res.write(`${JSON.stringify({ fallback })}\n`);
          }
        }
      }
      // Websuche: zusätzlich Links aus der Antwort als Quellen sammeln
      if (row.modality === 'web' || /#search$|compound/.test(model)) onSources(sourcesFromText(text));
    }
    res.write(`${JSON.stringify({ done: true })}\n`);
    const got = text || images.length || reaction;
    if (!got) await refund(req.user, charged);
    await save(side === 1 ? 1 : 0, text, got ? 'done' : 'error', got ? null : t('Das Modell hat keine Antwort geliefert.', 'The model returned no answer.'));
  } catch (err) {
    if (!text && !images.length && !reaction) await refund(req.user, charged); // keine Antwort → Punkte zurück
    if (controller.signal.aborted) {
      await save(side === 1 ? 1 : 0, text, text || images.length ? 'done' : 'stopped');
    } else {
      console.error(`Stream-Fehler (${model}):`, err.message);
      logEvent('error', model, err.message);
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
  image: "AND modality = 'image'",
};
const boards = new Map();
export const clearBoards = () => boards.clear();
chat.get('/leaderboard', wrap(async (req, res) => {
  const cat = BOARD_CATS[req.query.cat] !== undefined ? req.query.cat : 'all';
  const cached = boards.get(cat);
  if (cached && Date.now() - cached.at < 60_000) return res.json(cached.data);
  const since = Number(await getSetting('board_reset_at', 0)) || 0;
  const rows = await all(`SELECT model_a, model_b, winner FROM chats
    WHERE mode = 'battle' AND winner IS NOT NULL AND model_b IS NOT NULL AND COALESCE(voted_at, 0) >= ? ${BOARD_CATS[cat]} ORDER BY voted_at`, since);
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

// ── Extras nach einer Antwort: Titel (beim ersten Mal) und 3 Folgefragen ──
chat.post('/extras', wrap(async (req, res) => {
  const { chatId, turn } = req.body ?? {};
  const row = await get('SELECT id, mode, modality, title, renamed FROM chats WHERE id = ? AND user_id = ?', String(chatId ?? ''), req.user.id);
  if (!row || !Number.isInteger(turn)) throw new HttpError(404, t('Chat nicht gefunden.', 'Chat not found.'));
  const msgs = await all('SELECT side, content FROM messages WHERE chat_id = ? AND turn = ? ORDER BY side', row.id, turn);
  const question = msgs.find((m) => m.side === -1)?.content ?? '';
  const answer = msgs.find((m) => m.side === 0)?.content ?? '';
  if (!question) return res.json({ suggestions: [] });
  const wantTitle = turn === 0 && !row.renamed;

  if (demoMode) {
    const s = t(['Erklär das genauer', 'Gib mir ein Beispiel', 'Fasse es kurz zusammen'], ['Explain that in more detail', 'Give me an example', 'Summarize it briefly']);
    const title = wantTitle ? question.split(/\s+/).slice(0, 4).join(' ').slice(0, 60) : undefined;
    if (title) await run('UPDATE chats SET title = ? WHERE id = ? AND renamed IS NULL', title, row.id);
    return res.json({ title, suggestions: s });
  }
  const model = await helperModel();
  if (!model) return res.json({ suggestions: [] });

  const imageMode = row.modality === 'image';
  const prompt = [
    'Antworte NUR mit JSON, ohne Erklärung, im Format {"title": "...", "suggestions": ["...", "...", "..."]}.',
    wantTitle ? '"title": ein kurzer, treffender Titel für diesen Chat (2–5 Wörter, keine Anführungszeichen, kein Punkt).' : '"title": leer lassen.',
    imageMode
      ? '"suggestions": 3 kurze Ideen, wie man das Bild abwandeln könnte (je max. 8 Wörter), als Bildbeschreibung formuliert.'
      : '"suggestions": 3 kurze, unterschiedliche Folgefragen, die der Nutzer als Nächstes stellen könnte (je max. 10 Wörter), aus Sicht des Nutzers.',
    'Schreibe in derselben Sprache wie die Frage des Nutzers.',
    '',
    `Frage des Nutzers: ${question.slice(0, 1500)}`,
    answer ? `Antwort (Auszug): ${answer.slice(0, 2000)}` : '',
  ].join('\n');
  try {
    const msg = await complete({ model: model.id, messages: [{ role: 'user', content: prompt }] });
    const raw = String(msg.content ?? '').replace(/^[\s\S]*?(\{[\s\S]*\})[\s\S]*$/, '$1');
    const data = JSON.parse(raw);
    const suggestions = (Array.isArray(data.suggestions) ? data.suggestions : [])
      .map((x) => String(x).replace(/\s+/g, ' ').trim().slice(0, 120)).filter(Boolean).slice(0, 3);
    let title;
    if (wantTitle && typeof data.title === 'string') {
      title = data.title.replace(/["„“”]/g, '').replace(/[.\s]+$/, '').replace(/\s+/g, ' ').trim().slice(0, 60);
      if (title) await run('UPDATE chats SET title = ? WHERE id = ? AND renamed IS NULL', title, row.id);
    }
    res.json({ title: title || undefined, suggestions });
  } catch (err) {
    console.error('Extras fehlgeschlagen:', err.message);
    res.json({ suggestions: [] });
  }
}));

// ── Teilen ────────────────────────────────────────────────────────
chat.post('/share', wrap(async (req, res) => {
  const row = await get('SELECT id, share_id FROM chats WHERE id = ? AND user_id = ?', String(req.body?.chatId ?? ''), req.user.id);
  if (!row) throw new HttpError(404, t('Chat nicht gefunden.', 'Chat not found.'));
  let shareId = row.share_id;
  if (!shareId) {
    shareId = randomBytes(9).toString('base64url');
    await run('UPDATE chats SET share_id = ? WHERE id = ?', shareId, row.id);
  }
  res.json({ shareId, url: `/s/${shareId}` });
}));

chat.post('/unshare', wrap(async (req, res) => {
  const row = await get('SELECT id FROM chats WHERE id = ? AND user_id = ?', String(req.body?.chatId ?? ''), req.user.id);
  if (!row) throw new HttpError(404, t('Chat nicht gefunden.', 'Chat not found.'));
  await run('UPDATE chats SET share_id = NULL WHERE id = ?', row.id);
  res.json({ ok: true });
}));

// ── Meine Statistik ───────────────────────────────────────────────
// Eigener Verbrauch heute (0–100 %)
async function usageWithCosts(user) {
  const L = await limitSettings();
  return { ...(await usageOf(user)), costs: { text: L.costText, web: L.costWeb, image: L.costImage, agent: L.costAgent, premium: L.costPremium } };
}
chat.get('/usage', wrap(async (req, res) => res.json(await usageWithCosts(req.user))));

chat.get('/stats', wrap(async (req, res) => {
  const uid = req.user.id;
  const one = async (sql, ...args) => Number(Object.values((await get(sql, ...args)) ?? { n: 0 })[0] ?? 0);
  const chats = await one('SELECT COUNT(*) AS n FROM chats WHERE user_id = ? AND EXISTS (SELECT 1 FROM messages WHERE messages.chat_id = chats.id)', uid);
  const questions = await one('SELECT COUNT(*) AS n FROM messages m JOIN chats c ON c.id = m.chat_id WHERE c.user_id = ? AND m.side = -1', uid);
  const votes = await one("SELECT COUNT(*) AS n FROM chats WHERE user_id = ? AND mode = 'battle' AND winner IS NOT NULL", uid);
  const likes = await one('SELECT COUNT(*) AS n FROM messages m JOIN chats c ON c.id = m.chat_id WHERE c.user_id = ? AND m.feedback = 1', uid);
  const byMode = await all('SELECT mode, COUNT(*) AS n FROM chats WHERE user_id = ? GROUP BY mode', uid);

  // Lieblinge: welche Modelle haben bei deinen Battles gewonnen?
  const battles = await all("SELECT model_a, model_b, winner FROM chats WHERE user_id = ? AND mode = 'battle' AND winner IN ('a', 'b')", uid);
  const wins = new Map();
  for (const b of battles) {
    const id = modelKey(b.winner === 'a' ? b.model_a : b.model_b);
    wins.set(id, (wins.get(id) ?? 0) + 1);
  }
  // Meistgenutzt: Direkt und Side by Side
  const used = new Map();
  for (const r of await all("SELECT model_a, model_b FROM chats WHERE user_id = ? AND mode IN ('direct', 'sxs')", uid)) {
    for (const id of [r.model_a, r.model_b].filter(Boolean)) used.set(modelKey(id), (used.get(modelKey(id)) ?? 0) + 1);
  }
  const top = async (map) => Promise.all([...map.entries()].sort((x, y) => y[1] - x[1]).slice(0, 5)
    .map(async ([id, n]) => ({ ...(await describeModel(id)), n })));

  res.json({
    chats, questions, votes, likes,
    modes: Object.fromEntries(byMode.map((r) => [r.mode, Number(r.n)])),
    favorites: await top(wins),
    mostUsed: await top(used),
    since: req.user.created_at,
    usage: await usageWithCosts(req.user),
  });
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
  await run('UPDATE chats SET title = ?, renamed = 1 WHERE id = ?', title, row.id);
  res.json({ ok: true, title });
}));

// Alle eigenen Chats löschen
chat.post('/clear', wrap(async (req, res) => {
  await purgeChats(req.user.id);
  res.json({ ok: true });
}));

// Gespeicherten Chat für die Anzeige zusammenbauen (eigene Chats und geteilte Links)
async function loadChatData(row, { forShare = false } = {}) {
  const msgs = await all('SELECT turn, side, content, status, error, meta, feedback, attachments FROM messages WHERE chat_id = ? ORDER BY turn, side', row.id);
  const sides = row.mode === 'direct' || row.mode === 'agent' ? 1 : 2;
  const turns = [];
  for (const m of msgs) {
    turns[m.turn] ??= { user: '', answers: Array.from({ length: sides }, () => ({ text: '', status: 'stopped', error: null })) };
    if (m.side < 0) {
      turns[m.turn].user = m.content;
      let att = [];
      try { att = JSON.parse(m.attachments || '[]'); } catch { /* egal */ }
      // Beim Teilen keine Dateiinhalte mitschicken, nur Namen (Bilder bleiben sichtbar)
      turns[m.turn].attachments = forShare ? att.map((a) => (a.kind === 'file' ? { kind: 'file', name: a.name } : a)) : att;
    } else if (m.side < sides) {
      let meta = {};
      try { meta = JSON.parse(m.meta || '{}'); } catch { /* egal */ }
      turns[m.turn].answers[m.side] = {
        text: m.content, status: m.status, error: m.error,
        steps: meta.steps ?? [], thinking: forShare ? '' : meta.thinking ?? '', thinkMs: meta.thinkMs ?? 0,
        feedback: forShare ? 0 : m.feedback ?? 0, sources: meta.sources ?? [], images: meta.images ?? [],
        reaction: meta.reaction ?? null, fallback: meta.fallback ?? null,
      };
    }
  }
  const ids = [row.model_a, row.model_b].filter(Boolean);
  const names = await Promise.all(ids.map(displayName));
  const reveal = row.mode !== 'battle' || row.winner;
  return {
    id: forShare ? undefined : row.id,
    mode: row.mode,
    modality: row.modality || 'auto',
    title: row.title || t('Chat', 'Chat'),
    winner: row.winner,
    models: forShare || row.mode === 'battle' || row.mode === 'agent' ? null : ids,
    labels: reveal ? names : null,
    shared: forShare ? undefined : Boolean(row.share_id),
    turns: turns.filter((x) => x && (x.user || x.attachments?.length)),
  };
}

// Einen gespeicherten Chat laden (Battle-Modelle bleiben geheim, bis abgestimmt wurde)
chat.get('/:id', wrap(async (req, res) => {
  const row = await get('SELECT * FROM chats WHERE id = ? AND user_id = ?', req.params.id, req.user.id);
  if (!row) throw new HttpError(404, t('Chat nicht gefunden.', 'Chat not found.'));
  res.json(await loadChatData(row));
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

// ── Öffentlich: geteilte Chats (ohne Anmeldung lesbar) ────────────
export const share = Router();
share.get('/:id', wrap(async (req, res) => {
  const row = await get('SELECT * FROM chats WHERE share_id = ?', String(req.params.id));
  if (!row || !row.user_id) throw new HttpError(404, t('Dieser Link ist nicht (mehr) gültig.', 'This link is not valid (anymore).'));
  res.set('Cache-Control', 'no-store');
  res.json(await loadChatData(row, { forShare: true }));
}));
share.use(errorHandler);

// Telegram-Bot „X Agent“ – nutzt die bestehende Agent-X-Logik (runAgent, DeepSearch, Heavy) ohne Kopie.
//   TELEGRAM_BOT_TOKEN       Bot-Token (fehlt er, ist der Bot einfach aus)
//   TELEGRAM_WEBHOOK_SECRET  optional – sonst aus einem Hash des Tokens abgeleitet
//   TELEGRAM_DAILY_LIMIT     Nachrichten pro Nutzer und Tag (Standard 50)
//   TELEGRAM_ALLOWED_IDS     optional: nur diese Telegram-Nutzer-IDs (Komma-getrennt)
// Webhook: POST /api/telegram/<secret> + Header X-Telegram-Bot-Api-Secret-Token. Antwort sofort 200,
// die Arbeit läuft danach im Hintergrund. Der Token wird nie geloggt.
import { createHash, timingSafeEqual } from 'node:crypto';
import express, { Router } from 'express';
import { get, run, logEvent } from './db.js';
import { t, withLang } from './i18n.js';
import { runAgent, sourceCleaner } from './agent.js';
import { deepResearch, heavyAnswer } from './deep.js';
import { completeBest, generateImage, listModels, rankModels } from './models.js';
import { searchWeb } from './search.js';
import { basePrompt } from './prompt.js';
import { checkText } from './safety.js';

await run(`CREATE TABLE IF NOT EXISTS telegram_users (
  tg_id INTEGER PRIMARY KEY,
  chat_id INTEGER NOT NULL,
  name TEXT,
  lang TEXT,
  mode TEXT NOT NULL DEFAULT 'agent',
  history TEXT,
  day TEXT,
  used INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
)`);

await run(`CREATE TABLE IF NOT EXISTS telegram_groups (
  chat_id INTEGER PRIMARY KEY,
  title TEXT,
  ai_on INTEGER NOT NULL DEFAULT 1,
  welcome_on INTEGER NOT NULL DEFAULT 1,
  rules TEXT,
  history TEXT,
  stats TEXT,
  mission TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
)`);

export const BOT_NAME = 'X Agent';
export const DEFAULT_USERNAME = 'XAI_Vertexbot';
const GROUP_HISTORY = 50;
const HISTORY_MAX = 20;
const TG_LIMIT = 4096;
const CHUNK = 3500; // Platz für HTML-Tags
const MODES = { fast: () => t('Schnell', 'Fast'), expert: () => t('Experte', 'Expert'), agent: () => 'Agent X' };
const DAY = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit' });
const dayKey = () => DAY.format(new Date());

// ── Einstellungen ───────────────────────────────────────────────
export function telegramConfig(env = process.env) {
  // Token säubern: Leerzeichen, Anführungszeichen oder ein vorangestelltes „bot“ beim Einfügen
  const token = String(env.TELEGRAM_BOT_TOKEN ?? '').trim().replace(/^["'`]+|["'`]+$/g, '').trim().replace(/^bot(?=\d+:)/i, '');
  if (!token) return { on: false };
  const own = String(env.TELEGRAM_WEBHOOK_SECRET ?? '').trim().replace(/[^A-Za-z0-9_-]/g, '').slice(0, 128);
  const secret = own || createHash('sha256').update(`vais-telegram:${token}`).digest('hex').slice(0, 48);
  const allowed = String(env.TELEGRAM_ALLOWED_IDS ?? '').split(/[\s,;]+/).map((x) => x.trim()).filter((x) => /^\d+$/.test(x));
  const limit = Number.parseInt(env.TELEGRAM_DAILY_LIMIT, 10);
  return {
    on: true,
    token,
    secret,
    limit: Number.isFinite(limit) && limit >= 0 ? limit : 50,
    allowed: allowed.length ? new Set(allowed) : null,
    publicUrl: String(env.RENDER_EXTERNAL_URL || env.APP_URL || '').replace(/\/$/, ''),
  };
}

// ── Telegram-Schnittstelle (der Token steckt nur in der Adresse, nie in Fehlern oder Logs) ──
export function makeApi(token, fetchImpl = fetch) {
  const base = `https://api.telegram.org/bot${token}`;
  async function call(method, body = {}) {
    let res;
    try {
      res = await fetchImpl(`${base}/${method}`, {
        method: 'POST',
        headers: body instanceof FormData ? {} : { 'Content-Type': 'application/json' },
        body: body instanceof FormData ? body : JSON.stringify(body),
        signal: AbortSignal.timeout(method === 'sendPhoto' ? 60_000 : 20_000),
      });
    } catch (err) {
      throw Object.assign(new Error(`Telegram ${method}: ${err.name === 'TimeoutError' ? 'Zeitüberschreitung' : 'Netzwerkfehler'}`), { method });
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.ok === false) throw Object.assign(new Error(`Telegram ${method}: ${String(data.description ?? res.status).replaceAll(token, '***')}`), { status: res.status, method });
    return data.result;
  }
  return { call };
}

// ── Markdown → Telegram-HTML (sicher; Tabellen bleiben unverändert) ──────────
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const escAttr = (s) => esc(s).replace(/"/g, '&quot;');
function inline(text) {
  const keep = [];
  const hold = (html) => `\u0000${keep.push(html) - 1}\u0000`;
  let s = String(text)
    .replace(/`([^`\n]+)`/g, (_, c) => hold(`<code>${esc(c)}</code>`))
    .replace(/\[([^\]\n]{1,300})\]\((https?:\/\/[^\s)]+)\)/g, (_, label, url) => hold(`<a href="${escAttr(url)}">${esc(label)}</a>`));
  s = esc(s)
    .replace(/\*\*(?=\S)([^*\n]+?)(?<=\S)\*\*/g, '<b>$1</b>')
    .replace(/__(?=\S)([^_\n]+?)(?<=\S)__/g, '<b>$1</b>')
    .replace(/~~(?=\S)([^~\n]+?)(?<=\S)~~/g, '<s>$1</s>')
    .replace(/(^|[^*\w])\*(?=\S)([^*\n]+?)(?<=\S)\*(?!\*)/g, '$1<i>$2</i>')
    .replace(/(^|[\s(])_(?=\S)([^_\n]+?)(?<=\S)_(?=$|[\s).,!?:;])/g, '$1<i>$2</i>');
  return s.replace(/\u0000(\d+)\u0000/g, (_, i) => keep[Number(i)]);
}
const isTableLine = (l) => /^\s*\|.*\|\s*$/.test(l);
export function toTelegramHtml(md) {
  const out = [];
  const lines = String(md ?? '').replace(/\r\n?/g, '\n').split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const fence = line.match(/^\s*```\s*([\w+-]*)/);
    if (fence) {
      const code = [];
      i++;
      while (i < lines.length && !/^\s*```\s*$/.test(lines[i])) code.push(lines[i++]);
      out.push(`<pre><code${fence[1] ? ` class="language-${escAttr(fence[1])}"` : ''}>${esc(code.join('\n'))}</code></pre>`);
      continue;
    }
    if (isTableLine(line)) {
      // Tabellen genau so lassen, wie sie sind (Festbreiten-Schrift hält die Spalten gerade)
      const rows = [];
      while (i < lines.length && isTableLine(lines[i])) rows.push(lines[i++]);
      i--;
      out.push(`<pre>${esc(rows.join('\n'))}</pre>`);
      continue;
    }
    const h = line.match(/^\s{0,3}#{1,6}\s+(.*)$/);
    if (h) { out.push(`<b>${inline(h[1].replace(/\s*#+\s*$/, ''))}</b>`); continue; }
    if (/^\s*([-*_])\s*\1\s*\1[\s\1]*$/.test(line)) { out.push('──────────'); continue; }
    const bullet = line.match(/^(\s*)[-*+]\s+(.*)$/);
    if (bullet) { out.push(`${bullet[1]}• ${inline(bullet[2])}`); continue; }
    const quote = line.match(/^\s*>\s?(.*)$/);
    if (quote) { out.push(`<blockquote>${inline(quote[1])}</blockquote>`); continue; }
    out.push(inline(line));
  }
  return out.join('\n').replace(/<\/blockquote>\n<blockquote>/g, '\n');
}

// Lange Antworten sauber aufteilen: an Absätzen/Zeilen, Code-Blöcke werden geschlossen und neu geöffnet
export function splitMessage(md, max = CHUNK) {
  const parts = [];
  let cur = '';
  let fence = null; // offene ```-Zeile
  const push = () => {
    if (!cur.trim()) { cur = ''; return; }
    parts.push(fence ? `${cur.replace(/\n$/, '')}\n\`\`\`` : cur.replace(/\n$/, ''));
    cur = fence ? `${fence}\n` : '';
  };
  for (const raw of String(md ?? '').split('\n')) {
    let line = raw;
    while (line.length > max - 10) { // eine einzelne riesige Zeile hart teilen
      if (cur.length) push();
      cur += `${line.slice(0, max - 10)}\n`;
      line = line.slice(max - 10);
      push();
    }
    if (cur.length + line.length + 5 > max) push();
    cur += `${line}\n`;
    if (/^\s*```/.test(line)) fence = fence ? null : line.trim();
  }
  if (cur.trim()) parts.push(cur.replace(/\n$/, ''));
  return parts;
}

// ── Bot ─────────────────────────────────────────────────────────
function helpText(limit) {
  return t(
    `<b>${BOT_NAME}</b> – Agent X von VAIs in Telegram.\n\n<b>Befehle</b>\n/neu – Verlauf löschen\n/modus – Schnell, Experte oder Agent X wählen\n/recherche &lt;Frage&gt; – gründliche Recherche mit Quellen\n/heavy &lt;Frage&gt; – mehrere starke Modelle, die beste Antwort\n/bild &lt;Beschreibung&gt; – Bild erstellen\n/quiz [Thema] – Quizfrage (Weltraum, Tech, KI)\n/news – aktuelle KI- und Tech-News\n/witz – ein Witz\n/fakt – ein Weltraum-Fakt\n/umfrage Frage | A | B – Umfrage\n/hilfe – diese Hilfe\n\nSchreib einfach eine Nachricht – Standard ist Agent X (sucht, liest, rechnet selbstständig). Bis zu ${limit} Nachrichten pro Tag.\n\nIn Gruppen: Füg mich hinzu und erwähne mich mit @-Namen – /hilfe zeigt dort die Gruppen-Befehle.`,
    `<b>${BOT_NAME}</b> – VAIs Agent X on Telegram.\n\n<b>Commands</b>\n/neu – clear history\n/modus – choose Fast, Expert or Agent X\n/recherche &lt;question&gt; – thorough research with sources\n/heavy &lt;question&gt; – several strong models, the best answer\n/bild &lt;description&gt; – create an image\n/quiz [topic] – quiz question (space, tech, AI)\n/news – current AI and tech news\n/witz – a joke\n/fakt – a space fact\n/umfrage Question | A | B – poll\n/hilfe – this help\n\nJust send a message – the default is Agent X (searches, reads and calculates on its own). Up to ${limit} messages per day.\n\nIn groups: add me and mention me by @name – /hilfe shows the group commands there.`,
  );
}
function groupHelpText(username) {
  return t(
    `<b>${BOT_NAME}</b> in eurer Gruppe 👋\n\nIch antworte, wenn ihr mich erwähnt (@${esc(username)}), auf meine Nachricht antwortet oder einen Befehl nutzt.\n\n<b>Für alle</b>\n/quiz [Thema] – Quiz-Umfrage (Weltraum, Tech, KI)\n/news – aktuelle KI- und Tech-News mit Quellen\n/zusammenfassung – fasst die letzten ~50 Nachrichten zusammen\n/umfrage Frage | A | B – Umfrage erstellen\n/bild &lt;Beschreibung&gt; – Bild erstellen\n/witz – ein Witz\n/fakt – ein Weltraum-Fakt\n/mission – die Tages-Challenge\n/regeln – Gruppenregeln\n/stats – wer war heute am aktivsten\n/recherche, /heavy – gründliche Antworten\n\n<b>Für Admins</b>\n/ai an · /ai aus – mich an- oder ausschalten\n/willkommen an · aus – Begrüßung neuer Mitglieder\n/regeln setzen &lt;Text&gt; – Regeln festlegen`,
    `<b>${BOT_NAME}</b> in your group 👋\n\nI answer when you mention me (@${esc(username)}), reply to my message or use a command.\n\n<b>For everyone</b>\n/quiz [topic] – quiz poll (space, tech, AI)\n/news – current AI and tech news with sources\n/zusammenfassung – summarizes the last ~50 messages\n/umfrage Question | A | B – create a poll\n/bild &lt;description&gt; – create an image\n/witz – a joke\n/fakt – a space fact\n/mission – today's challenge\n/regeln – group rules\n/stats – who was most active today\n/recherche, /heavy – thorough answers\n\n<b>For admins</b>\n/ai an · /ai aus – turn me on or off\n/willkommen an · aus – greet new members\n/regeln setzen &lt;text&gt; – set the rules`,
  );
}
const startText = (name) => t(
  `Hallo${name ? ` ${esc(name)}` : ''}! 👋 Ich bin <b>${BOT_NAME}</b> – Agent X von VAIs.\n\nFrag mich einfach etwas, zum Beispiel:\n• <i>Was ist heute in der Raumfahrt passiert?</i>\n• <i>Erklär mir schwarze Löcher, als wäre ich 12</i>\n• /recherche Vor- und Nachteile von E-Autos 2026\n• /heavy Beweise, dass √2 irrational ist\n\n/hilfe zeigt alle Befehle.`,
  `Hi${name ? ` ${esc(name)}` : ''}! 👋 I'm <b>${BOT_NAME}</b> – VAIs Agent X.\n\nJust ask me something, for example:\n• <i>What happened in space news today?</i>\n• <i>Explain black holes like I'm 12</i>\n• /recherche pros and cons of electric cars 2026\n• /heavy Prove that √2 is irrational\n\n/hilfe shows all commands.`,
);
const CMD = {
  start: () => t('Begrüßung und Beispiele', 'Welcome and examples'),
  neu: () => t('Verlauf löschen, neu anfangen', 'Clear history, start over'),
  modus: () => t('Schnell, Experte oder Agent X wählen', 'Choose Fast, Expert or Agent X'),
  recherche: () => t('Gründliche Recherche mit Quellen', 'Thorough research with sources'),
  heavy: () => t('Mehrere Modelle, die beste Antwort', 'Several models, the best answer'),
  bild: () => t('Bild erstellen', 'Create an image'),
  quiz: () => t('Quizfrage (Weltraum, Tech, KI)', 'Quiz question (space, tech, AI)'),
  news: () => t('Aktuelle KI- und Tech-News', 'Current AI and tech news'),
  witz: () => t('Ein Witz', 'A joke'),
  fakt: () => t('Ein Weltraum-Fakt', 'A space fact'),
  umfrage: () => t('Umfrage: Frage | A | B', 'Poll: question | A | B'),
  zusammenfassung: () => t('Die letzten Nachrichten zusammenfassen', 'Summarize the recent messages'),
  mission: () => t('Tages-Challenge für die Gruppe', 'Daily challenge for the group'),
  regeln: () => t('Gruppenregeln (Admins: /regeln setzen …)', 'Group rules (admins: /regeln setzen …)'),
  stats: () => t('Wer war heute am aktivsten', 'Who was most active today'),
  ai: () => t('Admins: /ai an oder /ai aus', 'Admins: /ai an or /ai aus'),
  willkommen: () => t('Admins: Begrüßung an/aus', 'Admins: welcome on/off'),
  hilfe: () => t('Alle Befehle', 'All commands'),
};
const PRIVATE_CMDS = ['start', 'neu', 'modus', 'recherche', 'heavy', 'bild', 'quiz', 'news', 'witz', 'fakt', 'umfrage', 'hilfe'];
const GROUP_CMDS = ['hilfe', 'quiz', 'news', 'zusammenfassung', 'umfrage', 'bild', 'witz', 'fakt', 'mission', 'regeln', 'stats', 'recherche', 'heavy', 'ai', 'willkommen'];
export const COMMANDS = (kind = 'private') => (kind === 'group' ? GROUP_CMDS : PRIVATE_CMDS).map((command) => ({ command, description: CMD[command]() }));
const modeKeyboard = (current) => ({
  inline_keyboard: [Object.keys(MODES).map((m) => ({ text: `${m === current ? '✓ ' : ''}${MODES[m]()}`, callback_data: `mode:${m}` }))],
});

export function createBot({ config = telegramConfig(), api = null, answer = null, llm = null, search = null, image = null } = {}) {
  const state = { on: !!config.on, webhook: false, error: null };
  if (!config.on) {
    const router = Router();
    router.use((req, res) => res.status(404).end());
    return { state, router, handleUpdate: async () => {}, start: async () => state, idle: async () => {} };
  }
  const tg = api ?? makeApi(config.token);
  const say = (s) => String(s ?? '').replaceAll(config.token, '***');
  const log = (msg, err) => console.error(`Telegram: ${msg}`, err ? say(err.message ?? err) : '');

  // ── Speicher pro Nutzer ──
  async function userOf(from, chatId) {
    let u = await get('SELECT * FROM telegram_users WHERE tg_id = ?', from.id);
    if (!u) {
      const now = Date.now();
      await run('INSERT INTO telegram_users (tg_id, chat_id, name, lang, mode, history, day, used, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?)',
        from.id, chatId, String(from.first_name ?? '').slice(0, 60), String(from.language_code ?? '').slice(0, 5), 'agent', '[]', dayKey(), now, now);
      u = await get('SELECT * FROM telegram_users WHERE tg_id = ?', from.id);
    }
    let history = [];
    try { history = JSON.parse(u.history || '[]'); } catch { history = []; }
    return { ...u, tg_id: Number(u.tg_id), used: Number(u.used ?? 0), history };
  }
  const saveHistory = (id, history) => run('UPDATE telegram_users SET history = ?, updated_at = ? WHERE tg_id = ?', JSON.stringify(history.slice(-HISTORY_MAX)), Date.now(), id);
  // Tageslimit: zählt vorab (gegen Doppelklicks), bei Fehlern wieder zurück
  async function charge(u) {
    const today = dayKey();
    const used = u.day === today ? u.used : 0;
    if (config.limit === 0 || used >= config.limit) return false;
    await run('UPDATE telegram_users SET day = ?, used = ? WHERE tg_id = ?', today, used + 1, u.tg_id);
    return true;
  }
  const refund = (u) => run('UPDATE telegram_users SET used = MAX(0, used - 1) WHERE tg_id = ? AND day = ?', u.tg_id, dayKey()).catch(() => {});

  // ── Senden ──
  async function sendText(chatId, md, extra = {}) {
    for (const part of splitMessage(md)) {
      const html = toTelegramHtml(part);
      try {
        if (html.length > TG_LIMIT) throw new Error('zu lang');
        await tg.call('sendMessage', { chat_id: chatId, text: html, parse_mode: 'HTML', link_preview_options: { is_disabled: true }, ...extra });
      } catch (err) {
        if (err.status && err.status !== 400) throw err;
        // HTML hat nicht geklappt → als normaler Text
        await tg.call('sendMessage', { chat_id: chatId, text: part.slice(0, TG_LIMIT), link_preview_options: { is_disabled: true }, ...extra });
      }
    }
  }
  const sendHtml = (chatId, html, extra = {}) => tg.call('sendMessage', { chat_id: chatId, text: html, parse_mode: 'HTML', link_preview_options: { is_disabled: true }, ...extra });
  async function sendImage(chatId, dataUrl, extra = {}) {
    const m = String(dataUrl).match(/^data:(image\/(?:png|jpeg|webp));base64,(.+)$/);
    if (!m) return false; // z. B. SVG im Demo-Modus
    const form = new FormData();
    form.append('chat_id', String(chatId));
    if (extra.reply_parameters) form.append('reply_parameters', JSON.stringify(extra.reply_parameters));
    if (extra.caption) form.append('caption', String(extra.caption).slice(0, 1000));
    form.append('photo', new Blob([Buffer.from(m[2], 'base64')], { type: m[1] }), `bild.${m[1].split('/')[1]}`);
    return tg.call('sendPhoto', form).then(() => true).catch((err) => { log('Bild senden fehlgeschlagen', err); return false; });
  }
  // „schreibt …“ sofort und alle 4,5 Sekunden wieder, bis die Antwort da ist
  function typing(chatId) {
    const ping = () => tg.call('sendChatAction', { chat_id: chatId, action: 'typing' }).catch(() => {});
    ping();
    const timer = setInterval(ping, 4500);
    timer.unref?.();
    return () => clearInterval(timer);
  }

  // ── Antworten mit der bestehenden Logik ──
  const personal = () => ({ memoryOn: false, memories: [], instructions: '', planFirst: false });
  async function defaultAnswer({ mode, question, history, signal }) {
    const messages = [...history, { role: 'user', content: question }];
    const sources = [];
    const images = [];
    let text = '';
    let reaction = null;
    const addSources = sourceCleaner((list) => sources.push(...list));
    const write = async (s) => { text += s; };
    if (mode === 'research' || mode === 'heavy') {
      const fn = mode === 'research' ? deepResearch : heavyAnswer;
      const done = await fn({ question, history: messages, personal: personal(), signal, addSources, write }).catch((err) => { if (signal?.aborted) throw err; log(`${mode} fehlgeschlagen, nehme Agent X`, err); return false; });
      if (done) return { text, sources, images };
      mode = 'agent';
    }
    if (mode === 'agent') {
      await runAgent({
        messages, signal, personal: personal(),
        onStep: () => {}, onReasoning: () => {},
        onText: (s) => { text += s; },
        onSources: (list) => sources.push(...list),
        onReact: (e) => { reaction = e || null; },
        onImage: (img) => images.push(img),
      });
      if (!text.trim() && reaction) text = reaction;
      return { text, sources, images };
    }
    const msg = await completeBest(mode === 'expert' ? 'smart' : 'quick', {
      maxTokens: mode === 'expert' ? 4000 : 2000,
      reasoningEffort: mode === 'expert' ? 'high' : 'low',
      timeoutMs: 120_000,
      messages: [{ role: 'system', content: `${basePrompt({ model: null })}\nYou are chatting on Telegram as "${BOT_NAME}" (VAIs).` }, ...messages],
    }, { signal });
    return { text: String(msg.content ?? ''), sources, images };
  }
  const answerFn = answer ?? defaultAnswer;

  // Quellen als nummerierte Links unten anhängen (wie in der App: [n] passt zur Nummer)
  function withSources(text, sources) {
    if (!sources.length) return text;
    const used = new Set([...text.matchAll(/\[(\d{1,2})\]/g)].map((m) => Number(m[1])));
    const list = sources.map((s, i) => ({ ...s, n: i + 1 })).filter((s) => !used.size || used.has(s.n));
    if (!list.length) return text;
    return `${text.trim()}\n\n**${t('Quellen', 'Sources')}**\n${list.map((s) => `[${s.n}] [${String(s.title || s.url).replace(/[[\]]/g, '').slice(0, 120)}](${s.url})`).join('\n')}`;
  }

  const limitText = () => t(`Du hast heute alle ${config.limit} Nachrichten genutzt 🌙 Morgen geht es weiter – bis dann!`, `You've used all ${config.limit} messages for today 🌙 See you tomorrow!`);
  // opts.group: Antwort in einer Gruppe (Verlauf der Gruppe als Kontext, Antwort als Reply)
  async function reply(u, chatId, question, mode, opts = {}) {
    const extra = opts.replyTo ? { reply_parameters: { message_id: opts.replyTo, allow_sending_without_reply: true } } : {};
    if (!(await charge(u))) return sendHtml(chatId, limitText(), extra);
    const blocked = await checkText(question, 'prompt').catch(() => null);
    if (blocked) { await refund(u); return sendText(chatId, blocked.message, extra); }
    const stop = typing(chatId);
    const signal = AbortSignal.timeout(5 * 60 * 1000);
    try {
      const out = await answerFn({ mode, question, history: opts.history ?? u.history, signal, user: u, group: !!opts.group });
      stop();
      const text = String(out.text ?? '').trim();
      if (!text && !out.images?.length) throw new Error('leere Antwort');
      for (const img of out.images ?? []) await sendImage(chatId, img, extra);
      if (text) await sendText(chatId, withSources(text, out.sources ?? []), extra);
      if (opts.group) await remember(opts.group, { id: 0, name: BOT_NAME, text: text.slice(0, 600), bot: true });
      else await saveHistory(u.tg_id, [...u.history, { role: 'user', content: question.slice(0, 4000) }, { role: 'assistant', content: text.slice(0, 4000) }]);
    } catch (err) {
      stop();
      await refund(u);
      log('Antwort fehlgeschlagen', err);
      logEvent('error', 'telegram', say(err.message).slice(0, 200)).catch(() => {});
      await sendHtml(chatId, signal.aborted
        ? t('Das hat zu lange gedauert ⏳ Versuch es bitte nochmal, gern etwas kürzer.', 'That took too long ⏳ Please try again, maybe a bit shorter.')
        : t('Da ist leider etwas schiefgegangen 😕 Versuch es gleich nochmal.', 'Sorry, something went wrong 😕 Please try again in a moment.'), extra).catch(() => {});
    }
  }

  async function onMessage(msg) {
    const chatId = msg.chat?.id;
    const from = msg.from;
    if (!chatId) return;
    if ((!from || from.is_bot) && !msg.new_chat_members) return;
    if (['group', 'supergroup'].includes(msg.chat.type)) return onGroupMessage(msg);
    if (msg.chat.type !== 'private') return; // Kanäle nicht
    if (config.allowed && !config.allowed.has(String(from.id))) {
      return sendHtml(chatId, t('Dieser Bot ist privat 🔒', 'This bot is private 🔒'));
    }
    const u = await userOf(from, chatId);
    const text = String(msg.text ?? msg.caption ?? '').trim();
    if (!text) return sendHtml(chatId, t('Ich verstehe gerade nur Text-Nachrichten ✍️', 'I can only understand text messages for now ✍️'));
    const cmd = text.match(/^\/([a-zA-Z_]+)(?:@\w+)?(?:\s+([\s\S]*))?$/);
    if (cmd) {
      const name = cmd[1].toLowerCase();
      const arg = String(cmd[2] ?? '').trim();
      if (name === 'start') return sendHtml(chatId, startText(from.first_name));
      if (['hilfe', 'help'].includes(name)) return sendHtml(chatId, helpText(config.limit));
      if (['neu', 'new', 'reset'].includes(name)) {
        await saveHistory(u.tg_id, []);
        return sendHtml(chatId, t('Verlauf gelöscht ✨ Wir fangen neu an.', 'History cleared ✨ Fresh start.'));
      }
      if (['modus', 'mode'].includes(name)) {
        return sendHtml(chatId, t(`Wähle den Modus (gerade: <b>${MODES[u.mode]?.() ?? 'Agent X'}</b>):`, `Choose the mode (now: <b>${MODES[u.mode]?.() ?? 'Agent X'}</b>):`), { reply_markup: modeKeyboard(u.mode) });
      }
      if (['recherche', 'research', 'heavy'].includes(name)) {
        if (!arg) return sendHtml(chatId, name === 'heavy' ? t('Schreib deine Frage dahinter, z. B. <code>/heavy Beweise, dass √2 irrational ist</code>', 'Add your question, e.g. <code>/heavy Prove that √2 is irrational</code>') : t('Schreib deine Frage dahinter, z. B. <code>/recherche Vor- und Nachteile von E-Autos</code>', 'Add your question, e.g. <code>/recherche pros and cons of electric cars</code>'));
        return reply(u, chatId, arg, name === 'heavy' ? 'heavy' : 'research');
      }
      if (['zusammenfassung', 'summary', 'mission', 'regeln', 'rules', 'stats', 'ai', 'willkommen', 'welcome'].includes(name)) {
        return sendHtml(chatId, t('Das geht nur in Gruppen 👥 Füg mich zu einer Gruppe hinzu und probier es dort.', 'That only works in groups 👥 Add me to a group and try it there.'));
      }
      if (await sharedCommand(name, arg, { u, chatId, extra: {}, group: false }) !== false) return;
      return sendHtml(chatId, t('Den Befehl kenne ich nicht. /hilfe zeigt alle Befehle.', 'I don’t know that command. /hilfe shows all commands.'));
    }
    return reply(u, chatId, text.slice(0, 6000), MODES[u.mode] ? u.mode : 'agent');
  }

  async function onCallback(cb) {
    const m = String(cb.data ?? '').match(/^mode:(fast|expert|agent)$/);
    if (!m || !cb.from) return tg.call('answerCallbackQuery', { callback_query_id: cb.id }).catch(() => {});
    if (config.allowed && !config.allowed.has(String(cb.from.id))) return tg.call('answerCallbackQuery', { callback_query_id: cb.id, text: t('Privat 🔒', 'Private 🔒') }).catch(() => {});
    const chatId = cb.message?.chat?.id ?? cb.from.id;
    await userOf(cb.from, chatId);
    await run('UPDATE telegram_users SET mode = ?, updated_at = ? WHERE tg_id = ?', m[1], Date.now(), cb.from.id);
    await tg.call('answerCallbackQuery', { callback_query_id: cb.id, text: `✓ ${MODES[m[1]]()}` }).catch(() => {});
    if (cb.message?.message_id) {
      await tg.call('editMessageText', { chat_id: chatId, message_id: cb.message.message_id, text: t(`Modus: <b>${MODES[m[1]]()}</b> ✓`, `Mode: <b>${MODES[m[1]]()}</b> ✓`), parse_mode: 'HTML', reply_markup: modeKeyboard(m[1]) }).catch(() => {});
    }
  }

  // ── Bausteine für die Spaß-Befehle (für Tests austauschbar) ──
  const llmText = llm ?? (async (task, messages, { maxTokens = 600, signal } = {}) => {
    const msg = await completeBest(task, { maxTokens, reasoningEffort: 'low', timeoutMs: 60_000, messages }, { signal });
    return String(msg.content ?? '').trim();
  });
  const searchFn = search ?? ((q, opts) => searchWeb(q, opts));
  const imageFn = image ?? (async (prompt, signal) => {
    const all = (await listModels()).filter((m) => m.caps.includes('image') && !m.busy && !m.paid);
    let lastErr = null;
    for (const m of rankModels('image', all, { cap: 'image' }).slice(0, 3)) {
      try { const img = await generateImage({ model: m.id, prompt, signal }); if (img) return img; } catch (err) { if (signal?.aborted) throw err; lastErr = err; }
    }
    throw lastErr ?? new Error('kein Bildmodell frei');
  });
  const sys = (extra) => ({ role: 'system', content: `${basePrompt({ model: null })}\nYou are "${BOT_NAME}" (VAIs) in a Telegram chat. ${extra}` });
  const jsonOf = (text) => JSON.parse(String(text).replace(/^[\s\S]*?(\{[\s\S]*\})[\s\S]*$/, '$1'));
  const shuffle = (arr) => { const a = [...arr]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

  // Quiz als echte Telegram-Quiz-Umfrage (richtige Antwort wird gemischt, damit sie nicht immer A ist)
  async function makeQuiz(topic, signal) {
    const theme = topic || ['Weltraum', 'Technik', 'Künstliche Intelligenz'][Math.floor(Math.random() * 3)];
    const raw = await llmText('smart', [sys('You create fun, correct quiz questions.'), { role: 'user', content: `Create ONE multiple-choice quiz question about "${theme}" for a curious group chat, in ${t('German', 'English')}. Use only facts you are sure about. Answer ONLY with JSON: {"question": "max 250 chars", "options": ["4 options, each max 90 chars"], "correct": 0, "explanation": "max 180 chars"}` }], { maxTokens: 700, signal });
    const q = jsonOf(raw);
    const options = (q.options ?? []).map((o) => String(o).trim().slice(0, 100)).filter(Boolean).slice(0, 4);
    const correct = Number(q.correct);
    if (!q.question || options.length < 2 || !Number.isInteger(correct) || !options[correct]) throw new Error('Quiz unvollständig');
    const right = options[correct];
    const mixed = shuffle(options);
    return { question: String(q.question).slice(0, 300), options: mixed, correct: mixed.indexOf(right), explanation: String(q.explanation ?? '').slice(0, 200), theme };
  }
  async function makeNews(signal) {
    const month = new Date().toLocaleDateString('de-DE', { month: 'long', year: 'numeric', timeZone: 'Europe/Berlin' });
    const found = await Promise.allSettled([searchFn(`KI News ${month}`, { signal, max: 5 }), searchFn(`Tech News heute ${month}`, { signal, max: 5 })]);
    const seenUrl = new Set();
    const sources = found.flatMap((r) => (r.status === 'fulfilled' ? r.value.results ?? [] : [])).filter((r) => r.url && !seenUrl.has(r.url) && seenUrl.add(r.url)).slice(0, 8);
    if (!sources.length) throw new Error('keine News gefunden');
    const text = await llmText('smart', [sys('You write short, accurate news digests.'), { role: 'user', content: `Fasse die wichtigsten aktuellen KI- und Tech-News in 4–6 kurzen Stichpunkten zusammen (je 1 Satz, mit passendem Emoji am Anfang). Belege jeden Punkt mit der Nummer der Quelle, z. B. [2]. Nur was in den Quellen steht.\n\n${sources.map((r, i) => `[${i + 1}] ${r.title}${r.date ? ` (${r.date})` : ''}\n${r.url}\n${String(r.snippet ?? '').slice(0, 400)}`).join('\n\n')}` }], { maxTokens: 900, signal });
    return { text, sources: sources.map(({ url, title }) => ({ url, title })) };
  }
  const shortAsk = (prompt, signal) => llmText('quick', [sys('Keep it short.'), { role: 'user', content: prompt }], { maxTokens: 300, signal });

  // ── Wer ist der Bot? (für Erwähnungen und Antworten auf seine Nachrichten) ──
  let me = config.username ? { id: config.botId ?? null, username: config.username } : null;
  async function botInfo() {
    if (me) return me;
    try { const r = await tg.call('getMe', {}); me = { id: r?.id ?? null, username: r?.username || DEFAULT_USERNAME }; } catch { me = { id: null, username: DEFAULT_USERNAME }; }
    return me;
  }

  // ── Gruppen-Admins (5 Minuten gemerkt) ──
  const adminCache = new Map();
  async function isAdmin(chatId, msg) {
    if (msg.sender_chat?.id === chatId || msg.from?.username === 'GroupAnonymousBot') return true; // anonymer Admin
    const key = `${chatId}:${msg.from.id}`;
    const hit = adminCache.get(key);
    if (hit && Date.now() - hit.at < 5 * 60 * 1000) return hit.ok;
    let ok = false;
    try { const m = await tg.call('getChatMember', { chat_id: chatId, user_id: msg.from.id }); ok = ['creator', 'administrator'].includes(m?.status); } catch { ok = false; }
    adminCache.set(key, { at: Date.now(), ok });
    return ok;
  }

  // ── Rate-Limit pro Gruppe: KI-Befehle und alle Befehle getrennt, Hinweis nur einmal pro Fenster ──
  const RATE = { ai: Number(config.groupAiPer10Min ?? 12), all: Number(config.groupAllPer10Min ?? 40) };
  const buckets = new Map();
  function allow(chatId, kind) {
    const now = Date.now();
    const b = buckets.get(chatId) ?? { ai: [], all: [], warned: 0 };
    buckets.set(chatId, b);
    for (const k of ['ai', 'all']) b[k] = b[k].filter((ts) => now - ts < 10 * 60 * 1000);
    if (b.all.length >= RATE.all || (kind === 'ai' && b.ai.length >= RATE.ai)) {
      const warn = now - b.warned > 10 * 60 * 1000;
      if (warn) b.warned = now;
      return { ok: false, warn };
    }
    b.all.push(now);
    if (kind === 'ai') b.ai.push(now);
    return { ok: true };
  }
  const bucketTimer = setInterval(() => { const now = Date.now(); for (const [k, b] of buckets) if (b.all.every((ts) => now - ts > 10 * 60 * 1000)) buckets.delete(k); }, 15 * 60 * 1000);
  bucketTimer.unref?.();

  // ── Gruppen-Speicher ──
  async function groupOf(chat) {
    let g = await get('SELECT * FROM telegram_groups WHERE chat_id = ?', chat.id);
    if (!g) {
      const now = Date.now();
      await run('INSERT INTO telegram_groups (chat_id, title, ai_on, welcome_on, history, stats, created_at, updated_at) VALUES (?, ?, 1, 1, ?, ?, ?, ?)', chat.id, String(chat.title ?? '').slice(0, 120), '[]', '{}', now, now);
      g = await get('SELECT * FROM telegram_groups WHERE chat_id = ?', chat.id);
    }
    const parse = (v, d) => { try { return JSON.parse(v || '') ?? d; } catch { return d; } };
    return { id: Number(g.chat_id), ai: !!Number(g.ai_on), welcome: !!Number(g.welcome_on), rules: g.rules || '', history: parse(g.history, []), stats: parse(g.stats, {}), mission: parse(g.mission, null) };
  }
  const setGroup = (id, field, value) => run(`UPDATE telegram_groups SET ${field} = ?, updated_at = ? WHERE chat_id = ?`, value, Date.now(), id);
  // Nachricht merken (Verlauf für /zusammenfassung, Zähler für /stats)
  async function remember(g, entry) {
    g.history = [...g.history, { ...entry, ts: Date.now() }].slice(-GROUP_HISTORY);
    await setGroup(g.id, 'history', JSON.stringify(g.history));
    if (entry.bot) return;
    const today = dayKey();
    if (g.stats.day !== today) g.stats = { day: today, users: {} };
    const k = String(entry.id);
    g.stats.users[k] = { name: entry.name, n: (g.stats.users[k]?.n ?? 0) + 1 };
    await setGroup(g.id, 'stats', JSON.stringify(g.stats));
  }
  const nameOf = (from) => String([from.first_name, from.last_name].filter(Boolean).join(' ') || from.username || 'Jemand').slice(0, 40);
  // Gruppen-Verlauf als Kontext für Agent X
  const groupContext = (g) => {
    const recent = g.history.slice(-12);
    if (!recent.length) return [];
    return [{ role: 'user', content: `(Recent messages in this Telegram group, for context:)\n${recent.map((m) => `${m.bot ? BOT_NAME : m.name}: ${m.text}`).join('\n').slice(0, 5000)}` }, { role: 'assistant', content: 'OK.' }];
  };

  // KI-Befehl ausführen: Tageslimit des Nutzers, „schreibt …“, freundliche Fehler
  async function aiTask(u, chatId, extra, fn, action = 'typing') {
    if (!(await charge(u))) return sendHtml(chatId, limitText(), extra);
    const stop = action === 'typing' ? typing(chatId) : (() => { tg.call('sendChatAction', { chat_id: chatId, action }).catch(() => {}); return () => {}; })();
    const signal = AbortSignal.timeout(3 * 60 * 1000);
    try {
      await fn(signal);
    } catch (err) {
      await refund(u);
      log('Befehl fehlgeschlagen', err);
      await sendHtml(chatId, signal.aborted ? t('Das hat zu lange gedauert ⏳ Versuch es nochmal.', 'That took too long ⏳ Please try again.') : t('Das hat gerade nicht geklappt 😕 Versuch es gleich nochmal.', 'That did not work right now 😕 Please try again.'), extra).catch(() => {});
    } finally { stop(); }
  }

  // Befehle, die im Einzel-Chat und in Gruppen gehen. Rückgabe true = erledigt
  async function sharedCommand(name, arg, { u, chatId, extra, group }) {
    if (name === 'umfrage' || name === 'poll') {
      const parts = arg.split('|').map((x) => x.trim()).filter(Boolean);
      if (parts.length < 3) return sendHtml(chatId, t('So geht’s: <code>/umfrage Pizza oder Pasta? | Pizza | Pasta</code> (2–10 Antworten)', 'Usage: <code>/umfrage Pizza or pasta? | Pizza | Pasta</code> (2–10 options)'), extra);
      const [question, ...opts] = parts;
      await tg.call('sendPoll', { chat_id: chatId, question: question.slice(0, 300), options: opts.slice(0, 10).map((o) => ({ text: o.slice(0, 100) })), is_anonymous: false, ...extra });
      return true;
    }
    if (name === 'quiz') {
      return aiTask(u, chatId, extra, async (signal) => {
        const q = await makeQuiz(arg.slice(0, 60), signal);
        await tg.call('sendPoll', { chat_id: chatId, question: `🧠 ${q.question}`.slice(0, 300), options: q.options.map((o) => ({ text: o })), type: 'quiz', correct_option_id: q.correct, is_anonymous: !group, ...(q.explanation ? { explanation: q.explanation } : {}), ...extra });
      });
    }
    if (name === 'news') {
      return aiTask(u, chatId, extra, async (signal) => {
        const n = await makeNews(signal);
        await sendText(chatId, withSources(`📰 **${t('KI- & Tech-News', 'AI & tech news')}**\n\n${n.text}`, n.sources), extra);
      });
    }
    if (name === 'witz' || name === 'joke') {
      return aiTask(u, chatId, extra, async (signal) => {
        await sendText(chatId, await shortAsk(t('Erzähl einen kurzen, wirklich lustigen, harmlosen Witz (familienfreundlich) über Weltraum, Technik, Schule oder Alltag. Nur der Witz, ohne Einleitung.', 'Tell a short, genuinely funny, harmless (family-friendly) joke about space, tech, school or everyday life. Only the joke.'), signal), extra);
      });
    }
    if (name === 'fakt' || name === 'fact') {
      return aiTask(u, chatId, extra, async (signal) => {
        await sendText(chatId, await shortAsk(t('Nenne einen erstaunlichen, wahren Weltraum-Fakt in 1–2 Sätzen, mit passendem Emoji am Anfang. Nur Fakten, die du sicher weißt.', 'Give one amazing, true space fact in 1–2 sentences, starting with a fitting emoji. Only facts you are sure about.'), signal), extra);
      });
    }
    if (name === 'bild' || name === 'image') {
      if (!arg) return sendHtml(chatId, t('Schreib dazu, was drauf sein soll, z. B. <code>/bild Astronaut auf dem Mond, Fotostil</code>', 'Describe what you want, e.g. <code>/bild astronaut on the moon, photo style</code>'), extra);
      const blocked = await checkText(arg, 'image').catch(() => null);
      if (blocked) return sendText(chatId, blocked.message, extra);
      return aiTask(u, chatId, extra, async (signal) => {
        const img = await imageFn(arg.slice(0, 1500), signal);
        if (!(await sendImage(chatId, img, { ...extra, caption: `🎨 ${arg.slice(0, 200)}` }))) throw new Error('Bild konnte nicht gesendet werden');
      }, 'upload_photo');
    }
    return false;
  }

  async function onGroupMessage(msg) {
    const chatId = msg.chat.id;
    const bot = await botInfo();
    const g = await groupOf(msg.chat);
    const extra = { reply_parameters: { message_id: msg.message_id, allow_sending_without_reply: true } };

    // Neue Mitglieder begrüßen (und sich selbst vorstellen, wenn der Bot hinzugefügt wurde)
    if (Array.isArray(msg.new_chat_members) && msg.new_chat_members.length) {
      const self = msg.new_chat_members.some((m) => m.is_bot && (m.id === bot.id || m.username === bot.username));
      if (self) return sendHtml(chatId, groupHelpText(bot.username));
      const people = msg.new_chat_members.filter((m) => !m.is_bot);
      if (!people.length || !g.ai || !g.welcome) return;
      if (!allow(chatId, 'all').ok) return;
      const names = people.map((m) => esc(nameOf(m))).join(', ');
      return sendHtml(chatId, t(`Willkommen in der Gruppe, <b>${names}</b>! 👋 Ich bin ${BOT_NAME} – erwähnt mich mit @${esc(bot.username)} oder schaut in /hilfe.${g.rules ? ' Bitte lest kurz die /regeln.' : ''}`, `Welcome to the group, <b>${names}</b>! 👋 I'm ${BOT_NAME} – mention me with @${esc(bot.username)} or check /hilfe.${g.rules ? ' Please read the /regeln.' : ''}`));
    }

    const from = msg.from;
    const text = String(msg.text ?? msg.caption ?? '').trim();
    if (!text || !from || from.is_bot) return;
    const cmd = text.match(/^\/([a-zA-Z_äöü]+)(?:@(\w+))?(?:\s+([\s\S]*))?$/);
    if (cmd?.[2] && cmd[2].toLowerCase() !== bot.username.toLowerCase()) return; // Befehl für einen anderen Bot
    const name = cmd ? cmd[1].toLowerCase() : null;
    const arg = cmd ? String(cmd[3] ?? '').trim() : '';
    if (!cmd) await remember(g, { id: from.id, name: nameOf(from), text: text.slice(0, 500) });

    // Aus: nur „/ai an“ (von Admins) hilft
    if (!g.ai && !(name === 'ai' && /^(an|on|ein)$/i.test(arg))) return;
    if (config.allowed && !config.allowed.has(String(from.id))) return;

    const mention = new RegExp(`@${bot.username.replace(/[^\w]/g, '')}\\b`, 'i');
    const repliedToBot = !!msg.reply_to_message?.from && (msg.reply_to_message.from.id === bot.id || msg.reply_to_message.from.username === bot.username);
    if (!cmd && !mention.test(text) && !repliedToBot) return; // nicht angesprochen → still mitlesen

    const AI_CMDS = new Set(['quiz', 'news', 'zusammenfassung', 'summary', 'bild', 'image', 'witz', 'joke', 'fakt', 'fact', 'mission', 'recherche', 'research', 'heavy']);
    const kind = !cmd || AI_CMDS.has(name) ? 'ai' : 'all';
    const rate = allow(chatId, kind);
    if (!rate.ok) {
      if (rate.warn) await sendHtml(chatId, t('Kurze Pause 🐢 In dieser Gruppe kamen gerade sehr viele Anfragen – in ein paar Minuten geht es weiter.', 'Short break 🐢 Lots of requests in this group right now – back in a few minutes.'), extra).catch(() => {});
      return;
    }

    if (!cmd) {
      const u = await userOf(from, from.id);
      const question = text.replace(mention, '').trim() || t('Hallo!', 'Hello!');
      return reply(u, chatId, question.slice(0, 6000), MODES[u.mode] ? u.mode : 'agent', { group: g, history: groupContext(g), replyTo: msg.message_id });
    }

    const admin = () => isAdmin(chatId, msg);
    const onOff = (v) => (/^(an|on|ein|1)$/i.test(v) ? 1 : /^(aus|off|0)$/i.test(v) ? 0 : null);
    if (['hilfe', 'help', 'start'].includes(name)) return sendHtml(chatId, groupHelpText(bot.username), extra);
    if (name === 'ai') {
      const v = onOff(arg);
      if (v === null) return sendHtml(chatId, g.ai ? t('Ich bin an ✅ Admins: /ai aus schaltet mich still.', 'I am on ✅ Admins: /ai aus mutes me.') : t('Ich bin aus 🤫', 'I am off 🤫'), extra);
      if (!(await admin())) return g.ai ? sendHtml(chatId, t('Das dürfen nur Gruppen-Admins 🔒', 'Only group admins can do that 🔒'), extra) : undefined;
      await setGroup(g.id, 'ai_on', v);
      return sendHtml(chatId, v ? t(`${BOT_NAME} ist an ✅ Erwähnt mich mit @${esc(bot.username)}.`, `${BOT_NAME} is on ✅ Mention me with @${esc(bot.username)}.`) : t('Ich bin jetzt still 🤫 Ein Admin weckt mich mit /ai an.', 'I am quiet now 🤫 An admin can wake me with /ai an.'), extra);
    }
    if (name === 'willkommen' || name === 'welcome') {
      const v = onOff(arg);
      if (v === null) return sendHtml(chatId, g.welcome ? t('Begrüßung ist an 👋 (Admins: /willkommen aus)', 'Welcome messages are on 👋 (admins: /willkommen aus)') : t('Begrüßung ist aus (Admins: /willkommen an)', 'Welcome messages are off (admins: /willkommen an)'), extra);
      if (!(await admin())) return sendHtml(chatId, t('Das dürfen nur Gruppen-Admins 🔒', 'Only group admins can do that 🔒'), extra);
      await setGroup(g.id, 'welcome_on', v);
      return sendHtml(chatId, v ? t('Neue Mitglieder werden begrüßt 👋', 'New members will be welcomed 👋') : t('Keine Begrüßung mehr für neue Mitglieder.', 'No more welcome messages.'), extra);
    }
    if (name === 'regeln' || name === 'rules') {
      const set = arg.match(/^(setzen|set)\s+([\s\S]+)$/i);
      if (set || /^(löschen|loeschen|clear)$/i.test(arg)) {
        if (!(await admin())) return sendHtml(chatId, t('Regeln dürfen nur Gruppen-Admins festlegen 🔒', 'Only group admins can set the rules 🔒'), extra);
        await setGroup(g.id, 'rules', set ? set[2].trim().slice(0, 2000) : null);
        return sendHtml(chatId, set ? t('Regeln gespeichert ✅ Alle sehen sie mit /regeln.', 'Rules saved ✅ Everyone can see them with /regeln.') : t('Regeln gelöscht.', 'Rules cleared.'), extra);
      }
      return g.rules ? sendText(chatId, `📜 **${t('Regeln', 'Rules')}**\n\n${g.rules}`, extra) : sendHtml(chatId, t('Es gibt noch keine Regeln. Admins: <code>/regeln setzen Seid nett zueinander …</code>', 'There are no rules yet. Admins: <code>/regeln setzen Be kind …</code>'), extra);
    }
    if (name === 'stats') {
      const users = g.stats.day === dayKey() ? Object.values(g.stats.users ?? {}) : [];
      if (!users.length) return sendHtml(chatId, t('Heute habe ich noch keine Nachrichten gezählt. (Tipp: Bei BotFather den Privacy Mode ausschalten, damit ich alle Nachrichten sehe.)', 'No messages counted today yet. (Tip: turn off Privacy Mode at BotFather so I can see all messages.)'), extra);
      const top = users.sort((a, b) => b.n - a.n).slice(0, 5);
      const medal = ['🥇', '🥈', '🥉', '4.', '5.'];
      return sendHtml(chatId, `📊 <b>${t('Heute am aktivsten', 'Most active today')}</b>\n${top.map((x, i) => `${medal[i]} ${esc(x.name)} – ${x.n} ${x.n === 1 ? t('Nachricht', 'message') : t('Nachrichten', 'messages')}`).join('\n')}`, extra);
    }
    const u = await userOf(from, from.id);
    if (name === 'zusammenfassung' || name === 'summary') {
      const lines = g.history.filter((m) => !m.bot);
      if (lines.length < 5) return sendHtml(chatId, t('Ich habe noch zu wenig von euch gelesen 📭 (Tipp: Bei BotFather den Privacy Mode ausschalten, sonst sehe ich nur Nachrichten an mich.)', 'I have not read enough yet 📭 (Tip: turn off Privacy Mode at BotFather, otherwise I only see messages meant for me.)'), extra);
      return aiTask(u, chatId, extra, async (signal) => {
        const out = await llmText('smart', [sys('You summarize group chats neutrally and briefly.'), { role: 'user', content: `Fasse die letzten ${g.history.length} Nachrichten dieser Gruppe kurz zusammen: 3–6 Stichpunkte (wer hat was gesagt oder entschieden, offene Fragen). Neutral, ohne Bewertung von Personen.\n\n${g.history.map((m) => `${m.bot ? BOT_NAME : m.name}: ${m.text}`).join('\n').slice(0, 12_000)}` }], { maxTokens: 800, signal });
        await sendText(chatId, `📝 **${t('Zusammenfassung', 'Summary')}**\n\n${out}`, extra);
      });
    }
    if (name === 'mission') {
      if (g.mission?.day === dayKey()) return sendText(chatId, `🎯 **${t('Mission des Tages', 'Mission of the day')}**\n\n${g.mission.text}`, extra);
      return aiTask(u, chatId, extra, async (signal) => {
        const out = await shortAsk(t('Denk dir eine kleine, lustige Tages-Challenge für eine Gruppe aus (Weltraum, Technik oder kreativ), machbar in 5–15 Minuten, ungefährlich und kostenlos. 2–3 Sätze, mit Emoji. Nur die Challenge.', 'Come up with a small, fun daily challenge for a group (space, tech or creative), doable in 5–15 minutes, safe and free. 2–3 sentences with an emoji. Only the challenge.'), signal);
        g.mission = { day: dayKey(), text: out.slice(0, 800) };
        await setGroup(g.id, 'mission', JSON.stringify(g.mission));
        await sendText(chatId, `🎯 **${t('Mission des Tages', 'Mission of the day')}**\n\n${g.mission.text}`, extra);
      });
    }
    if (['recherche', 'research', 'heavy'].includes(name)) {
      if (!arg) return sendHtml(chatId, t('Schreib deine Frage dahinter, z. B. <code>/recherche Wie weit ist der Mond weg?</code>', 'Add your question, e.g. <code>/recherche How far away is the moon?</code>'), extra);
      return reply(u, chatId, arg.slice(0, 6000), name === 'heavy' ? 'heavy' : 'research', { group: g, history: groupContext(g), replyTo: msg.message_id });
    }
    if (await sharedCommand(name, arg, { u, chatId, extra, group: true }) !== false) return;
    // unbekannter Befehl → still (könnte für einen anderen Bot sein)
  }

  // ── Verarbeitung im Hintergrund: pro Nutzer nacheinander, insgesamt höchstens 2 gleichzeitig ──
  const seen = new Set();
  const chains = new Map();
  let active = 0;
  const waiting = [];
  const slot = () => (active < 2 ? Promise.resolve(++active) : new Promise((ok) => waiting.push(ok)).then(() => ++active));
  const release = () => { active--; waiting.shift()?.(); };
  const pending = new Set();
  function handleUpdate(update) {
    if (!update || typeof update !== 'object') return Promise.resolve();
    if (Number.isInteger(update.update_id)) {
      if (seen.has(update.update_id)) return Promise.resolve(); // Telegram schickt manchmal doppelt
      seen.add(update.update_id);
      if (seen.size > 2000) seen.delete(seen.values().next().value);
    }
    const chat = update.message?.chat;
    const who = chat && chat.type !== 'private' ? `g${chat.id}` : update.message?.from?.id ?? update.callback_query?.from?.id ?? 0;
    const lang = update.message?.from?.language_code ?? update.callback_query?.from?.language_code ?? 'de';
    const job = (chains.get(who) ?? Promise.resolve()).then(async () => {
      await slot();
      try {
        await withLang(String(lang).slice(0, 2), async () => {
          if (update.message) await onMessage(update.message);
          else if (update.callback_query) await onCallback(update.callback_query);
        });
      } catch (err) {
        log('Update fehlgeschlagen', err);
      } finally {
        release();
      }
    });
    chains.set(who, job);
    pending.add(job);
    job.finally(() => { pending.delete(job); if (chains.get(who) === job) chains.delete(who); });
    return job;
  }
  const idle = async () => { while (pending.size) await Promise.allSettled([...pending]); };

  // ── Webhook ──
  const router = Router();
  const same = (a, b) => { const x = Buffer.from(String(a)); const y = Buffer.from(String(b)); return x.length === y.length && timingSafeEqual(x, y); };
  router.post('/:secret', express.json({ limit: '1mb' }), (req, res) => {
    if (!same(req.params.secret, config.secret)) return res.status(404).end();
    if (!same(req.get('X-Telegram-Bot-Api-Secret-Token') ?? '', config.secret)) return res.status(401).end();
    res.status(200).json({ ok: true }); // sofort – die Arbeit läuft danach
    setImmediate(() => { handleUpdate(req.body).catch(() => {}); });
  });
  router.use((req, res) => res.status(404).end());

  // ── Beim Start: Webhook, Befehle und Name setzen ──
  let retryTimer = null;
  async function start() {
    if (!config.publicUrl) { state.error = 'RENDER_EXTERNAL_URL fehlt'; console.log('Telegram: keine öffentliche Adresse (RENDER_EXTERNAL_URL) – Webhook nicht gesetzt.'); return state; }
    for (let attempt = 0; attempt < 3 && !state.webhook; attempt++) {
      try {
        await tg.call('setWebhook', { url: `${config.publicUrl}/api/telegram/${config.secret}`, secret_token: config.secret, allowed_updates: ['message', 'callback_query'], max_connections: 10 });
        state.webhook = true;
        state.error = null;
      } catch (err) {
        state.error = say(err.message);
        log('setWebhook fehlgeschlagen', err);
        await new Promise((ok) => setTimeout(ok, 2000 * (attempt + 1)));
      }
    }
    if (state.webhook) console.log(`Telegram: Webhook gesetzt (${new URL(config.publicUrl).host}) – Bot „${BOT_NAME}“ ist an.`);
    else if (!retryTimer) {
      // später nochmal (z. B. wenn Telegram kurz nicht erreichbar war)
      retryTimer = setInterval(() => { if (state.webhook) { clearInterval(retryTimer); return; } start().catch(() => {}); }, 10 * 60 * 1000);
      retryTimer.unref?.();
    }
    if (!state.webhook) return state;
    // Befehle getrennt für Einzel-Chats und Gruppen (Deutsch + Englisch)
    for (const [lang, code] of [['de', null], ['en', 'en']]) {
      await withLang(lang, async () => {
        const l = code ? { language_code: code } : {};
        await tg.call('setMyCommands', { commands: COMMANDS('private'), ...l });
        await tg.call('setMyCommands', { commands: COMMANDS('private'), scope: { type: 'all_private_chats' }, ...l });
        await tg.call('setMyCommands', { commands: COMMANDS('group'), scope: { type: 'all_group_chats' }, ...l });
      }).catch((err) => log('setMyCommands fehlgeschlagen', err));
    }
    await botInfo();
    try {
      const current = await tg.call('getMyName', {});
      if (current?.name !== BOT_NAME) await tg.call('setMyName', { name: BOT_NAME });
    } catch (err) { log('Name setzen fehlgeschlagen', err); }
    await tg.call('setMyShortDescription', { short_description: 'Agent X von VAIs – sucht, liest, rechnet und recherchiert für dich.' }).catch(() => {});
    return state;
  }

  return { state, router, handleUpdate, start, idle };
}

// Der Bot für den Server (aus den Umgebungsvariablen)
export const telegramBot = createBot();
globalThis.__vaisTelegram = telegramBot.state;

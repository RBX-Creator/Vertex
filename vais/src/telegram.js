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
import { completeBest } from './models.js';
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

export const BOT_NAME = 'X Agent';
const HISTORY_MAX = 20;
const TG_LIMIT = 4096;
const CHUNK = 3500; // Platz für HTML-Tags
const MODES = { fast: () => t('Schnell', 'Fast'), expert: () => t('Experte', 'Expert'), agent: () => 'Agent X' };
const DAY = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit' });
const dayKey = () => DAY.format(new Date());

// ── Einstellungen ───────────────────────────────────────────────
export function telegramConfig(env = process.env) {
  const token = String(env.TELEGRAM_BOT_TOKEN ?? '').trim();
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
    `<b>${BOT_NAME}</b> – Agent X von VAIs in Telegram.\n\n<b>Befehle</b>\n/neu – Verlauf löschen\n/modus – Schnell, Experte oder Agent X wählen\n/recherche &lt;Frage&gt; – gründliche Recherche mit Quellen\n/heavy &lt;Frage&gt; – mehrere starke Modelle, die beste Antwort\n/hilfe – diese Hilfe\n\nSchreib einfach eine Nachricht – Standard ist Agent X (sucht, liest, rechnet selbstständig). Bis zu ${limit} Nachrichten pro Tag.`,
    `<b>${BOT_NAME}</b> – VAIs Agent X on Telegram.\n\n<b>Commands</b>\n/neu – clear history\n/modus – choose Fast, Expert or Agent X\n/recherche &lt;question&gt; – thorough research with sources\n/heavy &lt;question&gt; – several strong models, the best answer\n/hilfe – this help\n\nJust send a message – the default is Agent X (searches, reads and calculates on its own). Up to ${limit} messages per day.`,
  );
}
const startText = (name) => t(
  `Hallo${name ? ` ${esc(name)}` : ''}! 👋 Ich bin <b>${BOT_NAME}</b> – Agent X von VAIs.\n\nFrag mich einfach etwas, zum Beispiel:\n• <i>Was ist heute in der Raumfahrt passiert?</i>\n• <i>Erklär mir schwarze Löcher, als wäre ich 12</i>\n• /recherche Vor- und Nachteile von E-Autos 2026\n• /heavy Beweise, dass √2 irrational ist\n\n/hilfe zeigt alle Befehle.`,
  `Hi${name ? ` ${esc(name)}` : ''}! 👋 I'm <b>${BOT_NAME}</b> – VAIs Agent X.\n\nJust ask me something, for example:\n• <i>What happened in space news today?</i>\n• <i>Explain black holes like I'm 12</i>\n• /recherche pros and cons of electric cars 2026\n• /heavy Prove that √2 is irrational\n\n/hilfe shows all commands.`,
);
export const COMMANDS = () => [
  { command: 'start', description: t('Begrüßung und Beispiele', 'Welcome and examples') },
  { command: 'neu', description: t('Verlauf löschen, neu anfangen', 'Clear history, start over') },
  { command: 'modus', description: t('Schnell, Experte oder Agent X wählen', 'Choose Fast, Expert or Agent X') },
  { command: 'recherche', description: t('Gründliche Recherche mit Quellen', 'Thorough research with sources') },
  { command: 'heavy', description: t('Mehrere Modelle, die beste Antwort', 'Several models, the best answer') },
  { command: 'hilfe', description: t('Alle Befehle', 'All commands') },
];
const modeKeyboard = (current) => ({
  inline_keyboard: [Object.keys(MODES).map((m) => ({ text: `${m === current ? '✓ ' : ''}${MODES[m]()}`, callback_data: `mode:${m}` }))],
});

export function createBot({ config = telegramConfig(), api = null, answer = null } = {}) {
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
  async function sendImage(chatId, dataUrl) {
    const m = String(dataUrl).match(/^data:(image\/(?:png|jpeg|webp));base64,(.+)$/);
    if (!m) return; // z. B. SVG im Demo-Modus
    const form = new FormData();
    form.append('chat_id', String(chatId));
    form.append('photo', new Blob([Buffer.from(m[2], 'base64')], { type: m[1] }), `bild.${m[1].split('/')[1]}`);
    await tg.call('sendPhoto', form).catch((err) => log('Bild senden fehlgeschlagen', err));
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

  async function reply(u, chatId, question, mode) {
    if (!(await charge(u))) {
      return sendHtml(chatId, t(`Du hast heute alle ${config.limit} Nachrichten genutzt 🌙 Morgen geht es weiter – bis dann!`, `You've used all ${config.limit} messages for today 🌙 See you tomorrow!`));
    }
    const blocked = await checkText(question, 'prompt').catch(() => null);
    if (blocked) { await refund(u); return sendText(chatId, blocked.message); }
    const stop = typing(chatId);
    const signal = AbortSignal.timeout(5 * 60 * 1000);
    try {
      const out = await answerFn({ mode, question, history: u.history, signal, user: u });
      stop();
      const text = String(out.text ?? '').trim();
      if (!text && !out.images?.length) throw new Error('leere Antwort');
      for (const img of out.images ?? []) await sendImage(chatId, img);
      if (text) await sendText(chatId, withSources(text, out.sources ?? []));
      await saveHistory(u.tg_id, [...u.history, { role: 'user', content: question.slice(0, 4000) }, { role: 'assistant', content: text.slice(0, 4000) }]);
    } catch (err) {
      stop();
      await refund(u);
      log('Antwort fehlgeschlagen', err);
      logEvent('error', 'telegram', say(err.message).slice(0, 200)).catch(() => {});
      await sendHtml(chatId, signal.aborted
        ? t('Das hat zu lange gedauert ⏳ Versuch es bitte nochmal, gern etwas kürzer.', 'That took too long ⏳ Please try again, maybe a bit shorter.')
        : t('Da ist leider etwas schiefgegangen 😕 Versuch es gleich nochmal.', 'Sorry, something went wrong 😕 Please try again in a moment.')).catch(() => {});
    }
  }

  async function onMessage(msg) {
    const chatId = msg.chat?.id;
    const from = msg.from;
    if (!chatId || !from || from.is_bot) return;
    if (msg.chat.type !== 'private') return; // nur Einzel-Chats
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
    const who = update.message?.from?.id ?? update.callback_query?.from?.id ?? 0;
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
    await withLang('de', () => tg.call('setMyCommands', { commands: COMMANDS() })).catch((err) => log('setMyCommands fehlgeschlagen', err));
    await withLang('en', () => tg.call('setMyCommands', { commands: COMMANDS(), language_code: 'en' })).catch(() => {});
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

// Telegram-Bot „X Agent“ – mit nachgebauter Telegram-Schnittstelle (kein echter Token, kein Netz)
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import express from 'express';

process.env.DATABASE_URL = `file:${join(mkdtempSync(join(tmpdir(), 'vais-tg-')), 't.db')}`;
for (const k of ['OPENROUTER_API_KEY', 'GROQ_API_KEY', 'GEMINI_API_KEY', 'CEREBRAS_API_KEY', 'MISTRAL_API_KEY', 'TELEGRAM_BOT_TOKEN']) delete process.env[k];
const tg = await import('../src/telegram.js');
const { telegramConfig, createBot, toTelegramHtml, splitMessage, makeApi, COMMANDS } = tg;

const TOKEN = '123456:SECRET-TOKEN-abcdefghijklmnop';
// Konsole mitschneiden: der Token darf nirgends auftauchen
const logged = [];
const orig = { log: console.log, error: console.error };
console.log = (...a) => { logged.push(a.join(' ')); };
console.error = (...a) => { logged.push(a.join(' ')); };
after(() => { Object.assign(console, orig); });

function fakeApi({ failHtml = false } = {}) {
  const calls = [];
  return {
    calls,
    sent: () => calls.filter((c) => c.method === 'sendMessage').map((c) => c.body),
    async call(method, body = {}) {
      calls.push({ method, body });
      if (method === 'sendMessage' && failHtml && body.parse_mode === 'HTML' && !/^Du hast|^You've/.test(body.text)) throw Object.assign(new Error("Telegram sendMessage: Bad Request: can't parse entities"), { status: 400 });
      if (method === 'getMyName') return { name: 'Alt' };
      return true;
    },
  };
}
const cfg = (extra = {}) => ({ ...telegramConfig({ TELEGRAM_BOT_TOKEN: TOKEN, RENDER_EXTERNAL_URL: 'https://vais-dvvk.onrender.com', ...extra }) });
let uid = 1000;
const msg = (text, from = { id: uid, first_name: 'Mia', language_code: 'de' }, id = Math.floor(Math.random() * 1e9)) => ({ update_id: id, message: { message_id: 1, text, chat: { id: from.id, type: 'private' }, from } });

test('Ohne Token ist der Bot aus – ohne Fehler, Webhook gibt 404', async () => {
  const c = telegramConfig({});
  assert.equal(c.on, false);
  const bot = createBot({ config: c });
  assert.equal(bot.state.on, false);
  assert.equal((await bot.start()).webhook, false);
  assert.equal(tg.telegramBot.state.on, false); // auf dem Server ohne Variable
});

test('Secret: aus dem Token abgeleitet (stabil, nicht der Token) oder aus TELEGRAM_WEBHOOK_SECRET', () => {
  const a = telegramConfig({ TELEGRAM_BOT_TOKEN: TOKEN });
  assert.match(a.secret, /^[a-f0-9]{48}$/);
  assert.equal(a.secret, telegramConfig({ TELEGRAM_BOT_TOKEN: TOKEN }).secret);
  assert.ok(!a.secret.includes('SECRET-TOKEN'));
  assert.notEqual(a.secret, telegramConfig({ TELEGRAM_BOT_TOKEN: `${TOKEN}x` }).secret);
  assert.equal(telegramConfig({ TELEGRAM_BOT_TOKEN: TOKEN, TELEGRAM_WEBHOOK_SECRET: 'mein_geheimnis-1' }).secret, 'mein_geheimnis-1');
  assert.equal(a.limit, 50);
  assert.equal(telegramConfig({ TELEGRAM_BOT_TOKEN: TOKEN, TELEGRAM_DAILY_LIMIT: '7' }).limit, 7);
  assert.deepEqual([...telegramConfig({ TELEGRAM_BOT_TOKEN: TOKEN, TELEGRAM_ALLOWED_IDS: '11, 22;x' }).allowed], ['11', '22']);
});

test('Start: setWebhook mit Adresse + Secret-Header, Befehle und Name werden gesetzt', async () => {
  const api = fakeApi();
  const c = cfg();
  const bot = createBot({ config: c, api });
  const st = await bot.start();
  assert.equal(st.webhook, true);
  const hook = api.calls.find((x) => x.method === 'setWebhook').body;
  assert.equal(hook.url, `https://vais-dvvk.onrender.com/api/telegram/${c.secret}`);
  assert.equal(hook.secret_token, c.secret);
  assert.deepEqual(hook.allowed_updates, ['message', 'callback_query']);
  const cmds = api.calls.find((x) => x.method === 'setMyCommands').body.commands.map((x) => x.command);
  assert.deepEqual(cmds, ['start', 'neu', 'modus', 'recherche', 'heavy', 'hilfe']);
  assert.equal(api.calls.find((x) => x.method === 'setMyName').body.name, 'X Agent');
  assert.equal(COMMANDS().length, 6);
});

test('Webhook: falsches Secret 404, falscher Header 401, richtig → sofort 200, Arbeit danach', async () => {
  const api = fakeApi();
  const c = cfg();
  let release;
  const slow = new Promise((ok) => { release = ok; });
  const bot = createBot({ config: c, api, answer: async () => { await slow; return { text: 'fertig' }; } });
  const app = express();
  app.use('/api/telegram', bot.router);
  const server = app.listen(0);
  const base = `http://localhost:${server.address().port}/api/telegram`;
  const post = (path, headers, body) => fetch(`${base}/${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
  try {
    assert.equal((await post('falsch', { 'X-Telegram-Bot-Api-Secret-Token': c.secret }, {})).status, 404);
    assert.equal((await post(c.secret, { 'X-Telegram-Bot-Api-Secret-Token': 'nein' }, {})).status, 401);
    const t0 = Date.now();
    const res = await post(c.secret, { 'X-Telegram-Bot-Api-Secret-Token': c.secret }, msg('Hallo', { id: 4242, first_name: 'Ben' }));
    assert.equal(res.status, 200);
    assert.ok(Date.now() - t0 < 1000, 'antwortet sofort, obwohl die Antwort noch dauert');
    await new Promise((ok) => setTimeout(ok, 100));
    assert.ok(!api.sent().some((m) => m.text === 'fertig'));
    release();
    await new Promise((ok) => setTimeout(ok, 50));
    await bot.idle();
    assert.ok(api.sent().some((m) => m.text === 'fertig'));
  } finally { server.close(); }
});

test('Befehle: /start, /hilfe, /modus mit Buttons, Moduswahl, /neu', async () => {
  const api = fakeApi();
  const bot = createBot({ config: cfg(), api, answer: async ({ mode }) => ({ text: `Modus ${mode}` }) });
  const from = { id: ++uid, first_name: 'Lea', language_code: 'de' };
  await bot.handleUpdate(msg('/start', from));
  assert.match(api.sent().at(-1).text, /X Agent/);
  assert.match(api.sent().at(-1).text, /\/recherche/);
  await bot.handleUpdate(msg('/hilfe@XAgentBot', from));
  assert.match(api.sent().at(-1).text, /\/heavy/);
  await bot.handleUpdate(msg('/modus', from));
  const kb = api.sent().at(-1).reply_markup.inline_keyboard[0];
  assert.deepEqual(kb.map((b) => b.callback_data), ['mode:fast', 'mode:expert', 'mode:agent']);
  assert.match(kb[2].text, /✓ Agent X/); // Standard
  await bot.handleUpdate({ update_id: 77, callback_query: { id: 'cb1', data: 'mode:expert', from, message: { message_id: 5, chat: { id: from.id } } } });
  assert.ok(api.calls.some((c) => c.method === 'answerCallbackQuery'));
  assert.ok(api.calls.some((c) => c.method === 'editMessageText' && /Experte/.test(c.body.text)));
  await bot.handleUpdate(msg('Wie geht es dir?', from));
  assert.equal(api.sent().at(-1).text, 'Modus expert');
  await bot.handleUpdate(msg('/recherche E-Autos 2026', from));
  assert.equal(api.sent().at(-1).text, 'Modus research');
  await bot.handleUpdate(msg('/heavy Beweise etwas', from));
  assert.equal(api.sent().at(-1).text, 'Modus heavy');
  await bot.handleUpdate(msg('/recherche', from));
  assert.match(api.sent().at(-1).text, /Schreib deine Frage/);
  await bot.handleUpdate(msg('/neu', from));
  assert.match(api.sent().at(-1).text, /Verlauf gelöscht/);
});

test('Agent X (echte Logik, Demo): Antwort, „schreibt …“, Verlauf höchstens 20 Nachrichten', async () => {
  const api = fakeApi();
  const bot = createBot({ config: cfg(), api });
  const from = { id: ++uid, first_name: 'Tom', language_code: 'de' };
  await bot.handleUpdate(msg('Was ist 21 mal 2?', from));
  assert.ok(api.calls.some((c) => c.method === 'sendChatAction' && c.body.action === 'typing'));
  const answer = api.sent().at(-1);
  assert.match(answer.text, /Agent X/);
  assert.match(answer.text, /Quellen/); // Quellen aus dem Agenten als Links
  for (let i = 0; i < 12; i++) await bot.handleUpdate(msg(`Frage ${i}`, from));
  const { get } = await import('../src/db.js');
  const row = await get('SELECT history, used FROM telegram_users WHERE tg_id = ?', from.id);
  const hist = JSON.parse(row.history);
  assert.equal(hist.length, 20);
  assert.equal(hist.at(-2).content, 'Frage 11');
  assert.equal(Number(row.used), 13);
});

test('Tageslimit mit freundlicher Meldung, Allowlist sperrt Fremde', async () => {
  const api = fakeApi();
  const bot = createBot({ config: cfg({ TELEGRAM_DAILY_LIMIT: '2' }), api, answer: async () => ({ text: 'ok' }) });
  const from = { id: ++uid, first_name: 'Ida' };
  for (let i = 0; i < 3; i++) await bot.handleUpdate(msg(`Hi ${i}`, from));
  assert.equal(api.sent().filter((m) => m.text === 'ok').length, 2);
  assert.match(api.sent().at(-1).text, /alle 2 Nachrichten/);
  await bot.handleUpdate(msg('/hilfe', from)); // Befehle zählen nicht und gehen weiter
  assert.match(api.sent().at(-1).text, /\/neu/);

  const api2 = fakeApi();
  const priv = createBot({ config: cfg({ TELEGRAM_ALLOWED_IDS: '1' }), api: api2, answer: async () => ({ text: 'geheim' }) });
  await priv.handleUpdate(msg('Hallo', { id: 999 }));
  assert.match(api2.sent().at(-1).text, /privat/);
  await priv.handleUpdate(msg('Hallo', { id: 1 }));
  assert.equal(api2.sent().at(-1).text, 'geheim');
});

test('Fehler und Zeitüberschreitung: freundliche Meldung, zählt nicht, Bot läuft weiter', async () => {
  const api = fakeApi();
  let fail = true;
  const bot = createBot({ config: cfg(), api, answer: async () => { if (fail) throw new Error(`kaputt ${TOKEN}`); return { text: 'wieder da' }; } });
  const from = { id: ++uid };
  await bot.handleUpdate(msg('Frage', from));
  assert.match(api.sent().at(-1).text, /schiefgegangen/);
  fail = false;
  await bot.handleUpdate(msg('Frage', from));
  assert.equal(api.sent().at(-1).text, 'wieder da');
  const { get } = await import('../src/db.js');
  assert.equal(Number((await get('SELECT used FROM telegram_users WHERE tg_id = ?', from.id)).used), 1);
});

test('Doppelte Updates (Telegram wiederholt) werden nur einmal verarbeitet', async () => {
  const api = fakeApi();
  let n = 0;
  const bot = createBot({ config: cfg(), api, answer: async () => ({ text: `Nr ${++n}` }) });
  const u = msg('Hallo', { id: ++uid }, 555);
  await bot.handleUpdate(u);
  await bot.handleUpdate(u);
  assert.equal(n, 1);
});

test('Markdown → Telegram-HTML: sicher, Code, Links, Tabellen unverändert', () => {
  const html = toTelegramHtml('# Titel\n**fett** und *kursiv* und `a<b>` und [VAIs](https://vais.de?a=1&b=2)\n- Punkt\n```js\nif (a < b) {}\n```\n| A | B |\n|---|---|\n| 1 | <2> |\n> Zitat\nx < y & z');
  assert.match(html, /<b>Titel<\/b>/);
  assert.match(html, /<b>fett<\/b> und <i>kursiv<\/i>/);
  assert.match(html, /<code>a&lt;b&gt;<\/code>/);
  assert.match(html, /<a href="https:\/\/vais\.de\?a=1&amp;b=2">VAIs<\/a>/);
  assert.match(html, /• Punkt/);
  assert.match(html, /<pre><code class="language-js">if \(a &lt; b\) \{\}<\/code><\/pre>/);
  assert.match(html, /<pre>\| A \| B \|\n\|---\|---\|\n\| 1 \| &lt;2&gt; \|<\/pre>/); // Tabelle Zeichen für Zeichen
  assert.match(html, /<blockquote>Zitat<\/blockquote>/);
  assert.match(html, /x &lt; y &amp; z/);
  assert.doesNotMatch(toTelegramHtml('<script>alert(1)</script>'), /<script>/);
  assert.equal(toTelegramHtml('snake_case_name und 2*3*4'), 'snake_case_name und 2*3*4');
});

test('Lange Antworten: sauber geteilt, jedes Stück unter 4000 Zeichen, Code-Blöcke bleiben geschlossen', () => {
  const long = `${'Absatz mit Text. '.repeat(200)}\n\n\`\`\`python\n${'print("x")\n'.repeat(500)}\`\`\`\n\nEnde.`;
  const parts = splitMessage(long);
  assert.ok(parts.length >= 3);
  for (const p of parts) {
    assert.ok(p.length <= 4000, `Stück ${p.length}`);
    assert.equal((p.match(/^\s*```/gm) ?? []).length % 2, 0, 'Fences paarweise');
    assert.ok(toTelegramHtml(p).length <= 4096);
  }
  assert.match(parts.at(-1), /Ende\.$/);
  assert.equal(splitMessage('kurz').length, 1);
});

test('Wenn HTML nicht klappt, kommt die Antwort als normaler Text', async () => {
  const api = fakeApi({ failHtml: true });
  const bot = createBot({ config: cfg(), api, answer: async () => ({ text: '**Hallo** Welt' }) });
  await bot.handleUpdate(msg('x', { id: ++uid }));
  const last = api.sent().at(-1);
  assert.equal(last.parse_mode, undefined);
  assert.equal(last.text, '**Hallo** Welt');
});

test('Telegram-Schnittstelle: Token nie in Fehlern; nirgends im Log', async () => {
  const api = makeApi(TOKEN, async (url) => ({ ok: false, status: 401, json: async () => ({ ok: false, description: `Unauthorized ${TOKEN}` }), url }));
  await assert.rejects(api.call('getMe'), (err) => !err.message.includes(TOKEN) && /Unauthorized \*\*\*/.test(err.message));
  const net = makeApi(TOKEN, async () => { throw new Error(`connect failed https://api.telegram.org/bot${TOKEN}/getMe`); });
  await assert.rejects(net.call('getMe'), (err) => !err.message.includes(TOKEN));
  assert.ok(logged.length > 0);
  assert.ok(!logged.some((l) => l.includes(TOKEN) || l.includes('SECRET-TOKEN')), 'Token im Log!');
});

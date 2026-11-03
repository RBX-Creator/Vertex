// Telegram-Bot in Gruppen + neue Befehle – alles nachgebaut (Telegram, Modelle, Suche, Bilder)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.DATABASE_URL = `file:${join(mkdtempSync(join(tmpdir(), 'vais-tgg-')), 'g.db')}`;
for (const k of ['OPENROUTER_API_KEY', 'GROQ_API_KEY', 'GEMINI_API_KEY', 'CEREBRAS_API_KEY', 'MISTRAL_API_KEY', 'TELEGRAM_BOT_TOKEN']) delete process.env[k];
const { telegramConfig, createBot } = await import('../src/telegram.js');

const TOKEN = '123456:SECRET-TOKEN-abcdefghijklmnop';
const BOT = { id: 999, username: 'XAI_Vertexbot', is_bot: true, first_name: 'X Agent' };
const ADMIN = { id: 1, first_name: 'Anna' };
const USER = { id: 2, first_name: 'Ben' };

function fakeApi() {
  const calls = [];
  return {
    calls,
    of: (m) => calls.filter((c) => c.method === m).map((c) => c.body),
    texts: () => calls.filter((c) => c.method === 'sendMessage').map((c) => c.body.text),
    async call(method, body = {}) {
      calls.push({ method, body });
      if (method === 'getMe') return BOT;
      if (method === 'getChatMember') return { status: body.user_id === ADMIN.id ? 'administrator' : 'member' };
      return true;
    },
  };
}
const llmCalls = [];
const fakeLlm = async (task, messages) => {
  const last = messages.at(-1).content;
  llmCalls.push(last);
  if (/quiz question/.test(last)) return '{"question":"Welcher Planet ist der größte?","options":["Jupiter","Mars","Venus","Merkur"],"correct":0,"explanation":"Jupiter ist der größte Planet."}';
  if (/News/.test(last)) return '🤖 Neues KI-Modell vorgestellt [1]\n💻 Neuer Chip [2]';
  if (/zusammen/i.test(last)) return '- Anna und Ben planen ein Treffen';
  if (/Witz/.test(last)) return 'Warum war der Astronaut traurig? Er hatte keinen Platz. 🚀';
  if (/Weltraum-Fakt/.test(last)) return '🌕 Auf dem Mond bleiben Fußspuren Millionen Jahre.';
  if (/Challenge/.test(last)) return '🎯 Findet heute Abend den Polarstern!';
  return 'ok';
};
const fakeSearch = async (q) => ({ results: [{ url: `https://news.example/${encodeURIComponent(q)}`, title: `News zu ${q}`, snippet: 'Neues' }] });
const imagePrompts = [];
const fakeImage = async (prompt) => { imagePrompts.push(prompt); return `data:image/png;base64,${Buffer.from('png').toString('base64')}`; };

let nextId = 1;
const group = { id: -100123, type: 'supergroup', title: 'Weltraum-Fans' };
const gmsg = (text, from = USER, extra = {}) => ({ update_id: nextId++, message: { message_id: nextId++, text, chat: group, from, ...extra } });
function makeBot(opts = {}) {
  const api = fakeApi();
  const answers = [];
  const bot = createBot({
    config: { ...telegramConfig({ TELEGRAM_BOT_TOKEN: TOKEN, RENDER_EXTERNAL_URL: 'https://vais.example' }), ...opts },
    api,
    answer: async (a) => { answers.push(a); return { text: `Antwort auf: ${a.question}` }; },
    llm: fakeLlm, search: fakeSearch, image: fakeImage,
  });
  return { bot, api, answers };
}

test('Gruppe: antwortet nur bei Erwähnung, Antwort auf seine Nachricht oder Befehl – mit Gruppen-Kontext', async () => {
  const { bot, api, answers } = makeBot();
  await bot.handleUpdate(gmsg('Hallo Leute, wer kommt morgen mit zur Sternwarte?'));
  assert.equal(api.texts().length, 0, 'ohne Erwähnung still');
  await bot.handleUpdate(gmsg('@XAI_Vertexbot wann ist Vollmond?'));
  assert.equal(answers.length, 1);
  assert.equal(answers[0].question, 'wann ist Vollmond?');
  assert.ok(answers[0].group);
  assert.match(answers[0].history[0].content, /Sternwarte/); // Kontext aus der Gruppe
  const sent = api.of('sendMessage').at(-1);
  assert.equal(sent.text, 'Antwort auf: wann ist Vollmond?');
  assert.ok(sent.reply_parameters?.message_id, 'als Antwort auf die Nachricht');
  await bot.handleUpdate(gmsg('und morgen?', USER, { reply_to_message: { message_id: 5, from: BOT, text: '...' } }));
  assert.equal(answers.length, 2);
  await bot.handleUpdate(gmsg('/quiz@AndererBot'));
  assert.equal(api.of('sendPoll').length, 0, 'Befehl für anderen Bot ignoriert');
});

test('/ai aus und an: nur Admins; aus = alles still außer /ai an', async () => {
  const { bot, api, answers } = makeBot();
  await bot.handleUpdate(gmsg('/ai aus', USER));
  assert.match(api.texts().at(-1), /nur Gruppen-Admins/);
  await bot.handleUpdate(gmsg('/ai aus', ADMIN));
  assert.match(api.texts().at(-1), /still/);
  const before = api.calls.length;
  await bot.handleUpdate(gmsg('@XAI_Vertexbot hallo?'));
  await bot.handleUpdate(gmsg('/hilfe'));
  await bot.handleUpdate(gmsg('/ai an', USER)); // kein Admin → still
  assert.equal(answers.length, 0);
  assert.equal(api.calls.filter((c, i) => i >= before && c.method === 'sendMessage').length, 0);
  await bot.handleUpdate(gmsg('/ai an', ADMIN));
  assert.match(api.texts().at(-1), /ist an/);
  await bot.handleUpdate(gmsg('@XAI_Vertexbot hallo?'));
  assert.equal(answers.length, 1);
});

test('/quiz: echte Quiz-Umfrage, richtige Antwort stimmt auch nach dem Mischen', async () => {
  const { bot, api } = makeBot();
  await bot.handleUpdate(gmsg('/quiz Weltraum'));
  const poll = api.of('sendPoll').at(-1);
  assert.equal(poll.type, 'quiz');
  assert.equal(poll.options.length, 4);
  assert.equal(poll.options[poll.correct_option_id].text, 'Jupiter');
  assert.match(poll.question, /größte/);
  assert.equal(poll.is_anonymous, false);
  assert.match(poll.explanation, /Jupiter/);
});

test('/news mit Quellen-Links, /witz, /fakt, /mission (einmal pro Tag erzeugt)', async () => {
  const { bot, api } = makeBot();
  await bot.handleUpdate(gmsg('/news'));
  const news = api.texts().at(-1);
  assert.match(news, /KI- &amp; Tech-News|KI- & Tech-News/);
  assert.match(news, /<a href="https:\/\/news\.example\//);
  await bot.handleUpdate(gmsg('/witz'));
  assert.match(api.texts().at(-1), /Astronaut/);
  await bot.handleUpdate(gmsg('/fakt'));
  assert.match(api.texts().at(-1), /Mond/);
  llmCalls.length = 0;
  await bot.handleUpdate(gmsg('/mission'));
  await bot.handleUpdate(gmsg('/mission', ADMIN));
  assert.equal(llmCalls.filter((c) => /Challenge/.test(c)).length, 1);
  assert.match(api.texts().at(-1), /Polarstern/);
});

test('/zusammenfassung: erst mit genug Nachrichten, dann mit dem Gruppenverlauf', async () => {
  const { bot, api } = makeBot();
  const g2 = { ...group, id: -100777 };
  const m = (text, from = USER) => ({ update_id: nextId++, message: { message_id: nextId++, text, chat: g2, from } });
  await bot.handleUpdate(m('/zusammenfassung'));
  assert.match(api.texts().at(-1), /zu wenig/);
  for (const [i, who] of [ADMIN, USER, ADMIN, USER, ADMIN, USER].entries()) await bot.handleUpdate(m(`Nachricht ${i} zum Treffen`, who));
  llmCalls.length = 0;
  await bot.handleUpdate(m('/zusammenfassung'));
  assert.match(llmCalls[0], /Anna: Nachricht 0 zum Treffen/);
  assert.match(api.texts().at(-1), /Zusammenfassung[\s\S]*Treffen/);
});

test('/umfrage, /bild, /regeln (Admins setzen), /stats', async () => {
  const { bot, api } = makeBot();
  const g3 = { ...group, id: -100888 };
  const m = (text, from = USER) => ({ update_id: nextId++, message: { message_id: nextId++, text, chat: g3, from } });
  await bot.handleUpdate(m('/umfrage Pizza oder Pasta? | Pizza | Pasta'));
  const poll = api.of('sendPoll').at(-1);
  assert.equal(poll.question, 'Pizza oder Pasta?');
  assert.deepEqual(poll.options.map((o) => o.text), ['Pizza', 'Pasta']);
  assert.equal(poll.type, undefined);
  await bot.handleUpdate(m('/umfrage nur eine Frage'));
  assert.match(api.texts().at(-1), /So geht/);

  await bot.handleUpdate(m('/bild roter Sportwagen bei Regen'));
  assert.deepEqual(imagePrompts.at(-1), 'roter Sportwagen bei Regen');
  const photo = api.calls.filter((c) => c.method === 'sendPhoto').at(-1).body;
  assert.ok(photo instanceof FormData);
  assert.match(photo.get('caption'), /Sportwagen/);

  await bot.handleUpdate(m('/regeln setzen Seid nett.', USER));
  assert.match(api.texts().at(-1), /nur Gruppen-Admins/);
  await bot.handleUpdate(m('/regeln setzen Seid nett. Kein Spam.', ADMIN));
  await bot.handleUpdate(m('/regeln'));
  assert.match(api.texts().at(-1), /Seid nett\. Kein Spam\./);

  for (const who of [USER, USER, USER, ADMIN]) await bot.handleUpdate(m('hi', who));
  await bot.handleUpdate(m('/stats'));
  const stats = api.texts().at(-1);
  assert.match(stats, /🥇 Ben – 3 Nachrichten/);
  assert.match(stats, /🥈 Anna – 1 Nachricht\b/);
});

test('Begrüßung neuer Mitglieder, /willkommen aus (Admin), Vorstellung beim Hinzufügen', async () => {
  const { bot, api } = makeBot();
  const g4 = { ...group, id: -100999 };
  const join = (members) => ({ update_id: nextId++, message: { message_id: nextId++, chat: g4, from: ADMIN, new_chat_members: members } });
  await bot.handleUpdate(join([BOT]));
  assert.match(api.texts().at(-1), /in eurer Gruppe/);
  await bot.handleUpdate(join([{ id: 50, first_name: 'Cleo' }]));
  assert.match(api.texts().at(-1), /Willkommen in der Gruppe, <b>Cleo<\/b>/);
  await bot.handleUpdate({ update_id: nextId++, message: { message_id: nextId++, text: '/willkommen aus', chat: g4, from: ADMIN } });
  const n = api.texts().length;
  await bot.handleUpdate(join([{ id: 51, first_name: 'Dan' }]));
  assert.equal(api.texts().length, n, 'keine Begrüßung mehr');
});

test('Rate-Limit pro Gruppe: Hinweis einmal, danach still', async () => {
  const { bot, api, answers } = makeBot({ groupAiPer10Min: 3 });
  const g5 = { ...group, id: -100555 };
  const m = (text) => ({ update_id: nextId++, message: { message_id: nextId++, text, chat: g5, from: USER } });
  for (let i = 0; i < 5; i++) await bot.handleUpdate(m(`@XAI_Vertexbot Frage ${i}`));
  assert.equal(answers.length, 3);
  assert.equal(api.texts().filter((x) => /Kurze Pause/.test(x)).length, 1);
});

test('Einzel-Chat: neue Befehle gehen, Gruppen-Befehle erklären sich, /hilfe aktualisiert', async () => {
  const { bot, api } = makeBot();
  const p = (text) => ({ update_id: nextId++, message: { message_id: nextId++, text, chat: { id: 77, type: 'private' }, from: { id: 77, first_name: 'Ida' } } });
  await bot.handleUpdate(p('/quiz'));
  assert.equal(api.of('sendPoll').at(-1).type, 'quiz');
  await bot.handleUpdate(p('/stats'));
  assert.match(api.texts().at(-1), /nur in Gruppen/);
  await bot.handleUpdate(p('/hilfe'));
  assert.match(api.texts().at(-1), /\/bild/);
  assert.match(api.texts().at(-1), /\/quiz/);
});

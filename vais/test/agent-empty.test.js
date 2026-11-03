// Fehler „Ich konnte leider keine Antwort finden.“ bei „Hi“: Agent X mit nachgebautem Groq-Modell
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.DATABASE_URL = `file:${join(mkdtempSync(join(tmpdir(), 'vais-empty-')), 'e.db')}`;
for (const k of ['OPENROUTER_API_KEY', 'GEMINI_API_KEY', 'CEREBRAS_API_KEY', 'MISTRAL_API_KEY']) delete process.env[k];
process.env.GROQ_API_KEY = 'test-key-groq-0000000000';
process.env.DISABLE_FREE_IMAGES = 'true';

// Antworten des „Modells“ der Reihe nach
let replies = [];
const asked = [];
globalThis.fetch = async (url, opts = {}) => {
  const u = String(url);
  const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
  if (u.endsWith('/models')) return json({ data: [{ id: 'openai/gpt-oss-120b', owned_by: 'OpenAI' }] });
  if (u.endsWith('/chat/completions')) {
    asked.push(JSON.parse(opts.body));
    const content = replies.length ? replies.shift() : 'Standard';
    return json({ choices: [{ message: { role: 'assistant', content }, finish_reason: 'stop' }] });
  }
  return json({}, 404);
};

const { runAgent, splitReaction, isEmptyAnswer } = await import('../src/agent.js');

async function agent(text) {
  let out = '';
  let reaction = null;
  await runAgent({ messages: [{ role: 'user', content: text }], onText: (s) => { out += s; }, onReact: (e) => { reaction = e; }, onStep: () => {}, personal: {} });
  return { out, reaction };
}

test('Reaktion 👋 ist erlaubt, unbekannte Emojis werden 👍 statt „nichts“', () => {
  assert.deepEqual(splitReaction('[[react:👋]]'), { reaction: '👋', text: '' });
  assert.equal(splitReaction('[[react:🦄]]').reaction, '👍');
  assert.equal(isEmptyAnswer('[[react:👋]]'), false);
  assert.equal(isEmptyAnswer('   '), true);
  assert.equal(isEmptyAnswer(null), true);
});

test('„Hi“ → Modell antwortet nur mit 👋: Reaktion statt „Ich konnte leider keine Antwort finden.“', async () => {
  replies = ['[[react:👋]]'];
  const r = await agent('Hi');
  assert.equal(r.reaction, '👋');
  assert.doesNotMatch(r.out, /keine Antwort finden/);
});

test('Leere Antwort vom Modell → Agent X fragt einmal nach und liefert Text', async () => {
  replies = ['', 'Hi! Schön, dass du da bist – wobei kann ich helfen?'];
  asked.length = 0;
  const r = await agent('Hi');
  assert.equal(r.out, 'Hi! Schön, dass du da bist – wobei kann ich helfen?');
  assert.equal(asked.length, 2);
  assert.match(asked[1].messages.at(-1).content, /leer/);
  assert.ok(!asked[1].tools, 'Nachfrage ohne Werkzeuge');
});

test('Anweisung: Begrüßungen bekommen Text, nicht nur ein Emoji', async () => {
  replies = ['Hallo!'];
  asked.length = 0;
  await agent('Hallo');
  assert.match(asked[0].messages[0].content, /Begrüßungen[^\n]*IMMER mit einem kurzen, freundlichen Text/);
});

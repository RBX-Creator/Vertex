// Rangliste der Modelle (ohne Server, ohne Schlüssel)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.DATABASE_URL = `file:${join(mkdtempSync(join(tmpdir(), 'vais-rank-')), 'r.db')}`;
const { rankModels, RANKING } = await import('../src/models.js');

const m = (id, caps = ['text'], extra = {}) => ({ id, upstream: id.split(':').slice(1).join(':'), caps, ...extra });
// So sieht die Liste im November 2026 aus (Groq + Gemini + OpenRouter)
const LIVE = [
  m('groq:openai/gpt-oss-120b', ['text', 'code']),
  m('groq:openai/gpt-oss-120b#search', ['web']),
  m('groq:openai/gpt-oss-20b', ['text', 'code']),
  m('groq:qwen/qwen3.8-27b', ['text', 'code']),
  m('gemini:gemma-4-31b-it', ['text', 'code', 'vision']),
  m('gemini:gemma-4-26b-a4b-it', ['text', 'vision']),
  m('gemini:gemini-2.5-flash', ['text', 'code', 'vision']),
  m('gemini:gemini-3-flash', ['text', 'code', 'vision']),
  m('openrouter:thinkingmachines/inkling:free', ['text', 'code', 'vision']),
  m('openrouter:nvidia/nemotron-3-ultra-550b-a55b:free', ['text', 'code']),
  m('openrouter:nvidia/nemotron-3.5-super-vl:free', ['text', 'vision']),
  m('openrouter:some/paid-model', ['text'], { paid: true }),
];

test('Text/Experte: gpt-oss-120b → Gemma 4 31B → Inkling → Nemotron Ultra → Qwen', () => {
  assert.deepEqual(rankModels('smart', LIVE, { cap: 'text' }).slice(0, 5).map((x) => x.id), [
    'groq:openai/gpt-oss-120b', 'gemini:gemma-4-31b-it', 'openrouter:thinkingmachines/inkling:free',
    'openrouter:nvidia/nemotron-3-ultra-550b-a55b:free', 'groq:qwen/qwen3.8-27b',
  ]);
});

test('Bilder ansehen: Gemma 4 31B → Nemotron VL → neueste Gemini Flash', () => {
  assert.deepEqual(rankModels('vision', LIVE, { cap: 'vision' }).slice(0, 4).map((x) => x.id), [
    'gemini:gemma-4-31b-it', 'openrouter:nvidia/nemotron-3.5-super-vl:free', 'gemini:gemini-3-flash', 'gemini:gemini-2.5-flash',
  ]);
});

test('Helfer nehmen das schnelle Modell, volle und kostenpflichtige werden übersprungen', () => {
  assert.equal(rankModels('helper', LIVE)[0].id, 'groq:openai/gpt-oss-20b');
  const busy = LIVE.map((x) => (x.id === 'groq:openai/gpt-oss-20b' ? { ...x, busy: true } : x));
  assert.equal(rankModels('helper', busy)[0].id, 'gemini:gemma-4-26b-a4b-it');
  assert.ok(!rankModels('smart', LIVE).some((x) => x.paid));
});

test('Nur Groq (wie live): alles fällt sauber auf gpt-oss/Qwen zurück', () => {
  const groq = LIVE.filter((x) => x.id.startsWith('groq:'));
  assert.equal(rankModels('agent', groq)[0].id, 'groq:openai/gpt-oss-120b');
  assert.equal(rankModels('agentBackup', groq)[0].id, 'groq:qwen/qwen3.8-27b');
  assert.equal(rankModels('web', groq, { cap: 'web' })[0].id, 'groq:openai/gpt-oss-120b#search');
  assert.equal(rankModels('quick', groq)[0].id, 'groq:openai/gpt-oss-20b');
});

test('Keine abgeschalteten Groq-Modelle mehr in der Rangliste', () => {
  const all = Object.values(RANKING).flat().map(String).join(' ');
  for (const gone of ['compound', 'kimi', 'llama-3', 'llama-4', 'maverick', 'scout']) assert.ok(!all.includes(gone), gone);
});

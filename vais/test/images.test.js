// Bilderzeugung mit nachgebautem Backend: englischer Prompt, bestes Modell, Fallbacks
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.DATABASE_URL = `file:${join(mkdtempSync(join(tmpdir(), 'vais-img-')), 'i.db')}`;
for (const k of ['OPENROUTER_API_KEY', 'GEMINI_API_KEY', 'CEREBRAS_API_KEY', 'MISTRAL_API_KEY', 'POLLINATIONS_API_KEY', 'TOGETHER_API_KEY', 'DISABLE_FREE_IMAGES']) delete process.env[k];
process.env.GROQ_API_KEY = 'test-key-groq-0000000000';

const GERMAN = 'Erstelle mir ein Bild von einem glänzenden roten Sportwagen, der bei Dämmerlicht auf einer nassen Stadtstraße fährt, mit reflektierenden Lichtern und nassen Fahrbahnspuren, aus leicht schrägem Winkel aufgenommen, fotorealistischer Stil, hohe Kontraste und lebendige Farben.';
const ENGLISH = 'A glossy red sports car driving on a wet city street at dusk, reflecting lights and wet tire tracks, slightly angled low shot, photorealistic, high contrast, vivid colors';
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]);
const PNG_B64 = Buffer.from('png-bytes').toString('base64');

const seen = [];
const state = { llm: 'ok', together: 'ok' };
globalThis.fetch = async (url, opts = {}) => {
  const u = String(url);
  seen.push({ url: u, body: opts.body ? String(opts.body) : null });
  const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
  if (u === 'https://api.groq.com/openai/v1/models') return json({ data: [{ id: 'openai/gpt-oss-20b' }, { id: 'openai/gpt-oss-120b' }] });
  if (u.endsWith('/chat/completions')) {
    if (state.llm === 'fail') return json({ error: { message: 'kaputt' } }, 500);
    return json({ choices: [{ message: { role: 'assistant', content: `Prompt: "${ENGLISH}"` }, finish_reason: 'stop' }] });
  }
  if (u === 'https://image.pollinations.ai/models') return json(['sana', 'flux']);
  if (u.startsWith('https://image.pollinations.ai/prompt/')) return new Response(JPEG, { status: 200, headers: { 'Content-Type': 'image/jpeg' } });
  if (u === 'https://api.together.xyz/v1/images/generations') {
    if (state.together === 'limit') return json({ error: 'rate limit' }, 429);
    return json({ data: [{ b64_json: PNG_B64 }] });
  }
  return json({}, 404);
};

const models = await import('../src/models.js');
const { generateImage, imagePrompt, rankModels, listModels, strongImageProviders } = models;
const pollUrl = () => seen.filter((s) => s.url.startsWith('https://image.pollinations.ai/prompt/')).at(-1)?.url;

test('Ursache behoben: deutscher Prompt wird zu präzisem englischem Prompt (Hauptmotiv zuerst)', async () => {
  seen.length = 0;
  const img = await generateImage({ model: 'pollinations:sana', prompt: GERMAN });
  assert.match(img, /^data:image\/jpeg;base64,/);
  const llm = seen.find((s) => s.url.endsWith('/chat/completions'));
  assert.ok(llm, 'LLM wurde gefragt');
  assert.match(JSON.parse(llm.body).messages[0].content, /main subject/);
  assert.equal(JSON.parse(llm.body).messages[1].content, GERMAN); // nicht gekürzt
  const u = new URL(pollUrl());
  const sent = decodeURIComponent(u.pathname.replace('/prompt/', ''));
  assert.equal(sent, ENGLISH);
  assert.match(sent, /^A glossy red sports car/);
  assert.doesNotMatch(sent, /Sportwagen|Prompt:/);
  assert.equal(u.searchParams.get('width'), '1024');
  assert.equal(u.searchParams.get('height'), '1024');
  assert.equal(u.searchParams.get('nologo'), 'true');
  assert.equal(u.searchParams.get('enhance'), 'false');
});

test('Gleicher Prompt nochmal → aus dem Speicher, kein zweiter LLM-Aufruf', async () => {
  seen.length = 0;
  await imagePrompt(GERMAN);
  assert.equal(seen.filter((s) => s.url.endsWith('/chat/completions')).length, 0);
});

test('Bestes kostenloses Modell zuerst: Flux vor Sana', async () => {
  const ranked = rankModels('image', await listModels(), { cap: 'image' }).map((m) => m.id);
  assert.deepEqual(ranked, ['pollinations:flux', 'pollinations:sana']);
});

test('Mit TOGETHER_API_KEY: stärkeres Modell zuerst, englischer Prompt, 1024er Bild', async () => {
  process.env.TOGETHER_API_KEY = 'tg-test';
  seen.length = 0;
  assert.deepEqual(strongImageProviders(), ['together']);
  const img = await generateImage({ model: 'pollinations:flux', prompt: GERMAN });
  assert.equal(img, `data:image/png;base64,${PNG_B64}`);
  const call = JSON.parse(seen.find((s) => s.url.includes('together')).body);
  assert.equal(call.prompt, ENGLISH);
  assert.equal(call.width, 1024);
  assert.ok(!pollUrl(), 'Pollinations nicht nötig');
});

test('Stärkeres Modell am Limit → automatisch Pollinations, danach eine Weile übersprungen', async () => {
  state.together = 'limit';
  seen.length = 0;
  const img = await generateImage({ model: 'pollinations:flux', prompt: 'Ein Leuchtturm im Sturm' });
  assert.match(img, /^data:image\/jpeg/);
  assert.ok(pollUrl());
  seen.length = 0;
  await generateImage({ model: 'pollinations:flux', prompt: 'Ein Leuchtturm im Sturm' });
  assert.equal(seen.filter((s) => s.url.includes('together')).length, 0, 'Together pausiert');
  delete process.env.TOGETHER_API_KEY;
});

test('Bearbeiten mit Vorlage: Anweisung wird übersetzt, kein Wechsel des Anbieters', async () => {
  seen.length = 0;
  await generateImage({ model: 'pollinations:flux', prompt: 'Mach den Himmel lila', reference: 'https://vais.example/tmpimg/x' });
  const llm = JSON.parse(seen.find((s) => s.url.endsWith('/chat/completions')).body);
  assert.match(llm.messages[0].content, /edit instruction/);
  assert.match(pollUrl(), /image=https%3A%2F%2Fvais\.example/);
});

// zuletzt: macht die (nachgebauten) Modelle kurz „voll“
test('Umschreiben klappt nicht → Original wird verwendet (kein Fehler)', async () => {
  state.llm = 'fail';
  assert.equal(await imagePrompt('Ein blaues Fahrrad am Meer'), 'Ein blaues Fahrrad am Meer');
  state.llm = 'ok';
});

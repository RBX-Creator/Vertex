// Bilder mit GEMINI_API_KEY: Gemini-Bildmodell zuerst, ohne Kontingent → Pollinations
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.DATABASE_URL = `file:${join(mkdtempSync(join(tmpdir(), 'vais-imgg-')), 'g.db')}`;
for (const k of ['OPENROUTER_API_KEY', 'GROQ_API_KEY', 'CEREBRAS_API_KEY', 'MISTRAL_API_KEY', 'POLLINATIONS_API_KEY', 'TOGETHER_API_KEY', 'GEMINI_IMAGE_MODEL', 'DISABLE_FREE_IMAGES']) delete process.env[k];
process.env.GEMINI_API_KEY = 'test-gemini-key-000000000';

let geminiStatus = 200;
const seen = [];
globalThis.fetch = async (url, opts = {}) => {
  const u = String(url);
  seen.push({ url: u, body: opts.body ? String(opts.body) : null });
  const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
  if (u.startsWith('https://generativelanguage.googleapis.com/v1beta/models?')) {
    return json({ models: [
      { name: 'models/gemma-4-31b-it', supportedGenerationMethods: ['generateContent'] },
      { name: 'models/gemini-2.5-flash-image', supportedGenerationMethods: ['generateContent'] },
      { name: 'models/gemini-3-flash-image', supportedGenerationMethods: ['generateContent'] },
    ] });
  }
  if (u.endsWith('/chat/completions')) return json({ choices: [{ message: { content: 'A glossy red sports car on a wet city street at dusk' } }] });
  if (u.includes(':generateContent')) {
    if (geminiStatus !== 200) return json({ error: { message: 'quota' } }, geminiStatus);
    return json({ candidates: [{ content: { parts: [{ text: 'Hier' }, { inlineData: { mimeType: 'image/png', data: 'R0VNSU5J' } }] } }] });
  }
  if (u === 'https://image.pollinations.ai/models') return json(['flux']);
  if (u.startsWith('https://image.pollinations.ai/prompt/')) return new Response(Buffer.from([0xff, 0xd8, 0xff]), { status: 200, headers: { 'Content-Type': 'image/jpeg' } });
  return json({}, 404);
};

const { generateImage, strongImageProviders } = await import('../src/models.js');

test('Gemini-Schlüssel: neuestes Gemini-Bildmodell zuerst, mit englischem Prompt', async () => {
  assert.deepEqual(strongImageProviders(), ['gemini']);
  const img = await generateImage({ model: 'pollinations:flux', prompt: 'Ein roter Sportwagen auf nasser Straße' });
  assert.equal(img, 'data:image/png;base64,R0VNSU5J');
  const call = seen.find((s) => s.url.includes(':generateContent'));
  assert.match(call.url, /models\/gemini-3-flash-image:generateContent/);
  assert.match(JSON.parse(call.body).contents[0].parts[0].text, /^A glossy red sports car/);
  assert.ok(!seen.some((s) => s.url.startsWith('https://image.pollinations.ai/prompt/')));
});

test('Kein Gemini-Kontingent (429) → Pollinations, danach eine Stunde übersprungen', async () => {
  geminiStatus = 429;
  seen.length = 0;
  assert.match(await generateImage({ model: 'pollinations:flux', prompt: 'Ein Leuchtturm' }), /^data:image\/jpeg/);
  seen.length = 0;
  await generateImage({ model: 'pollinations:flux', prompt: 'Ein Leuchtturm' });
  assert.equal(seen.filter((s) => s.url.includes(':generateContent')).length, 0);
});

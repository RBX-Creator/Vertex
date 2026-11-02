// Schlüssel reihum + Verbrauch pro Schlüssel (mit nachgestelltem Anbieter)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.DATABASE_URL = `file:${join(mkdtempSync(join(tmpdir(), 'vais-keys-')), 'k.db')}`;
for (const k of ['OPENROUTER_API_KEY', 'GEMINI_API_KEY', 'CEREBRAS_API_KEY', 'MISTRAL_API_KEY']) delete process.env[k];
process.env.GROQ_API_KEY = 'gsk_aaaa1111,gsk_bbbb2222';

const used = [];
globalThis.fetch = async (url, opts = {}) => {
  const key = String(opts.headers?.Authorization ?? '').replace('Bearer ', '');
  if (String(url).includes('/chat/completions')) {
    used.push(key);
    return new Response(JSON.stringify({ choices: [{ message: { content: 'hi' }, finish_reason: 'stop' }] }), {
      status: 200,
      headers: { 'content-type': 'application/json', 'x-ratelimit-limit-requests': '1000', 'x-ratelimit-remaining-requests': '990', 'x-ratelimit-reset-requests': '2m59.5s', 'x-ratelimit-limit-tokens': '8000', 'x-ratelimit-remaining-tokens': '6500', 'x-ratelimit-reset-tokens': '7.5s' },
    });
  }
  return new Response(JSON.stringify({ data: [] }), { status: 200, headers: { 'content-type': 'application/json' } });
};

const m = await import('../src/models.js');

test('Schlüssel werden reihum benutzt und ihr Verbrauch gezählt', async () => {
  for (let i = 0; i < 4; i++) await m.complete({ model: 'groq:openai/gpt-oss-120b', messages: [{ role: 'user', content: 'x' }] });
  assert.deepEqual(new Set(used), new Set(['gsk_aaaa1111', 'gsk_bbbb2222']));
  assert.equal(used.filter((k) => k === 'gsk_aaaa1111').length, 2);
  const groq = m.keyStatus().find((p) => p.provider === 'groq');
  const k = groq.keys[0];
  assert.equal(k.usage.requests, 2);
  assert.equal(k.usage.limits.reqLeft, 990);
  assert.equal(k.usage.limits.tokLimit, 8000);
  assert.equal(k.usage.limits.reqReset, 179_500);
  assert.equal(k.usage.limits.tokReset, 7500);
  assert.ok(!JSON.stringify(groq).includes('gsk_aaaa1111')); // nur gekürzt
});

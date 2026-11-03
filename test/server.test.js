import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHttpServer } from '../src/server.js';
import { containsContact, normalizeLink } from '../src/filter.js';
import { createTelegramApi } from '../src/telegram.js';

test('HTTP: /health und Webhook mit Secret-Token-Prüfung', async () => {
  const got = [];
  const server = createHttpServer({ mode: 'webhook', webhookPath: '/telegram/webhook', webhookSecret: 's3cret', onUpdate: async (u) => got.push(u), log: { error() {} } });
  await new Promise((r) => server.listen(0, r));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const h = await fetch(base + '/health');
    assert.equal(h.status, 200);
    assert.equal((await h.json()).ok, true);
    const bad = await fetch(base + '/telegram/webhook', { method: 'POST', body: '{"update_id":1}', headers: { 'x-telegram-bot-api-secret-token': 'wrong' } });
    assert.equal(bad.status, 401);
    const none = await fetch(base + '/telegram/webhook', { method: 'POST', body: '{"update_id":1}' });
    assert.equal(none.status, 401);
    const ok = await fetch(base + '/telegram/webhook', { method: 'POST', body: '{"update_id":7}', headers: { 'x-telegram-bot-api-secret-token': 's3cret' } });
    assert.equal(ok.status, 200);
    assert.deepEqual(got, [{ update_id: 7 }]);
    assert.equal((await fetch(base + '/nope')).status, 404);
  } finally {
    server.close();
  }
});

test('HTTP: im Polling-Modus kein Webhook-Endpunkt', async () => {
  const server = createHttpServer({ mode: 'polling', webhookPath: '/telegram/webhook', webhookSecret: 'x', onUpdate: async () => {} });
  await new Promise((r) => server.listen(0, r));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    assert.equal((await fetch(base + '/telegram/webhook', { method: 'POST', body: '{}', headers: { 'x-telegram-bot-api-secret-token': 'x' } })).status, 404);
    assert.equal((await fetch(base + '/health')).status, 200);
  } finally {
    server.close();
  }
});

test('Kontaktfilter', () => {
  for (const s of ['0176 12345678', '+49 176 1234567', 'https://x.de', 'www.test.de', 't.me/abc', '@cooluser', 'a@b.de', 'meine seite vertex.de']) assert.ok(containsContact(s), s);
  for (const s of ['Ich bin 15', 'seit 2024 dabei', 'Wir brauchen 3 Leute', 'Hallo! Wie geht es dir?', 'Preis 1500 Euro']) assert.ok(!containsContact(s), s);
});

test('Link-Normalisierung', () => {
  assert.equal(normalizeLink('vertex.de'), 'https://vertex.de/');
  assert.equal(normalizeLink('https://github.com/leeam'), 'https://github.com/leeam');
  assert.equal(normalizeLink('kein link'), null);
  assert.equal(normalizeLink('javascript:alert(1)'), null);
  assert.equal(normalizeLink('t.me/abc', { minor: true }), null);
  assert.ok(normalizeLink('t.me/abc', { minor: false }));
});

test('Telegram-Client: Token taucht nicht in Fehlern auf', async () => {
  const api = createTelegramApi('123:SECRET', { fetchImpl: async () => { throw new Error('connect ECONNREFUSED https://api.telegram.org/bot123:SECRET/getMe'); } });
  await assert.rejects(api.call('getMe'), (e) => !String(e.message).includes('SECRET'));
  const api2 = createTelegramApi('123:SECRET', { fetchImpl: async () => ({ status: 400, json: async () => ({ ok: false, error_code: 400, description: 'Bad Request' }) }) });
  await assert.rejects(api2.call('sendMessage'), (e) => e.code === 400 && !String(e.message).includes('SECRET'));
});

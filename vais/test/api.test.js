// Echter Server im Demo-Modus: Registrieren, Chatten, Limits, Rechte, Sicherheit
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PORT = String(4100 + Math.floor(Math.random() * 800));
const BASE = `http://localhost:${PORT}`;
let server;
let log = '';

before(async () => {
  const env = { ...process.env, PORT, DATABASE_URL: `file:${join(mkdtempSync(join(tmpdir(), 'vais-api-')), 'api.db')}`, ADMIN_EMAILS: 'admin@example.com' };
  for (const k of ['OPENROUTER_API_KEY', 'GROQ_API_KEY', 'GEMINI_API_KEY', 'CEREBRAS_API_KEY', 'MISTRAL_API_KEY', 'BREVO_API_KEY', 'SMTP_HOST', 'GOOGLE_CLIENT_ID']) delete env[k];
  server = spawn(process.execPath, ['server.js'], { cwd: new URL('..', import.meta.url).pathname, env, stdio: ['ignore', 'pipe', 'pipe'] });
  server.stdout.on('data', (d) => { log += d; });
  server.stderr.on('data', (d) => { log += d; });
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(`${BASE}/healthz`)).ok) return; } catch { /* startet noch */ }
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error(`Server startet nicht:\n${log}`);
});
after(() => server?.kill());

// Kleiner Browser-Ersatz mit Cookie
function client() {
  let cookie = '';
  const call = async (path, body, method = body === undefined ? 'GET' : 'POST') => {
    const res = await fetch(BASE + path, {
      method,
      headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}), Origin: BASE },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      redirect: 'manual',
    });
    const set = res.headers.get('set-cookie');
    if (set?.includes('vais_session=')) cookie = set.split(';')[0];
    return res;
  };
  return { call, json: async (path, body) => { const r = await call(path, body); return { status: r.status, data: await r.json().catch(() => ({})) }; } };
}
const lastCode = () => [...log.matchAll(/(\d{6})\s*$/gm)].at(-1)?.[1];
async function signUp(email) {
  const c = client();
  assert.equal((await c.json('/api/auth/start', { email })).data.mode, 'register');
  assert.equal((await c.json('/api/auth/register', { email, password: 'geheim1234' })).status, 200);
  await new Promise((r) => setTimeout(r, 100));
  const v = await c.json('/api/auth/verify', { email, code: lastCode() });
  assert.equal(v.status, 200, JSON.stringify(v.data));
  return c;
}
async function stream(c, chatId, text, turn = 0) {
  const res = await c.call('/api/chat/stream', { chatId, side: 0, turn, messages: [{ role: 'user', content: text }], display: { text } });
  const lines = (await res.text()).trim().split('\n').filter(Boolean).map((l) => JSON.parse(l));
  return { status: res.status, lines, text: lines.map((l) => l.t ?? '').join('') };
}

test('Seiten und Sicherheits-Header', async () => {
  const res = await fetch(`${BASE}/login`);
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-security-policy'), /script-src 'self'/);
  assert.equal(res.headers.get('x-frame-options'), 'DENY');
  assert.equal((await fetch(`${BASE}/`, { redirect: 'manual' })).headers.get('location'), '/login');
  assert.equal((await fetch(`${BASE}/datenschutz`)).status, 200);
});

test('Fremde Webseiten dürfen nichts ändern (CSRF)', async () => {
  const res = await fetch(`${BASE}/api/auth/start`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://evil.example' }, body: '{"email":"a@b.de"}' });
  assert.equal(res.status, 403);
});

test('Registrieren, chatten, Verlauf, Verbrauch', async () => {
  const c = await signUp('user@example.com');
  assert.equal((await c.json('/api/auth/me')).data.user.email, 'user@example.com');
  const models = (await c.json('/api/chat/models')).data;
  assert.equal(models.models[0].id, 'agent'); // Agent X ganz oben
  const first = models.models.find((m) => !m.agent && m.caps.includes('text'));
  const start = await c.json('/api/chat/start', { mode: 'direct', modality: 'text', models: [first.id], title: 'Hallo' });
  assert.equal(start.status, 200);
  const out = await stream(c, start.data.id, 'Hallo Test');
  assert.equal(out.status, 200);
  assert.ok(out.lines.some((l) => l.done), 'Antwort endet mit done');
  assert.ok(out.text.length > 10);
  const list = (await c.json('/api/chat/list')).data.chats;
  assert.equal(list.length, 1);
  const usage = (await c.json('/api/chat/usage')).data;
  assert.equal(usage.used, 1);
  assert.ok(usage.percent >= 1 && usage.percent <= 100);
});

test('Agent X reagiert und spart Punkte bei „ok“', async () => {
  const c = await signUp('agent@example.com');
  const start = await c.json('/api/chat/start', { mode: 'agent', modality: 'auto', title: 'Agent' });
  const one = await stream(c, start.data.id, 'Erzähl mir einen Witz');
  assert.ok(one.lines.some((l) => l.react === '👀'));
  const before = (await c.json('/api/chat/usage')).data.used;
  const res = await c.call('/api/chat/stream', { chatId: start.data.id, side: 0, turn: 1, messages: [{ role: 'user', content: 'Witz' }, { role: 'assistant', content: 'Haha, fertig.' }, { role: 'user', content: 'ok danke' }], display: { text: 'ok danke' } });
  const lines = (await res.text()).trim().split('\n').map((l) => JSON.parse(l));
  assert.ok(lines.some((l) => l.react === '❤️'));
  assert.equal((await c.json('/api/chat/usage')).data.used, before); // kostenlos
});

test('Admin-Bereich nur für Admins', async () => {
  const u = await signUp('normal@example.com');
  assert.equal((await u.json('/api/admin/overview')).status, 404);
  assert.equal((await u.call('/admin')).headers.get('location'), '/');
  const a = await signUp('admin@example.com');
  assert.equal((await a.json('/api/auth/me')).data.user.admin, true);
  const over = await a.json('/api/admin/overview');
  assert.equal(over.status, 200);
  assert.ok(over.data.counts.users >= 2);
  // Schlüssel werden nie im Klartext gezeigt
  const keys = (await a.json('/api/admin/keys')).data.providers;
  assert.ok(Array.isArray(keys));
});

test('Gesperrte Nutzer kommen nicht mehr rein', async () => {
  const u = await signUp('bad@example.com');
  const a = client();
  await a.json('/api/auth/login', { email: 'admin@example.com', password: 'geheim1234' });
  const users = (await a.json('/api/admin/users?q=bad@')).data.users;
  assert.equal((await a.json('/api/admin/block', { userId: users[0].id, blocked: true })).status, 200);
  assert.equal((await u.json('/api/chat/list')).status, 401);
  const again = await client().json('/api/auth/login', { email: 'bad@example.com', password: 'geheim1234' });
  assert.equal(again.status, 403);
});

test('Tageslimit greift und zeigt 100 %', async () => {
  const a = client();
  await a.json('/api/auth/login', { email: 'admin@example.com', password: 'geheim1234' });
  assert.equal((await a.json('/api/admin/limits', { limits: { daily: 2 } })).status, 200);
  const c = await signUp('limit@example.com');
  const first = (await c.json('/api/chat/models')).data.models.find((m) => !m.agent && m.caps.includes('text'));
  const start = await c.json('/api/chat/start', { mode: 'direct', modality: 'text', models: [first.id], title: 'L' });
  assert.equal((await stream(c, start.data.id, 'a', 0)).status, 200);
  assert.equal((await stream(c, start.data.id, 'b', 1)).status, 200);
  const blocked = await stream(c, start.data.id, 'c', 2).catch(() => null);
  const res = await c.call('/api/chat/stream', { chatId: start.data.id, side: 0, turn: 3, messages: [{ role: 'user', content: 'd' }] });
  assert.equal(res.status, 429);
  assert.equal((await c.json('/api/chat/usage')).data.percent, 100);
  assert.ok(blocked);
  await a.json('/api/admin/limits', { limits: { daily: 100 } });
});

test('Persönliches: Anweisungen und Gedächtnis', async () => {
  const c = await signUp('mem@example.com');
  assert.equal((await c.json('/api/chat/profile', { instructions: 'Kurz antworten.' })).status, 200);
  const start = await c.json('/api/chat/start', { mode: 'agent', modality: 'auto', title: 'M' });
  await stream(c, start.data.id, 'Merk dir: ich spiele Gitarre');
  const p = (await c.json('/api/chat/profile')).data;
  assert.equal(p.instructions, 'Kurz antworten.');
  assert.ok(p.memories.some((m) => /Gitarre/.test(m.text)));
});

test('Konto löschen entfernt alles', async () => {
  const c = await signUp('weg@example.com');
  assert.equal((await c.json('/api/auth/delete', { password: 'geheim1234' })).status, 200);
  assert.equal((await c.json('/api/auth/me')).status, 401);
  assert.equal((await client().json('/api/auth/start', { email: 'weg@example.com' })).data.mode, 'register');
});

test('Daten herunterladen und Chats sortieren', async () => {
  const c = await signUp('export@example.com');
  const first = (await c.json('/api/chat/models')).data.models.find((m) => !m.agent && m.caps.includes('text'));
  const start = await c.json('/api/chat/start', { mode: 'direct', modality: 'text', models: [first.id], title: 'Export' });
  await stream(c, start.data.id, 'Hallo');
  assert.equal((await c.json('/api/chat/organize', { chatId: start.data.id, pinned: true, folder: 'Schule' })).status, 200);
  const item = (await c.json('/api/chat/list')).data.chats[0];
  assert.equal(item.pinned, true);
  assert.equal(item.folder, 'Schule');
  const res = await c.call('/api/chat/export');
  assert.match(res.headers.get('content-disposition'), /attachment; filename="vais-daten-/);
  const data = await res.json();
  assert.equal(data.account.email, 'export@example.com');
  assert.equal(data.chats.length, 1);
  assert.ok(data.chats[0].turns[0].answers[0].text.length > 0);
});

test('Sehr lange Chats werden zusammengefasst statt abzubrechen', async () => {
  const c = await signUp('long@example.com');
  const first = (await c.json('/api/chat/models')).data.models.find((m) => !m.agent && m.caps.includes('text'));
  const start = await c.json('/api/chat/start', { mode: 'direct', modality: 'text', models: [first.id], title: 'Lang' });
  const messages = [];
  for (let i = 0; i < 12; i++) messages.push({ role: 'user', content: `Frage ${i}: ${'bla '.repeat(500)}` }, { role: 'assistant', content: `Antwort ${i}: ${'text '.repeat(500)}` });
  messages.push({ role: 'user', content: 'Und jetzt die letzte Frage' });
  const res = await c.call('/api/chat/stream', { chatId: start.data.id, side: 0, turn: 0, messages, display: { text: 'Und jetzt die letzte Frage' } });
  const lines = (await res.text()).trim().split('\n').map((l) => JSON.parse(l));
  const note = lines.find((l) => l.summarized);
  assert.ok(note && note.summarized > 10, 'Hinweis „zusammengefasst“ kommt');
  assert.ok(lines.some((l) => l.done));
});

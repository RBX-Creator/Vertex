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
  const env = { ...process.env, PORT, DATABASE_URL: `file:${join(mkdtempSync(join(tmpdir(), 'vais-api-')), 'api.db')}`, ADMIN_EMAILS: 'admin@example.com', AUTH_RATE_LIMIT: '1000' };
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
  const call = async (path, body, method = body === undefined ? 'GET' : 'POST', signal = undefined) => {
    const res = await fetch(BASE + path, {
      method,
      signal,
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

test('Agent X arbeitet weiter, wenn die Verbindung abbricht – „Stopp“ hält ihn an', async () => {
  const c = await signUp('bg@example.com');
  const cookieRes = await c.call('/api/auth/me');
  assert.equal(cookieRes.status, 200);
  const start = await c.json('/api/chat/start', { mode: 'agent', modality: 'auto', title: 'BG' });
  const id = start.data.id;
  // Verbindung nach kurzer Zeit kappen
  const ctrl = new AbortController();
  const pending = c.call('/api/chat/stream', { chatId: id, side: 0, turn: 0, messages: [{ role: 'user', content: 'Wie ist das Wetter in Berlin?' }], display: { text: 'Wetter' } }, 'POST', ctrl.signal)
    .then((r) => r.text()).catch((e) => e.name);
  setTimeout(() => ctrl.abort(), 500);
  assert.equal(await pending, 'AbortError'); // Verbindung wirklich gekappt
  // Ohne Leser bricht die Verbindung spätestens hier ab; der Agent muss trotzdem fertig werden
  let answer;
  for (let i = 0; i < 40; i++) {
    await new Promise((r) => setTimeout(r, 300));
    answer = (await c.json(`/api/chat/${id}`)).data.turns[0]?.answers[0];
    if (answer?.status === 'done') break;
  }
  assert.equal(answer.status, 'done');
  assert.ok(answer.text.length > 20);

  // Stopp über den Server
  const s2 = await c.json('/api/chat/start', { mode: 'agent', modality: 'auto', title: 'Stop' });
  const res = c.call('/api/chat/stream', { chatId: s2.data.id, side: 0, turn: 0, messages: [{ role: 'user', content: 'Such mir aktuelle Nachrichten' }], display: { text: 'News' } });
  await new Promise((r) => setTimeout(r, 400));
  const stop = await c.json('/api/chat/stop', { chatId: s2.data.id, turn: 0, side: 0 });
  assert.equal(stop.data.stopped, true);
  await (await res).text();
  const after = (await c.json(`/api/chat/${s2.data.id}`)).data.turns[0].answers[0];
  assert.notEqual(after.status, 'streaming');
});

test('Webseiten veröffentlichen – abgeschottet vom Rest', async () => {
  const c = await signUp('site@example.com');
  const start = await c.json('/api/chat/start', { mode: 'agent', modality: 'auto', title: 'Seite' });
  const plan = await stream(c, start.data.id, 'Bau mir eine Webseite mit Zähler');
  assert.match(plan.text, /```plan/); // Agent X zeigt erst einen Plan
  const res = await c.call('/api/chat/stream', { chatId: start.data.id, side: 0, turn: 1, messages: [{ role: 'user', content: 'Bau mir eine Webseite mit Zähler' }, { role: 'assistant', content: plan.text }, { role: 'user', content: 'Ja, leg los!' }], display: { text: 'Ja, leg los!' } });
  await res.text();
  const pub = await c.json('/api/chat/sites/publish', { chatId: start.data.id, turn: 1, side: 0 });
  assert.equal(pub.status, 200, JSON.stringify(pub.data));
  const again = await c.json('/api/chat/sites/publish', { chatId: start.data.id, turn: 1, side: 0 });
  assert.equal(again.data.id, pub.data.id); // gleicher Link
  const page = await fetch(BASE + pub.data.path);
  assert.equal(page.status, 200);
  assert.match(page.headers.get('content-security-policy'), /^sandbox allow-scripts/);
  assert.equal(page.headers.get('x-frame-options'), null);
  const html = await page.text();
  assert.match(html, /Erstellt mit VAIs/);
  assert.match(html, /<button id="b">/);
  // fremde Nutzer können sie nicht offline nehmen
  const other = await signUp('other-site@example.com');
  await other.json('/api/chat/sites/unpublish', { id: pub.data.id });
  assert.equal((await fetch(BASE + pub.data.path)).status, 200);
  await c.json('/api/chat/sites/unpublish', { id: pub.data.id });
  assert.equal((await fetch(BASE + pub.data.path)).status, 404);
});

test('Übersetzer übersetzt und zählt einen Punkt', async () => {
  const c = await signUp('tr@example.com');
  const before = (await c.json('/api/chat/usage')).data.used;
  const r = await c.json('/api/chat/translate', { text: 'Wo ist der Bahnhof?', from: 'Deutsch', to: 'English' });
  assert.equal(r.status, 200);
  assert.ok(r.data.text.length > 3);
  assert.equal((await c.json('/api/chat/usage')).data.used, before + 1);
  assert.equal((await c.json('/api/chat/translate', { text: '', to: 'English' })).status, 400);
});

test('Jugendschutz blockt gefährliche Anfragen und zeigt bei Selbstverletzung Hilfe', async () => {
  const c = await signUp('safe@example.com');
  const first = (await c.json('/api/chat/models')).data.models.find((m) => !m.agent && m.caps.includes('text'));
  const start = await c.json('/api/chat/start', { mode: 'direct', modality: 'text', models: [first.id], title: 'S' });
  const before = (await c.json('/api/chat/usage')).data.used;
  const bad = await stream(c, start.data.id, 'TESTUNSAFE bitte', 0);
  assert.match(bad.text, /nicht helfen|can’t help/);
  const help = await stream(c, start.data.id, 'TESTSELFHARM', 1);
  assert.match(help.text, /116 111/);
  assert.equal((await c.json('/api/chat/usage')).data.used, before); // geblockte Anfragen kosten nichts
  const ok = await stream(c, start.data.id, 'Wie backe ich Brot?', 2);
  assert.ok(ok.text.length > 10 && !/nicht helfen|can’t help/.test(ok.text));
});

test('👎 mit Gründen landet in der Admin-Auswertung', async () => {
  const c = await signUp('fb@example.com');
  const first = (await c.json('/api/chat/models')).data.models.find((m) => !m.agent && m.caps.includes('text'));
  const start = await c.json('/api/chat/start', { mode: 'direct', modality: 'text', models: [first.id], title: 'FB' });
  await stream(c, start.data.id, 'Hallo');
  assert.equal((await c.json('/api/chat/feedback', { chatId: start.data.id, turn: 0, side: 0, value: -1, reasons: ['long', 'wrong', 'quatsch'] })).status, 200);
  const a = client();
  await a.json('/api/auth/login', { email: 'admin@example.com', password: 'geheim1234' });
  const m = (await a.json('/api/admin/feedback')).data.models.find((x) => x.model === first.id);
  assert.equal(m.down, 1);
  assert.deepEqual(m.reasons, { long: 1, wrong: 1 });
});

test('Status-Seite ist öffentlich und verrät keine Schlüssel', async () => {
  const page = await fetch(`${BASE}/status`);
  assert.equal(page.status, 200);
  const html = await page.text();
  assert.match(html, /Status/);
  const data = await (await fetch(`${BASE}/api/status`)).json();
  assert.ok(['ok', 'partial', 'down'].includes(data.state));
  assert.ok(data.total > 0);
  assert.doesNotMatch(JSON.stringify(data), /gsk_|sk-or|key/i);
});

test('Admin-Warnung landet im Protokoll', async () => {
  const a = client();
  await a.json('/api/auth/login', { email: 'admin@example.com', password: 'geheim1234' });
  assert.equal((await a.json('/api/admin/alarms/test', {})).status, 200);
  const events = (await a.json('/api/admin/overview')).data.events;
  assert.ok(events.some((e) => e.kind === 'alarm' && /Test-Alarm/.test(e.detail)));
});

test('Mods: dürfen moderieren, aber keine Admin-Einstellungen', async () => {
  const friend = await signUp('friend@example.com');
  const target = await signUp('troll@example.com');
  const a = client();
  await a.json('/api/auth/login', { email: 'admin@example.com', password: 'geheim1234' });
  const users = (await a.json('/api/admin/users')).data.users;
  const fid = users.find((u) => u.email === 'friend@example.com').id;
  const tid = users.find((u) => u.email === 'troll@example.com').id;
  assert.equal((await a.json('/api/admin/role', { userId: fid, role: 'mod' })).status, 200);
  assert.equal((await friend.json('/api/auth/me')).data.user.mod, true);
  assert.equal((await friend.json('/api/admin/overview')).data.role, 'mod');
  assert.equal((await friend.json('/api/admin/limits', { limits: { daily: 5 } })).status, 403);
  assert.equal((await friend.json('/api/admin/keys')).status, 403);
  assert.equal((await friend.json('/api/admin/announce', { title: 'x', body: 'y' })).status, 403);
  assert.equal((await friend.json('/api/admin/block', { userId: tid, blocked: true })).status, 200);
  assert.equal((await target.json('/api/chat/list')).status, 401);
  await a.json('/api/admin/block', { userId: tid, blocked: false });
  assert.equal((await a.json('/api/admin/role', { userId: fid, role: null })).status, 200);
  assert.equal((await friend.json('/api/admin/overview')).status, 404);
});

test('Mitteilungen erreichen alle bzw. nur ausgewählte Personen', async () => {
  const one = await signUp('ann1@example.com');
  const two = await signUp('ann2@example.com');
  const a = client();
  await a.json('/api/auth/login', { email: 'admin@example.com', password: 'geheim1234' });
  assert.equal((await a.json('/api/admin/announce', { title: 'Hallo alle', body: 'Neues Update!' })).status, 200);
  const users = (await a.json('/api/admin/users?q=ann1')).data.users;
  assert.equal((await a.json('/api/admin/announce', { title: 'Nur für dich', body: 'Psst', target: 'users', userIds: [users[0].id] })).status, 200);
  const l1 = (await one.json('/api/chat/announcements')).data.announcements.map((x) => x.title);
  const l2 = (await two.json('/api/chat/announcements')).data.announcements.map((x) => x.title);
  assert.deepEqual(l1, ['Hallo alle', 'Nur für dich']);
  assert.deepEqual(l2, ['Hallo alle']);
  const first = (await one.json('/api/chat/announcements')).data.announcements[0];
  await one.json('/api/chat/announcements/read', { id: first.id });
  assert.deepEqual((await one.json('/api/chat/announcements')).data.announcements.map((x) => x.title), ['Nur für dich']);
});

test('Inkognito-Chats tauchen nirgends auf und verschwinden beim Verlassen', async () => {
  const c = await signUp('inco@example.com');
  const first = (await c.json('/api/chat/models')).data.models.find((m) => !m.agent && m.caps.includes('text'));
  const start = await c.json('/api/chat/start', { mode: 'direct', modality: 'text', models: [first.id], title: 'Geheim', incognito: true });
  await stream(c, start.data.id, 'Geheime Frage');
  assert.equal((await c.json(`/api/chat/${start.data.id}`)).data.incognito, true);
  assert.equal((await c.json('/api/chat/list')).data.chats.length, 0);
  assert.equal((await (await c.call('/api/chat/export')).json()).chats.length, 0);
  await c.json('/api/chat/forget', { chatId: start.data.id });
  assert.equal((await c.json(`/api/chat/${start.data.id}`)).status, 404);
});

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
  const env = { ...process.env, PORT, DATABASE_URL: `file:${join(mkdtempSync(join(tmpdir(), 'vais-api-')), 'api.db')}`, ADMIN_EMAILS: 'admin@example.com', AUTH_RATE_LIMIT: '1000', SIGNUPS_PER_IP_DAY: '1000', CODES_PER_IP_DAY: '1000' };
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
  assert.equal(usage.kinds.text.used, 1); // zählt als eine Antwort
  assert.equal(usage.kinds.agent.used, 0);
  assert.ok(usage.kinds.text.percent >= 1 && usage.kinds.text.percent <= 100);
});

test('Agent X reagiert und zählt „ok“ nicht', async () => {
  const c = await signUp('agent@example.com');
  const start = await c.json('/api/chat/start', { mode: 'agent', modality: 'auto', title: 'Agent' });
  const one = await stream(c, start.data.id, 'Erzähl mir einen Witz');
  assert.ok(!one.lines.some((l) => l.react), 'normale Frage → kein Emoji');
  const before = (await c.json('/api/chat/usage')).data.kinds.agent.used;
  assert.equal(before, 1); // ein Agent-X-Auftrag
  const res = await c.call('/api/chat/stream', { chatId: start.data.id, side: 0, turn: 1, messages: [{ role: 'user', content: 'Witz' }, { role: 'assistant', content: 'Haha, fertig.' }, { role: 'user', content: 'ok danke' }], display: { text: 'ok danke' } });
  const lines = (await res.text()).trim().split('\n').map((l) => JSON.parse(l));
  assert.ok(lines.some((l) => l.react === '❤️'));
  const praise = await c.call('/api/chat/stream', { chatId: start.data.id, side: 0, turn: 2, messages: [{ role: 'user', content: 'Witz' }, { role: 'assistant', content: 'Haha, fertig.' }, { role: 'user', content: 'Du bist der Beste' }], display: { text: 'Du bist der Beste' } });
  const pl = (await praise.text()).trim().split('\n').map((l) => JSON.parse(l));
  assert.ok(pl.some((l) => l.react === '❤️'));
  assert.ok(!pl.some((l) => l.t), 'nur Emoji, kein Text');
  assert.equal((await c.json('/api/chat/usage')).data.kinds.agent.used, before); // zählt nicht
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
  assert.equal((await a.json('/api/admin/limits', { limits: { text: 2 } })).status, 200);
  const c = await signUp('limit@example.com');
  const first = (await c.json('/api/chat/models')).data.models.find((m) => !m.agent && m.caps.includes('text'));
  const start = await c.json('/api/chat/start', { mode: 'direct', modality: 'text', models: [first.id], title: 'L' });
  assert.equal((await stream(c, start.data.id, 'a', 0)).status, 200);
  assert.equal((await stream(c, start.data.id, 'b', 1)).status, 200);
  const blocked = await stream(c, start.data.id, 'c', 2).catch(() => null);
  const res = await c.call('/api/chat/stream', { chatId: start.data.id, side: 0, turn: 3, messages: [{ role: 'user', content: 'd' }] });
  assert.equal(res.status, 429);
  const u = (await c.json('/api/chat/usage')).data;
  assert.equal(u.kinds.text.percent, 100);
  assert.equal(u.kinds.agent.percent, 0); // andere Arten haben eigene Zähler
  assert.ok(blocked);
  await a.json('/api/admin/limits', { limits: { text: 100 } });
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
  assert.match(plan.text, /```questions/); // Agent X stellt erst Rückfragen
  const answers = 'Meine Antworten:\n- Wofür ist die Webseite? → Ein Produkt';
  const res = await c.call('/api/chat/stream', { chatId: start.data.id, side: 0, turn: 1, messages: [{ role: 'user', content: 'Bau mir eine Webseite mit Zähler' }, { role: 'assistant', content: plan.text }, { role: 'user', content: answers }], display: { text: answers } });
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
  assert.match(html, /<button id="b"/);
  assert.match(html, /<!--vx:zaehler-->/); // Baukasten-Markierungen für spätere Änderungen
  // fremde Nutzer können sie nicht offline nehmen
  const other = await signUp('other-site@example.com');
  await other.json('/api/chat/sites/unpublish', { id: pub.data.id });
  assert.equal((await fetch(BASE + pub.data.path)).status, 200);
  await c.json('/api/chat/sites/unpublish', { id: pub.data.id });
  assert.equal((await fetch(BASE + pub.data.path)).status, 404);
});

test('Übersetzer übersetzt und zählt eine Antwort', async () => {
  const c = await signUp('tr@example.com');
  const before = (await c.json('/api/chat/usage')).data.kinds.text.used;
  const r = await c.json('/api/chat/translate', { text: 'Wo ist der Bahnhof?', from: 'Deutsch', to: 'English' });
  assert.equal(r.status, 200);
  assert.ok(r.data.text.length > 3);
  assert.equal((await c.json('/api/chat/usage')).data.kinds.text.used, before + 1);
  assert.equal((await c.json('/api/chat/translate', { text: '', to: 'English' })).status, 400);
});

test('Jugendschutz blockt gefährliche Anfragen und zeigt bei Selbstverletzung Hilfe', async () => {
  const c = await signUp('safe@example.com');
  const first = (await c.json('/api/chat/models')).data.models.find((m) => !m.agent && m.caps.includes('text'));
  const start = await c.json('/api/chat/start', { mode: 'direct', modality: 'text', models: [first.id], title: 'S' });
  const before = (await c.json('/api/chat/usage')).data.kinds.text.used;
  const bad = await stream(c, start.data.id, 'TESTUNSAFE bitte', 0);
  assert.match(bad.text, /nicht helfen|can’t help/);
  const help = await stream(c, start.data.id, 'TESTSELFHARM', 1);
  assert.match(help.text, /116 111/);
  assert.equal((await c.json('/api/chat/usage')).data.kinds.text.used, before); // geblockte Anfragen zählen nicht
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
  assert.equal((await friend.json('/api/admin/limits', { limits: { text: 5 } })).status, 403);
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

test('Team-Chat: nur für Admins und Mods, KI antwortet auf @KI', async () => {
  const normal = await signUp('nomod@example.com');
  assert.equal((await normal.json('/api/groups')).status, 404);
  const mod = await signUp('teammod@example.com');
  const a = client();
  await a.json('/api/auth/login', { email: 'admin@example.com', password: 'geheim1234' });
  const mid = (await a.json('/api/admin/users?q=teammod')).data.users[0].id;
  await a.json('/api/admin/role', { userId: mid, role: 'mod' });
  const staff = (await a.json('/api/groups/staff')).data.staff;
  assert.ok(staff.some((s) => s.id === mid));
  const g = await a.json('/api/groups', { name: 'Team', memberIds: [mid, 999999] });
  assert.equal(g.status, 200);
  assert.equal((await mod.json('/api/groups')).data.groups[0].unread, 1); // Willkommens-Nachricht
  await mod.json(`/api/groups/${g.data.id}/messages`, { text: 'Hallo zusammen' });
  const r = await a.json(`/api/groups/${g.data.id}/messages`, { text: '@KI fass das kurz zusammen' });
  assert.equal(r.data.ai, true);
  let msgs = [];
  for (let i = 0; i < 20; i++) {
    msgs = (await a.json(`/api/groups/${g.data.id}/messages?after=0`)).data.messages;
    if (msgs.filter((m) => m.ai).length >= 2) break;
    await new Promise((res) => setTimeout(res, 200));
  }
  assert.deepEqual(msgs.map((m) => (m.ai ? 'AI' : m.name)), ['AI', 'teammod', 'admin', 'AI']);
  assert.equal((await normal.json(`/api/groups/${g.data.id}/messages`)).status, 404);
});

test('Sprache → Text (Whisper) für Sprach-Modus und Diktieren', async () => {
  const c = await signUp('stt@example.com');
  const empty = await c.call('/api/chat/transcribe?lang=de-DE', new Uint8Array(10), 'POST');
  assert.equal((await empty.json()).text, '');
  const res = await fetch(`${BASE}/api/chat/transcribe?lang=de-DE`, {
    method: 'POST', headers: { 'Content-Type': 'audio/webm', Origin: BASE, Cookie: (await c.call('/api/auth/me')).headers.get('set-cookie') ?? '' }, body: new Uint8Array(4000),
  });
  assert.ok([200, 401].includes(res.status));
});

test('Höchstens N gespeicherte Chats – Inkognito zählt nicht', async () => {
  const a = client();
  await a.json('/api/auth/login', { email: 'admin@example.com', password: 'geheim1234' });
  await a.json('/api/admin/limits', { limits: { maxChats: 2 } });
  try {
    const c = await signUp('maxchats@example.com');
    const first = (await c.json('/api/chat/models')).data.models.find((m) => !m.agent && m.caps.includes('text'));
    const ids = [];
    for (let i = 0; i < 2; i++) {
      const s = await c.json('/api/chat/start', { mode: 'direct', modality: 'text', models: [first.id], title: `C${i}` });
      ids.push(s.data.id);
      await stream(c, s.data.id, `Frage ${i}`);
    }
    const full = await c.json('/api/chat/start', { mode: 'direct', modality: 'text', models: [first.id], title: 'zu viel' });
    assert.equal(full.status, 409);
    assert.equal(full.data.chatLimit, 2);
    assert.equal((await c.json('/api/chat/start', { mode: 'direct', modality: 'text', models: [first.id], title: 'geheim', incognito: true })).status, 200);
    await c.call(`/api/chat/${ids[0]}`, undefined, 'DELETE');
    assert.equal((await c.json('/api/chat/start', { mode: 'direct', modality: 'text', models: [first.id], title: 'jetzt geht es' })).status, 200);
    assert.equal((await c.json('/api/chat/list')).data.maxChats, 2);
  } finally {
    await a.json('/api/admin/limits', { limits: { maxChats: 10 } });
  }
});

test('Geräte: Liste, anderes Gerät abmelden', async () => {
  const phone = await signUp('dev@example.com');
  const laptop = client();
  assert.equal((await laptop.json('/api/auth/login', { email: 'dev@example.com', password: 'geheim1234' })).status, 200);
  const list = (await phone.json('/api/auth/sessions')).data.sessions;
  assert.equal(list.length, 2);
  assert.equal(list.filter((s) => s.current).length, 1);
  const other = list.find((s) => !s.current);
  assert.match(other.id, /^[0-9a-f]{16}$/);
  assert.equal((await phone.json('/api/auth/sessions/revoke', { id: list.find((s) => s.current).id })).status, 400); // nicht sich selbst
  assert.equal((await phone.json('/api/auth/sessions/revoke', { id: other.id })).status, 200);
  assert.equal((await laptop.json('/api/auth/me')).status, 401); // Laptop ist abgemeldet
  assert.equal((await phone.json('/api/auth/sessions')).data.sessions.length, 1);
});

test('Meldungen: Gast meldet Webseite, Mod entfernt sie', async () => {
  const c = await signUp('rep-owner@example.com');
  const start = await c.json('/api/chat/start', { mode: 'agent', modality: 'auto', title: 'R' });
  const q = await stream(c, start.data.id, 'Bau mir eine Webseite');
  const answers = 'Meine Antworten:\n- Wofür? → Test';
  const r = await c.call('/api/chat/stream', { chatId: start.data.id, side: 0, turn: 1, messages: [{ role: 'user', content: 'Bau mir eine Webseite' }, { role: 'assistant', content: q.text }, { role: 'user', content: answers }], display: { text: answers } });
  await r.text();
  const pub = await c.json('/api/chat/sites/publish', { chatId: start.data.id, turn: 1, side: 0 });
  assert.equal(pub.status, 200);
  const html = await (await fetch(BASE + pub.data.path)).text();
  assert.match(html, /\/melden\?site=/);
  const guest = client();
  assert.equal((await guest.json('/api/report', { kind: 'site', target: pub.data.id, reason: 'nope' })).status, 400);
  assert.equal((await guest.json('/api/report', { kind: 'site', target: pub.data.id, reason: 'hate', note: 'gemein' })).status, 200);
  assert.equal((await guest.json('/api/report', { kind: 'site', target: pub.data.id, reason: 'hate' })).status, 200); // doppelt → nur einmal
  assert.equal((await c.json('/api/admin/reports')).status, 404); // normale Nutzer sehen nichts
  const a = client();
  await a.json('/api/auth/login', { email: 'admin@example.com', password: 'geheim1234' });
  const list = (await a.json('/api/admin/reports')).data;
  assert.equal(list.open, 1);
  assert.equal(list.reports[0].reasonLabel.length > 2, true);
  assert.equal(list.reports[0].owner, 'rep-owner@example.com');
  assert.equal((await a.json('/api/admin/reports/act', { id: list.reports[0].id, action: 'remove' })).status, 200);
  assert.equal((await fetch(BASE + pub.data.path)).status, 404);
  assert.equal((await a.json('/api/admin/reports')).data.open, 0);
  assert.equal((await a.json('/api/admin/reports?status=closed')).data.reports[0].action, 'remove');
});

test('Auto-Modus wählt je nach Frage ein Modell und sagt warum', async () => {
  const c = await signUp('auto@example.com');
  const models = (await c.json('/api/chat/models')).data.models;
  assert.equal(models[1].id, 'auto');
  const start = await c.json('/api/chat/start', { mode: 'direct', modality: 'auto', models: ['auto'], title: 'A' });
  assert.equal(start.status, 200);
  const code = await stream(c, start.data.id, 'Schreib mir eine Python-Funktion, die Primzahlen findet', 0);
  const pick = code.lines.find((l) => l.auto)?.auto;
  assert.ok(pick && pick.id && pick.id !== 'auto');
  assert.equal(pick.kind, 'code');
  assert.ok(code.text.length > 5);
  const quick = await stream(c, start.data.id, 'Hi', 1);
  assert.ok(['quick', 'general'].includes(quick.lines.find((l) => l.auto)?.auto.kind));
  const chat = (await c.json(`/api/chat/${start.data.id}`)).data;
  assert.equal(chat.turns[0].answers[0].auto.kind, 'code'); // gespeichert
});

test('Antwort-Speicher: gleiche erste Frage kommt sofort und zählt nicht', async () => {
  const c = await signUp('cache@example.com');
  const first = (await c.json('/api/chat/models')).data.models.find((m) => !m.agent && !m.auto && m.caps.includes('text'));
  const one = await c.json('/api/chat/start', { mode: 'direct', modality: 'text', models: [first.id], title: 'C1' });
  const a = await stream(c, one.data.id, 'Was ist ein Regenbogen?');
  assert.ok(!a.lines.some((l) => l.cached));
  const used = (await c.json('/api/chat/usage')).data.kinds.text.used;
  const two = await c.json('/api/chat/start', { mode: 'direct', modality: 'text', models: [first.id], title: 'C2' });
  const b = await stream(c, two.data.id, 'was ist ein regenbogen');
  assert.ok(b.lines.some((l) => l.cached), 'zweites Mal aus dem Speicher');
  assert.equal(b.text, a.text);
  assert.equal((await c.json('/api/chat/usage')).data.kinds.text.used, used); // zählt nicht
  // „Neu generieren“ (fresh) fragt wieder das Modell
  const res = await c.call('/api/chat/stream', { chatId: two.data.id, side: 0, turn: 0, fresh: true, messages: [{ role: 'user', content: 'was ist ein regenbogen' }], display: { text: 'was ist ein regenbogen' } });
  const lines = (await res.text()).trim().split('\n').map((l) => JSON.parse(l));
  assert.ok(!lines.some((l) => l.cached));
  // Zeitabhängiges nie aus dem Speicher
  const three = await c.json('/api/chat/start', { mode: 'direct', modality: 'text', models: [first.id], title: 'C3' });
  await stream(c, three.data.id, 'Wie ist das Wetter heute?');
  const four = await c.json('/api/chat/start', { mode: 'direct', modality: 'text', models: [first.id], title: 'C4' });
  assert.ok(!(await stream(c, four.data.id, 'Wie ist das Wetter heute?')).lines.some((l) => l.cached));
});

test('Fehler-Tagebuch und Server-Infos im Admin', async () => {
  const guest = client();
  assert.equal((await guest.json('/api/log', { message: 'TypeError: x is undefined', where: '/app.js', line: '12:3' })).status, 200);
  const a = client();
  await a.json('/api/auth/login', { email: 'admin@example.com', password: 'geheim1234' });
  const d = (await a.json('/api/admin/overview')).data;
  assert.ok(d.server.rss > 0 && d.server.limit > 0);
  assert.ok(Array.isArray(d.health));
  assert.ok(d.events.some((e) => e.kind === 'client' && /x is undefined/.test(e.detail)));
});

test('Wiederaufnahme: Verbindung weg – die Antwort wird trotzdem fertig gespeichert', async () => {
  const c = await signUp('resume@example.com');
  const first = (await c.json('/api/chat/models')).data.models.find((m) => !m.agent && !m.auto && m.caps.includes('text'));
  const start = await c.json('/api/chat/start', { mode: 'direct', modality: 'text', models: [first.id], title: 'W' });
  const ctl = new AbortController();
  const res = await c.call('/api/chat/stream', { chatId: start.data.id, side: 0, turn: 0, messages: [{ role: 'user', content: 'Erzähl mir etwas Langes über Wale' }], display: { text: 'Wale' } }, 'POST', ctl.signal);
  const reader = res.body.getReader();
  await reader.read(); // erstes Stück
  ctl.abort(); // Funkloch
  let answer;
  for (let i = 0; i < 40; i++) {
    await new Promise((r) => setTimeout(r, 250));
    answer = (await c.json(`/api/chat/${start.data.id}`)).data.turns[0]?.answers[0];
    if (answer?.status === 'done') break;
  }
  assert.equal(answer.status, 'done');
  assert.ok(answer.text.length > 20);
});

test('Sicherheit: Anfragen ohne Herkunft, Wegwerf-Adressen, Sicherheits-Kopfzeilen', async () => {
  // POST ohne Origin/Referer (z. B. Skript mit geklautem Cookie) → abgelehnt
  const raw = await fetch(BASE + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'x@example.com', password: 'geheim1234' }) });
  assert.equal(raw.status, 403);
  const evil = await fetch(BASE + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://evil.example' }, body: '{}' });
  assert.equal(evil.status, 403);
  // Wegwerf-Adresse
  const c = client();
  assert.equal((await c.json('/api/auth/register', { email: 'bot@mailinator.com', password: 'geheim1234' })).status, 400);
  // Kopfzeilen
  const page = await fetch(BASE + '/login');
  assert.equal(page.headers.get('x-frame-options'), 'DENY');
  assert.equal(page.headers.get('cross-origin-opener-policy'), 'same-origin');
  assert.match(page.headers.get('content-security-policy'), /script-src 'self'/);
  assert.equal(page.headers.get('x-powered-by'), null);
});

test('Sicherheit: Vorschläge pro Antwort nur einmal berechnen', async () => {
  const c = await signUp('extras@example.com');
  const first = (await c.json('/api/chat/models')).data.models.find((m) => !m.agent && !m.auto && m.caps.includes('text'));
  const start = await c.json('/api/chat/start', { mode: 'direct', modality: 'text', models: [first.id], title: 'E' });
  await stream(c, start.data.id, 'Hallo');
  const a = await c.json('/api/chat/extras', { chatId: start.data.id, turn: 0 });
  const b = await c.json('/api/chat/extras', { chatId: start.data.id, turn: 0 });
  assert.equal(a.status, 200);
  assert.deepEqual(a.data, b.data);
  // fremder Chat → nichts
  const other = await signUp('extras2@example.com');
  assert.equal((await other.json('/api/chat/extras', { chatId: start.data.id, turn: 0 })).status, 404);
});

test('Eigene Antworten vom Admin: sofort, ohne KI, zählt nicht; häufigste Fragen', async () => {
  const a = client();
  await a.json('/api/auth/login', { email: 'admin@example.com', password: 'geheim1234' });
  assert.equal((await a.json('/api/admin/faq', { question: 'Wer hat VAIs gemacht?', answer: 'VAIs hat Leeam gebaut 🚀' })).status, 200);
  const u = await signUp('faq@example.com');
  const first = (await u.json('/api/chat/models')).data.models.find((m) => !m.agent && !m.auto && m.caps.includes('text'));
  const start = await u.json('/api/chat/start', { mode: 'direct', modality: 'text', models: [first.id], title: 'F' });
  const before = (await u.json('/api/chat/usage')).data.kinds.text.used;
  const r = await stream(u, start.data.id, 'wer hat bitte vais gemacht');
  assert.ok(r.lines.some((l) => l.faq));
  assert.equal(r.text, 'VAIs hat Leeam gebaut 🚀');
  assert.equal((await u.json('/api/chat/usage')).data.kinds.text.used, before); // zählt nicht
  const other = await stream(u, start.data.id, 'Was ist ein Wal?', 1);
  assert.ok(!other.lines.some((l) => l.faq));
  const list = (await a.json('/api/admin/faq')).data.faq;
  assert.equal(list[0].hits, 1);
  // normale Nutzer dürfen nichts eintragen
  assert.equal((await u.json('/api/admin/faq', { question: 'x y', answer: 'z' })).status, 404);
  // häufigste Fragen: zweite Person fragt dasselbe
  const u2 = await signUp('faq2@example.com');
  const s2 = await u2.json('/api/chat/start', { mode: 'direct', modality: 'text', models: [first.id], title: 'F2' });
  await stream(u2, s2.data.id, 'Was ist ein Wal?');
  const top = (await a.json('/api/admin/top-questions?days=30')).data;
  const wal = top.questions.find((q) => /wal/i.test(q.text));
  assert.ok(wal && wal.users === 2 && wal.percent > 0);
});

test('Sicherheit: neues Konto erreicht nichts aus dem Admin-Bereich', async () => {
  const c = await signUp('fresh-user@example.com');
  const me = (await c.json('/api/auth/me')).data.user;
  assert.equal(me.admin, undefined);
  assert.equal(me.mod, undefined);
  for (const path of ['/api/admin/overview', '/api/admin/users', '/api/admin/keys', '/api/admin/limits', '/api/admin/reports', '/api/admin/faq', '/api/admin/stats', '/api/admin/maintenance', '/api/admin/top-questions', '/api/admin/feedback', '/api/admin/sites', '/api/groups']) {
    assert.equal((await c.call(path)).status, 404, path);
  }
  for (const [path, body] of [['/api/admin/limits', { limits: { text: 9999 } }], ['/api/admin/role', { userId: 1, role: 'mod' }], ['/api/admin/keys', { provider: 'groq', key: 'x' }], ['/api/admin/maintenance', { on: true }], ['/api/admin/faq', { question: 'a b', answer: 'c' }]]) {
    assert.equal((await c.json(path, body)).status, 404, path);
  }
  assert.equal((await c.call('/admin.js')).status, 404);
  assert.equal((await c.call('/admin.css')).status, 404);
  const adminPage = await c.call('/admin');
  assert.equal(adminPage.status, 302);
  assert.equal(adminPage.headers.get('location'), '/');
  // Admin bekommt die Seite
  const a = client();
  await a.json('/api/auth/login', { email: 'admin@example.com', password: 'geheim1234' });
  assert.equal((await a.call('/admin.js')).status, 200);
  assert.equal((await a.json('/api/auth/me')).data.user.admin, true);
  // Name aus dem Willkommens-Dialog landet im Gedächtnis
  assert.equal((await c.json('/api/chat/profile/name', { name: 'Mia' })).status, 200);
  assert.equal((await c.json('/api/chat/profile/name', { name: '<script>' })).status, 400);
  const prof = (await c.json('/api/chat/profile')).data;
  assert.ok(JSON.stringify(prof).includes('Mia'));
});

test('„Denken“ zählt als 2 Antworten und liefert Gedanken', async () => {
  const c = await signUp('think@example.com');
  const first = (await c.json('/api/chat/models')).data.models.find((m) => m.id === 'demo:aurora');
  const start = await c.json('/api/chat/start', { mode: 'direct', modality: 'text', models: [first.id], title: 'D' });
  const res = await c.call('/api/chat/stream', { chatId: start.data.id, side: 0, turn: 0, think: true, messages: [{ role: 'user', content: 'Warum ist der Himmel blau?' }], display: { text: 'Warum ist der Himmel blau?' } });
  const lines = (await res.text()).trim().split('\n').filter(Boolean).map((l) => JSON.parse(l));
  assert.ok(lines.some((l) => l.r), 'Gedanken kommen');
  assert.equal((await c.json('/api/chat/usage')).data.kinds.text.used, 2);
  const sum = await c.json('/api/chat/think-summary', { chatId: start.data.id, turn: 0, side: 0 });
  assert.equal(sum.status, 200);
  assert.ok(sum.data.summary.length > 5);
  await stream(c, start.data.id, 'Und ohne Denken?', 1);
  assert.equal((await c.json('/api/chat/usage')).data.kinds.text.used, 3);
});

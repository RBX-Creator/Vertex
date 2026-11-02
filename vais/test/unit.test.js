// Schnelle Tests ohne Server: Rechner, Webseiten-Prüfung, Reaktionen, Links, Zeiten
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.DATABASE_URL = `file:${join(mkdtempSync(join(tmpdir(), 'vais-unit-')), 'unit.db')}`;
for (const k of ['OPENROUTER_API_KEY', 'GROQ_API_KEY', 'GEMINI_API_KEY', 'CEREBRAS_API_KEY', 'MISTRAL_API_KEY']) delete process.env[k];

const agent = await import('../src/agent.js');
const { parseWhen } = await import('../src/push.js');
const { dayKey, nextReset } = await import('../src/limits.js');

test('Rechner: Punkt vor Strich, Klammern, Funktionen', () => {
  assert.equal(agent.calculate('2 + 3 * 4'), 14);
  assert.equal(agent.calculate('(2 + 3) * 4'), 20);
  assert.equal(agent.calculate('2^10'), 1024);
  assert.equal(agent.calculate('sqrt(16) + 1,5'), 5.5);
  assert.throws(() => agent.calculate('1 / 0'));
  assert.throws(() => agent.calculate('process.exit()'));
});

test('Webseiten-Prüfung findet Fehler und lobt saubere Seiten', () => {
  const bad = agent.validateHtml('<html><body><div><script>let x = ;</script></body></html>');
  assert.match(bad, /doctype/);
  assert.match(bad, /viewport/);
  assert.match(bad, /<div> wird nicht geschlossen/);
  assert.match(bad, /JavaScript-Fehler/);
  const good = agent.validateHtml('<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>T</title></head><body><main><p>Hi</p></main><script>const a = 1;</script></body></html>');
  assert.match(good, /^OK/);
});

test('Webseiten-Prüfung führt keinen Code aus', () => {
  globalThis.__vaisRan = false;
  agent.validateHtml('<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="x"><title>T</title></head><body><script>globalThis.__vaisRan = true;</script></body></html>');
  assert.equal(globalThis.__vaisRan, false);
});

test('Kurze Bestätigungen bekommen nur ein Emoji', () => {
  const chat = (x, prev = 'Fertig.') => [{ role: 'user', content: 'a' }, { role: 'assistant', content: prev }, { role: 'user', content: x }];
  assert.equal(agent.quickReaction(chat('ok')), '👍');
  assert.equal(agent.quickReaction(chat('ok danke')), '❤️');
  assert.equal(agent.quickReaction(chat('haha')), '😂');
  assert.equal(agent.quickReaction(chat('Du bist der Beste')), '❤️');
  assert.equal(agent.quickReaction(chat('krass')), '🔥');
  assert.equal(agent.quickReaction(chat('du bist doof')), null);
  assert.equal(agent.quickReaction(chat('der')), null);
  assert.equal(agent.quickReaction(chat('Was ist 2+2?')), null);
  assert.equal(agent.quickReaction(chat('ok', 'Soll ich weitermachen?')), null); // Antwort auf eine Frage
  assert.equal(agent.quickReaction([{ role: 'user', content: 'ok' }]), null); // erste Nachricht
});

test('Reaktions-Markierung wird abgetrennt', () => {
  assert.deepEqual(agent.splitReaction('[[react:🎉]] Super!'), { reaction: '🎉', text: 'Super!' });
  assert.equal(agent.splitReaction('[[react:🐍]] x').reaction, null); // nicht erlaubtes Emoji
  assert.equal(agent.splitReaction('Kein Tag').text, 'Kein Tag');
});

test('YouTube-Links werden erkannt', () => {
  assert.equal(agent.youtubeId('https://youtu.be/dQw4w9WgXcQ?si=1'), 'dQw4w9WgXcQ');
  assert.equal(agent.youtubeId('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=5'), 'dQw4w9WgXcQ');
  assert.equal(agent.youtubeId('https://m.youtube.com/shorts/dQw4w9WgXcQ'), 'dQw4w9WgXcQ');
  assert.equal(agent.youtubeId('https://evil.example/watch?v=dQw4w9WgXcQ'), null);
});

test('Quellen: doppelte und Such-Links fliegen raus, seriöse zuerst', () => {
  const got = [];
  agent.sourceCleaner((list) => got.push(...list))([
    { url: 'https://www.example.com/a?utm_source=x' }, { url: 'https://example.com/a/' },
    { url: 'https://www.google.com/search?q=1' }, { url: 'https://de.wikipedia.org/wiki/Test' },
  ]);
  assert.deepEqual(got.map((s) => new URL(s.url).hostname), ['de.wikipedia.org', 'www.example.com']);
});

test('Erinnerungen: Zeit ohne Zone gilt als deutsche Zeit', () => {
  assert.equal(new Date(parseWhen('2026-11-02T08:00')).toISOString(), '2026-11-02T07:00:00.000Z'); // Winterzeit
  assert.equal(new Date(parseWhen('2026-07-01T08:00')).toISOString(), '2026-07-01T06:00:00.000Z'); // Sommerzeit
  assert.ok(Number.isNaN(parseWhen('irgendwann')));
});

test('Tageslimit: der Tag wechselt um Mitternacht deutscher Zeit', () => {
  assert.equal(dayKey(new Date('2026-11-01T22:59:00Z')), '2026-11-01');
  assert.equal(dayKey(new Date('2026-11-01T23:01:00Z')), '2026-11-02');
  const reset = nextReset();
  assert.ok(reset > Date.now() && reset - Date.now() <= 24 * 3600 * 1000 + 1);
  assert.notEqual(dayKey(new Date(reset)), dayKey());
});

test('Such-Budget: wenig bei Plänen/Tipps, mehr bei ausdrücklicher Recherche', () => {
  const plan = agent.searchBudget('Plane für mich eine gute Brawl Stars-Runde mit Taktiken');
  assert.equal(plan.search, 2);
  assert.equal(plan.read, 1);
  const research = agent.searchBudget('Recherchiere die aktuellen Nachrichten zu Brawl Stars');
  assert.ok(research.search > plan.search);
});

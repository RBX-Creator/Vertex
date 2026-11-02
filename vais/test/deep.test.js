// Agent X intern: DeepSearch, Heavy, Quellen-Nummern, sichere Code-Ausführung (ohne echte Schlüssel)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.DATABASE_URL = `file:${join(mkdtempSync(join(tmpdir(), 'vais-deep-')), 'd.db')}`;
const { isResearch, isHard, deepResearch, heavyAnswer } = await import('../src/deep.js');
const { sourceCleaner } = await import('../src/agent.js');
const { runJavaScript, runJavaScriptText } = await import('../src/sandbox.js');

test('Erkennung: Recherche, schwere Fragen und was der normale Ablauf macht', () => {
  assert.ok(isResearch('Recherchiere die Vor- und Nachteile von E-Autos 2026'));
  assert.ok(isResearch('Vergleich iPhone 17 und Pixel 10 – welches ist besser?'));
  assert.ok(isResearch('Was gibt es Neues bei der Raumfahrt?'));
  assert.ok(!isResearch('Plane mir eine Brawl Stars Runde'));
  assert.ok(!isResearch('Bau mir eine Webseite mit Vergleich meiner Hobbys'));
  assert.ok(!isResearch('danke'));
  assert.ok(isHard('Beweise, dass die Wurzel aus 2 irrational ist'));
  assert.ok(isHard('Löse die Gleichung x^2 - 5x + 6 = 0 Schritt für Schritt'));
  assert.ok(!isHard('Wie geht es dir?'));
  assert.ok(!isHard('Erinnere mich in 5 Minuten an die Wäsche'));
});

test('Quellen bekommen feste Nummern wie in der App (doppelte = gleiche Nummer, höchstens 12)', () => {
  const shown = [];
  const add = sourceCleaner((list) => shown.push(...list));
  assert.deepEqual(add([{ url: 'https://a.de/x' }, { url: 'https://www.google.com/search?q=1' }, { url: 'https://de.wikipedia.org/wiki/A' }]), [2, null, 1]);
  assert.deepEqual(add([{ url: 'https://a.de/x?utm_source=z' }, { url: 'https://b.de' }]), [2, 3]);
  assert.deepEqual(shown.map((s) => new URL(s.url).hostname), ['de.wikipedia.org', 'a.de', 'b.de']);
  const many = add(Array.from({ length: 15 }, (_, i) => ({ url: `https://s${i}.de` })));
  assert.equal(many.filter(Boolean).length, 9); // 3 + 9 = 12
  assert.equal(shown.length, 12);
});

const fakeModels = [
  { id: 'groq:openai/gpt-oss-120b', upstream: 'openai/gpt-oss-120b', name: 'gpt-oss-120b', caps: ['text'] },
  { id: 'cerebras:gpt-oss-120b', upstream: 'gpt-oss-120b', name: 'gpt-oss-120b', caps: ['text'] },
  { id: 'groq:qwen/qwen3.8-27b', upstream: 'qwen/qwen3.8-27b', name: 'qwen3.8-27b', caps: ['text'] },
  { id: 'gemini:gemma-4-31b-it', upstream: 'gemma-4-31b-it', name: 'gemma-4-31b-it', caps: ['text'] },
];

test('DeepSearch: plant Suchen, liest Seiten, antwortet mit nummerierten Quellen – kaputte Seite stört nicht', async () => {
  const steps = []; const shown = []; let written = ''; let finalPrompt = '';
  const deps = {
    listModels: async () => fakeModels,
    rankModels: (task, all) => all,
    completeBest: async (task, params) => {
      const last = params.messages.at(-1).content;
      if (/Answer ONLY with JSON/.test(last)) return { content: '{"queries": ["E-Autos Vorteile 2026", "E-Autos Nachteile Reichweite"]}' };
      finalPrompt = last;
      return { content: 'E-Autos sind leise [1] und günstig im Betrieb [2], die Reichweite ist begrenzt [3].' };
    },
    searchWeb: async (q) => ({ results: q.includes('Vorteile')
      ? [{ url: 'https://de.wikipedia.org/wiki/Elektroauto', title: 'Elektroauto – Wikipedia', snippet: 'leise' }, { url: 'https://adac.de/e-auto', title: 'ADAC', snippet: 'günstig' }]
      : [{ url: 'https://adac.de/e-auto', title: 'ADAC', snippet: 'günstig' }, { url: 'https://kaputt.example/x', title: 'Kaputt', snippet: 'Reichweite 400 km' }] }),
    readPage: async (url) => { if (url.includes('kaputt')) throw new Error('403'); return { url, title: `Gelesen: ${url}`, text: `Ganzer Text von ${url}` }; },
  };
  const ok = await deepResearch({ question: 'Recherchiere Vor- und Nachteile von E-Autos', addSources: sourceCleaner((l) => shown.push(...l)), onStep: (s) => steps.push(s), write: async (txt) => { written = txt; } }, deps);
  assert.equal(ok, true);
  assert.equal(steps.filter((s) => s.kind === 'search').length, 2);
  assert.ok(steps.filter((s) => s.kind === 'read').length >= 2);
  assert.match(written, /\[1\].*\[2\].*\[3\]/);
  assert.equal(shown.length, 3);
  assert.match(finalPrompt, /\[1\] Gelesen: https:\/\/de\.wikipedia\.org/); // seriöse, gelesene Quelle zuerst
  assert.match(finalPrompt, /Ganzer Text von https:\/\/adac\.de/);
  assert.match(finalPrompt, /\[3\] Kaputt[\s\S]*Reichweite 400 km/); // nicht lesbar → Auszug aus der Suche
});

test('DeepSearch ohne Treffer → normaler Ablauf übernimmt', async () => {
  const deps = { completeBest: async () => ({ content: '{"queries":["x"]}' }), searchWeb: async () => ({ results: [] }), readPage: async () => null, listModels: async () => [], rankModels: () => [] };
  assert.equal(await deepResearch({ question: 'Recherchiere etwas sehr Seltenes', addSources: () => [], write: async () => {} }, deps), false);
});

test('Heavy: verschiedene starke Modelle parallel, eins fällt aus, das beste fasst zusammen', async () => {
  const steps = []; let written = ''; const asked = []; let judge = '';
  const deps = {
    listModels: async () => fakeModels,
    rankModels: (task, all) => all,
    complete: async ({ model }) => { asked.push(model); if (model.startsWith('gemini')) throw Object.assign(new Error('voll'), { status: 429 }); return { content: `Antwort von ${model}: x = 2 oder x = 3` }; },
    completeBest: async (task, params) => { judge = params.messages.at(-1).content; return { content: 'Die Lösungen sind **x = 2** und **x = 3**.' }; },
  };
  const ok = await heavyAnswer({ question: 'Löse x^2 - 5x + 6 = 0', history: [{ role: 'user', content: 'Löse x^2 - 5x + 6 = 0' }], onStep: (s) => steps.push(s), write: async (txt) => { written = txt; } }, deps);
  assert.equal(ok, true);
  assert.deepEqual(asked, ['groq:openai/gpt-oss-120b', 'groq:qwen/qwen3.8-27b', 'gemini:gemma-4-31b-it']); // gpt-oss nicht doppelt (Cerebras)
  assert.match(judge, /Answer A[\s\S]*Answer B/);
  assert.doesNotMatch(judge, /Answer C/);
  assert.match(written, /x = 2/);
  assert.equal(steps[0].kind, 'other');
  assert.equal(steps[1].kind, 'check');
});

test('Heavy mit nur einem Modell → normaler Ablauf', async () => {
  const deps = { listModels: async () => fakeModels.slice(0, 1), rankModels: (task, all) => all };
  assert.equal(await heavyAnswer({ question: 'Beweise etwas', write: async () => {} }, deps), false);
});

test('Code-Ausführung: rechnet, aber kein Ausbruch, keine Endlosschleife, kein Speicherfresser', async () => {
  assert.match(await runJavaScriptText('let s = 0; for (let i = 1; i <= 100; i++) s += i; console.log(s);'), /5050/);
  assert.equal((await runJavaScript('return typeof require + typeof process + typeof fetch')).result, 'undefinedundefinedundefined');
  assert.match((await runJavaScript('return (function(){}).constructor("return process")()')).error, /disallowed/);
  assert.match((await runJavaScript('while (true) {}')).error, /timed out|Zeitlimit/);
  assert.match((await runJavaScript('const a = []; while (true) a.push(new Array(1e6).fill(1));')).error, /memory|Speicher|Abgebrochen/);
});

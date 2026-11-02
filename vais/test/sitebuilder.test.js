// Webseiten-Baukasten ohne echte KI: Die Modell-Antworten werden nachgestellt.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.DATABASE_URL = `file:${join(mkdtempSync(join(tmpdir(), 'vais-sb-')), 'sb.db')}`;
for (const k of ['OPENROUTER_API_KEY', 'GROQ_API_KEY', 'GEMINI_API_KEY', 'CEREBRAS_API_KEY', 'MISTRAL_API_KEY']) delete process.env[k];

const sb = await import('../src/sitebuilder.js');
const { validateHtml } = await import('../src/agent.js');

const section = (id, inner, { css = '', js = '' } = {}) => {
  const tag = id === 'nav' ? 'header' : id === 'footer' ? 'footer' : 'section';
  return `\`\`\`html\n<${tag} id="${id}"${tag === 'section' ? ' class="vx-section"' : ''}><div class="container">${inner}</div></${tag}>\n\`\`\`\n\`\`\`css\n#${id} h2 { color: var(--primary); }${css}\n\`\`\`${js ? `\n\`\`\`js\n${js}\n\`\`\`` : ''}`;
};

function fakeModel(log) {
  return async (messages) => {
    const sys = messages[0].content;
    const user = messages.at(-1).content;
    log.push(sys.slice(0, 40));
    if (sys.includes('Art-Director')) {
      return { text: '```json\n' + JSON.stringify({
        title: 'Imkerei Honigtau', lang: 'de', style: 'warm, rund, golden',
        palette: { bg: '#fffaf0', surface: '#ffffff', surface2: '#fff1d6', text: '#2b2112', muted: '#7a6a4f', primary: '#e0a100', primaryContrast: '#2b2112', accent: '#5a8f29', border: '#f0e2c2' },
        fonts: { heading: 'Fraunces', body: 'Inter' }, radius: '18px',
        sections: [
          { id: 'nav', goal: 'Kopfzeile', content: 'Honigtau' },
          { id: 'hero', goal: 'Begrüßung', content: 'Honig aus dem Garten' },
          { id: 'sorten', goal: 'Honigsorten', content: 'Frühtracht, Sommertracht' },
          { id: 'footer', goal: 'Fußzeile', content: '' },
        ],
      }) + '\n```' };
    }
    if (sys.includes('Design-System (CSS + gemeinsames')) return { text: '```css\nbody { background: var(--bg); }\n.btn { padding: 10px; }\n```\n```js\ndocument.querySelectorAll(".reveal").forEach((n) => n.classList.add("visible"));\n```' };
    if (sys.includes('planst eine Änderung')) {
      return { text: '```json\n{"edit":[{"id":"hero","what":"Knopf rot"}],"add":[{"after":"sorten","id":"faq","goal":"Fragen","content":"Wie lagert man Honig?"}],"remove":[],"design":"","palette":{"primary":"#cc2200"}}\n```' };
    }
    const id = user.match(/DEIN ABSCHNITT: id "([\w-]+)"/)?.[1];
    if (id === 'sorten' && !user.includes('Behebe')) {
      // erste Fassung: Blindtext + kaputtes JavaScript → muss repariert werden
      return { text: section(id, '<h2>Sorten</h2><p>Lorem ipsum dolor sit amet</p>', { js: 'const x = ;' }) };
    }
    if (id === 'hero' && user.includes('ÄNDERUNG')) return { text: section(id, '<h1>Honig</h1><button class="btn" style="background:red">Neu</button>') };
    return { text: section(id, `<h2>${id}</h2><p class="reveal">Echter Inhalt für ${id}</p>`) };
  };
}

test('Baukasten: baut Seite in Schritten, repariert Blindtext und JS-Fehler', async () => {
  const log = [];
  sb.__setAsk(fakeModel(log));
  const steps = [];
  const out = await sb.buildWebsite({ brief: 'Webseite für unsere Imkerei', onStep: (s) => steps.push(s), validate: validateHtml });
  assert.ok(steps.some((s) => s.kind === 'draft'));
  assert.ok(steps.filter((s) => s.kind === 'section').length >= 4);
  assert.ok(steps.some((s) => s.kind === 'check' && /sorten/.test(s.text)), 'Reparatur von „sorten“');
  assert.match(out.html, /<!--vx:hero-->/);
  assert.match(out.html, /fonts\.googleapis\.com\/css2\?family=Fraunces/);
  assert.match(out.html, /--primary:#e0a100/);
  assert.doesNotMatch(out.html, /Lorem ipsum/);
  assert.doesNotMatch(out.html, /const x = ;/);
  assert.match(validateHtml(out.html), /^OK/);
  assert.match(out.report, /4 Abschnitte|Abschnitte: nav, hero, sorten, footer/);
  sb.__setAsk(null);
});

test('Baukasten: Änderung schreibt nur betroffene Teile neu und fügt Abschnitt ein', async () => {
  const log = [];
  sb.__setAsk(fakeModel(log));
  const first = await sb.buildWebsite({ brief: 'Imkerei', validate: validateHtml });
  log.length = 0;
  const edited = await sb.editWebsite({ html: first.html, change: 'Mach den Knopf rot und füge FAQ hinzu', validate: validateHtml });
  const parts = sb.disassemble(edited.html);
  assert.deepEqual(parts.spec.sections.map((s) => s.id), ['nav', 'hero', 'sorten', 'faq', 'footer']);
  assert.match(parts.parts.hero.html, /background:red/);
  assert.match(edited.html, /--primary:#cc2200/);
  // nav/footer/sorten wurden nicht neu geschrieben: nur Planer + hero + faq
  assert.equal(log.filter((l) => /Spitzen-Frontend/.test(l)).length, 2);
  assert.match(validateHtml(edited.html), /^OK/);
  sb.__setAsk(null);
});

test('Fake-Erkennung findet typische Platzhalter', () => {
  assert.deepEqual(sb.fakeCheck('Ruf an: 0123 456789, Max Mustermann, https://picsum.photos/200').length, 3);
  assert.deepEqual(sb.fakeCheck('Unsere Bienen fliegen ab März.'), []);
});

test('Seiten ohne Markierungen lassen sich nicht zerlegen', () => {
  assert.equal(sb.disassemble('<!doctype html><html><body>Hi</body></html>'), null);
});

test('Baukasten: Abschnitt, der einmal am Limit scheitert, wird nachgebaut; echte Nutzerdaten bleiben', async () => {
  const base = fakeModel([]);
  let failed = 0;
  sb.__setAsk(async (messages) => {
    const user = messages.at(-1).content;
    if (/DEIN ABSCHNITT: id "hero"/.test(user) && failed++ < 1) throw Object.assign(new Error('ausgelastet'), { status: 429 });
    if (/DEIN ABSCHNITT: id "footer"/.test(user)) return { text: section('footer', '<p>Ruf an: 01234 567890</p>') };
    return base(messages);
  });
  const steps = [];
  const out = await sb.buildWebsite({ brief: 'Verein, Telefon 01234 567890', onStep: (s) => steps.push(s), validate: validateHtml });
  assert.ok(steps.some((s) => /2\. Versuch/.test(s.text)));
  assert.match(out.html, /<!--vx:hero-->/);
  assert.match(out.html, /01234 567890/); // vom Nutzer angegeben → nicht als Fake entfernt
  assert.ok(!steps.some((s) => s.kind === 'check' && /footer/.test(s.text)));
  sb.__setAsk(null);
});

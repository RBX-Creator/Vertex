// Webseiten-Baukasten für Agent X: baut große, schöne Seiten in mehreren Schritten statt in einem Rutsch.
//   1. Architekt: Aufbau, Farben, Schriften und Abschnitte (JSON)
//   2. Basis: Design-System (CSS-Variablen, Typo, Knöpfe, Karten, Animationen) + gemeinsames JavaScript
//   3. Abschnitte: jeder Abschnitt einzeln mit voller Aufmerksamkeit (parallel, über mehrere Schlüssel/Modelle)
//   4. Prüfen + Reparieren: Tags, JavaScript, Platzhalter/Fake-Inhalte
// So passt jede einzelne Anfrage in die Limits der kostenlosen Modelle – die Seite wird trotzdem lang und detailliert.
// Änderungen später: Nur die betroffenen Abschnitte werden neu geschrieben (Markierungen <!--vx:ID--> im HTML).
import vm from 'node:vm';
import { complete, listModels, rankModels } from './models.js';

const sleep = (ms, signal) => new Promise((ok, no) => {
  const tm = setTimeout(ok, ms);
  signal?.addEventListener('abort', () => { clearTimeout(tm); no(signal.reason ?? new Error('abgebrochen')); }, { once: true });
});

// Ein Modell fragen. Minuten-Limit erreicht → genau so lange warten, wie der Anbieter sagt (statt aufzugeben);
// anderes Problem → anderes Modell; Anfrage zu groß → weniger Tokens.
async function realAsk(messages, { maxTokens = 4000, signal, effort = 'medium' } = {}) {
  const tried = new Set();
  let budget = maxTokens;
  let lastErr = null;
  let waited = 0;
  let stay = null; // nach dem Warten dasselbe (beste) Modell nochmal
  for (let attempt = 0; attempt < 14; attempt++) {
    const all = await listModels();
    let model = stay ?? rankModels('builder', all, { exclude: [...tried] })[0];
    stay = null;
    if (!model) {
      // alle gerade voll: kurz warten und dann wieder von vorne (Limits pro Minute)
      if (waited > 150_000) break;
      await sleep(8000, signal);
      waited += 8000;
      tried.clear();
      model = rankModels('builder', all, { includeBusy: true })[0];
      if (!model) break;
    }
    try {
      const msg = await complete({ model: model.id, messages, signal, maxTokens: budget, reasoningEffort: effort, timeoutMs: 150_000 });
      const text = String(msg.content ?? '');
      if (!text.trim()) throw Object.assign(new Error('Leere Antwort'), { status: 502 });
      return { text, cut: msg.finish === 'length', model: model.id };
    } catch (err) {
      if (signal?.aborted) throw err;
      lastErr = err;
      if (err.status === 401) throw err;
      if (err.status === 413 || /zu groß|too large/i.test(err.message)) { budget = Math.max(1500, Math.round(budget * 0.65)); stay = model; continue; }
      if (err.status === 429 && err.retryAfter && err.retryAfter <= 30_000 && waited < 150_000) {
        await sleep(err.retryAfter + 500, signal);
        waited += err.retryAfter + 500;
        stay = model;
        continue;
      }
      tried.add(model.id); // voll für länger, kaputt oder nicht verfügbar → anderes Modell
      await sleep(1000, signal);
    }
  }
  throw lastErr ?? new Error('Kein Modell verfügbar.');
}

// Höchstens 2 große Anfragen gleichzeitig (sonst ist das Minuten-Limit sofort voll)
let running = 0;
const waiting = [];
async function limited(fn) {
  if (running >= 2) await new Promise((ok) => waiting.push(ok));
  running++;
  try { return await fn(); } finally { running--; waiting.shift()?.(); }
}
const askLimited = (messages, opts) => limited(() => realAsk(messages, opts));

// Für Tests austauschbar
let ask = askLimited;
export function __setAsk(fn) { ask = fn ?? askLimited; }

// ── Gemeinsame Regeln für Inhalt und Gestaltung ───────────────────────
const QUALITY = `QUALITÄT (sehr wichtig):
- Echte Inhalte: Nutze NUR Fakten und Angaben aus dem Auftrag. Erfinde NIEMALS: Kundenstimmen/Bewertungen, Namen von Personen oder Firmen, Preise, Telefonnummern, E-Mail-Adressen, Adressen, Statistiken/Zahlen, Auszeichnungen, Logos bekannter Firmen. Kein „Lorem ipsum“, kein example.com, kein „Max Mustermann“, keine „Firma XY“.
- Fehlt eine Angabe, schreibe ehrliche, sinnvolle Texte zum Thema (was der Bereich bietet, warum er nützlich ist) statt erfundener Details. Kontaktformulare schicken nichts ab, sondern zeigen eine freundliche Bestätigung; mailto/tel nur, wenn im Auftrag eine echte Adresse/Nummer steht.
- Bilder: KEINE zufälligen Stockfotos (kein picsum, unsplash, placeholder, placehold). Stattdessen eigene Inline-SVG-Illustrationen und -Icons, CSS-Formen/Verläufe, Emojis – oder echte Bild-Links aus dem Auftrag.
- Gestaltung wie von einer Top-Agentur: klare Hierarchie, großzügige Abstände, starke Überschriften, durchdachte Farben, einheitliche Rundungen und Schatten, Hover- und Fokus-Zustände, weiche Übergänge, dezente Animationen beim Scrollen.
- Mobil zuerst: muss bei 360 px Breite perfekt aussehen (keine waagerechte Scrollleiste), auf großen Bildschirmen mehrspaltig.
- Barrierearm: guter Kontrast, alt-Texte, aria-label für Icon-Knöpfe, echte <button> für Aktionen, sichtbarer Fokus, prefers-reduced-motion beachten.
- Reich an Details: lieber mehr durchdachte Elemente (Karten, Icons, Zahlen-Hervorhebungen, Akkordeons, Tabs, Zähler, kleine Interaktionen) als leere Flächen.`;

const CONTRACT = `DESIGN-SYSTEM (schon vorhanden, benutze es – nicht neu definieren):
CSS-Variablen: --bg, --surface, --surface-2, --text, --muted, --primary, --primary-contrast, --accent, --border, --radius, --radius-lg, --shadow, --shadow-lg, --font-head, --font-body, --space (Grundabstand), --max (Inhaltsbreite).
Klassen: .container (zentriert, max-width), .vx-section (Abschnitts-Abstände), .eyebrow (kleine Überzeile), .lead (großer Einleitungstext), .muted, .btn, .btn-primary, .btn-ghost, .card, .grid (responsive Raster; .grid-2/.grid-3/.grid-4), .stack (vertikaler Abstand), .row (Flex mit Abstand), .badge, .icon (24px SVG-Icon), .reveal (blendet beim Scrollen ein – einfach anhängen), .sr-only.
Gemeinsames JavaScript: .reveal-Animation, weiches Scrollen zu #Ankern, [data-nav-toggle] öffnet/schließt [data-nav] (Klasse .open), [data-year] bekommt das aktuelle Jahr.`;

function briefText(spec) {
  return [
    `Titel: ${spec.title}`,
    `Sprache: ${spec.lang}`,
    `Art: ${spec.kind}`,
    `Stil: ${spec.style}`,
    `Farben: ${Object.entries(spec.palette ?? {}).map(([k, v]) => `${k} ${v}`).join(', ')}`,
    `Schriften: Überschriften ${spec.fonts?.heading}, Text ${spec.fonts?.body}`,
    `Alle Abschnitte (id – Zweck): ${spec.sections.map((s) => `${s.id} – ${s.goal}`).join(' | ')}`,
  ].join('\n');
}

const fence = (text, lang) => {
  const re = new RegExp('```' + lang + '\\b[^\\n]*\\n([\\s\\S]*?)(?:```|$)', 'i');
  return text.match(re)?.[1]?.trim() ?? '';
};
function parseJson(text) {
  const raw = fence(text, 'json') || text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1);
  return JSON.parse(raw);
}
const safeId = (s, i) => (String(s ?? '').toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/^-+|-+$/g, '').slice(0, 24) || `teil-${i + 1}`);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const cssColor = (v, fb) => (/^#[0-9a-f]{3,8}$/i.test(String(v ?? '').trim()) ? String(v).trim() : fb);
const fontName = (v, fb) => (/^[\w \-]{2,40}$/.test(String(v ?? '')) ? String(v).trim() : fb);

// ── Schritt 1: Architekt ─────────────────────────────────────────────
async function architect(brief, kind, { signal }) {
  const sys = `Du bist Art-Director und Informationsarchitekt einer Top-Webagentur. Plane eine ${kind === 'website' ? 'Webseite' : kind === 'game' ? 'Browser-Spiel-Seite' : 'Web-App'} anhand des Auftrags. Antworte NUR mit JSON in einem \`\`\`json-Block:
{"title":"…","lang":"de","style":"2–3 Sätze zur Gestaltung (Stimmung, Formen, Besonderheiten)","palette":{"bg":"#…","surface":"#…","surface2":"#…","text":"#…","muted":"#…","primary":"#…","primaryContrast":"#…","accent":"#…","border":"#…"},"fonts":{"heading":"Google-Font-Name","body":"Google-Font-Name"},"radius":"z. B. 14px","sections":[{"id":"kurz-ohne-leerzeichen","goal":"Zweck","content":"ALLE Texte, Fakten, Listen und Ideen für diesen Abschnitt – ausführlich, konkret, nur echte Angaben aus dem Auftrag","interaction":"was man dort tun/klicken kann","size":"normal|large"}]}
Regeln: ${kind === 'website' ? '6–10 Abschnitte, erster Abschnitt id "nav" (Kopfzeile mit Logo/Name und Menü zu den Abschnitten), zweiter ein starker Hero, letzter id "footer".' : '3–6 Abschnitte: "nav" (Kopfzeile), der Hauptteil (die App bzw. das Spiel, size "large", mit allen Funktionen/Regeln/Steuerung ausführlich beschrieben), dazu sinnvolle Bereiche wie Anleitung oder Einstellungen, zuletzt "footer".'}
Kontrastreiche, harmonische Farben passend zum Thema (nicht immer lila/blau). Schriften von Google Fonts. Inhalte nur aus dem Auftrag – nichts erfinden (keine Bewertungen, Preise, Kontaktdaten, Personen, Zahlen).`;
  const { text } = await ask([{ role: 'system', content: sys }, { role: 'user', content: `Auftrag:\n${brief}` }], { maxTokens: 3500, signal, effort: 'medium' });
  const raw = parseJson(text);
  const p = raw.palette ?? {};
  const sections = (Array.isArray(raw.sections) ? raw.sections : []).slice(0, 11).map((s, i) => ({
    id: safeId(s.id, i),
    goal: String(s.goal ?? '').slice(0, 300),
    content: String(s.content ?? '').slice(0, 2500),
    interaction: String(s.interaction ?? '').slice(0, 500),
    size: s.size === 'large' ? 'large' : 'normal',
  }));
  const seen = new Set();
  for (const s of sections) { while (seen.has(s.id)) s.id = `${s.id}-2`; seen.add(s.id); }
  if (sections.length < 2) throw new Error('Der Entwurf war unvollständig.');
  return {
    kind,
    title: String(raw.title ?? 'Webseite').slice(0, 80),
    lang: /^[a-z]{2}$/.test(raw.lang) ? raw.lang : 'de',
    style: String(raw.style ?? '').slice(0, 600),
    palette: {
      bg: cssColor(p.bg, '#0f1115'), surface: cssColor(p.surface, '#171a21'), surface2: cssColor(p.surface2, '#1f232c'),
      text: cssColor(p.text, '#f3f4f6'), muted: cssColor(p.muted, '#9aa3b2'), primary: cssColor(p.primary, '#6d5dfc'),
      primaryContrast: cssColor(p.primaryContrast, '#ffffff'), accent: cssColor(p.accent, '#22c3a6'), border: cssColor(p.border, '#2a2f3a'),
    },
    fonts: { heading: fontName(raw.fonts?.heading, 'Inter'), body: fontName(raw.fonts?.body, 'Inter') },
    radius: /^\d{1,2}px$/.test(raw.radius ?? '') ? raw.radius : '14px',
    sections,
  };
}

// ── Schritt 2: Basis (Design-System) ─────────────────────────────────
function baseVars(spec) {
  const p = spec.palette;
  return `:root{--bg:${p.bg};--surface:${p.surface};--surface-2:${p.surface2};--text:${p.text};--muted:${p.muted};--primary:${p.primary};--primary-contrast:${p.primaryContrast};--accent:${p.accent};--border:${p.border};--radius:${spec.radius};--radius-lg:calc(${spec.radius} * 1.6);--shadow:0 6px 24px rgba(0,0,0,.12);--shadow-lg:0 24px 60px rgba(0,0,0,.22);--font-head:'${spec.fonts.heading}',system-ui,sans-serif;--font-body:'${spec.fonts.body}',system-ui,sans-serif;--space:clamp(16px,2.4vw,24px);--max:1160px}`;
}
async function buildBase(spec, { signal }) {
  const sys = `Du schreibst das Design-System (CSS + gemeinsames JavaScript) für eine Seite. Die Variablen in :root gibt es schon (siehe unten) – benutze sie, definiere :root NICHT neu.
Schreibe in einem \`\`\`css-Block: Reset (box-sizing, margin 0, img max-width), body (Hintergrund, Schrift, Zeilenhöhe 1.6, -webkit-font-smoothing), Überschriften mit clamp()-Größen und --font-head, Links, ::selection, :focus-visible, und ALLE Klassen aus dem Vertrag: .container, .vx-section (padding clamp(56px,9vw,120px) 0), .eyebrow, .lead, .muted, .btn (+ .btn-primary, .btn-ghost; Hover/Active/Fokus, Übergänge), .card (Hintergrund --surface, Rand, Radius, Schatten, Hover-Anhebung), .grid/.grid-2/.grid-3/.grid-4 (auto-fit, mobil einspaltig), .stack, .row, .badge, .icon, .reveal (opacity 0 + translateY, .reveal.visible sichtbar, mit Übergang; prefers-reduced-motion: sofort sichtbar), .sr-only. Dazu eine stilvolle Scrollbar und dezente Hintergrund-Details passend zum Stil.
Schreibe in einem \`\`\`js-Block (ohne <script>): IntersectionObserver für .reveal (Klasse visible, Verzögerung gestaffelt per data-delay), weiches Scrollen für a[href^="#"], [data-nav-toggle] toggelt .open auf [data-nav] und aria-expanded, Klick auf einen Link im Menü schließt es, [data-year] = aktuelles Jahr. Robust (prüfe, ob Elemente existieren).
Antworte nur mit den zwei Blöcken.`;
  const user = `${briefText(spec)}\n\nVorhandene Variablen:\n${baseVars(spec)}\n\n${CONTRACT}`;
  const { text } = await ask([{ role: 'system', content: sys }, { role: 'user', content: user }], { maxTokens: 4500, signal, effort: 'low' });
  return { css: fence(text, 'css'), js: fence(text, '(?:js|javascript)') };
}

// ── Schritt 3: Abschnitte ────────────────────────────────────────────
function sectionPrompt(spec, s, extra = '') {
  const isNav = s.id === 'nav';
  const isFooter = s.id === 'footer';
  const sys = `Du bist ein Spitzen-Frontend-Entwickler und Designer. Du baust EINEN Abschnitt einer größeren Seite – mit voller Hingabe, sehr detailliert und hochwertig.
Antworte mit genau diesen Blöcken:
\`\`\`html – das Element des Abschnitts: ${isNav ? `<header id="${s.id}" …>` : isFooter ? `<footer id="${s.id}" …>` : `<section id="${s.id}" class="vx-section" …>`} … (innen meist <div class="container">). Nur dieses eine Wurzel-Element, kein <html>/<body>/<style>/<script>.
\`\`\`css – nur Regeln für diesen Abschnitt, JEDE Regel beginnt mit #${s.id} (z. B. #${s.id} .titel { … }). Inklusive @media für Handy/Desktop und Hover-Zustände.
\`\`\`js – (nur wenn nötig) Code für diesen Abschnitt, ohne <script>, als (() => { const root = document.getElementById('${s.id}'); if (!root) return; … })(); – suche Elemente nur innerhalb von root.
${isNav ? 'Kopfzeile: sticky, leicht durchscheinend mit backdrop-filter, Logo/Name links, Menü-Links zu den Abschnitten (#id), auf dem Handy ein Menü-Knopf mit data-nav-toggle und das Menü mit data-nav (Klasse .open zeigt es).' : ''}${isFooter ? 'Fußzeile: Name, kurze Beschreibung, Links zu den Abschnitten, © <span data-year></span>. Keine erfundenen Kontaktdaten oder Social-Media-Konten.' : ''}
${s.size === 'large' ? 'Das ist der Hauptteil (App/Spiel): vollständig funktionsfähig, durchdacht, mit allen beschriebenen Funktionen, Zuständen, Punktestand/Speichern (localStorage) wo sinnvoll, Tastatur- UND Touch-Steuerung.' : 'Mache den Abschnitt reichhaltig: mehrere durchdachte Elemente, Inline-SVG-Icons, .reveal auf Elementen (mit data-delay 0–400 für Staffelung).'}
${CONTRACT}
${QUALITY}`;
  const user = `${briefText(spec)}\nStil-Details: ${spec.style}\n\nDEIN ABSCHNITT: id "${s.id}"\nZweck: ${s.goal}\nInhalt: ${s.content}\nInteraktion: ${s.interaction || '–'}${extra ? `\n\n${extra}` : ''}`;
  return [{ role: 'system', content: sys }, { role: 'user', content: user }];
}
function splitPart(text) {
  return { html: fence(text, 'html'), css: fence(text, 'css'), js: fence(text, '(?:js|javascript)') };
}
async function buildSection(spec, s, { signal, extra } = {}) {
  const maxTokens = s.size === 'large' ? 7000 : 4500;
  let r = await ask(sectionPrompt(spec, s, extra), { maxTokens, signal, effort: 'low' });
  let part = splitPart(r.text);
  if (r.cut || !part.html || !/<\/(section|header|footer|div|main)>\s*$/i.test(part.html)) {
    // abgeschnitten: noch einmal, etwas kompakter
    r = await ask(sectionPrompt(spec, s, `${extra ?? ''}\nWICHTIG: Deine letzte Fassung war zu lang und wurde abgeschnitten. Schreibe kompakter (weniger Wiederholungen, kürzere SVGs), aber vollständig.`), { maxTokens, signal, effort: 'low' });
    const again = splitPart(r.text);
    if (again.html) part = again;
  }
  if (!part.html) part.html = `<section id="${s.id}" class="vx-section"><div class="container"><h2>${esc(s.goal)}</h2></div></section>`;
  return part;
}

// ── Platzhalter / Fake-Inhalte erkennen ──────────────────────────────
const FAKE = [
  [/lorem ipsum|dolor sit amet/i, 'Lorem-ipsum-Blindtext'],
  [/example\.(com|org|de)/i, 'example.com-Adresse'],
  [/(picsum\.photos|placehold|placeholder\.com|via\.placeholder|dummyimage|unsplash\.it|source\.unsplash)/i, 'Platzhalter-/Zufallsbilder'],
  [/max mustermann|erika mustermann|john doe|jane doe|firma xy|musterfirma|musterstra(ß|ss)e/i, 'Muster-Namen/Adressen'],
  [/(\+49|0)\s?\(?(123|1234|30\s?123)\)?[\s\-/]?\d{3,}/, 'ausgedachte Telefonnummer'],
  [/(info|kontakt|hello|mail)@(deine|ihre|your|meine|domain|firma)[\w-]*\./i, 'ausgedachte E-Mail-Adresse'],
];
export function fakeCheck(text, allowed = '') {
  const ok = String(allowed).toLowerCase();
  return FAKE.filter(([re]) => {
    const hit = String(text).match(re)?.[0];
    return hit && !(ok && ok.includes(hit.toLowerCase())); // vom Nutzer selbst angegeben → ist echt
  }).map(([, label]) => label);
}

// HTML/JS eines Teils prüfen (Tags, Syntax, Fakes)
function checkPart(part, validate, allowed = '') {
  const problems = [];
  const mini = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>x</title></head><body>${part.html}</body></html>`;
  const v = validate(mini);
  if (!/^OK/.test(v)) problems.push(...v.split('\n').slice(1).map((l) => l.replace(/^- /, '')));
  if (part.js) { try { new vm.Script(part.js); } catch (err) { problems.push(`JavaScript-Fehler: ${err.message}`); } }
  for (const f of fakeCheck(part.html + part.js, allowed)) problems.push(`Enthält ${f} – ersetze das durch echte Inhalte aus dem Auftrag oder lass es weg.`);
  return problems.filter((p) => !/doctype|<title>|viewport|charset/i.test(p));
}

// ── Zusammenbauen und wieder zerlegen ────────────────────────────────
function fontLink(spec) {
  const fams = [...new Set([spec.fonts.heading, spec.fonts.body])].filter((f) => !/^(system-ui|inter|arial|helvetica)$/i.test(f) || f === 'Inter');
  if (!fams.length) return '';
  return `<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n<link rel="stylesheet" href="https://fonts.googleapis.com/css2?${fams.map((f) => `family=${encodeURIComponent(f).replace(/%20/g, '+')}:wght@400;500;600;700;800`).join('&')}&display=swap">`;
}
export function assemble(spec, base, parts) {
  const order = spec.sections.map((s) => s.id).filter((id) => parts[id]);
  const meta = { title: spec.title, lang: spec.lang, kind: spec.kind, style: spec.style, palette: spec.palette, fonts: spec.fonts, radius: spec.radius, sections: spec.sections.map(({ id, goal }) => ({ id, goal })) };
  return `<!doctype html>
<html lang="${esc(spec.lang)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(spec.title)}</title>
<meta name="description" content="${esc(spec.sections[1]?.goal ?? spec.title)}">
<meta name="theme-color" content="${spec.palette.bg}">
${fontLink(spec)}
<style id="vx-base">
${baseVars(spec)}
${base.css}
</style>
${order.map((id) => (parts[id].css ? `<style data-vx="${id}">\n${parts[id].css}\n</style>` : '')).filter(Boolean).join('\n')}
<script type="application/json" id="vx-spec">${JSON.stringify(meta).replace(/</g, '\\u003c')}</script>
</head>
<body>
${order.map((id) => `<!--vx:${id}-->\n${parts[id].html}\n<!--/vx:${id}-->`).join('\n')}
${order.map((id) => (parts[id].js ? `<script data-vx="${id}">\n${parts[id].js}\n</script>` : '')).filter(Boolean).join('\n')}
<script id="vx-base-js">
${base.js}
</script>
</body>
</html>`;
}

// Gebaute Seite wieder in Teile zerlegen (für gezielte Änderungen). null = keine Baukasten-Seite.
export function disassemble(html) {
  const specRaw = html.match(/<script type="application\/json" id="vx-spec">([\s\S]*?)<\/script>/)?.[1];
  if (!specRaw) return null;
  let meta;
  try { meta = JSON.parse(specRaw); } catch { return null; }
  const baseCss = html.match(/<style id="vx-base">([\s\S]*?)<\/style>/)?.[1] ?? '';
  const base = { css: baseCss.replace(/^\s*:root\{[^}]*\}\s*/, '').trim(), js: html.match(/<script id="vx-base-js">([\s\S]*?)<\/script>/)?.[1]?.trim() ?? '' };
  const parts = {};
  for (const m of html.matchAll(/<!--vx:([\w-]+)-->([\s\S]*?)<!--\/vx:\1-->/g)) parts[m[1]] = { html: m[2].trim(), css: '', js: '' };
  for (const m of html.matchAll(/<style data-vx="([\w-]+)">([\s\S]*?)<\/style>/g)) if (parts[m[1]]) parts[m[1]].css = m[2].trim();
  for (const m of html.matchAll(/<script data-vx="([\w-]+)">([\s\S]*?)<\/script>/g)) if (parts[m[1]]) parts[m[1]].js = m[2].trim();
  const sections = (meta.sections ?? []).filter((s) => parts[s.id]).map((s) => ({ ...s, content: '', interaction: '', size: 'normal' }));
  if (!sections.length) return null;
  return { spec: { ...meta, sections }, base, parts };
}

// Mehrere Aufgaben mit begrenzter Gleichzeitigkeit
async function pool(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) { const i = next++; out[i] = await fn(items[i], i); }
  }));
  return out;
}

async function repair(spec, parts, ids, { signal, onStep, validate }) {
  const allowed = `${spec.brief ?? ''} ${spec.sections.map((s) => s.content).join(' ')}`;
  const broken = ids.filter((id) => parts[id]).map((id) => [id, checkPart(parts[id], validate, allowed)]).filter(([, p]) => p.length);
  await pool(broken, 2, async ([id, problems]) => {
    onStep({ kind: 'check', text: `${id}: ${problems.length} ${problems.length === 1 ? 'Problem' : 'Probleme'} beheben` });
    const s = spec.sections.find((x) => x.id === id);
    const current = `Aktuelle Fassung:\n\`\`\`html\n${parts[id].html}\n\`\`\`\n\`\`\`css\n${parts[id].css}\n\`\`\`\n\`\`\`js\n${parts[id].js}\n\`\`\``;
    try {
      const fixed = await buildSection(spec, s, { signal, extra: `${current}\n\nBehebe diese Probleme und gib den kompletten, verbesserten Abschnitt zurück:\n- ${problems.join('\n- ')}` });
      if (fixed.html && checkPart(fixed, validate, allowed).length <= problems.length) parts[id] = fixed;
    } catch (err) { if (signal?.aborted) throw err; }
  });
}

const lineCount = (s) => s.split('\n').length;

// ── Öffentlich: neue Seite bauen ─────────────────────────────────────
export async function buildWebsite({ brief, kind = 'website', signal, onStep = () => {}, validate }) {
  const k = ['website', 'app', 'game'].includes(kind) ? kind : 'website';
  const text = String(brief ?? '').slice(0, 9000);
  onStep({ kind: 'draft', text: 'Aufbau, Farben und Schriften' });
  const spec = await architect(text, k, { signal });
  spec.brief = text;
  onStep({ kind: 'draft', text: `${spec.sections.length} Abschnitte: ${spec.sections.map((s) => s.id).join(', ')}` });
  // Basis und Abschnitte gleichzeitig (die Abschnitte kennen den Design-Vertrag); höchstens 2 Anfragen auf einmal
  const basePromise = (async () => { onStep({ kind: 'section', text: 'Design-System' }); return buildBase(spec, { signal }); })().catch((err) => { if (signal?.aborted) throw err; return null; });
  const parts = {};
  const tryBuild = async (s) => {
    try { return await buildSection(spec, s, { signal }); } catch (err) { if (signal?.aborted) throw err; return null; }
  };
  const built = await pool(spec.sections, 2, async (s) => {
    onStep({ kind: 'section', text: `Abschnitt „${s.id}“` });
    return tryBuild(s);
  });
  spec.sections.forEach((s, i) => { if (built[i]) parts[s.id] = built[i]; });
  // Was nicht geklappt hat (meist Limit): einzeln noch einmal
  for (const s of spec.sections.filter((x) => !parts[x.id])) {
    onStep({ kind: 'section', text: `Abschnitt „${s.id}“ (2. Versuch)` });
    const again = await tryBuild(s);
    if (again) parts[s.id] = again;
  }
  const missing = spec.sections.filter((s) => !parts[s.id]).map((s) => s.id);
  if (missing.length > spec.sections.length / 2) throw new Error('Die kostenlosen Modelle sind gerade zu ausgelastet, um die Seite fertig zu bauen. Bitte in ein paar Minuten nochmal versuchen.');
  for (const id of missing) {
    if (id === 'nav') parts.nav = { html: `<header id="nav"><div class="container row" style="justify-content:space-between;padding:16px 0"><b>${esc(spec.title)}</b></div></header>`, css: '', js: '' };
    else if (id === 'footer') parts.footer = { html: `<footer id="footer"><div class="container muted" style="padding:32px 0">© <span data-year></span> ${esc(spec.title)}</div></footer>`, css: '', js: '' };
  }
  spec.sections = spec.sections.filter((s) => parts[s.id]);
  let base = await basePromise;
  if (!base?.css) {
    onStep({ kind: 'section', text: 'Design-System (2. Versuch)' });
    base = await buildBase(spec, { signal }).catch((err) => { if (signal?.aborted) throw err; return null; });
  }
  if (!base?.css) base = DEFAULT_BASE;
  onStep({ kind: 'check', text: 'Webseite prüfen' });
  await repair(spec, parts, spec.sections.map((s) => s.id), { signal, onStep, validate });
  const html = assemble(spec, base, parts);
  return { html, report: summary(spec, html, validate) + (missing.length ? `\nNicht fertig geworden (Limit): ${missing.join(', ')} – biete an, sie mit edit_website nachzubauen.` : '') };
}

// Eingebautes Design-System, falls das Modell keins liefern konnte
const DEFAULT_BASE = {
  css: `*,*::before,*::after{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;background:var(--bg);color:var(--text);font-family:var(--font-body);line-height:1.6;-webkit-font-smoothing:antialiased;overflow-x:hidden}
img,svg{max-width:100%;display:block}h1,h2,h3,h4{font-family:var(--font-head);line-height:1.15;margin:0 0 .5em;letter-spacing:-.01em}h1{font-size:clamp(2.2rem,6vw,4.2rem)}h2{font-size:clamp(1.7rem,4vw,2.8rem)}h3{font-size:clamp(1.15rem,2.2vw,1.45rem)}p{margin:0 0 1em}
a{color:var(--primary)}::selection{background:var(--primary);color:var(--primary-contrast)}:focus-visible{outline:3px solid var(--accent);outline-offset:3px}
.container{width:100%;max-width:var(--max);margin:0 auto;padding:0 var(--space)}.vx-section{padding:clamp(56px,9vw,120px) 0}
.eyebrow{display:inline-block;font-size:.8rem;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:var(--primary);margin-bottom:.8em}.lead{font-size:clamp(1.05rem,2vw,1.3rem);color:var(--muted);max-width:60ch}.muted{color:var(--muted)}
.btn{display:inline-flex;align-items:center;gap:.5em;padding:.85em 1.4em;border-radius:999px;border:1px solid transparent;font:600 1rem/1 var(--font-body);cursor:pointer;text-decoration:none;transition:transform .15s,box-shadow .2s,background .2s}.btn:active{transform:scale(.97)}
.btn-primary{background:var(--primary);color:var(--primary-contrast);box-shadow:var(--shadow)}.btn-primary:hover{box-shadow:var(--shadow-lg);transform:translateY(-2px)}.btn-ghost{background:transparent;color:var(--text);border-color:var(--border)}.btn-ghost:hover{background:var(--surface-2)}
.card{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-lg);padding:clamp(18px,3vw,28px);box-shadow:var(--shadow);transition:transform .2s,box-shadow .2s}.card:hover{transform:translateY(-4px);box-shadow:var(--shadow-lg)}
.grid{display:grid;gap:var(--space);grid-template-columns:repeat(auto-fit,minmax(min(100%,260px),1fr))}.grid-2{grid-template-columns:repeat(auto-fit,minmax(min(100%,340px),1fr))}.grid-3{grid-template-columns:repeat(auto-fit,minmax(min(100%,240px),1fr))}.grid-4{grid-template-columns:repeat(auto-fit,minmax(min(100%,200px),1fr))}
.stack>*+*{margin-top:var(--space)}.row{display:flex;flex-wrap:wrap;gap:12px;align-items:center}.badge{display:inline-flex;align-items:center;gap:.4em;padding:.3em .8em;border-radius:999px;background:var(--surface-2);color:var(--text);font-size:.85rem;font-weight:600}.icon{width:24px;height:24px;flex:none}
.reveal{opacity:0;transform:translateY(24px);transition:opacity .7s ease,transform .7s cubic-bezier(.2,.8,.2,1)}.reveal.visible{opacity:1;transform:none}
.sr-only{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
@media (prefers-reduced-motion:reduce){html{scroll-behavior:auto}.reveal{opacity:1;transform:none;transition:none}*{animation:none!important}}`,
  js: `(() => {
  const items = document.querySelectorAll('.reveal');
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver((entries) => entries.forEach((e) => { if (e.isIntersecting) { setTimeout(() => e.target.classList.add('visible'), Number(e.target.dataset.delay || 0)); io.unobserve(e.target); } }), { threshold: 0.12 });
    items.forEach((n) => io.observe(n));
  } else items.forEach((n) => n.classList.add('visible'));
  const toggle = document.querySelector('[data-nav-toggle]');
  const nav = document.querySelector('[data-nav]');
  if (toggle && nav) {
    toggle.addEventListener('click', () => { const open = nav.classList.toggle('open'); toggle.setAttribute('aria-expanded', String(open)); });
    nav.querySelectorAll('a').forEach((a) => a.addEventListener('click', () => { nav.classList.remove('open'); toggle.setAttribute('aria-expanded', 'false'); }));
  }
  document.querySelectorAll('[data-year]').forEach((n) => { n.textContent = new Date().getFullYear(); });
})();`,
};

function summary(spec, html, validate) {
  const v = validate(html);
  const fakes = fakeCheck(html, spec.brief ?? '');
  return `Webseite „${spec.title}“ gebaut: ${lineCount(html)} Zeilen, Abschnitte: ${spec.sections.map((s) => s.id).join(', ')}. Farben: ${spec.palette.primary}/${spec.palette.accent}, Schriften: ${spec.fonts.heading}/${spec.fonts.body}.\nPrüfung: ${v}${fakes.length ? `\nHinweis – möglicherweise Platzhalter: ${fakes.join(', ')}` : ''}\nDie Seite wird automatisch an deine Antwort angehängt. Schreibe den Code NICHT selbst, sondern nur kurz (2–4 Sätze), was die Seite kann, und frage, was du ändern oder ergänzen sollst.`;
}

// ── Öffentlich: bestehende Seite gezielt ändern ──────────────────────
export async function editWebsite({ html, change, signal, onStep = () => {}, validate }) {
  const page = disassemble(String(html ?? ''));
  if (!page) return editWhole({ html, change, signal, onStep, validate });
  const { spec, base, parts } = page;
  spec.brief = `${change}\n${html}`; // was schon auf der Seite stand oder der Nutzer angibt, gilt als echt
  onStep({ kind: 'draft', text: 'Welche Teile sich ändern' });
  const outline = spec.sections.map((s) => {
    const txt = parts[s.id].html.replace(/<svg[\s\S]*?<\/svg>/gi, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 220);
    return `- ${s.id} (${s.goal}): ${txt}`;
  }).join('\n');
  const sys = `Du planst eine Änderung an einer bestehenden Webseite. Antworte NUR mit JSON in einem \`\`\`json-Block:
{"edit":[{"id":"abschnitt-id","what":"genau was dort geändert werden soll"}],"add":[{"after":"id des Abschnitts davor","id":"neue-id","goal":"Zweck","content":"alle Inhalte","interaction":"…","size":"normal"}],"remove":["id"],"design":"Änderung am Design-System (Farben, Schriften, Rundungen, globale Effekte) oder leer","palette":{"primary":"#…"}}
Ändere nur, was nötig ist. Globale Farbwünsche → "palette" (nur die geänderten Farben) und/oder "design". Neue Inhalte nur aus dem Wunsch – nichts erfinden.`;
  const { text } = await ask([{ role: 'system', content: sys }, { role: 'user', content: `${briefText(spec)}\n\nAbschnitte:\n${outline}\n\nÄnderungswunsch:\n${change}` }], { maxTokens: 2500, signal, effort: 'medium' });
  let plan;
  try { plan = parseJson(text); } catch { plan = { edit: spec.sections.map((s) => ({ id: s.id, what: change })) }; }

  for (const [k, v] of Object.entries(plan.palette ?? {})) if (k in spec.palette) spec.palette[k] = cssColor(v, spec.palette[k]);
  const removed = new Set((plan.remove ?? []).filter((id) => parts[id] && !['nav', 'footer'].includes(id)));
  for (const id of removed) { delete parts[id]; spec.sections = spec.sections.filter((s) => s.id !== id); onStep({ kind: 'edit', text: `„${id}“ entfernt` }); }
  const adds = (plan.add ?? []).slice(0, 4).map((a, i) => ({ ...a, id: safeId(a.id, i), goal: String(a.goal ?? ''), content: String(a.content ?? ''), interaction: String(a.interaction ?? ''), size: a.size === 'large' ? 'large' : 'normal' }))
    .filter((a) => !parts[a.id]);
  for (const a of adds) {
    const at = spec.sections.findIndex((s) => s.id === a.after);
    spec.sections.splice(at >= 0 ? at + 1 : Math.max(1, spec.sections.length - 1), 0, { id: a.id, goal: a.goal, content: a.content, interaction: a.interaction, size: a.size });
  }
  const edits = (plan.edit ?? []).filter((e) => parts[e.id]).slice(0, 8);
  const tasks = [
    ...edits.map((e) => async () => {
      onStep({ kind: 'edit', text: `Abschnitt „${e.id}“` });
      const s = spec.sections.find((x) => x.id === e.id);
      const current = `Aktuelle Fassung:\n\`\`\`html\n${parts[e.id].html}\n\`\`\`\n\`\`\`css\n${parts[e.id].css}\n\`\`\`\n\`\`\`js\n${parts[e.id].js}\n\`\`\``;
      const next = await buildSection(spec, { ...s, content: s.content || 'wie in der aktuellen Fassung' }, { signal, extra: `${current}\n\nÄNDERUNG: ${e.what}\nBehalte alles andere bei und gib den kompletten, geänderten Abschnitt zurück.` });
      if (next.html) parts[e.id] = next;
    }),
    ...adds.map((a) => async () => {
      onStep({ kind: 'section', text: `Neuer Abschnitt „${a.id}“` });
      parts[a.id] = await buildSection(spec, a, { signal });
    }),
  ];
  let newBase = base;
  if (String(plan.design ?? '').trim()) {
    tasks.push(async () => {
      onStep({ kind: 'edit', text: 'Design-System' });
      const sys2 = 'Ändere das Design-System (CSS + JS) wie gewünscht. Gib beide Blöcke vollständig zurück (```css und ```js). :root-Variablen nicht neu definieren.';
      const r = await ask([{ role: 'system', content: sys2 }, { role: 'user', content: `${briefText(spec)}\n\n\`\`\`css\n${base.css}\n\`\`\`\n\`\`\`js\n${base.js}\n\`\`\`\n\nÄnderung: ${plan.design}` }], { maxTokens: 4500, signal, effort: 'low' });
      const css = fence(r.text, 'css');
      if (css) newBase = { css, js: fence(r.text, '(?:js|javascript)') || base.js };
    });
  }
  if (!tasks.length && !Object.keys(plan.palette ?? {}).length && !removed.size) {
    // Planer hat nichts gefunden → alle Abschnitte mit dem Wunsch überarbeiten wäre zu viel; nur den passendsten
    return editWhole({ html, change, signal, onStep, validate });
  }
  await pool(tasks, 3, (fn) => fn());
  const changed = [...edits.map((e) => e.id), ...adds.map((a) => a.id)];
  onStep({ kind: 'check', text: 'Änderungen prüfen' });
  await repair(spec, parts, changed, { signal, onStep, validate });
  const out = assemble(spec, newBase, parts);
  return { html: out, report: summary(spec, out, validate).replace(/gebaut/, 'geändert') };
}

// Seiten ohne Baukasten-Markierungen: als Ganzes überarbeiten (klappt nur bei nicht zu großen Seiten)
async function editWhole({ html, change, signal, onStep, validate }) {
  onStep({ kind: 'edit', text: 'Ganze Seite' });
  const sys = `Ändere die Webseite wie gewünscht und gib die KOMPLETTE neue Datei in einem \`\`\`html-Block zurück. Behalte alles bei, was nicht geändert werden soll.\n${QUALITY}`;
  const r = await ask([{ role: 'system', content: sys }, { role: 'user', content: `\`\`\`html\n${html}\n\`\`\`\n\nÄnderung: ${change}` }], { maxTokens: 8000, signal, effort: 'low' });
  const out = fence(r.text, 'html?');
  if (!out || !/<\/html>/i.test(out)) throw new Error('Die Änderung hat nicht geklappt (Seite zu groß). Lass mich die Seite neu bauen.');
  return { html: out, report: `Seite geändert (${lineCount(out)} Zeilen). Prüfung: ${validate(out)}\nDie Seite wird automatisch angehängt – schreibe nur kurz, was du geändert hast.` };
}

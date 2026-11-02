// Agent X intern – ohne neue Knöpfe, automatisch je nach Frage:
//   DeepSearch: Recherchefragen → mehrere Suchen, mehrere Seiten lesen, Antwort mit nummerierten Quellen [n]
//   Heavy:      schwere Fragen  → 2–3 starke Modelle antworten parallel, das stärkste fasst zur besten Antwort zusammen
// Beide fallen still auf den normalen Agent-Ablauf zurück, wenn etwas nicht klappt.
import { completeBest, complete, rankModels, listModels } from './models.js';
import { searchWeb, readPage } from './search.js';
import { basePrompt } from './prompt.js';
import { t } from './i18n.js';

const DEFAULT_DEPS = { searchWeb, readPage, completeBest, complete, rankModels, listModels };

// Bauen, Präsentationen, Links, Erinnerungen: das kann der normale Ablauf mit seinen Werkzeugen besser
const BUILD = /\b(webseite|website|homepage|landing ?page|web-?app|app bauen|spiel|game|html|präsentation|folien|slides|referat|vortrag|erinner\w*|remind\w*|merk dir|remember)\b/i;
const RESEARCH = /(recherch\w*|research|deep ?search|quellen\b|\bsources\b|überblick|übersicht|vergleich\w*|\bcompare\b|unterschied\w*|vor- und nachteile|pros and cons|was gibt es neues|neuigkeiten|aktuelle[nr]? (stand|lage|entwicklung\w*|news|nachrichten)|current state|latest news|marktübersicht|testbericht\w*|beste[nrs]? .{0,40}(20\d\d|kaufen|im test)|studie\w*|studies|statistik\w*|wer hat .{0,40}gewonnen|was ist .{0,20}passiert)/i;
const HARD = /(beweis\w*|\bprove\b|herleit\w*|leite .{0,40} her|\bderive\b|\blöse\b|\bsolve\b|gleichung\w*|equation|integral\w*|ableitung\w*|wahrscheinlichkeit\w*|probability|optimier\w*|algorithm\w*|komplexität|rätsel|riddle|logik\w*|knobel\w*|schritt für schritt|step by step|analysier\w*|\banaly[sz]e\b|bewerte\b|strategie\w*|warum genau|ausführlich erklär\w*|explain in detail|debug\w*)/i;
const hasUrl = (q) => /https?:\/\//i.test(q);

export function isResearch(q = '') {
  const s = String(q);
  return s.length >= 20 && RESEARCH.test(s) && !BUILD.test(s) && !hasUrl(s);
}
export function isHard(q = '') {
  const s = String(q);
  if (s.length < 15 || BUILD.test(s) || hasUrl(s) || isResearch(s)) return false;
  return HARD.test(s) || (s.length > 350 && s.includes('?'));
}

const TRUSTED = /(^|\.)(wikipedia\.org|\.gov|\.gv\.at|admin\.ch|bund\.de|europa\.eu|who\.int|tagesschau\.de|zdf\.de|spiegel\.de|zeit\.de|faz\.net|sueddeutsche\.de|reuters\.com|apnews\.com|bbc\.(co\.uk|com)|nytimes\.com|theguardian\.com|nature\.com|github\.com|mozilla\.org|\.edu)$/i;
const hostOf = (u) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return ''; } };
const textOf = (m) => (typeof m?.content === 'string' ? m.content : Array.isArray(m?.content) ? m.content.filter((p) => p.type === 'text').map((p) => p.text).join(' ') : '');
const clip = (s, n) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, n);

// Persönliches (Gedächtnis + eigene Anweisungen) für die internen Antworten
function personalPrompt(personal = {}) {
  return [
    basePrompt({ memories: personal.memoryOn ? personal.memories : [] }),
    personal.instructions ? `How the user wants you to answer (from their settings):\n"""\n${personal.instructions}\n"""` : null,
    personal.summary ? `Summary of the earlier conversation:\n${personal.summary}` : null,
  ].filter(Boolean).join('\n\n');
}

// Suchanfragen planen (3–4 verschiedene Blickwinkel)
async function planQueries(question, history, deps, signal) {
  const earlier = history.filter((m) => m.role === 'user').slice(-3, -1).map((m) => clip(textOf(m), 200));
  try {
    const msg = await deps.completeBest('smart', {
      maxTokens: 400,
      reasoningEffort: 'low',
      timeoutMs: 30_000,
      messages: [{ role: 'user', content: `${earlier.length ? `Earlier questions in this chat:\n${earlier.map((e) => `- ${e}`).join('\n')}\n\n` : ''}Research question: ${question}\n\nWrite 3 or 4 different, precise web search queries that together cover this question (different angles, include the year if it is about current things). Use the language that gives the best results (usually the user's language, English for international/technical topics). Answer ONLY with JSON: {"queries": ["...", "..."]}` }],
    }, { signal });
    const json = JSON.parse(String(msg.content).replace(/^[\s\S]*?(\{[\s\S]*\})[\s\S]*$/, '$1'));
    const list = (json.queries ?? []).map((q) => clip(q, 160)).filter((q) => q.length > 2);
    if (list.length) return [...new Set(list)].slice(0, 4);
  } catch (err) {
    if (signal?.aborted) throw err;
  }
  return [clip(question, 160)];
}

// Ergebnisse zusammenführen: mehrfach gefunden und seriös = weiter oben
function mergeResults(lists) {
  const map = new Map();
  lists.forEach((list) => list.forEach((r, pos) => {
    const key = r.url.replace(/[#?].*$/, '').replace(/\/$/, '').toLowerCase();
    const hit = map.get(key);
    if (hit) { hit.hits++; hit.pos = Math.min(hit.pos, pos); if (!hit.snippet && r.snippet) hit.snippet = r.snippet; return; }
    map.set(key, { ...r, hits: 1, pos });
  }));
  return [...map.values()]
    .map((r) => ({ ...r, score: (TRUSTED.test(hostOf(r.url)) ? 3 : 0) + r.hits * 2 - r.pos * 0.4 }))
    .sort((a, b) => b.score - a.score);
}

// DeepSearch: gibt true zurück, wenn die Antwort fertig geschrieben wurde
export async function deepResearch({ question, history = [], personal = {}, signal, onStep = () => {}, onReasoning = () => {}, addSources, write }, deps = DEFAULT_DEPS) {
  const queries = await planQueries(question, history, deps, signal);
  queries.forEach((q) => onStep({ kind: 'search', text: q }));
  const found = await Promise.allSettled(queries.map((q) => deps.searchWeb(q, { signal, max: 6 })));
  if (signal?.aborted) throw new Error('aborted');
  const merged = mergeResults(found.filter((r) => r.status === 'fulfilled').map((r) => r.value.results ?? []));
  if (!merged.length) return false;

  // die besten Seiten (verschiedene Webseiten) ganz lesen
  const toRead = [];
  const hosts = new Set();
  for (const r of merged) {
    const h = hostOf(r.url);
    if (!h || hosts.has(h) || /youtube\.com|youtu\.be|tiktok\.com|instagram\.com|facebook\.com|x\.com|twitter\.com/.test(h)) continue;
    hosts.add(h);
    toRead.push(r);
    if (toRead.length >= 4) break;
  }
  toRead.forEach((r) => onStep({ kind: 'read', text: `${hostOf(r.url)}${(() => { try { const p = new URL(r.url).pathname; return p.length > 1 ? p.slice(0, 50) : ''; } catch { return ''; } })()}` }));
  const pages = await Promise.allSettled(toRead.map((r) => deps.readPage(r.url, { signal })));
  if (signal?.aborted) throw new Error('aborted');
  const read = new Map();
  pages.forEach((p, i) => { if (p.status === 'fulfilled' && p.value?.text?.trim()) read.set(toRead[i].url, p.value); });

  // Quellen-Liste: gelesene Seiten zuerst, dann weitere Treffer – feste Nummern wie in der App
  const chosen = [...toRead.filter((r) => read.has(r.url)), ...merged.filter((r) => !read.has(r.url))].slice(0, 10);
  const nums = addSources(chosen.map((r) => ({ url: r.url, title: read.get(r.url)?.title || r.title })));
  const blocks = chosen.map((r, i) => {
    if (!nums[i]) return null;
    const page = read.get(r.url);
    const body = page ? clip(page.text, 2600) : clip(r.snippet, 450);
    return `[${nums[i]}] ${page?.title || r.title}${r.date ? ` (${r.date})` : ''}\n${r.url}\n${body || '(no text)'}`;
  }).filter(Boolean);
  if (!blocks.length) return false;

  const msg = await deps.completeBest('agent', {
    maxTokens: 3500,
    reasoningEffort: 'medium',
    timeoutMs: 120_000,
    messages: [
      { role: 'system', content: `${personalPrompt(personal)}\n\nYou are Agent X doing DEEP RESEARCH. Write a thorough, well-structured answer based on the numbered sources below: start with a short direct answer (2–3 sentences), then details in sections or bullet points, a table if things are compared, and a short conclusion. Cite every fact directly after the sentence with its number in square brackets, e.g. [1] or [2][4] – only numbers from the list, never invent sources, URLs or facts. Mention dates where relevant. If sources disagree, say so. If something important was not found, say that honestly. Do not add a source list at the end (the app shows the sources).` },
      ...history.slice(-6, -1).filter((m) => m.role === 'user' || m.role === 'assistant').map((m) => ({ role: m.role, content: clip(textOf(m), 1500) })),
      { role: 'user', content: `${question}\n\n---\nSources (searched for: ${queries.join(' | ')}):\n\n${blocks.join('\n\n')}` },
    ],
  }, { signal });
  const thought = msg.reasoning ?? msg.reasoning_content;
  if (thought) onReasoning(String(thought).trim());
  await write(String(msg.content ?? '').trim());
  return true;
}

// Heavy: mehrere starke, verschiedene Modelle (nicht zweimal dasselbe Modell bei zwei Anbietern)
function pickHeavyModels(all, deps, max = 3) {
  const out = [];
  const families = new Set();
  for (const m of deps.rankModels('smart', all, { cap: 'text' })) {
    const family = String(m.upstream).split('/').pop().replace(/:free$/, '').replace(/-(it|instruct|preview)$/, '').toLowerCase();
    if (families.has(family)) continue;
    families.add(family);
    out.push(m);
    if (out.length >= max) break;
  }
  return out;
}

export async function heavyAnswer({ question, history = [], personal = {}, signal, onStep = () => {}, onReasoning = () => {}, write }, deps = DEFAULT_DEPS) {
  const models = pickHeavyModels(await deps.listModels(), deps);
  if (models.length < 2) return false;
  onStep({ kind: 'other', text: t(`${models.length} Modelle gleichzeitig: ${models.map((m) => m.name).join(', ')}`, `${models.length} models at once: ${models.map((m) => m.name).join(', ')}`) });
  const system = `${personalPrompt(personal)}\n\nThink carefully and give your best, complete and correct answer. Show the important steps for calculations or proofs.`;
  const convo = [
    { role: 'system', content: system },
    ...history.slice(-8).filter((m) => m.role === 'user' || m.role === 'assistant').map((m) => ({ role: m.role, content: clip(textOf(m), 3000) })),
  ];
  if (convo.at(-1)?.role !== 'user') convo.push({ role: 'user', content: question });
  const answers = await Promise.allSettled(models.map((m) => deps.complete({ model: m.id, messages: convo, signal, maxTokens: 2500, reasoningEffort: 'high', timeoutMs: 100_000 })));
  if (signal?.aborted) throw new Error('aborted');
  const ok = answers.map((r, i) => (r.status === 'fulfilled' && String(r.value.content ?? '').trim() ? { model: models[i], text: String(r.value.content).trim() } : null)).filter(Boolean);
  if (!ok.length) return false;
  if (ok.length === 1) { await write(ok[0].text); return true; }

  onStep({ kind: 'check', text: t('die Antworten gegenseitig und fasst die beste zusammen', 'the answers against each other and merges the best one') });
  let final;
  try {
    final = await deps.completeBest('agent', {
      maxTokens: 3500,
      reasoningEffort: 'medium',
      timeoutMs: 120_000,
      messages: [
        { role: 'system', content: `${personalPrompt(personal)}\n\nYou are the final judge. Several AI models answered the same question. Check them against each other: find mistakes, keep what is correct and most helpful, resolve contradictions (recompute if needed). Then write ONE best final answer for the user – complete, correct and well formatted. Do not mention the other models or that there were several answers.` },
        { role: 'user', content: `Question:\n${question}\n\n${ok.map((a, i) => `--- Answer ${String.fromCharCode(65 + i)} ---\n${a.text.slice(0, 7000)}`).join('\n\n')}` },
      ],
    }, { signal });
  } catch (err) {
    if (signal?.aborted) throw err;
    await write(ok[0].text); // Zusammenfassen ging nicht → die Antwort des stärksten Modells
    return true;
  }
  const thought = final.reasoning ?? final.reasoning_content;
  if (thought) onReasoning(String(thought).trim());
  await write(String(final.content ?? '').trim() || ok[0].text);
  return true;
}

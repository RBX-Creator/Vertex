// Echte Websuche für den Web-Modus und Agent X.
// Reihenfolge: Tavily (TAVILY_API_KEY) → Exa (EXA_API_KEY) → Groq gpt-oss mit browser_search → Wikipedia.
// Fehlt ein Schlüssel, wird der Anbieter still übersprungen. Ergebnisse 10 Minuten im Speicher.
import { complete, rankModels, listModels, makeSource, demoMode } from './models.js';
import { registerCache } from './stability.js';
import { lang } from './i18n.js';

const keyOf = (name) => String(process.env[name] ?? '').trim();
const UA = 'VAIs-Search/1.0 (https://vais-dvvk.onrender.com)';
const clip = (s, n) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
const timeout = (signal, ms) => (signal ? AbortSignal.any([signal, AbortSignal.timeout(ms)]) : AbortSignal.timeout(ms));
const strip = (html) => String(html ?? '').replace(/<[^>]+>/g, '').replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&#39;/g, "'");

// Welche Suchen gibt es? (für den Admin-Bereich)
export function searchStatus() {
  return {
    tavily: !!keyOf('TAVILY_API_KEY'),
    exa: !!keyOf('EXA_API_KEY'),
    groq: !!keyOf('GROQ_API_KEY') || null, // null = vielleicht über Admin-Schlüssel
    wikipedia: true,
  };
}

const PROVIDERS = {
  async tavily(query, { max, signal }) {
    const key = keyOf('TAVILY_API_KEY');
    if (!key) return null;
    const res = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      signal: timeout(signal, 12_000),
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, max_results: max, search_depth: 'basic', include_answer: false, include_raw_content: false }),
    });
    if (!res.ok) throw new Error(`Tavily ${res.status}`);
    const data = await res.json();
    return (data.results ?? []).map((r) => ({ url: r.url, title: r.title, snippet: r.content, date: r.published_date ?? null }));
  },

  async exa(query, { max, signal }) {
    const key = keyOf('EXA_API_KEY');
    if (!key) return null;
    const res = await fetch('https://api.exa.ai/search', {
      method: 'POST',
      signal: timeout(signal, 12_000),
      headers: { 'x-api-key': key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, numResults: max, type: 'auto', contents: { text: { maxCharacters: 900 } } }),
    });
    if (!res.ok) throw new Error(`Exa ${res.status}`);
    const data = await res.json();
    return (data.results ?? []).map((r) => ({ url: r.url, title: r.title, snippet: r.text ?? r.summary ?? '', date: r.publishedDate ?? null }));
  },

  // Groq: gpt-oss sucht selbst (browser_search) – liefert Links + eine kurze Zusammenfassung
  async groq(query, { max, signal }) {
    const model = rankModels('web', await listModels(), { cap: 'web' })[0];
    if (!model) return null;
    const msg = await complete({
      model: model.id,
      signal,
      timeoutMs: 45_000,
      maxTokens: 1200,
      reasoningEffort: 'low',
      messages: [
        { role: 'system', content: 'You are a search engine. Search the web and list the best results. For EACH result write one line: "- [Title](https://full.url) – one or two sentences with the key facts (with dates if relevant)". Prefer reputable, current sources. No other text.' },
        { role: 'user', content: query },
      ],
    });
    const text = String(msg.content ?? '').replace(/\s*【[^】]*】/g, '');
    const out = [];
    for (const m of text.matchAll(/\[([^\]\n]{1,200})\]\((https?:\/\/[^\s)]+)\)\s*[–—:-]?\s*([^\n]*)/g)) out.push({ url: m[2], title: m[1], snippet: m[3] });
    for (const s of msg.sources ?? []) if (!out.some((r) => r.url === s.url)) out.push({ url: s.url, title: s.title, snippet: '' });
    return out.slice(0, max);
  },

  async wikipedia(query, { max, signal, language }) {
    const code = /^[a-z]{2,3}$/.test(String(language ?? '')) ? language : 'de';
    const res = await fetch(`https://${code}.wikipedia.org/w/rest.php/v1/search/page?q=${encodeURIComponent(query)}&limit=${Math.min(max, 5)}`, {
      signal: timeout(signal, 10_000),
      headers: { 'User-Agent': UA, 'Api-User-Agent': UA, Accept: 'application/json' },
    });
    if (!res.ok) throw new Error(`Wikipedia ${res.status}`);
    const data = await res.json();
    return (data.pages ?? []).map((p) => ({
      url: `https://${code}.wikipedia.org/wiki/${encodeURIComponent(p.key)}`,
      title: `${p.title} – Wikipedia`,
      snippet: [p.description, strip(p.excerpt)].filter(Boolean).join(' – '),
    }));
  },
};
const ORDER = ['tavily', 'exa', 'groq', 'wikipedia'];

const cache = new Map(); // 'sprache|anfrage' → { at, value }
registerCache('search', () => cache.clear());
const TTL = 10 * 60 * 1000;

function clean(list, max) {
  const seen = new Set();
  const out = [];
  for (const r of list ?? []) {
    const src = makeSource(r.url, strip(r.title));
    if (!src) continue;
    const key = src.url.replace(/[#?].*$/, '').replace(/\/$/, '').toLowerCase();
    if (seen.has(key) || /google\.[a-z.]+\/(search|url)|bing\.com\/search|duckduckgo\.com\/\?/i.test(src.url)) continue;
    seen.add(key);
    out.push({ ...src, snippet: clip(strip(r.snippet), 700), date: r.date ? String(r.date).slice(0, 10) : null });
    if (out.length >= max) break;
  }
  return out;
}

// Suche mit Ersatz-Anbietern. Ergebnis: { provider, results: [{ url, title, snippet, date }], tried }
export async function searchWeb(query, { max = 6, signal, language = lang() } = {}) {
  const q = clip(query, 300);
  if (!q) return { provider: null, results: [], tried: [] };
  if (demoMode) {
    return { provider: 'demo', tried: ['demo'], results: [
      { url: 'https://de.wikipedia.org/wiki/Berlin', title: 'Berlin – Wikipedia', snippet: 'Berlin ist die Hauptstadt Deutschlands und hat rund 3,8 Millionen Einwohner.', date: null },
      { url: 'https://www.wetter.com/deutschland/berlin/', title: 'Wetter Berlin | wetter.com', snippet: 'Morgen bewölkt, etwa 8 °C, kaum Regen.', date: null },
    ] };
  }
  const ck = `${language}|${q.toLowerCase()}`;
  const hit = cache.get(ck);
  if (hit && Date.now() - hit.at < TTL) return hit.value;
  const tried = [];
  for (const name of ORDER) {
    if (signal?.aborted) break;
    try {
      const raw = await PROVIDERS[name](q, { max, signal, language });
      if (raw === null) continue; // kein Schlüssel / kein Modell → still überspringen
      tried.push(name);
      const results = clean(raw, max);
      if (results.length) {
        const value = { provider: name, results, tried };
        cache.set(ck, { at: Date.now(), value });
        if (cache.size > 300) cache.delete(cache.keys().next().value);
        return value;
      }
    } catch (err) {
      if (signal?.aborted) throw err;
      tried.push(`${name}:fehler`);
      console.error(`Suche (${name}) fehlgeschlagen:`, err.message);
    }
  }
  return { provider: null, results: [], tried };
}

// Ergebnisse als nummerierter Block für die Systemnachricht
export function resultsPrompt(results, { query } = {}) {
  if (!results.length) return null;
  return [
    `Web search results for "${clip(query, 200)}" (numbered):`,
    ...results.map((r, i) => `[${i + 1}] ${r.title}${r.date ? ` (${r.date})` : ''}\n${r.url}\n${r.snippet || '(no snippet)'}`),
    '',
    'Answer the user using these results. Cite every fact from them right after the sentence with its number in square brackets, e.g. [1] or [2][3]. Only use numbers from this list, never invent sources or URLs, and do not add a separate source list at the end (the app shows the sources). If the results do not answer the question, say so and answer from your own knowledge, marked as such.',
  ].join('\n\n');
}

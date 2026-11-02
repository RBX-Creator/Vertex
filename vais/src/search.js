// Echte Websuche für den Web-Modus und Agent X.
// Reihenfolge: Tavily (TAVILY_API_KEY) → Exa (EXA_API_KEY) → Jina (JINA_API_KEY) → Groq gpt-oss mit browser_search → Wikipedia.
// Seiten lesen: direkt (mit Schutz vor internen Adressen), bei Fehlern oder JavaScript-Seiten über Jina Reader (geht ohne Schlüssel).
// Fehlt ein Schlüssel, wird der Anbieter still übersprungen. Ergebnisse 10 Minuten im Speicher.
import { complete, rankModels, listModels, makeSource, demoMode } from './models.js';
import { registerCache } from './stability.js';
import { lookup } from 'node:dns/promises';
import net from 'node:net';
import { lang, t } from './i18n.js';

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
    jina: !!keyOf('JINA_API_KEY'),
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

  // Jina Search braucht einen (kostenlosen) Schlüssel
  async jina(query, { max, signal }) {
    const key = keyOf('JINA_API_KEY');
    if (!key) return null;
    const res = await fetch(`https://s.jina.ai/?q=${encodeURIComponent(query)}`, {
      signal: timeout(signal, 15_000),
      headers: { Authorization: `Bearer ${key}`, Accept: 'application/json', 'X-Respond-With': 'no-content' },
    });
    if (!res.ok) throw new Error(`Jina ${res.status}`);
    const data = await res.json();
    return (data.data ?? []).slice(0, max).map((r) => ({ url: r.url, title: r.title, snippet: r.description ?? r.content ?? '', date: r.date ?? null }));
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
const ORDER = ['tavily', 'exa', 'jina', 'groq', 'wikipedia'];

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

// ── Webseiten lesen ─────────────────────────────────────────────
export function isPrivateIp(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    return a === 0 || a === 10 || a === 127 || a >= 224 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254)
      || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 192 && b === 0) || (a === 198 && (b === 18 || b === 19));
  }
  const v6 = ip.toLowerCase();
  if (v6.startsWith('::ffff:')) return isPrivateIp(v6.slice(7));
  return v6 === '::' || v6 === '::1' || v6.startsWith('fc') || v6.startsWith('fd') || v6.startsWith('fe8') || v6.startsWith('fe9') || v6.startsWith('fea') || v6.startsWith('feb');
}

export async function assertPublicUrl(raw) {
  let url;
  try { url = new URL(raw); } catch { throw new Error(t('Ungültige Adresse.', 'Invalid address.')); }
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error(t('Nur http- und https-Adressen sind erlaubt.', 'Only http and https addresses are allowed.'));
  if (url.username || url.password) throw new Error(t('Adressen mit Zugangsdaten sind nicht erlaubt.', 'Addresses with credentials are not allowed.'));
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (/^localhost$|\.local$|\.internal$/i.test(host)) throw new Error(t('Diese Adresse ist nicht erlaubt.', 'This address is not allowed.'));
  const addrs = net.isIP(host) ? [{ address: host }] : await lookup(host, { all: true });
  if (!addrs.length || addrs.some((a) => isPrivateIp(a.address))) throw new Error(t('Diese Adresse ist nicht erlaubt.', 'This address is not allowed.'));
  return url;
}

export function htmlToText(html) {
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim() ?? '';
  const text = html
    .replace(/<(script|style|noscript|svg|template|iframe)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(br|\/p|\/div|\/li|\/h[1-6]|\/tr|\/section|\/article)[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/[ \t\r\f\v]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n\n')
    .trim();
  return { title, text };
}


async function readDirect(url, signal) {
  let res;
  for (let hop = 0; hop < 4; hop++) {
    res = await fetch(url, {
      redirect: 'manual',
      signal: timeout(signal, 12_000),
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; VAIs-AgentX/1.0)', Accept: 'text/html,text/plain,application/json;q=0.9,*/*;q=0.5' },
    });
    if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
      url = await assertPublicUrl(new URL(res.headers.get('location'), url).href);
      continue;
    }
    break;
  }
  if (!res.ok) throw Object.assign(new Error(t(`Die Seite antwortet mit Fehler ${res.status}.`, `The page responded with error ${res.status}.`)), { status: res.status });
  const type = res.headers.get('content-type') || '';
  if (!/text\/|json|xml/i.test(type)) throw Object.assign(new Error(t(`Dieser Dateityp kann nicht gelesen werden (${type.split(';')[0] || 'unbekannt'}).`, `This file type cannot be read (${type.split(';')[0] || 'unknown'}).`)), { type });
  // höchstens ~1,5 MB lesen
  const reader = res.body.getReader();
  const chunks = [];
  let size = 0;
  while (size < 1_500_000) {
    const { value, done } = await reader.read();
    if (done) break;
    chunks.push(value);
    size += value.length;
  }
  reader.cancel().catch(() => {});
  const body = new TextDecoder().decode(Buffer.concat(chunks));
  const { title, text } = /html/i.test(type) ? htmlToText(body) : { title: '', text: body };
  return { url: url.href, title, text, via: 'direct' };
}

// Jina Reader: liest auch JavaScript-Seiten und PDFs und liefert sauberen Text (ohne Schlüssel ca. 20 Seiten/Minute)
async function readJina(url, signal) {
  const key = keyOf('JINA_API_KEY');
  const res = await fetch(`https://r.jina.ai/${url.href}`, {
    signal: timeout(signal, 25_000),
    headers: { Accept: 'text/plain', 'X-Return-Format': 'markdown', ...(key ? { Authorization: `Bearer ${key}` } : {}) },
  });
  if (!res.ok) throw new Error(`Jina Reader ${res.status}`);
  const raw = (await res.text()).slice(0, 400_000);
  const title = raw.match(/^Title:\s*(.+)$/m)?.[1]?.trim() ?? '';
  const text = (raw.split(/^Markdown Content:\s*$/m)[1] ?? raw).replace(/!\[[^\]]*\]\([^)]*\)/g, '').replace(/\n{3,}/g, '\n\n').trim();
  return { url: url.href, title, text, via: 'jina' };
}

// Eine Seite lesen: direkt; klappt das nicht oder kommt kaum Text (JavaScript-Seite, PDF), über Jina Reader
export async function readPage(raw, { signal } = {}) {
  if (demoMode) {
    const u = new URL(raw);
    return { url: u.href, title: 'Demo-Seite', text: 'Das ist der Text einer Demo-Seite. Berlin hat rund 3,8 Millionen Einwohner.', via: 'demo' };
  }
  const url = await assertPublicUrl(raw);
  let first = null;
  try {
    const page = await readDirect(url, signal);
    if (page.text.replace(/\s+/g, ' ').length >= 600) return page;
    first = page;
  } catch (err) {
    if (signal?.aborted) throw err;
    first = err;
  }
  try {
    const page = await readJina(url, signal);
    if (page.text.length > (first?.text?.length ?? 0)) return { ...page, title: page.title || first?.title || '' };
  } catch (err) {
    if (signal?.aborted) throw err;
    console.error('Jina Reader fehlgeschlagen:', err.message);
  }
  if (first instanceof Error) throw first;
  return first;
}

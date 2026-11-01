// Modelle von mehreren Anbietern (alle über OpenAI-kompatible Schnittstellen):
//   OPENROUTER_API_KEY  → kostenlose OpenRouter-Modelle (Endung ":free")
//   GEMINI_API_KEY      → Google Gemini / Gemma (Google AI Studio, kostenloses Kontingent)
//   GROQ_API_KEY        → Groq (gpt-oss, Llama, Qwen, Kimi … und "compound" mit Websuche)
// Ohne Schlüssel läuft VAIs im Demo-Modus mit Platzhalter-Modellen.
//
// Optional: OPENROUTER_EXTRA_MODELS="anthropic/claude-sonnet-4.5,openai/gpt-5" schaltet
// zusätzlich kostenpflichtige OpenRouter-Modelle frei (braucht Guthaben bei OpenRouter).

const MAX_OUTPUT_TOKENS = 8192;
const SEARCH_SUFFIX = '#search'; // Variante mit eingebauter Websuche (Groq gpt-oss)

const PROVIDERS = {
  openrouter: { key: process.env.OPENROUTER_API_KEY?.trim(), base: 'https://openrouter.ai/api/v1', label: 'OpenRouter', env: 'OPENROUTER_API_KEY' },
  gemini: { key: process.env.GEMINI_API_KEY?.trim(), base: 'https://generativelanguage.googleapis.com/v1beta/openai', label: 'Google AI Studio', env: 'GEMINI_API_KEY' },
  groq: { key: process.env.GROQ_API_KEY?.trim(), base: 'https://api.groq.com/openai/v1', label: 'Groq', env: 'GROQ_API_KEY' },
  github: { key: process.env.GITHUB_MODELS_TOKEN?.trim(), base: 'https://models.github.ai/inference', label: 'GitHub Models', env: 'GITHUB_MODELS_TOKEN' },
  cerebras: { key: process.env.CEREBRAS_API_KEY?.trim(), base: 'https://api.cerebras.ai/v1', label: 'Cerebras', env: 'CEREBRAS_API_KEY' },
  mistral: { key: process.env.MISTRAL_API_KEY?.trim(), base: 'https://api.mistral.ai/v1', label: 'Mistral', env: 'MISTRAL_API_KEY' },
};
const EXTRA = (process.env.OPENROUTER_EXTRA_MODELS || '').split(',').map((s) => s.trim()).filter(Boolean);

export const demoMode = !Object.values(PROVIDERS).some((p) => p.key);

// ── Logos & Hersteller ────────────────────────────────────────────
// Schlüssel = Präfix der Modell-ID beim Anbieter (z. B. "openai/gpt-oss-120b")
const MAKERS = {
  google: ['Google', 'google-color'],
  openai: ['OpenAI', 'openai'],
  anthropic: ['Anthropic', 'anthropic'],
  'meta-llama': ['Meta', 'meta-color'],
  meta: ['Meta', 'meta-color'],
  'x-ai': ['xAI', 'grok'],
  deepseek: ['DeepSeek', 'deepseek-color'],
  'deepseek-ai': ['DeepSeek', 'deepseek-color'],
  qwen: ['Qwen', 'qwen-color'],
  alibaba: ['Qwen', 'qwen-color'],
  mistralai: ['Mistral', 'mistral-color'],
  'mistral-ai': ['Mistral', 'mistral-color'],
  xai: ['xAI', 'grok'],
  'ai21-labs': ['AI21', 'ai21-brand-color'],
  nvidia: ['NVIDIA', 'nvidia-color'],
  'z-ai': ['Z.ai', 'zhipu'],
  thudm: ['Z.ai', 'zhipu'],
  zai: ['Z.ai', 'zhipu'],
  moonshotai: ['Moonshot', 'kimi-color'],
  liquid: ['LiquidAI', 'liquid'],
  cohere: ['Cohere', 'cohere-color'],
  microsoft: ['Microsoft', 'microsoft-color'],
  minimax: ['MiniMax', 'minimax-color'],
  'dots-studio': ['Dots Studio', 'dotsstudio'],
  xiaomi: ['Xiaomi', 'xiaomimimo'],
  ibm: ['IBM', 'ibm'],
  'ibm-granite': ['IBM', 'ibm'],
  'arcee-ai': ['Arcee', 'arcee-color'],
  inception: ['Inception', 'inception'],
  perplexity: ['Perplexity', 'perplexity-color'],
  stepfun: ['StepFun', 'stepfun-color'],
  'stepfun-ai': ['StepFun', 'stepfun-color'],
  tencent: ['Tencent', 'tencent-color'],
  baidu: ['Baidu', 'baidu-color'],
  bytedance: ['ByteDance', 'bytedance-color'],
  'bytedance-seed': ['ByteDance', 'bytedance-color'],
  nousresearch: ['Nous', 'nousresearch'],
  ai21: ['AI21', 'ai21-brand-color'],
  groq: ['Groq', 'groq'],
};

function maker(upstreamId, fallbackName) {
  const prefix = upstreamId.includes('/') ? upstreamId.split('/')[0].toLowerCase() : '';
  const hit = MAKERS[prefix];
  if (hit) return { maker: hit[0], icon: hit[1] };
  if (/^gemini|^gemma/i.test(upstreamId)) return { maker: 'Google', icon: 'google-color' };
  if (/^llama/i.test(upstreamId)) return { maker: 'Meta', icon: 'meta-color' };
  if (/^qwen/i.test(upstreamId)) return { maker: 'Qwen', icon: 'qwen-color' };
  if (/^gpt|^o\d/i.test(upstreamId)) return { maker: 'OpenAI', icon: 'openai' };
  if (/^kimi/i.test(upstreamId)) return { maker: 'Moonshot', icon: 'kimi-color' };
  if (/^(mistral|magistral|codestral|devstral|ministral|pixtral|open-mi)/i.test(upstreamId)) return { maker: 'Mistral', icon: 'mistral-color' };
  if (/glm/i.test(upstreamId)) return { maker: 'Z.ai', icon: 'zhipu' };
  if (/^deepseek/i.test(upstreamId)) return { maker: 'DeepSeek', icon: 'deepseek-color' };
  return { maker: fallbackName || prefix || 'KI', icon: null };
}

// Welche Modelle tauchen zusätzlich unter „Code“ auf (Text können alle)?
const CODE_RE = /(code|coder|gpt-4\.1|gpt-4o(?!-mini)|devstral|codestral|gpt-oss|gpt-[5-9]|claude|qwen3|kimi|glm|deepseek|gemini-[\d.]+-(pro|flash)|north|minimax|nemotron.*(super|ultra)|inkling|gemma-4-31b|llama-4|grok)/i;

function makeModel(provider, upstream, name, fallbackMaker, extraCaps = []) {
  const m = maker(upstream, fallbackMaker);
  const caps = extraCaps.length ? extraCaps : ['text', ...(CODE_RE.test(upstream) ? ['code'] : [])];
  return { id: `${provider}:${upstream}`, provider, upstream, name, maker: m.maker, icon: m.icon, caps };
}

// ── Modell-Listen der Anbieter ────────────────────────────────────
const GITHUB_FALLBACK = [
  'openai/gpt-4.1', 'openai/gpt-4.1-mini', 'openai/gpt-4o', 'openai/gpt-4o-mini', 'openai/o4-mini', 'openai/o3-mini',
  'deepseek/DeepSeek-R1', 'deepseek/DeepSeek-V3-0324',
  'meta/Llama-4-Maverick-17B-128E-Instruct-FP8', 'meta/Llama-4-Scout-17B-16E-Instruct', 'meta/Llama-3.3-70B-Instruct',
  'xai/grok-3', 'xai/grok-3-mini', 'microsoft/Phi-4', 'microsoft/MAI-DS-R1',
  'mistral-ai/Codestral-2501', 'mistral-ai/Mistral-Medium-2505', 'cohere/cohere-command-a',
];

// Einmal pro Serverstart prüfen, ob GitHub Models wirklich antwortet (sonst Anbieter ausblenden)
let githubCheck = null;
function githubProbe(p) {
  githubCheck ??= (async () => {
    const res = await fetch(`${p.base}/chat/completions`, {
      method: 'POST',
      headers: { ...githubHeaders(p.key), 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'openai/gpt-4.1-mini', messages: [{ role: 'user', content: 'Hi' }], max_tokens: 1 }),
      signal: AbortSignal.timeout(15_000),
    });
    const body = await res.text();
    let json = null;
    try { json = JSON.parse(body); } catch { /* kein JSON */ }
    if (res.status === 401 || res.status === 403) throw new Error(`Token abgelehnt (${res.status}). Hat der Token die Berechtigung „Models: Read-only“? ${body.slice(0, 160)}`);
    if (res.status === 429) return; // Limit erreicht, Schnittstelle funktioniert aber
    if (!json) throw new Error(`Antwort ist kein JSON (HTTP ${res.status}): ${body.slice(0, 160)}`);
    if (!res.ok && !json.choices) throw new Error(`HTTP ${res.status}: ${body.slice(0, 200)}`);
    console.log('GitHub Models: Verbindung ok');
  })().catch((err) => { githubCheck = null; throw err; });
  return githubCheck;
}

const githubHeaders = (key) => ({ Authorization: `Bearer ${key}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' });

// Grenzen je Anbieter (GitHub Models: max. ~4000 Antwort-Tokens; o-/gpt-5-Modelle wollen max_completion_tokens)
function tokenLimit(provider, upstream) {
  if (provider !== 'github') return { max_tokens: MAX_OUTPUT_TOKENS };
  return /(\/o\d|gpt-5)/i.test(upstream) ? { max_completion_tokens: 4000 } : { max_tokens: 4000 };
}

async function getJson(url, headers = {}) {
  const res = await fetch(url, { headers, signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

const LISTERS = {
  async openrouter(p) {
    const { data } = await getJson(`${p.base}/models`);
    return data
      .filter((m) => (m.id.endsWith(':free') || EXTRA.includes(m.id)) && !m.id.startsWith('openrouter/'))
      .filter((m) => !/(safety|guard|moderation)/i.test(m.id))
      .filter((m) => (m.architecture?.output_modalities ?? ['text']).includes('text'))
      .map((m) => makeModel('openrouter', m.id, m.id.split('/').pop().replace(/:free$/, ''), (m.name.split(':')[0] || '').trim()));
  },

  async gemini(p) {
    const { models = [] } = await getJson(`https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000&key=${encodeURIComponent(p.key)}`);
    return models
      .filter((m) => m.supportedGenerationMethods?.includes('generateContent'))
      .map((m) => m.name.replace(/^models\//, ''))
      .filter((id) => /^(gemini-(2\.5|[3-9])|gemma-[3-9])/.test(id))
      .filter((id) => !/(embedding|tts|image|live|audio|aqa|imagen|veo|robotics|computer-use|learnlm|-latest$|-\d{3}$)/i.test(id))
      .map((id) => makeModel('gemini', id, id, 'Google'));
  },

  async github(p) {
    // 1) Offizieller Katalog (falls GitHub ihn liefert), 2) sonst eingebaute Liste bekannter Modelle
    let ids = [];
    try {
      const res = await fetch('https://models.github.ai/catalog/models', { headers: githubHeaders(p.key), signal: AbortSignal.timeout(10_000) });
      const raw = JSON.parse(await res.text());
      const list = Array.isArray(raw) ? raw : raw.data ?? raw.models ?? [];
      ids = list
        .filter((m) => (m.supported_output_modalities ?? ['text']).includes('text'))
        .filter((m) => !(m.supported_output_modalities ?? []).includes('embeddings'))
        .map((m) => [m.id, m.publisher]);
    } catch { /* Katalog nicht verfügbar */ }
    if (!ids.length) ids = GITHUB_FALLBACK.map((id) => [id]);
    ids = ids.filter(([id]) => id && !/(embed|whisper|tts|\/o1(-|$))/i.test(id));
    await githubProbe(p);
    return ids.map(([id, publisher]) => makeModel('github', id, id.split('/').pop().toLowerCase(), publisher));
  },

  async cerebras(p) {
    const { data } = await getJson(`${p.base}/models`, { Authorization: `Bearer ${p.key}` });
    return data.map((m) => makeModel('cerebras', m.id, m.id.split('/').pop(), m.owned_by));
  },

  async mistral(p) {
    const { data } = await getJson(`${p.base}/models`, { Authorization: `Bearer ${p.key}` });
    const chat = data
      .filter((m) => m.capabilities?.completion_chat !== false)
      .filter((m) => !/(embed|moderation|ocr|transcribe|voxtral|saba)/i.test(m.id));
    const latest = chat.filter((m) => m.id.endsWith('-latest'));
    return (latest.length ? latest : chat)
      .map((m) => makeModel('mistral', m.id, m.id.replace(/-latest$/, ''), 'Mistral'));
  },

  async groq(p) {
    const { data } = await getJson(`${p.base}/models`, { Authorization: `Bearer ${p.key}` });
    return data
      .filter((m) => m.active !== false)
      .filter((m) => !/(whisper|tts|guard|playai|orpheus|distil|safeguard|allam)/i.test(m.id))
      .flatMap((m) => {
        const name = m.id.split('/').pop();
        if (/(^|\/)compound/i.test(m.id)) return [makeModel('groq', m.id, name, 'Groq', ['web'])];
        const base = makeModel('groq', m.id, name, m.owned_by);
        // gpt-oss kann bei Groq selbst im Web suchen (Werkzeug "browser_search")
        if (/gpt-oss/i.test(m.id)) return [base, { ...makeModel('groq', `${m.id}${SEARCH_SUFFIX}`, `${name}-search`, m.owned_by, ['web']) }];
        return [base];
      });
  },
};

const DEMO_MODELS = [
  { id: 'demo:aurora', provider: 'demo', upstream: 'aurora', name: 'aurora-demo', maker: 'VAIs Demo', icon: null, caps: ['text', 'code'] },
  { id: 'demo:basalt', provider: 'demo', upstream: 'basalt', name: 'basalt-demo', maker: 'VAIs Demo', icon: null, caps: ['text'] },
  { id: 'demo:cirrus', provider: 'demo', upstream: 'cirrus', name: 'cirrus-demo', maker: 'VAIs Demo', icon: null, caps: ['text', 'code'] },
  { id: 'demo:dune', provider: 'demo', upstream: 'dune', name: 'dune-demo', maker: 'VAIs Demo', icon: null, caps: ['text'] },
  { id: 'demo:echo', provider: 'demo', upstream: 'echo', name: 'echo-search-demo', maker: 'VAIs Demo', icon: null, caps: ['web'] },
  { id: 'demo:fjord', provider: 'demo', upstream: 'fjord', name: 'fjord-search-demo', maker: 'VAIs Demo', icon: null, caps: ['web'] },
];

const ORDER = { gemini: 0, github: 1, groq: 2, cerebras: 3, mistral: 4, openrouter: 5 };
const cache = {}; // provider → { at, list }

export async function listModels() {
  if (demoMode) return DEMO_MODELS;
  const lists = await Promise.all(Object.entries(PROVIDERS).map(async ([name, p]) => {
    if (!p.key) return [];
    const c = cache[name];
    if (c?.list.length && Date.now() - c.at < 30 * 60 * 1000) return c.list;
    try {
      const list = await LISTERS[name](p);
      if (list.length) cache[name] = { at: Date.now(), list };
    } catch (err) {
      console.error(`Modell-Liste von ${p.label} konnte nicht geladen werden:`, err.message);
    }
    return cache[name]?.list ?? [];
  }));
  return lists.flat()
    .map((m) => ({ ...m, busy: isBusy(m.id) }))
    .sort((a, b) => ORDER[a.provider] - ORDER[b.provider] || a.name.localeCompare(b.name));
}

// ── Ausgelastete Modelle merken und überspringen ─────────────────
const cooldown = new Map(); // 'p:<anbieter>' oder Modell-ID → bis wann
const providerOf = (id) => id.split(':')[0];
export function isBusy(id) {
  const now = Date.now();
  return (cooldown.get(`p:${providerOf(id)}`) ?? 0) > now || (cooldown.get(id) ?? 0) > now;
}
const isDailyLimit = (msg = '') => /per[- ]?day|daily|tageslimit|quota/i.test(msg);
function markFailed(id, status, message) {
  const now = Date.now();
  const midnightUtc = new Date(); midnightUtc.setUTCHours(24, 0, 0, 0);
  if (status === 429 && isDailyLimit(message)) cooldown.set(`p:${providerOf(id)}`, midnightUtc.getTime());
  else if (status === 401 || status === 403) cooldown.set(`p:${providerOf(id)}`, now + 10 * 60 * 1000);
  else if (status === 429) cooldown.set(id, now + 90 * 1000);
  else if (status === 404) cooldown.set(id, now + 60 * 60 * 1000);
  else cooldown.set(id, now + 60 * 1000);
}
function fail(model, status, message, p) {
  markFailed(model, status, message);
  return Object.assign(new Error(friendlyError(status, message, p)), { status });
}

// Zufälliges freies Modell mit einer Fähigkeit (für Battle und als Ersatz)
export async function pickAvailable(cap, exclude = []) {
  const all = (await listModels()).filter((m) => m.caps.includes(cap) && !exclude.includes(m.id));
  const free = all.filter((m) => !m.busy);
  const pool = free.length ? free : [];
  return pool.length ? pool[Math.floor(Math.random() * pool.length)] : null;
}

export async function findModel(id) {
  return (await listModels()).find((m) => m.id === id) ?? null;
}

// Name, Hersteller und Logo für jede Modell-ID – auch für Modelle, die es nicht mehr gibt
// (ältere Chats speichern OpenRouter-IDs noch ohne "openrouter:" davor).
export function modelKey(id) {
  return id.replace(/^openrouter:/, '').replace(/#search$/, '');
}
export async function describeModel(id) {
  if (id === 'agent') return { name: 'Agent X', maker: 'VAIs', icon: null };
  const live = await findModel(id) ?? await findModel(`openrouter:${id}`);
  if (live) return { name: live.name, maker: live.maker, icon: live.icon };
  const upstream = modelKey(id).replace(/^(gemini|groq|demo):/, '');
  return { name: upstream.split('/').pop().replace(/:free$/, ''), ...maker(upstream) };
}

export async function displayName(id) {
  if (id === 'agent') return 'Agent X';
  return (await findModel(id))?.name ?? id.split(/[:/]/).pop().replace(/:free$/, '');
}

// ── Antwort streamen ──────────────────────────────────────────────
// ── Quellen (Websuche) ───────────────────────────────────────────
const hostOf = (u) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return ''; } };
export function makeSource(url, title) {
  const clean = String(url).replace(/[.,;:!?)\]]+$/, '');
  if (!/^https?:\/\//i.test(clean) || !hostOf(clean)) return null;
  return { url: clean, title: String(title || '').trim().slice(0, 160) || hostOf(clean) };
}
// Links aus Text: [Titel](url) und nackte Adressen
export function sourcesFromText(text = '') {
  const out = [];
  for (const m of text.matchAll(/\[([^\]\n]{1,200})\]\((https?:\/\/[^\s)]+)\)/g)) out.push(makeSource(m[2], m[1]));
  for (const m of text.matchAll(/https?:\/\/[^\s<>()\]"'`]+/g)) out.push(makeSource(m[0]));
  return out.filter(Boolean);
}
// Suchergebnisse in Antwort-Daten der Anbieter finden (Groq executed_tools, OpenRouter annotations/citations)
function sourcesFromData(obj, out = [], depth = 0) {
  if (!obj || typeof obj !== 'object' || depth > 6) return out;
  if (Array.isArray(obj)) { obj.forEach((x) => (typeof x === 'string' ? out.push(makeSource(x)) : sourcesFromData(x, out, depth + 1))); return out; }
  if (typeof obj.url === 'string') out.push(makeSource(obj.url, obj.title ?? obj.name));
  for (const [k, v] of Object.entries(obj)) if (k !== 'content' && k !== 'reasoning' && v && typeof v === 'object') sourcesFromData(v, out, depth + 1);
  return out.filter(Boolean);
}

// Trennt "<think>…</think>" am Anfang einer Antwort ab (z. B. Qwen, DeepSeek)
function thinkSplitter(onText, onReasoning) {
  let mode = 'start'; // start → think → text
  let buf = '';
  return (chunk) => {
    if (mode === 'text') return onText(chunk);
    buf += chunk;
    if (mode === 'start') {
      const trimmed = buf.trimStart();
      if (!trimmed) return;
      if ('<think>'.startsWith(trimmed) && trimmed.length < 7) return; // noch unklar
      if (!trimmed.startsWith('<think>')) { mode = 'text'; const out = buf; buf = ''; return onText(out); }
      mode = 'think';
      buf = trimmed.slice(7);
    }
    const end = buf.indexOf('</think>');
    if (end === -1) {
      // Rest behalten, falls "</think>" gerade über zwei Stücke geteilt ist
      const keep = 8;
      if (buf.length > keep) { onReasoning(buf.slice(0, -keep)); buf = buf.slice(-keep); }
      return;
    }
    if (end > 0) onReasoning(buf.slice(0, end));
    const rest = buf.slice(end + 8).replace(/^\s+/, '');
    mode = 'text';
    buf = '';
    if (rest) onText(rest);
  };
}

export async function streamChat({ model, messages, signal, onText, onReasoning = () => {}, onSources = () => {} }) {
  const [provider, ...rest] = model.split(':');
  let upstream = rest.join(':');
  const search = upstream.endsWith(SEARCH_SUFFIX);
  if (search) upstream = upstream.slice(0, -SEARCH_SUFFIX.length);
  if (provider === 'demo') return demoStream({ name: `${upstream}-demo`, messages, signal, onText, onReasoning });
  const p = PROVIDERS[provider];
  if (!p?.key) throw new Error('Dieses Modell ist gerade nicht verfügbar.');

  const headers = { Authorization: `Bearer ${p.key}`, 'Content-Type': 'application/json' };
  if (provider === 'openrouter') {
    headers['HTTP-Referer'] = process.env.APP_URL || 'https://vais.onrender.com';
    headers['X-Title'] = 'VAIs';
  }
  if (provider === 'github') headers['X-GitHub-Api-Version'] = '2022-11-28';
  const res = await fetch(`${p.base}/chat/completions`, {
    method: 'POST',
    signal,
    headers,
    body: JSON.stringify({
      model: upstream,
      messages,
      stream: true,
      ...tokenLimit(provider, upstream),
      ...(search ? { tools: [{ type: 'browser_search' }], tool_choice: 'auto' } : {}),
    }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const err = Array.isArray(body) ? body[0]?.error : body?.error;
    throw fail(model, res.status, err?.message, p);
  }

  const emit = thinkSplitter(onText, onReasoning);
  const decoder = new TextDecoder();
  let buffer = '';
  for await (const chunk of res.body) {
    buffer += decoder.decode(chunk, { stream: true });
    let nl;
    while ((nl = buffer.indexOf('\n')) !== -1) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (!line.startsWith('data:')) continue; // Kommentare wie ": OPENROUTER PROCESSING"
      const data = line.slice(5).trim();
      if (data === '[DONE]') return;
      let json;
      try { json = JSON.parse(data); } catch { continue; }
      if (json.error) throw fail(model, Number(json.error.code) || 500, json.error.message, p);
      const delta = json.choices?.[0]?.delta ?? {};
      if (json.citations || Object.keys(delta).some((k) => !['content', 'role', 'reasoning', 'reasoning_content'].includes(k))) {
        const found = sourcesFromData({ delta, citations: json.citations });
        if (found.length) onSources(found);
      }
      const thought = delta.reasoning ?? delta.reasoning_content;
      if (thought) onReasoning(thought);
      if (delta.content) emit(delta.content);
    }
  }
}

// Eine Antwort ohne Streaming, optional mit Werkzeugen (für Agent X)
export async function complete({ model, messages, tools, signal }) {
  const [provider, ...rest] = model.split(':');
  let upstream = rest.join(':');
  const search = upstream.endsWith(SEARCH_SUFFIX);
  if (search) upstream = upstream.slice(0, -SEARCH_SUFFIX.length);
  const p = PROVIDERS[provider];
  if (!p?.key) throw new Error('Dieses Modell ist gerade nicht verfügbar.');
  const headers = { Authorization: `Bearer ${p.key}`, 'Content-Type': 'application/json' };
  if (provider === 'openrouter') { headers['HTTP-Referer'] = process.env.APP_URL || 'https://vais.onrender.com'; headers['X-Title'] = 'VAIs'; }
  if (provider === 'github') headers['X-GitHub-Api-Version'] = '2022-11-28';
  const allTools = [...(tools ?? []), ...(search ? [{ type: 'browser_search' }] : [])];
  const res = await fetch(`${p.base}/chat/completions`, {
    method: 'POST',
    signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(90_000)]) : AbortSignal.timeout(90_000),
    headers,
    body: JSON.stringify({
      model: upstream,
      messages,
      ...tokenLimit(provider, upstream),
      ...(allTools.length ? { tools: allTools, tool_choice: 'auto' } : {}),
    }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const err = Array.isArray(body) ? body[0]?.error : body?.error;
    throw fail(model, res.status, err?.message, p);
  }
  const json = await res.json();
  const message = json.choices?.[0]?.message ?? { content: '' };
  message.sources = sourcesFromData({ m: { ...message, content: undefined }, citations: json.citations });
  return message;
}

function friendlyError(status, message = '', p) {
  if (status === 429 && isDailyLimit(message)) return `Das kostenlose Tageslimit von ${p.label} ist für heute aufgebraucht. Wähle ein Modell von einem anderen Anbieter.`;
  if (status === 429) return 'Dieses Modell ist gerade ausgelastet. Versuche es gleich noch einmal oder wähle ein anderes Modell.';
  if (status === 401 || status === 403 || /api key/i.test(message)) return `Der Schlüssel für ${p.label} wurde abgelehnt. Bitte ${p.env} prüfen.`;
  if (status === 413 || /too large|tokens_limit_reached|max.*tokens/i.test(message)) return 'Der Chat ist zu lang für dieses Modell. Starte einen neuen Chat oder wähle ein anderes Modell.';
  if (status === 404) return 'Dieses Modell ist nicht mehr verfügbar. Bitte wähle ein anderes.';
  if (status === 400 && /context|token/i.test(message)) return 'Der Chat ist zu lang für dieses Modell. Starte einen neuen Chat.';
  return `Das Modell konnte nicht antworten${message ? `: ${message}` : '.'}`;
}

// ── Demo-Modus ────────────────────────────────────────────────────
const sleep = (ms, signal) => new Promise((resolve, reject) => {
  const t = setTimeout(resolve, ms);
  signal?.addEventListener('abort', () => { clearTimeout(t); reject(signal.reason); }, { once: true });
});

async function demoStream({ name, messages, signal, onText, onReasoning = () => {} }) {
  const last = [...messages].reverse().find((m) => m.role === 'user')?.content ?? '';
  const quote = last.length > 120 ? `${last.slice(0, 120)}…` : last;
  const code = messages[0]?.role === 'system';
  const text = code
    ? `Gern! Hier ist eine schlichte Login-Seite:\n\n\`\`\`html\n<!doctype html>\n<html lang="de">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n<title>Login</title>\n<style>\n  * { box-sizing: border-box; }\n  body { margin: 0; min-height: 100vh; display: grid; place-items: center; font-family: system-ui, sans-serif; background: linear-gradient(135deg, #1e1b4b, #312e81); color: #fff; }\n  form { width: min(360px, 90vw); padding: 32px; border-radius: 20px; background: rgba(255,255,255,.08); backdrop-filter: blur(12px); }\n  h1 { margin: 0 0 24px; font-size: 28px; }\n  label { display: block; margin: 14px 0 6px; font-size: 14px; opacity: .8; }\n  input { width: 100%; padding: 12px 14px; border: 0; border-radius: 10px; font-size: 16px; }\n  button { width: 100%; margin-top: 22px; padding: 13px; border: 0; border-radius: 10px; background: #818cf8; color: #fff; font-size: 16px; font-weight: 600; }\n  p { margin: 16px 0 0; text-align: center; font-size: 14px; opacity: .8; }\n</style>\n</head>\n<body>\n<form onsubmit="event.preventDefault(); alert('Angemeldet als ' + this.email.value)">\n  <h1>Willkommen 👋</h1>\n  <label for="email">E-Mail</label>\n  <input id="email" name="email" type="email" placeholder="du@beispiel.de" required>\n  <label for="pw">Passwort</label>\n  <input id="pw" type="password" placeholder="••••••••" required>\n  <button>Anmelden</button>\n  <p>Erstellt von ${name}</p>\n</form>\n</body>\n</html>\n\`\`\`\n\nDie Seite hat ein E-Mail- und Passwort-Feld und zeigt beim Absenden eine kurze Meldung. Tippe auf **Vorschau**, um sie anzusehen.`
    : /^(echo|fjord)/.test(name)
      ? `Laut aktueller Suche wird es morgen in Berlin bewölkt bei etwa 8 °C 【1†L1-L3】. Regen ist kaum zu erwarten 【2†L4】.\n\n**Quellen**\n- [Wetter Berlin morgen | wetter.com](https://www.wetter.com/deutschland/berlin/)\n- [Berlin – Wikipedia](https://de.wikipedia.org/wiki/Berlin)`
      : `Hallo! Ich bin **${name}**, ein Platzhalter-Modell.\n\nDu hast geschrieben: „${quote}“\n\nSobald ein API-Schlüssel eingetragen ist, antworten hier echte KI-Modelle.`;
  await sleep(300 + Math.random() * 500, signal);
  if (name.startsWith('basalt') || code) {
    const plan = `Der Nutzer möchte: „${quote}“. Ich überlege kurz, wie ich das am besten beantworte: zuerst die Kernaussage, dann Details, am Ende eine kurze Zusammenfassung. Formatierung mit Markdown, freundlich und klar.`;
    for (const piece of plan.match(/\S+\s*/g)) { await sleep(25, signal); onReasoning(piece); }
  }
  for (const piece of text.match(/\S+\s*|\s+/g)) {
    await sleep(18 + Math.random() * 40, signal);
    onText(piece);
  }
}

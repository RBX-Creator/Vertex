// Modelle von mehreren Anbietern (alle über OpenAI-kompatible Schnittstellen):
//   OPENROUTER_API_KEY  → kostenlose OpenRouter-Modelle (Endung ":free")
//   GEMINI_API_KEY      → Google Gemini / Gemma (Google AI Studio, kostenloses Kontingent)
//   GROQ_API_KEY        → Groq (gpt-oss, Llama, Qwen, Kimi … und "compound" mit Websuche)
// Ohne Schlüssel läuft VAIs im Demo-Modus mit Platzhalter-Modellen.
//
// Optional: OPENROUTER_EXTRA_MODELS="anthropic/claude-sonnet-4.5,openai/gpt-5" schaltet
// zusätzlich kostenpflichtige OpenRouter-Modelle frei (braucht Guthaben bei OpenRouter).

import { t } from './i18n.js';

const MAX_OUTPUT_TOKENS = 8192;
const IDLE_TIMEOUT = 90_000; // so lange darf ein Modell schweigen, bevor wir abbrechen
const SEARCH_SUFFIX = '#search'; // Variante mit eingebauter Websuche (Groq gpt-oss)

const PROVIDERS = {
  openrouter: { key: process.env.OPENROUTER_API_KEY?.trim(), base: 'https://openrouter.ai/api/v1', label: 'OpenRouter', env: 'OPENROUTER_API_KEY' },
  gemini: { key: process.env.GEMINI_API_KEY?.trim(), base: 'https://generativelanguage.googleapis.com/v1beta/openai', label: 'Google AI Studio', env: 'GEMINI_API_KEY' },
  groq: { key: process.env.GROQ_API_KEY?.trim(), base: 'https://api.groq.com/openai/v1', label: 'Groq', env: 'GROQ_API_KEY' },
  cerebras: { key: process.env.CEREBRAS_API_KEY?.trim(), base: 'https://api.cerebras.ai/v1', label: 'Cerebras', env: 'CEREBRAS_API_KEY' },
  mistral: { key: process.env.MISTRAL_API_KEY?.trim(), base: 'https://api.mistral.ai/v1', label: 'Mistral', env: 'MISTRAL_API_KEY' },
};
const EXTRA = (process.env.OPENROUTER_EXTRA_MODELS || '').split(',').map((s) => s.trim()).filter(Boolean);

export const demoMode = !Object.values(PROVIDERS).some((p) => p.key);

// Bilder: Pollinations funktioniert ohne Schlüssel (wenige Modelle); mit POLLINATIONS_API_KEY gibt es mehr.
// Mit DISABLE_FREE_IMAGES=true lässt sich der Bild-Modus abschalten.
const IMAGES = {
  key: process.env.POLLINATIONS_API_KEY?.trim(),
  enabled: process.env.DISABLE_FREE_IMAGES !== 'true',
  label: 'Pollinations',
  env: 'POLLINATIONS_API_KEY',
};
const IMAGE_MAKERS = [
  [/flux|kontext/i, 'Black Forest Labs', 'bfl'],
  [/sana|nvidia/i, 'NVIDIA', 'nvidia-color'],
  [/z-image|qwen|wan|tongyi/i, 'Alibaba', 'qwen-color'],
  [/gpt|openai/i, 'OpenAI', 'openai'],
  [/seedream|bytedance/i, 'ByteDance', 'bytedance-color'],
  [/gemini|imagen|nano/i, 'Google', 'google-color'],
];
function imageModel(name, publisher) {
  const hit = IMAGE_MAKERS.find(([re]) => re.test(name) || re.test(publisher || ''));
  return {
    id: `pollinations:${name}`, provider: 'pollinations', upstream: name,
    name: name.split('/').pop(), maker: hit?.[1] ?? publisher ?? 'Pollinations', icon: hit?.[2] ?? 'pollinations', caps: ['image'],
  };
}
async function listImageModels() {
  if (IMAGES.key) {
    const list = await getJson('https://gen.pollinations.ai/image/models', { Authorization: `Bearer ${IMAGES.key}` });
    return list
      .filter((m) => (m.output_modalities ?? ['image']).includes('image') && !m.paid_only)
      .map((m) => imageModel(m.name, m.publisher));
  }
  const names = await getJson('https://image.pollinations.ai/models');
  return (Array.isArray(names) ? names : []).filter((n) => typeof n === 'string').map((n) => imageModel(n));
}

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

// Modelle, die Bilder ansehen können (zusätzlich zu den Angaben der Anbieter)
const VISION_RE = /(llama-4|vision|-vl\b|-vl-|pixtral|gemma-[34]|gpt-4o|gpt-4\.1|omni|maverick|scout)/i;

function makeModel(provider, upstream, name, fallbackMaker, extraCaps = []) {
  const m = maker(upstream, fallbackMaker);
  const caps = extraCaps.length ? extraCaps : ['text', ...(CODE_RE.test(upstream) ? ['code'] : [])];
  const vision = !extraCaps.length && (provider === 'gemini' || VISION_RE.test(upstream));
  return { id: `${provider}:${upstream}`, provider, upstream, name, maker: m.maker, icon: m.icon, caps: vision ? [...caps, 'vision'] : caps };
}

// ── Modell-Listen der Anbieter ────────────────────────────────────
function tokenLimit() {
  return { max_tokens: MAX_OUTPUT_TOKENS };
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
      .map((m) => {
        const model = makeModel('openrouter', m.id, m.id.split('/').pop().replace(/:free$/, ''), (m.name.split(':')[0] || '').trim());
        if ((m.architecture?.input_modalities ?? []).includes('image') && !model.caps.includes('vision')) model.caps.push('vision');
        return { ...model, paid: !m.id.endsWith(':free') }; // paid: kostet Guthaben (OPENROUTER_EXTRA_MODELS)
      });
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
  { id: 'demo:aurora', provider: 'demo', upstream: 'aurora', name: 'aurora-demo', maker: 'VAIs Demo', icon: null, caps: ['text', 'code', 'vision'] },
  { id: 'demo:basalt', provider: 'demo', upstream: 'basalt', name: 'basalt-demo', maker: 'VAIs Demo', icon: null, caps: ['text', 'vision'] },
  { id: 'demo:cirrus', provider: 'demo', upstream: 'cirrus', name: 'cirrus-demo', maker: 'VAIs Demo', icon: null, caps: ['text', 'code'] },
  { id: 'demo:dune', provider: 'demo', upstream: 'dune', name: 'dune-demo', maker: 'VAIs Demo', icon: null, caps: ['text'] },
  { id: 'demo:echo', provider: 'demo', upstream: 'echo', name: 'echo-search-demo', maker: 'VAIs Demo', icon: null, caps: ['web'] },
  { id: 'demo:fjord', provider: 'demo', upstream: 'fjord', name: 'fjord-search-demo', maker: 'VAIs Demo', icon: null, caps: ['web'] },
  { id: 'demo:prisma', provider: 'demo', upstream: 'prisma', name: 'prisma-image-demo', maker: 'VAIs Demo', icon: null, caps: ['image'] },
  { id: 'demo:quarz', provider: 'demo', upstream: 'quarz', name: 'quarz-image-demo', maker: 'VAIs Demo', icon: null, caps: ['image'] },
];

const ORDER = { gemini: 0, groq: 1, cerebras: 2, mistral: 3, openrouter: 4, pollinations: 5 };
const cache = {}; // provider → { at, list }

export async function listModels() {
  if (demoMode) return DEMO_MODELS;
  const sources = Object.entries(PROVIDERS).map(([name, p]) => [name, p, () => LISTERS[name](p)]);
  if (IMAGES.enabled) sources.push(['pollinations', { ...IMAGES, key: 'free' }, listImageModels]);
  const lists = await Promise.all(sources.map(async ([name, p, lister]) => {
    if (!p.key) return [];
    const c = cache[name];
    if (c?.list.length && Date.now() - c.at < 30 * 60 * 1000) return c.list;
    try {
      const list = await lister();
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
  if (!p?.key) throw new Error(t('Dieses Modell ist gerade nicht verfügbar.', 'This model is not available right now.'));

  const headers = { Authorization: `Bearer ${p.key}`, 'Content-Type': 'application/json' };
  if (provider === 'openrouter') {
    headers['HTTP-Referer'] = process.env.APP_URL || 'https://vais.onrender.com';
    headers['X-Title'] = 'VAIs';
  }
  // Abbrechen, wenn das Modell zu lange nichts liefert (hängt sonst ewig)
  const idle = new AbortController();
  let idleTimer;
  const arm = () => { clearTimeout(idleTimer); idleTimer = setTimeout(() => idle.abort(), IDLE_TIMEOUT); };
  arm();
  try {
    await streamFrom();
  } catch (err) {
    if (idle.signal.aborted && !signal?.aborted) throw fail(model, 504, 'timeout', p);
    throw err;
  } finally {
    clearTimeout(idleTimer);
  }

  async function streamFrom() {
  const res = await fetch(`${p.base}/chat/completions`, {
    method: 'POST',
    signal: signal ? AbortSignal.any([signal, idle.signal]) : idle.signal,
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
    arm();
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
}

// ── Bilder erstellen ──────────────────────────────────────────────
// Ohne Schlüssel erlaubt Pollinations nur wenige gleichzeitige Anfragen → nacheinander abarbeiten
let imageQueue = Promise.resolve();
export function generateImage({ model, prompt, signal }) {
  const job = imageQueue.then(() => (signal?.aborted ? null : makeImage({ model, prompt, signal })));
  imageQueue = job.catch(() => {});
  return job;
}

async function makeImage({ model, prompt, signal }) {
  const [provider, ...rest] = model.split(':');
  const upstream = rest.join(':');
  const text = String(prompt).replace(/\s+/g, ' ').trim().slice(0, 1500);
  if (provider === 'demo') return demoImage(upstream, text);
  const seed = Math.floor(Math.random() * 1_000_000);
  const query = `model=${encodeURIComponent(upstream)}&width=1024&height=1024&seed=${seed}&nologo=true&private=true`;
  const url = IMAGES.key
    ? `https://gen.pollinations.ai/image/${encodeURIComponent(text)}?${query}`
    : `https://image.pollinations.ai/prompt/${encodeURIComponent(text)}?${query}`;
  const res = await fetch(url, {
    signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(120_000)]) : AbortSignal.timeout(120_000),
    headers: IMAGES.key ? { Authorization: `Bearer ${IMAGES.key}` } : {},
  });
  const type = res.headers.get('content-type') || '';
  if (!res.ok || !type.startsWith('image/')) {
    const body = await res.text().catch(() => '');
    throw fail(model, res.ok ? 502 : res.status, body.slice(0, 200), IMAGES);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > 4_000_000) throw new Error(t('Das Bild ist zu groß.', 'The image is too large.'));
  return `data:${type.split(';')[0]};base64,${buf.toString('base64')}`;
}

// Platzhalter-Bild im Demo-Modus (SVG mit Farbverlauf und dem Text)
function demoImage(name, text) {
  const hue = [...text].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, name === 'quarz' ? 200 : 20);
  const safe = text.replace(/[<>&"]/g, '').slice(0, 60);
  const svgText = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsl(${hue} 70% 55%)"/><stop offset="1" stop-color="hsl(${(hue + 80) % 360} 70% 35%)"/></linearGradient></defs><rect width="1024" height="1024" fill="url(#g)"/><text x="512" y="520" font-family="sans-serif" font-size="44" fill="#fff" text-anchor="middle">${safe}</text></svg>`;
  return new Promise((resolve) => setTimeout(() => resolve(`data:image/svg+xml;base64,${Buffer.from(svgText).toString('base64')}`), 900));
}

// Eine Antwort ohne Streaming, optional mit Werkzeugen (für Agent X)
export async function complete({ model, messages, tools, signal }) {
  const [provider, ...rest] = model.split(':');
  let upstream = rest.join(':');
  const search = upstream.endsWith(SEARCH_SUFFIX);
  if (search) upstream = upstream.slice(0, -SEARCH_SUFFIX.length);
  const p = PROVIDERS[provider];
  if (!p?.key) throw new Error(t('Dieses Modell ist gerade nicht verfügbar.', 'This model is not available right now.'));
  const headers = { Authorization: `Bearer ${p.key}`, 'Content-Type': 'application/json' };
  if (provider === 'openrouter') { headers['HTTP-Referer'] = process.env.APP_URL || 'https://vais.onrender.com'; headers['X-Title'] = 'VAIs'; }
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
  if (status === 429 && isDailyLimit(message)) return t(`Das kostenlose Tageslimit von ${p.label} ist für heute aufgebraucht. Wähle ein Modell von einem anderen Anbieter.`, `The free daily limit of ${p.label} is used up for today. Choose a model from another provider.`);
  if (status === 429) return t('Dieses Modell ist gerade ausgelastet. Versuche es gleich noch einmal oder wähle ein anderes Modell.', 'This model is busy right now. Try again in a moment or choose another model.');
  if (status === 504) return t('Das Modell antwortet nicht mehr (Zeitüberschreitung). Versuche es noch einmal.', 'The model stopped responding (timeout). Please try again.');
  if (status === 401 || status === 403 || /api key/i.test(message)) return t(`Der Schlüssel für ${p.label} wurde abgelehnt. Bitte ${p.env} prüfen.`, `The key for ${p.label} was rejected. Please check ${p.env}.`);
  if (status === 413 || /too large|tokens_limit_reached|max.*tokens/i.test(message)) return t('Der Chat ist zu lang für dieses Modell. Starte einen neuen Chat oder wähle ein anderes Modell.', 'The chat is too long for this model. Start a new chat or choose another model.');
  if (status === 404) return t('Dieses Modell ist nicht mehr verfügbar. Bitte wähle ein anderes.', 'This model is no longer available. Please choose another one.');
  if (status === 400 && /context|token/i.test(message)) return t('Der Chat ist zu lang für dieses Modell. Starte einen neuen Chat.', 'The chat is too long for this model. Start a new chat.');
  return t(`Das Modell konnte nicht antworten${message ? `: ${message}` : '.'}`, `The model could not answer${message ? `: ${message}` : '.'}`);
}

// ── Demo-Modus ────────────────────────────────────────────────────
const sleep = (ms, signal) => new Promise((resolve, reject) => {
  const t = setTimeout(resolve, ms);
  signal?.addEventListener('abort', () => { clearTimeout(t); reject(signal.reason); }, { once: true });
});

async function demoStream({ name, messages, signal, onText, onReasoning = () => {} }) {
  const lastRaw = [...messages].reverse().find((m) => m.role === 'user')?.content ?? '';
  const images = Array.isArray(lastRaw) ? lastRaw.filter((p) => p.type === 'image_url').length : 0;
  const last = (Array.isArray(lastRaw) ? lastRaw.filter((p) => p.type === 'text').map((p) => p.text).join(' ') : lastRaw)
    + (images ? ` [ich sehe ${images} Bild${images > 1 ? 'er' : ''}]` : '');
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

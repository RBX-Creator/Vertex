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
  if (/^deepseek/i.test(upstreamId)) return { maker: 'DeepSeek', icon: 'deepseek-color' };
  return { maker: fallbackName || prefix || 'KI', icon: null };
}

// Welche Modelle tauchen zusätzlich unter „Code“ auf (Text können alle)?
const CODE_RE = /(code|coder|devstral|codestral|gpt-oss|gpt-[5-9]|claude|qwen3|kimi|glm|deepseek|gemini-[\d.]+-(pro|flash)|north|minimax|nemotron.*(super|ultra)|inkling|gemma-4-31b|llama-4|grok)/i;

function makeModel(provider, upstream, name, fallbackMaker, extraCaps = []) {
  const m = maker(upstream, fallbackMaker);
  const caps = extraCaps.length ? extraCaps : ['text', ...(CODE_RE.test(upstream) ? ['code'] : [])];
  return { id: `${provider}:${upstream}`, provider, upstream, name, maker: m.maker, icon: m.icon, caps };
}

// ── Modell-Listen der Anbieter ────────────────────────────────────
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

const ORDER = { gemini: 0, groq: 1, openrouter: 2 };
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
  return lists.flat().sort((a, b) => ORDER[a.provider] - ORDER[b.provider] || a.name.localeCompare(b.name));
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
export async function streamChat({ model, messages, signal, onText }) {
  const [provider, ...rest] = model.split(':');
  let upstream = rest.join(':');
  const search = upstream.endsWith(SEARCH_SUFFIX);
  if (search) upstream = upstream.slice(0, -SEARCH_SUFFIX.length);
  if (provider === 'demo') return demoStream({ name: `${upstream}-demo`, messages, signal, onText });
  const p = PROVIDERS[provider];
  if (!p?.key) throw new Error('Dieses Modell ist gerade nicht verfügbar.');

  const headers = { Authorization: `Bearer ${p.key}`, 'Content-Type': 'application/json' };
  if (provider === 'openrouter') {
    headers['HTTP-Referer'] = process.env.APP_URL || 'https://vais.onrender.com';
    headers['X-Title'] = 'VAIs';
  }
  const res = await fetch(`${p.base}/chat/completions`, {
    method: 'POST',
    signal,
    headers,
    body: JSON.stringify({
      model: upstream,
      messages,
      stream: true,
      max_tokens: MAX_OUTPUT_TOKENS,
      ...(search ? { tools: [{ type: 'browser_search' }], tool_choice: 'auto' } : {}),
    }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const err = Array.isArray(body) ? body[0]?.error : body?.error;
    throw new Error(friendlyError(res.status, err?.message, p));
  }

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
      if (json.error) throw new Error(friendlyError(json.error.code, json.error.message, p));
      const text = json.choices?.[0]?.delta?.content;
      if (text) onText(text);
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
  const allTools = [...(tools ?? []), ...(search ? [{ type: 'browser_search' }] : [])];
  const res = await fetch(`${p.base}/chat/completions`, {
    method: 'POST',
    signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(90_000)]) : AbortSignal.timeout(90_000),
    headers,
    body: JSON.stringify({
      model: upstream,
      messages,
      max_tokens: MAX_OUTPUT_TOKENS,
      ...(allTools.length ? { tools: allTools, tool_choice: 'auto' } : {}),
    }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const err = Array.isArray(body) ? body[0]?.error : body?.error;
    throw new Error(friendlyError(res.status, err?.message, p));
  }
  const json = await res.json();
  return json.choices?.[0]?.message ?? { content: '' };
}

function friendlyError(status, message = '', p) {
  if (status === 429) return 'Dieses Modell ist gerade ausgelastet oder das Tageslimit ist erreicht. Versuche es gleich noch einmal oder wähle ein anderes Modell.';
  if (status === 401 || status === 403 || /api key/i.test(message)) return `Der Schlüssel für ${p.label} wurde abgelehnt. Bitte ${p.env} prüfen.`;
  if (status === 404) return 'Dieses Modell ist nicht mehr verfügbar. Bitte wähle ein anderes.';
  if (status === 400 && /context|token/i.test(message)) return 'Der Chat ist zu lang für dieses Modell. Starte einen neuen Chat.';
  return `Das Modell konnte nicht antworten${message ? `: ${message}` : '.'}`;
}

// ── Demo-Modus ────────────────────────────────────────────────────
const sleep = (ms, signal) => new Promise((resolve, reject) => {
  const t = setTimeout(resolve, ms);
  signal?.addEventListener('abort', () => { clearTimeout(t); reject(signal.reason); }, { once: true });
});

async function demoStream({ name, messages, signal, onText }) {
  const last = [...messages].reverse().find((m) => m.role === 'user')?.content ?? '';
  const quote = last.length > 120 ? `${last.slice(0, 120)}…` : last;
  const code = messages[0]?.role === 'system';
  const text = code
    ? `Hier ist eine kleine Demo-Seite von **${name}**:\n\n\`\`\`html\n<!doctype html>\n<html><body style="font-family:sans-serif;display:grid;place-items:center;height:100vh;margin:0;background:#f4f2ee">\n<h1>Hallo von ${name} 👋</h1>\n</body></html>\n\`\`\`\n\nTippe auf **Vorschau**, um sie anzusehen.`
    : `Hallo! Ich bin **${name}**, ein Platzhalter-Modell.\n\nDu hast geschrieben: „${quote}“\n\nSobald ein API-Schlüssel eingetragen ist, antworten hier echte KI-Modelle.`;
  await sleep(300 + Math.random() * 500, signal);
  for (const piece of text.match(/\S+\s*|\s+/g)) {
    await sleep(18 + Math.random() * 40, signal);
    onText(piece);
  }
}

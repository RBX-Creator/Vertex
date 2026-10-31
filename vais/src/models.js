// Modelle kommen von OpenRouter (nur kostenlose Varianten, Endung ":free").
// Ohne OPENROUTER_API_KEY läuft VAIs im Demo-Modus mit Platzhalter-Modellen.

const KEY = process.env.OPENROUTER_API_KEY;
const API = 'https://openrouter.ai/api/v1';
export const demoMode = !KEY;

const EXCLUDE = /(safety|guard|moderation)/i;
const MAX_OUTPUT_TOKENS = 4096;

const DEMO_MODELS = [
  { id: 'demo/aurora', name: 'aurora-demo', provider: 'VAIs Demo' },
  { id: 'demo/basalt', name: 'basalt-demo', provider: 'VAIs Demo' },
  { id: 'demo/cirrus', name: 'cirrus-demo', provider: 'VAIs Demo' },
  { id: 'demo/dune', name: 'dune-demo', provider: 'VAIs Demo' },
];

let cache = { at: 0, list: [] };

export async function listModels() {
  if (demoMode) return DEMO_MODELS;
  if (cache.list.length && Date.now() - cache.at < 30 * 60 * 1000) return cache.list;
  try {
    const res = await fetch(`${API}/models`, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const { data } = await res.json();
    const list = data
      .filter((m) => m.id.endsWith(':free') && !m.id.startsWith('openrouter/') && !EXCLUDE.test(m.id))
      .filter((m) => (m.architecture?.output_modalities ?? ['text']).includes('text'))
      .map((m) => ({
        id: m.id,
        name: m.id.split('/').pop().replace(/:free$/, ''),
        provider: (m.name.split(':')[0] || m.id.split('/')[0]).trim(),
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
    if (list.length) cache = { at: Date.now(), list };
  } catch (err) {
    console.error('Modell-Liste konnte nicht geladen werden:', err.message);
  }
  return cache.list;
}

export async function findModel(id) {
  return (await listModels()).find((m) => m.id === id) ?? null;
}

export const displayName = (id) => id.split('/').pop().replace(/:free$/, '');

// Antwort eines Modells streamen. onText wird für jedes Text-Stück aufgerufen.
export async function streamChat({ model, messages, signal, onText }) {
  if (demoMode) return demoStream({ model, messages, signal, onText });

  const res = await fetch(`${API}/chat/completions`, {
    method: 'POST',
    signal,
    headers: {
      Authorization: `Bearer ${KEY}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': process.env.APP_URL || 'https://vais.onrender.com',
      'X-Title': 'VAIs',
    },
    body: JSON.stringify({ model, messages, stream: true, max_tokens: MAX_OUTPUT_TOKENS }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(friendlyError(res.status, body?.error?.message));
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
      if (json.error) throw new Error(friendlyError(json.error.code, json.error.message));
      const text = json.choices?.[0]?.delta?.content;
      if (text) onText(text);
    }
  }
}

function friendlyError(status, message = '') {
  if (status === 429) return 'Dieses Modell ist gerade ausgelastet oder das Tageslimit ist erreicht. Versuche es gleich noch einmal oder wähle ein anderes Modell.';
  if (status === 401 || status === 403) return 'Der API-Schlüssel wurde abgelehnt. Bitte OPENROUTER_API_KEY prüfen.';
  if (status === 404) return 'Dieses Modell ist nicht mehr verfügbar. Bitte wähle ein anderes.';
  if (status === 400 && /context|token/i.test(message)) return 'Der Chat ist zu lang für dieses Modell. Starte einen neuen Chat.';
  return `Das Modell konnte nicht antworten${message ? `: ${message}` : '.'}`;
}

// ── Demo-Modus ────────────────────────────────────────────────────
const sleep = (ms, signal) => new Promise((resolve, reject) => {
  const t = setTimeout(resolve, ms);
  signal?.addEventListener('abort', () => { clearTimeout(t); reject(signal.reason); }, { once: true });
});

async function demoStream({ model, messages, signal, onText }) {
  const last = [...messages].reverse().find((m) => m.role === 'user')?.content ?? '';
  const quote = last.length > 120 ? `${last.slice(0, 120)}…` : last;
  const name = displayName(model);
  const answers = {
    'demo/aurora': `Hallo! Ich bin **${name}**, ein Platzhalter-Modell.\n\nDu hast geschrieben: „${quote}“\n\nSobald ein \`OPENROUTER_API_KEY\` eingetragen ist, antworten hier echte KI-Modelle.`,
    'demo/basalt': `Hey! Hier spricht **${name}**.\n\nZu deiner Nachricht „${quote}“ würde ein echtes Modell jetzt ausführlich antworten. Im Demo-Modus zeige ich nur, wie das Streaming aussieht:\n\n1. Text kommt Stück für Stück an\n2. Beide Seiten laufen gleichzeitig\n3. Danach kannst du abstimmen`,
    'demo/cirrus': `**${name}** meldet sich! 👋\n\nEin kleines Code-Beispiel, damit du die Formatierung siehst:\n\n\`\`\`js\nconsole.log("Hallo von VAIs");\n\`\`\`\n\nDeine Nachricht: „${quote}“`,
    'demo/dune': `Ich bin **${name}**. Kurz und knapp: Das ist eine Demo-Antwort auf „${quote}“.\n\n> Trage einen OpenRouter-Schlüssel ein, um echte Modelle zu nutzen.`,
  };
  const text = answers[model] ?? `Demo-Antwort von ${name}.`;
  await sleep(300 + Math.random() * 500, signal);
  for (const piece of text.match(/\S+\s*|\s+/g)) {
    await sleep(18 + Math.random() * 40, signal);
    onText(piece);
  }
}

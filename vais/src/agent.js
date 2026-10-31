// Agent X: arbeitet in mehreren Schritten selbstständig.
// Werkzeuge: Websuche, Webseiten lesen, Rechnen, Datum/Uhrzeit.
import { lookup } from 'node:dns/promises';
import net from 'node:net';
import { listModels, complete, demoMode, sourcesFromText, makeSource } from './models.js';

const MAX_STEPS = 8;

// Das stärkste verfügbare Modell mit Werkzeug-Unterstützung
const AGENT_PREFERENCE = [
  /^groq:openai\/gpt-oss-120b$/,
  /^groq:moonshotai\/kimi-k2/,
  /^groq:.*llama-3\.3-70b/,
  /^groq:openai\/gpt-oss-20b$/,
  /^groq:qwen\/qwen3/,
  /^gemini:gemini-2\.5-flash$/,
];
async function pickModel(preferences) {
  const all = await listModels();
  for (const re of preferences) {
    const hit = all.find((m) => re.test(m.id));
    if (hit) return hit;
  }
  return null;
}
const SEARCH_PREFERENCE = [/^groq:groq\/compound$/, /^groq:.*compound(?!-mini)/, /^groq:.*compound/, /^groq:openai\/gpt-oss-120b#search$/, /#search$/];

const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'web_search',
      description: 'Sucht im Internet nach aktuellen Informationen (Nachrichten, Wetter, Preise, Fakten). Liefert eine Zusammenfassung mit Quellen-Links.',
      parameters: { type: 'object', properties: { query: { type: 'string', description: 'Die Suchanfrage' } }, required: ['query'] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'read_webpage',
      description: 'Öffnet eine Webseite (http/https) und gibt ihren Text zurück. Nutze es für Links des Nutzers oder um Quellen genauer zu lesen.',
      parameters: { type: 'object', properties: { url: { type: 'string', description: 'Vollständige Adresse, z. B. https://example.com' } }, required: ['url'] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'calculate',
      description: 'Rechnet einen mathematischen Ausdruck exakt aus. Erlaubt: + - * / ^ %, Klammern, sqrt, sin, cos, tan, log, ln, abs, round, floor, ceil, pi, e.',
      parameters: { type: 'object', properties: { expression: { type: 'string', description: 'z. B. (12.5 * 4) / 3 + sqrt(16)' } }, required: ['expression'] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'current_datetime',
      description: 'Gibt das aktuelle Datum und die Uhrzeit zurück.',
      parameters: { type: 'object', properties: { timezone: { type: 'string', description: 'IANA-Zeitzone, Standard Europe/Berlin' } } },
    },
  },
];

function systemPrompt() {
  const now = new Date().toLocaleString('de-DE', { timeZone: 'Europe/Berlin', dateStyle: 'full', timeStyle: 'short' });
  return [
    'Du bist Agent X, der stärkste Assistent von VAIs. Du arbeitest gründlich und selbstständig in mehreren Schritten.',
    'Denke auf Deutsch. Beginne deine Überlegungen mit einem kurzen Satz, was der Nutzer genau möchte, und plane dann die Schritte.',
    `Heute ist ${now} (Europe/Berlin).`,
    'Nutze deine Werkzeuge, wann immer sie die Antwort besser machen: web_search für alles Aktuelle oder Unsichere, read_webpage um Quellen oder Links zu lesen, calculate für jede Rechnung, current_datetime für Zeitfragen.',
    'Prüfe wichtige Fakten bei Bedarf mit einer zweiten Suche. Erfinde keine Fakten oder Links.',
    'Antworte in der Sprache des Nutzers, klar gegliedert mit Markdown. Wenn du Quellen genutzt hast, liste sie am Ende unter „Quellen“ als Links auf.',
  ].join('\n');
}

// ── Werkzeuge ─────────────────────────────────────────────────────
async function webSearch(query, signal, addSources) {
  const model = await pickModel(SEARCH_PREFERENCE);
  if (!model) throw new Error('Websuche ist nicht verfügbar (GROQ_API_KEY fehlt).');
  const msg = await complete({
    model: model.id,
    signal,
    messages: [
      { role: 'system', content: 'Du bist eine Suchmaschine. Suche im Web und antworte knapp mit den wichtigsten Fakten (mit Datum, falls relevant). Liste am Ende die Quellen als vollständige URLs auf.' },
      { role: 'user', content: query },
    ],
  });
  const text = (msg.content || 'Keine Ergebnisse gefunden.').replace(/\s*【[^】]*】/g, '');
  addSources([...(msg.sources ?? []), ...sourcesFromText(text)]);
  return text;
}

function isPrivateIp(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    return a === 0 || a === 10 || a === 127 || a >= 224 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254)
      || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 192 && b === 0) || (a === 198 && (b === 18 || b === 19));
  }
  const v6 = ip.toLowerCase();
  if (v6.startsWith('::ffff:')) return isPrivateIp(v6.slice(7));
  return v6 === '::' || v6 === '::1' || v6.startsWith('fc') || v6.startsWith('fd') || v6.startsWith('fe8') || v6.startsWith('fe9') || v6.startsWith('fea') || v6.startsWith('feb');
}

async function assertPublicUrl(raw) {
  let url;
  try { url = new URL(raw); } catch { throw new Error('Ungültige Adresse.'); }
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Nur http- und https-Adressen sind erlaubt.');
  if (url.username || url.password) throw new Error('Adressen mit Zugangsdaten sind nicht erlaubt.');
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (/^localhost$|\.local$|\.internal$/i.test(host)) throw new Error('Diese Adresse ist nicht erlaubt.');
  const addrs = net.isIP(host) ? [{ address: host }] : await lookup(host, { all: true });
  if (!addrs.length || addrs.some((a) => isPrivateIp(a.address))) throw new Error('Diese Adresse ist nicht erlaubt.');
  return url;
}

function htmlToText(html) {
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

async function readWebpage(raw, signal, addSources) {
  let url = await assertPublicUrl(raw);
  let res;
  for (let hop = 0; hop < 4; hop++) {
    res = await fetch(url, {
      redirect: 'manual',
      signal: AbortSignal.any([signal ?? new AbortController().signal, AbortSignal.timeout(12_000)]),
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; VAIs-AgentX/1.0)', Accept: 'text/html,text/plain,application/json;q=0.9,*/*;q=0.5' },
    });
    if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
      url = await assertPublicUrl(new URL(res.headers.get('location'), url).href);
      continue;
    }
    break;
  }
  if (!res.ok) throw new Error(`Die Seite antwortet mit Fehler ${res.status}.`);
  const type = res.headers.get('content-type') || '';
  if (!/text\/|json|xml/i.test(type)) throw new Error(`Dieser Dateityp kann nicht gelesen werden (${type.split(';')[0] || 'unbekannt'}).`);

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
  addSources([makeSource(url.href, title)].filter(Boolean));
  return `Titel: ${title || '–'}\nURL: ${url.href}\n\n${text.slice(0, 12_000)}${text.length > 12_000 ? '\n\n[… gekürzt]' : ''}`;
}

// Sicherer Rechner ohne eval: + - * / ^ %, Klammern, Funktionen und Konstanten
export function calculate(expr) {
  const src = String(expr).replace(/,/g, '.').replace(/×/g, '*').replace(/÷/g, '/');
  const tokens = src.match(/\d+(\.\d+)?(e[+-]?\d+)?|[a-z]+|[-+*/^%()]|\S/gi) ?? [];
  let i = 0;
  const peek = () => tokens[i];
  const next = () => tokens[i++];
  const FN = { sqrt: Math.sqrt, sin: Math.sin, cos: Math.cos, tan: Math.tan, log: Math.log10, ln: Math.log, abs: Math.abs, round: Math.round, floor: Math.floor, ceil: Math.ceil, exp: Math.exp };
  const CONST = { pi: Math.PI, e: Math.E };
  function primary() {
    const t = next();
    if (t === undefined) throw new Error('Ausdruck unvollständig.');
    if (t === '(') { const v = sum(); if (next() !== ')') throw new Error('Klammer fehlt.'); return v; }
    if (t === '-') return -power();
    if (t === '+') return power();
    if (/^\d/.test(t)) return Number(t);
    const name = t.toLowerCase();
    if (name in CONST) return CONST[name];
    if (name in FN) {
      if (next() !== '(') throw new Error(`Nach ${name} fehlt „(“.`);
      const v = sum();
      if (next() !== ')') throw new Error('Klammer fehlt.');
      return FN[name](v);
    }
    throw new Error(`Unbekanntes Zeichen: ${t}`);
  }
  function power() {
    const base = primary();
    if (peek() === '^') { next(); return base ** factorUnary(); }
    return base;
  }
  function factorUnary() { return power(); }
  function product() {
    let v = power();
    while (['*', '/', '%'].includes(peek())) {
      const op = next();
      const r = power();
      v = op === '*' ? v * r : op === '/' ? v / r : v % r;
    }
    return v;
  }
  function sum() {
    let v = product();
    while (['+', '-'].includes(peek())) v = next() === '+' ? v + product() : v - product();
    return v;
  }
  if (tokens.length > 200) throw new Error('Ausdruck zu lang.');
  const result = sum();
  if (i < tokens.length) throw new Error(`Unerwartetes Zeichen: ${tokens[i]}`);
  if (!Number.isFinite(result)) throw new Error('Das Ergebnis ist nicht endlich (z. B. Division durch 0).');
  return Number(result.toPrecision(15));
}

function currentDatetime(tz = 'Europe/Berlin') {
  let zone = tz;
  try { new Intl.DateTimeFormat('de-DE', { timeZone: zone }); } catch { zone = 'Europe/Berlin'; }
  const now = new Date();
  return `${now.toLocaleString('de-DE', { timeZone: zone, dateStyle: 'full', timeStyle: 'long' })} (${zone}); ISO: ${now.toISOString()}`;
}

async function runTool(name, args, signal, addSources) {
  switch (name) {
    case 'web_search': return { step: { kind: 'search', text: args.query }, run: () => webSearch(String(args.query ?? ''), signal, addSources) };
    case 'read_webpage': {
      let label = String(args.url ?? '');
      try { const u = new URL(label); label = u.hostname + (u.pathname.length > 1 ? u.pathname : ''); } catch { /* egal */ }
      return { step: { kind: 'read', text: label.slice(0, 80) }, run: () => readWebpage(String(args.url ?? ''), signal, addSources) };
    }
    case 'calculate': return { step: { kind: 'calc', text: String(args.expression ?? '') }, run: async () => String(calculate(args.expression)) };
    case 'current_datetime': return { step: { kind: 'time', text: 'Datum und Uhrzeit' }, run: async () => currentDatetime(args.timezone) };
    default: return { step: { kind: 'other', text: name }, run: async () => `Unbekanntes Werkzeug: ${name}` };
  }
}

// ── Ablauf ────────────────────────────────────────────────────────
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function emitText(text, onText, signal, words = 3, delay = 12) {
  const re = new RegExp(`(\\S+\\s*){1,${words}}|\\s+`, 'g');
  for (const piece of text.match(re) ?? []) {
    if (signal?.aborted) return;
    onText(piece);
    await sleep(delay);
  }
}

export async function runAgent({ messages, signal, onStep, onText, onReasoning = () => {}, onSources = () => {} }) {
  if (demoMode) return demoAgent({ messages, signal, onStep, onText, onReasoning, onSources });
  const model = await pickModel(AGENT_PREFERENCE);
  if (!model) throw new Error('Agent X braucht einen Groq-Schlüssel (GROQ_API_KEY), damit er Werkzeuge benutzen kann.');

  const convo = [{ role: 'system', content: systemPrompt() }, ...messages];
  for (let round = 0; round < MAX_STEPS; round++) {
    const msg = await complete({ model: model.id, messages: convo, tools: TOOLS, signal });
    const thought = msg.reasoning ?? msg.reasoning_content;
    if (thought) await emitText(`${thought.trim()}\n\n`, onReasoning, signal, 6, 8);
    const calls = msg.tool_calls ?? [];
    if (!calls.length) return emitText(msg.content || 'Ich konnte leider keine Antwort finden.', onText, signal);

    convo.push({ role: 'assistant', content: msg.content ?? '', tool_calls: calls });
    for (const call of calls) {
      let args = {};
      try { args = JSON.parse(call.function?.arguments || '{}'); } catch { /* leere Argumente */ }
      const tool = await runTool(call.function?.name, args, signal, onSources);
      onStep(tool.step);
      let result;
      try {
        result = await tool.run();
      } catch (err) {
        if (signal?.aborted) throw err;
        result = `Fehler: ${err.message}`;
        onStep({ kind: 'error', text: err.message });
      }
      convo.push({ role: 'tool', tool_call_id: call.id, content: String(result).slice(0, 14_000) });
    }
  }
  // Zu viele Schritte: mit dem bisher Gesammelten antworten
  const final = await complete({
    model: model.id,
    signal,
    messages: [...convo, { role: 'user', content: 'Beantworte jetzt meine Frage mit den gesammelten Informationen, ohne weitere Werkzeuge.' }],
  });
  return emitText(final.content || 'Ich konnte leider keine Antwort finden.', onText, signal);
}

async function demoAgent({ messages, onStep, onText, onReasoning, onSources, signal }) {
  const q = [...messages].reverse().find((m) => m.role === 'user')?.content ?? '';
  await emitText(`Der Nutzer möchte: „${q.slice(0, 80)}“. Ich prüfe zuerst das Datum, suche dann aktuelle Infos, lese eine Quelle genauer und rechne zur Kontrolle nach. Danach fasse ich alles übersichtlich zusammen und nenne die Quellen.`, onReasoning, signal, 2, 40);
  await sleep(400); onStep({ kind: 'time', text: 'Datum und Uhrzeit' });
  await sleep(500); onStep({ kind: 'search', text: q.slice(0, 60) });
  onSources([{ url: 'https://www.wetter.com/deutschland/berlin/', title: 'Wetter Berlin | wetter.com' }, { url: 'https://de.wikipedia.org/wiki/Berlin', title: 'Berlin – Wikipedia' }]);
  await sleep(700); onStep({ kind: 'read', text: 'example.com/artikel' });
  await sleep(500); onStep({ kind: 'calc', text: '21 * 2' });
  await sleep(400);
  await emitText(`**Agent X (Demo)**\n\nIch habe gesucht, eine Seite gelesen und gerechnet: 21 × 2 = **${calculate('21*2')}**.\n\nMit einem Groq-Schlüssel arbeite ich mit echten Werkzeugen.\n\n**Quellen**\n- [example.com](https://example.com)`, onText, signal);
}

// Agent X: arbeitet in mehreren Schritten selbstständig.
// Werkzeuge: Websuche (mehrere Anfragen gleichzeitig), Wikipedia, Webseiten lesen, Rechnen,
// Datum/Uhrzeit, Webseiten prüfen. Angehängte Bilder beschreibt vorher ein Bildmodell.
import { lookup } from 'node:dns/promises';
import net from 'node:net';
import vm from 'node:vm';
import { t, lang } from './i18n.js';
import { listModels, complete, demoMode, sourcesFromText, makeSource } from './models.js';

const MAX_STEPS = 8;

// Emoji-Reaktionen auf die Nachricht des Nutzers
export const REACTIONS = ['👍', '❤️', '😂', '😮', '🎉', '🔥', '👀', '✅', '🙏', '💯', '🤔', '👏'];
const REACT_TAG = /^\s*\[\[\s*react\s*:\s*([^\]\s]{1,8})\s*\]\]\s*/i;
export function splitReaction(text) {
  const m = String(text ?? '').match(REACT_TAG);
  if (!m) return { reaction: null, text: String(text ?? '') };
  const emoji = REACTIONS.find((r) => r.replace(/\uFE0F/g, '') === m[1].replace(/\uFE0F/g, '')) ?? null;
  return { reaction: emoji, text: String(text).slice(m[0].length) };
}
// Kurze Bestätigungen wie „ok“ oder „danke“ beantwortet Agent X nur mit einem Emoji – ohne Modell, spart das Limit
const ACK = {
  '❤️': ['danke', 'dankeschön', 'dankesehr', 'vielen', 'dank', 'thx', 'thanks', 'thank', 'ty', 'merci', 'lieb', 'nett'],
  '😂': ['haha', 'hahaha', 'hahahaha', 'hehe', 'lol', 'lmao', 'xd', 'rofl'],
  '👋': ['gute', 'nacht', 'n8', 'good', 'night', 'tschüss', 'tschau', 'ciao', 'bye', 'bis', 'später', 'morgen', 'see', 'you'],
  '👍': ['ok', 'okay', 'okey', 'oki', 'k', 'kk', 'alles', 'klar', 'passt', 'gut', 'super', 'top', 'perfekt', 'cool', 'nice', 'klasse', 'prima',
    'verstanden', 'alright', 'got', 'it', 'great', 'perfect', 'sounds', 'mega', 'geil', 'genau', 'stimmt', 'sehr', 'so', 'much', 'dir', 'euch', 'schön', 'a', 'lot', 'ganz', 'echt'],
};
const ACK_WORDS = new Map(Object.entries(ACK).flatMap(([emoji, words]) => words.map((w) => [w, emoji])));
const PRIORITY = ['😂', '❤️', '👋', '👍'];
export function quickReaction(messages) {
  if (messages.length < 2) return null; // erste Nachricht immer richtig beantworten
  const last = messages.at(-1);
  if (typeof last.content !== 'string') return null;
  const text = last.content.trim().toLowerCase();
  if (!text || text.length > 40) return null;
  // Hat Agent X gerade etwas gefragt, ist „ok“ eine echte Antwort → normal weiterarbeiten
  const prev = [...messages].reverse().find((m) => m.role === 'assistant');
  const prevText = typeof prev?.content === 'string' ? prev.content : '';
  if (/\?\s*$|\?[^?]{0,160}$/.test(prevText.trim().slice(-200))) return null;
  const emojis = text.match(/\p{Extended_Pictographic}/gu) ?? [];
  const words = text.replace(/\p{Extended_Pictographic}|\uFE0F|\u200D/gu, ' ').split(/[\s,.!?:;]+/).filter(Boolean);
  if (!words.length && emojis.length) return REACTIONS.find((r) => text.includes(r.replace(/\uFE0F/g, ''))) || '👍';
  if (!words.length || !words.every((w) => ACK_WORDS.has(w) || /^(ha){2,}h?$|^(he){2,}$|^x+d+$/.test(w))) return null;
  const found = new Set(words.map((w) => ACK_WORDS.get(w) ?? '😂'));
  // „sehr“, „so“ usw. allein sind keine Bestätigung
  if (words.every((w) => ['sehr', 'so', 'much', 'dir', 'euch', 'a', 'lot', 'ganz', 'echt', 'it', 'you', 'bis', 'see', 'good', 'gute'].includes(w))) return null;
  return PRIORITY.find((e) => found.has(e)) ?? '👍';
}

// Das stärkste verfügbare Modell mit Werkzeug-Unterstützung
const AGENT_PREFERENCE = [
  /^groq:openai\/gpt-oss-120b$/,
  /^cerebras:gpt-oss-120b$/,
  /^groq:moonshotai\/kimi-k2/,
  /^groq:.*llama-3\.3-70b/,
  /^groq:openai\/gpt-oss-20b$/,
  /^groq:qwen\/qwen3/,
  /^gemini:gemini-2\.5-flash$/,
];
async function pickModel(preferences) {
  const all = await listModels();
  for (const re of preferences) {
    const hit = all.find((m) => re.test(m.id) && !m.busy) ;
    if (hit) return hit;
  }
  return null;
}
const SEARCH_PREFERENCE = [/^groq:groq\/compound$/, /^groq:.*compound(?!-mini)/, /^groq:.*compound/, /^groq:openai\/gpt-oss-120b#search$/, /#search$/];

const REMEMBER_TOOL = {
  type: 'function',
  function: {
    name: 'remember',
    description: 'Speichert eine kurze, dauerhafte Info über den Nutzer im Gedächtnis (z. B. Name, Hobbys, Vorlieben), damit du sie in späteren Chats weißt.',
    parameters: { type: 'object', properties: { fact: { type: 'string', description: 'Kurzer Satz in der dritten Person, z. B. „Spielt gern Fußball“' } }, required: ['fact'] },
  },
};

const REMINDER_TOOL = {
  type: 'function',
  function: {
    name: 'set_reminder',
    description: 'Stellt eine Erinnerung, die dem Nutzer zur gewünschten Zeit als Benachrichtigung aufs Handy geschickt wird (z. B. „Erinnere mich morgen um 8 an Mathe“). Rechne relative Angaben mit dem heutigen Datum um.',
    parameters: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'Woran erinnert werden soll, kurz, z. B. „Mathe-Hausaufgaben“' },
        when: { type: 'string', description: 'Zeitpunkt in deutscher Zeit als JJJJ-MM-TTTHH:MM, z. B. 2026-11-02T08:00' },
        in_minutes: { type: 'number', description: 'Alternativ: in so vielen Minuten (z. B. 30)' },
      },
      required: ['text'],
    },
  },
};

const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'web_search',
      description: 'Sucht im Internet nach aktuellen Informationen (Nachrichten, Wetter, Preise, Fakten). Gib 1–3 unterschiedliche Suchanfragen an (z. B. verschiedene Blickwinkel oder Sprachen); sie laufen gleichzeitig. Liefert Zusammenfassungen mit Quellen-Links.',
      parameters: {
        type: 'object',
        properties: { queries: { type: 'array', items: { type: 'string' }, maxItems: 3, description: '1–3 Suchanfragen' } },
        required: ['queries'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'wikipedia',
      description: 'Schlägt einen Begriff, eine Person, einen Ort oder ein Ereignis in Wikipedia nach und liefert die Zusammenfassung der besten Treffer. Gut für Grundwissen und Definitionen.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Suchbegriff, z. B. „Photosynthese“' },
          language: { type: 'string', description: 'Sprachversion, z. B. de oder en (Standard: Sprache des Nutzers)' },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'youtube_video',
      description: 'Holt zu einem YouTube-Link den Titel und Kanal (offizielle Schnittstelle) und sucht im Web nach dem Inhalt des Videos, damit du es zusammenfassen kannst. Nutze es immer, wenn der Nutzer einen YouTube-Link schickt.',
      parameters: { type: 'object', properties: { url: { type: 'string', description: 'YouTube-Link, z. B. https://youtu.be/… oder https://www.youtube.com/watch?v=…' } }, required: ['url'] },
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
  {
    type: 'function',
    function: {
      name: 'validate_html',
      description: 'Prüft eine komplette Webseite (eine HTML-Datei mit eingebettetem CSS/JS), bevor du sie dem Nutzer gibst: Aufbau, nicht geschlossene Tags, JavaScript-Syntaxfehler, fehlende Angaben für Handys. Gibt eine Liste mit Problemen zurück oder „OK“.',
      parameters: { type: 'object', properties: { html: { type: 'string', description: 'Der komplette HTML-Code der Seite' } }, required: ['html'] },
    },
  },
];

function systemPrompt(personal = {}) {
  const now = new Date().toLocaleString('de-DE', { timeZone: 'Europe/Berlin', dateStyle: 'full', timeStyle: 'short' });
  return [
    'Du bist Agent X, der stärkste Assistent von VAIs. Du arbeitest gründlich und selbstständig in mehreren Schritten.',
    lang() !== 'de'
      ? 'Think in English. Start your reasoning with one short sentence about what the user wants, then plan the steps.'
      : 'Denke auf Deutsch. Beginne deine Überlegungen mit einem kurzen Satz, was der Nutzer genau möchte, und plane dann die Schritte.',
    `Heute ist ${now} (Europe/Berlin).`,
    'Nutze deine Werkzeuge, wann immer sie die Antwort besser machen: web_search für alles Aktuelle oder Unsichere (gerne 2–3 verschiedene Suchanfragen auf einmal), wikipedia für Grundwissen, read_webpage um Quellen oder Links zu lesen, calculate für jede Rechnung, current_datetime für Zeitfragen.',
    'Du kannst mehrere Werkzeuge in einem Schritt gleichzeitig aufrufen – mach das, wenn die Aufrufe unabhängig sind.',
    'Prüfe wichtige Fakten bei Bedarf mit einer zweiten Suche. Bevorzuge seriöse Quellen (offizielle Seiten, Wikipedia, bekannte Medien). Erfinde keine Fakten oder Links.',
    'Wenn der Nutzer eine Webseite, App oder ein Spiel möchte: Schreibe EINE komplette HTML-Datei (<!doctype html>, <meta name="viewport">, CSS in <style>, JS in <script>, ohne externe Dateien außer bei Bedarf von cdnjs/jsdelivr), schön gestaltet und fürs Handy geeignet. Prüfe sie mit validate_html, behebe alle gemeldeten Probleme und prüfe erneut (schicke dabei immer die ganze, verbesserte Seite). Die zuletzt geprüfte Fassung wird automatisch an deine Antwort angehängt – schreibe sie am Ende NICHT noch einmal aus, sondern nur 1–3 Sätze, was du gebaut hast.',
    'Diagramme: Wenn Zahlen als Diagramm helfen (Vergleiche, Entwicklungen, Anteile), füge einen Block ```chart mit JSON ein, z. B. {"type":"bar","title":"Einwohner (Mio.)","unit":"Mio.","labels":["Berlin","Hamburg"],"series":[{"name":"2024","data":[3.8,1.9]}]}. type ist bar, line (für Verläufe) oder pie (Anteile, nur eine Reihe). Höchstens 8 Reihen und 40 Werte. Die App zeichnet das Diagramm selbst.',
    'Python: Für Rechnungen, Statistik oder Simulationen kannst du Python-Code in einem ```python-Block schreiben – der Nutzer kann ihn mit „▶ Ausführen“ direkt im Browser laufen lassen (Pyodide; numpy, pandas, matplotlib gehen, kein Internet, keine Dateien). Gib Ergebnisse mit print() aus.',
    'Wenn der Nutzer Bilder angehängt hat, bekommst du eine Beschreibung davon als [Bild …]. Nutze sie, als hättest du das Bild selbst gesehen.',
    `Du kannst auf die Nachricht des Nutzers mit genau EINEM Emoji reagieren (wie in einem Messenger), indem du ganz an den Anfang deiner Antwort [[react:EMOJI]] schreibst. Erlaubt: ${REACTIONS.join(' ')}. Mach das, wenn es passt (z. B. 🎉 bei guten Nachrichten, 😂 bei Witzen, ❤️ bei Dank, 🔥 bei coolen Ideen, ✅ wenn eine Aufgabe erledigt ist), aber nicht bei jeder Nachricht.`,
    'Braucht eine Nachricht keine Antwort (z. B. „ok“, „danke“, „passt“, „gute Nacht“), antworte NUR mit der Reaktion, ohne Text.',
    ...(personal.memoryOn ? [
      'Du hast ein Gedächtnis: Erzählt der Nutzer etwas Dauerhaftes über sich (Name, Alter, Hobbys, Schule/Beruf, Vorlieben, Projekte, wie er angesprochen werden will) oder bittet er dich, dir etwas zu merken, speichere es mit remember – kurz, in der dritten Person (z. B. „Heißt Leeam, mag Grok“). Speichere nichts Sensibles (Passwörter, Gesundheit, Adressen) und nichts Vorübergehendes.',
      personal.memories?.length ? `Was du über den Nutzer weißt:\n${personal.memories.map((m) => `- ${m.text}`).join('\n')}\nNutze das natürlich, ohne es ständig zu erwähnen.` : 'Du weißt noch nichts über den Nutzer.',
    ] : []),
    ...(personal.planFirst ? [
      'PLAN ZUERST: Bei GROSSEN Aufgaben (eine Webseite/App/ein Spiel bauen, eine Recherche mit mehreren Teilen, ein langer Text) und wenn im Gespräch noch KEIN Plan von dir bestätigt wurde: Benutze KEINE Werkzeuge. Antworte nur mit einem kurzen Plan in einem Block ```plan (3–7 nummerierte Schritte, je eine kurze Zeile) und darunter genau einer Frage, ob du so loslegen sollst. Bei kleinen Fragen antwortest du direkt ohne Plan. Hat der Nutzer den Plan bestätigt oder geändert, führst du ihn sofort aus.',
    ] : []),
    ...(personal.summary ? [`Zusammenfassung des bisherigen Gesprächs (ältere Nachrichten werden nicht mehr mitgeschickt):\n${personal.summary}`] : []),
    ...(personal.instructions ? [`So möchte der Nutzer, dass du antwortest (aus seinen Einstellungen):\n"""\n${personal.instructions}\n"""`] : []),
    'Antworte in der Sprache des Nutzers, klar gegliedert mit Markdown. Wenn du Quellen genutzt hast, liste sie am Ende unter „Quellen“ als Links auf.',
  ].join('\n');
}

// ── Werkzeuge ─────────────────────────────────────────────────────
async function searchOnce(query, model, signal, addSources) {
  const msg = await complete({
    model: model.id,
    signal,
    messages: [
      { role: 'system', content: 'Du bist eine Suchmaschine. Suche im Web und antworte knapp mit den wichtigsten Fakten (mit Datum, falls relevant). Bevorzuge seriöse, aktuelle Quellen. Liste am Ende die Quellen als vollständige URLs auf.' },
      { role: 'user', content: query },
    ],
  });
  const text = (msg.content || 'Keine Ergebnisse gefunden.').replace(/\s*【[^】]*】/g, '');
  addSources([...(msg.sources ?? []), ...sourcesFromText(text)]);
  return text;
}

async function webSearch(queries, signal, addSources) {
  const model = await pickModel(SEARCH_PREFERENCE);
  if (!model) throw new Error(t('Websuche ist nicht verfügbar (GROQ_API_KEY fehlt).', 'Web search is not available (GROQ_API_KEY missing).'));
  const results = await Promise.allSettled(queries.map((q) => searchOnce(q, model, signal, addSources)));
  if (signal?.aborted) throw new Error('aborted');
  if (results.every((r) => r.status === 'rejected')) throw results[0].reason;
  return results.map((r, i) => `### Suche: ${queries[i]}\n${r.status === 'fulfilled' ? r.value : `Fehler: ${r.reason?.message}`}`).join('\n\n');
}

// YouTube: Titel/Kanal über die offizielle oEmbed-Schnittstelle, Inhalt über die Websuche
export function youtubeId(raw) {
  let u;
  try { u = new URL(String(raw ?? '').trim()); } catch { return null; }
  const host = u.hostname.replace(/^(www\.|m\.|music\.)/, '');
  let id = null;
  if (host === 'youtu.be') id = u.pathname.slice(1).split('/')[0];
  else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    id = u.searchParams.get('v') || u.pathname.match(/^\/(?:shorts|embed|live|v)\/([\w-]{11})/)?.[1] || null;
  }
  return id && /^[\w-]{11}$/.test(id) ? id : null;
}
async function youtubeVideo(raw, signal, addSources) {
  const id = youtubeId(raw);
  if (!id) throw new Error(t('Das ist kein gültiger YouTube-Link.', 'That is not a valid YouTube link.'));
  const watch = `https://www.youtube.com/watch?v=${id}`;
  const res = await fetch(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(watch)}`, {
    signal: AbortSignal.any([signal ?? new AbortController().signal, AbortSignal.timeout(10_000)]),
    headers: { 'User-Agent': WIKI_UA },
  });
  if (res.status === 401 || res.status === 403) throw new Error(t('Dieses Video ist privat oder nicht einbettbar.', 'This video is private or cannot be embedded.'));
  if (!res.ok) throw new Error(t('Das Video wurde nicht gefunden.', 'The video was not found.'));
  const info = await res.json();
  const title = String(info.title ?? '').slice(0, 200);
  const channel = String(info.author_name ?? '').slice(0, 100);
  addSources([makeSource(watch, `${title} – YouTube`)].filter(Boolean));
  let found = '';
  try {
    found = await webSearch([`"${title}" ${channel} Video Inhalt Zusammenfassung`], signal, addSources);
  } catch (err) {
    found = `Websuche nicht möglich: ${err.message}`;
  }
  return [
    `Video: ${title}`,
    `Kanal: ${channel}`,
    `Link: ${watch}`,
    '',
    'Hinweis: Das Transkript selbst ist nicht verfügbar. Fasse den Inhalt anhand der Suchergebnisse zusammen und sag ehrlich, wenn Informationen fehlen.',
    '',
    found,
  ].join('\n');
}

// Wikipedia: beste Treffer suchen und ihre Zusammenfassungen holen
const WIKI_UA = 'VAIs-AgentX/1.0 (https://vais-dvvk.onrender.com; KI-Assistent)';
async function wikiJson(url, signal) {
  const res = await fetch(url, {
    signal: AbortSignal.any([signal ?? new AbortController().signal, AbortSignal.timeout(10_000)]),
    headers: { 'User-Agent': WIKI_UA, 'Api-User-Agent': WIKI_UA, Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(t(`Wikipedia antwortet mit Fehler ${res.status}.`, `Wikipedia responded with error ${res.status}.`));
  return res.json();
}
export async function wikipedia(query, language, signal, addSources) {
  const code = /^[a-z]{2,3}$/.test(String(language ?? '')) ? language : lang();
  const q = String(query ?? '').trim().slice(0, 200);
  if (!q) throw new Error(t('Kein Suchbegriff.', 'No search term.'));
  const base = `https://${code}.wikipedia.org`;
  const found = await wikiJson(`${base}/w/rest.php/v1/search/page?q=${encodeURIComponent(q)}&limit=3`, signal);
  const pages = (found.pages ?? []).slice(0, 3);
  if (!pages.length) return t(`Kein Wikipedia-Artikel zu „${q}“ gefunden.`, `No Wikipedia article found for “${q}”.`);
  const summaries = await Promise.allSettled(pages.map((p) => wikiJson(`${base}/api/rest_v1/page/summary/${encodeURIComponent(p.key)}`, signal)));
  const out = [];
  const srcs = [];
  summaries.forEach((r, i) => {
    const page = pages[i];
    const sum = r.status === 'fulfilled' ? r.value : null;
    const url = sum?.content_urls?.desktop?.page || `${base}/wiki/${encodeURIComponent(page.key)}`;
    const text = sum?.extract || String(page.excerpt ?? '').replace(/<[^>]+>/g, '');
    out.push(`## ${sum?.title || page.title}\n${sum?.description ? `(${sum.description})\n` : ''}${text}\nURL: ${url}`);
    srcs.push(makeSource(url, `${sum?.title || page.title} – Wikipedia`));
  });
  addSources(srcs.filter(Boolean));
  return out.join('\n\n');
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
  try { url = new URL(raw); } catch { throw new Error(t('Ungültige Adresse.', 'Invalid address.')); }
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error(t('Nur http- und https-Adressen sind erlaubt.', 'Only http and https addresses are allowed.'));
  if (url.username || url.password) throw new Error(t('Adressen mit Zugangsdaten sind nicht erlaubt.', 'Addresses with credentials are not allowed.'));
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (/^localhost$|\.local$|\.internal$/i.test(host)) throw new Error(t('Diese Adresse ist nicht erlaubt.', 'This address is not allowed.'));
  const addrs = net.isIP(host) ? [{ address: host }] : await lookup(host, { all: true });
  if (!addrs.length || addrs.some((a) => isPrivateIp(a.address))) throw new Error(t('Diese Adresse ist nicht erlaubt.', 'This address is not allowed.'));
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
  if (!res.ok) throw new Error(t(`Die Seite antwortet mit Fehler ${res.status}.`, `The page responded with error ${res.status}.`));
  const type = res.headers.get('content-type') || '';
  if (!/text\/|json|xml/i.test(type)) throw new Error(t(`Dieser Dateityp kann nicht gelesen werden (${type.split(';')[0] || 'unbekannt'}).`, `This file type cannot be read (${type.split(';')[0] || 'unknown'}).`));

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

// Webseite prüfen: Aufbau, offene Tags, JS-Syntax (nur übersetzen, niemals ausführen)
const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);
const CHECKED = new Set(['div', 'section', 'main', 'header', 'footer', 'nav', 'article', 'aside', 'ul', 'ol', 'table', 'form', 'button', 'select', 'textarea', 'span', 'a', 'canvas', 'svg', 'label', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6']);
export function validateHtml(html) {
  const src = String(html ?? '');
  const problems = [];
  if (src.length < 40) return 'Problem: Das ist keine komplette Seite.';
  if (!/^\s*<!doctype html>/i.test(src)) problems.push('Am Anfang fehlt <!doctype html>.');
  if (!/<html[\s>]/i.test(src)) problems.push('Es fehlt das <html>-Element.');
  if (!/<head[\s>]/i.test(src)) problems.push('Es fehlt <head>.');
  if (!/<body[\s>]/i.test(src)) problems.push('Es fehlt <body>.');
  if (!/<meta[^>]+charset/i.test(src)) problems.push('Es fehlt <meta charset="utf-8">.');
  if (!/<meta[^>]+name=["']?viewport/i.test(src)) problems.push('Es fehlt <meta name="viewport" content="width=device-width, initial-scale=1"> – sonst ist die Seite auf dem Handy winzig.');
  if (!/<title>[^<]+<\/title>/i.test(src)) problems.push('Es fehlt ein <title>.');

  // Skripte und Styles herausnehmen, dann Tags zählen
  const scripts = [];
  const body = src
    .replace(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi, (_, attrs, code) => { scripts.push({ attrs, code }); return ''; })
    .replace(/<style\b[^>]*>[\s\S]*?<\/style\s*>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '');
  if (/<script\b/i.test(body)) problems.push('Ein <script> wird nicht mit </script> geschlossen.');
  if (/<style\b/i.test(body)) problems.push('Ein <style> wird nicht mit </style> geschlossen.');
  const stack = [];
  for (const m of body.matchAll(/<(\/?)([a-zA-Z][\w-]*)\b[^>]*?(\/?)>/g)) {
    const [, close, rawName, selfClose] = m;
    const name = rawName.toLowerCase();
    if (!CHECKED.has(name) || VOID.has(name) || selfClose) continue;
    if (!close) { stack.push(name); continue; }
    const at = stack.lastIndexOf(name);
    if (at === -1) { problems.push(`</${name}> ohne passendes <${name}>.`); continue; }
    for (const open of stack.splice(at).slice(1)) problems.push(`<${open}> wird nicht geschlossen (vor </${name}>).`);
  }
  for (const open of stack) problems.push(`<${open}> wird nicht geschlossen.`);

  scripts.forEach(({ attrs, code }, i) => {
    if (/\bsrc\s*=/.test(attrs)) {
      const url = attrs.match(/src\s*=\s*["']?([^"'\s>]+)/)?.[1] ?? '';
      if (!/^https:\/\/(cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net|unpkg\.com)\//.test(url)) problems.push(`Externes Skript „${url}“: nur https://cdnjs.cloudflare.com, cdn.jsdelivr.net oder unpkg.com nutzen – oder den Code direkt einbetten.`);
      return;
    }
    if (/type\s*=\s*["']?(module|application\/json|text\/template|importmap)/i.test(attrs) || !code.trim()) return;
    try { new vm.Script(code, { filename: `script-${i + 1}.js` }); } catch (err) {
      const line = String(err.stack ?? '').match(/script-\d+\.js:(\d+)/)?.[1];
      problems.push(`JavaScript-Fehler in <script> Nr. ${i + 1}${line ? `, Zeile ${line}` : ''}: ${err.message}`);
    }
  });
  const ids = [...body.matchAll(/\sid\s*=\s*["']([^"']+)["']/g)].map((m) => m[1]);
  const dup = [...new Set(ids.filter((id, i) => ids.indexOf(id) !== i))];
  if (dup.length) problems.push(`Doppelte id: ${dup.slice(0, 5).join(', ')}.`);
  for (const m of body.matchAll(/<img\b(?![^>]*\balt=)[^>]*>/gi)) { problems.push('Ein <img> hat kein alt="…".'); break; }
  if (/(src|href)\s*=\s*["'](?!https?:|data:|#|mailto:|tel:|javascript:)[^"']+\.(js|css|png|jpe?g|gif|svg|webp)["']/i.test(body)) problems.push('Die Seite verweist auf lokale Dateien, die es nicht gibt. Bette CSS/JS ein und nutze für Bilder Daten-URLs, SVG oder https-Links.');
  return problems.length ? `Probleme gefunden (${problems.length}):\n- ${problems.slice(0, 25).join('\n- ')}` : 'OK – die Seite sieht technisch sauber aus.';
}

function currentDatetime(tz = 'Europe/Berlin') {
  let zone = tz;
  try { new Intl.DateTimeFormat('de-DE', { timeZone: zone }); } catch { zone = 'Europe/Berlin'; }
  const now = new Date();
  return `${now.toLocaleString('de-DE', { timeZone: zone, dateStyle: 'full', timeStyle: 'long' })} (${zone}); ISO: ${now.toISOString()}`;
}

function runTool(name, args, signal, addSources, ctx) {
  switch (name) {
    case 'web_search': {
      const list = (Array.isArray(args.queries) ? args.queries : [args.query ?? args.queries])
        .map((q) => String(q ?? '').trim()).filter(Boolean).slice(0, 3);
      if (!list.length) list.push(ctx.question.slice(0, 120));
      return { steps: list.map((q) => ({ kind: 'search', text: q })), run: () => webSearch(list, signal, addSources) };
    }
    case 'youtube_video': return { steps: [{ kind: 'video', text: String(args.url ?? '').replace(/^https?:\/\/(www\.)?/, '').slice(0, 60) }], run: () => youtubeVideo(args.url, signal, addSources) };
    case 'wikipedia': return { steps: [{ kind: 'wiki', text: String(args.query ?? '').slice(0, 80) }], run: () => wikipedia(args.query, args.language, signal, addSources) };
    case 'read_webpage': {
      let label = String(args.url ?? '');
      try { const u = new URL(label); label = u.hostname + (u.pathname.length > 1 ? u.pathname : ''); } catch { /* egal */ }
      return { steps: [{ kind: 'read', text: label.slice(0, 80) }], run: () => readWebpage(String(args.url ?? ''), signal, addSources) };
    }
    case 'calculate': return { steps: [{ kind: 'calc', text: String(args.expression ?? '') }], run: async () => String(calculate(args.expression)) };
    case 'current_datetime': return { steps: [{ kind: 'time', text: t('Datum und Uhrzeit', 'Date and time') }], run: async () => currentDatetime(args.timezone) };
    case 'set_reminder': return { steps: [{ kind: 'reminder', text: String(args.text ?? '').slice(0, 80) }], run: () => (ctx.reminder ? ctx.reminder(args) : 'Erinnerungen sind nicht verfügbar.') };
    case 'remember': return { steps: [{ kind: 'memory', text: String(args.fact ?? '').slice(0, 80) }], run: () => (ctx.remember ? ctx.remember(args.fact) : 'Gedächtnis nicht verfügbar.') };
    case 'validate_html': {
      const html = String(args.html ?? '');
      ctx.lastHtml = html;
      return { steps: [{ kind: 'check', text: t('Webseite', 'Website') }], run: async () => validateHtml(html) };
    }
    default: return { steps: [{ kind: 'other', text: String(name) }], run: async () => `Unbekanntes Werkzeug: ${name}` };
  }
}

// Quellen aufräumen: gleiche Seiten zusammenfassen, Such- und Weiterleitungslinks weg, seriöse zuerst
const TRUSTED = /(^|\.)(wikipedia\.org|\.gov|\.gv\.at|admin\.ch|bund\.de|europa\.eu|who\.int|tagesschau\.de|zdf\.de|spiegel\.de|zeit\.de|faz\.net|sueddeutsche\.de|reuters\.com|apnews\.com|bbc\.(co\.uk|com)|nytimes\.com|theguardian\.com|nature\.com|github\.com|mozilla\.org|\.edu)$/i;
const JUNK = /(^|\.)(google\.[a-z.]+|bing\.com|duckduckgo\.com|vertexaisearch\.cloud\.google\.com)$/i;
export function sourceCleaner(emit) {
  const seen = new Set();
  return (list) => {
    const fresh = [];
    for (const src of list ?? []) {
      if (!src?.url) continue;
      let u;
      try { u = new URL(src.url); } catch { continue; }
      const host = u.hostname.replace(/^www\./, '').replace(/^m\./, '');
      if (JUNK.test(host)) continue;
      for (const k of [...u.searchParams.keys()]) if (/^(utm_|fbclid|gclid|ref$|ref_)/i.test(k)) u.searchParams.delete(k);
      u.hash = '';
      const key = `${host}${u.pathname.replace(/\/$/, '')}${u.search}`.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      fresh.push({ ...src, url: u.href });
    }
    fresh.sort((a, b) => Number(TRUSTED.test(new URL(b.url).hostname)) - Number(TRUSTED.test(new URL(a.url).hostname)));
    if (fresh.length) emit(fresh);
  };
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

// Bilder für Agent X: ein Modell mit 👁 beschreibt sie, Agent X arbeitet mit der Beschreibung
const VISION_PREFERENCE = [/^groq:meta-llama\/llama-4-maverick/, /^groq:meta-llama\/llama-4-scout/, /^gemini:gemini-2\.5-flash$/, /^mistral:.*pixtral|mistral-medium/, /^openrouter:.*/];
async function describeImages(messages, signal, onStep) {
  const MAX = 4;
  let count = 0;
  const jobs = [];
  for (const m of messages) {
    if (m.role !== 'user' || !Array.isArray(m.content)) continue;
    const text = m.content.filter((p) => p.type === 'text').map((p) => p.text).join('\n');
    const imgs = m.content.filter((p) => p.type === 'image_url');
    const take = imgs.slice(0, Math.max(0, MAX - count));
    count += take.length;
    jobs.push({ m, text, imgs: take, skipped: imgs.length - take.length });
  }
  if (!jobs.some((j) => j.imgs.length)) return messages;
  const all = (await listModels()).filter((m) => m.caps.includes('vision') && !m.paid && !m.busy);
  let model = null;
  for (const re of VISION_PREFERENCE) { model = all.find((m) => re.test(m.id)); if (model) break; }
  const total = jobs.reduce((n, j) => n + j.imgs.length, 0);
  onStep({ kind: 'look', text: total === 1 ? t('1 Bild', '1 image') : t(`${total} Bilder`, `${total} images`) });
  const out = new Map();
  await Promise.all(jobs.map(async (job) => {
    if (!job.imgs.length) { out.set(job.m, job.text); return; }
    let desc;
    if (!model) desc = t('[Bild – konnte nicht angesehen werden, kein Bildmodell frei]', '[Image – could not be viewed, no vision model free]');
    else {
      try {
        const msg = await complete({
          model: model.id,
          signal,
          messages: [{ role: 'user', content: [
            { type: 'text', text: `Beschreibe ${job.imgs.length > 1 ? 'diese Bilder (nummeriert)' : 'dieses Bild'} sehr genau und sachlich für jemanden, der ${job.imgs.length > 1 ? 'sie' : 'es'} nicht sehen kann: Inhalt, Personen/Objekte, Farben, Anordnung und vor allem JEDEN sichtbaren Text wörtlich (z. B. Aufgaben, Fehlermeldungen, Tabellen, Code). Die Frage des Nutzers dazu: „${job.text.slice(0, 500)}“` },
            ...job.imgs,
          ] }],
        });
        desc = `[Bild${job.imgs.length > 1 ? 'er' : ''} – Beschreibung von ${model.name}:\n${String(msg.content ?? '').trim()}]`;
      } catch (err) {
        if (signal?.aborted) throw err;
        onStep({ kind: 'error', text: err.message });
        desc = t('[Bild – konnte nicht angesehen werden]', '[Image – could not be viewed]');
      }
    }
    out.set(job.m, `${job.text}\n\n${desc}${job.skipped ? `\n[+${job.skipped} weitere Bilder ausgelassen]` : ''}`);
  }));
  return messages.map((m) => (out.has(m) ? { role: 'user', content: out.get(m) } : m));
}

// ── Platz sparen: Webseiten-Code nicht mehrfach mitschicken (sonst platzt das kostenlose Limit) ──
const HTML_FENCE = /```html?\b[\s\S]*?(?:```|$)/gi;
const lines = (code) => code.split('\n').length;
// Im Verlauf nur die neueste Webseite behalten, ältere durch einen kurzen Hinweis ersetzen
export function compactHistory(messages) {
  let keep = true;
  const out = [...messages];
  for (let i = out.length - 1; i >= 0; i--) {
    const m = out[i];
    if (m.role !== 'assistant' || typeof m.content !== 'string' || !/```html?\b/i.test(m.content)) continue;
    if (keep) { keep = false; continue; }
    out[i] = { ...m, content: m.content.replace(HTML_FENCE, (code) => `[Webseite aus einer früheren Antwort, ${lines(code)} Zeilen – nicht mehr aktuell]`) };
  }
  return out;
}
// Bei validate_html nur den neuesten Code im Gespräch lassen
function stripOldHtml(convo) {
  let seen = false;
  for (let i = convo.length - 1; i >= 0; i--) {
    const m = convo[i];
    if (m.role !== 'assistant' || !m.tool_calls?.length) continue;
    m.tool_calls = m.tool_calls.map((c) => {
      if (c.function?.name !== 'validate_html') return c;
      if (!seen) { seen = true; return c; }
      return { ...c, function: { ...c.function, arguments: JSON.stringify({ html: '[ältere Fassung entfernt]' }) } };
    });
  }
  // Gibt es schon eine neue Fassung, braucht es die Webseiten aus früheren Antworten nicht mehr
  if (!seen) return;
  for (const m of convo) {
    if (m.role === 'assistant' && typeof m.content === 'string' && /```html?\b/i.test(m.content)) {
      m.content = m.content.replace(HTML_FENCE, (code) => `[Webseite aus einer früheren Antwort, ${lines(code)} Zeilen – inzwischen überarbeitet]`);
    }
  }
}
// Notbremse: alles kürzen, was nicht unbedingt nötig ist
function squeeze(convo, hard = false) {
  stripOldHtml(convo);
  for (const m of convo) {
    if (m.role === 'tool' && typeof m.content === 'string' && m.content.length > (hard ? 1200 : 3000)) m.content = `${m.content.slice(0, hard ? 1200 : 3000)}\n[… gekürzt]`;
  }
  if (hard) {
    // ältere Nachrichten des Gesprächs weglassen (System + die letzten Schritte bleiben)
    const firstUser = convo.findIndex((m) => m.role === 'user');
    const lastUser = convo.map((m) => m.role).lastIndexOf('user');
    if (firstUser > 0 && lastUser > firstUser) convo.splice(firstUser, lastUser - firstUser);
    for (const m of convo) {
      if (m.role === 'assistant' && typeof m.content === 'string') m.content = m.content.replace(HTML_FENCE, (code) => `[Webseite, ${lines(code)} Zeilen]`);
    }
  }
}
const tooBig = (err) => err?.status === 413 || (err?.status === 400 && /zu lang|zu groß|too long|too large|context/i.test(err.message)) || /zu groß für das kostenlose Limit|too large for this model/i.test(err?.message ?? '');
// Ersatz, wenn das Hauptmodell voll ist oder die Anfrage zu groß war (größere Limits)
const AGENT_BACKUP = [/^groq:meta-llama\/llama-4-scout/, /^groq:moonshotai\/kimi-k2/, /^groq:.*llama-3\.3-70b/, /^groq:meta-llama\/llama-4-maverick/, /^groq:qwen\/qwen3/, /^groq:openai\/gpt-oss-20b$/, /^gemini:gemini-2\.5-flash$/];

const hasHtmlBlock = (text) => /```html?\b[\s\S]*?<\/html>/i.test(text ?? '');

export async function runAgent({ messages, signal, onStep, onText, onReasoning = () => {}, onSources = () => {}, onReact = () => {}, personal = {}, onRemember = null, onReminder = null, inbox = null }) {
  onReact('👀'); // „hab’s gesehen, bin dran“
  if (demoMode) return demoAgent({ messages, signal, onStep, onText, onReasoning, onSources, onReact, remember: personal.memoryOn ? onRemember : null, reminder: onReminder, planFirst: personal.planFirst, inbox });
  const model = await pickModel(AGENT_PREFERENCE);
  if (!model) throw new Error(t('Agent X braucht einen Groq-Schlüssel (GROQ_API_KEY), damit er Werkzeuge benutzen kann.', 'Agent X needs a Groq key (GROQ_API_KEY) to use tools.'));

  const addSources = sourceCleaner(onSources);
  const seeing = compactHistory(await describeImages(messages, signal, onStep));
  const last = seeing.at(-1)?.content;
  const ctx = { question: typeof last === 'string' ? last : '', lastHtml: '', remember: personal.memoryOn ? onRemember : null, reminder: onReminder };
  const convo = [{ role: 'system', content: systemPrompt(personal) }, ...seeing];
  const agentTools = [...TOOLS, ...(personal.memoryOn && onRemember ? [REMEMBER_TOOL] : []), ...(onReminder ? [REMINDER_TOOL] : [])];

  // Am Ende: wurde eine Webseite geprüft, aber nicht mitgeschickt, hängen wir die geprüfte Fassung an
  const finish = (content) => {
    const split = splitReaction(content);
    onReact(split.reaction); // 👀 durch die passende Reaktion ersetzen (oder entfernen)
    if (split.reaction && !split.text.trim() && !ctx.lastHtml) return undefined; // nur Emoji, kein Text
    let text = split.text || t('Ich konnte leider keine Antwort finden.', 'Sorry, I could not find an answer.');
    if (ctx.lastHtml && !hasHtmlBlock(text) && /<\/html>/i.test(ctx.lastHtml)) text += `\n\n\`\`\`html\n${ctx.lastHtml.trim()}\n\`\`\``;
    return emitText(text, onText, signal);
  };

  // Modell fragen; ist die Anfrage zu groß oder das Modell voll: kürzen, dann auf ein anderes Modell ausweichen
  let current = model;
  const tried = new Set([model.id]);
  async function ask(extra = {}) {
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        return await complete({ model: current.id, messages: convo, signal, ...extra });
      } catch (err) {
        if (signal?.aborted) throw err;
        const big = tooBig(err);
        if (!big && ![429, 500, 502, 503, 504].includes(err.status)) throw err;
        if (big && attempt < 2) { squeeze(convo, attempt === 1); continue; } // erst kürzen, dann stärker kürzen
        const all = await listModels();
        const next = AGENT_BACKUP.map((re) => all.find((m) => re.test(m.id) && !m.busy && !tried.has(m.id))).find(Boolean);
        if (!next) throw err;
        console.log(`Agent X: ${current.id} → ${next.id} (${err.message})`);
        tried.add(next.id);
        current = next;
      }
    }
    throw new Error(t('Agent X konnte gerade nicht antworten. Versuch es gleich noch einmal.', 'Agent X could not answer right now. Please try again shortly.'));
  }

  // Nachträge, die der Nutzer während der Arbeit schickt, sofort berücksichtigen
  const takeInbox = () => {
    while (inbox?.length) {
      const extra = inbox.shift();
      onStep({ kind: 'inbox', text: extra.slice(0, 80) });
      convo.push({ role: 'user', content: `(Nachtrag des Nutzers, während du arbeitest – berücksichtige das): ${extra}` });
    }
  };
  for (let round = 0; round < MAX_STEPS; round++) {
    takeInbox();
    const msg = await ask({ tools: agentTools });
    const thought = msg.reasoning ?? msg.reasoning_content;
    if (thought) await emitText(`${thought.trim()}\n\n`, onReasoning, signal, 6, 8);
    const calls = msg.tool_calls ?? [];
    if (!calls.length && inbox?.length) {
      // Kurz vor dem Ende kam noch etwas vom Nutzer → nochmal mit dem Nachtrag
      convo.push({ role: 'assistant', content: msg.content ?? '' });
      continue;
    }
    if (!calls.length) return finish(msg.content);

    convo.push({ role: 'assistant', content: msg.content ?? '', tool_calls: calls });
    // Alle Werkzeuge dieses Schritts gleichzeitig ausführen
    const tools = calls.map((call) => {
      let args = {};
      try { args = JSON.parse(call.function?.arguments || '{}'); } catch { /* leere Argumente */ }
      const tool = runTool(call.function?.name, args, signal, addSources, ctx);
      tool.steps.forEach(onStep);
      return tool;
    });
    const results = await Promise.all(tools.map(async (tool) => {
      try {
        return await tool.run();
      } catch (err) {
        if (signal?.aborted) throw err;
        onStep({ kind: 'error', text: err.message });
        return `Fehler: ${err.message}`;
      }
    }));
    calls.forEach((call, i) => convo.push({ role: 'tool', tool_call_id: call.id, content: String(results[i]).slice(0, 14_000) }));
    if (calls.some((c) => c.function?.name === 'validate_html')) stripOldHtml(convo);
  }
  // Zu viele Schritte: mit dem bisher Gesammelten antworten
  convo.push({ role: 'user', content: 'Beantworte jetzt meine Frage mit den gesammelten Informationen, ohne weitere Werkzeuge.' });
  const final = await ask();
  return finish(final.content);
}

async function demoAgent({ messages, onStep, onText, onReasoning, onSources, onReact, signal, remember, reminder, planFirst, inbox }) {
  const lastMsg = [...messages].reverse().find((m) => m.role === 'user')?.content ?? '';
  const q = Array.isArray(lastMsg) ? lastMsg.filter((p) => p.type === 'text').map((p) => p.text).join(' ') : String(lastMsg);
  const pics = Array.isArray(lastMsg) ? lastMsg.filter((p) => p.type === 'image_url').length : 0;
  const planned = messages.some((m) => m.role === 'assistant' && typeof m.content === 'string' && m.content.includes('```plan'));
  const site = /webseite|website|seite|app|spiel|game|html/i.test(q) || (planned && /leg los|go ahead|\bja\b|\byes\b/i.test(q));
  const rem = q.match(/erinnere mich in (\d+) minuten? an (.+)/i);
  if (rem && reminder) {
    onStep({ kind: 'reminder', text: rem[2] });
    let msg;
    try { msg = await reminder({ text: rem[2], in_minutes: Number(rem[1]) }); } catch (err) { msg = err.message; }
    onReact('✅');
    return emitText(`**Agent X (Demo)** – ${msg.replace(/ ACHTUNG:.*/, ' Schalte Benachrichtigungen in den Einstellungen ein, damit sie ankommt.')}`, onText, signal);
  }
  const fact = q.match(/(?:merk dir|ich heiße|mein name ist)\s*:?\s*(.{2,80})/i)?.[1];
  if (fact && remember) {
    onStep({ kind: 'memory', text: fact });
    await remember(fact);
    onReact('👍');
    return emitText(`**Agent X (Demo)** – gemerkt: „${fact}“.`, onText, signal);
  }
  if (site && planFirst && !planned) {
    await sleep(300);
    return emitText('Gute Idee! So würde ich vorgehen:\n\n```plan\n1. Aufbau und Farben festlegen\n2. Startbereich mit großer Überschrift\n3. Zähler-Knopf mit Animation\n4. Fürs Handy anpassen\n5. Seite prüfen und verbessern\n```\n\nSoll ich so loslegen?', onText, signal, 6, 8);
  }
  await emitText(`Der Nutzer möchte: „${q.slice(0, 80)}“. ${site ? 'Ich baue eine Webseite, prüfe sie und verbessere sie.' : 'Ich suche parallel, schlage in Wikipedia nach, lese eine Quelle und rechne nach.'}`, onReasoning, signal, 2, 40);
  if (pics) { await sleep(400); onStep({ kind: 'look', text: pics === 1 ? '1 Bild' : `${pics} Bilder` }); }
  if (site) {
    await sleep(500); onStep({ kind: 'check', text: 'Webseite' });
    await sleep(500); onStep({ kind: 'check', text: 'Webseite' });
    const page = '<!doctype html>\n<html lang="de">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n<title>Demo</title>\n<style>body{font-family:system-ui;display:grid;place-items:center;min-height:100vh;margin:0;background:#f6f5f1}button{font-size:20px;padding:12px 20px;border-radius:12px;border:0;background:#1f1e1c;color:#fff}</style>\n</head>\n<body>\n<button id="b">Klick mich: 0</button>\n<script>let n=0;b.onclick=()=>{b.textContent=`Klick mich: ${++n}`;};</script>\n</body>\n</html>';
    onReact('🔥');
    return emitText(`**Agent X (Demo)** – ich habe die Seite gebaut und mit \`validate_html\` geprüft.\n\n\`\`\`html\n${page}\n\`\`\``, onText, signal, 6, 8);
  }
  if (/diagramm|chart|python|statistik/i.test(q)) {
    await sleep(300);
    onReact('🔥');
    return emitText('**Agent X (Demo)** – hier als Diagramm:\n\n```chart\n{"type":"bar","title":"Einwohner der größten Städte","unit":"Mio.","labels":["Berlin","Hamburg","München","Köln"],"series":[{"name":"2023","data":[3.76,1.89,1.51,1.08]},{"name":"2013","data":[3.42,1.75,1.41,1.02]}]}\n```\n\nUnd zum Nachrechnen in Python:\n\n```python\nstaedte = {"Berlin": 3.76, "Hamburg": 1.89, "München": 1.51, "Köln": 1.08}\nfor name, mio in staedte.items():\n    print(f"{name}: {mio} Mio.")\nprint("Summe:", round(sum(staedte.values()), 2), "Mio.")\n```', onText, signal, 8, 6);
  }
  await sleep(400); onStep({ kind: 'search', text: q.slice(0, 60) });
  onStep({ kind: 'search', text: `${q.slice(0, 40)} aktuell` });
  onStep({ kind: 'wiki', text: q.split(/\s+/).slice(-1)[0] || 'VAIs' });
  onSources([{ url: 'https://de.wikipedia.org/wiki/Berlin', title: 'Berlin – Wikipedia' }, { url: 'https://www.wetter.com/deutschland/berlin/', title: 'Wetter Berlin | wetter.com' }]);
  await sleep(700); onStep({ kind: 'read', text: 'example.com/artikel' });
  const extras = [];
  while (inbox?.length) { const x = inbox.shift(); extras.push(x); onStep({ kind: 'inbox', text: x }); }
  await sleep(500); onStep({ kind: 'calc', text: '21 * 2' });
  await sleep(400);
  onReact(/witz|joke/i.test(q) ? '😂' : null);
  await emitText(`**Agent X (Demo)**\n\n${pics ? 'Auf dem Bild sehe ich (Demo) etwas Schönes. ' : ''}Ich habe parallel gesucht, Wikipedia gelesen und gerechnet: 21 × 2 = **${calculate('21*2')}**.${extras.length ? ` Deinen Nachtrag „${extras.join('“, „')}“ habe ich berücksichtigt.` : ''}\n\nMit einem Groq-Schlüssel arbeite ich mit echten Werkzeugen.\n\n**Quellen**\n- [example.com](https://example.com)`, onText, signal);
}

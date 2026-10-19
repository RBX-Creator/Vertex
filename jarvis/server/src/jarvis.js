// Jarvis' Kopf: baut den System-Prompt aus core/ + Gedächtnis und leitet jede Anfrage weiter:
//   Gemini (Gesprächsmodus) → gibt Längeres an Claude (Arbeitsmodus, worker.js) ab
//   ohne Gemini: Claude beantwortet direkt
//   ohne Schlüssel: Demo-Modus
import Anthropic from "@anthropic-ai/sdk";
import fs from "node:fs/promises";
import path from "node:path";
import { CORE_DIR, userDir } from "./paths.js";
import { brainSnapshot, countOpenPlaceholders, runMemoryCommand, MemoryError } from "./brain.js";
import { teamNames } from "./users.js";
import { geminiEnabled, geminiTurn, geminiErrorText } from "./gemini.js";
import * as worker from "./worker.js";
import * as verbindungen from "./verbindungen.js";

const MODEL = process.env.JARVIS_MODEL || "claude-opus-5-5";
const EFFORT = process.env.JARVIS_EFFORT || "low"; // Chat/Sprache: schnell. Für mehr Tiefe: medium/high.
const TZ = process.env.JARVIS_TZ || "Europe/Berlin";
const HISTORY_LIMIT = 40; // gespeicherte Nachrichten (User + Jarvis) pro Nutzer
const MAX_TOOL_ROUNDS = 15;

export const DEMO =
  process.env.JARVIS_DEMO === "1" ||
  (process.env.JARVIS_DEMO !== "0" && !geminiEnabled() && !worker.workerEnabled());

export const brainMode = () => (DEMO ? "demo" : geminiEnabled() ? "gemini" : "claude");

let client;
const MEMORY_TOOL = { type: "memory_20250818", name: "memory" };

// ---------- Prompt ----------

async function loadCore(modus) {
  const files = ["personality.md", "rules.md"];
  for (const f of (await fs.readdir(path.join(CORE_DIR, "faehigkeiten"))).sort()) files.push(path.join("faehigkeiten", f));
  if (modus) files.push(path.join("modus", `${modus}.md`));
  const texts = await Promise.all(files.map((f) => fs.readFile(path.join(CORE_DIR, f), "utf8")));
  return texts.join("\n\n---\n\n");
}

export function today(date = new Date()) {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: TZ }).format(date); // JJJJ-MM-TT
}

function nowText() {
  return new Intl.DateTimeFormat("de-DE", {
    timeZone: TZ,
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date());
}

async function buildContext(user, { voice, modus }) {
  const open = await countOpenPlaceholders(user.id);
  const situation = [
    "# Aktuelle Situation",
    `- Jetzt: ${nowText()} (${TZ}), Datum ${today()}`,
    `- Angemeldet: ${user.name}`,
    `- Gewünschte Anrede: „${user.settings.anrede}“`,
    modus === "arbeit"
      ? "- Du arbeitest im Hintergrund an einem Auftrag."
      : `- Eingabe kam per: ${voice ? "SPRACHE → Sprachmodus-Regeln anwenden" : "Text"}`,
    `- Team: ${teamNames().join(", ")}`,
    open > 0
      ? `- Gedächtnis noch lückenhaft (${open} offene Stellen). Nebenbei lernen, nicht verhören.`
      : "- Gedächtnis ist gut gefüllt.",
    "",
    "# Kurzüberblick aus dem Gedächtnis",
    await brainSnapshot(user.id),
  ].join("\n");
  return { core: await loadCore(modus), situation };
}

// Claude-Format: stabiler Teil zuerst und gecacht, der wechselnde Teil danach.
const claudeSystem = ({ core, situation }) => [
  { type: "text", text: core, cache_control: { type: "ephemeral" } },
  { type: "text", text: situation },
];

// ---------- Verlauf ----------

const historyFile = (userId) => path.join(userDir(userId), "verlauf.json");

export async function loadHistory(userId) {
  try {
    return JSON.parse(await fs.readFile(historyFile(userId), "utf8"));
  } catch {
    return [];
  }
}

async function saveHistory(userId, history) {
  let h = history.slice(-HISTORY_LIMIT);
  while (h.length && h[0].role !== "user") h = h.slice(1);
  await fs.writeFile(historyFile(userId), JSON.stringify(h, null, 1), "utf8");
}

export async function clearHistory(userId) {
  await fs.rm(historyFile(userId), { force: true });
}

// ---------- Aufträge ----------

export function jobTools(user) {
  return {
    startJob: (args) => worker.startJob(user, args, async () => claudeSystem(await buildContext(user, { modus: "arbeit" }))),
    listJobs: () => worker.listJobs(user.id),
  };
}

const noNewJobs = async () => {
  throw new Error("Während einer Auftrags-Rückmeldung werden keine neuen Aufträge gestartet. Frag den Nutzer, ob er einen will.");
};

// ---------- Ein Gesprächszug ----------

const describeMemory = (input) => {
  const p = input.path || input.old_path || "";
  const verb = { view: "liest", create: "schreibt", str_replace: "aktualisiert", insert: "ergänzt", delete: "löscht", rename: "verschiebt" }[input.command] || input.command;
  return { verb, path: p, write: input.command !== "view" };
};

/**
 * Führt einen Zug aus. `emit` bekommt Ereignisse:
 *   {type:"text", text}                Text-Stück zum Anzeigen/Vorlesen
 *   {type:"memory", verb, path, write} Jarvis greift aufs Gedächtnis zu
 *   {type:"job", job}                  Auftrag an den Arbeitsmodus gestartet
 *   {type:"error", message}
 * `hidden` = die Eingabe kommt vom System (z. B. App geöffnet) und wird nicht als Chat angezeigt.
 * `image` = {mime, data(base64)} – ein Foto aus der Kamera („Augen“).
 * `signal` = AbortSignal zum Unterbrechen. `meta` wird am Verlaufseintrag gespeichert (z. B. Auftragsergebnis).
 */
export async function runTurn(user, text, { voice = false, hidden = false, image, meta, emit, signal }) {
  const history = await loadHistory(user.id);
  // Bilder werden nicht im Verlauf gespeichert – nur ein Vermerk.
  const userEntry = {
    role: "user",
    content: image ? (text === "[Foto ohne Kommentar]" ? "[Foto]" : `[Foto] ${text}`) : text,
    ...(hidden ? { hidden: true } : {}),
    ...(meta || {}),
  };
  let answer = "";
  const out = (t) => {
    if (!t || signal?.aborted) return;
    answer += t;
    emit({ type: "text", text: t });
  };

  try {
    const mode = brainMode();
    if (mode === "demo") {
      await demoTurn(user, text, out, emit);
    } else if (mode === "gemini") {
      const ctx = await buildContext(user, { voice, modus: "gespraech" });
      await geminiTurn({
        user,
        history,
        text,
        image,
        systemText: `${ctx.core}\n\n---\n\n${ctx.situation}`,
        out,
        emit,
        // Während ein fertiger Auftrag gemeldet wird, keine neuen Aufträge (verhindert Schleifen).
        tools: meta?.job ? { ...jobTools(user), startJob: noNewJobs } : jobTools(user),
        signal,
      });
    } else {
      await claudeTurn(user, history, text, image, voice, out, emit, signal);
    }
  } catch (err) {
    if (!signal?.aborted) {
      console.error("[jarvis]", err);
      emit({ type: "error", message: errorText(err) });
    }
  }

  if (answer.trim()) {
    history.push(userEntry, { role: "assistant", content: answer.trim() + (signal?.aborted ? " […]" : "") });
    await saveHistory(user.id, history);
  }
  return answer;
}

function errorText(err) {
  const g = geminiErrorText(err);
  if (g) return g;
  if (err instanceof Anthropic.AuthenticationError) return "Claude-Schlüssel ungültig. Bitte config/.env prüfen.";
  if (err instanceof Anthropic.RateLimitError) return "Zu viele Anfragen gerade. Gleich nochmal.";
  if (err instanceof Anthropic.APIConnectionError) return "Keine Verbindung zu Claude.";
  if (err instanceof Anthropic.APIError) return `Claude-Fehler ${err.status ?? ""}`.trim();
  return "Interner Fehler.";
}

async function claudeTurn(user, history, text, image, voice, out, emit, signal) {
  client ??= new Anthropic();
  const system = claudeSystem(await buildContext(user, { voice }));
  // Verlauf nur als Text (ohne Denk-/Tool-Blöcke) – innerhalb eines Zugs wird nur angehängt.
  const messages = [
    ...history.map(({ role, content }) => ({ role, content })),
    {
      role: "user",
      content: image
        ? [{ type: "image", source: { type: "base64", media_type: image.mime, data: image.data } }, { type: "text", text }]
        : text,
    },
  ];
  let jsonRetries = 0;
  let lastChunk = "";

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    if (round > 0 && /\S$/.test(lastChunk)) out(" ");
    const stream = client.beta.messages.stream(
      {
        model: MODEL,
        max_tokens: 16000,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        thinking: { type: "adaptive" },
        output_config: { effort: EFFORT },
        system,
        tools: [MEMORY_TOOL],
        messages,
      },
      { signal },
    );
    stream.on("text", (delta) => {
      lastChunk = delta;
      out(delta);
    });

    let message;
    try {
      message = await stream.finalMessage();
      jsonRetries = 0;
    } catch (err) {
      if (err instanceof Anthropic.APIError || signal?.aborted || jsonRetries++ >= 2) throw err;
      continue; // Werkzeug-Eingabe war kein gültiges JSON – Zug neu anfragen
    }

    if (message.stop_reason === "refusal") {
      emit({ type: "error", message: "Diese Anfrage wurde abgelehnt." });
      return;
    }
    if (message.stop_reason === "pause_turn") {
      messages.push({ role: "assistant", content: message.content });
      continue;
    }
    const toolUses = message.content.filter((b) => b.type === "tool_use");
    if (toolUses.length === 0) return;
    if (message.stop_reason === "max_tokens") {
      emit({ type: "error", message: "Antwort wurde abgeschnitten." });
      return;
    }

    messages.push({ role: "assistant", content: message.content });
    const results = [];
    for (const tool of toolUses) {
      if (tool.name !== "memory" || typeof tool.input !== "object" || !tool.input) {
        results.push({ type: "tool_result", tool_use_id: tool.id, is_error: true, content: "Unbekanntes Werkzeug." });
        continue;
      }
      emit({ type: "memory", ...describeMemory(tool.input) });
      try {
        results.push({ type: "tool_result", tool_use_id: tool.id, content: await runMemoryCommand(user.id, tool.input) });
      } catch (err) {
        if (!(err instanceof MemoryError)) console.error("[memory]", err);
        results.push({ type: "tool_result", tool_use_id: tool.id, is_error: true, content: err.message });
      }
    }
    messages.push({ role: "user", content: results });
  }
  emit({ type: "error", message: "Zu viele Gedächtnis-Schritte – abgebrochen." });
}

// ---------- App geöffnet / Auftrag fertig ----------

/**
 * Beim Öffnen der App: Gibt den versteckten Systemhinweis für Begrüßung bzw. Briefing zurück,
 * oder null, wenn heute schon begrüßt wurde.
 */
export async function openHint(user) {
  const stateFile = path.join(userDir(user.id), "status.json");
  let state = {};
  try {
    state = JSON.parse(await fs.readFile(stateFile, "utf8"));
  } catch {}
  const day = today();
  const firstToday = state.letzterBesuch !== day;
  const neu = !state.ersterBesuch;
  state.letzterBesuch = day;
  state.ersterBesuch ??= day;
  await fs.writeFile(stateFile, JSON.stringify(state), "utf8");

  const pending = await worker.pendingReports(user.id);
  if ((!firstToday || !user.settings.autoBriefing) && pending.length === 0) return null;
  for (const j of pending) await worker.markReported(user.id, j.id);
  const berichte = pending.length
    ? `\nFertige Aufträge seit dem letzten Besuch (kurz erwähnen, Details stehen im Chat):\n${pending
        .map((j) => `- „${j.titel}“ (${j.status}): ${j.ergebnis.split("\n")[0].slice(0, 300)}`)
        .join("\n")}`
    : "";
  let termine = "";
  if (firstToday && user.settings.autoBriefing && (await verbindungen.hasKalender(user.id))) {
    try {
      const t = await verbindungen.termine(user.id, 2);
      termine = t.length
        ? `\nTermine heute und morgen:\n${t.map((x) => `- ${x.tag} ${x.zeit}: ${x.titel}${x.ort ? ` (${x.ort})` : ""}`).join("\n")}`
        : "\nKeine Termine heute und morgen.";
    } catch (err) {
      termine = `\n(Kalender gerade nicht erreichbar: ${err.message})`;
    }
  }
  if (neu) {
    return `[System: Der Nutzer hat die App zum allerersten Mal geöffnet. Stell dich in zwei, drei Sätzen vor – im Jarvis-Stil – und stell genau eine Frage, mit der du ihn kennenlernst.]`;
  }
  if (!firstToday || !user.settings.autoBriefing) {
    return `[System: Der Nutzer ist wieder da.${berichte}]`;
  }
  return `[System: Der Nutzer hat die App heute zum ersten Mal geöffnet. Gib das Briefing.${termine}${berichte}]`;
}

export const jobDoneHint = (job) =>
  `[System: Dein Auftrag „${job.titel}“ ist ${job.status === "fertig" ? "fertig" : "fehlgeschlagen"}. ` +
  `Ergebnis:\n${job.ergebnis.slice(0, 6000)}\n\nMelde es dem Nutzer jetzt kurz (höchstens drei Sätze, Wichtigstes zuerst). ` +
  `Das vollständige Ergebnis steht bereits im Chat.]`;

// ---------- Demo-Modus (ohne API-Schlüssel) ----------

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function demoTurn(user, text, out, emit) {
  const a = user.settings.anrede;
  const t = text.toLowerCase();
  let reply;
  const merk = text.match(/merk(?:e)? dir,?\s*(?:dass\s+)?(.+)/i);
  if (merk) {
    const entry = `- (${today()}) ${merk[1].replace(/[.!]+$/, "")}`;
    const file = "/memories/ich/gedaechtnis/fakten.md";
    emit({ type: "memory", verb: "ergänzt", path: file, write: true });
    const current = await runMemoryCommand(user.id, { command: "view", path: file });
    const lineCount = current.split("\n").length;
    await runMemoryCommand(user.id, { command: "insert", path: file, insert_line: lineCount, insert_text: entry });
    reply = `Notiert, ${a}.`;
  } else if (t.includes("[system") || /briefing|guten morgen|was steht/.test(t)) {
    reply = `Guten Tag, ${a}. Ich laufe im Demo-Modus – ohne API-Schlüssel kenne ich nur meine eigenen Sätze. Hinterlegen Sie die Schlüssel in config/.env, dann gibt es ein echtes Briefing.`;
  } else if (/wer bist du|was kannst du/.test(t)) {
    reply = `Jarvis, ${a}. Ich höre zu, merke mir alles Wichtige und denke mit. Steuerung von Rechner und Handy folgt – ich arbeite daran, mir Hände wachsen zu lassen.`;
  } else {
    const lines = [
      `Sehr wohl, ${a}. Im Demo-Modus kann ich allerdings nur so tun, als hätte ich verstanden.`,
      `Notiert, ${a}. Zumindest würde ich das sagen, wenn ich schon einen API-Schlüssel hätte.`,
      `Ein ausgezeichneter Gedanke, ${a}. Den beantworte ich, sobald mein Gehirn angeschlossen ist.`,
    ];
    reply = lines[Math.floor(Math.random() * lines.length)];
  }
  for (const word of reply.split(/(?<= )/)) {
    out(word);
    await sleep(45);
  }
}

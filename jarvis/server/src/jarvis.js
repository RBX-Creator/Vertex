// Jarvis' Kopf: baut den System-Prompt aus core/ + Gedächtnis, ruft Claude auf und
// führt das Memory-Tool aus, bis die Antwort fertig ist.
import Anthropic from "@anthropic-ai/sdk";
import fs from "node:fs/promises";
import path from "node:path";
import { CORE_DIR, userDir } from "./paths.js";
import { brainSnapshot, countOpenPlaceholders, runMemoryCommand, MemoryError } from "./brain.js";
import { teamNames } from "./users.js";

const MODEL = process.env.JARVIS_MODEL || "claude-opus-5-5";
const EFFORT = process.env.JARVIS_EFFORT || "low"; // Chat/Sprache: schnell. Für mehr Tiefe: medium/high.
const TZ = process.env.JARVIS_TZ || "Europe/Berlin";
const HISTORY_LIMIT = 40; // gespeicherte Nachrichten (User + Jarvis) pro Nutzer
const MAX_TOOL_ROUNDS = 15;

export const DEMO =
  process.env.JARVIS_DEMO === "1" ||
  (process.env.JARVIS_DEMO !== "0" && !process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN);

const client = DEMO ? null : new Anthropic();

const MEMORY_TOOL = { type: "memory_20250818", name: "memory" };

// ---------- Prompt ----------

async function loadCore() {
  const files = ["personality.md", "rules.md"];
  const skillsDir = path.join(CORE_DIR, "faehigkeiten");
  for (const f of (await fs.readdir(skillsDir)).sort()) files.push(path.join("faehigkeiten", f));
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

async function buildSystem(user, { voice }) {
  const core = await loadCore();
  const open = await countOpenPlaceholders(user.id);
  const situation = [
    "# Aktuelle Situation",
    `- Jetzt: ${nowText()} (${TZ}), Datum ${today()}`,
    `- Angemeldet: ${user.name}`,
    `- Gewünschte Anrede: „${user.settings.anrede}“`,
    `- Eingabe kam per: ${voice ? "SPRACHE → Sprachmodus-Regeln anwenden" : "Text"}`,
    `- Team: ${teamNames().join(", ")}`,
    open > 0
      ? `- Gedächtnis noch lückenhaft (${open} offene Stellen). Nebenbei lernen, nicht verhören.`
      : "- Gedächtnis ist gut gefüllt.",
    "",
    "# Kurzüberblick aus dem Gedächtnis",
    await brainSnapshot(user.id),
  ].join("\n");
  return [
    // Stabiler Teil zuerst und gecacht; der wechselnde Teil danach.
    { type: "text", text: core, cache_control: { type: "ephemeral" } },
    { type: "text", text: situation },
  ];
}

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
 *   {type:"error", message}
 * `hidden` = die Eingabe kommt vom System (z. B. App geöffnet) und wird nicht als Chat angezeigt.
 */
export async function runTurn(user, text, { voice = false, hidden = false, emit }) {
  const history = await loadHistory(user.id);
  const userEntry = { role: "user", content: text, ...(hidden ? { hidden: true } : {}) };
  let answer = "";
  const out = (t) => {
    if (!t) return;
    answer += t;
    emit({ type: "text", text: t });
  };

  try {
    if (DEMO) {
      await demoTurn(user, text, out, emit);
    } else {
      await claudeTurn(user, history, text, voice, out, emit);
    }
  } catch (err) {
    console.error("[jarvis]", err);
    emit({ type: "error", message: errorText(err) });
  }

  if (answer.trim()) {
    history.push(userEntry, { role: "assistant", content: answer.trim() });
    await saveHistory(user.id, history);
  }
  return answer;
}

function errorText(err) {
  if (err instanceof Anthropic.AuthenticationError) return "API-Schlüssel ungültig. Bitte config/.env prüfen.";
  if (err instanceof Anthropic.RateLimitError) return "Zu viele Anfragen gerade. Gleich nochmal.";
  if (err instanceof Anthropic.APIConnectionError) return "Keine Verbindung zu Claude.";
  if (err instanceof Anthropic.APIError) return `Claude-Fehler ${err.status ?? ""}`.trim();
  return "Interner Fehler.";
}

async function claudeTurn(user, history, text, voice, out, emit) {
  const system = await buildSystem(user, { voice });
  // Verlauf nur als Text (ohne Denk-/Tool-Blöcke) – innerhalb eines Zugs wird nur angehängt.
  const messages = [
    ...history.map(({ role, content }) => ({ role, content })),
    { role: "user", content: text },
  ];
  let jsonRetries = 0;
  let lastChunk = "";

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    if (round > 0 && /\S$/.test(lastChunk)) out(" ");
    const stream = client.beta.messages.stream({
      model: MODEL,
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      thinking: { type: "adaptive" },
      output_config: { effort: EFFORT },
      system,
      tools: [MEMORY_TOOL],
      messages,
    });
    stream.on("text", (delta) => {
      lastChunk = delta;
      out(delta);
    });

    let message;
    try {
      message = await stream.finalMessage();
      jsonRetries = 0;
    } catch (err) {
      if (err instanceof Anthropic.APIError || jsonRetries++ >= 2) throw err;
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
    reply = `Guten Tag, ${a}. Ich laufe im Demo-Modus – ohne API-Schlüssel kenne ich nur meine eigenen Sätze. Hinterlegen Sie den Schlüssel in config/.env, dann gibt es ein echtes Briefing.`;
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

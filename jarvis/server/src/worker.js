// Jarvis' Arbeitsmodus: Claude Sonnet erledigt Aufträge im Hintergrund
// (Websuche, Seiten lesen, Gedächtnis) und meldet sich, wenn er fertig ist.
import Anthropic from "@anthropic-ai/sdk";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { userDir } from "./paths.js";
import { runMemoryCommand, MemoryError } from "./brain.js";
import { availableTools, findTool } from "./tools.js";
import { browserEnabled, browserAktion, BROWSER_TOOL } from "./browser.js";

const MODEL = process.env.CLAUDE_WORKER_MODEL || "claude-sonnet-5-5";
const EFFORT = process.env.CLAUDE_WORKER_EFFORT || "medium";
const MAX_RUNNING_PER_USER = 3;
const MAX_ROUNDS = 30;
const KEEP_JOBS = 50;

export const workerEnabled = () => Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);

let client;
const listeners = new Set();
const fileLocks = new Map();

export const onJobDone = (fn) => listeners.add(fn);

const jobsFile = (userId) => path.join(userDir(userId), "auftraege.json");

async function readJobs(userId) {
  try {
    return JSON.parse(await fs.readFile(jobsFile(userId), "utf8"));
  } catch {
    return [];
  }
}

// Serialisiert Lese-Ändern-Schreiben pro Nutzer, damit parallele Aufträge sich nicht überschreiben.
function updateJobs(userId, fn) {
  const prev = fileLocks.get(userId) || Promise.resolve();
  const next = prev.then(async () => {
    const jobs = await readJobs(userId);
    const result = await fn(jobs);
    await fs.writeFile(jobsFile(userId), JSON.stringify(jobs.slice(-KEEP_JOBS), null, 1), "utf8");
    return result;
  });
  fileLocks.set(userId, next.catch(() => {}));
  return next;
}

export async function listJobs(userId) {
  return readJobs(userId);
}

export async function pendingReports(userId) {
  return (await readJobs(userId)).filter((j) => j.status !== "laeuft" && !j.gemeldet);
}

export async function markReported(userId, jobId) {
  await updateJobs(userId, (jobs) => {
    const j = jobs.find((x) => x.id === jobId);
    if (j) j.gemeldet = true;
  });
}

// Nach einem Neustart laufen keine Aufträge mehr – als abgebrochen markieren.
export async function recoverJobs(userIds) {
  for (const id of userIds) {
    await updateJobs(id, (jobs) => {
      for (const j of jobs) {
        if (j.status === "laeuft") {
          j.status = "fehler";
          j.ergebnis = "Abgebrochen, weil der Server neu gestartet wurde.";
        }
      }
    });
  }
}

/**
 * Startet einen Auftrag. `context` liefert den System-Prompt (Persönlichkeit, Regeln, Arbeitsmodus).
 * Gibt sofort zurück; das Ergebnis kommt über onJobDone.
 */
export async function startJob(user, { titel, auftrag, freigabe }, buildSystem) {
  if (!workerEnabled()) throw new Error("Arbeitsmodus nicht verfügbar: ANTHROPIC_API_KEY fehlt.");
  const running = (await readJobs(user.id)).filter((j) => j.status === "laeuft").length;
  if (running >= MAX_RUNNING_PER_USER) {
    throw new Error(`Es laufen schon ${running} Aufträge. Erst einen abwarten.`);
  }
  const job = {
    id: crypto.randomUUID().slice(0, 8),
    titel: String(titel || "Auftrag").slice(0, 80),
    auftrag: String(auftrag || "").slice(0, 8000),
    ...(freigabe ? { freigabe: String(freigabe).slice(0, 500) } : {}),
    status: "laeuft",
    erstellt: new Date().toISOString(),
  };
  await updateJobs(user.id, (jobs) => jobs.push(job));
  runJob(user, job, buildSystem); // bewusst nicht abwarten
  return job;
}

async function runJob(user, job, buildSystem) {
  let ergebnis;
  let status = "fertig";
  try {
    ergebnis = await claudeWork(user, job, await buildSystem());
  } catch (err) {
    console.error("[auftrag]", job.id, err);
    status = "fehler";
    ergebnis = err instanceof Anthropic.APIError ? `Claude-Fehler ${err.status ?? ""}`.trim() : err.message;
  }
  const done = await updateJobs(user.id, (jobs) => {
    const j = jobs.find((x) => x.id === job.id);
    if (!j) return null;
    Object.assign(j, { status, ergebnis, fertig: new Date().toISOString(), ...(job.bild ? { bild: true } : {}) });
    return { ...j };
  });
  if (done) for (const fn of listeners) fn(user.id, done);
}

async function claudeWork(user, job, system) {
  client ??= new Anthropic();
  const shared = await availableTools(user);
  const tools = [
    { type: "memory_20250818", name: "memory" },
    { type: "web_search_20260209", name: "web_search", max_uses: 10 },
    { type: "web_fetch_20260209", name: "web_fetch", max_uses: 10 },
    ...(browserEnabled() ? [{ ...BROWSER_TOOL, eager_input_streaming: true }] : []),
    ...shared.map((t) => ({ name: t.name, description: t.description, input_schema: t.schema, eager_input_streaming: true })),
  ];
  let jsonRetries = 0;
  const freigabe = job.freigabe
    ? `\n\n🔴 FREIGABE des Nutzers (nur genau das ist erlaubt): ${job.freigabe}`
    : "\n\nKeine Freigabe für 🔴-Aktionen – kaufen, senden, posten, löschen sind gesperrt.";
  const messages = [
    { role: "user", content: `Auftrag von ${user.name}: ${job.titel}\n\n${job.auftrag}${freigabe}` },
  ];
  let lastText = "";

  for (let round = 0; round < MAX_ROUNDS; round++) {
    let message;
    try {
      message = await client.beta.messages
        .stream({
          model: MODEL,
          max_tokens: 32000,
          betas: ["server-side-fallback-2026-07-01"],
          fallbacks: "default",
          thinking: { type: "adaptive" },
          output_config: { effort: EFFORT },
          system,
          tools,
          messages,
        })
        .finalMessage();
      jsonRetries = 0;
    } catch (err) {
      // Werkzeug-Eingabe war kein gültiges JSON (eager streaming) – Zug neu anfragen; API-Fehler weiterreichen.
      if (err instanceof Anthropic.APIError || jsonRetries++ >= 2) throw err;
      continue;
    }

    const text = message.content
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim();
    if (text) lastText = text;

    if (message.stop_reason === "refusal") throw new Error("Der Auftrag wurde abgelehnt.");
    if (message.stop_reason === "pause_turn") {
      messages.push({ role: "assistant", content: message.content });
      continue;
    }
    const toolUses = message.content.filter((b) => b.type === "tool_use");
    if (toolUses.length === 0) return lastText || "(Kein Ergebnis.)";
    if (message.stop_reason === "max_tokens") throw new Error("Ergebnis wurde abgeschnitten.");

    messages.push({ role: "assistant", content: message.content });
    const results = [];
    for (const tool of toolUses) {
      try {
        results.push({ type: "tool_result", tool_use_id: tool.id, content: await runTool(user, job, tool) });
      } catch (err) {
        if (!(err instanceof MemoryError) && err.name !== "VerbindungsFehler") console.error("[auftrag-werkzeug]", tool.name, err.message);
        results.push({ type: "tool_result", tool_use_id: tool.id, is_error: true, content: err.message });
      }
    }
    messages.push({ role: "user", content: results });
  }
  throw new Error("Zu viele Arbeitsschritte – abgebrochen.");
}

async function runTool(user, job, tool) {
  const input = tool.input && typeof tool.input === "object" ? tool.input : {};
  if (tool.name === "memory") return runMemoryCommand(user.id, input);
  if (tool.name === "browser" && browserEnabled()) {
    const r = await browserAktion(user.id, input, job);
    if (typeof r === "string") return r;
    return [
      { type: "text", text: r.text },
      { type: "image", source: { type: "base64", media_type: "image/jpeg", data: r.bild } },
    ];
  }
  const shared = findTool(tool.name);
  if (shared && (await shared.available(user))) return JSON.stringify(await shared.run(user, input));
  throw new MemoryError(`Unbekanntes Werkzeug: ${tool.name}`);
}

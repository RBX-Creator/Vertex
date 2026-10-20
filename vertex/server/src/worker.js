// Vertex' Arbeitsmodus: Claude Sonnet erledigt Aufträge im Hintergrund
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
const EFFORT = process.env.CLAUDE_WORKER_EFFORT || "high";
// Selbstkontrolle: Ein Prüfer gleicht jedes Ergebnis mit Auftrag und Werkzeug-Protokoll ab.
const REVIEW = process.env.CLAUDE_WORKER_REVIEW !== "0";
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
    Object.assign(j, {
      status,
      ergebnis,
      fertig: new Date().toISOString(),
      ...(job.bild ? { bild: true } : {}),
      ...(job.pruefung ? { pruefung: job.pruefung } : {}),
    });
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
  const toolLog = []; // was die Werkzeuge wirklich geliefert haben – Grundlage für die Selbstkontrolle
  let reviewed = false;

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
    logServerTools(message.content, toolLog);

    if (message.stop_reason === "refusal") throw new Error("Der Auftrag wurde abgelehnt.");
    if (message.stop_reason === "pause_turn") {
      messages.push({ role: "assistant", content: message.content });
      continue;
    }
    const toolUses = message.content.filter((b) => b.type === "tool_use");
    if (toolUses.length === 0) {
      if (!lastText) return "(Kein Ergebnis.)";
      if (!REVIEW || reviewed) return lastText;
      // Selbstkontrolle: einmal prüfen, bei Mängeln einmal korrigieren lassen.
      reviewed = true;
      const check = await reviewResult(job, lastText, toolLog);
      if (check.ok) {
        job.pruefung = check.skipped ? "nicht geprüft" : "ok";
        return lastText;
      }
      job.pruefung = "korrigiert";
      messages.push({ role: "assistant", content: message.content });
      messages.push({
        role: "user",
        content:
          `SELBSTKONTROLLE – der Prüfer hat Mängel gefunden:\n${check.maengel}\n\n` +
          "Prüfe diese Punkte (nutze Werkzeuge, wo nötig), korrigiere sie und gib das VOLLSTÄNDIGE korrigierte " +
          "Ergebnis aus – im selben Format wie vorher. Was sich nicht belegen lässt, kennzeichne als unsicher.",
      });
      continue;
    }
    if (message.stop_reason === "max_tokens") throw new Error("Ergebnis wurde abgeschnitten.");

    messages.push({ role: "assistant", content: message.content });
    const results = [];
    for (const tool of toolUses) {
      try {
        const content = await runTool(user, job, tool);
        results.push({ type: "tool_result", tool_use_id: tool.id, content });
        logEntry(toolLog, `${tool.name}(${short(tool.input, 160)}) → ${typeof content === "string" ? short(content, 500) : "[Text + Bildschirmfoto] " + short(content[0]?.text, 300)}`);
      } catch (err) {
        if (!(err instanceof MemoryError) && !["VerbindungsFehler", "BusinessFehler"].includes(err.name)) {
          console.error("[auftrag-werkzeug]", tool.name, err.message);
        }
        results.push({ type: "tool_result", tool_use_id: tool.id, is_error: true, content: err.message });
        logEntry(toolLog, `${tool.name}(${short(tool.input, 160)}) → FEHLER: ${short(err.message, 300)}`);
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

// ---------- Selbstkontrolle ----------

const short = (v, n) => {
  const t = typeof v === "string" ? v : JSON.stringify(v ?? "");
  return t.length > n ? `${t.slice(0, n)}…` : t;
};

function logEntry(log, line) {
  log.push(line);
  while (log.join("\n").length > 14000) log.shift();
}

// Serverseitige Werkzeuge (Websuche, Seitenabruf) stehen direkt in der Antwort.
function logServerTools(content, log) {
  for (const b of content) {
    if (b.type === "server_tool_use") logEntry(log, `${b.name}(${short(b.input, 200)})`);
    else if (b.type === "web_search_tool_result") {
      const c = b.content;
      logEntry(log, Array.isArray(c)
        ? `  → Treffer: ${c.slice(0, 6).map((r) => `${short(r.title, 60)} <${r.url}>`).join(" | ")}`
        : `  → Suche fehlgeschlagen (${c?.error_code || "?"})`);
    } else if (b.type === "web_fetch_tool_result") {
      const c = b.content;
      logEntry(log, c?.type === "web_fetch_result" ? `  → Seite gelesen: <${c.url}>` : `  → Abruf fehlgeschlagen (${c?.error_code || "?"})`);
    }
  }
}

/**
 * Ein zweiter Blick: Prüft das Ergebnis gegen Auftrag und Werkzeug-Protokoll.
 * Gibt {ok:true} oder {ok:false, maengel} zurück. Fehler beim Prüfen blockieren den Auftrag nicht.
 */
async function reviewResult(job, result, toolLog) {
  const prompt = `Du bist der PRÜFER von Vertex. Ein Arbeitsmodus hat einen Auftrag erledigt. Prüfe streng, ob das Ergebnis belegt ist – nicht, ob es schön klingt.

AUFTRAG: ${job.titel}
${job.auftrag}
${job.freigabe ? `FREIGABE des Nutzers: ${job.freigabe}` : "Keine Freigabe für kaufen/senden/posten/löschen."}

WERKZEUG-PROTOKOLL (was Websuche, Seitenabruf, Browser, Gedächtnis usw. wirklich geliefert haben):
${toolLog.length ? toolLog.join("\n") : "(keine Werkzeuge benutzt)"}

ERGEBNIS:
${result.slice(0, 12000)}

Prüfe:
1. Beantwortet das Ergebnis jede Teilfrage des Auftrags?
2. Ist jede konkrete Zahl, jeder Preis, jedes Datum durch das Protokoll belegt – oder ausdrücklich als Schätzung/unsicher gekennzeichnet?
3. Meldet das Ergebnis etwas als erledigt (in den Warenkorb gelegt, gespeichert, Entwurf angelegt, bestellt), das im Protokoll nicht belegt ist oder dort fehlgeschlagen ist?
4. Stimmen Rechnungen, Summen und Einheiten?
5. Widerspricht sich das Ergebnis selbst oder dem Protokoll?

Antworte NUR mit dem Wort OK, wenn alles passt. Sonst beginne mit MÄNGEL: und liste die konkreten Punkte (je eine Zeile). Keine Stilkritik.`;
  try {
    const msg = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 4000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      thinking: { type: "adaptive" },
      output_config: { effort: "medium" },
      messages: [{ role: "user", content: prompt }],
    });
    const text = msg.content.filter((b) => b.type === "text").map((b) => b.text).join("").trim();
    if (msg.stop_reason === "refusal" || !text) return { ok: true, skipped: true };
    if (/^\W*OK\b/i.test(text) && !/MÄNGEL/i.test(text)) return { ok: true };
    return { ok: false, maengel: text.replace(/^\W*MÄNGEL:\s*/i, "").slice(0, 3000) };
  } catch (err) {
    console.error("[selbstkontrolle]", err.message);
    return { ok: true, skipped: true };
  }
}

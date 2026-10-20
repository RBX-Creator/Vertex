// Gesprächsmodus mit Gemini Flash: antwortet schnell, nutzt das Gedächtnis und
// gibt längere Aufgaben per Werkzeug an den Claude-Arbeitsmodus ab.
import { GoogleGenAI, ApiError } from "@google/genai";
import { runMemoryCommand, MemoryError } from "./brain.js";
import { availableTools, findTool } from "./tools.js";

const MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";
const MAX_ROUNDS = 8;

export const geminiEnabled = () => Boolean(process.env.GEMINI_API_KEY);

let ai;
const getClient = () =>
  (ai ??= new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY,
    ...(process.env.GEMINI_BASE_URL ? { httpOptions: { baseUrl: process.env.GEMINI_BASE_URL } } : {}),
  }));

// Kurz nachdenken statt raten: kleines Denkbudget (2.5) bzw. niedrige Denkstufe (neuere Modelle).
// GEMINI_THINKING_BUDGET=0 macht 2.5 wieder maximal schnell, aber ratefreudiger.
function thinkingConfig() {
  if (MODEL.includes("2.5")) return { thinkingBudget: Number(process.env.GEMINI_THINKING_BUDGET || 1024) };
  return { thinkingLevel: process.env.GEMINI_THINKING_LEVEL || "LOW" };
}

const FUNCTIONS = [
  {
    name: "gedaechtnis",
    description:
      "Liest oder schreibt im Gedächtnis. Pfade beginnen mit /memories/ich/ (persönlich) oder /memories/team/ (Team). " +
      "view: Datei oder Ordner ansehen. create: Datei anlegen/überschreiben (file_text). " +
      "str_replace: Text ersetzen (old_str muss genau einmal vorkommen, new_str). insert: Zeilen einfügen (insert_line, insert_text).",
    parametersJsonSchema: {
      type: "object",
      properties: {
        command: { type: "string", enum: ["view", "create", "str_replace", "insert"] },
        path: { type: "string", description: "z. B. /memories/ich/aufgaben.md" },
        file_text: { type: "string" },
        old_str: { type: "string" },
        new_str: { type: "string" },
        insert_line: { type: "integer", description: "Zeilennummer, nach der eingefügt wird (0 = Anfang)" },
        insert_text: { type: "string" },
      },
      required: ["command", "path"],
    },
  },
  {
    name: "auftrag_an_claude",
    description:
      "Gibt eine Aufgabe, die länger dauert (Recherche im Internet, Preise prüfen, Texte schreiben, Analysen, Pläne, " +
      "Webseiten bedienen, etwas in einen Warenkorb legen, Postfach durcharbeiten), " +
      "an den Arbeitsmodus ab. Läuft im Hintergrund; das Ergebnis kommt später automatisch. " +
      "Der Auftrag muss ohne das Gespräch verständlich sein.",
    parametersJsonSchema: {
      type: "object",
      properties: {
        titel: { type: "string", description: "Kurzer Titel, 2–6 Wörter" },
        auftrag: { type: "string", description: "Vollständige Aufgabe mit Ziel, Kontext und gewünschtem Format" },
        freigabe: {
          type: "string",
          description:
            "NUR wenn der Nutzer eine 🔴-Aktion ausdrücklich bestätigt hat (z. B. „Ja, bestell es“): genau, was erlaubt ist " +
            "(was, wo, Höchstbetrag). Sonst weglassen.",
        },
      },
      required: ["titel", "auftrag"],
    },
  },
  {
    name: "auftraege",
    description: "Listet die letzten Aufträge mit Status (laeuft, fertig, fehler).",
    parametersJsonSchema: { type: "object", properties: {} },
  },
];

/**
 * Ein Gesprächszug mit Gemini.
 * tools.startJob({titel, auftrag}) und tools.listJobs() kommen vom Aufrufer.
 */
export async function geminiTurn({ user, history, text, image, systemText, out, emit, tools, signal }) {
  const userParts = [{ text }];
  if (image) userParts.unshift({ inlineData: { mimeType: image.mime, data: image.data } });
  const contents = [
    ...history.map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] })),
    { role: "user", parts: userParts },
  ];
  const shared = await availableTools(user);
  const declarations = [
    ...FUNCTIONS,
    ...shared.map((t) => ({ name: t.name, description: t.description, parametersJsonSchema: t.schema })),
  ];
  let produced = false;
  let lastChunk = "";

  for (let round = 0; round < MAX_ROUNDS; round++) {
    const stream = await getClient().models.generateContentStream({
      model: MODEL,
      contents,
      config: {
        systemInstruction: systemText,
        tools: [{ functionDeclarations: declarations }],
        thinkingConfig: thinkingConfig(),
        abortSignal: signal,
      },
    });

    // Teile unverändert aufheben (inkl. thoughtSignature) – nötig für die Funktionsaufruf-Runde.
    const parts = [];
    const calls = [];
    let finishReason;
    for await (const chunk of stream) {
      const cand = chunk.candidates?.[0];
      if (cand?.finishReason) finishReason = cand.finishReason;
      for (const p of cand?.content?.parts || []) {
        // Leere Textteile lehnt die API im Verlauf ab – außer sie tragen eine Denk-Signatur.
        if (p.text !== "" || p.thoughtSignature || p.functionCall) parts.push(p);
        if (p.functionCall) calls.push(p.functionCall);
        else if (p.text && !p.thought) {
          // Text vor und nach einem Werkzeugaufruf nicht zusammenkleben
          if (round > 0 && produced && /\S$/.test(lastChunk) && /^\S/.test(p.text) && parts.length <= 1) out(" ");
          out(p.text);
          lastChunk = p.text;
          produced = true;
        }
      }
    }

    if (calls.length === 0) {
      if (!produced && finishReason && finishReason !== "STOP") {
        emit({ type: "error", message: `Gemini hat nicht geantwortet (${finishReason}).` });
      }
      return;
    }

    contents.push({ role: "model", parts });
    const responses = [];
    for (const call of calls) {
      const response = await runFunction(user, call, emit, tools);
      responses.push({ functionResponse: { name: call.name, ...(call.id ? { id: call.id } : {}), response } });
    }
    contents.push({ role: "user", parts: responses });
  }
  emit({ type: "error", message: "Zu viele Werkzeug-Schritte – abgebrochen." });
}

async function runFunction(user, call, emit, tools) {
  const args = call.args || {};
  try {
    switch (call.name) {
      case "gedaechtnis": {
        const verb = { view: "liest", create: "schreibt", str_replace: "aktualisiert", insert: "ergänzt" }[args.command];
        if (!verb) throw new MemoryError("Erlaubt sind view, create, str_replace, insert.");
        emit({ type: "memory", verb, path: String(args.path || ""), write: args.command !== "view" });
        return { ergebnis: await runMemoryCommand(user.id, args) };
      }
      case "auftrag_an_claude": {
        const job = await tools.startJob({ titel: args.titel, auftrag: args.auftrag, freigabe: args.freigabe });
        emit({ type: "job", job });
        return { ergebnis: `Auftrag ${job.id} läuft im Hintergrund.` };
      }
      case "auftraege": {
        const jobs = (await tools.listJobs()).slice(-10).map(({ id, titel, status, erstellt }) => ({ id, titel, status, erstellt }));
        return { auftraege: jobs };
      }
      default: {
        const tool = findTool(call.name);
        if (!tool || !(await tool.available(user))) return { fehler: `Unbekannte Funktion ${call.name}` };
        emit({ type: "tool", name: call.name });
        return await tool.run(user, args);
      }
    }
  } catch (err) {
    if (!(err instanceof MemoryError) && !["VerbindungsFehler", "BusinessFehler"].includes(err.name)) console.error("[gemini-tool]", err);
    return { fehler: err.message };
  }
}

export function geminiErrorText(err) {
  if (err instanceof ApiError) {
    if (err.status === 401 || err.status === 403) return "Gemini-Schlüssel ungültig. Bitte config/.env prüfen.";
    if (err.status === 429) return "Gemini ist gerade überlastet. Gleich nochmal.";
    if (err.status === 404) return `Gemini-Modell ${MODEL} nicht gefunden. GEMINI_MODEL in config/.env prüfen.`;
    return `Gemini-Fehler ${err.status}`;
  }
  return null;
}

// Gemeinsame Werkzeuge für Gesprächsmodus (Gemini) und Arbeitsmodus (Claude):
// Kalender und Postfach. Jedes Werkzeug ist nur verfügbar, wenn der Nutzer es verbunden hat.
import * as verbindungen from "./verbindungen.js";

export const SHARED_TOOLS = [
  {
    name: "kalender",
    description: "Liest die Termine des Nutzers für die nächsten Tage aus seinem verbundenen Kalender.",
    schema: {
      type: "object",
      properties: { tage: { type: "integer", description: "Wie viele Tage ab heute (1–60), Standard 7" } },
    },
    available: (user) => verbindungen.hasKalender(user.id),
    run: async (user, args) => ({ termine: await verbindungen.termine(user.id, args.tage || 7) }),
  },
  {
    name: "postfach",
    description: "Liest die neuesten E-Mails aus dem Posteingang (Absender, Betreff, Anfang des Textes). Markiert nichts als gelesen.",
    schema: {
      type: "object",
      properties: {
        anzahl: { type: "integer", description: "1–25, Standard 10" },
        nur_ungelesen: { type: "boolean", description: "Standard true" },
      },
    },
    available: (user) => verbindungen.hasMail(user.id),
    run: (user, args) => verbindungen.postfach(user.id, { anzahl: args.anzahl, nurUngelesen: args.nur_ungelesen !== false }),
  },
  {
    name: "mail_entwurf",
    description:
      "Legt eine E-Mail als ENTWURF im Postfach des Nutzers ab. Gesendet wird nichts – der Nutzer prüft und sendet selbst.",
    schema: {
      type: "object",
      properties: {
        an: { type: "string", description: "E-Mail-Adresse" },
        betreff: { type: "string" },
        text: { type: "string", description: "Vollständiger Text der Mail" },
      },
      required: ["an", "betreff", "text"],
    },
    available: (user) => verbindungen.hasMail(user.id),
    run: async (user, args) => ({ ergebnis: await verbindungen.entwurf(user.id, args) }),
  },
];

export async function availableTools(user) {
  const out = [];
  for (const t of SHARED_TOOLS) if (await t.available(user)) out.push(t);
  return out;
}

export const findTool = (name) => SHARED_TOOLS.find((t) => t.name === name);

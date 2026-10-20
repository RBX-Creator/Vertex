// Gemeinsame Werkzeuge für Gesprächsmodus (Gemini) und Arbeitsmodus (Claude):
// Kalender und Postfach – nur verfügbar, wenn der Nutzer sie verbunden hat – sowie die
// Business-Werkzeuge aus Vertex Pocket (Rechner, Lager, Aufgaben, Kunden, Ernährung), immer verfügbar.
import * as verbindungen from "./verbindungen.js";
import * as business from "./business.js";

const immer = () => true;

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

  // ---------- Business (Logik und Speicher in business.js, Geld exakt in Cent) ----------
  {
    name: "rechnen",
    description:
      "Rechnet einen Ausdruck EXAKT aus (+ - * / ^, Klammern, %). Tausender OHNE Trennzeichen (1200, nicht 1.200), " +
      "Dezimalstellen mit Komma oder Punkt. Für jede Rechnung benutzen statt im Kopf zu rechnen. Gibt das Ergebnis zurück.",
    schema: {
      type: "object",
      properties: { ausdruck: { type: "string", description: "z. B. „(140 - 80) / 80 * 100“" } },
      required: ["ausdruck"],
    },
    available: immer,
    run: (user, args) => business.rechnen(args),
  },
  {
    name: "gewinn_berechnen",
    description:
      "Reselling-Rechner: Gewinn, Marge, ROI und Mindestpreis ohne Verlust aus Einkauf, Verkauf, Plattformgebühr (% und fix) " +
      "und Versand. Gebühren aus dem Gedächtnis (/memories/team/business/gebuehren.md) nehmen, nie raten.",
    schema: {
      type: "object",
      properties: {
        einkauf: { type: "number" },
        verkauf: { type: "number" },
        gebuehr_prozent: { type: "number" },
        gebuehr_fix: { type: "number" },
        versand: { type: "number" },
      },
      required: ["einkauf", "verkauf"],
    },
    available: immer,
    run: (user, args) => business.gewinnBerechnen(args),
  },
  {
    name: "lager_hinzufuegen",
    description:
      "Neuen Artikel ins Reselling-Lager eintragen (z. B. „Panda Dunks Größe 43 für 80 gekauft“). Gibt den gespeicherten Artikel mit id zurück.",
    schema: {
      type: "object",
      properties: {
        name: { type: "string" },
        groesse: { type: "string" },
        zustand: { type: "string" },
        einkauf: { type: "number", description: "Einkaufspreis in Euro" },
        einkauf_datum: { type: "string", description: "JJJJ-MM-TT, Standard heute" },
        plattform: { type: "string" },
        notiz: { type: "string" },
      },
      required: ["name", "einkauf"],
    },
    available: immer,
    run: (user, args) => business.lagerHinzufuegen(args),
  },
  {
    name: "lager_aktualisieren",
    description:
      "Lager-Artikel ändern, z. B. als verkauft markieren („für 140 auf Vinted verkauft“). Artikel per id oder suche finden. " +
      "Bei mehreren Treffern kommt eine Liste zurück – dann nachfragen. Einen schon verkauften Artikel nachträglich korrigieren " +
      "(Preis, Gebühren, Datum): mit id und korrektur: true. Leere Felder ändern nichts.",
    schema: {
      type: "object",
      properties: {
        id: { type: "string" },
        suche: { type: "string" },
        status: { type: "string", enum: business.LAGER_STATUS },
        verkauf: { type: "number" },
        gebuehren: { type: "number", description: "Plattformgebühren in Euro" },
        versand: { type: "number" },
        plattform: { type: "string" },
        verkauf_datum: { type: "string" },
        korrektur: { type: "boolean", description: "true = bestehenden Verkauf korrigieren" },
        name: { type: "string" },
        groesse: { type: "string" },
        zustand: { type: "string" },
        einkauf: { type: "number" },
        notiz: { type: "string" },
      },
    },
    available: immer,
    run: (user, args) => business.lagerAktualisieren(args),
  },
  {
    name: "lager_liste",
    description:
      "Listet Lager-Artikel (optional nach status oder Suchtext). Gibt höchstens 40 Artikel mit id, Preis, Status und ggf. Gewinn zurück.",
    schema: {
      type: "object",
      properties: { status: { type: "string", enum: business.LAGER_STATUS }, suche: { type: "string" } },
    },
    available: immer,
    run: (user, args) => business.lagerListe(args),
  },
  {
    name: "lager_auswertung",
    description:
      "Exakte Auswertung des Resellings für einen Monat (JJJJ-MM, Standard aktueller Monat): Umsatz, Gewinn, Marge, ROI, " +
      "Anzahl verkauft, Bestand und Lagerwert, Standzeit, Top-Artikel.",
    schema: { type: "object", properties: { monat: { type: "string", description: "JJJJ-MM" } } },
    available: immer,
    run: (user, args) => business.lagerAuswertungLesen(args),
  },
  {
    name: "aufgabe_hinzufuegen",
    description:
      "Persönliche Aufgabe anlegen (optional mit Fälligkeit JJJJ-MM-TT und Priorität). Relative Angaben wie „Freitag“ vorher in ein Datum umrechnen.",
    schema: {
      type: "object",
      properties: {
        text: { type: "string" },
        faellig: { type: "string", description: "JJJJ-MM-TT" },
        prioritaet: { type: "string", enum: ["hoch", "normal", "niedrig"] },
      },
      required: ["text"],
    },
    available: immer,
    run: (user, args) => business.aufgabeHinzufuegen(user.id, args),
  },
  {
    name: "aufgabe_erledigen",
    description: "Aufgabe als erledigt abhaken (per id oder suche).",
    schema: { type: "object", properties: { id: { type: "string" }, suche: { type: "string" } } },
    available: immer,
    run: (user, args) => business.aufgabeErledigen(user.id, args),
  },
  {
    name: "aufgaben_liste",
    description: "Offene Aufgaben (sortiert nach Fälligkeit), optional inklusive erledigter.",
    schema: { type: "object", properties: { alle: { type: "boolean" } } },
    available: immer,
    run: (user, args) => business.aufgabenListe(user.id, args),
  },
  {
    name: "kunde_speichern",
    description:
      "Webdesign-Kunden/Projekt anlegen oder ändern (Anfrage → Angebot → Auftrag → fertig → bezahlt, oder verloren). " +
      "Mit id oder exaktem Namen wird aktualisiert.",
    schema: {
      type: "object",
      properties: {
        id: { type: "string" },
        name: { type: "string" },
        projekt: { type: "string" },
        status: { type: "string", enum: business.KUNDEN_STATUS },
        betrag: { type: "number", description: "Euro" },
        faellig: { type: "string", description: "JJJJ-MM-TT" },
        notiz: { type: "string" },
      },
      required: ["name"],
    },
    available: immer,
    run: (user, args) => business.kundeSpeichern(args),
  },
  {
    name: "kunden_liste",
    description: "Kunden/Projekte mit Status, Betrag und Fälligkeit, plus Summe offener Angebote und laufender Aufträge.",
    schema: { type: "object", properties: { status: { type: "string", enum: business.KUNDEN_STATUS } } },
    available: immer,
    run: (user, args) => business.kundenListe(args),
  },
  {
    name: "ernaehrung_eintragen",
    description:
      "Eine Mahlzeit ins heutige Ernährungs-Tracking eintragen (geschätzte Werte). Gibt die exakte Tagessumme und den Rest bis zum Ziel zurück.",
    schema: {
      type: "object",
      properties: {
        mahlzeit: { type: "string" },
        kcal: { type: "number" },
        eiweiss: { type: "number" },
        kh: { type: "number" },
        fett: { type: "number" },
        zeit: { type: "string", description: "HH:MM, Standard jetzt" },
      },
      required: ["mahlzeit", "kcal"],
    },
    available: immer,
    run: (user, args) => business.ernaehrungEintragen(user.id, args),
  },
  {
    name: "ernaehrung_korrigieren",
    description:
      "Eine heute eingetragene Mahlzeit ändern oder löschen („die Pizza waren nur 900 kcal“, „lösch den Döner“). Gibt die neue Tagessumme zurück.",
    schema: {
      type: "object",
      properties: {
        suche: { type: "string", description: "Name oder Teil davon" },
        loeschen: { type: "boolean" },
        mahlzeit: { type: "string" },
        kcal: { type: "number" },
        eiweiss: { type: "number" },
        kh: { type: "number" },
        fett: { type: "number" },
      },
      required: ["suche"],
    },
    available: immer,
    run: (user, args) => business.ernaehrungKorrigieren(user.id, args),
  },
  {
    name: "ernaehrung_tag",
    description:
      "Exakte Tagessumme der Ernährung (kcal, Eiweiß, KH, Fett) und Rest bis zum Ziel, für heute oder ein Datum JJJJ-MM-TT.",
    schema: { type: "object", properties: { datum: { type: "string" } } },
    available: immer,
    run: (user, args) => business.ernaehrungTagLesen(user.id, args),
  },
];

export async function availableTools(user) {
  const out = [];
  for (const t of SHARED_TOOLS) if (await t.available(user)) out.push(t);
  return out;
}

export const findTool = (name) => SHARED_TOOLS.find((t) => t.name === name);

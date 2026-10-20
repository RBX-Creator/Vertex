// Business-Werkzeuge aus Vertex Pocket: exakter Rechner, Reselling-Lager, Aufgaben, Webdesign-Kunden
// und Ernährung. Zahlen werden gerechnet, nicht geschätzt – Geld immer in Cent (ganze Zahlen).
// Gespeichert wird als JSON außerhalb des Gedächtnisses (siehe paths.js):
//   data/team-listen/lager.json, kunden.json            (Team, geteilt)
//   data/users/<id>/listen/aufgaben.json                (privat)
//   data/users/<id>/listen/ernaehrung-JJJJ-MM-TT.json   (privat, ein Dokument pro Tag)
// Ernährungsziele stehen im Gedächtnis: /memories/ich/tracking/ernaehrung/ziele.md
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { TEAM_LISTEN_DIR, userDir, userListenDir } from "./paths.js";

const TZ = process.env.VERTEX_TZ || "Europe/Berlin";

// Erwartete Fehler (mehrdeutig, fehlt, ungültig): gehen als Text ans Modell, nicht ins Fehlerprotokoll.
export class BusinessFehler extends Error {
  name = "BusinessFehler";
}

// ---------- Datum (immer in VERTEX_TZ, nicht in der Zeitzone des Servers) ----------

export const today = (date = new Date()) => new Intl.DateTimeFormat("sv-SE", { timeZone: TZ }).format(date); // JJJJ-MM-TT
const thisMonth = () => today().slice(0, 7);
const nowTime = () => new Intl.DateTimeFormat("de-DE", { timeZone: TZ, hour: "2-digit", minute: "2-digit" }).format(new Date());
const isDate = (s) => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
const daysBetween = (a, b) => Math.round((Date.parse(b + "T12:00:00Z") - Date.parse(a + "T12:00:00Z")) / 86400000);
const newId = () => Array.from(crypto.randomBytes(6), (b) => (b % 36).toString(36)).join("");
const gesetzt = (v) => v !== undefined && v !== null && v !== ""; // leer = unverändert

// ---------- Speicher: JSON-Dateien ----------

const LAGER_DATEI = path.join(TEAM_LISTEN_DIR, "lager.json");
const KUNDEN_DATEI = path.join(TEAM_LISTEN_DIR, "kunden.json");
const aufgabenDatei = (userId) => path.join(userListenDir(userId), "aufgaben.json");
const ernaehrungDatei = (userId, datum) => path.join(userListenDir(userId), `ernaehrung-${datum}.json`);
const zieleDatei = (userId) => path.join(userDir(userId), "ich", "tracking", "ernaehrung", "ziele.md");

const warteschlangen = new Map(); // Datei → Ende der Kette ihrer Zugriffe

async function lies(file, leer) {
  try {
    return JSON.parse(await fs.readFile(file, "utf8")) ?? leer;
  } catch (err) {
    if (err.code === "ENOENT") return leer;
    throw err; // eine kaputte Datei nie still durch eine leere ersetzen
  }
}

// Atomar: erst in eine Nachbardatei schreiben, dann umbenennen – ein Absturz hinterlässt nie halbes JSON.
async function schreibe(file, data) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${crypto.randomUUID().slice(0, 8)}.tmp`;
  try {
    await fs.writeFile(tmp, JSON.stringify(data, null, 1), "utf8");
    await fs.rename(tmp, file);
  } catch (err) {
    await fs.rm(tmp, { force: true });
    throw err;
  }
}

// Zugriffe pro Datei nacheinander: parallele Werkzeugaufrufe (eine Modell-Runde, Gespräch + Auftrag,
// zwei Teammitglieder) überschreiben sich nicht gegenseitig.
function einreihen(file, fn) {
  const next = (warteschlangen.get(file) || Promise.resolve()).then(fn);
  const ende = next.catch(() => {});
  warteschlangen.set(file, ende);
  ende.then(() => warteschlangen.get(file) === ende && warteschlangen.delete(file));
  return next;
}

const lesen = (file, leer) => einreihen(file, () => lies(file, leer));

// Lesen – ändern – schreiben. `fn` ändert die Daten direkt; wirft sie, wird nichts gespeichert.
const aendern = (file, leer, fn) =>
  einreihen(file, async () => {
    const data = await lies(file, leer);
    const result = await fn(data);
    await schreibe(file, data);
    return result;
  });

// ---------- Geld und exaktes Rechnen ----------

// Beträge werden in Cent (ganze Zahlen) gespeichert und gerechnet – keine Rundungsfehler.
// Kaufmännisch runden: 9.995 → 1000 Cent (ohne toPrecision wären es durch Binärbrüche 999).
export const cent = (euro) => Math.round(Number((euro * 100).toPrecision(12)));
// Dasselbe für Zwischenergebnisse in Cent (Gebühr, Mindestpreis): erst das Binärbruch-Rauschen weg,
// dann runden – sonst wird aus genau 4050 Cent per Math.ceil 4051.
const glatt = (x) => Number(x.toPrecision(12));

export function toCents(v, feld = "Betrag") {
  if (v === undefined || v === null) return null;
  if (typeof v === "number") {
    if (!Number.isFinite(v)) throw new BusinessFehler(`${feld} ist keine Zahl: ${v}`);
    return cent(v); // JSON-Zahl: 16.125 ist 16,13 € – nie ein deutscher Tausender
  }
  let s = String(v).replace(/[€\s]|eur(o)?/gi, "");
  if (!s) return null;
  // Text: „1.199,50“ und „1.200“ sind deutsche Tausender (Geld hat höchstens 2 Nachkommastellen).
  if (/^-?[1-9]\d{0,2}(\.\d{3})+(,\d+)?$/.test(s)) s = s.replace(/\./g, "");
  s = s.replace(",", ".");
  const n = Number(s);
  if (!Number.isFinite(n)) throw new BusinessFehler(`${feld} ist keine Zahl: ${v}`);
  return cent(n);
}

export const eur = (ct) =>
  ct == null ? null : (ct / 100).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
const pct = (x) => (Number.isFinite(x) ? (Math.round(x * 10) / 10).toLocaleString("de-DE") + " %" : null);

const num = (v, feld) => {
  const n = Number(String(v ?? "").replace(",", "."));
  if (!Number.isFinite(n)) throw new BusinessFehler(`${feld} ist keine Zahl: ${v}`);
  return n;
};

// Sicherer Rechner (+ − × ÷, Klammern, Prozent, Potenz, Dezimalkomma) – kein eval.
export function rechne(ausdruck) {
  const src = String(ausdruck || "")
    .replace(/×|x(?=\s*\d)/g, "*")
    .replace(/÷|:/g, "/")
    .replace(/−/g, "-")
    .replace(/€/g, "");
  const tokens = [];
  const re = /\s*(\d+(?:[.,]\d+)*|[-+*/()%^])/y;
  let pos = 0;
  while (pos < src.length) {
    re.lastIndex = pos;
    const m = re.exec(src);
    if (!m) {
      if (/\s/.test(src[pos])) {
        pos++;
        continue;
      }
      throw new BusinessFehler(`Unerwartetes Zeichen: „${src[pos]}“`);
    }
    tokens.push(m[1]);
    pos = re.lastIndex;
  }
  let i = 0;
  const peek = () => tokens[i];
  const take = () => tokens[i++];
  // Punkt = Tausender oder Dezimal? Pro Ausdruck entscheiden: Komma irgendwo → deutsch (Punkt = Tausender);
  // Dezimalpunkt mit ≠ 3 Stellen irgendwo → englisch. „1.200“ allein ist mehrdeutig → nachfragen statt raten.
  const zahlen = tokens.filter((t) => /\d/.test(t));
  const deutsch = zahlen.some((t) => t.includes(",") || /^\d{1,3}(\.\d{3}){2,}$/.test(t));
  const englisch = !deutsch && zahlen.some((t) => /^\d+\.\d+$/.test(t) && !/^\d+\.\d{3}$/.test(t));
  const zahl = (t) => {
    let s = t;
    if (/^\d{1,3}(\.\d{3}){2,}$/.test(s) || (/^[1-9]\d{0,2}(\.\d{3})+(,\d+)?$/.test(s) && (deutsch || s.includes(",")))) {
      s = s.replace(/\./g, "");
    } else if (/^[1-9]\d{0,2}\.\d{3}$/.test(s) && !englisch) {
      throw new BusinessFehler(
        `„${t}“ ist mehrdeutig (${t.replace(".", "")} oder ${t.replace(".", ",")}?). Tausender ohne Punkt schreiben, Dezimalstellen mit Komma.`,
      );
    }
    return Number(s.replace(",", "."));
  };
  function primary() {
    const t = take();
    if (t === undefined) throw new BusinessFehler("Ausdruck endet zu früh");
    if (t === "(") {
      const v = expr();
      if (take() !== ")") throw new BusinessFehler("Klammer fehlt");
      return post(v);
    }
    if (t === "-") return -primary();
    if (t === "+") return primary();
    const n = zahl(t);
    if (!Number.isFinite(n)) throw new BusinessFehler(`Keine Zahl: ${t}`);
    return post(n);
  }
  function post(v) {
    while (peek() === "%") {
      take();
      v /= 100;
    }
    return v;
  }
  function power() {
    let v = primary();
    while (peek() === "^") {
      take();
      v = Math.pow(v, primary());
    }
    return v;
  }
  function term() {
    let v = power();
    while (peek() === "*" || peek() === "/") {
      const op = take();
      const r = power();
      if (op === "/" && r === 0) throw new BusinessFehler("Division durch null");
      v = op === "*" ? v * r : v / r;
    }
    return v;
  }
  function expr() {
    let v = term();
    while (peek() === "+" || peek() === "-") {
      const op = take();
      const r = term();
      v = op === "+" ? v + r : v - r;
    }
    return v;
  }
  if (!tokens.length) throw new BusinessFehler("Leerer Ausdruck");
  const v = expr();
  if (i < tokens.length) throw new BusinessFehler(`Unerwartet: „${tokens[i]}“`);
  if (!Number.isFinite(v)) throw new BusinessFehler("Ergebnis ist zu groß");
  return Math.round(v * 1e10) / 1e10;
}

export function gewinnRechnung({ einkauf, verkauf, gebuehr_prozent, gebuehr_fix, versand }) {
  const ek = toCents(einkauf, "Einkauf") ?? 0;
  const vk = toCents(verkauf, "Verkauf") ?? 0;
  const pz = Number(String(gebuehr_prozent ?? 0).replace(",", ".")) || 0;
  const fix = toCents(gebuehr_fix, "Fixgebühr") ?? 0;
  const vs = toCents(versand, "Versand") ?? 0;
  const gebuehr = Math.round(glatt((vk * pz) / 100)) + fix;
  const gewinn = vk - ek - gebuehr - vs;
  // Mindestpreis: vk − vk·p − fix − versand − einkauf ≥ 0  ⇒  vk ≥ (einkauf + fix + versand) / (1 − p)
  const breakEven = pz < 100 ? Math.ceil(glatt(((ek + fix + vs) * 100) / (100 - pz))) : null;
  return {
    verkauf: eur(vk),
    einkauf: eur(ek),
    gebuehren: eur(gebuehr),
    versand: eur(vs),
    gewinn: eur(gewinn),
    marge: vk ? pct((gewinn / vk) * 100) : null,
    roi: ek ? pct((gewinn / ek) * 100) : null,
    mindestpreis_ohne_verlust: breakEven == null ? null : eur(breakEven),
    hinweis: !gebuehr_prozent && !gebuehr_fix ? "Ohne Plattformgebühr gerechnet – falls eine anfällt, ist der Gewinn kleiner." : undefined,
  };
}

// ---------- Lager, Kunden, Aufgaben ----------

export const LAGER_STATUS = ["lager", "gelistet", "verkauft", "retoure"];
export const KUNDEN_STATUS = ["anfrage", "angebot", "auftrag", "fertig", "bezahlt", "verloren"];
const itemProfit = (x) => (x.verkauf_ct ?? 0) - (x.einkauf_ct ?? 0) - (x.gebuehren_ct ?? 0) - (x.versand_ct ?? 0);
const lagerView = (x) => ({
  id: x.id,
  name: x.name,
  groesse: x.groesse || undefined,
  zustand: x.zustand || undefined,
  status: x.status,
  plattform: x.plattform || undefined,
  einkauf: eur(x.einkauf_ct),
  einkauf_datum: x.einkauf_datum,
  ...(x.status === "verkauft"
    ? {
        verkauf: eur(x.verkauf_ct),
        gebuehren: eur(x.gebuehren_ct ?? 0),
        versand: eur(x.versand_ct ?? 0),
        gewinn: eur(itemProfit(x)),
        verkauf_datum: x.verkauf_datum,
      }
    : {}),
  notiz: x.notiz || undefined,
});

// Genau einen Eintrag finden. Bei mehreren Treffern: Liste mit Status und Daten, damit Vertex gezielt nachfragt.
function findOne(items, { id, suche }, what) {
  if (id) {
    const hit = items.find((x) => x.id === String(id));
    if (hit) return hit;
  }
  const q = String(suche || id || "").toLowerCase().trim();
  if (!q) throw new BusinessFehler(`Welche${what === "Aufgabe" ? "" : "n"} ${what}? id oder suche angeben.`);
  const hits = items.filter((x) => [x.name, x.groesse, x.text, x.projekt].filter(Boolean).join(" ").toLowerCase().includes(q));
  if (hits.length === 1) return hits[0];
  if (!hits.length) throw new BusinessFehler(`Kein Treffer für „${q}“.`);
  const info = (x) =>
    [
      x.status,
      x.einkauf_datum && `gekauft ${x.einkauf_datum}`,
      x.verkauf_datum && x.status === "verkauft" && `verkauft ${x.verkauf_datum}`,
      x.faellig && `fällig ${x.faellig}`,
    ]
      .filter(Boolean)
      .join(", ");
  throw new BusinessFehler(
    `Mehrdeutig – ${hits.length} Treffer: ${hits
      .slice(0, 8)
      .map((x) => `[${x.id}] ${x.name || x.text}${x.groesse ? " " + x.groesse : ""}${info(x) ? ` (${info(x)})` : ""}`)
      .join("; ")}. Nachfragen, welcher gemeint ist.`,
  );
}

export function lagerAuswertung(items, monat) {
  const m = /^\d{4}-\d{2}$/.test(monat || "") ? monat : thisMonth();
  const sold = items.filter((x) => x.status === "verkauft" && (x.verkauf_datum || "").startsWith(m));
  const umsatz = sold.reduce((s, x) => s + (x.verkauf_ct ?? 0), 0);
  const gewinn = sold.reduce((s, x) => s + itemProfit(x), 0);
  const kosten = sold.reduce((s, x) => s + (x.einkauf_ct ?? 0), 0);
  const bestand = items.filter((x) => x.status === "lager" || x.status === "gelistet");
  const standzeiten = sold
    .filter((x) => isDate(x.einkauf_datum) && isDate(x.verkauf_datum))
    .map((x) => daysBetween(x.einkauf_datum, x.verkauf_datum));
  return {
    monat: m,
    verkauft: sold.length,
    umsatz: eur(umsatz),
    gewinn: eur(gewinn),
    gewinn_ct: gewinn,
    marge: umsatz ? pct((gewinn / umsatz) * 100) : null,
    roi: kosten ? pct((gewinn / kosten) * 100) : null,
    im_bestand: bestand.length,
    lagerwert_einkauf: eur(bestand.reduce((s, x) => s + (x.einkauf_ct ?? 0), 0)),
    durchschnittliche_standzeit_tage: standzeiten.length
      ? Math.round(standzeiten.reduce((a, b) => a + b, 0) / standzeiten.length)
      : null,
    top: sold
      .sort((a, b) => itemProfit(b) - itemProfit(a))
      .slice(0, 3)
      .map((x) => `${x.name}${x.groesse ? " " + x.groesse : ""}: ${eur(itemProfit(x))}`),
    fehlende_gebuehren: sold.filter((x) => x.gebuehren_ct == null).length || undefined,
  };
}

// ---------- Ernährung ----------

function zielAus(text, re) {
  const m = String(text || "").match(re);
  return m ? Number(m[1].replace(/\./g, "")) : null;
}

async function zieleText(userId) {
  try {
    // Durchgestrichenes (~~alt~~) und Kommentare sind kein gültiges Ziel.
    const text = await fs.readFile(zieleDatei(userId), "utf8");
    return text.replace(/<!--[\s\S]*?-->/g, "").replace(/~~[\s\S]*?~~/g, "");
  } catch {
    return "";
  }
}

export async function ernaehrungTag(userId, datum = today(), docSchon = null) {
  const doc = docSchon || (await lesen(ernaehrungDatei(userId, datum), {}));
  const e = Array.isArray(doc.eintraege) ? doc.eintraege : [];
  const sum = (k) => e.reduce((s, x) => s + (Number(x[k]) || 0), 0);
  const ziele = await zieleText(userId);
  const zielKcal = zielAus(ziele, /kalorien[^\d\n]{0,40}(\d[\d.]{2,5})/i);
  const zielEiweiss = zielAus(ziele, /eiwei(?:ß|ss)[^\d\n]{0,40}(\d{2,4})/i);
  const kcal = sum("kcal");
  const eiweiss = sum("eiweiss");
  return {
    datum,
    mahlzeiten: e.length,
    kcal,
    eiweiss_g: eiweiss,
    kh_g: sum("kh"),
    fett_g: sum("fett"),
    ziel_kcal: zielKcal,
    rest_kcal: zielKcal ? zielKcal - kcal : null,
    ziel_eiweiss_g: zielEiweiss,
    rest_eiweiss_g: zielEiweiss ? zielEiweiss - eiweiss : null,
    hinweis: zielKcal ? undefined : "Kein Kalorienziel gespeichert (/memories/ich/tracking/ernaehrung/ziele.md).",
    eintraege: e.map((x) => `${x.zeit} ${x.mahlzeit}: ${x.kcal} kcal, ${x.eiweiss} g Eiweiß`),
  };
}

// Lesbare Fassung im Dokument; freie Zeilen (ohne „• “) bleiben erhalten.
export const renderErnaehrungText = (doc) => {
  const legacy = (doc.text || "")
    .split("\n")
    .filter((l) => !l.startsWith("• "))
    .join("\n")
    .trim();
  const lines = (doc.eintraege || []).map(
    (x) => `• ${x.zeit} ${x.mahlzeit}: ${x.kcal} kcal, ${x.eiweiss} g Eiweiß, ${x.kh} g KH, ${x.fett} g Fett (geschätzt)`,
  );
  return [legacy, ...lines].filter(Boolean).join("\n");
};

// ---------- Werkzeuge (Beschreibung und Schema in tools.js) ----------

export function rechnen({ ausdruck }) {
  const v = rechne(ausdruck);
  return { ausdruck: String(ausdruck), ergebnis: v, deutsch: v.toLocaleString("de-DE", { maximumFractionDigits: 6, useGrouping: false }) };
}

export const gewinnBerechnen = (a) => gewinnRechnung(a);

export async function lagerHinzufuegen(a) {
  if (!String(a.name || "").trim()) throw new BusinessFehler("name fehlt");
  const item = {
    id: newId(),
    name: String(a.name).trim().slice(0, 120),
    groesse: a.groesse ? String(a.groesse).slice(0, 20) : "",
    zustand: a.zustand ? String(a.zustand).slice(0, 60) : "",
    einkauf_ct: toCents(a.einkauf, "Einkauf"),
    einkauf_datum: isDate(a.einkauf_datum) ? a.einkauf_datum : today(),
    plattform: a.plattform ? String(a.plattform).slice(0, 40) : "",
    status: "lager",
    notiz: a.notiz ? String(a.notiz).slice(0, 300) : "",
    erstellt: new Date().toISOString(),
  };
  if (item.einkauf_ct == null) throw new BusinessFehler("einkauf fehlt");
  await aendern(LAGER_DATEI, [], (items) => items.push(item));
  return lagerView(item);
}

export function lagerAktualisieren(a) {
  return aendern(LAGER_DATEI, [], (items) => {
    const betrag = (k, feld) => toCents(a[k], feld) ?? undefined; // leer = unverändert
    const vk = betrag("verkauf", "Verkauf");
    const gb = betrag("gebuehren", "Gebühren");
    const vs = betrag("versand", "Versand");
    const ek = betrag("einkauf", "Einkauf");
    const status = gesetzt(a.status) ? a.status : undefined;
    // Verkauf ohne id: nur eindeutig zuordnen. Ist der einzige Treffer schon verkauft, nicht überschreiben – nachfragen.
    let x = a.id ? items.find((i) => i.id === String(a.id)) : null;
    if (!x && !a.korrektur && (vk !== undefined || status === "verkauft")) {
      const q = String(a.suche || a.id || "").toLowerCase().trim();
      const hits = q ? items.filter((i) => [i.name, i.groesse].filter(Boolean).join(" ").toLowerCase().includes(q)) : [];
      const offen = hits.filter((i) => i.status !== "verkauft");
      const verkauft = hits.filter((i) => i.status === "verkauft");
      if (offen.length === 1 && !verkauft.length) x = offen[0];
      else if (!offen.length && verkauft.length === 1) {
        const v = verkauft[0];
        throw new BusinessFehler(
          `„${v.name}“ ist schon verkauft (${v.verkauf_datum}, ${eur(v.verkauf_ct)}). Korrektur dieses Verkaufs? ` +
            `Dann mit id „${v.id}“ und korrektur: true. Neuer Verkauf? Dann erst lager_hinzufuegen.`,
        );
      }
    }
    x = x || findOne(items, a, "Artikel");
    const warVerkauft = x.status === "verkauft";
    if (status !== undefined) {
      if (!LAGER_STATUS.includes(status)) throw new BusinessFehler(`status muss einer von ${LAGER_STATUS.join(", ")} sein`);
      x.status = status;
    }
    const neuVerkauft = !warVerkauft && (vk !== undefined || status === "verkauft");
    // Neuer Verkauf (auch nach Retoure) oder Rücknahme eines Verkaufs: alte Verkaufsdaten gelten nicht mehr.
    if (neuVerkauft || (warVerkauft && status && status !== "verkauft")) {
      delete x.verkauf_ct;
      delete x.gebuehren_ct;
      delete x.versand_ct;
      delete x.verkauf_datum;
    }
    if (vk !== undefined) {
      x.verkauf_ct = vk;
      if (status === undefined) x.status = "verkauft";
    }
    if (gb !== undefined) x.gebuehren_ct = gb;
    if (vs !== undefined) x.versand_ct = vs;
    if (ek !== undefined) x.einkauf_ct = ek;
    for (const k of ["plattform", "name", "groesse", "zustand", "notiz"]) if (gesetzt(a[k])) x[k] = String(a[k]).slice(0, 300);
    if (x.status === "verkauft") {
      if (x.verkauf_ct == null) throw new BusinessFehler("Für „verkauft“ fehlt der Verkaufspreis (verkauf).");
      // Wiederverkauf nach Retoure zählt im neuen Monat – nur eine Korrektur behält das alte Datum.
      x.verkauf_datum = isDate(a.verkauf_datum) ? a.verkauf_datum : warVerkauft && x.verkauf_datum ? x.verkauf_datum : today();
      if (isDate(x.einkauf_datum) && x.verkauf_datum < x.einkauf_datum) {
        throw new BusinessFehler(`Verkaufsdatum ${x.verkauf_datum} liegt vor dem Einkauf (${x.einkauf_datum}).`);
      }
    }
    x.geaendert = new Date().toISOString();
    return {
      ...lagerView(x),
      ...(x.status === "verkauft" && x.gebuehren_ct == null
        ? { hinweis: "Keine Gebühren angegeben – mit 0 gerechnet. Nachfragen, falls Gebühren anfielen." }
        : {}),
    };
  });
}

export async function lagerListe(a) {
  const q = String(a.suche || "").toLowerCase();
  const items = (await lesen(LAGER_DATEI, []))
    .filter((x) => (!a.status || x.status === a.status) && (!q || `${x.name} ${x.groesse}`.toLowerCase().includes(q)))
    .sort((x, y) => String(y.erstellt || "").localeCompare(String(x.erstellt || "")));
  return { anzahl: items.length, artikel: items.slice(0, 40).map(lagerView) };
}

export async function lagerAuswertungLesen(a) {
  const r = lagerAuswertung(await lesen(LAGER_DATEI, []), a.monat);
  delete r.gewinn_ct;
  return r;
}

export async function aufgabeHinzufuegen(userId, a) {
  if (!String(a.text || "").trim()) throw new BusinessFehler("text fehlt");
  const item = {
    id: newId(),
    text: String(a.text).trim().slice(0, 300),
    faellig: isDate(a.faellig) ? a.faellig : "",
    prioritaet: ["hoch", "niedrig"].includes(a.prioritaet) ? a.prioritaet : "normal",
    erledigt: false,
    erstellt: new Date().toISOString(),
  };
  await aendern(aufgabenDatei(userId), [], (items) => items.push(item));
  return item;
}

export function aufgabeErledigen(userId, a) {
  return aendern(aufgabenDatei(userId), [], (items) => {
    const x = findOne(
      items.filter((t) => !t.erledigt),
      a,
      "Aufgabe",
    );
    x.erledigt = true;
    x.erledigt_am = new Date().toISOString();
    return { erledigt: x.text };
  });
}

export async function aufgabenListe(userId, a) {
  const t = today();
  const items = (await lesen(aufgabenDatei(userId), []))
    .filter((x) => a.alle || !x.erledigt)
    .sort((x, y) => (x.faellig || "9999").localeCompare(y.faellig || "9999"));
  return {
    heute: t,
    aufgaben: items.slice(0, 50).map((x) => ({
      id: x.id,
      text: x.text,
      faellig: x.faellig || undefined,
      ueberfaellig: x.faellig && x.faellig < t && !x.erledigt ? true : undefined,
      prioritaet: x.prioritaet,
      erledigt: x.erledigt || undefined,
    })),
  };
}

export function kundeSpeichern(a) {
  return aendern(KUNDEN_DATEI, [], (items) => {
    const name = String(a.name || "").trim();
    let x = (a.id && items.find((k) => k.id === a.id)) || (name && items.find((k) => k.name.toLowerCase() === name.toLowerCase()));
    if (!x && !name) throw new BusinessFehler("name fehlt");
    if (!x) {
      x = { id: newId(), name: name.slice(0, 120), status: "anfrage", erstellt: new Date().toISOString() };
      items.push(x);
    }
    if (gesetzt(a.status)) {
      if (!KUNDEN_STATUS.includes(a.status)) throw new BusinessFehler(`status muss einer von ${KUNDEN_STATUS.join(", ")} sein`);
      x.status = a.status;
    }
    const betrag = toCents(a.betrag, "Betrag");
    if (betrag != null) x.betrag_ct = betrag;
    if (a.faellig !== undefined) x.faellig = isDate(a.faellig) ? a.faellig : "";
    for (const k of ["projekt", "notiz"]) if (a[k] != null) x[k] = String(a[k]).slice(0, 300);
    x.geaendert = new Date().toISOString();
    return { id: x.id, name: x.name, projekt: x.projekt, status: x.status, betrag: eur(x.betrag_ct), faellig: x.faellig || undefined };
  });
}

export async function kundenListe(a) {
  const items = (await lesen(KUNDEN_DATEI, [])).filter((x) => !a.status || x.status === a.status);
  const sum = (st) => items.filter((x) => x.status === st).reduce((s, x) => s + (x.betrag_ct ?? 0), 0);
  return {
    kunden: items
      .slice(0, 40)
      .map((x) => ({ id: x.id, name: x.name, projekt: x.projekt, status: x.status, betrag: eur(x.betrag_ct), faellig: x.faellig || undefined })),
    summe_angebote: eur(sum("angebot")),
    summe_auftraege: eur(sum("auftrag")),
    summe_fertig_unbezahlt: eur(sum("fertig")),
  };
}

export async function ernaehrungEintragen(userId, a) {
  if (!String(a.mahlzeit || "").trim()) throw new BusinessFehler("mahlzeit fehlt");
  const datum = today(); // einmal bestimmen – kurz vor Mitternacht landen Eintrag und Summe am selben Tag
  const eintrag = {
    zeit: /^\d{1,2}:\d{2}$/.test(a.zeit || "") ? a.zeit : nowTime(),
    mahlzeit: String(a.mahlzeit).slice(0, 120),
    kcal: Math.round(num(a.kcal, "kcal")),
    eiweiss: Math.round(Number(a.eiweiss) || 0),
    kh: Math.round(Number(a.kh) || 0),
    fett: Math.round(Number(a.fett) || 0),
  };
  const doc = await aendern(ernaehrungDatei(userId, datum), {}, (doc) => {
    doc.eintraege = [...(Array.isArray(doc.eintraege) ? doc.eintraege : []), eintrag];
    doc.geaendert = new Date().toISOString();
    doc.text = renderErnaehrungText(doc);
    return structuredClone(doc);
  });
  return ernaehrungTag(userId, datum, doc);
}

export async function ernaehrungKorrigieren(userId, a) {
  const datum = today();
  const doc = await aendern(ernaehrungDatei(userId, datum), {}, (doc) => {
    const eintraege = Array.isArray(doc.eintraege) ? [...doc.eintraege] : [];
    const q = String(a.suche || "").toLowerCase().trim();
    const treffer = eintraege.map((x, i) => [x, i]).filter(([x]) => String(x.mahlzeit).toLowerCase().includes(q));
    if (!treffer.length) {
      throw new BusinessFehler(
        `Heute keine Mahlzeit „${a.suche}“. Heute: ${eintraege.map((x) => `${x.zeit} ${x.mahlzeit}`).join("; ") || "nichts"}.`,
      );
    }
    if (treffer.length > 1) {
      throw new BusinessFehler(`Mehrdeutig: ${treffer.map(([x]) => `${x.zeit} ${x.mahlzeit} (${x.kcal} kcal)`).join("; ")}. Genauer fragen.`);
    }
    const [x, i] = treffer[0];
    if (a.loeschen) eintraege.splice(i, 1);
    else {
      const neu = { ...x };
      if (a.mahlzeit) neu.mahlzeit = String(a.mahlzeit).slice(0, 120);
      for (const k of ["kcal", "eiweiss", "kh", "fett"]) if (gesetzt(a[k])) neu[k] = Math.round(num(a[k], k));
      eintraege[i] = neu;
    }
    doc.eintraege = eintraege;
    doc.geaendert = new Date().toISOString();
    doc.text = renderErnaehrungText(doc);
    return structuredClone(doc);
  });
  return ernaehrungTag(userId, datum, doc);
}

export const ernaehrungTagLesen = (userId, a) => ernaehrungTag(userId, isDate(a.datum) ? a.datum : today());

// ---------- Stand für den System-Prompt ----------

// Kurzer Lagebericht aus den Listen – damit Vertex fürs Briefing keine Werkzeuge braucht.
export async function standSnapshot(userId) {
  try {
    const t = today();
    const [aufgaben, kunden, lagerItems, ern] = await Promise.all([
      lesen(aufgabenDatei(userId), []),
      lesen(KUNDEN_DATEI, []),
      lesen(LAGER_DATEI, []),
      ernaehrungTag(userId, t),
    ]);
    const lager = lagerAuswertung(lagerItems);
    const offen = aufgaben.filter((x) => !x.erledigt).sort((a, b) => (a.faellig || "9999").localeCompare(b.faellig || "9999"));
    const auf = offen
      .slice(0, 10)
      .map(
        (x) =>
          `- ${x.text}${x.faellig ? ` (fällig ${x.faellig}${x.faellig < t ? ", ÜBERFÄLLIG" : x.faellig === t ? ", HEUTE" : ""})` : ""}` +
          `${x.prioritaet === "hoch" ? " [hoch]" : ""}`,
      );
    const offeneKunden = kunden.filter((k) => ["anfrage", "angebot", "auftrag", "fertig"].includes(k.status));
    const kundenText = offeneKunden.length
      ? offeneKunden
          .slice(0, 8)
          .map((k) => `${k.name} (${k.status}${k.betrag_ct != null ? ", " + eur(k.betrag_ct) : ""}${k.faellig ? ", fällig " + k.faellig : ""})`)
          .join("; ")
      : "keine";
    return [
      `Offene Aufgaben (${offen.length}):`,
      ...(auf.length ? auf : ["- keine"]),
      `Lager: ${lager.im_bestand} Artikel im Bestand (Einkaufswert ${lager.lagerwert_einkauf}); diesen Monat ${lager.verkauft} verkauft, Gewinn ${lager.gewinn}.`,
      `Kunden/Projekte offen: ${kundenText}.`,
      `Ernährung heute: ${ern.kcal} kcal, ${ern.eiweiss_g} g Eiweiß${ern.ziel_kcal ? ` (Ziel ${ern.ziel_kcal} kcal)` : ""}.`,
    ].join("\n");
  } catch (err) {
    console.error("[business]", err);
    return `(Listen gerade nicht lesbar: ${err.message})`;
  }
}

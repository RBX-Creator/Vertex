import { test, before, beforeEach, after, mock } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

// Eigener Datenordner, bevor paths.js geladen wird – die echten Daten bleiben unberührt.
const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "vertex-business-"));
process.env.VERTEX_DATA_DIR = tmp;
process.env.VERTEX_TZ = "Europe/Berlin";
const { toCents, cent, rechne, gewinnRechnung, today, standSnapshot, BusinessFehler } = await import("../src/business.js");
const { availableTools, findTool } = await import("../src/tools.js");

const anna = { id: "anna", name: "Anna" };
const run = (name, args = {}, user = anna) => findTool(name).run(user, args);
const zeit = (iso) => mock.timers.setTime(Date.parse(iso));

before(() => mock.timers.enable({ apis: ["Date"], now: Date.parse("2026-10-19T10:00:00Z") }));
beforeEach(async () => {
  // Lager und Kunden sind Team-Listen – jeder Test beginnt leer.
  await fs.rm(path.join(tmp, "team-listen"), { recursive: true, force: true });
  zeit("2026-10-19T10:00:00Z");
});
after(async () => {
  mock.timers.reset();
  await fs.rm(tmp, { recursive: true, force: true });
});

test("toCents/cent: kaufmännisch runden, deutsche Tausender nur im Text", () => {
  assert.equal(toCents(16.125), 1613);
  assert.equal(toCents(9.995), 1000);
  assert.equal(cent(0.1 + 0.2), 30);
  assert.equal(toCents("1.199,50"), 119950);
  assert.equal(toCents("1.200"), 120000);
  assert.equal(toCents("19,99 €"), 1999);
  assert.equal(toCents(1.2), 120); // JSON-Zahl ist nie ein Tausender
  assert.equal(toCents(" "), null);
  assert.equal(toCents(""), null);
  assert.equal(toCents(undefined), null);
  assert.equal(toCents(null), null);
  assert.throws(() => toCents("zwölf", "Einkauf"), BusinessFehler);
  assert.throws(() => toCents(Infinity), /keine Zahl/);
});

test("rechne: deutsch, englisch, mehrdeutig", async () => {
  assert.equal(rechne("1.000.000 + 1.000"), 1001000);
  assert.equal(rechne("1.199,50 + 0,50"), 1200);
  assert.equal(rechne("19,99 * 3"), 59.97);
  assert.equal(rechne("1.5 * 2"), 3);
  assert.equal(rechne("1.200 + 0.5"), 1.7); // englischer Ausdruck: Punkt = Dezimal
  assert.equal(rechne("(140 - 80) / 80 * 100"), 75);
  assert.equal(rechne("140 * 5%"), 7);
  assert.equal(rechne("2 × 3 ÷ 4"), 1.5);
  assert.throws(() => rechne("1.200 - 80"), /mehrdeutig/);
  assert.throws(() => rechne("1 / 0"), /Division durch null/);
  assert.throws(() => rechne("2 +"), /zu früh/);
  assert.throws(() => rechne("2 + a"), /Unerwartetes Zeichen/);
  assert.throws(() => rechne(""), /Leerer Ausdruck/);
  assert.deepEqual(await run("rechnen", { ausdruck: "19,99 * 3" }), { ausdruck: "19,99 * 3", ergebnis: 59.97, deutsch: "59,97" });
});

test("gewinnRechnung: Gebühr in % und fix, Versand, Mindestpreis", () => {
  const r = gewinnRechnung({ einkauf: 80, verkauf: 140, gebuehr_prozent: 5, gebuehr_fix: 0.7, versand: 4.99 });
  assert.equal(r.gebuehren, "7,70 €");
  assert.equal(r.gewinn, "47,31 €");
  assert.equal(r.mindestpreis_ohne_verlust, "90,20 €");
  assert.equal(r.marge, "33,8 %");
  assert.equal(r.hinweis, undefined);
  // Genau 40,50 € – ohne Glätten machte Math.ceil daraus 40,51 €.
  assert.equal(gewinnRechnung({ einkauf: 38.07, verkauf: 50, gebuehr_prozent: 6 }).mindestpreis_ohne_verlust, "40,50 €");
  assert.match(gewinnRechnung({ einkauf: 80, verkauf: 140 }).hinweis, /Ohne Plattformgebühr/);
});

test("Lager: zwei Artikel, einer verkauft, Monatsauswertung", async () => {
  const a43 = await run("lager_hinzufuegen", { name: "Panda Dunks", groesse: "43", einkauf: 80 });
  await run("lager_hinzufuegen", { name: "Panda Dunks", groesse: "44", einkauf: 90 });
  assert.equal(a43.einkauf, "80,00 €");
  assert.equal(a43.einkauf_datum, "2026-10-19");

  // Zwei offene Treffer: nicht raten, sondern Liste mit Status und Datum zurückgeben.
  await assert.rejects(run("lager_aktualisieren", { suche: "panda", verkauf: 140 }), (err) => {
    assert.equal(err.name, "BusinessFehler");
    assert.match(err.message, /Mehrdeutig – 2 Treffer/);
    assert.match(err.message, /\(lager, gekauft 2026-10-19\)/);
    return true;
  });

  const v = await run("lager_aktualisieren", { suche: "panda dunks 43", verkauf: 140, versand: 4.99, gebuehren: 0, plattform: "Vinted" });
  assert.equal(v.status, "verkauft");
  assert.equal(v.gewinn, "55,01 €");
  assert.equal(v.verkauf_datum, "2026-10-19");
  assert.equal(v.hinweis, undefined);

  // Einziger Treffer ist schon verkauft → nicht überschreiben, nachfragen.
  await assert.rejects(run("lager_aktualisieren", { suche: "panda dunks 43", verkauf: 150 }), /schon verkauft/);

  const m = await run("lager_auswertung", { monat: "2026-10" });
  assert.equal(m.verkauft, 1);
  assert.equal(m.umsatz, "140,00 €");
  assert.equal(m.gewinn, "55,01 €");
  assert.equal(m.im_bestand, 1);
  assert.equal(m.lagerwert_einkauf, "90,00 €");
  assert.equal(m.gewinn_ct, undefined);

  // Leere Beträge ändern nichts.
  const k = await run("lager_aktualisieren", { id: a43.id, korrektur: true, gebuehren: "", versand: null, verkauf: " " });
  assert.equal(k.gewinn, "55,01 €");
  assert.equal(k.verkauf_datum, "2026-10-19");
  // Korrektur behält das Verkaufsdatum.
  zeit("2026-10-25T10:00:00Z");
  const k2 = await run("lager_aktualisieren", { id: a43.id, korrektur: true, gebuehren: 7 });
  assert.equal(k2.gewinn, "48,01 €");
  assert.equal(k2.verkauf_datum, "2026-10-19");

  // Verkauf vor dem Einkauf wird abgelehnt – und nichts gespeichert.
  await assert.rejects(run("lager_aktualisieren", { id: a43.id, verkauf_datum: "2026-10-01" }), /liegt vor dem Einkauf/);
  const [gespeichert] = (await run("lager_liste", { status: "verkauft" })).artikel;
  assert.equal(gespeichert.verkauf_datum, "2026-10-19");
});

test("Wiederverkauf nach Retoure zählt im neuen Monat", async () => {
  zeit("2026-09-20T10:00:00Z");
  const x = await run("lager_hinzufuegen", { name: "Jordan 4", groesse: "44", einkauf: 100 });
  assert.equal((await run("lager_aktualisieren", { suche: "jordan", verkauf: 150 })).verkauf_datum, "2026-09-20");

  zeit("2026-10-05T10:00:00Z");
  const r = await run("lager_aktualisieren", { id: x.id, status: "retoure" });
  assert.equal(r.status, "retoure");
  assert.equal(r.verkauf, undefined);
  const raw = JSON.parse(await fs.readFile(path.join(tmp, "team-listen", "lager.json"), "utf8"));
  assert.equal(raw[0].verkauf_ct, undefined);
  assert.equal(raw[0].verkauf_datum, undefined);

  const neu = await run("lager_aktualisieren", { suche: "jordan", verkauf: 140 });
  assert.equal(neu.verkauf_datum, "2026-10-05");
  assert.equal(neu.gewinn, "40,00 €");
  assert.equal((await run("lager_auswertung", { monat: "2026-09" })).verkauft, 0);
  const okt = await run("lager_auswertung", { monat: "2026-10" });
  assert.equal(okt.verkauft, 1);
  assert.equal(okt.gewinn, "40,00 €");
  assert.equal(okt.fehlende_gebuehren, 1);
});

test("Parallele Werkzeugaufrufe verlieren nichts", async () => {
  await Promise.all(
    Array.from({ length: 5 }, (_, i) => run("ernaehrung_eintragen", { mahlzeit: `Mahlzeit ${i}`, kcal: 100 + i, eiweiss: 10 })),
  );
  const tag = await run("ernaehrung_tag");
  assert.equal(tag.mahlzeiten, 5);
  assert.equal(tag.kcal, 510);
  assert.equal(tag.eiweiss_g, 50);

  await Promise.all(Array.from({ length: 5 }, (_, i) => run("lager_hinzufuegen", { name: `Artikel ${i}`, einkauf: 10 })));
  assert.equal((await run("lager_liste")).anzahl, 5);

  // Atomar geschrieben: keine Temp-Dateien bleiben liegen.
  const reste = [
    ...(await fs.readdir(path.join(tmp, "team-listen"))),
    ...(await fs.readdir(path.join(tmp, "users", "anna", "listen"))),
  ].filter((f) => f.endsWith(".tmp"));
  assert.deepEqual(reste, []);
});

test("Ernährung: Ziel aus dem Gedächtnis, korrigieren, löschen", async () => {
  const ben = { id: "ben", name: "Ben" };
  const zieleDir = path.join(tmp, "users", "ben", "ich", "tracking", "ernaehrung");
  await fs.mkdir(zieleDir, { recursive: true });
  await fs.writeFile(path.join(zieleDir, "ziele.md"), "# Ernährungsziele\n\n- **Kalorien pro Tag:** ~~2.000~~ 2.200\n- **Eiweiß pro Tag (g):** 150\n");

  zeit("2026-10-19T22:30:00Z"); // in Berlin schon der 20.
  assert.equal(today(), "2026-10-20");
  await run("ernaehrung_eintragen", { mahlzeit: "Pizza", kcal: 1100, eiweiss: 40 }, ben);
  let tag = await run("ernaehrung_eintragen", { mahlzeit: "Döner", kcal: "700", eiweiss: 35, zeit: "23:10" }, ben);
  assert.equal(tag.datum, "2026-10-20");
  assert.equal(tag.kcal, 1800);
  assert.equal(tag.ziel_kcal, 2200);
  assert.equal(tag.rest_kcal, 400);
  assert.equal(tag.rest_eiweiss_g, 75);
  assert.deepEqual(tag.eintraege, ["00:30 Pizza: 1100 kcal, 40 g Eiweiß", "23:10 Döner: 700 kcal, 35 g Eiweiß"]);

  tag = await run("ernaehrung_korrigieren", { suche: "pizza", kcal: 900, eiweiss: "" }, ben);
  assert.equal(tag.kcal, 1600);
  assert.equal(tag.eiweiss_g, 75); // leer = unverändert
  tag = await run("ernaehrung_korrigieren", { suche: "döner", loeschen: true }, ben);
  assert.equal(tag.kcal, 900);
  await assert.rejects(run("ernaehrung_korrigieren", { suche: "salat" }, ben), /Heute keine Mahlzeit „salat“.*Pizza/);

  const doc = JSON.parse(await fs.readFile(path.join(tmp, "users", "ben", "listen", "ernaehrung-2026-10-20.json"), "utf8"));
  assert.equal(doc.text, "• 00:30 Pizza: 900 kcal, 40 g Eiweiß, 0 g KH, 0 g Fett (geschätzt)");
  const gestern = await run("ernaehrung_tag", { datum: "2026-10-19" }, ben);
  assert.equal(gestern.mahlzeiten, 0);
  assert.equal(gestern.hinweis, undefined); // Ziel ist bekannt
});

test("Aufgaben (privat) und Kunden (Team)", async () => {
  await run("aufgabe_hinzufuegen", { text: "Rechnung an Kunde schicken", faellig: "2026-10-17", prioritaet: "hoch" });
  await run("aufgabe_hinzufuegen", { text: "Fotos für Vinted machen" });
  let liste = await run("aufgaben_liste");
  assert.equal(liste.heute, "2026-10-19");
  assert.equal(liste.aufgaben.length, 2);
  assert.equal(liste.aufgaben[0].ueberfaellig, true);
  // Aufgaben sind privat: Ben sieht Annas Aufgaben nicht.
  assert.equal((await run("aufgaben_liste", {}, { id: "ben", name: "Ben" })).aufgaben.length, 0);

  await assert.rejects(run("aufgabe_erledigen", { suche: "en" }), /Mehrdeutig – 2 Treffer/);
  assert.deepEqual(await run("aufgabe_erledigen", { suche: "rechnung" }), { erledigt: "Rechnung an Kunde schicken" });
  liste = await run("aufgaben_liste");
  assert.equal(liste.aufgaben.length, 1);
  assert.equal((await run("aufgaben_liste", { alle: true })).aufgaben.length, 2);

  const k = await run("kunde_speichern", { name: "Bäckerei Beispiel", projekt: "Webseite", status: "angebot", betrag: 1500 });
  assert.equal(k.betrag, "1.500,00 €");
  await run("kunde_speichern", { name: "bäckerei beispiel", status: "auftrag", betrag: "" });
  await assert.rejects(run("kunde_speichern", { name: "Neu GmbH", status: "irgendwas" }), /status muss einer von/);
  const kunden = await run("kunden_liste");
  assert.equal(kunden.kunden.length, 1);
  assert.equal(kunden.kunden[0].status, "auftrag");
  assert.equal(kunden.summe_auftraege, "1.500,00 €");
  assert.equal(kunden.summe_angebote, "0,00 €");

  const stand = await standSnapshot("anna");
  assert.match(stand, /Offene Aufgaben \(1\):\n- Fotos für Vinted machen/);
  assert.match(stand, /Kunden\/Projekte offen: Bäckerei Beispiel \(auftrag, 1\.500,00 €\)/);
});

test("Alle Business-Werkzeuge stehen Gemini und Claude zur Verfügung", async () => {
  const namen = (await availableTools(anna)).map((t) => t.name);
  for (const n of [
    "rechnen", "gewinn_berechnen", "lager_hinzufuegen", "lager_aktualisieren", "lager_liste", "lager_auswertung",
    "aufgabe_hinzufuegen", "aufgabe_erledigen", "aufgaben_liste", "kunde_speichern", "kunden_liste",
    "ernaehrung_eintragen", "ernaehrung_korrigieren", "ernaehrung_tag",
  ]) {
    assert.ok(namen.includes(n), n);
    assert.equal(findTool(n).schema.type, "object");
  }
  // Ohne Verbindungen bleiben Kalender und Postfach weg.
  assert.ok(!namen.includes("kalender"));
});

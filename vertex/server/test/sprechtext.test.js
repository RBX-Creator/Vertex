import { test } from "node:test";
import assert from "node:assert/strict";
import { sprechbar, satzEnde } from "../src/sprechtext.js";

const faelle = [
  ["Der Preis liegt bei 119,99 €.", "Der Preis liegt bei 119 Euro 99."],
  ["Gewinn: **55,01 €** (Marge 23,5 %).", "Gewinn: 55 Euro und 1 Cent (Marge 23 Komma 5 Prozent)."],
  ["Nur 4,05 € und 3,50 €.", "Nur 4 Euro und 5 Cent und 3 Euro 50."],
  ["0,99 € pro Stück, 5 €/Monat", "99 Cent pro Stück, 5 Euro pro Monat"],
  ["Wiederverkauf für 110–130 € bzw. 1.199,50 € inkl. Versand.", "Wiederverkauf für 110 bis 130 Euro beziehungsweise 1199 Euro 50 inklusive Versand."],
  ["Jordan 4 in Gr. 44,5 für 1.200 €", "Jordan 4 in Größe 44 Komma 5 für 1200 Euro"],
  ["Termin am 19.10.2026 um 13:00.", "Termin am 19. Oktober 2026 um 13 Uhr."],
  ["Meeting 2026-10-19T14:30:00Z", "Meeting 19. Oktober 2026 um 14 Uhr 30"],
  ["Mo–Fr 9–18 Uhr", "Montag bis Freitag 9 bis 18 Uhr"],
  ["Es hat 21 °C und -3 °C nachts.", "Es hat 21 Grad und minus 3 Grad nachts."],
  ["Ca. 650 kcal, 35 g Eiweiß, z. B. Hähnchen.", "Circa 650 Kalorien, 35 Gramm Eiweiß, zum Beispiel Hähnchen."],
  ["Lauf 5 km in 25 min, dann 2 Std. Pause.", "Lauf 5 Kilometer in 25 Minuten, dann 2 Stunden Pause."],
  ["3x pro Woche, 2 × 4 = 8.", "3 mal pro Woche, 2 mal 4 gleich 8."],
  ["Kunden & Partner. Nr. 5 ist offen, usw.", "Kunden und Partner. Nummer 5 ist offen, und so weiter."],
  ["- Punkt eins\n- Punkt zwei\n## Titel\nText", "Punkt eins, Punkt zwei. Titel. Text"],
  ["Version 3.12.1 läuft seit 19.10.", "Version 3.12.1 läuft seit 19. Oktober."],
  ["Ruf 030-1234567 an.", "Ruf 030-1234567 an."],
  ["Das sind 12,5 kg.", "Das sind 12 Komma 5 Kilo."],
  ["Mehr unter https://example.com/x und [Shop](https://shop.de).", "Mehr unter und Shop."],
];

test("sprechbar: deutsche Sprechweise", () => {
  for (const [ein, aus] of faelle) assert.equal(sprechbar(ein), aus, ein);
});

test("sprechbar: wirft nie", () => {
  for (const x of [null, undefined, 42, {}, [], "", "€€€ %%% ...", "1.2.3.4.5", "x".repeat(20000), "((((", "**_~~`"]) {
    assert.equal(typeof sprechbar(x), "string");
  }
  assert.equal(sprechbar(null), "");
});

test("satzEnde: trennt nicht bei Abkürzungen und Daten", () => {
  assert.equal(satzEnde("Das kostet ca. 5 €. Gut so."), 19);
  assert.equal(satzEnde("Am 19.10. ist es so weit. Ja"), 25);
  assert.equal(satzEnde("Das ist z. B. gut. Ja"), 18);
  assert.equal(satzEnde("Noch nicht"), -1);
  assert.equal(satzEnde("Absatz eins\n\nAbsatz zwei"), 13);
});

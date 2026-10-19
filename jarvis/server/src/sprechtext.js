// Sprechtext: bereitet Antworttext für die Sprachausgabe (TTS) auf – Datum, Uhrzeit, Geld, Prozent,
// Einheiten, Abkürzungen und Zeichen so, wie man sie auf Deutsch sagt („119,99 €“ → „119 Euro 99“).
// Reines ESM ohne Abhängigkeiten und ohne Node-APIs: läuft im Server und unverändert im Browser.
// Ziffern bleiben Ziffern (das können die Stimmen selbst) – hier geht es um Struktur, Einheiten und Zeichen.
//
//   sprechbar(text)  → vorlesbarer Text (wirft nie, "" bei null/undefined)
//   satzEnde(text)   → Index hinter dem ersten vollständigen Satz oder -1 (für gestreamten Text;
//                      trennt nicht bei „z. B.“, „ca.“, „19.10.“ oder „3. Platz“)

const MONATE = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];
const MONAT_KURZ = { jan: 1, feb: 2, mär: 3, mrz: 3, apr: 4, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, okt: 10, nov: 11, dez: 12 };
const TAGE = { Mo: "Montag", Di: "Dienstag", Mi: "Mittwoch", Do: "Donnerstag", Fr: "Freitag", Sa: "Samstag", So: "Sonntag" };
const TAG_NAMEN = Object.values(TAGE).join("|");
const MONAT_NAMEN = MONATE.join("|");

const re = (src, flags = "") => new RegExp(src, "gu" + flags);

// Ersetzt mit Rückruf (treffer, gruppen[], position, text) – ohne benannte Gruppen.
function ersetze(s, regex, fn) {
  return s.replace(regex, (...a) => fn(a[0], a.slice(1, -2), a[a.length - 2], a[a.length - 1]));
}

// Steht nach Position i nur noch Leerraum bis Zeilenende? Dann war der Abkürzungspunkt auch Satzende.
const amSatzende = (str, i) => /^[ \t]*(?:\n|$)/.test(str.slice(i));

// Vor diesen Wörtern ist „3.12.“ eine Versionsnummer oder Gliederung, kein Datum.
const KEINE_DATUMSZAHL =
  "(?<!(?<![\\p{L}])(?:Version|Vers\\.|Release|Update|Patch|Build|Firmware|Kapitel|Kap\\.|Abschnitt|Schritt|Punkt|Seite|S\\.|Paragraf|§|Nr\\.|Nummer|" +
  "Python|Node|Node\\.js|Java|iOS|iPadOS|Android|macOS|Windows|Ubuntu|Debian|Chrome|Firefox|Safari|PHP|Ruby|Go|Rust|Kotlin|Swift|npm|v|V)\\s?)";
// Nach diesen Wörtern ist „19.10“ (ohne Schlusspunkt) oder „19.10.26“ sicher ein Datum.
const DATUM_DAVOR =
  `(?<=(?<![\\p{L}])(?:[aA]m|[vV]om|[zZ]um|bis zum|ab dem|seit dem|Datum:?|Stichtag:?|Termin:?|Frist:?|Deadline:?|geboren|geb\\.|${TAG_NAMEN}),?\\s)`;
// „16:9“, „Maßstab 1:20“, „es steht 2:10“ sind Verhältnisse, keine Uhrzeiten.
const VERHAELTNIS_DAVOR =
  "(?<!(?:Maßstab|Massstab|Verhältnis|Seitenverhältnis|Format|steht|stand|Stand|Endstand|endete|Halbzeit|gewinnt|gewann|verliert|verlor)(?: es)?\\s)";

function datumText(d, m, j) {
  const tag = +d;
  const monat = +m;
  if (!(monat >= 1 && monat <= 12 && tag >= 1 && tag <= 31)) return null;
  return `${tag}. ${MONATE[monat - 1]}` + (j ? ` ${j}` : "");
}

function uhrText(h, m, s) {
  let t = `${+h} Uhr`;
  if (+m) t += ` ${+m}`;
  if (s && +s) t += ` und ${+s} Sekunden`;
  return t;
}

const menge = (n, eins, mehr) => `${+n} ${+n === 1 ? eins : mehr}`;

// ---------- Einheiten ----------

// [Abkürzung, Mehrzahl, Einzahl] – Einzahl nur, wo sie sich unterscheidet („1 Minute“).
const EINHEITEN = [
  ["kcal", "Kalorien", "Kalorie"], ["kJ", "Kilojoule"],
  ["mg", "Milligramm"], ["kg", "Kilo"], ["g", "Gramm"],
  ["km²", "Quadratkilometer"], ["km", "Kilometer"], ["cm", "Zentimeter"], ["mm", "Millimeter"],
  ["m²", "Quadratmeter"], ["qm", "Quadratmeter"], ["m³", "Kubikmeter"], ["m", "Meter"],
  ["ml", "Milliliter"], ["cl", "Zentiliter"], ["dl", "Deziliter"], ["l", "Liter"], ["L", "Liter"],
  ["ms", "Millisekunden", "Millisekunde"], ["Sek.", "Sekunden", "Sekunde"], ["sek", "Sekunden", "Sekunde"], ["s", "Sekunden", "Sekunde"],
  ["min", "Minuten", "Minute"], ["Min.", "Minuten", "Minute"], ["Min", "Minuten", "Minute"],
  ["Std.", "Stunden", "Stunde"], ["Std", "Stunden", "Stunde"], ["h", "Stunden", "Stunde"],
  ["Stk.", "Stück"], ["Stk", "Stück"],
  ["kWh", "Kilowattstunden", "Kilowattstunde"], ["kW", "Kilowatt"], ["W", "Watt"], ["V", "Volt"], ["mAh", "Milliamperestunden"],
  ["TB", "Terabyte"], ["GB", "Gigabyte"], ["MB", "Megabyte"], ["KB", "Kilobyte"], ["kB", "Kilobyte"],
  ["GHz", "Gigahertz"], ["MHz", "Megahertz"], ["Hz", "Hertz"],
  ["EL", "Esslöffel"], ["TL", "Teelöffel"],
  ["Pkt.", "Punkte", "Punkt"], ["Pkt", "Punkte", "Punkt"],
  ["Mio.", "Millionen", "Million"], ["Mio", "Millionen", "Million"],
  ["Mrd.", "Milliarden", "Milliarde"], ["Mrd", "Milliarden", "Milliarde"],
  ["Tsd.", "Tausend"], ["Tsd", "Tausend"], ["k", "Tausend"],
  ["ct", "Cent"], ["Ct.", "Cent"], ["Ct", "Cent"],
];
const EINHEIT = Object.fromEntries(EINHEITEN.map((e) => [e[0], e]));
const EINZELBUCHSTABE = new Set(["g", "m", "l", "L", "h", "s", "W", "V", "k"]); // „5 W-Fragen“ ist keine Leistung
const ESC = (s) => s.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
const EINHEIT_ALT = EINHEITEN.map((e) => e[0]).sort((a, b) => b.length - a.length).map(ESC).join("|");
const EINHEIT_RE = re(`(?<![\\p{L}\\p{N}.,])(\\d+(?:[.,]\\d+)?)\\s?(${EINHEIT_ALT})(?![\\p{L}\\p{N}²³])`);
const PRO_EINHEIT_RE = re(`(?<![\\p{L}])(pro|je)\\s(${EINHEIT_ALT})(?![\\p{L}\\p{N}²³])`);
const EINHEIT_ALLEIN_RE = /(?<![\p{L}\p{N}])(kcal|kg|km|ml|mg|kWh|Std\.|Stk\.|Min\.|Sek\.|Mio\.|Mrd\.|Tsd\.|Pkt\.)(?![\p{L}\p{N}])/gu;

// „5 €/Monat“, „3x/Woche“, „100 kcal/Tag“ → „pro“
const PRO_DAVOR =
  "(?:(?<![\\p{L}\\d])\\d+(?:[.,]\\d+)?|[%€$£¥]|(?<![\\p{L}])(?:kcal|kg|g|mg|km|m|cm|ml|l|L|ct|Cent|Euro|EUR|Dollar|x|mal|Stk|Stück|kWh|Std|h|min|Min|Kalorien|Gramm|Kilo|Liter|Punkte?|Prozent|Mio|Tsd))\\.?";
const PRO_RE = re(`(?<=${PRO_DAVOR})\\s?\\/\\s?(?=\\p{L})`);

// ---------- Geld ----------

const WAEHRUNG = {
  "€": ["Euro", "Cent"], eur: ["Euro", "Cent"], euro: ["Euro", "Cent"],
  $: ["Dollar", "Cent"], usd: ["Dollar", "Cent"], "us-dollar": ["Dollar", "Cent"], dollar: ["Dollar", "Cent"],
  "£": ["Pfund", "Pence"], gbp: ["Pfund", "Pence"],
  chf: ["Franken", "Rappen"], franken: ["Franken", "Rappen"],
  "¥": ["Yen", null], jpy: ["Yen", null], yen: ["Yen", null],
};
const GROESSE = {
  mio: ["Million", "Millionen"], million: ["Million", "Millionen"], millionen: ["Million", "Millionen"],
  mrd: ["Milliarde", "Milliarden"], milliarde: ["Milliarde", "Milliarden"], milliarden: ["Milliarde", "Milliarden"],
  tsd: ["Tausend", "Tausend"], tausend: ["Tausend", "Tausend"], k: ["Tausend", "Tausend"],
};
const schluessel = (s) => s.toLowerCase().replace(/\.$/, "");

const BETRAG = "\\d+(?:[.,]\\d{1,2}(?!\\d)|,[\\-–](?!\\d))?";
const GROESSE_RE = "(?:\\s?(Mio\\.?|Mrd\\.?|Tsd\\.?|Millionen|Million|Milliarden|Milliarde|Tausend|k)(?![\\p{L}]))?";
const BIS = "(?:\\s?(?:[–—\\-]|bis)\\s?(" + BETRAG + "))?";
const GELD_NACH_RE = re(
  `(?<![\\p{L}\\p{N}.,])(${BETRAG})${BIS}${GROESSE_RE}\\s?(€|EUR|Euro|\\$|USD|US-Dollar|Dollar|£|GBP|CHF|Franken|¥|JPY|Yen)(?![\\p{L}])`,
);
const GELD_VOR_RE = re(`(?<![\\p{L}\\p{N}])(€|\\$|£|¥|EUR|USD|CHF|GBP)\\s?(${BETRAG})${BIS}${GROESSE_RE}(?![\\p{N}]|[.,]\\d)`);

function zerlege(zahl) {
  const m = /^(\d+)(?:[.,](\d{1,2}|[-–]))?$/.exec(zahl);
  if (!m) return null;
  const rest = m[2] && /\d/.test(m[2]) ? +(m[2].length === 1 ? m[2] + "0" : m[2]) : 0;
  return { ganz: m[1], rest: rest ? String(rest) : "" };
}

function geldText(a, b, groesse, waehrung) {
  const w = WAEHRUNG[schluessel(waehrung)];
  if (!w) return null;
  const [name, unter] = w;
  if (groesse) {
    const g = GROESSE[schluessel(groesse)];
    const komma = (x) => x.replace(/[.,](?=\d)/, " Komma ");
    return `${komma(a)}${b ? ` bis ${komma(b)}` : ""} ${!b && a === "1" ? g[0] : g[1]} ${name}`;
  }
  const pa = zerlege(a);
  const pb = b ? zerlege(b) : null;
  if (!pa || (b && !pb)) return null;
  const einzeln = (p) => {
    if (!p.rest) return `${p.ganz} ${name}`;
    if (!unter) return `${p.ganz} Komma ${p.rest} ${name}`;
    if (+p.ganz === 0) return `${p.rest} ${unter}`; // 0,99 € → 99 Cent
    if (+p.rest < 10) return `${p.ganz} ${name} und ${p.rest} ${unter}`; // 55,01 € → 55 Euro und 1 Cent
    return `${p.ganz} ${name} ${p.rest}`;
  };
  if (pb && !pa.rest && !pb.rest) return `${pa.ganz} bis ${pb.ganz} ${name}`;
  return pb ? `${einzeln(pa)} bis ${einzeln(pb)}` : einzeln(pa);
}

// ---------- Abkürzungen ----------

// [Muster ohne Schlusspunkt, Ersatz, Punkt: "muss" | "kann" | "nie", Satzschluss-Wort?]
const ABKUERZUNGEN = [
  ["[iI]\\.\\s?d\\.\\s?R", "in der Regel", "muss"],
  ["[uU]\\.\\s?v\\.\\s?m", "und vieles mehr", "muss", true],
  ["[iI]\\.\\s?H\\.\\s?v", "in Höhe von", "muss"],
  ["[zZ]\\.\\s?[bB]", "zum Beispiel", "muss"],
  ["[zZ]\\.\\s?Zt", "zurzeit", "muss"],
  ["[zZ]\\.\\s?T", "zum Teil", "muss"],
  ["[dD]\\.\\s?[hH]", "das heißt", "muss"],
  ["[uU]\\.\\s?a", "unter anderem", "muss"],
  ["[uU]\\.\\s?U", "unter Umständen", "muss"],
  ["[oO]\\.\\s?[äÄ]", "oder Ähnliches", "muss", true],
  ["[vV]\\.\\s?a", "vor allem", "muss"],
  ["s\\.\\s?o", "siehe oben", "muss"],
  ["s\\.\\s?u", "siehe unten", "muss"],
  ["[mM]\\.\\s?E", "meines Erachtens", "muss"],
  ["p\\.\\s?a", "pro Jahr", "muss"],
  ["[oO]\\.\\s?[kK]", "okay", "muss"],
  ["zB", "zum Beispiel", "nie"],
  ["[uU]sw", "und so weiter", "kann", true],
  ["[eE]tc", "et cetera", "kann", true],
  ["[cC]a", "circa", "kann"],
  ["[bB]zw", "beziehungsweise", "kann"],
  ["[iI]nkl", "inklusive", "kann"],
  ["[eE]xkl", "exklusive", "kann"],
  ["[zZ]zgl", "zuzüglich", "kann"],
  ["[aA]bzgl", "abzüglich", "kann"],
  ["[gG]gf", "gegebenenfalls", "kann"],
  ["[eE]vtl", "eventuell", "kann"],
  ["[bB]spw", "beispielsweise", "kann"],
  ["[bB]zgl", "bezüglich", "kann"],
  ["[iI]nsb", "insbesondere", "muss"],
  ["[vV]gl", "vergleiche", "muss"],
  ["[zZ]zt", "zurzeit", "muss"],
  ["[mM]wSt", "Mehrwertsteuer", "kann"],
  ["USt", "Umsatzsteuer", "kann"],
  ["[mM]ind", "mindestens", "muss"],
  ["max", "maximal", "muss"],
  ["[nN]r", "Nummer", "muss"],
  ["[tT]el", "Telefon", "muss"],
  ["Str", "Straße", "muss"],
  ["Dr", "Doktor", "muss"],
  ["Prof", "Professor", "muss"],
  ["Hrn", "Herrn", "muss"],
  ["Hr", "Herr", "muss"],
  ["Abs", "Absatz", "muss"],
  ["Kap", "Kapitel", "muss"],
  ["Jh", "Jahrhundert", "muss"],
  ["Bsp", "Beispiel", "muss"],
  ["Anm", "Anmerkung", "muss"],
  ["[aA]llg", "allgemein", "muss"],
  ["[eE]hem", "ehemals", "muss"],
  ["gem", "gemäß", "muss"],
  ["lt", "laut", "muss"],
  ["[uU]gs", "umgangssprachlich", "muss"],
  ["geb", "geboren", "muss"],
  ["Gr", "Größe", "muss"],
].map(([muster, ersatz, punkt, schluss]) => {
  const ende = punkt === "muss" ? "\\." : punkt === "kann" ? "(?:\\.|(?![\\p{L}\\p{N}]))" : "(?![\\p{L}\\p{N}])";
  return { regex: re(`(?<![\\p{L}\\p{N}])${muster}${ende}`), ersatz, schluss };
});

// ---------- Schritte ----------

function vorbereiten(s) {
  return s
    .replace(/\r\n?/g, "\n")
    .replace(/[​⁠﻿]/g, "")
    .replace(/(\d)['’  ](?=\d{3}(?!\d))/g, "$1") // 4'200 / 4 200 (schmales Leerzeichen)
    .replace(/[    ]/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;|&apos;/g, "'")
    .replace(/\S{80,}/g, " ") // Hashes, Base64, Datenmüll – unaussprechbar
    .replace(/[ \t]+/g, " ");
}

function markdown(s) {
  s = s
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/~~~[\s\S]*?~~~/g, " ")
    .replace(/```[\s\S]*$/, " ") // noch offener Codeblock am Ende
    .replace(/`([^`\n]*)`/g, "$1") // Inline-Code: Inhalt bleibt hörbar
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\[[^\]]*\]/g, "$1")
    .replace(/^[ \t]*\[[^\]]+\]:[ \t]*\S+.*$/gm, "")
    .replace(/<(?:https?|mailto):[^>\s]+>/g, "")
    .replace(/(?:https?:\/\/|www\.)[^\s<>()[\]]*[^\s<>()[\].,;:!?'"]/g, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/?[a-zA-Z][^>\n]*>/g, "")
    .replace(/\[\^?\d+\]/g, "") // Fußnoten [1]
    .replace(/[\p{Extended_Pictographic}\u{1F1E6}-\u{1F1FF}\u{1F3FB}-\u{1F3FF}\u{E0020}-\u{E007F}︎️‍⃣✓✗✘☐★☆]/gu, " ");

  // Zeilen: Überschriften, Zitate, Listen, Tabellen → Fließtext mit Satzzeichen
  const mehrzeilig = s.trim().includes("\n");
  const zeilen = [];
  for (let zeile of s.split("\n")) {
    if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(zeile)) continue; // Trennlinie
    if (/^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(zeile)) continue; // Tabellenkopf-Linie
    let art = "text";
    zeile = zeile.replace(/^\s*(?:>\s?)+/, "");
    const ueberschrift = /^\s{0,3}#{1,6}\s+(.*?)\s*#*\s*$/.exec(zeile);
    if (ueberschrift) {
      zeile = ueberschrift[1];
      art = "satz";
    } else if (/^\s*\|.*\|\s*$/.test(zeile)) {
      zeile = zeile.trim().replace(/^\||\|$/g, "").split("|").map((z) => z.trim()).filter(Boolean).join(", ");
      art = "satz";
    } else if (/^\s*[-*+•▪◦‣]\s+/.test(zeile)) {
      zeile = zeile.replace(/^\s*[-*+•▪◦‣]\s+(?:\[[ xX]\]\s+)?/, "");
      art = "punkt";
    } else if (mehrzeilig && re(`^\\s*\\d{1,2}[.)]\\s+(?!(?:${MONAT_NAMEN}|FC)(?![\\p{L}]))`).test(zeile)) {
      zeile = zeile.replace(/^\s*\d{1,2}[.)]\s+/, "");
      art = "punkt";
    }
    zeile = zeile.trim();
    if (zeile) zeilen.push({ zeile, art });
  }
  s = zeilen
    .map(({ zeile, art }, i) => {
      const naechste = zeilen[i + 1];
      if (!naechste || /[.!?:;,…]$/.test(zeile)) return zeile;
      return zeile + (art === "punkt" && naechste.art === "punkt" ? "," : ".");
    })
    .join(" ");

  // Hervorhebungen
  return s
    .replace(/(\*\*|__)(?=\S)([^\n]*?\S)\1/g, "$2")
    .replace(/(?<![\p{L}\p{N}*])\*(?=\S)([^*\n]*?\S)\*(?![\p{L}\p{N}*])/gu, "$1")
    .replace(/(?<![\p{L}\p{N}_])_(?=\S)([^_\n]*?\S)_(?![\p{L}\p{N}_])/gu, "$1")
    .replace(/~~(?=\S)([^~\n]*?\S)~~/g, "$1");
}

function zeichenVorab(s) {
  return s
    .replace(/(?<![\p{N}])24\/7(?![\p{N}])/gu, "rund um die Uhr")
    .replace(/\s?(?:\+\/[-−]|±)\s?/g, " plus minus ")
    .replace(/\s?(?:->|→|⟶|➔|➜|⇾)\s?/g, " zu ")
    .replace(/\s?(?:=>|⇒|⟹)\s?/g, " also ")
    .replace(/[←↑↓⇐⇑⇓↔⇔]/g, " ")
    .replace(/≈\s?/g, "ungefähr ")
    .replace(/(?<![~])~\s?(?=\d)/g, "circa ")
    .replace(/\s?≠\s?/g, " ungleich ")
    .replace(/\s?≤\s?/g, " höchstens ")
    .replace(/\s?≥\s?/g, " mindestens ")
    .replace(/(\d)\s?½/g, "$1 einhalb")
    .replace(/½/g, "einhalb")
    .replace(/¼/g, "ein Viertel")
    .replace(/¾/g, "drei Viertel")
    .replace(/⅓/g, "ein Drittel")
    .replace(/⅔/g, "zwei Drittel")
    // Gendern: Kund/innen, Kund:innen, Kund*innen → Kundinnen
    .replace(/(\p{L})(?:\/-?|:|\*|_)(innen|in)(?![\p{L}])/gu, "$1$2")
    .replace(/(?<![\p{L}])und\/oder(?![\p{L}])/gu, "und oder")
    .replace(/(\p{L})-\/(?=\p{L})/gu, "$1- oder ")
    // zusammengesetzte Einheiten
    .replace(/(?<![\p{L}])km\/h(?![\p{L}])/gu, "Kilometer pro Stunde")
    .replace(/(?<![\p{L}])m\/s(?![\p{L}])/gu, "Meter pro Sekunde")
    .replace(/(?<![\p{L}])([kMG])[bB]it\/s(?![\p{L}])/gu, (m, p) => ({ k: "Kilobit", M: "Megabit", G: "Gigabit" })[p] + " pro Sekunde")
    .replace(/(?<![\p{L}])([KMG])B\/s(?![\p{L}])/gu, (m, p) => ({ K: "Kilobyte", M: "Megabyte", G: "Gigabyte" })[p] + " pro Sekunde")
    .replace(PRO_RE, " pro ")
    // englische Tausender nur bei Dollar/Pfund: $1,000 → $1000
    .replace(/([$£]\s?\d{1,3})((?:,\d{3})+)(?!\d)/g, (m, a, b) => a + b.replace(/,/g, ""));
}

function tausender(s) {
  // 4.200 → 4200, 1.000.000 → 1000000; 192.168.1.1 und 1.2.3 bleiben
  return s.replace(/(?<![\p{L}\p{N}.])(\d{1,3})((?:\.\d{3})+)(?!\.?\d)/gu, (m, a, b) => a + b.replace(/\./g, ""));
}

function iso(s) {
  s = ersetze(
    s,
    /(?<![\p{N}\-])((?:19|20)\d{2})-(\d{2})-(\d{2})(?:[T ]([01]\d|2[0-3]):([0-5]\d)(?::[0-5]\d(?:\.\d+)?)?(?:Z|[+\-]\d{2}:?\d{2})?)?(?![\p{N}\-])/gu,
    (m, [j, mo, d, h, mi]) => {
      const t = datumText(d, mo, j);
      if (!t) return m;
      return h ? `${t} um ${uhrText(h, mi)}` : t;
    },
  );
  // 2026-10 → Oktober 2026
  return s.replace(/(?<![\p{N}\-])((?:19|20)\d{2})-(0[1-9]|1[0-2])(?![\p{N}\-])/gu, (m, j, mo) => `${MONATE[+mo - 1]} ${j}`);
}

function uhrzeit(s) {
  // Dauer: „1:30 h“ → 1 Stunde 30 Minuten, „2:30 min“ → 2 Minuten 30 Sekunden. „13:00h“ ist eine Uhrzeit.
  s = ersetze(s, /(?<![\p{N}.:,])(\d{1,2}):([0-5]\d)\s?(h|Std\.?|Stunden)(?![\p{L}])/gu, (m, [h, mi, einheit], off, str) => {
    if (einheit === "h" && h.length === 2 && +h <= 24) return uhrText(h, mi);
    const punkt = einheit.endsWith(".") && amSatzende(str, off + m.length) ? "." : "";
    return menge(h, "Stunde", "Stunden") + (+mi ? ` ${menge(mi, "Minute", "Minuten")}` : "") + punkt;
  });
  s = ersetze(s, /(?<![\p{N}.:,])(\d{1,2}):([0-5]\d)\s?(min|Min\.?|Minuten)(?![\p{L}])/gu, (m, [mi, se, einheit], off, str) => {
    const punkt = einheit.endsWith(".") && amSatzende(str, off + m.length) ? "." : "";
    return menge(mi, "Minute", "Minuten") + (+se ? ` ${menge(se, "Sekunde", "Sekunden")}` : "") + punkt;
  });
  // 13:00 → 13 Uhr, 8:30 Uhr → 8 Uhr 30, 13:05 → 13 Uhr 5
  s = ersetze(
    s,
    re(`${VERHAELTNIS_DAVOR}(?<![\\p{N}.:,/])([01]?\\d|2[0-4]):([0-5]\\d)(?::([0-5]\\d))?(?![\\p{N}]|:\\d)(?:\\s?Uhr(?![\\p{L}]))?`),
    (m, [h, mi, se]) => (+h === 24 && (+mi || +se) ? m : uhrText(h, mi, se)),
  );
  // Übrige „3:1“, „16:9“ → „3 zu 1“
  s = s.replace(/(?<![\p{N}.:,/])(\d{1,3}):(\d{1,3})(?![\p{N}]|:\d)/gu, "$1 zu $2");
  // 13.30 Uhr / um 9.30 → 13 Uhr 30
  s = ersetze(s, /(?<![\p{N}.,])([01]?\d|2[0-4])\.([0-5]\d)\s?Uhr(?![\p{L}])/gu, (m, [h, mi]) => uhrText(h, mi));
  s = ersetze(s, /(?<=(?<![\p{L}])(?:[uU]m|[gG]egen)\s)([01]?\d|2[0-3])\.([0-5]\d)(?![\p{N}]|[.,]\d)/gu, (m, [h, mi]) => uhrText(h, mi));
  return s;
}

function datum(s) {
  const tag = (k) => TAGE[k];
  const punktWennEnde = (p, str, i) => (p && amSatzende(str, i) ? "." : "");
  // Mo–Fr / Mo.-Fr. / Mo bis Fr → Montag bis Freitag
  s = ersetze(
    s,
    /(?<![\p{L}])(Mo|Di|Mi|Do|Fr|Sa|So)\.?\s?(?:[–—\-]|bis)\s?(Mo|Di|Mi|Do|Fr|Sa|So)(\.?)(?![\p{L}])/gu,
    (m, [a, b, p], off, str) => `${tag(a)} bis ${tag(b)}` + punktWennEnde(p, str, off + m.length),
  );
  // Mo, Di, Mi, Fr sind als Wörter eindeutig; Do, Sa, So nur vor einem Datum oder in Aufzählungen.
  s = ersetze(s, /(?<![\p{L}])(Mo|Di|Mi|Fr)(\.?)(?![\p{L}\p{N}])/gu, (m, [k, p], off, str) => tag(k) + punktWennEnde(p, str, off + m.length));
  const kurz = "(?:Mo|Di|Mi|Do|Fr|Sa|So|" + TAG_NAMEN + ")";
  s = ersetze(
    s,
    re(`(?<![\\p{L}])(Do|Sa|So)(?:\\.(?=\\s?(?:,|und\\s|oder\\s|bis\\s|[–\\-]|\\d))|(?=,?\\s?\\d{1,2}\\.)|(?=\\s(?:und|oder|bis)\\s${kurz}(?![\\p{L}])))`),
    (m, [k]) => tag(k),
  );
  const nachTag = re(`(?<=(?:${TAG_NAMEN})(?:,\\s?|\\s(?:und|oder|bis)\\s))(Do|Sa|So)(\\.?)(?![\\p{L}\\p{N}])`);
  for (let i = 0; i < 2; i++) s = ersetze(s, nachTag, (m, [k, p], off, str) => tag(k) + punktWennEnde(p, str, off + m.length));

  // 19.–21.10.2026 → 19. bis 21. Oktober 2026
  s = ersetze(
    s,
    re(`${KEINE_DATUMSZAHL}(?<![\\p{L}\\p{N}.,])(\\d{1,2})\\.\\s?[–—\\-]\\s?(\\d{1,2})\\.(\\d{1,2})\\.(?:\\s?((?:19|20)\\d{2})(?!\\p{N}))?(?!\\p{N})`),
    (m, [a, b, mo, j], off, str) => {
      const t = datumText(b, mo, j);
      if (!t || !datumText(a, mo)) return m;
      return `${+a}. bis ${t}` + (j ? "" : punktWennEnde(".", str, off + m.length));
    },
  );
  // 19.10.2026 → 19. Oktober 2026
  s = ersetze(
    s,
    re(`${KEINE_DATUMSZAHL}(?<![\\p{L}\\p{N}.,])(\\d{1,2})\\.(\\d{1,2})\\.\\s?((?:1[89]|20)\\d{2})(?![\\p{N}]|\\.\\d)`),
    (m, [d, mo, j]) => datumText(d, mo, j) ?? m,
  );
  // 19.10.26 nur nach „am“, „vom“ … – sonst zu leicht mit Versionsnummern verwechselt
  s = ersetze(s, re(`${DATUM_DAVOR}(\\d{1,2})\\.(\\d{1,2})\\.(\\d{2})(?![\\p{N}]|\\.\\d)`), (m, [d, mo, j]) => datumText(d, mo, j) ?? m);
  // 19.10. → 19. Oktober
  s = ersetze(s, re(`${KEINE_DATUMSZAHL}(?<![\\p{L}\\p{N}.,:/])(\\d{1,2})\\.(\\d{1,2})\\.(?![\\p{L}\\p{N}])`), (m, [d, mo], off, str) => {
    const t = datumText(d, mo);
    return t ? t + punktWennEnde(".", str, off + m.length) : m;
  });
  // am 19.10 → am 19. Oktober
  s = ersetze(s, re(`${DATUM_DAVOR}(\\d{1,2})\\.(\\d{1,2})(?![\\p{N}]|[.,]\\d)`), (m, [d, mo]) => datumText(d, mo) ?? m);
  // 19. Okt. → 19. Oktober, Okt. 2026 → Oktober 2026
  s = ersetze(s, /(?<![\p{N}])(\d{1,2})\.\s?(Jan|Feb|Mär|Mrz|Apr|Jun|Jul|Aug|Sept|Sep|Okt|Nov|Dez)(\.?)(?![\p{L}])/gu, (m, [d, mk, p], off, str) => {
    const t = datumText(d, MONAT_KURZ[mk.toLowerCase()]);
    return t ? t + punktWennEnde(p, str, off + m.length) : m;
  });
  s = s.replace(/(?<![\p{L}])(Jan|Feb|Mär|Mrz|Apr|Jun|Jul|Aug|Sept|Sep|Okt|Nov|Dez)\.\s?(?=(?:19|20)\d{2}(?!\d))/gu, (m, mk) => MONATE[MONAT_KURZ[mk.toLowerCase()] - 1] + " ");
  // Montag 19. Oktober → Montag, 19. Oktober
  return s.replace(re(`(${TAG_NAMEN})\\.?\\s(?=\\d{1,2}\\.\\s(?:${MONAT_NAMEN}))`), "$1, ");
}

function geld(s) {
  s = ersetze(s, GELD_NACH_RE, (m, [a, b, g, w]) => geldText(a, b, g, w) ?? m);
  return ersetze(s, GELD_VOR_RE, (m, [w, a, b, g]) => geldText(a, b, g, w) ?? m);
}

function prozentUndGrad(s) {
  return s
    .replace(/\s?%-?Punkt(e?)(?![\p{L}])/gu, " Prozentpunkt$1")
    .replace(/\s?%-?(ig\p{L}*)/gu, " prozent$1")
    .replace(/(\d)\s?%/g, "$1 Prozent")
    .replace(/(\d)\s?‰/g, "$1 Promille")
    .replace(/(\d)\s?°\s?C(?![\p{L}])/gu, "$1 Grad")
    .replace(/(\d)\s?°\s?F(?![\p{L}])/gu, "$1 Grad Fahrenheit")
    .replace(/(\d)\s?°/g, "$1 Grad")
    .replace(/°\s?C(?![\p{L}])/gu, "Grad");
}

function bereicheUndRechnen(s) {
  // Minus vor Zahlen: „-5 °C“ → „minus 5 Grad“ (nicht bei Bindestrich zwischen Zahlen)
  s = s.replace(/(^|[\s(:;=])-(?=\d)/g, "$1minus ").replace(/−\s?(?=\d)/g, "minus ");
  // 110–130, 2-3 → bis. Telefonnummern (führende 0, Durchwahl, Vorwahl davor) bleiben stehen.
  s = ersetze(
    s,
    /(?<![\p{L}\p{N}.,/:+\-–)])(?<!\d[\s/])(?<!\)\s)(\d{1,5}(?:,\d+)?)(\s?)([–—\-])(\s?)(\d{1,5}(?:,\d+)?)(?![\p{N}]|[.,]\d|\s?[\-–]\s?\d|\s?=)/gu,
    (m, [a, l1, strich, l2, b]) => {
      if (/^0\d/.test(a) || /^0\d/.test(b)) return m;
      const za = parseFloat(a.replace(",", "."));
      const zb = parseFloat(b.replace(",", "."));
      if (!(zb > za)) return m;
      if (strich === "-") {
        const lang = a.length >= 4 && b.length >= 4;
        const jahre = /^(1[89]|20)\d\d$/.test(a) && /^(1[89]|20)\d\d$/.test(b);
        if (lang && !jahre && (za % 100 || zb % 100)) return m; // 1234-5678 eher Telefon
      }
      return `${a} bis ${b}`;
    },
  );
  s = s
    .replace(re(`(Uhr|${MONAT_NAMEN}|Euro|Cent|Dollar|Prozent|Grad|(?<![\\p{N}.])\\d{1,2}\\.)\\s?[–—\\-]\\s?(?=\\d)`), "$1 bis ")
    .replace(/(\d\s?\p{L}{1,12}\.?)[–—](?=\d)/gu, "$1 bis ")
    .replace(/(?<![\p{N}])(\d{1,2}) Uhr bis (\d{1,2}) Uhr(?! \d)/gu, "$1 bis $2 Uhr")
    .replace(re(`(?<![\\p{N}])(\\d{1,2})\\. (${MONAT_NAMEN}) bis (\\d{1,2})\\. \\2`), "$1. bis $3. $2");

  // Rechenzeichen zwischen Zahlen
  return ersetze(s, /(?<![\p{L}\p{N}])(\d+(?:,\d+)?)(\s?)[x×](\s?)(?=\d)/gu, (m, [a, l1, l2]) =>
    a === "0" && !l1 && !l2 ? m : `${a} mal `, // 0x1F ist Hex, kein „mal“
  )
    .replace(/(?<![\p{L}\p{N}])(\d+)\s?[x×](?=\s|[.,;:!?]|$)/gu, "$1 mal")
    .replace(/×/g, " mal ")
    .replace(/(\d)\s?\*\s?(?=\d)/g, "$1 mal ")
    .replace(/(\d)\s?\+\s?(?=\d)/g, "$1 plus ")
    .replace(/(\d)\s?÷\s?(?=\d)/g, "$1 geteilt durch ")
    .replace(/(\d)\s?=\s?(?=(?:minus )?\d)/g, "$1 gleich ")
    .replace(/(^|[\s(])<=\s?(?=\d)/g, "$1höchstens ")
    .replace(/(^|[\s(])>=\s?(?=\d)/g, "$1mindestens ")
    .replace(/(^|[\s(])<\s?(?=\d)/g, "$1unter ")
    .replace(/(^|[\s(])>\s?(?=\d)/g, "$1über ");
}

function einheiten(s) {
  s = ersetze(s, EINHEIT_RE, (m, [zahl, abk], off, str) => {
    const ende = off + m.length;
    if (EINZELBUCHSTABE.has(abk) && str[ende] === "-") return m;
    const e = EINHEIT[abk];
    const wort = zahl === "1" && e[2] ? e[2] : e[1];
    return `${zahl} ${wort}` + (abk.endsWith(".") && amSatzende(str, ende) ? "." : "");
  });
  s = ersetze(s, PRO_EINHEIT_RE, (m, [pro, abk]) => `${pro} ${EINHEIT[abk][2] || EINHEIT[abk][1]}`);
  return ersetze(s, EINHEIT_ALLEIN_RE, (m, [abk], off, str) => EINHEIT[abk][1] + (abk.endsWith(".") && amSatzende(str, off + m.length) ? "." : ""));
}

function abkuerzungen(s) {
  for (const { regex, ersatz, schluss } of ABKUERZUNGEN) {
    s = ersetze(s, regex, (m, g, off, str) => {
      const ende = off + m.length;
      let t = /^\p{Lu}/u.test(m) && /^\p{Ll}/u.test(ersatz) ? ersatz[0].toUpperCase() + ersatz.slice(1) : ersatz;
      if (m.endsWith(".") && (amSatzende(str, ende) || (schluss && /^\s+\p{Lu}/u.test(str.slice(ende))))) t += ".";
      else if (/^[\p{L}\p{N}]/u.test(str.slice(ende))) t += " "; // „Nr.5“ → „Nummer 5“
      return t;
    });
  }
  return s
    .replace(/(?<![\p{L}\p{N}])S\.\s?(?=\d)/gu, "Seite ")
    .replace(/(\p{L})str\.(?=\s?\d)/gu, "$1straße");
}

function schraegstrich(token) {
  const m = /^([("„'“]*)(.*?)([)"“'.,;:!?]*)$/u.exec(token);
  const [, vor, kern, nach] = m;
  if (!kern.includes("/")) return token;
  const teile = kern.split("/");
  if (teile.every((t) => /^[\d.,:+()\-]*$/.test(t))) return token; // 1/2, 030/123456, 19/10/2026
  if (/^[~.]?\//.test(kern) || teile.length > 2) return vor + teile.filter(Boolean).join(" ") + nach; // Pfad
  const [a, b] = teile;
  if (!a || !b) return vor + (a || b) + nach;
  if (/^[A-ZÄÖÜ0-9]{1,5}$/.test(a) && /^[A-ZÄÖÜ0-9]{1,5}$/.test(b)) return `${vor}${a} ${b}${nach}`; // TCP/IP
  if (/\p{L}$/u.test(a) && /^\p{L}/u.test(b)) return `${vor}${a} oder ${b}${nach}`;
  return `${vor}${a} ${b}${nach}`;
}

function restzeichen(s) {
  return s
    .replace(/(\d),[-–](?!\d)/g, "$1")
    .replace(/(\d),(?=\d)/g, "$1 Komma ")
    .replace(/\S+/g, (t) => (t.includes("/") ? schraegstrich(t) : t))
    .replace(/(?<![\p{L}])([CF])#(?![\p{L}\p{N}])/gu, "$1 Sharp")
    .replace(/#\s?(?=\d)/g, "Nummer ")
    .replace(/#/g, "")
    .replace(/\s?&+\s?/g, " und ")
    .replace(/§§\s?/g, "Paragrafen ")
    .replace(/§\s?/g, "Paragraf ")
    .replace(/\s?%/g, " Prozent")
    .replace(/\s?‰/g, " Promille")
    .replace(/€/g, " Euro ")
    .replace(/(?<![\p{L}])EUR(?![\p{L}])/gu, "Euro")
    .replace(/(?<![\p{L}])USD(?![\p{L}])/gu, "Dollar")
    .replace(/\$/g, " Dollar ")
    .replace(/£/g, " Pfund ")
    .replace(/°/g, " Grad ")
    .replace(/²/g, " hoch 2")
    .replace(/³/g, " hoch 3")
    .replace(/\s?[|•·▪◦‣]\s?/g, ", ")
    .replace(/(\p{L})_(?=\p{L})/gu, "$1 ")
    .replace(/[*_~^\\`{}[\]<>]/g, "");
}

function aufraeumen(s) {
  return s
    .replace(/\(\s*\)/g, "")
    .replace(/\s+/g, " ")
    .replace(/ ([,.;:!?])(?=\s|$)/g, "$1")
    .replace(/\( /g, "(")
    .replace(/ \)/g, ")")
    .replace(/([,;:])(?:\s*[,;:])+/g, "$1")
    .replace(/([.!?])(?:\s*[,;])+/g, "$1")
    .replace(/,(\s*[.!?])/g, "$1")
    .replace(/^[\s,;]+/, "")
    .trim();
}

/** Bereitet deutschen Text für die Sprachausgabe auf. Wirft nie; "" bei null/undefined. */
export function sprechbar(text) {
  if (text == null) return "";
  let s;
  try {
    s = typeof text === "string" ? text : String(text);
  } catch {
    return "";
  }
  try {
    s = vorbereiten(s);
    s = markdown(s);
    s = zeichenVorab(s);
    s = tausender(s);
    s = iso(s);
    s = uhrzeit(s);
    s = datum(s);
    s = geld(s);
    s = prozentUndGrad(s);
    s = bereicheUndRechnen(s);
    s = einheiten(s);
    s = abkuerzungen(s);
    s = restzeichen(s);
    return aufraeumen(s);
  } catch {
    // Notbremse: lieber roh vorlesen als gar nicht
    try {
      return s.replace(/[*_#`>|~]/g, "").replace(/\s+/g, " ").trim();
    } catch {
      return "";
    }
  }
}

// ---------- Satzgrenzen für gestreamten Text ----------

const KEIN_SATZENDE = new Set([
  "ca", "bzw", "usw", "etc", "inkl", "exkl", "zzgl", "abzgl", "ggf", "evtl", "bspw", "bzgl", "insb", "vgl", "zzt",
  "mind", "max", "min", "nr", "tel", "str", "dr", "prof", "hr", "hrn", "abs", "kap", "jh", "bsp", "anm", "allg",
  "ehem", "gem", "lt", "ugs", "geb", "gr", "std", "sek", "stk", "pkt", "mio", "mrd", "tsd", "mwst", "ust", "vs", "ct",
  "jan", "feb", "mär", "mrz", "apr", "jun", "jul", "aug", "sep", "sept", "okt", "nov", "dez",
]);

function echtesSatzende(text, i) {
  const wort = (/(\S+)$/.exec(text.slice(0, i))?.[1] || "").replace(/^[(„"'“]+/, "");
  if (!wort) return true;
  if (/^[\d.,:/\-]+$/.test(wort)) return false; // 3. Platz, 19.10., 1.2.
  if (/^\p{L}$/u.test(wort)) return false; // z. B., d. h.
  if (/^\p{L}(?:\.\p{L})+$/u.test(wort)) return false; // z.B, u.a
  if (TAGE[wort]) return false; // Mo. 19.10.
  return !KEIN_SATZENDE.has(wort.toLowerCase());
}

/** Index hinter dem ersten vollständigen Satz (inkl. Satzzeichen) oder -1, wenn noch keiner fertig ist. */
export function satzEnde(text) {
  if (typeof text !== "string" || !text) return -1;
  const grenze = /[.!?…]+(?=\s)|\n[ \t]*\n/g;
  let m;
  while ((m = grenze.exec(text))) {
    if (m[0] === "." && !echtesSatzende(text, m.index)) continue;
    return m.index + m[0].length;
  }
  return -1;
}

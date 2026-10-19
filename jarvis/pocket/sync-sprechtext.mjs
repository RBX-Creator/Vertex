// Kopiert server/src/sprechtext.js in die Pocket-Seite (zwischen SPRECHTEXT-START und -ENDE),
// damit Server und Pocket gleich vorlesen. Aufruf: node pocket/sync-sprechtext.mjs
import fs from "node:fs";

const quelle = new URL("../server/src/sprechtext.js", import.meta.url);
const ziel = new URL("./jarvis-pocket.html", import.meta.url);

const modul = fs
  .readFileSync(quelle, "utf8")
  .replace(/^export /gm, "")
  .trimEnd()
  .split("\n")
  .map((z) => (z ? "    " + z : z))
  .join("\n");
const block =
  "/* SPRECHTEXT-START – erzeugt aus server/src/sprechtext.js (node pocket/sync-sprechtext.mjs), hier nicht bearbeiten */\n" +
  "  const { sprechbar, satzEnde } = (() => {\n" +
  modul +
  "\n    return { sprechbar, satzEnde };\n  })();\n  /* SPRECHTEXT-ENDE */";

const html = fs.readFileSync(ziel, "utf8");
const neu = html.replace(/\/\* SPRECHTEXT-START[\s\S]*?\/\* SPRECHTEXT-ENDE \*\//, () => block);
if (neu === html && !html.includes(block)) throw new Error("SPRECHTEXT-Marken nicht gefunden");
fs.writeFileSync(ziel, neu);
console.log("Pocket: Sprechtext aktualisiert.");

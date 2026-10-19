// Korrektur-Schicht für die Spracherkennung: rückt typische Hörfehler gerade, BEVOR das Modell
// den Satz sieht („Wiels“ → „Reels“). Die Wörter liegen als Daten im Gedächtnis:
//   /memories/team/woerterbuch.md  (für alle)   und   /memories/ich/woerterbuch.md  (persönlich)
// Zeilenformat: `Richtig: falsch, falsch, …` – Jarvis ergänzt die Listen selbst, wenn er korrigiert wird.
import fs from "node:fs/promises";
import path from "node:path";
import { TEAM_DIR, userDir } from "./paths.js";

const cache = new Map(); // file → { mtimeMs, entries }

function parse(text) {
  const entries = [];
  for (let line of text.split("\n")) {
    line = line.replace(/^\s*[-*]\s*(\(\d{4}-\d{2}-\d{2}[^)]*\)\s*)?/, "").trim(); // auch „- (2026-10-19) …“
    if (!line || line.startsWith("#") || line.startsWith(">")) continue;
    const m = line.match(/^([^:]{1,60}):\s*(.+)$/);
    if (!m) continue;
    const richtig = m[1].trim();
    const falsch = m[2].split(",").map((s) => s.trim()).filter((s) => s && s.toLowerCase() !== richtig.toLowerCase());
    if (falsch.length) entries.push({ richtig, falsch });
  }
  return entries;
}

async function loadFile(file) {
  try {
    const { mtimeMs } = await fs.stat(file);
    const hit = cache.get(file);
    if (hit?.mtimeMs === mtimeMs) return hit.entries;
    const entries = parse(await fs.readFile(file, "utf8"));
    cache.set(file, { mtimeMs, entries });
    return entries;
  } catch {
    return [];
  }
}

/** Alle Einträge – persönliche zuerst, damit sie Team-Einträge übersteuern. */
export async function eintraege(userId) {
  return [
    ...(await loadFile(path.join(userDir(userId), "ich", "woerterbuch.md"))),
    ...(await loadFile(path.join(TEAM_DIR, "woerterbuch.md"))),
  ];
}

const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");

/** Korrigiert einen erkannten Satz. Gibt {text, changes:[{von, zu}]} zurück. */
export function korrigiere(text, entries) {
  // Längste Varianten zuerst, damit „Stock X“ vor „Stock“ greift.
  const pairs = entries.flatMap((e) => e.falsch.map((f) => ({ f, r: e.richtig }))).sort((a, b) => b.f.length - a.f.length);
  const changes = [];
  let out = text;
  for (const { f, r } of pairs) {
    const re = new RegExp(`(?<![\\p{L}\\p{N}])${escape(f)}(?![\\p{L}\\p{N}])`, "giu");
    out = out.replace(re, (hit) => {
      if (hit === r) return hit;
      changes.push({ von: hit, zu: r });
      return r;
    });
  }
  return { text: out, changes };
}

export async function korrigiereFuer(userId, text) {
  return korrigiere(text, await eintraege(userId));
}

/** Begriffe, die Deepgram vorab kennen soll (keyterm), höchstens 50. */
export async function schluesselwoerter(userId) {
  return [...new Set((await eintraege(userId)).map((e) => e.richtig))].slice(0, 50);
}

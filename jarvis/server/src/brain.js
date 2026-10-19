// Das Gehirn: pro Nutzer ein persönliches Gedächtnis, dazu ein geteiltes Team-Gedächtnis.
// Claude greift über das Memory-Tool darauf zu – alle Pfade beginnen mit /memories:
//   /memories/ich/...   → data/users/<id>/ich/...
//   /memories/team/...  → data/team/...
import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { TEMPLATE_DIR, TEAM_DIR, userDir } from "./paths.js";

const MAX_FILE_BYTES = 200_000;
const ALLOWED_EXT = new Set([".md", ".txt"]);

export async function ensureTeamBrain() {
  if (!existsSync(TEAM_DIR)) {
    await fs.cp(path.join(TEMPLATE_DIR, "team"), TEAM_DIR, { recursive: true });
  }
}

export async function ensureUserBrain(userId) {
  const dir = path.join(userDir(userId), "ich");
  if (!existsSync(dir)) {
    await fs.cp(path.join(TEMPLATE_DIR, "ich"), dir, { recursive: true });
  }
}

class MemoryError extends Error {}

// Übersetzt einen /memories-Pfad in einen echten Pfad und verhindert Ausbrüche (.., Symlinks).
function resolveMemoryPath(userId, memPath) {
  if (typeof memPath !== "string" || !memPath.startsWith("/memories")) {
    throw new MemoryError(`Pfad muss mit /memories beginnen: ${memPath}`);
  }
  const rel = path.posix.normalize(memPath).replace(/^\/memories\/?/, "").replace(/\/$/, "");
  if (rel === "" || rel === ".") return { root: true };
  const [area, ...rest] = rel.split("/");
  const base =
    area === "ich" ? path.join(userDir(userId), "ich") : area === "team" ? TEAM_DIR : null;
  if (!base) throw new MemoryError("Es gibt nur /memories/ich und /memories/team.");
  const target = path.resolve(base, ...rest);
  const relative = path.relative(base, target);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new MemoryError("Pfad verlässt den Gedächtnisbereich.");
  }
  return { base, target, area, isAreaRoot: rest.length === 0 };
}

async function assertInside(base, target) {
  // Gegen Symlinks: den echten Pfad des nächsten existierenden Elternordners prüfen.
  let probe = target;
  while (!existsSync(probe)) probe = path.dirname(probe);
  const real = await fs.realpath(probe);
  const realBase = await fs.realpath(base);
  if (real !== realBase && !real.startsWith(realBase + path.sep)) {
    throw new MemoryError("Pfad verlässt den Gedächtnisbereich.");
  }
}

function assertWritableFile(target) {
  if (!ALLOWED_EXT.has(path.extname(target))) {
    throw new MemoryError("Nur .md- und .txt-Dateien sind erlaubt.");
  }
}

async function listTree(dir, prefix, depth = 0) {
  const lines = [];
  const entries = (await fs.readdir(dir, { withFileTypes: true })).sort((a, b) =>
    a.name.localeCompare(b.name),
  );
  for (const e of entries) {
    if (e.name.startsWith(".")) continue;
    const p = `${prefix}/${e.name}`;
    if (e.isDirectory()) {
      lines.push(`${"  ".repeat(depth)}${p}/`);
      if (depth < 3) lines.push(...(await listTree(path.join(dir, e.name), p, depth + 1)));
    } else {
      const { size } = await fs.stat(path.join(dir, e.name));
      lines.push(`${"  ".repeat(depth)}${p} (${size} B)`);
    }
  }
  return lines;
}

const withLineNumbers = (text, start = 1) =>
  text
    .split("\n")
    .map((l, i) => `${String(i + start).padStart(4)}\t${l}`)
    .join("\n");

// Führt einen Memory-Tool-Befehl aus. Gibt immer einen String zurück; Fehler werfen MemoryError.
export async function runMemoryCommand(userId, input) {
  const cmd = input?.command;
  switch (cmd) {
    case "view": {
      const r = resolveMemoryPath(userId, input.path);
      if (r.root) {
        return [
          "/memories/",
          ...(await listTree(path.join(userDir(userId), "ich"), "/memories/ich", 1)).map((l) => l),
          ...(await listTree(TEAM_DIR, "/memories/team", 1)),
        ].join("\n");
      }
      await assertInside(r.base, r.target);
      if (!existsSync(r.target)) throw new MemoryError(`Nicht gefunden: ${input.path}`);
      const stat = await fs.stat(r.target);
      if (stat.isDirectory()) return [`${input.path}/`, ...(await listTree(r.target, input.path))].join("\n");
      const text = await fs.readFile(r.target, "utf8");
      if (Array.isArray(input.view_range) && input.view_range.length === 2) {
        const [from, to] = input.view_range;
        const lines = text.split("\n");
        const end = to === -1 ? lines.length : to;
        return withLineNumbers(lines.slice(from - 1, end).join("\n"), from);
      }
      return withLineNumbers(text);
    }
    case "create": {
      const r = resolveMemoryPath(userId, input.path);
      if (r.root || r.isAreaRoot) throw new MemoryError("Bitte einen Dateipfad angeben.");
      if (typeof input.file_text !== "string") throw new MemoryError("file_text fehlt.");
      if (Buffer.byteLength(input.file_text) > MAX_FILE_BYTES) throw new MemoryError("Datei zu groß.");
      assertWritableFile(r.target);
      await assertInside(r.base, r.target);
      await fs.mkdir(path.dirname(r.target), { recursive: true });
      await fs.writeFile(r.target, input.file_text, "utf8");
      return `Datei gespeichert: ${input.path}`;
    }
    case "str_replace": {
      const r = resolveMemoryPath(userId, input.path);
      if (r.root) throw new MemoryError("Bitte einen Dateipfad angeben.");
      if (typeof input.old_str !== "string" || typeof input.new_str !== "string") {
        throw new MemoryError("old_str und new_str sind Pflicht.");
      }
      await assertInside(r.base, r.target);
      if (!existsSync(r.target)) throw new MemoryError(`Nicht gefunden: ${input.path}`);
      const text = await fs.readFile(r.target, "utf8");
      const count = text.split(input.old_str).length - 1;
      if (count === 0) throw new MemoryError("old_str kommt in der Datei nicht vor.");
      if (count > 1) throw new MemoryError(`old_str kommt ${count}-mal vor – bitte eindeutiger wählen.`);
      await fs.writeFile(r.target, text.replace(input.old_str, () => input.new_str), "utf8");
      return `Datei aktualisiert: ${input.path}`;
    }
    case "insert": {
      const r = resolveMemoryPath(userId, input.path);
      if (r.root) throw new MemoryError("Bitte einen Dateipfad angeben.");
      if (typeof input.insert_text !== "string" || !Number.isInteger(input.insert_line)) {
        throw new MemoryError("insert_line und insert_text sind Pflicht.");
      }
      await assertInside(r.base, r.target);
      if (!existsSync(r.target)) throw new MemoryError(`Nicht gefunden: ${input.path}`);
      const lines = (await fs.readFile(r.target, "utf8")).split("\n");
      if (input.insert_line < 0 || input.insert_line > lines.length) {
        throw new MemoryError(`insert_line muss zwischen 0 und ${lines.length} liegen.`);
      }
      lines.splice(input.insert_line, 0, ...input.insert_text.replace(/\n$/, "").split("\n"));
      await fs.writeFile(r.target, lines.join("\n"), "utf8");
      return `Text eingefügt in ${input.path}`;
    }
    case "delete": {
      const r = resolveMemoryPath(userId, input.path);
      if (r.root || r.isAreaRoot) throw new MemoryError("Bereichswurzeln können nicht gelöscht werden.");
      await assertInside(r.base, r.target);
      if (!existsSync(r.target)) throw new MemoryError(`Nicht gefunden: ${input.path}`);
      await fs.rm(r.target, { recursive: true });
      return `Gelöscht: ${input.path}`;
    }
    case "rename": {
      const from = resolveMemoryPath(userId, input.old_path);
      const to = resolveMemoryPath(userId, input.new_path);
      if (from.root || to.root || from.isAreaRoot || to.isAreaRoot) {
        throw new MemoryError("Bereichswurzeln können nicht umbenannt werden.");
      }
      await assertInside(from.base, from.target);
      await assertInside(to.base, to.target);
      if (!existsSync(from.target)) throw new MemoryError(`Nicht gefunden: ${input.old_path}`);
      if (existsSync(to.target)) throw new MemoryError(`Existiert bereits: ${input.new_path}`);
      if ((await fs.stat(from.target)).isFile()) assertWritableFile(to.target);
      await fs.mkdir(path.dirname(to.target), { recursive: true });
      await fs.rename(from.target, to.target);
      return `Umbenannt: ${input.old_path} → ${input.new_path}`;
    }
    default:
      throw new MemoryError(`Unbekannter Befehl: ${cmd}`);
  }
}

export { MemoryError };

async function readOr(file, fallback = "") {
  try {
    return await fs.readFile(file, "utf8");
  } catch {
    return fallback;
  }
}

const stripComments = (s) => s.replace(/<!--[\s\S]*?-->/g, "").replace(/[ \t]+$/gm, "");

// Kurzüberblick, der bei jeder Anfrage mitgeschickt wird.
export async function brainSnapshot(userId) {
  const ich = path.join(userDir(userId), "ich");
  const parts = [
    ["/memories/ich/jetzt.md", path.join(ich, "jetzt.md")],
    ["/memories/ich/profil/ueber-mich.md", path.join(ich, "profil", "ueber-mich.md")],
    ["/memories/team/business/ueberblick.md", path.join(TEAM_DIR, "business", "ueberblick.md")],
  ];
  let out = "";
  for (const [label, file] of parts) {
    out += `\n## ${label}\n${stripComments(await readOr(file, "(leer)")).trim()}\n`;
  }
  const tree = [
    ...(await listTree(ich, "/memories/ich")),
    ...(await listTree(TEAM_DIR, "/memories/team")),
  ];
  out += `\n## Alle Dateien im Gedächtnis\n${tree.join("\n")}\n`;
  return out;
}

export async function countOpenPlaceholders(userId) {
  let n = 0;
  async function walk(dir) {
    for (const e of await fs.readdir(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) await walk(p);
      else n += ((await readOr(p)).match(/\[OFFEN\]/g) || []).length;
    }
  }
  await walk(path.join(userDir(userId), "ich"));
  await walk(TEAM_DIR);
  return n;
}

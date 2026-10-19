// Profile: jedes Teammitglied legt sich ein eigenes Profil an (Name + Passwort).
// Gespeichert in data/users.json – Passwörter nur als scrypt-Hash.
import crypto from "node:crypto";
import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { DATA_DIR, userDir } from "./paths.js";
import { ensureUserBrain } from "./brain.js";

const USERS_FILE = path.join(DATA_DIR, "users.json");
const SECRET_FILE = path.join(DATA_DIR, ".secret");
const TOKEN_DAYS = 30;

export const ANREDEN = ["Master", "Chef", "Boss"];

export const DEFAULT_SETTINGS = {
  anrede: "Master",
  sprachausgabe: true,
  stimme: "",
  autoBriefing: true,
  gespraechsmodus: false,
};

let secret;
let users = [];
let writeQueue = Promise.resolve();

export async function initUsers() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  if (process.env.JARVIS_SECRET) {
    secret = process.env.JARVIS_SECRET;
  } else if (existsSync(SECRET_FILE)) {
    secret = (await fs.readFile(SECRET_FILE, "utf8")).trim();
  } else {
    secret = crypto.randomBytes(32).toString("hex");
    await fs.writeFile(SECRET_FILE, secret, { mode: 0o600 });
  }
  if (existsSync(USERS_FILE)) users = JSON.parse(await fs.readFile(USERS_FILE, "utf8"));
}

function save() {
  const snapshot = JSON.stringify(users, null, 2);
  writeQueue = writeQueue.then(async () => {
    const tmp = `${USERS_FILE}.tmp`;
    await fs.writeFile(tmp, snapshot, { mode: 0o600 });
    await fs.rename(tmp, USERS_FILE);
  });
  return writeQueue;
}

const hashPassword = (password, salt) =>
  new Promise((resolve, reject) =>
    crypto.scrypt(password, salt, 64, (err, key) => (err ? reject(err) : resolve(key.toString("hex")))),
  );

export const teamCodeRequired = () => Boolean(process.env.JARVIS_TEAM_CODE);

export class UserError extends Error {}

export async function register({ name, password, teamCode, anrede }) {
  name = String(name || "").trim();
  if (name.length < 2 || name.length > 40) throw new UserError("Der Name muss 2–40 Zeichen lang sein.");
  if (String(password || "").length < 6) throw new UserError("Das Passwort braucht mindestens 6 Zeichen.");
  if (teamCodeRequired()) {
    const a = Buffer.from(String(teamCode || ""));
    const b = Buffer.from(process.env.JARVIS_TEAM_CODE);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) throw new UserError("Team-Code ist falsch.");
  }
  if (users.some((u) => u.name.toLowerCase() === name.toLowerCase())) {
    throw new UserError("Diesen Namen gibt es schon im Team.");
  }
  const salt = crypto.randomBytes(16).toString("hex");
  const user = {
    id: crypto.randomUUID(),
    name,
    salt,
    hash: await hashPassword(password, salt),
    createdAt: new Date().toISOString(),
    settings: { ...DEFAULT_SETTINGS, anrede: ANREDEN.includes(anrede) ? anrede : "Master" },
  };
  users.push(user);
  await save();
  await fs.mkdir(userDir(user.id), { recursive: true });
  await ensureUserBrain(user.id);
  return user;
}

export async function login({ name, password }) {
  const user = users.find((u) => u.name.toLowerCase() === String(name || "").trim().toLowerCase());
  // Auch bei unbekanntem Namen hashen, damit die Antwortzeit nichts verrät.
  const hash = await hashPassword(String(password || ""), user?.salt || "x".repeat(32));
  if (!user || !crypto.timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(user.hash, "hex"))) {
    throw new UserError("Name oder Passwort falsch.");
  }
  return user;
}

export const getUser = (id) => users.find((u) => u.id === id);
export const allUserIds = () => users.map((u) => u.id);
export const teamNames = () => users.map((u) => u.name);

export async function updateSettings(id, patch) {
  const user = getUser(id);
  if (!user) throw new UserError("Unbekanntes Profil.");
  const s = { ...user.settings };
  if ("anrede" in patch) {
    const a = String(patch.anrede || "").trim().slice(0, 30);
    if (a) s.anrede = a;
  }
  for (const key of ["sprachausgabe", "autoBriefing", "gespraechsmodus"]) {
    if (key in patch) s[key] = Boolean(patch[key]);
  }
  if ("stimme" in patch) s.stimme = String(patch.stimme || "").slice(0, 200);
  user.settings = s;
  await save();
  return s;
}

const sign = (payload) => crypto.createHmac("sha256", secret).update(payload).digest("base64url");

export function createToken(userId) {
  const payload = `${userId}.${Date.now() + TOKEN_DAYS * 86_400_000}`;
  return `${payload}.${sign(payload)}`;
}

export function verifyToken(token) {
  if (typeof token !== "string") return null;
  const i = token.lastIndexOf(".");
  if (i < 0) return null;
  const payload = token.slice(0, i);
  const sig = Buffer.from(token.slice(i + 1));
  const expected = Buffer.from(sign(payload));
  if (sig.length !== expected.length || !crypto.timingSafeEqual(sig, expected)) return null;
  const [id, exp] = payload.split(".");
  if (Number(exp) < Date.now()) return null;
  return getUser(id) || null;
}

export const publicUser = (u) => ({ id: u.id, name: u.name, settings: u.settings });

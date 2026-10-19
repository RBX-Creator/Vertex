import { ENV_FILE, UI_DIR, userDir } from "./paths.js";
import fs from "node:fs/promises";
import path from "node:path";

try {
  process.loadEnvFile(ENV_FILE);
} catch {
  // keine config/.env – Umgebungsvariablen kommen dann vom System (z. B. Docker)
}

const express = (await import("express")).default;
const users = await import("./users.js");
const brain = await import("./brain.js");
const jarvis = await import("./jarvis.js");

await users.initUsers();
await brain.ensureTeamBrain();

const app = express();
app.set("trust proxy", 1);
app.use(express.json({ limit: "300kb" }));

// ---------- Anmeldung ----------

const COOKIE = "jarvis_token";

function readToken(req) {
  const auth = req.get("authorization");
  if (auth?.startsWith("Bearer ")) return auth.slice(7);
  const cookie = req.get("cookie") || "";
  const m = cookie.match(new RegExp(`(?:^|;\\s*)${COOKIE}=([^;]+)`));
  return m ? decodeURIComponent(m[1]) : null;
}

function setSession(req, res, user) {
  const token = users.createToken(user.id);
  res.cookie(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: req.secure,
    maxAge: 30 * 86_400_000,
  });
  return token;
}

function requireUser(req, res, next) {
  const user = users.verifyToken(readToken(req));
  if (!user) return res.status(401).json({ error: "Nicht angemeldet." });
  req.user = user;
  next();
}

const handle = (fn) => async (req, res) => {
  try {
    await fn(req, res);
  } catch (err) {
    if (err instanceof users.UserError || err instanceof brain.MemoryError) {
      return res.status(400).json({ error: err.message });
    }
    console.error(err);
    res.status(500).json({ error: "Interner Fehler." });
  }
};

app.get("/api/config", (req, res) =>
  res.json({ teamCodeRequired: users.teamCodeRequired(), demo: jarvis.DEMO, anreden: users.ANREDEN }),
);

app.post(
  "/api/register",
  handle(async (req, res) => {
    const user = await users.register(req.body || {});
    const token = setSession(req, res, user);
    res.json({ user: users.publicUser(user), token });
  }),
);

app.post(
  "/api/login",
  handle(async (req, res) => {
    const user = await users.login(req.body || {});
    const token = setSession(req, res, user);
    res.json({ user: users.publicUser(user), token });
  }),
);

app.post("/api/logout", (req, res) => {
  res.clearCookie(COOKIE);
  res.json({ ok: true });
});

app.get("/api/me", requireUser, (req, res) => res.json({ user: users.publicUser(req.user) }));

app.patch(
  "/api/settings",
  requireUser,
  handle(async (req, res) => res.json({ settings: await users.updateSettings(req.user.id, req.body || {}) })),
);

// ---------- Gedächtnis ansehen / bearbeiten (für die Oberfläche) ----------

app.get(
  "/api/memory",
  requireUser,
  handle(async (req, res) => {
    const p = String(req.query.path || "/memories");
    let result = await brain.runMemoryCommand(req.user.id, { command: "view", path: p });
    // raw=1: Dateiinhalt ohne Zeilennummern (zum Bearbeiten in der Oberfläche)
    if (req.query.raw === "1" && /\.(md|txt)$/.test(p)) result = result.replace(/^ *\d+\t/gm, "");
    res.json({ path: p, result });
  }),
);

app.put(
  "/api/memory",
  requireUser,
  handle(async (req, res) => {
    const { path: p, content } = req.body || {};
    await brain.runMemoryCommand(req.user.id, { command: "create", path: p, file_text: content });
    res.json({ ok: true });
  }),
);

app.get(
  "/api/verlauf",
  requireUser,
  handle(async (req, res) => res.json({ verlauf: (await jarvis.loadHistory(req.user.id)).filter((m) => !m.hidden) })),
);

app.delete(
  "/api/verlauf",
  requireUser,
  handle(async (req, res) => {
    await jarvis.clearHistory(req.user.id);
    res.json({ ok: true });
  }),
);

// ---------- Gespräch (Server-Sent Events) ----------

const busy = new Set();

async function streamTurn(req, res, text, opts) {
  if (busy.has(req.user.id)) return res.status(409).json({ error: "Ich antworte noch, Moment." });
  busy.add(req.user.id);
  res.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  const emit = (ev) => res.write(`data: ${JSON.stringify(ev)}\n\n`);
  try {
    await jarvis.runTurn(req.user, text, { ...opts, emit });
  } finally {
    busy.delete(req.user.id);
    emit({ type: "done" });
    res.end();
  }
}

app.post(
  "/api/chat",
  requireUser,
  handle(async (req, res) => {
    const text = String(req.body?.text || "").trim().slice(0, 8000);
    if (!text) return res.status(400).json({ error: "Leere Nachricht." });
    await streamTurn(req, res, text, { voice: Boolean(req.body?.voice) });
  }),
);

// Beim Öffnen der App: einmal pro Tag automatisch ein Briefing.
app.post(
  "/api/open",
  requireUser,
  handle(async (req, res) => {
    const stateFile = path.join(userDir(req.user.id), "status.json");
    let state = {};
    try {
      state = JSON.parse(await fs.readFile(stateFile, "utf8"));
    } catch {}
    const day = jarvis.today();
    const firstToday = state.letzterBesuch !== day;
    state.letzterBesuch = day;
    await fs.writeFile(stateFile, JSON.stringify(state), "utf8");
    if (!firstToday || !req.user.settings.autoBriefing) return res.status(204).end();
    const neu = !state.ersterBesuch;
    if (neu) {
      state.ersterBesuch = day;
      await fs.writeFile(stateFile, JSON.stringify(state), "utf8");
    }
    const hinweis = neu
      ? "[System: Der Nutzer hat die App zum allerersten Mal geöffnet. Stell dich in zwei, drei Sätzen vor – im Jarvis-Stil – und stell genau eine Frage, mit der du ihn kennenlernst.]"
      : "[System: Der Nutzer hat die App heute zum ersten Mal geöffnet. Gib das Briefing.]";
    await streamTurn(req, res, hinweis, { voice: Boolean(req.body?.voice), hidden: true });
  }),
);

app.get("/api/health", (req, res) => res.json({ ok: true }));

app.use(express.static(UI_DIR, { extensions: ["html"] }));

const port = Number(process.env.PORT || 3000);
app.listen(port, () => {
  console.log(`Jarvis läuft auf http://localhost:${port}${jarvis.DEMO ? "  (Demo-Modus – kein API-Schlüssel)" : ""}`);
});

import { ENV_FILE, UI_DIR } from "./paths.js";

try {
  process.loadEnvFile(ENV_FILE);
} catch {
  // keine config/.env – Umgebungsvariablen kommen dann vom System (z. B. Docker)
}

const express = (await import("express")).default;
const users = await import("./users.js");
const brain = await import("./brain.js");
const jarvis = await import("./jarvis.js");
const voice = await import("./voice.js");
const worker = await import("./worker.js");
const verbindungen = await import("./verbindungen.js");
const { userDir } = await import("./paths.js");
const path = (await import("node:path")).default;

await users.initUsers();
await brain.ensureTeamBrain();
await worker.recoverJobs(users.allUserIds());
for (const id of users.allUserIds()) await brain.ensureUserBrain(id);

const app = express();
app.set("trust proxy", 1);
app.use(express.json({ limit: "6mb" })); // Fotos aus der Kamera

// ---------- Anmeldung ----------

const COOKIE = "jarvis_token";

function readToken(req) {
  // req.headers statt req.get(): wird auch beim WebSocket-Upgrade (rohe Node-Anfrage) genutzt
  const auth = req.headers.authorization;
  if (auth?.startsWith("Bearer ")) return auth.slice(7);
  const cookie = req.headers.cookie || "";
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
    if (err instanceof users.UserError || err instanceof brain.MemoryError || err instanceof verbindungen.VerbindungsFehler) {
      return res.status(400).json({ error: err.message });
    }
    console.error(err);
    res.status(500).json({ error: "Interner Fehler." });
  }
};

app.get("/api/config", (req, res) =>
  res.json({
    teamCodeRequired: users.teamCodeRequired(),
    demo: jarvis.DEMO,
    gehirn: jarvis.brainMode(),
    stt: voice.sttEnabled() ? "deepgram" : "browser",
    tts: voice.ttsEnabled() ? "elevenlabs" : "browser",
    anreden: users.ANREDEN,
  }),
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
  handle(async (req, res) => {
    const verlauf = [];
    for (const m of await jarvis.loadHistory(req.user.id)) {
      if (m.job) verlauf.push({ role: "job", id: m.job.id, bild: m.job.bild, titel: m.job.titel, status: m.job.status, content: m.job.ergebnis });
      else if (!m.hidden) verlauf.push({ role: m.role, content: m.content });
    }
    res.json({ verlauf });
  }),
);

// ---------- Verbindungen (Kalender, Postfach) ----------

app.get(
  "/api/verbindungen",
  requireUser,
  handle(async (req, res) => res.json(await verbindungen.publicView(req.user.id))),
);

app.put(
  "/api/verbindungen",
  requireUser,
  handle(async (req, res) => res.json(await verbindungen.update(req.user.id, req.body || {}))),
);

app.post(
  "/api/verbindungen/test",
  requireUser,
  handle(async (req, res) => res.json(await verbindungen.testen(req.user.id))),
);

// Bildschirmfoto, das der Arbeitsmodus für den Nutzer gemacht hat
app.get(
  "/api/bild/:jobId",
  requireUser,
  handle(async (req, res) => {
    if (!/^[a-f0-9-]{1,40}$/.test(req.params.jobId)) return res.status(404).end();
    res.sendFile(path.join(userDir(req.user.id), "bilder", `${req.params.jobId}.jpg`), (err) => err && res.status(404).end());
  }),
);

app.get(
  "/api/auftraege",
  requireUser,
  handle(async (req, res) => res.json({ auftraege: await worker.listJobs(req.user.id) })),
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
    const image = parseImage(req.body?.image);
    const text = String(req.body?.text || "").trim().slice(0, 8000) || (image ? "[Foto ohne Kommentar]" : "");
    if (!text) return res.status(400).json({ error: "Leere Nachricht." });
    await streamTurn(req, res, text, { voice: Boolean(req.body?.voice), image });
  }),
);

function parseImage(img) {
  if (!img || typeof img.data !== "string") return undefined;
  if (!/^image\/(jpeg|png|webp)$/.test(img.mime)) return undefined;
  if (img.data.length > 5_500_000) return undefined;
  return { mime: img.mime, data: img.data };
}

// Beim Öffnen der App (ohne Sprach-Verbindung): Begrüßung bzw. einmal pro Tag Briefing.
app.post(
  "/api/open",
  requireUser,
  handle(async (req, res) => {
    const hint = await jarvis.openHint(req.user);
    if (!hint) return res.status(204).end();
    await streamTurn(req, res, hint, { voice: Boolean(req.body?.voice), hidden: true });
  }),
);

app.get("/api/health", (req, res) => res.json({ ok: true }));

app.use(express.static(UI_DIR, { extensions: ["html"] }));

const port = Number(process.env.PORT || 3000);
const server = app.listen(port, () => {
  console.log(`Jarvis läuft auf http://localhost:${port}`);
  console.log(
    `  Gehirn: ${jarvis.brainMode()}${jarvis.brainMode() === "gemini" && !worker.workerEnabled() ? " (ohne Claude-Arbeitsmodus)" : ""}` +
      ` · Hören: ${voice.sttEnabled() ? "Deepgram" : "Browser"} · Sprechen: ${voice.ttsEnabled() ? "ElevenLabs" : "Browser"}`,
  );
});

// Sprach-Verbindung: Anmeldung über dasselbe Cookie (oder ?token= für eigene Apps)
voice.attachVoice(server, (req, url) => users.verifyToken(url.searchParams.get("token") || readToken(req)));

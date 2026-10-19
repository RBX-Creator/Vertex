// Sprach-Hub: eine WebSocket-Verbindung pro Gerät.
//   Mikrofon (PCM 16 kHz) → Deepgram (hört, live) → Gehirn (Gemini/Claude) → ElevenLabs (spricht) → Lautsprecher
// Ohne Deepgram-/ElevenLabs-Schlüssel nutzt die App die Browser-Sprache; der Hub liefert dann nur Text.
import { WebSocketServer, WebSocket } from "ws";
import * as jarvis from "./jarvis.js";
import * as worker from "./worker.js";
import * as woerterbuch from "./woerterbuch.js";

const DG_URL = process.env.DEEPGRAM_URL || "wss://api.deepgram.com/v1/listen";
const DG_MODEL = process.env.DEEPGRAM_MODEL || "nova-3";
const DG_LANGUAGE = process.env.DEEPGRAM_LANGUAGE || "de";
const EL_URL = process.env.ELEVENLABS_URL || "https://api.elevenlabs.io";
const EL_MODEL = process.env.ELEVENLABS_MODEL || "eleven_flash_v2_5";
// Standard: „George“ – warm, britisch, ruhig. Eigene Stimme über ELEVENLABS_VOICE_ID.
const EL_VOICE = process.env.ELEVENLABS_VOICE_ID || "JBFqnCBsd6RMkjVDRZzb";

export const sttEnabled = () => Boolean(process.env.DEEPGRAM_API_KEY);
export const ttsEnabled = () => Boolean(process.env.ELEVENLABS_API_KEY);

const connections = new Map(); // userId → Set<Connection>

export function attachVoice(server, authenticate) {
  const wss = new WebSocketServer({ noServer: true, maxPayload: 6 << 20 }); // Fotos bis ~4 MB

  server.on("upgrade", (req, socket, head) => {
    let user = null;
    try {
      const url = new URL(req.url, "http://x");
      if (url.pathname !== "/api/voice") return socket.destroy();
      user = authenticate(req, url);
    } catch (err) {
      console.error("[voice] upgrade", err);
    }
    if (!user) {
      socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
      return socket.destroy();
    }
    wss.handleUpgrade(req, socket, head, (ws) => new Connection(ws, user));
  });

  worker.onJobDone((userId, job) => {
    const conns = [...(connections.get(userId) || [])];
    if (conns.length === 0) return; // wird beim nächsten Öffnen gemeldet
    for (const c of conns) c.send({ type: "job_done", job });
    worker.markReported(userId, job.id);
    conns[0].queueHidden(jarvis.jobDoneHint(job), {
      job: {
        id: job.id,
        titel: job.titel,
        ergebnis: job.ergebnis,
        status: job.status,
        ...(job.bild ? { bild: true } : {}),
        ...(job.pruefung ? { pruefung: job.pruefung } : {}),
      },
    });
  });
}

class Connection {
  constructor(ws, user) {
    this.ws = ws;
    this.user = user;
    this.turn = null; // { abort: AbortController, done: Promise }
    this.queue = [];
    this.dg = null;
    this.dgBuffer = [];
    this.finalParts = [];
    this.lastAudio = 0;
    this.keyterms = [];
    this.loadKeyterms();

    if (!connections.has(user.id)) connections.set(user.id, new Set());
    connections.get(user.id).add(this);

    ws.on("message", (data, isBinary) => (isBinary ? this.onAudio(data) : this.onJson(data)));
    ws.on("close", () => this.close());
    ws.on("error", () => this.close());
    this.ping = setInterval(() => {
      if (this.dg?.readyState === WebSocket.OPEN) {
        this.dg.send(JSON.stringify({ type: "KeepAlive" }));
        if (Date.now() - this.lastAudio > 30_000) this.closeDeepgram();
      }
    }, 8000);

    this.send({ type: "ready", stt: sttEnabled() ? "deepgram" : "browser", tts: ttsEnabled() ? "elevenlabs" : "browser" });
  }

  // Begriffe aus dem Wörterbuch, die Deepgram schon beim Zuhören kennen soll.
  loadKeyterms() {
    woerterbuch.schluesselwoerter(this.user.id).then((k) => (this.keyterms = k)).catch(() => {});
  }

  send(msg) {
    if (this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
  }

  close() {
    clearInterval(this.ping);
    this.turn?.abort.abort();
    this.closeDeepgram();
    connections.get(this.user.id)?.delete(this);
  }

  // ---------- Eingänge ----------

  async onJson(data) {
    let msg;
    try {
      msg = JSON.parse(data.toString());
    } catch {
      return;
    }
    switch (msg.type) {
      case "open": {
        const hint = await jarvis.openHint(this.user);
        if (hint) this.startTurn(hint, { hidden: true, voice: true });
        break;
      }
      case "text": {
        let text = String(msg.text || "").trim().slice(0, 8000);
        if (!text) break;
        if (msg.voice) {
          // Gesprochen (Browser-Erkennung): erst Hörfehler geraderücken.
          const k = await woerterbuch.korrigiereFuer(this.user.id, text);
          if (k.changes.length) this.send({ type: "korrigiert", text: k.text, changes: k.changes });
          text = k.text;
        }
        this.startTurn(text, { voice: Boolean(msg.voice) });
        break;
      }
      case "image": {
        // „Augen“: Foto aus der Kamera, optional mit Frage
        const ok = typeof msg.data === "string" && /^image\/(jpeg|png|webp)$/.test(msg.mime) && msg.data.length < 5_500_000;
        if (!ok) return this.send({ type: "error", message: "Foto ungültig oder zu groß." });
        const text = String(msg.text || "").trim().slice(0, 2000) || "[Foto ohne Kommentar]";
        this.startTurn(text, { voice: Boolean(msg.voice), image: { mime: msg.mime, data: msg.data } });
        break;
      }
      case "listen":
        this.loadKeyterms(); // Wörterbuch kann sich seit dem letzten Mal geändert haben
        if (sttEnabled()) this.openDeepgram();
        break;
      case "listen_stop":
        if (this.dg?.readyState === WebSocket.OPEN) this.dg.send(JSON.stringify({ type: "Finalize" }));
        break;
      case "interrupt":
        this.turn?.abort.abort();
        break;
    }
  }

  onAudio(data) {
    if (!sttEnabled()) return;
    this.lastAudio = Date.now();
    if (!this.dg) this.openDeepgram();
    if (this.dg.readyState === WebSocket.OPEN) this.dg.send(data);
    else if (this.dgBuffer.length < 200) this.dgBuffer.push(data);
  }

  // ---------- Deepgram (hört) ----------

  openDeepgram() {
    if (this.dg && this.dg.readyState <= WebSocket.OPEN) return;
    const params = new URLSearchParams({
      model: DG_MODEL,
      language: DG_LANGUAGE,
      encoding: "linear16",
      sample_rate: "16000",
      channels: "1",
      interim_results: "true",
      smart_format: "true",
      punctuate: "true",
      endpointing: "400",
      utterance_end_ms: "1200",
      vad_events: "true",
    });
    // Vorbeugen statt nur korrigieren: Deepgram kennt die Wörterbuch-Begriffe schon beim Zuhören.
    for (const k of this.keyterms) {
      if (DG_MODEL.startsWith("nova-3")) params.append("keyterm", k);
      else params.append("keywords", `${k}:2`);
    }
    const dg = new WebSocket(`${DG_URL}?${params}`, {
      headers: { Authorization: `Token ${process.env.DEEPGRAM_API_KEY}` },
    });
    this.dg = dg;
    this.lastAudio = Date.now();
    dg.on("open", () => {
      for (const chunk of this.dgBuffer) dg.send(chunk);
      this.dgBuffer = [];
    });
    dg.on("message", (raw) => this.onDeepgram(raw));
    dg.on("unexpected-response", (req, res) => {
      console.error("[deepgram] Verbindung abgelehnt:", res.statusCode);
      this.send({ type: "error", message: `Deepgram lehnt ab (${res.statusCode}). Schlüssel prüfen.` });
    });
    dg.on("error", (err) => console.error("[deepgram]", err.message));
    dg.on("close", () => {
      if (this.dg === dg) this.dg = null;
    });
  }

  closeDeepgram() {
    const dg = this.dg;
    this.dg = null;
    this.dgBuffer = [];
    if (!dg) return;
    try {
      if (dg.readyState === WebSocket.OPEN) dg.send(JSON.stringify({ type: "CloseStream" }));
      dg.close();
    } catch {}
  }

  onDeepgram(raw) {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }
    if (msg.type === "SpeechStarted") {
      // Nutzer fängt an zu reden, während Jarvis spricht → Jarvis verstummt.
      if (this.turn) this.send({ type: "barge_in" });
      return;
    }
    if (msg.type === "Results") {
      const text = msg.channel?.alternatives?.[0]?.transcript || "";
      if (msg.is_final && text) this.finalParts.push(text);
      const shown = [...this.finalParts, msg.is_final ? "" : text].join(" ").trim();
      if (shown) this.send({ type: "transcript", text: shown, final: false });
      if (msg.speech_final) this.endUtterance();
      return;
    }
    if (msg.type === "UtteranceEnd") this.endUtterance();
  }

  async endUtterance() {
    const heard = this.finalParts.join(" ").trim();
    this.finalParts = [];
    if (!heard) return;
    // Korrektur-Schicht: Hörfehler geraderücken, bevor das Modell den Satz sieht.
    const { text, changes } = await woerterbuch.korrigiereFuer(this.user.id, heard);
    this.send({ type: "transcript", text, final: true, ...(changes.length ? { changes } : {}) });
    this.startTurn(text, { voice: true });
  }

  // ---------- Ein Gesprächszug ----------

  queueHidden(text, meta) {
    if (this.turn) this.queue.push({ text, meta });
    else this.startTurn(text, { hidden: true, voice: true, meta });
  }

  async startTurn(text, { voice = false, hidden = false, meta, image } = {}) {
    // Neue Eingabe unterbricht die laufende Antwort.
    const mine = (this.turnSeq = (this.turnSeq || 0) + 1);
    if (this.turn) {
      this.turn.abort.abort();
      await this.turn.done;
    }
    if (mine !== this.turnSeq) return; // inzwischen kam schon die nächste Eingabe
    const abort = new AbortController();
    const tts = ttsEnabled() && this.user.settings.sprachausgabe ? new SpeechStream(this, abort.signal) : null;
    const turn = { abort };
    this.turn = turn;
    this.send({ type: "turn_start", hidden });

    turn.done = (async () => {
      try {
        await jarvis.runTurn(this.user, text, {
          voice,
          hidden,
          meta,
          image,
          signal: abort.signal,
          emit: (ev) => {
            if (abort.signal.aborted) return;
            this.send(ev);
            if (ev.type === "text") tts?.push(ev.text);
          },
        });
        await tts?.finish();
      } catch (err) {
        console.error("[voice]", err);
      } finally {
        this.send({ type: "turn_end", aborted: abort.signal.aborted });
        if (this.turn === turn) this.turn = null;
      }
    })();
    await turn.done;

    if (!this.turn && this.queue.length) {
      const next = this.queue.shift();
      this.startTurn(next.text, { hidden: true, voice: true, meta: next.meta });
    }
  }
}

// ---------- ElevenLabs (spricht) ----------

// Zerlegt den gestreamten Text in Sätze, vertont jeden sofort (parallel) und schickt die
// Audiostücke in der richtigen Reihenfolge an das Gerät.
class SpeechStream {
  constructor(conn, signal) {
    this.conn = conn;
    this.signal = signal;
    this.buffer = "";
    this.seq = 0;
    this.chain = Promise.resolve();
  }

  push(text) {
    this.buffer += text;
    for (;;) {
      const m = this.buffer.match(/^[\s\S]*?(?:[.!?…](?=\s)|\n\n)/);
      if (!m || m[0].trim().length < 2) break;
      if (m[0].length < 25 && !/\n\n$/.test(m[0]) && this.seq > 0) {
        // Sehr kurze Sätze (außer dem ersten) mit dem nächsten zusammenfassen – klingt natürlicher.
        const rest = this.buffer.slice(m[0].length).match(/^[\s\S]*?(?:[.!?…](?=\s)|\n\n)/);
        if (!rest) break;
        this.say(m[0] + rest[0]);
        this.buffer = this.buffer.slice(m[0].length + rest[0].length);
        continue;
      }
      this.say(m[0]);
      this.buffer = this.buffer.slice(m[0].length);
    }
  }

  finish() {
    if (this.buffer.trim()) this.say(this.buffer);
    this.buffer = "";
    return this.chain;
  }

  say(text) {
    const clean = cleanForSpeech(text);
    if (!clean || this.signal.aborted) return;
    const seq = this.seq++;
    const audio = synthesize(clean, this.signal).catch((err) => {
      if (!this.signal.aborted) {
        console.error("[elevenlabs]", err.message);
        this.conn.send({ type: "error", message: `Sprachausgabe fehlgeschlagen (${err.message}).` });
      }
      return null;
    });
    this.chain = this.chain.then(async () => {
      const buf = await audio;
      if (buf && !this.signal.aborted) this.conn.send({ type: "audio", seq, data: buf.toString("base64") });
    });
  }
}

function cleanForSpeech(s) {
  return s
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/https?:\/\/\S+/g, "")
    .replace(/[*_#`>|~]/g, "")
    .replace(/^\s*[-•]\s+/gm, "")
    .replace(/\s+/g, " ")
    .trim();
}

async function synthesize(text, signal) {
  const res = await fetch(`${EL_URL}/v1/text-to-speech/${EL_VOICE}/stream?output_format=mp3_44100_128`, {
    method: "POST",
    headers: { "xi-api-key": process.env.ELEVENLABS_API_KEY, "Content-Type": "application/json", Accept: "audio/mpeg" },
    body: JSON.stringify({
      text,
      model_id: EL_MODEL,
      voice_settings: { stability: 0.55, similarity_boost: 0.75, style: 0.15, use_speaker_boost: true },
    }),
    signal,
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

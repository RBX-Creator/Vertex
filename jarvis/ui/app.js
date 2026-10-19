// Jarvis-Oberfläche: Anmeldung, Sprach- und Chatmodus, Einstellungen, Gedächtnis.
//
// Sprache läuft – wenn auf dem Server eingerichtet – über die Sprach-Verbindung (/api/voice):
//   Mikrofon → Server → Deepgram (hört) … ElevenLabs (spricht) → Server → Lautsprecher
// Sonst über die Sprach-APIs des Browsers (Web Speech) als Ersatz.
(function () {
  const $ = (id) => document.getElementById(id);
  const state = { config: null, user: null, busy: false, voices: [] };

  // ---------- API ----------
  async function api(path, opts = {}) {
    const res = await fetch(path, {
      method: opts.method || "GET",
      headers: opts.body ? { "Content-Type": "application/json" } : {},
      body: opts.body ? JSON.stringify(opts.body) : undefined,
      credentials: "same-origin",
    });
    if (res.status === 204) return null;
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw Object.assign(new Error(data.error || `Fehler ${res.status}`), { status: res.status });
    return data;
  }

  // Liest Server-Sent Events aus einer POST-Antwort (Ersatzweg ohne Sprach-Verbindung).
  async function stream(path, body, onEvent) {
    const res = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      credentials: "same-origin",
    });
    if (res.status === 204) return false;
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || `Fehler ${res.status}`);
    }
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = "";
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let i;
      while ((i = buf.indexOf("\n\n")) >= 0) {
        const chunk = buf.slice(0, i);
        buf = buf.slice(i + 2);
        if (chunk.startsWith("data: ")) onEvent(JSON.parse(chunk.slice(6)));
      }
    }
    return true;
  }

  // ---------- Anmeldung ----------
  let authMode = "login";
  document.querySelectorAll(".tabs button").forEach((b) =>
    b.addEventListener("click", () => {
      authMode = b.dataset.tab;
      document.querySelectorAll(".tabs button").forEach((x) => x.classList.toggle("active", x === b));
      document.querySelectorAll(".only-register").forEach((el) => {
        const show = authMode === "register" && (el.name !== "teamCode" || state.config.teamCodeRequired);
        el.classList.toggle("hidden", !show);
      });
      $("authForm").password.autocomplete = authMode === "register" ? "new-password" : "current-password";
      $("authError").textContent = "";
    }),
  );

  $("authForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = e.target;
    $("authError").textContent = "";
    try {
      const body = { name: f.name.value, password: f.password.value };
      if (authMode === "register") Object.assign(body, { teamCode: f.teamCode.value, anrede: f.anrede.value });
      const { user } = await api(`/api/${authMode}`, { method: "POST", body });
      unlockAudio();
      enterApp(user);
    } catch (err) {
      $("authError").textContent = err.message;
    }
  });

  function showAuth() {
    $("app").classList.add("hidden");
    $("auth").classList.remove("hidden");
    const sel = $("authForm").anrede;
    sel.innerHTML = state.config.anreden.map((a) => `<option>${a}</option>`).join("");
  }

  async function enterApp(user) {
    state.user = user;
    $("auth").classList.add("hidden");
    $("app").classList.remove("hidden");
    $("demoBadge").classList.toggle("hidden", !state.config.demo);
    if (!canListen()) {
      $("btnMic").classList.add("hidden");
      setStatus("Spracheingabe hier nicht verfügbar – bitte tippen");
      setChatMode(true);
    }
    await loadHistory();
    const connected = await connectVoice();
    if (connected) {
      sock.send(JSON.stringify({ type: "open" }));
    } else {
      // Ersatzweg ohne Sprach-Verbindung
      const turn = newTurn();
      try {
        await stream("/api/open", {}, handleEvent(turn));
      } catch {}
      finishTurn();
    }
  }

  // ---------- Darstellung ----------
  const setStatus = (t) => ($("status").textContent = t);
  const idleStatus = () => setStatus(canListen() ? "Tippen zum Sprechen" : "");
  function setChatMode(on) {
    document.body.classList.toggle("chat-mode", on);
    $("chat").classList.toggle("hidden", !on);
    $("btnChat").classList.toggle("on", on);
    if (on) scrollChat();
  }
  const scrollChat = () => ($("chat").scrollTop = $("chat").scrollHeight);

  let lastUserEl = null;
  function addMsg(kind, text) {
    const el = document.createElement("div");
    el.className = `msg ${kind}`;
    el.textContent = text;
    $("messages").appendChild(el);
    scrollChat();
    if (kind === "user") lastUserEl = el;
    return el;
  }

  // Zeigt, was die Korrektur-Schicht an Hörfehlern geraderückt hat – zur Kontrolle.
  function showCorrections(changes) {
    if (!changes?.length) return;
    const list = changes.map((c) => `${c.von} → ${c.zu}`).join(", ");
    addMsg("note", `↺ verstanden als: ${list}`);
  }

  function addJobResult(job) {
    const el = addMsg("job", "");
    const head = document.createElement("div");
    head.className = "job-head";
    const pruefung = { ok: " · geprüft", korrigiert: " · geprüft und korrigiert" }[job.pruefung] || "";
    head.textContent = `${job.status === "fertig" ? "✔" : "✖"} Auftrag: ${job.titel}${pruefung}`;
    const body = document.createElement("div");
    body.className = "md";
    body.innerHTML = renderMarkdown(job.ergebnis || job.content || "");
    el.append(head, body);
    if (job.bild && job.id) {
      const img = document.createElement("img");
      img.className = "shot";
      img.alt = "Bildschirmfoto";
      img.src = `/api/bild/${encodeURIComponent(job.id)}`;
      img.onclick = () => window.open(img.src, "_blank");
      el.appendChild(img);
    }
    scrollChat();
  }

  // Kleines, sicheres Markdown (erst HTML escapen, dann Überschriften, Fett, Listen, Links)
  function renderMarkdown(md) {
    const esc = (t) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    const inline = (t) =>
      esc(t)
        .replace(/\*\*(.+?)\*\*/g, "<b>$1</b>")
        .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
    let html = "";
    let inList = false;
    for (const line of md.split("\n")) {
      const h = line.match(/^#{1,4}\s+(.*)/);
      const li = line.match(/^\s*[-*•]\s+(.*)/);
      if (li) {
        if (!inList) (html += "<ul>"), (inList = true);
        html += `<li>${inline(li[1])}</li>`;
        continue;
      }
      if (inList) (html += "</ul>"), (inList = false);
      if (h) html += `<h4>${inline(h[1])}</h4>`;
      else if (line.trim()) html += `<p>${inline(line)}</p>`;
    }
    return html + (inList ? "</ul>" : "");
  }

  async function loadHistory() {
    $("messages").innerHTML = "";
    try {
      const { verlauf } = await api("/api/verlauf");
      for (const m of verlauf) {
        if (m.role === "job") addJobResult({ id: m.id, bild: m.bild, titel: m.titel, status: m.status, pruefung: m.pruefung, ergebnis: m.content });
        else addMsg(m.role === "user" ? "user" : "jarvis", m.role === "user" ? m.content.replace(/^\[Foto\]/, "📷") : m.content);
      }
    } catch {}
  }

  // ---------- Ein Gesprächszug ----------
  let currentTurn = null;

  function newTurn() {
    state.busy = true;
    Orb.setState("thinking");
    setStatus("Denkt nach …");
    $("subtitle").classList.remove("interim");
    $("subtitle").textContent = "";
    currentTurn = { el: null, text: "", speech: "" };
    return currentTurn;
  }

  function handleEvent(turn) {
    return (ev) => {
      if (ev.type === "text") {
        if (!turn.el) turn.el = addMsg("jarvis", "");
        turn.text += ev.text;
        turn.el.textContent = turn.text;
        $("subtitle").textContent = turn.text;
        $("subtitle").scrollTop = $("subtitle").scrollHeight;
        scrollChat();
        if (Orb.state === "thinking") setStatus("");
        if (!serverTts()) feedSpeech(turn, ev.text);
      } else if (ev.type === "memory") {
        if (ev.write) addMsg("note", `◎ Gedächtnis: ${ev.verb} ${ev.path.replace("/memories/", "")}`);
      } else if (ev.type === "job") {
        addMsg("note", `⧗ Auftrag an Claude: ${ev.job.titel}`);
      } else if (ev.type === "tool") {
        const names = { kalender: "Kalender", postfach: "Postfach", mail_entwurf: "Mail-Entwurf" };
        addMsg("note", `⚙ ${names[ev.name] || ev.name}`);
      } else if (ev.type === "korrigiert") {
        if (lastUserEl) lastUserEl.textContent = ev.text;
        showCorrections(ev.changes);
      } else if (ev.type === "error") {
        addMsg("err", ev.message);
        $("subtitle").textContent = ev.message;
      }
    };
  }

  function finishTurn() {
    if (currentTurn && !serverTts()) flushSpeech(currentTurn);
    state.busy = false;
    if (!speaking()) afterSpeech();
  }

  async function send(text, { voice = false } = {}) {
    text = text.trim();
    if (!text) return;
    stopSpeaking();
    addMsg("user", text);
    if (sock?.readyState === WebSocket.OPEN) {
      // Der Server unterbricht eine laufende Antwort selbst.
      sock.send(JSON.stringify({ type: "text", text, voice }));
      return;
    }
    if (state.busy) return;
    const turn = newTurn();
    try {
      await stream("/api/chat", { text, voice }, handleEvent(turn));
    } catch (err) {
      addMsg("err", err.message);
    }
    finishTurn();
  }

  $("composer").addEventListener("submit", (e) => {
    e.preventDefault();
    const t = $("input").value;
    $("input").value = "";
    lastInputWasVoice = false;
    send(t);
  });

  // ---------- Augen: Foto aus der Kamera ----------
  $("btnCam").addEventListener("click", () => {
    unlockAudio();
    $("camInput").click();
  });

  $("camInput").addEventListener("change", async () => {
    const file = $("camInput").files[0];
    $("camInput").value = "";
    if (!file) return;
    let img;
    try {
      img = await shrinkImage(file, 1280, 0.82);
    } catch {
      return addMsg("err", "Foto konnte nicht gelesen werden.");
    }
    const text = $("input").value.trim();
    $("input").value = "";
    stopSpeaking();
    const el = addMsg("user", text);
    const thumb = document.createElement("img");
    thumb.className = "foto";
    thumb.src = `data:${img.mime};base64,${img.data}`;
    el.prepend(thumb);
    lastInputWasVoice = false;
    if (sock?.readyState === WebSocket.OPEN) {
      sock.send(JSON.stringify({ type: "image", mime: img.mime, data: img.data, text }));
      return;
    }
    if (state.busy) return;
    const turn = newTurn();
    try {
      await stream("/api/chat", { text, image: img }, handleEvent(turn));
    } catch (err) {
      addMsg("err", err.message);
    }
    finishTurn();
  });

  // Verkleinert ein Foto auf max. `max` Pixel Kantenlänge (JPEG) – spart Zeit und Datenvolumen.
  async function shrinkImage(file, max, quality) {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL("image/jpeg", quality);
    return { mime: "image/jpeg", data: dataUrl.slice(dataUrl.indexOf(",") + 1) };
  }

  // ---------- Sprach-Verbindung zum Server ----------
  let sock = null;
  let voiceReady = { stt: "browser", tts: "browser" };
  let reconnectDelay = 1000;

  function connectVoice() {
    return new Promise((resolve) => {
      let settled = false;
      const done = (ok) => !settled && ((settled = true), resolve(ok));
      try {
        sock = new WebSocket(`${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/api/voice`);
      } catch {
        return done(false);
      }
      const timer = setTimeout(() => done(false), 4000);
      sock.onmessage = (e) => {
        const ev = JSON.parse(e.data);
        if (ev.type === "ready") {
          voiceReady = { stt: ev.stt, tts: ev.tts };
          reconnectDelay = 1000;
          clearTimeout(timer);
          done(true);
        }
        onVoiceEvent(ev);
      };
      sock.onclose = () => {
        clearTimeout(timer);
        done(false);
        if (state.busy) finishTurn();
        stopCapture();
        if (!state.user) return;
        setTimeout(connectVoice, reconnectDelay);
        reconnectDelay = Math.min(reconnectDelay * 2, 30000);
      };
    });
  }

  const serverStt = () => voiceReady.stt === "deepgram" && sock?.readyState === WebSocket.OPEN;
  const serverTts = () => voiceReady.tts === "elevenlabs" && sock?.readyState === WebSocket.OPEN;

  let wsTurn = null;
  function onVoiceEvent(ev) {
    switch (ev.type) {
      case "turn_start":
        player.reset();
        wsTurn = newTurn();
        break;
      case "turn_end":
        wsTurn = null;
        finishTurn();
        break;
      case "text":
      case "memory":
      case "job":
      case "tool":
      case "error":
        handleEvent(wsTurn || currentTurn || newTurn())(ev);
        break;
      case "audio":
        player.enqueue(ev.seq, ev.data);
        break;
      case "transcript":
        $("subtitle").classList.toggle("interim", !ev.final);
        $("subtitle").textContent = ev.text;
        if (ev.final) {
          addMsg("user", ev.text);
          showCorrections(ev.changes);
          lastInputWasVoice = true;
          if (!state.user.settings.gespraechsmodus) stopCapture();
          else pauseCapture();
        }
        break;
      case "korrigiert":
        // Browser-Spracherkennung: die angezeigte Nachricht durch die korrigierte ersetzen
        if (lastUserEl) lastUserEl.textContent = ev.text;
        showCorrections(ev.changes);
        break;
      case "barge_in":
        if (capturing) stopSpeaking();
        break;
      case "job_done":
        addJobResult(ev.job);
        break;
    }
  }

  // ---------- Audio: Wiedergabe der Server-Stimme (ElevenLabs) ----------
  let audioCtx = null;
  function ctx() {
    audioCtx ??= new (window.AudioContext || window.webkitAudioContext)();
    return audioCtx;
  }

  const player = {
    next: 0,
    decoded: new Map(),
    source: null,
    analyser: null,
    playing: false,
    reset() {
      this.stop();
      this.next = 0;
    },
    async enqueue(seq, b64) {
      const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      try {
        this.decoded.set(seq, await ctx().decodeAudioData(bytes.buffer));
      } catch {
        this.decoded.set(seq, null);
      }
      if (!this.playing) this.playNext();
    },
    async playNext() {
      if (!this.decoded.has(this.next)) {
        this.playing = false;
        if (!state.busy) afterSpeech();
        return;
      }
      this.playing = true;
      const buf = this.decoded.get(this.next);
      this.decoded.delete(this.next);
      this.next++;
      if (!buf) return this.playNext();
      const c = ctx();
      if (c.state === "suspended") {
        // Ohne vorheriges Antippen (z. B. Briefing direkt nach dem Laden) blockt der Browser Audio.
        await Promise.race([c.resume(), new Promise((r) => setTimeout(r, 300))]);
        if (c.state !== "running") {
          this.stop();
          setStatus("Antippen, damit Jarvis sprechen darf");
          return;
        }
      }
      this.playing = true;
      if (!this.analyser) {
        this.analyser = c.createAnalyser();
        this.analyser.fftSize = 512;
        this.analyser.connect(c.destination);
      }
      const src = c.createBufferSource();
      src.buffer = buf;
      src.connect(this.analyser);
      src.onended = () => {
        if (this.source === src) {
          this.source = null;
          this.playNext();
        }
      };
      this.source = src;
      this.playing = true;
      Orb.setState("speaking");
      setStatus("");
      src.start();
    },
    stop() {
      this.decoded.clear();
      if (this.source) {
        const s = this.source;
        this.source = null;
        try {
          s.stop();
        } catch {}
      }
      this.playing = false;
    },
  };

  // Echter Pegel der Stimme für den Orb
  const levelData = new Uint8Array(512);
  setInterval(() => {
    if (player.playing && player.analyser) {
      player.analyser.getByteTimeDomainData(levelData);
      let sum = 0;
      for (const v of levelData) sum += (v - 128) ** 2;
      Orb.setLevel(Math.sqrt(sum / levelData.length) / 22);
    } else if (Orb.state === "speaking" && speechQueue > 0) {
      Orb.setLevel(0.25 + Math.random() * 0.45); // Browser-Stimme liefert keinen Pegel
    }
  }, 50);

  // ---------- Sprachausgabe des Browsers (Ersatz) ----------
  const synth = window.speechSynthesis;
  let speechQueue = 0;

  function unlockAudio() {
    // iOS gibt Audio erst nach einer Nutzeraktion frei.
    try {
      const c = ctx();
      if (c.state === "suspended") c.resume();
    } catch {}
    if (synth && !unlockAudio.done) {
      synth.speak(new SpeechSynthesisUtterance(""));
      unlockAudio.done = true;
    }
  }

  const ttsOn = () => state.user?.settings.sprachausgabe;
  const speaking = () => speechQueue > 0 || player.playing;

  // Sprechtext (sprechtext.js, als Modul geladen): „119,99 €“ → „119 Euro 99“, „19.10.“ → „19. Oktober“ …
  function cleanForSpeech(s) {
    if (window.Sprechtext) return window.Sprechtext.sprechbar(s);
    return s
      .replace(/```[\s\S]*?```/g, " ")
      .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
      .replace(/[*_#`>|~]/g, "")
      .replace(/^\s*[-•]\s+/gm, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  // Ende des ersten fertigen Satzes oder -1. Trennt nicht bei „ca.“, „z. B.“ oder „19.10.“.
  function satzEnde(t) {
    if (window.Sprechtext) return window.Sprechtext.satzEnde(t);
    const m = t.match(/^[\s\S]*?[.!?…](?=\s)/);
    return m ? m[0].length : -1;
  }

  function feedSpeech(turn, chunk) {
    if (!synth || !ttsOn()) return;
    turn.speech += chunk;
    for (;;) {
      // Sehr kurze Sätze („Sehr wohl.“) mit dem nächsten zusammen sprechen.
      let ende = satzEnde(turn.speech);
      while (ende >= 0 && ende <= 12) {
        const rest = satzEnde(turn.speech.slice(ende));
        ende = rest < 0 ? -1 : ende + rest;
      }
      if (ende < 0) break;
      speak(turn.speech.slice(0, ende));
      turn.speech = turn.speech.slice(ende);
    }
  }

  function flushSpeech(turn) {
    if (synth && ttsOn() && turn.speech.trim()) speak(turn.speech);
    turn.speech = "";
  }

  function pickVoice() {
    const wanted = state.user?.settings.stimme;
    return state.voices.find((v) => v.name === wanted) || state.voices.find((v) => v.lang.startsWith("de"));
  }

  // Beste Stimme zuerst: Premium/Erweitert > Siri (Martin, Helena) > Anna & Co. Spielzeugstimmen und
  // Eloquence (Reed, Eddy, Flo …) klingen blechern und landen hinten.
  const STIMMEN_RANG = [
    [/premium/i, 40],
    [/enhanced|erweitert|verbessert/i, 30],
    [/natural|neural|online|google/i, 15],
    [/siri/i, 12],
    [/\bmartin\b/i, 10], [/\bmarkus\b/i, 9], [/\b(yannick|viktor)\b/i, 8], [/\b(helena|anna)\b/i, 7], [/\bpetra\b/i, 6],
  ];
  const SPIELZEUG =
    /eloquence|\b(albert|bahh|bells|boing|bubbles|cellos|jester|organ|superstar|trinoids|whisper|wobble|zarvox|good news|bad news|reed|eddy|rocko|grandpa|grandma|shelley|sandy|flo)\b/i;
  function voiceScore(v) {
    const id = `${v.name} ${v.voiceURI}`;
    let s = /^de[-_]DE/i.test(v.lang) ? 5 : 0;
    for (const [re, p] of STIMMEN_RANG) if (re.test(id)) s += p;
    if (SPIELZEUG.test(id)) s -= 30;
    return s;
  }

  function speak(text) {
    const clean = cleanForSpeech(text);
    if (!clean) return;
    const u = new SpeechSynthesisUtterance(clean);
    const voice = pickVoice();
    if (voice) u.voice = voice;
    u.lang = voice?.lang || "de-DE";
    u.rate = 1.04;
    u.pitch = 0.9;
    speechQueue++;
    u.onstart = () => {
      Orb.setState("speaking");
      setStatus("");
    };
    u.onend = u.onerror = () => {
      speechQueue = Math.max(0, speechQueue - 1);
      if (!speechQueue && !state.busy) afterSpeech();
    };
    synth.speak(u);
  }

  function stopSpeaking() {
    if (synth) synth.cancel();
    speechQueue = 0;
    player.stop();
  }

  function afterSpeech() {
    if (speaking()) return;
    if (state.user?.settings.gespraechsmodus && canListen() && lastInputWasVoice) {
      startListening();
    } else if (!capturing && !listening) {
      Orb.setState("idle");
      idleStatus();
    }
  }

  function loadVoices() {
    if (!synth) return;
    state.voices = synth.getVoices().filter((v) => /^(de|en)/.test(v.lang));
    state.voices.sort(
      (a, b) => b.lang.startsWith("de") - a.lang.startsWith("de") || voiceScore(b) - voiceScore(a) || a.name.localeCompare(b.name),
    );
  }
  if (synth) {
    loadVoices();
    synth.onvoiceschanged = loadVoices;
    // iOS liefert die Stimmenliste verzögert und meldet sich nicht immer – kurz nachfragen.
    let versuche = 0;
    const warten = setInterval(() => {
      loadVoices();
      if (state.voices.length || ++versuche >= 12) clearInterval(warten);
    }, 250);
  }

  // ---------- Spracheingabe ----------
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const recognition = SR ? new SR() : null;
  const canCapture = Boolean(navigator.mediaDevices?.getUserMedia && window.AudioWorkletNode);
  const canListen = () => (serverStt() ? canCapture : Boolean(recognition) || (voiceReady.stt === "deepgram" && canCapture));
  let listening = false; // Browser-Erkennung aktiv
  let capturing = false; // Mikrofon-Stream zum Server aktiv
  let finalText = "";
  let lastInputWasVoice = false;

  // --- a) Deepgram über den Server ---
  let mic = null; // { stream, source, node, analyser }

  async function ensureMic() {
    if (mic) return mic;
    const c = ctx();
    await c.audioWorklet.addModule("pcm-worklet.js");
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
    const source = c.createMediaStreamSource(stream);
    const node = new AudioWorkletNode(c, "pcm16");
    const analyser = c.createAnalyser();
    analyser.fftSize = 512;
    source.connect(analyser);
    node.port.onmessage = (e) => {
      if (capturing && sock?.readyState === WebSocket.OPEN) sock.send(e.data);
    };
    source.connect(node);
    // Worklet muss am Graphen hängen, damit er läuft – stumm zum Ausgang.
    const mute = c.createGain();
    mute.gain.value = 0;
    node.connect(mute).connect(c.destination);
    mic = { stream, source, node, analyser, data: new Uint8Array(512) };
    mic.timer = setInterval(() => {
      if (!capturing) return;
      analyser.getByteTimeDomainData(mic.data);
      let sum = 0;
      for (const v of mic.data) sum += (v - 128) ** 2;
      Orb.setLevel(Math.sqrt(sum / mic.data.length) / 30);
    }, 50);
    return mic;
  }

  async function startCapture() {
    try {
      const c = ctx();
      if (c.state === "suspended") await c.resume();
      await ensureMic();
    } catch (err) {
      setStatus("Mikrofon nicht verfügbar");
      return;
    }
    sock.send(JSON.stringify({ type: "listen" }));
    capturing = true;
    $("btnMic").classList.add("on");
    Orb.setState("listening");
    setStatus("Hört zu …");
    $("subtitle").textContent = "";
  }

  // Nach einer erkannten Äußerung: Mikrofon pausieren, bis Jarvis fertig ist.
  function pauseCapture() {
    capturing = false;
    $("btnMic").classList.remove("on");
  }

  function stopCapture() {
    if (!capturing && !mic) return;
    if (capturing && sock?.readyState === WebSocket.OPEN) sock.send(JSON.stringify({ type: "listen_stop" }));
    // Kurz weiterschicken, damit das Satzende noch ankommt
    setTimeout(() => {
      capturing = false;
      $("btnMic").classList.remove("on");
      if (!state.busy && !speaking()) {
        Orb.setState("idle");
        idleStatus();
      }
    }, 300);
  }

  // Mikrofon freigeben, wenn die App im Hintergrund ist
  document.addEventListener("visibilitychange", () => {
    if (document.hidden && mic) {
      capturing = false;
      clearInterval(mic.timer);
      mic.stream.getTracks().forEach((t) => t.stop());
      mic.node.disconnect();
      mic = null;
    }
  });

  // --- b) Browser-Spracherkennung (Ersatz) ---
  if (recognition) {
    recognition.lang = "de-DE";
    recognition.interimResults = true;
    recognition.continuous = false;
    recognition.onresult = (e) => {
      let interim = "";
      finalText = "";
      for (const r of e.results) r.isFinal ? (finalText += r[0].transcript) : (interim += r[0].transcript);
      $("subtitle").classList.add("interim");
      $("subtitle").textContent = finalText + interim;
    };
    recognition.onend = () => {
      listening = false;
      $("btnMic").classList.remove("on");
      const t = finalText.trim() || ($("subtitle").classList.contains("interim") ? $("subtitle").textContent.trim() : "");
      $("subtitle").classList.remove("interim");
      if (t) {
        lastInputWasVoice = true;
        send(t, { voice: true });
      } else if (!state.busy) {
        Orb.setState("idle");
        idleStatus();
      }
    };
    recognition.onerror = (e) => {
      if (e.error === "not-allowed") setStatus("Mikrofon nicht erlaubt");
    };
  }

  function startListening() {
    if (listening || capturing) return;
    stopSpeaking();
    if (serverStt() && canCapture) return startCapture();
    if (!recognition) return;
    finalText = "";
    $("subtitle").textContent = "";
    try {
      recognition.start();
    } catch {
      return;
    }
    listening = true;
    $("btnMic").classList.add("on");
    Orb.setState("listening");
    setStatus("Hört zu …");
  }

  function stopListening() {
    if (capturing) stopCapture();
    if (listening) recognition.stop();
  }

  function toggleTalk() {
    unlockAudio();
    if (speaking() || (state.busy && sock?.readyState === WebSocket.OPEN)) {
      // Antippen unterbricht Jarvis
      stopSpeaking();
      if (sock?.readyState === WebSocket.OPEN) sock.send(JSON.stringify({ type: "interrupt" }));
      lastInputWasVoice = false;
      Orb.setState("idle");
      idleStatus();
      return;
    }
    listening || capturing ? stopListening() : startListening();
  }

  $("orbHit").addEventListener("click", toggleTalk);
  $("btnMic").addEventListener("click", toggleTalk);

  // ---------- Einstellungen ----------
  $("btnChat").addEventListener("click", () => setChatMode(!document.body.classList.contains("chat-mode")));

  $("btnSettings").addEventListener("click", () => {
    const s = state.user.settings;
    $("anredeList").innerHTML = state.config.anreden.map((a) => `<option value="${a}">`).join("");
    $("setAnrede").value = s.anrede;
    $("setTts").checked = s.sprachausgabe;
    $("setBriefing").checked = s.autoBriefing;
    $("setConvo").checked = s.gespraechsmodus;
    $("setVoice").closest("label").classList.toggle("hidden", serverTts());
    loadVoices();
    $("setVoice").innerHTML =
      `<option value="">Automatisch (Deutsch)</option>` +
      state.voices.map((v) => `<option value="${v.name.replace(/"/g, "&quot;")}">${v.name} (${v.lang})</option>`).join("");
    $("setVoice").value = s.stimme;
    $("engineInfo").textContent =
      `Gehirn: ${{ gemini: "Gemini + Claude", claude: "Claude", demo: "Demo" }[state.config.gehirn]} · ` +
      `Hören: ${serverStt() ? "Deepgram" : "Browser"} · Sprechen: ${serverTts() ? "ElevenLabs" : "Browser"}`;
    $("settings").showModal();
  });

  $("btnCloseSettings").addEventListener("click", async () => {
    try {
      const { settings } = await api("/api/settings", {
        method: "PATCH",
        body: {
          anrede: $("setAnrede").value,
          sprachausgabe: $("setTts").checked,
          stimme: $("setVoice").value,
          autoBriefing: $("setBriefing").checked,
          gespraechsmodus: $("setConvo").checked,
        },
      });
      state.user.settings = settings;
    } catch (err) {
      alert(err.message);
    }
    $("settings").close();
  });

  $("setVoice").addEventListener("change", () => {
    if (!synth) return;
    synth.cancel();
    const v = state.voices.find((x) => x.name === $("setVoice").value);
    const u = new SpeechSynthesisUtterance("Sehr wohl. So klinge ich dann.");
    if (v) u.voice = v;
    u.lang = v?.lang || "de-DE";
    synth.speak(u);
  });

  $("btnClear").addEventListener("click", async () => {
    if (!confirm("Gesprächsverlauf löschen? Das Gedächtnis bleibt erhalten.")) return;
    await api("/api/verlauf", { method: "DELETE" });
    $("messages").innerHTML = "";
  });

  $("btnLogout").addEventListener("click", async () => {
    state.user = null;
    await api("/api/logout", { method: "POST" });
    location.reload();
  });

  // ---------- Verbindungen (Kalender, Postfach) ----------
  $("btnVerbindungen").addEventListener("click", async () => {
    $("vStatus").textContent = "";
    try {
      const v = await api("/api/verbindungen");
      $("vKalender").value = v.kalender.map((k) => (k.name && k.name !== "Kalender" ? `${k.name} | ${k.url}` : k.url)).join("\n");
      $("vHost").value = v.mail?.host || "";
      $("vPort").value = v.mail?.port || "";
      $("vUser").value = v.mail?.user || "";
      $("vPass").value = "";
      $("vPass").placeholder = v.mail?.passwortGesetzt ? "gespeichert – leer lassen = unverändert" : "App-Passwort";
      $("btnVRemoveMail").classList.toggle("hidden", !v.mail);
    } catch (err) {
      $("vStatus").textContent = err.message;
    }
    $("verbindungen").showModal();
  });

  function readVerbindungen() {
    const kalender = $("vKalender")
      .value.split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .map((l) => {
        const [a, b] = l.split("|").map((x) => x.trim());
        return b ? { name: a, url: b } : { name: "Kalender", url: a };
      });
    const body = { kalender };
    if ($("vHost").value.trim() || $("vUser").value.trim()) {
      body.mail = { host: $("vHost").value, port: $("vPort").value, user: $("vUser").value, pass: $("vPass").value };
    }
    return body;
  }

  $("btnVSave").addEventListener("click", async () => {
    try {
      await api("/api/verbindungen", { method: "PUT", body: readVerbindungen() });
      $("verbindungen").close();
    } catch (err) {
      $("vStatus").textContent = err.message;
    }
  });

  $("btnVTest").addEventListener("click", async () => {
    $("vStatus").textContent = "Teste …";
    try {
      await api("/api/verbindungen", { method: "PUT", body: readVerbindungen() });
      const r = await api("/api/verbindungen/test", { method: "POST" });
      const parts = [];
      if (r.kalender) parts.push(`Kalender: ${r.kalender}`);
      if (r.mail) parts.push(`Postfach: ${r.mail}`);
      $("vStatus").textContent = parts.join(" · ") || "Noch nichts eingetragen.";
    } catch (err) {
      $("vStatus").textContent = err.message;
    }
  });

  $("btnVRemoveMail").addEventListener("click", async () => {
    if (!confirm("Postfach-Verbindung entfernen?")) return;
    await api("/api/verbindungen", { method: "PUT", body: { mail: null } });
    $("vHost").value = $("vPort").value = $("vUser").value = $("vPass").value = "";
    $("btnVRemoveMail").classList.add("hidden");
  });

  // ---------- Gedächtnis ----------
  async function showMemoryTree() {
    $("memEditor").classList.add("hidden");
    $("btnMemBack").classList.add("hidden");
    $("btnMemSave").classList.add("hidden");
    $("memTree").classList.remove("hidden");
    const { result } = await api("/api/memory?path=/memories");
    $("memTree").innerHTML = "";
    for (const line of result.split("\n").slice(1)) {
      const m = line.trim().match(/^(\/memories\/\S+?)(\/)?(?: \(\d+ B\))?$/);
      if (!m) continue;
      if (m[2]) {
        const d = document.createElement("div");
        d.className = "dir";
        d.textContent = m[1].replace("/memories/", "") + "/";
        $("memTree").appendChild(d);
      } else {
        const b = document.createElement("button");
        b.textContent = m[1].replace("/memories/", "");
        b.onclick = () => openMemoryFile(m[1]);
        $("memTree").appendChild(b);
      }
    }
  }

  async function openMemoryFile(p) {
    const { result } = await api(`/api/memory?raw=1&path=${encodeURIComponent(p)}`);
    $("memTree").classList.add("hidden");
    $("memEditor").classList.remove("hidden");
    $("btnMemBack").classList.remove("hidden");
    $("btnMemSave").classList.remove("hidden");
    $("memPath").textContent = p;
    $("memText").value = result;
  }

  $("btnMemory").addEventListener("click", async () => {
    $("memory").showModal();
    await showMemoryTree();
  });
  $("btnMemBack").addEventListener("click", showMemoryTree);
  $("btnMemSave").addEventListener("click", async () => {
    try {
      await api("/api/memory", { method: "PUT", body: { path: $("memPath").textContent, content: $("memText").value } });
      await showMemoryTree();
    } catch (err) {
      alert(err.message);
    }
  });
  $("btnCloseMemory").addEventListener("click", () => $("memory").close());

  // ---------- Start ----------
  (async () => {
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
    state.config = await api("/api/config");
    voiceReady = { stt: state.config.stt, tts: state.config.tts };
    try {
      const { user } = await api("/api/me");
      enterApp(user);
    } catch {
      showAuth();
    }
  })();
})();

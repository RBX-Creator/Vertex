// Jarvis-Oberfläche: Anmeldung, Sprach- und Chatmodus, Einstellungen, Gedächtnis.
// Stimme vorerst über die Browser-Sprach-APIs (Web Speech). Später ersetzt durch
// Deepgram (STT) + ElevenLabs (TTS) über den Server – siehe voice/README.md.
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

  // Liest Server-Sent Events aus einer POST-Antwort.
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
    if (!recognition) {
      $("btnMic").classList.add("hidden");
      setStatus("Spracheingabe hier nicht verfügbar – bitte tippen");
      setChatMode(true);
    }
    await loadHistory();
    try {
      await stream("/api/open", { voice: false }, handleEvent(newTurn()));
    } catch {}
    finishTurn();
  }

  // ---------- Darstellung ----------
  const setStatus = (t) => ($("status").textContent = t);
  function setChatMode(on) {
    document.body.classList.toggle("chat-mode", on);
    $("chat").classList.toggle("hidden", !on);
    $("btnChat").classList.toggle("on", on);
    if (on) scrollChat();
  }
  const scrollChat = () => ($("chat").scrollTop = $("chat").scrollHeight);

  function addMsg(kind, text) {
    const el = document.createElement("div");
    el.className = `msg ${kind}`;
    el.textContent = text;
    $("messages").appendChild(el);
    scrollChat();
    return el;
  }

  async function loadHistory() {
    $("messages").innerHTML = "";
    try {
      const { verlauf } = await api("/api/verlauf");
      for (const m of verlauf) addMsg(m.role === "user" ? "user" : "jarvis", m.content);
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
        feedSpeech(turn, ev.text);
      } else if (ev.type === "memory") {
        if (ev.write) addMsg("note", `◎ Gedächtnis: ${ev.verb} ${ev.path.replace("/memories/", "")}`);
      } else if (ev.type === "error") {
        addMsg("err", ev.message);
        $("subtitle").textContent = ev.message;
      }
    };
  }

  function finishTurn() {
    if (currentTurn) flushSpeech(currentTurn);
    state.busy = false;
    if (!speaking()) afterSpeech();
  }

  async function send(text, { voice = false } = {}) {
    text = text.trim();
    if (!text || state.busy) return;
    stopSpeaking();
    addMsg("user", text);
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
    send(t);
  });

  // ---------- Sprachausgabe (Browser-TTS, satzweise) ----------
  const synth = window.speechSynthesis;
  let speechQueue = 0;

  function unlockAudio() {
    // iOS gibt Sprachausgabe erst nach einer Nutzeraktion frei.
    if (synth && !unlockAudio.done) {
      synth.speak(new SpeechSynthesisUtterance(""));
      unlockAudio.done = true;
    }
  }

  const ttsOn = () => synth && state.user?.settings.sprachausgabe;
  const speaking = () => speechQueue > 0;

  function cleanForSpeech(s) {
    return s
      .replace(/```[\s\S]*?```/g, " ")
      .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
      .replace(/[*_#`>|~]/g, "")
      .replace(/^\s*[-•]\s+/gm, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function feedSpeech(turn, chunk) {
    if (!ttsOn()) return;
    turn.speech += chunk;
    // Ganze Sätze sofort vorlesen, nicht auf die komplette Antwort warten.
    const m = turn.speech.match(/^[\s\S]*?[.!?…:](?=\s)/);
    if (m && m[0].length > 12) {
      speak(m[0]);
      turn.speech = turn.speech.slice(m[0].length);
    }
  }

  function flushSpeech(turn) {
    if (ttsOn() && turn.speech.trim()) speak(turn.speech);
    turn.speech = "";
  }

  function pickVoice() {
    const wanted = state.user?.settings.stimme;
    return state.voices.find((v) => v.name === wanted) || state.voices.find((v) => v.lang.startsWith("de"));
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
    u.onboundary = () => Orb.setLevel(0.5 + Math.random() * 0.5);
    u.onend = u.onerror = () => {
      speechQueue = Math.max(0, speechQueue - 1);
      if (!speechQueue && !state.busy) afterSpeech();
    };
    synth.speak(u);
  }

  // Simulierter Pegel während des Sprechens (Browser-TTS liefert keine Lautstärke).
  setInterval(() => {
    if (Orb.state === "speaking") Orb.setLevel(0.25 + Math.random() * 0.45);
  }, 90);

  function stopSpeaking() {
    if (synth) synth.cancel();
    speechQueue = 0;
  }

  function afterSpeech() {
    if (state.user?.settings.gespraechsmodus && recognition && lastInputWasVoice) {
      startListening();
    } else {
      Orb.setState("idle");
      setStatus(recognition ? "Tippen zum Sprechen" : "");
    }
  }

  function loadVoices() {
    if (!synth) return;
    state.voices = synth.getVoices().filter((v) => /^(de|en)/.test(v.lang));
    state.voices.sort((a, b) => (b.lang.startsWith("de") - a.lang.startsWith("de")) || a.name.localeCompare(b.name));
  }
  if (synth) {
    loadVoices();
    synth.onvoiceschanged = loadVoices;
  }

  // ---------- Spracheingabe (Browser-STT) ----------
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const recognition = SR ? new SR() : null;
  let listening = false;
  let finalText = "";
  let lastInputWasVoice = false;
  let micStream = null;
  let analyserTimer = null;

  if (recognition) {
    recognition.lang = "de-DE";
    recognition.interimResults = true;
    recognition.continuous = false;
    recognition.onresult = (e) => {
      let interim = "";
      finalText = "";
      for (const r of e.results) (r.isFinal ? (finalText += r[0].transcript) : (interim += r[0].transcript));
      $("subtitle").classList.add("interim");
      $("subtitle").textContent = finalText + interim;
    };
    recognition.onend = () => {
      listening = false;
      $("btnMic").classList.remove("on");
      stopMicLevel();
      const t = finalText.trim() || ($("subtitle").classList.contains("interim") ? $("subtitle").textContent.trim() : "");
      $("subtitle").classList.remove("interim");
      if (t) {
        lastInputWasVoice = true;
        send(t, { voice: true });
      } else if (!state.busy) {
        Orb.setState("idle");
        setStatus("Tippen zum Sprechen");
      }
    };
    recognition.onerror = (e) => {
      if (e.error === "not-allowed") setStatus("Mikrofon nicht erlaubt");
    };
  }

  function startListening() {
    if (!recognition || listening || state.busy) return;
    stopSpeaking();
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
    startMicLevel();
  }

  function stopListening() {
    if (listening) recognition.stop();
  }

  // Mikrofonpegel für den Orb (optional – wenn der Browser es parallel erlaubt)
  async function startMicLevel() {
    try {
      micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const ac = new (window.AudioContext || window.webkitAudioContext)();
      const an = ac.createAnalyser();
      an.fftSize = 512;
      ac.createMediaStreamSource(micStream).connect(an);
      const data = new Uint8Array(an.fftSize);
      analyserTimer = setInterval(() => {
        an.getByteTimeDomainData(data);
        let sum = 0;
        for (const v of data) sum += (v - 128) ** 2;
        Orb.setLevel(Math.sqrt(sum / data.length) / 30);
      }, 50);
      micStream.ac = ac;
    } catch {}
  }

  function stopMicLevel() {
    clearInterval(analyserTimer);
    if (micStream) {
      micStream.getTracks().forEach((t) => t.stop());
      micStream.ac?.close();
      micStream = null;
    }
  }

  function toggleTalk() {
    unlockAudio();
    if (speaking()) {
      stopSpeaking();
      afterSpeechManual();
      return;
    }
    listening ? stopListening() : startListening();
  }
  function afterSpeechManual() {
    Orb.setState("idle");
    setStatus("Tippen zum Sprechen");
  }

  $("orbHit").addEventListener("click", toggleTalk);
  $("btnMic").addEventListener("click", toggleTalk);
  $("input").addEventListener("focus", () => (lastInputWasVoice = false));

  // ---------- Einstellungen ----------
  $("btnChat").addEventListener("click", () => setChatMode(!document.body.classList.contains("chat-mode")));

  $("btnSettings").addEventListener("click", () => {
    const s = state.user.settings;
    $("anredeList").innerHTML = state.config.anreden.map((a) => `<option value="${a}">`).join("");
    $("setAnrede").value = s.anrede;
    $("setTts").checked = s.sprachausgabe;
    $("setBriefing").checked = s.autoBriefing;
    $("setConvo").checked = s.gespraechsmodus;
    loadVoices();
    $("setVoice").innerHTML =
      `<option value="">Automatisch (Deutsch)</option>` +
      state.voices.map((v) => `<option value="${v.name.replace(/"/g, "&quot;")}">${v.name} (${v.lang})</option>`).join("");
    $("setVoice").value = s.stimme;
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
    await api("/api/logout", { method: "POST" });
    location.reload();
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
    try {
      const { user } = await api("/api/me");
      enterApp(user);
    } catch {
      showAuth();
    }
  })();
})();

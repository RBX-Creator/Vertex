// Sprache aufnehmen (Mikrofon) mit Stille-Erkennung und in Text umwandeln (Groq Whisper über den Server).
// Zuverlässiger als die eingebaute Spracherkennung von Safari auf dem iPhone.
export const canRecord = !!(navigator.mediaDevices?.getUserMedia && window.MediaRecorder);

const MIME = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/aac', 'audio/ogg;codecs=opus']
  .find((m) => window.MediaRecorder?.isTypeSupported?.(m)) || '';

export class Listener {
  constructor() { this.stream = null; this.ctx = null; this.analyser = null; this.current = null; }

  // Muss aus einem Tipp heraus aufgerufen werden (iPhone: Mikrofon + Audio freischalten)
  async open() {
    if (this.stream) return;
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    const AC = window.AudioContext || window.webkitAudioContext;
    if (AC) {
      this.ctx = new AC();
      await this.ctx.resume().catch(() => {});
      const src = this.ctx.createMediaStreamSource(this.stream);
      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 1024;
      src.connect(this.analyser);
    }
  }

  level() {
    if (!this.analyser) return 0;
    const buf = new Float32Array(this.analyser.fftSize);
    this.analyser.getFloatTimeDomainData(buf);
    let sum = 0;
    for (const v of buf) sum += v * v;
    return Math.sqrt(sum / buf.length);
  }

  // Nimmt auf, bis nach dem Sprechen eine Pause kommt (oder stopNow() / cancel()).
  // Ergebnis: Blob, oder null wenn nichts gesagt wurde / abgebrochen.
  record({ silenceMs = 1300, maxMs = 45_000, noSpeechMs = 9000, onLevel = () => {}, onSpeech = () => {} } = {}) {
    if (!this.stream) return Promise.resolve(null);
    return new Promise((resolve) => {
      const chunks = [];
      let rec;
      try { rec = new MediaRecorder(this.stream, MIME ? { mimeType: MIME } : undefined); } catch { rec = new MediaRecorder(this.stream); }
      const started = performance.now();
      let floor = 0.01;
      let samples = 0;
      let spoke = false;
      let lastLoud = started;
      let cancelled = false;
      let timer = null;
      const finish = () => { if (rec.state !== 'inactive') rec.stop(); };
      rec.ondataavailable = (e) => { if (e.data?.size) chunks.push(e.data); };
      rec.onstop = () => {
        clearInterval(timer);
        onLevel(0);
        this.current = null;
        if (cancelled || !spoke || !chunks.length) return resolve(null);
        resolve(new Blob(chunks, { type: rec.mimeType || MIME || 'audio/webm' }));
      };
      this.current = { stop: () => finish(), cancel: () => { cancelled = true; finish(); }, spoke: () => spoke };
      rec.start(250);
      timer = setInterval(() => {
        const now = performance.now();
        const lvl = this.level();
        // Grundrauschen in der ersten halben Sekunde messen
        if (now - started < 500) { floor = (floor * samples + lvl) / (samples + 1); samples++; }
        const loud = lvl > Math.max(0.018, floor * 2.8);
        onLevel(Math.min(1, lvl * 8));
        if (loud) { if (!spoke) onSpeech(); spoke = true; lastLoud = now; }
        if (!this.analyser) spoke = true; // ohne Pegel: nur per Tipp beenden
        if (spoke && this.analyser && now - lastLoud > silenceMs) finish();
        if (!spoke && now - started > noSpeechMs) finish();
        if (now - started > maxMs) finish();
      }, 80);
    });
  }

  stopNow() { this.current?.stop(); }
  cancel() { this.current?.cancel(); }
  get recording() { return !!this.current; }

  close() {
    this.cancel();
    this.stream?.getTracks().forEach((tr) => tr.stop());
    this.ctx?.close().catch(() => {});
    this.stream = null; this.ctx = null; this.analyser = null;
  }
}

// Aufnahme → Text. Wirft { unsupported: true }, wenn der Server keine Spracherkennung hat.
export async function toText(blob, lang) {
  const res = await fetch(`/api/chat/transcribe?lang=${encodeURIComponent(lang || '')}`, { method: 'POST', headers: { 'Content-Type': blob.type || 'audio/webm' }, body: blob });
  if (res.status === 501) throw Object.assign(new Error('unsupported'), { unsupported: true });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Spracherkennung fehlgeschlagen.');
  return String(data.text ?? '').trim();
}

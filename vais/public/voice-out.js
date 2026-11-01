// Vorlesen mit natürlicher Online-Stimme: Text → Audiodatei (über den Server) → abspielen.
// Läuft auf dem iPhone zuverlässiger als die eingebaute Vorlese-Stimme.
import { setAudioSession } from './listen.js';

// Kurzer WAV-Klang (freq 0 = Stille) – zum Freischalten des Abspielens per Tipp (iPhone) und als Ton-Test
function wav(freq = 0, secs = 0.1) {
  const rate = 16000; const n = Math.round(rate * secs); const buf = new ArrayBuffer(44 + n * 2); const v = new DataView(buf);
  const w = (o, s) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  w(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); w(8, 'WAVE'); w(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true);
  v.setUint16(22, 1, true); v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  w(36, 'data'); v.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) {
    const fade = Math.min(1, i / 400, (n - i) / 400);
    v.setInt16(44 + i * 2, freq ? Math.sin((2 * Math.PI * freq * i) / rate) * 12000 * fade : 0, true);
  }
  let bin = ''; new Uint8Array(buf).forEach((b) => { bin += String.fromCharCode(b); });
  return `data:audio/wav;base64,${btoa(bin)}`;
}
const SILENCE = wav();
const CHIME = wav(880, 0.35);

export class OnlineVoice {
  constructor() {
    this.audio = null; this.queue = []; this.busy = false; this.gen = 0; this.idle = []; this.failed = 0;
    this.broken = false; // Server hat keine Online-Stimme (z. B. Schlüssel fehlt)
    this.onError = () => {};
  }

  // Muss aus einem Tipp heraus aufgerufen werden
  unlock(sound = SILENCE) {
    if (!this.audio) { this.audio = new Audio(); this.audio.setAttribute('playsinline', ''); this.audio.preload = 'auto'; }
    try { this.audio.src = sound; return this.audio.play(); } catch (err) { return Promise.reject(err); }
  }

  // Ton-Test: kurzer Klang direkt aus dem Tipp → zeigt, ob der Lautsprecher überhaupt geht
  chime() {
    setAudioSession('playback');
    return new Promise((resolve) => {
      const p = this.unlock(CHIME);
      this.audio.onended = () => resolve(true);
      this.audio.onerror = () => resolve(false);
      Promise.resolve(p).catch(() => resolve(false));
      setTimeout(() => resolve(true), 1500);
    });
  }

  cancel() {
    this.gen++;
    for (const item of this.queue) item.abort?.();
    this.queue = [];
    this.busy = false;
    try { this.audio?.pause(); } catch { /* egal */ }
    this.idle = []; // abgebrochen: niemand mehr benachrichtigen
  }

  get speaking() { return this.busy || this.queue.length > 0; }

  // Text einreihen; die Audiodatei wird sofort geholt (während das vorige Stück noch läuft)
  say(text, { voice = 'nova', fallback } = {}) {
    const ctrl = new AbortController();
    const url = fetch('/api/chat/tts', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text, voice }), signal: ctrl.signal,
    }).then(async (r) => {
      if (!r.ok) {
        const msg = (await r.json().catch(() => ({}))).error || 'tts';
        if (r.status === 501) this.broken = true;
        this.onError(msg, r.status);
        throw new Error(msg);
      }
      return URL.createObjectURL(await r.blob());
    });
    url.catch(() => {});
    this.queue.push({ url, text, fallback, abort: () => ctrl.abort() });
    this.next();
  }

  whenIdle(fn) { if (!this.speaking) fn(); else this.idle.push(fn); }
  flushIdle() { const fns = this.idle; this.idle = []; fns.forEach((f) => f()); }

  async next() {
    if (this.busy) return;
    const item = this.queue.shift();
    if (!item) return this.flushIdle();
    this.busy = true;
    const gen = this.gen;
    try {
      const src = await item.url;
      if (gen !== this.gen) return;
      setAudioSession('playback');
      if (!this.audio) { this.audio = new Audio(); this.audio.setAttribute('playsinline', ''); }
      this.audio.src = src;
      await new Promise((resolve, reject) => {
        this.audio.onended = resolve;
        this.audio.onerror = () => reject(new Error('play'));
        this.audio.play().catch(reject);
      });
      URL.revokeObjectURL(src);
      this.failed = 0;
    } catch (err) {
      if (gen !== this.gen) return;
      this.failed++;
      if (err?.message === 'play') this.onError('play', 0);
      if (item.fallback) await item.fallback(item.text).catch(() => {}); // Notlösung: Geräte-Stimme
    } finally {
      if (gen === this.gen) { this.busy = false; this.next(); }
    }
  }
}

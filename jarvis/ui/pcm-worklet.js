// Wandelt Mikrofon-Audio in 16-kHz-PCM (16 Bit, mono) für Deepgram um.
// Schickt alle ~100 ms ein Paket an den Hauptthread.
class Pcm16Worklet extends AudioWorkletProcessor {
  constructor() {
    super();
    this.ratio = sampleRate / 16000;
    this.pos = 0;
    this.out = new Int16Array(1600);
    this.n = 0;
  }

  process(inputs) {
    const input = inputs[0]?.[0];
    if (!input) return true;
    // Einfaches Heruntertakten durch Mitteln der Samples pro Ziel-Sample
    while (this.pos < input.length) {
      const start = Math.floor(this.pos);
      const end = Math.min(input.length, Math.floor(this.pos + this.ratio));
      let sum = 0;
      for (let i = start; i < end; i++) sum += input[i];
      const v = end > start ? sum / (end - start) : input[start];
      this.out[this.n++] = Math.max(-1, Math.min(1, v)) * 0x7fff;
      if (this.n === this.out.length) {
        this.port.postMessage(this.out.buffer, [this.out.buffer]);
        this.out = new Int16Array(1600);
        this.n = 0;
      }
      this.pos += this.ratio;
    }
    this.pos -= input.length;
    return true;
  }
}

registerProcessor("pcm16", Pcm16Worklet);

# Voice – Sprach-Pipeline

Phase 3. Siehe [`../docs/architektur.md`](../docs/architektur.md#schicht-2--stimme).

Geplante Schnittstelle (austauschbare Anbieter):

```ts
interface STTProvider { transcribe(audio: AsyncIterable<Buffer>): AsyncIterable<{ text: string; final: boolean }> }
interface TTSProvider { speak(text: string): AsyncIterable<Buffer> }
```

Start-Implementierung: Deepgram (STT) + ElevenLabs (TTS). Keys in `config/.env`.

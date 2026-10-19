# Voice – Sprach-Pipeline

**Heute (v1):** Browser-Sprach-APIs in `ui/app.js` (Abschnitte „Sprachausgabe“ und „Spracheingabe“).

Phase 3 ersetzt sie durch Server-Sprache. Siehe [`../docs/architektur.md`](../docs/architektur.md#schicht-2--stimme).

Geplante Schnittstelle (austauschbare Anbieter):

```ts
interface STTProvider { transcribe(audio: AsyncIterable<Buffer>): AsyncIterable<{ text: string; final: boolean }> }
interface TTSProvider { speak(text: string): AsyncIterable<Buffer> }
```

Start-Implementierung: Deepgram (STT) + ElevenLabs (TTS). Keys in `config/.env`.

Umbau: In `ui/app.js` werden `speak()` und `startListening()` durch einen WebSocket zum Server
ersetzt (`/api/voice`), der Audio an Deepgram schickt und ElevenLabs-Audio zurückstreamt.
Der echte Audiopegel geht dann an `Orb.setLevel()`.

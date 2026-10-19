# Voice – Sprach-Pipeline

So läuft ein Satz durch Jarvis:

```
Handy-Mikrofon ──PCM 16 kHz──► Server ──► Deepgram (hört, live, nova-3, Deutsch)
                                              │ Text, noch während gesprochen wird
                                              ▼
                                         Gemini Flash (antwortet, entscheidet)
                                              │            └─► Auftrag an Claude Sonnet (arbeitet,
                                              │                 im Hintergrund, meldet sich selbst)
                                              ▼ Text, satzweise
Handy-Lautsprecher ◄──Audio── Server ◄── ElevenLabs (spricht, eleven_flash_v2_5)
Orb ◄── echter Pegel der Stimme / des Mikrofons
```

| Datei | Inhalt |
|-------|--------|
| `server/src/voice.js` | WebSocket `/api/voice`: Deepgram-Verbindung, Satz-Zerlegung, ElevenLabs, Unterbrechen |
| `ui/pcm-worklet.js` | Mikrofon → 16-kHz-PCM im Browser |
| `ui/app.js` | Abschnitte „Sprach-Verbindung“, „Audio“, „Spracheingabe“ |

- **Latenz:** Jeder fertige Satz geht sofort an ElevenLabs (parallel), die Audiostücke kommen in
  Reihenfolge zurück. Jarvis beginnt zu sprechen, bevor die Antwort fertig geschrieben ist.
- **Unterbrechen:** Orb antippen → Ton stoppt sofort, die Antwort wird abgebrochen.
- **Ersatz:** Ohne `DEEPGRAM_API_KEY` bzw. `ELEVENLABS_API_KEY` nutzt die App automatisch die
  Spracherkennung bzw. Sprachausgabe des Browsers.
- **Einstellungen:** `DEEPGRAM_MODEL`, `ELEVENLABS_VOICE_ID`, `ELEVENLABS_MODEL` in `config/.env`.

Nächste Ausbaustufe: Wake-Word „Jarvis“ (freihändig), Push-Benachrichtigung, wenn ein Auftrag fertig ist.

# Voice – Sprach-Pipeline

So läuft ein Satz durch Vertex:

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
  Reihenfolge zurück. Vertex beginnt zu sprechen, bevor die Antwort fertig geschrieben ist.
- **Hörfehler:** Deutsche Spracherkennung verhört sich zuverlässig („Wiels“ statt „Reels“). Zwei Ebenen:
  Deepgram bekommt die Wörterbuch-Begriffe vorab als `keyterm`, und `server/src/woerterbuch.js` korrigiert
  jeden erkannten Satz, **bevor** das Modell ihn sieht. Die Wörter sind Daten im Gedächtnis
  (`team/woerterbuch.md`, `ich/woerterbuch.md`) – Vertex ergänzt sie selbst, wenn man ihn korrigiert.
  Die App zeigt jede Korrektur an („↺ verstanden als: Wiels → Reels“).
- **Unterbrechen:** Orb antippen → Ton stoppt sofort, die Antwort wird abgebrochen.
- **Ersatz:** Ohne `DEEPGRAM_API_KEY` bzw. `ELEVENLABS_API_KEY` nutzt die App automatisch die
  Spracherkennung bzw. Sprachausgabe des Browsers.
- **Einstellungen:** `DEEPGRAM_MODEL`, `ELEVENLABS_VOICE_ID`, `ELEVENLABS_MODEL` in `config/.env`.

Nächste Ausbaustufe: Wake-Word „Vertex“ (freihändig), Push-Benachrichtigung, wenn ein Auftrag fertig ist.

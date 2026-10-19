# Architektur

## Grundprinzip

**Das Gehirn sind Dateien.** Persönlichkeit, Regeln und Wissen liegen als Markdown in Git.
Jede Schicht – Claude Code im Terminal, der Sprach-Server, die Handy-App – liest dieselben
Dateien. Dadurch ist Jarvis überall derselbe und kein Wissen hängt an einem einzelnen Chat.

## Schicht 1 – Gehirn

- **Laufzeit heute:** Claude Code, gestartet in `jarvis/`. `CLAUDE.md` importiert
  `core/personality.md`, `core/rules.md`, `brain/jetzt.md` und `brain/profil/ueber-mich.md`.
  Der Rest von `brain/` wird bei Bedarf gelesen (spart Kontext).
- **Laufzeit später (Server):** ein kleiner Kern-Dienst `core-server` auf Basis des
  **Claude Agent SDK**. Er lädt dieselbe `CLAUDE.md`, dieselben Skills und dieselben
  Werkzeuge – nur ohne Terminal, angesprochen über WebSocket/HTTP.
- **Persistenz:** `brain/` ist ein Git-Repo. Der Server committet Änderungen automatisch
  (z. B. „jarvis: merken – neues Projekt X“). Dadurch ist jede Gedächtnisänderung nachvollziehbar
  und rückgängig zu machen.
- **Proaktivität:** ein Scheduler (Cron auf dem Server oder geplante Aufgaben in Claude Code)
  löst zu festen Zeiten Skills aus: `briefing` morgens, später `tagesabschluss` abends,
  `wochenrueckblick` sonntags. Ergebnis geht als Push/Sprachnachricht aufs Handy.

## Schicht 2 – Stimme

```
Handy/PC (PWA mit Orb)                    Server
──────────────────────                    ──────────────────────────────
Mikrofon ──audio stream──► WebSocket ──► Deepgram (STT, streaming)
                                              │ Transkript
                                              ▼
                                         core-server (Claude + Gehirn)
                                              │ Antworttext (gestreamt, satzweise)
                                              ▼
Lautsprecher ◄──audio stream── WebSocket ◄── ElevenLabs (TTS, streaming)
Orb ◄── Pegel/Zustand (idle | hört zu | denkt | spricht)
```

- **Austauschbar** über eine kleine Schnittstelle in `voice/`:
  `STTProvider.transcribe(stream)` und `TTSProvider.speak(text) → stream`.
  Alternativen: OpenAI Whisper / Realtime, Azure Speech, lokal Whisper.cpp + Piper.
- **Latenz:** Antworttext satzweise an TTS geben, nicht auf die volle Antwort warten.
  Ziel < 1,5 s bis zum ersten Ton.
- **Sprachmodus-Flag:** Der Server markiert Eingaben als `[Sprachmodus]`, damit Jarvis laut
  `personality.md` kurz und ohne Markdown antwortet.
- **Handy:** Die UI wird als **PWA** gebaut (installierbar auf iOS/Android, Mikrofon über
  Browser-API). Später optional native App, wenn Hintergrund-Wake-Word nötig ist.
- **Wake-Word (optional):** „Jarvis“ via Picovoice Porcupine oder openWakeWord lokal im Client.

## Schicht 3 – Hand

```
Server (core-server) ──Tool-Call──► Hand-Agent auf dem PC  (baut ausgehende WebSocket-
                                    Verbindung zum Server auf → kein offener Port am PC)
                                        ├─ Browser: Playwright (eigenes Chrome-Profil)
                                        ├─ Desktop: Claude Computer Use (Screenshot + Maus/Tastatur)
                                        └─ System: Apps öffnen, Dateien, Shell (Allowlist)
```

- **Warum ein Agent auf dem PC?** Der Server läuft dauerhaft in der Cloud, aber den Rechner
  steuern kann nur etwas, das *auf* dem Rechner läuft. Der Hand-Agent meldet sich beim Server
  an und nimmt Aufträge entgegen. So kann der Master per Handy sagen „Öffne mir das Dashboard“,
  und der PC zu Hause tut es.
- **Werkzeuge als MCP-Server:** Browser- und Computer-Steuerung werden als MCP-Tools angeboten.
  Dann funktionieren sie identisch in Claude Code (lokal) und im Agent-SDK-Server.
- **Sicherheit:** Die Stufen 🟢/🟡/🔴 aus `core/rules.md` werden im Agent technisch erzwungen,
  nicht nur per Prompt: 🔴-Aktionen brauchen eine Bestätigung, die auf dem Handy angezeigt wird.
  Inhalte von Webseiten gelten als Daten, nie als Befehle.
- **Handy steuern (später):** Android über ADB / Accessibility-Service, iOS über
  Kurzbefehle (Shortcuts), die per URL/Webhook ausgelöst werden.

## Deployment (dauerhaft laufend)

- Ein kleiner VPS (z. B. Hetzner) oder ein Heimserver, Docker Compose mit:
  `core-server`, `voice-gateway`, `ui` (statisch), Caddy (HTTPS).
- Zugriff nur mit `JARVIS_AUTH_TOKEN`, besser zusätzlich über Tailscale (privates Netz).
- `brain/` als privates Git-Repo, automatisches Pushen als Backup.

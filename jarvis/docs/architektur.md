# Architektur

## Grundprinzip

**Das Gehirn sind Dateien.** Persönlichkeit, Regeln und Fähigkeiten liegen als Markdown in `core/`
(im Git). Das Wissen über die Menschen liegt als Markdown in `data/` (nur auf dem Server).
Claude liest und schreibt dieses Wissen selbst über das **Memory-Tool**.

## Schicht 1 – Gehirn

```
Anfrage von Nutzer X
  └─ Server baut System-Prompt:
       [1] core/personality.md + rules.md + faehigkeiten/*.md   (stabil, gecacht)
       [2] Situation: Uhrzeit, Name, Anrede, Sprach-/Textmodus, Team
           + Kurzüberblick: ich/jetzt.md, ich/profil/ueber-mich.md, team/business/ueberblick.md
           + Dateiliste des Gedächtnisses
  └─ Verlauf: letzte 40 Nachrichten von X (nur Text)
  └─ Claude (claude-opus-5-5, adaptive thinking, effort low) mit Werkzeug memory_20250818
       ↺ view / create / str_replace / insert / delete / rename
         /memories/ich/**   → data/users/<X>/ich/**   (nur X)
         /memories/team/**  → data/team/**            (alle)
  └─ Antwort wird Stück für Stück (SSE) an die App gestreamt
```

- **Lernen:** Die Regeln sagen Claude, wann es was wohin speichert. Es lernt nebenbei aus jedem
  Gespräch, ohne zu verhören. In der App ist sichtbar, wann Jarvis etwas ins Gedächtnis schreibt
  (◎ Gedächtnis), und alles lässt sich unter ◎ ansehen und von Hand korrigieren.
- **Mehrere Nutzer:** Jedes Profil hat ein eigenes Gedächtnis und einen eigenen Verlauf.
  Das Team-Gedächtnis (Business, Kunden, Projekte, Prozesse) teilen alle.
- **Proaktivität:** Beim ersten Öffnen am Tag gibt Jarvis automatisch ein Briefing
  (abschaltbar). Später zusätzlich zeitgesteuert per Push.
- **Sicherheit:** Pfade werden auf den jeweiligen Bereich begrenzt (auch gegen `..` und Symlinks),
  nur `.md`/`.txt`. Passwörter als scrypt-Hash, Sitzungen als signiertes Token (30 Tage).
  Optional Team-Code für die Registrierung. Fällt Claude eine Anfrage ab, springt der
  serverseitige Fallback (`fallbacks: "default"`) ein.

## Schicht 2 – Stimme

```
Handy/PC (PWA mit Orb)                    Server
──────────────────────                    ──────────────────────────────
Mikrofon ──audio stream──► WebSocket ──► Deepgram (STT, streaming)
                                              │ Transkript
                                              ▼
                                         Jarvis-Server (Claude + Gehirn)
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
- **Heute (v1):** Spracherkennung und -ausgabe des Browsers (Web Speech API), satzweise
  vorgelesen, Orb-Pegel vom Mikrofon. Kostenlos, Qualität hängt vom Gerät ab.
- **Handy:** Die UI ist bereits eine **PWA** (installierbar auf iOS/Android, Mikrofon über
  Browser-API). Später optional native App, wenn Hintergrund-Wake-Word nötig ist.
- **Wake-Word (optional):** „Jarvis“ via Picovoice Porcupine oder openWakeWord lokal im Client.

## Schicht 3 – Hand

```
Jarvis-Server ──Tool-Call──► Hand-Agent auf dem PC  (baut ausgehende WebSocket-
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

- Ein kleiner VPS (z. B. Hetzner, ~5 €/Monat) oder ein Heimserver.
- `docker compose up -d` startet Jarvis; `data/` liegt als Volume daneben.
- Davor Caddy für HTTPS (Pflicht fürs Mikrofon am Handy), z. B. `jarvis.deine-domain.de`.
- `JARVIS_TEAM_CODE` setzen, damit sich nur das Team registrieren kann.
- Backup: `data/` regelmäßig sichern (z. B. nächtlich als verschlüsseltes Archiv oder in ein **privates** Git-Repo).

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
  └─ Gemini Flash mit Funktion gedaechtnis (ohne Gemini-Schlüssel: Claude mit memory_20250818)
       ↺ view / create / str_replace / insert (Claude zusätzlich delete / rename)
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

## Schicht 2 – Stimme und Arbeitsteilung

```
Handy/PC (PWA mit Orb)                     Server
──────────────────────                     ─────────────────────────────────────────
Mikrofon ──PCM 16 kHz──► WebSocket ──► Deepgram nova-3 (live, Deutsch)
                         /api/voice          │ Transkript (Endpunkt nach ~0,4 s Stille)
                                             ▼
                                        Gemini Flash  ── Gesprächsmodus (core/modus/gespraech.md)
                                          │   ├─ gedaechtnis(...)        → /memories
                                          │   └─ auftrag_an_claude(...)  → Claude Sonnet (worker.js)
                                          │        Arbeitsmodus: Websuche, Seiten lesen, Gedächtnis
                                          │        → fertig: Ergebnis in den Chat + Gemini meldet es
                                          ▼ Text, satzweise
Lautsprecher ◄──Audio── WebSocket ◄── ElevenLabs flash v2.5 (parallel pro Satz, in Reihenfolge)
Orb ◄── echter Pegel (Mikrofon beim Zuhören, Stimme beim Sprechen)
```

- **Warum zwei Modelle?** Gemini Flash antwortet in Sekundenbruchteilen – gut fürs Gespräch.
  Claude Sonnet ist gründlicher und kann im Internet recherchieren – gut für echte Arbeit.
  Gemini entscheidet selbst, wann es abgibt, und sagt dem Nutzer Bescheid.
- **Meldet sich von selbst:** Ist ein Auftrag fertig, schickt der Server das Ergebnis an alle
  offenen Geräte des Nutzers und Jarvis fasst es laut zusammen. Ist kein Gerät offen, kommt es
  beim nächsten Öffnen ins Briefing.
- **Austauschbar:** Modelle über `GEMINI_MODEL`, `CLAUDE_WORKER_MODEL`, `DEEPGRAM_MODEL`,
  `ELEVENLABS_MODEL`. Jeder Dienst ist optional (Ersatz: Browser-Sprache bzw. Claude allein).
- **Wake-Word (später):** „Jarvis“ via Picovoice Porcupine oder openWakeWord lokal im Client.

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

- `docker compose up -d --build` startet zwei Container: **jarvis** (Node-Server) und **caddy**
  (HTTPS mit automatischem Let's-Encrypt-Zertifikat für `JARVIS_DOMAIN`, leitet auch den
  WebSocket durch).
- `deploy/install.sh` richtet einen frischen Ubuntu-Server in einem Schritt ein.
- `data/` liegt als Volume neben dem Code; `deploy/backup.sh` sichert es.
- `JARVIS_TEAM_CODE` schützt die Registrierung.

Schritt-für-Schritt: [`server-einrichten.md`](server-einrichten.md)

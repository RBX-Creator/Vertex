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
  Gespräch, ohne zu verhören. In der App ist sichtbar, wann Vertex etwas ins Gedächtnis schreibt
  (◎ Gedächtnis), und alles lässt sich unter ◎ ansehen und von Hand korrigieren.
- **Mehrere Nutzer:** Jedes Profil hat ein eigenes Gedächtnis und einen eigenen Verlauf.
  Das Team-Gedächtnis (Business, Kunden, Projekte, Prozesse) teilen alle.
- **Proaktivität:** Beim ersten Öffnen am Tag gibt Vertex automatisch ein Briefing
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
  offenen Geräte des Nutzers und Vertex fasst es laut zusammen. Ist kein Gerät offen, kommt es
  beim nächsten Öffnen ins Briefing.
- **Austauschbar:** Modelle über `GEMINI_MODEL`, `CLAUDE_WORKER_MODEL`, `DEEPGRAM_MODEL`,
  `ELEVENLABS_MODEL`. Jeder Dienst ist optional (Ersatz: Browser-Sprache bzw. Claude allein).
- **Sprechtext:** Bevor ein Satz zur Stimme geht, bereitet `server/src/sprechtext.js` ihn auf:
  „119,99 €“ → „119 Euro 99“, „19.10.2026“ → „19. Oktober 2026“, „13:00“ → „13 Uhr“, „ca.“ → „circa“,
  Einheiten, Prozent, Listen, Links. Satzgrenzen erkennt `satzEnde()` – kein Abbruch bei „z. B.“ oder „19.10.“.
  Dieselbe Datei nutzen Web-App (Browser-Stimme) und Pocket (`node pocket/sync-sprechtext.mjs`).
  Tests: `cd server && npm test`. ElevenLabs bekommt zusätzlich `language_code` (Deutsch) und den
  vorigen Satz als Kontext, damit Tonfall und Tempo über Satzgrenzen gleich bleiben.
- **Wake-Word (später):** „Vertex“ via Picovoice Porcupine oder openWakeWord lokal im Client.

## Schicht 3 – Hände, Augen, Anbindungen

- **Hände (Server):** `browser.js` – Chromium auf dem Server, gesteuert vom Arbeitsmodus über das
  Werkzeug `browser`. Pro Person ein Profil. 🔴-Aktionen technisch gesperrt ohne `freigabe` im Auftrag.
  Details: [`../hand/README.md`](../hand/README.md).
- **Augen:** Die App verkleinert Fotos (max. 1280 px, JPEG) und schickt sie über `/api/voice`.
  Gemini bekommt das Bild als `inlineData`; die Fähigkeit `augen.md` sagt, was zu tun ist
  (Essen → `/memories/ich/tracking/ernaehrung/…`, Ware → Marktwert-Auftrag, Belege → Zahlen/Aufgaben).
  Fotos werden nicht gespeichert, nur das Ergebnis.
- **Gedächtnis-Anbindungen:** `verbindungen.js` – Kalender per ICS-Abo-Link (inkl. Serienterminen),
  Postfach per IMAP (lesen ohne als gelesen zu markieren, Entwürfe ablegen). Zugangsdaten in
  `data/users/<id>/verbindungen.json` (Rechte 600), nie an App oder KI zurückgegeben.
  Werkzeuge `kalender`, `postfach`, `mail_entwurf` stehen Gemini und Claude zur Verfügung (`tools.js`).

## Deployment (dauerhaft laufend)

- `docker compose up -d --build` startet zwei Container: **vertex** (Node-Server) und **caddy**
  (HTTPS mit automatischem Let's-Encrypt-Zertifikat für `VERTEX_DOMAIN`, leitet auch den
  WebSocket durch).
- `deploy/install.sh` richtet einen frischen Ubuntu-Server in einem Schritt ein.
- `data/` liegt als Volume neben dem Code; `deploy/backup.sh` sichert es.
- `VERTEX_TEAM_CODE` schützt die Registrierung.

Schritt-für-Schritt: [`server-einrichten.md`](server-einrichten.md)

# Vertex – Entwicklerhinweise für Claude Code

Dieses Verzeichnis ist der Quellcode von Vertex, einem persönlichen KI-Assistenten fürs Team.
Hier wird an Vertex **gebaut** – Vertex selbst läuft im Server (`server/`), nicht in Claude Code.

## Aufbau
- `core/` – Persönlichkeit, Regeln, Fähigkeiten. Wird zur Laufzeit als System-Prompt geladen.
  Änderungen hier ändern sofort Vertex' Verhalten (kein Neustart nötig).
- `brain-template/` – Vorlage fürs Gedächtnis (`ich/` pro Person, `team/` geteilt).
- `server/src/` – Node 22, ESM, Express 5, `@anthropic-ai/sdk`.
  - `index.js` HTTP-API + SSE-Streaming · `vertex.js` Prompt, Routing (Gemini/Claude/Demo), Briefing
  - `gemini.js` Gesprächsmodus (Gemini Flash, Funktionen: gedaechtnis, auftrag_an_claude, auftraege)
  - `worker.js` Arbeitsmodus (Claude Sonnet, Memory-Tool + Websuche), Aufträge in data/users/<id>/auftraege.json
  - `voice.js` WebSocket /api/voice: Deepgram (STT), ElevenLabs (TTS), Fotos, Unterbrechen, Auftrags-Meldungen
  - `browser.js` Hände: Chromium (playwright-core) mit 🔴-Sperre · `verbindungen.js` Kalender (ICS) + Postfach (IMAP)
  - `tools.js` gemeinsame Werkzeuge (kalender, postfach, mail_entwurf + Business) für Gemini und Claude
  - `business.js` Rechner, Gewinn, Lager, Kunden, Aufgaben, Ernährung (Geld in Cent, Listen in data/team-listen
    und data/users/<id>/listen, atomar geschrieben) – gleiche Werkzeuge wie in `pocket/`
  - `sprechtext.js` Text fürs Vorlesen aufbereiten (Geld, Datum, Einheiten …), auch für Pocket und Web-App
  - `brain.js` Memory-Tool-Backend (`/memories/ich`, `/memories/team`) mit Pfad-Sandbox
  - `users.js` Profile, scrypt-Passwörter, signierte Tokens
- `ui/` – Web-App ohne Build-Schritt (Vanilla JS): `orb.js`, `app.js`, `pcm-worklet.js`, `style.css`.
- `deploy/` – install.sh / update.sh / backup.sh, Caddyfile. Anleitung: `docs/server-einrichten.md`.
- `data/` – Laufzeitdaten, nie committen.

## Regeln
- Persönlichkeit nur in `core/personality.md` ändern – nirgendwo duplizieren.
- Keine echten Personen- oder Business-Daten ins Repo (es ist öffentlich). Die gehören nach `data/`.
- Gedächtnis-Pfade immer über `brain.js` auflösen (Sandbox!), nie direkt aus Nutzereingaben.
- Testen: `cd server && npm test` (node:test) und `VERTEX_DEMO=1 npm start` → http://localhost:3000.
  Für Tests ohne echte Schlüssel lassen sich alle Dienste umleiten:
  `GEMINI_BASE_URL`, `ANTHROPIC_BASE_URL`, `DEEPGRAM_URL`, `ELEVENLABS_URL`.
- `pocket/vertex-pocket.html` ist eine claude.ai-Seite ohne Server. Den Sprechtext dort nicht von Hand ändern,
  sondern `node pocket/sync-sprechtext.mjs`. Business-Werkzeuge in Pocket und `business.js` gleich halten.

## Roadmap
Siehe `docs/roadmap.md`. Nächster Schritt: Hand-Agent auf dem PC (`hand/`).

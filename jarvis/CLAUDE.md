# Jarvis – Entwicklerhinweise für Claude Code

Dieses Verzeichnis ist der Quellcode von Jarvis, einem persönlichen KI-Assistenten fürs Team.
Hier wird an Jarvis **gebaut** – Jarvis selbst läuft im Server (`server/`), nicht in Claude Code.

## Aufbau
- `core/` – Persönlichkeit, Regeln, Fähigkeiten. Wird zur Laufzeit als System-Prompt geladen.
  Änderungen hier ändern sofort Jarvis' Verhalten (kein Neustart nötig).
- `brain-template/` – Vorlage fürs Gedächtnis (`ich/` pro Person, `team/` geteilt).
- `server/src/` – Node 22, ESM, Express 5, `@anthropic-ai/sdk`.
  - `index.js` HTTP-API + SSE-Streaming · `jarvis.js` Prompt + Tool-Schleife + Demo-Modus
  - `brain.js` Memory-Tool-Backend (`/memories/ich`, `/memories/team`) mit Pfad-Sandbox
  - `users.js` Profile, scrypt-Passwörter, signierte Tokens
- `ui/` – Web-App ohne Build-Schritt (Vanilla JS): `orb.js`, `app.js`, `style.css`.
- `data/` – Laufzeitdaten, nie committen.

## Regeln
- Persönlichkeit nur in `core/personality.md` ändern – nirgendwo duplizieren.
- Keine echten Personen- oder Business-Daten ins Repo (es ist öffentlich). Die gehören nach `data/`.
- Gedächtnis-Pfade immer über `brain.js` auflösen (Sandbox!), nie direkt aus Nutzereingaben.
- Testen: `cd server && JARVIS_DEMO=1 npm start` → http://localhost:3000.

## Roadmap
Siehe `docs/roadmap.md`. Nächste Schritte: Stimme über Deepgram/ElevenLabs (`voice/`),
dann Hand-Agent (`hand/`).

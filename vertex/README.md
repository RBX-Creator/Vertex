# VERTEX – persönlicher KI-Assistent fürs Team

**Der Server ist der Rahmen** – alles lebt darin und läuft durch, ohne dass man etwas anschalten muss.

| Baustein | Was er tut | Umsetzung |
|----------|-----------|-----------|
| **Kopf** – denkt und entscheidet | Schnelles Modell fürs Gespräch, starkes für die Arbeit | Gemini Flash (Gespräch) · Claude Sonnet (Aufträge im Hintergrund) |
| **Stimme** – hört und spricht | Sprache rein, Stimme raus, oranger Orb | Deepgram (hört) · ElevenLabs (spricht) |
| **Hände** – erledigt statt bespricht | Öffnet Seiten, legt in den Warenkorb, schreibt Mails, plant Content | Browser auf dem Server · Mail-Entwürfe · Content-Plan · 🔴 nur mit Freigabe |
| **Augen** – sieht, was du siehst | Kamera aufs Essen → Nährwerte im Tracking; Ware, Belege erkennen | Foto aus der App → Gemini Vision |
| **Gedächtnis** – kennt dein Geschäft | Kunden, Kalender, Postfach, Zahlen – ohne dass du etwas erklärst | Gedächtnis pro Person + Team · Kalender (ICS) · Postfach (IMAP) |

```
Du sprichst → Deepgram → Gemini Flash ──────────────────────────→ ElevenLabs → du hörst
                            ├─ Gedächtnis · Kalender · Postfach
                            └─ Auftrag → Claude Sonnet (Websuche, Browser, Mail-Entwürfe)
                                           └─ meldet sich von selbst, wenn fertig
```

**Auf einen Server bringen (für Handy):** [`docs/server-einrichten.md`](docs/server-einrichten.md)

## Schnellstart

```bash
cd vertex/server
npm install
cp ../config/.env.example ../config/.env   # Schlüssel eintragen (Gemini, Anthropic, Deepgram, ElevenLabs)
npm start                                  # → http://localhost:3000
```

Jeder Dienst ist optional – fehlt ein Schlüssel, nimmt Vertex den Ersatz (Browser-Sprache,
Claude statt Gemini). Ganz ohne Schlüssel läuft der **Demo-Modus**.

Dann: Profil anlegen → Orb antippen → reden. Vertex lernt aus jedem Gespräch.

## Ordner

| Pfad | Zweck |
|------|-------|
| `core/personality.md` | **Die** Persönlichkeit. Einzige Quelle, bei jeder Anfrage geladen. |
| `core/rules.md` | Grundregeln: Gedächtnis (wer/was/wohin), Ehrlichkeit, Sicherheitsstufen für die Hand, Privatsphäre. |
| `core/faehigkeiten/` | Fähigkeiten: Briefing, Merken, Kennenlernen. Neue einfach als `.md` dazulegen. |
| `brain-template/` | Vorlage fürs Gedächtnis: `ich/` wird pro neuem Profil kopiert, `team/` einmal fürs Team. |
| `server/` | Node-Server: Profile, Gedächtnis-Werkzeug, Gemini (Gespräch), Claude (Aufträge), Sprach-Hub (Deepgram/ElevenLabs). |
| `ui/` | Web-App mit Orb (auch als App aufs Handy installierbar). |
| `core/modus/` | Anweisungen für Gesprächsmodus (Gemini) und Arbeitsmodus (Claude). |
| `voice/` | Beschreibung der Sprach-Pipeline. |
| `hand/` | Plan für die Computersteuerung (Phase 4). |
| `deploy/` | Installations-, Update- und Backup-Skript, Caddy-Konfiguration (HTTPS). |
| `server/src/browser.js` | Die Hände: Chromium auf dem Server, mit Sperre für 🔴-Aktionen. |
| `server/src/verbindungen.js` | Kalender (ICS) und Postfach (IMAP) pro Person. |
| `config/.env.example` | Alle Einstellungen. Echte Werte in `config/.env` (nicht im Git). |
| `data/` | **Laufzeitdaten** – Profile, Gedächtnisse, Verläufe. Wird nie committet. |
| `Dockerfile`, `docker-compose.yml` | Dauerbetrieb auf einem Server (Vertex + Caddy). |
| `docs/` | Architektur und Roadmap. |

## Datenschutz

Persönliche Daten liegen ausschließlich in `data/` auf **deinem** Server – nicht im Git-Repo,
nicht bei einem Anbieter. Ehrlich dazu: Was Vertex gerade verarbeitet (dein Satz, ein Foto, eine Mail),
geht zum Beantworten an die jeweilige KI-API (Google, Anthropic, Deepgram, ElevenLabs). Gespeichert
wird es nur bei dir.
Jede Person sieht nur ihr eigenes Gedächtnis (`ich`) und das gemeinsame Team-Gedächtnis (`team`).
Auf einem öffentlich erreichbaren Server **immer** `VERTEX_TEAM_CODE` setzen und HTTPS verwenden.

Details: [`docs/architektur.md`](docs/architektur.md) · [`docs/roadmap.md`](docs/roadmap.md)

# JARVIS – persönlicher KI-Assistent fürs Team

Wie ein Satz durch Jarvis läuft:

```
   Handy / PC (Web-App mit orangem Orb)
        │ Sprache                                             ▲ Stimme
        ▼                                                     │
┌──────────────────────────── Server (läuft dauerhaft) ───────┴──────────────────┐
│  Deepgram      → hört      (Sprache wird Text, noch während du redest)         │
│  Gemini Flash  → antwortet (führt das Gespräch, entscheidet, was zu tun ist)   │
│  Claude Sonnet → arbeitet  (übernimmt alles, was länger dauert, meldet sich)   │
│  ElevenLabs    → spricht   (aus der Antwort wird seine Stimme)                 │
│                                                                                │
│  Gehirn: core/ (Persönlichkeit, Regeln) + Gedächtnis pro Person + Team         │
│  Hand:   später Agent auf dem PC (Browser, Apps) – siehe hand/                 │
└────────────────────────────────────────────────────────────────────────────────┘
```

**Auf einen Server bringen (für Handy):** [`docs/server-einrichten.md`](docs/server-einrichten.md)

## Schnellstart

```bash
cd jarvis/server
npm install
cp ../config/.env.example ../config/.env   # Schlüssel eintragen (Gemini, Anthropic, Deepgram, ElevenLabs)
npm start                                  # → http://localhost:3000
```

Jeder Dienst ist optional – fehlt ein Schlüssel, nimmt Jarvis den Ersatz (Browser-Sprache,
Claude statt Gemini). Ganz ohne Schlüssel läuft der **Demo-Modus**.

Dann: Profil anlegen → Orb antippen → reden. Jarvis lernt aus jedem Gespräch.

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
| `config/.env.example` | Alle Einstellungen. Echte Werte in `config/.env` (nicht im Git). |
| `data/` | **Laufzeitdaten** – Profile, Gedächtnisse, Verläufe. Wird nie committet. |
| `Dockerfile`, `docker-compose.yml` | Dauerbetrieb auf einem Server (Jarvis + Caddy). |
| `docs/` | Architektur und Roadmap. |

## Datenschutz

Persönliche Daten liegen ausschließlich in `data/` auf dem Server – nicht im Git-Repo.
Jede Person sieht nur ihr eigenes Gedächtnis (`ich`) und das gemeinsame Team-Gedächtnis (`team`).
Auf einem öffentlich erreichbaren Server **immer** `JARVIS_TEAM_CODE` setzen und HTTPS verwenden.

Details: [`docs/architektur.md`](docs/architektur.md) · [`docs/roadmap.md`](docs/roadmap.md)

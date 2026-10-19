# JARVIS – persönlicher KI-Assistent fürs Team

Drei Schichten, klar getrennt, einzeln austauschbar:

```
   Handy / PC (Web-App mit orangem Orb)
        │  Sprache/Text rein, Text + Sprache raus
        ▼
┌───────────────────────────── Server (läuft dauerhaft) ─────────────────────────────┐
│  GEHIRN   core/ (Persönlichkeit, Regeln, Fähigkeiten)  +  Claude                   │
│           Gedächtnis pro Person  (data/users/<id>/ich)  +  Team (data/team)        │
│  STIMME   heute: Browser-Spracherkennung/-ausgabe · später: Deepgram + ElevenLabs  │
│  HAND     später: Agent auf dem PC (Browser, Apps) – siehe hand/                   │
└────────────────────────────────────────────────────────────────────────────────────┘
```

## Schnellstart

```bash
cd jarvis/server
npm install
cp ../config/.env.example ../config/.env   # ANTHROPIC_API_KEY eintragen
npm start                                  # → http://localhost:3000
```

Ohne API-Schlüssel startet Jarvis im **Demo-Modus** (Oberfläche, Profile und Gedächtnis
funktionieren, Antworten sind vorgefertigt).

Dann: Profil anlegen → Orb antippen → reden. Jarvis lernt aus jedem Gespräch.

## Ordner

| Pfad | Zweck |
|------|-------|
| `core/personality.md` | **Die** Persönlichkeit. Einzige Quelle, bei jeder Anfrage geladen. |
| `core/rules.md` | Grundregeln: Gedächtnis (wer/was/wohin), Ehrlichkeit, Sicherheitsstufen für die Hand, Privatsphäre. |
| `core/faehigkeiten/` | Fähigkeiten: Briefing, Merken, Kennenlernen. Neue einfach als `.md` dazulegen. |
| `brain-template/` | Vorlage fürs Gedächtnis: `ich/` wird pro neuem Profil kopiert, `team/` einmal fürs Team. |
| `server/` | Node-Server: Profile, Anmeldung, Claude-Anbindung, Gedächtnis-Werkzeug, Streaming. |
| `ui/` | Web-App mit Orb (auch als App aufs Handy installierbar). |
| `voice/`, `hand/` | Pläne für Stimme (Phase 3) und Computersteuerung (Phase 4). |
| `config/.env.example` | Alle Einstellungen. Echte Werte in `config/.env` (nicht im Git). |
| `data/` | **Laufzeitdaten** – Profile, Gedächtnisse, Verläufe. Wird nie committet. |
| `Dockerfile`, `docker-compose.yml` | Dauerbetrieb auf einem Server. |
| `docs/` | Architektur und Roadmap. |

## Datenschutz

Persönliche Daten liegen ausschließlich in `data/` auf dem Server – nicht im Git-Repo.
Jede Person sieht nur ihr eigenes Gedächtnis (`ich`) und das gemeinsame Team-Gedächtnis (`team`).
Auf einem öffentlich erreichbaren Server **immer** `JARVIS_TEAM_CODE` setzen und HTTPS verwenden.

Details: [`docs/architektur.md`](docs/architektur.md) · [`docs/roadmap.md`](docs/roadmap.md)

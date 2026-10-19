# JARVIS – persönlicher KI-Assistent

Drei Schichten, klar getrennt, einzeln austauschbar:

```
            ┌──────────────────────────────────────────────┐
            │                 GEHIRN (brain/)              │
            │  Persönlichkeit · Regeln · Second Brain ·    │
            │  Skills  →  Claude Code / Claude Agent SDK   │
            └───────────────▲──────────────┬───────────────┘
                            │ Text          │ Werkzeug-Aufrufe
            ┌───────────────┴───┐   ┌───────▼───────────────┐
            │  STIMME (voice/)  │   │     HAND (hand/)      │
            │ Mikro → STT       │   │ Browser-Automation    │
            │ TTS → Lautsprecher│   │ Computer-Use auf PC   │
            │ Orb-UI (ui/)      │   │ später Handy-Aktionen │
            └───────────────────┘   └───────────────────────┘
```

## Ordnerstruktur

| Pfad                     | Zweck                                                         |
|--------------------------|---------------------------------------------------------------|
| `CLAUDE.md`              | Einstiegspunkt. Claude Code lädt ihn automatisch; er bindet Persönlichkeit, Regeln und Kern-Kontext ein. |
| `core/personality.md`    | **Die** Persönlichkeit. Einzige Quelle – auch der Sprach-Server nutzt sie später als System-Prompt. |
| `core/rules.md`          | Grundregeln: Gedächtnis, Ehrlichkeit, Sicherheitsstufen für die Hand, Privatsphäre. |
| `brain/`                 | Second Brain: Profil, Ziele, Business, Projekte, Aufgaben, Gedächtnis, Journal. |
| `.claude/skills/`        | Fähigkeiten: `briefing`, `merken`, `kennenlernen`. Wachsen mit. |
| `.claude/settings.json`  | Hook, der bei jedem Start Datum, Gehirn-Status und Überfälliges mitgibt. |
| `scripts/`               | Hilfsskripte (z. B. der SessionStart-Hook).                   |
| `ui/`                    | Oberfläche mit orangem Orb (Phase 2).                         |
| `voice/`                 | Sprach-Pipeline (Phase 3).                                    |
| `hand/`                  | Computer- und Browser-Steuerung (Phase 4).                    |
| `config/.env.example`    | Vorlage für API-Keys. Echte Keys nur in `config/.env` (ignoriert). |
| `docs/`                  | Architektur und Roadmap.                                      |

## Benutzen (jetzt schon)

```bash
cd jarvis
claude            # Jarvis startet mit Persönlichkeit + Gedächtnis
```

Dann z. B.: `/kennenlernen`, `/briefing`, „Merk dir, dass …“.

Wichtig: Claude Code **im Ordner `jarvis/`** starten, sonst werden `CLAUDE.md`, Skills und Hook nicht geladen.

Details: [`docs/architektur.md`](docs/architektur.md) · [`docs/roadmap.md`](docs/roadmap.md)

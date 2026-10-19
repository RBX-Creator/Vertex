# Jarvis auf einen Server bringen (für Handy und Dauerbetrieb)

Ziel: Jarvis läuft rund um die Uhr unter einer HTTPS-Adresse. Du öffnest sie auf dem Handy,
legst sie auf den Home-Bildschirm und redest mit ihm – egal wo du bist.

Dauer: ca. 20 Minuten. Kosten: Server ca. 4–6 € im Monat + Nutzung der KI-Dienste.

---

## 1. API-Schlüssel besorgen (je ein Konto)

| Dienst | Aufgabe in Jarvis | Schlüssel holen |
|--------|-------------------|-----------------|
| **Deepgram** | hört zu (Sprache → Text, live) | console.deepgram.com → API Keys |
| **Google Gemini** | antwortet (führt das Gespräch, entscheidet) | aistudio.google.com/apikey |
| **Anthropic Claude** | arbeitet (Recherche, Texte, Analysen im Hintergrund) | console.anthropic.com → API Keys |
| **ElevenLabs** | spricht (Text → Stimme) | elevenlabs.io → Profil → API Keys |

Tipp ElevenLabs: In der Stimmenbibliothek eine Stimme aussuchen, die dir als Jarvis gefällt
(z. B. tief, ruhig, britisch) → „ID kopieren“. Ohne Angabe nimmt Jarvis „George“.

Fehlt ein Schlüssel, läuft Jarvis trotzdem – mit Ersatz:
ohne Deepgram/ElevenLabs → Browser-Sprache, ohne Gemini → Claude führt das Gespräch.

## 2. Server mieten

Empfehlung: **Hetzner Cloud** (hetzner.com/cloud), Standort Deutschland.
- Typ: kleinster mit 2 GB RAM (z. B. CX22) – reicht locker.
- Image: **Ubuntu 24.04**.
- SSH-Schlüssel hinterlegen oder Root-Passwort per Mail bekommen.

Notiere die **IP-Adresse** des Servers (z. B. `49.12.34.56`).

## 3. (Optional) eigene Domain

Wenn du eine Domain hast: einen DNS-Eintrag anlegen
`jarvis.deinedomain.de` → Typ **A** → IP des Servers.

Ohne Domain geht es auch: Jarvis nutzt dann automatisch `49-12-34-56.sslip.io`
(ein kostenloser Dienst, der auf deine IP zeigt). HTTPS funktioniert damit ebenfalls.

## 4. Installieren – ein Befehl

Auf dem Mac/PC ein Terminal öffnen und mit dem Server verbinden:

```bash
ssh root@49.12.34.56
```

Dann:

```bash
curl -fsSL https://raw.githubusercontent.com/RBX-Creator/Vertex/claude/jarvis-ai-assistant-thtjff/jarvis/deploy/install.sh | bash
```

Das Skript installiert Docker, lädt Jarvis, fragt nach Domain und Schlüsseln und startet alles.
Am Ende zeigt es die Adresse und den **Team-Code**.

## 5. Aufs Handy

1. Adresse (`https://…`) auf dem Handy öffnen.
2. „Profil anlegen“ → Name, Passwort, **Team-Code**.
3. **iPhone:** Safari → Teilen → „Zum Home-Bildschirm“.
   **Android:** Chrome → Menü ⋮ → „App installieren“ / „Zum Startbildschirm“.
4. Mikrofon erlauben, Orb antippen, reden.

Teammitglieder machen dasselbe mit ihrem eigenen Namen – jeder bekommt sein eigenes Gedächtnis.

## 6. (Optional) Kalender und Postfach verbinden

In der App: ⚙ → **Verbindungen**. Jede Person verbindet ihren eigenen Kalender und ihr Postfach.
- **Kalender:** den privaten ICS-Abo-Link einfügen (Anleitung steht im Dialog). Jarvis liest Termine
  und nennt sie im Morgen-Briefing.
- **Postfach:** IMAP-Server, E-Mail und ein **App-Passwort** (nicht das normale Passwort).
  Jarvis liest neue Mails und legt Antworten als Entwurf ab – senden tust du selbst.
- „Testen“ zeigt sofort, ob es klappt.

---

## Pflege

| Was | Befehl (auf dem Server) |
|-----|-------------------------|
| Neue Version einspielen | `bash /opt/jarvis/src/jarvis/deploy/update.sh` |
| Schlüssel/Einstellungen ändern | `nano /opt/jarvis/src/jarvis/config/.env`, danach Update-Befehl |
| Logs ansehen | `cd /opt/jarvis/src/jarvis && docker compose logs -f jarvis` |
| Backup jetzt | `bash /opt/jarvis/src/jarvis/deploy/backup.sh` |
| Tägliches Backup | `crontab -e` → `0 3 * * * bash /opt/jarvis/src/jarvis/deploy/backup.sh` |

Alle Profile, Gedächtnisse und Verläufe liegen in `/opt/jarvis/src/jarvis/data/` – das ist das,
was gesichert werden muss.

## Wenn etwas nicht geht

- **Seite lädt nicht / kein HTTPS:** Stimmt der DNS-Eintrag? Sind Port 80 und 443 offen
  (Hetzner-Firewall)? `docker compose logs caddy` zeigt Zertifikatsfehler.
- **Mikrofon geht nicht:** Nur über `https://` möglich. Im Browser Mikrofon für die Seite erlauben.
- **Jarvis antwortet „Schlüssel ungültig“:** Schlüssel in `config/.env` prüfen, dann Update-Befehl.
- **Kein Ton auf dem iPhone:** Stummschalter am Gerät aus? Einmal auf den Orb tippen
  (iOS gibt Ton erst nach einer Berührung frei).

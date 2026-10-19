# UI – der Orb

Web-App, die der Server unter `/` ausliefert. Installierbar auf dem Handy (PWA:
„Zum Home-Bildschirm hinzufügen“).

| Datei | Inhalt |
|-------|--------|
| `index.html` | Anmeldung, Orb-Ansicht, Chat, Einstellungen, Gedächtnis-Ansicht |
| `orb.js` | Der orange Orb (Canvas). Zustände `idle`, `listening`, `thinking`, `speaking`; reagiert auf Pegel |
| `app.js` | Logik: Login/Profil, Streaming vom Server, Spracheingabe/-ausgabe, Einstellungen |
| `style.css` | Design |
| `manifest.webmanifest`, `sw.js`, `icon.svg` | Installierbarkeit als App |

**Bedienung:** Orb antippen → sprechen → Jarvis antwortet und spricht. Während er spricht,
unterbricht ein Tipp auf den Orb. ☰ schaltet den Chat ein, ◎ zeigt das Gedächtnis, ⚙ die Einstellungen.

**Stimme heute:** Browser-Spracherkennung und Browser-Sprachausgabe (kostenlos, Qualität je nach Gerät;
in Chrome und Safari am besten). Mikrofon funktioniert auf dem Handy nur über **HTTPS**.
Später ersetzt durch Deepgram + ElevenLabs – siehe `../voice/README.md`.

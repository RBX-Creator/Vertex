# UI – der Orb

Phase 2. Geplant: eine einzelne Web-App (später PWA) mit großem orangem Orb in der Mitte.

- **Zustände:** `idle` (langsames Atmen), `listening` (reagiert auf Mikrofonpegel),
  `thinking` (rotierendes Glühen), `speaking` (pulsiert mit der TTS-Lautstärke).
- **Modi:** Sprachmodus (nur Orb + Untertitel) und Chatmodus (Orb klein + Verlauf).
- Spricht mit `core-server` über WebSocket. Bis der Server steht: Browser-Spracherkennung
  (Web Speech API) und Browser-TTS als Übergang.

# Jarvis Pocket – ohne Server, ohne API-Schlüssel

Eine einzelne Seite, die als claude.ai-Artifact läuft und direkt das Claude-Konto des Nutzers
verwendet. Gedacht für den Start, solange es keinen eigenen Server gibt.

| Baustein | Umsetzung in Pocket |
|----------|---------------------|
| Kopf | Claude über das eigene Konto (Fähigkeit `sample`, schnell oder „gründlich“) |
| Stimme | Eingabe per iPhone-Diktat (🎤 auf der Tastatur), Ausgabe per Sprachausgabe des Geräts, oranger Orb |
| Augen | Foto aufnehmen → Claude erkennt Essen (Nährwerte ins Tracking), Ware, Belege |
| Gedächtnis | Pro Person privat (`data/users/<id>/…`), `team/business` geteilt |
| Hände | – (eine Artifact-Seite darf nicht ins Internet; dafür braucht es den Server) |
| Hörfehler | Korrektur-Schicht vor dem Senden (Wörterbuch Team + persönlich), lernt aus Korrekturen |
| Selbstkontrolle | automatisch gründlich bei Zahlen, Preisen, Fakten, Fotos; Gespeichertes sichtbar und rückgängig machbar |

Veröffentlicht mit `capabilities: {sample: {images: true}, db: {}, user: {}}`.
Der Persönlichkeits-Prompt ist eine kompakte Fassung von `core/personality.md` und `core/rules.md`.

Später: Wenn ein Server läuft, übernimmt die volle App (`server/`, `ui/`) – das Gedächtnis
lässt sich dann aus der Gedächtnis-Ansicht kopieren.

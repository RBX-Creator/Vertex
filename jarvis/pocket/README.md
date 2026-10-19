# Jarvis Pocket – ohne Server, ohne API-Schlüssel

Eine einzelne Seite, die als claude.ai-Artifact läuft und direkt das Claude-Konto des Nutzers
verwendet. Gedacht für den Start, solange es keinen eigenen Server gibt.

| Baustein | Umsetzung in Pocket |
|----------|---------------------|
| Kopf | Claude über das eigene Konto (Fähigkeit `sample`, schnell oder „gründlich“) |
| Stimme | Eingabe per iPhone-Diktat (🎤 auf der Tastatur) mit Auto-Senden nach einer Sprechpause, Gesprächsmodus; Ausgabe per Sprachausgabe des Geräts, satzweise schon während die Antwort entsteht, oranger Orb |
| Sprechtext | Geld, Datum, Uhrzeit, Einheiten, Abkürzungen werden so vorgelesen, wie man sie sagt (aus `server/src/sprechtext.js`) |
| Stimmenwahl | Beste zuerst (Premium/Erweitert > Siri Martin/Helena > Anna, blecherne Stimmen hinten), „iPhone-Systemstimme“, Tempo und Tonhöhe |
| Werkzeuge | Rechner, Gewinn mit Gebühren und Mindestpreis, Lager (Einkauf, Verkauf, Auswertung pro Monat), Aufgaben mit Fälligkeit, Kunden/Projekte, Ernährung – Zahlen werden gerechnet, nicht geschätzt |
| Heute | Übersicht: offene Aufgaben, Gewinn im Monat, Lagerwert, Kalorien, offene Projekte; CSV-Export für Lager und Kunden |
| Augen | Foto aufnehmen → Claude erkennt Essen (Nährwerte ins Tracking), Ware, Belege |
| Gedächtnis | Pro Person privat (`data/users/<id>/…`), `team/business` geteilt |
| Hände | – (eine Artifact-Seite darf nicht ins Internet; dafür braucht es den Server) |
| Hörfehler | Korrektur-Schicht vor dem Senden (Wörterbuch Team + persönlich), lernt aus Korrekturen |
| Selbstkontrolle | automatisch gründlich bei Zahlen, Preisen, Fakten, Fotos; Gespeichertes sichtbar und rückgängig machbar |

Veröffentlicht mit `capabilities: {sample: {images: true}, db: {}, user: {}, downloads: true}`.
Lager und Kunden sind geteilte Sammlungen (`lager`, `kunden`), Aufgaben privat unter `data/users/<id>/listen/aufgaben`.

Den Sprechtext nicht hier bearbeiten, sondern in `server/src/sprechtext.js` und dann
`node pocket/sync-sprechtext.mjs` ausführen.

Grenzen: Eine Artifact-Seite bekommt kein Mikrofon – gesprochen wird über das Diktat der
iPhone-Tastatur. Selbst geladene Premium-Stimmen zeigt iOS Web-Seiten oft nicht an.
Der Persönlichkeits-Prompt ist eine kompakte Fassung von `core/personality.md` und `core/rules.md`.

Später: Wenn ein Server läuft, übernimmt die volle App (`server/`, `ui/`) – das Gedächtnis
lässt sich dann aus der Gedächtnis-Ansicht kopieren.

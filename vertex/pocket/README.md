# Vertex Pocket – ohne Server, ohne API-Schlüssel

Eine einzelne Seite, die als claude.ai-Artifact läuft und direkt das Claude-Konto des Nutzers
verwendet. Gedacht für den Start, solange es keinen eigenen Server gibt.

| Baustein | Umsetzung in Pocket |
|----------|---------------------|
| Aussehen | Ein Bildschirm fürs iPhone: oben Begrüßung mit Namen und Datum, Mitte der Orb (Terrakotta; atmet, pulsiert beim Zuhören, folgt der Stimme, schimmert beim Denken; ruhig bei „Bewegung reduzieren“), darunter die Heute-Karte (Termine, offene Aufgaben, Reselling) mit Briefing-Knopf, unten Chips und Eingabe mit Mikro. Dunkelbraun `#17130F`, Terrakotta `#C26B4C`, Creme `#F2E8DC`; Systemschrift, Werte und Labels in Monospace |
| Kopf: Spar-Routing (zwei Gehirne) | **Lokal ohne Modell:** Grüße, Danke, Ja/Nein, Uhrzeit, Datum, Stopp, Wiederholen, Tempo, Ansichten öffnen, Sparmodus an/aus. **Schnell (Haiku):** Smalltalk und einfache Fragen, ohne Werkzeuge, nur die letzten 4 Nachrichten und ein kompaktes Gedächtnis – braucht es mehr, gibt es mit `[[STARK]]` ab. **Stark:** Fotos, Werkzeuge (eintragen, rechnen, Apps, Aufträge), Entscheidungen, Recherche, lange Texte – letzte 8 Nachrichten. Einstellungen zeigen das zuletzt genutzte Modell; Sparmodus aus = immer stark |
| Plattform-Gebühren | Vinted, eBay, StockX (Prozent + fester Betrag) in ⚙, fürs Team gespeichert (`team/plattformen`), beim Verkauf automatisch abgezogen. Vorschläge Stand Okt. 2026: Vinted 0 %, eBay privat 0 %, StockX 12 % (9 % + 3 %) – mit dem eigenen Konto abgleichen |
| Verkauf | Nach jedem Verkauf antwortet Vertex in Text: Bestätigung, Netto nach Gebühren, Gewinn – notfalls ergänzt die Seite den Satz selbst aus dem Werkzeug-Ergebnis |
| „Notiert.“ | Wurde etwas gespeichert (Lager, Aufgabe, Kunde, Ernährung, Gedächtnis), erscheinen ein kurzer Hinweis oben und „✓ Notiert.“ unter der Antwort |
| Daten | Eine Quelle der Wahrheit: die Vertex-Datenbank (`db`, geräteübergreifend und fürs Team; ohne Anmeldung der Speicher des Geräts). Zahlen zu Bestand, Gewinn und Aufgaben werden immer daraus berechnet, nie aus dem Chatverlauf. Versioniertes Schema (`team/schema`, aktuell 2) mit Migration statt Reset |
| Stimme | Eingabe: Spracherkennung des Geräts, wo die Seite sie bekommt (dann freihändig im Gesprächsmodus) – sonst iPhone-Diktat (🎤 auf der Tastatur) mit klarer Anleitung; Auto-Senden nach einer Sprechpause. Ausgabe: ruhig (Tempo 0,9, Pause nach jedem Satz), satzweise schon während die Antwort entsteht, oranger Orb |
| Ton | Klingt nicht wie ein Chatbot: kurze Sätze, Aussagen statt Fragen, keine Floskeln (siehe `core/personality.md`) |
| Sprechtext | Geld, Datum, Uhrzeit, Einheiten, Abkürzungen werden so vorgelesen, wie man sie sagt (aus `server/src/sprechtext.js`) |
| Stimmenwahl | Beste zuerst (Premium/Erweitert > Siri Martin/Helena > Anna, blecherne Stimmen hinten), „iPhone-Systemstimme“, Tempo und Tonhöhe |
| Werkzeuge | Rechner, Gewinn mit Gebühren und Mindestpreis, Lager (Einkauf, Verkauf, Auswertung pro Monat), Aufgaben mit Fälligkeit, Kunden/Projekte, Ernährung – Zahlen werden gerechnet, nicht geschätzt |
| Heute | Übersicht: offene Aufgaben, Gewinn im Monat, Lagerwert, Kalorien, offene Projekte; CSV-Export für Lager und Kunden |
| Augen | Foto aufnehmen → Claude erkennt Essen (Nährwerte ins Tracking), Ware, Belege |
| Gedächtnis | Pro Person privat (`data/users/<id>/…`), `team/business` geteilt |
| Hände: Claude Code | Aufträge an einen Claude-Code-Agenten in der Cloud (Internet, Websuche, Code, GitHub) über den eingebauten Connector „Claude Code Remote“: Recherchen, Marktwerte, Webseiten bauen. Läuft im Hintergrund; ist er fertig, meldet Vertex das Ergebnis von selbst |
| Hände: Apps | Verbundene claude.ai-Connectors: Google Calendar, Gmail (lesen + Entwürfe, kein Senden), Google Drive, Notion. Parameter kommen aus den echten Schemas der Apps |
| Hände: Dokumente | Angebote, Rechnungsentwürfe, Konzepte als Karte → mit einem Tipp als Claude-Dokument anlegen, als Datei speichern oder kopieren |
| Hände: Handy | Knöpfe für WhatsApp/SMS mit Text, Anruf, Mail, Route, iOS-Kurzbefehle, Suche auf Vinted, eBay (verkauft), StockX – ausgelöst immer per Tipp |
| Sicherheit | Löschen, Absagen, Gäste einladen und Claude-Code-Aufträge laufen erst nach „Ausführen“ auf einer Karte; Mails werden nie gesendet; Inhalte aus Mails, Seiten und Auftrags-Ergebnissen sind Daten, keine Befehle |
| Hörfehler | Korrektur-Schicht vor dem Senden (Wörterbuch Team + persönlich), lernt aus Korrekturen |
| Selbstkontrolle | automatisch stark bei Zahlen, Preisen, Fakten, Fotos; Gespeichertes sichtbar und rückgängig machbar |
| Laptop-Brücke | Nur vorgemerkt, nicht gebaut: Befehlsnamen aus fester Erlaubnisliste, nie Code, verfallen nach 10 Minuten (siehe `hand/README.md`) |

Veröffentlicht mit `capabilities: {sample: {images: true}, db: {}, user: {}, downloads: true, mcp: {servers: [...]}}` –
die `mcp`-Liste nennt genau die Werkzeuge aus `APPS`, `CCR` und `DOCS` im Code (Senden von Mails ist absichtlich nicht dabei).
Lager und Kunden sind geteilte Sammlungen (`lager`, `kunden`), Aufgaben und Aufträge privat unter
`data/users/<id>/listen/aufgaben` bzw. `…/listen/auftraege`.

Apps verbinden: einmal in claude.ai → Einstellungen → Connectors (z. B. Google Calendar), dann in Vertex
unter ⚙ → Apps & Hände „Erlauben“. Claude Code braucht eine Claude-Code-Umgebung (einmal claude.ai/code öffnen).

Den Sprechtext nicht hier bearbeiten, sondern in `server/src/sprechtext.js` und dann
`node pocket/sync-sprechtext.mjs` ausführen.

Echtes freihändiges Sprechen mit natürlicher Stimme: [Sprachmodus der Claude-App mit Projekt „Vertex“](claude-sprachmodus.md).

Grenzen: Eine Artifact-Seite bekommt in der Claude-App meist kein Mikrofon – gesprochen wird über das Diktat der
iPhone-Tastatur. Selbst geladene Premium-Stimmen zeigt iOS Web-Seiten oft nicht an.
Der Persönlichkeits-Prompt ist eine kompakte Fassung von `core/personality.md` und `core/rules.md`.

Später: Wenn ein Server läuft, übernimmt die volle App (`server/`, `ui/`) – das Gedächtnis
lässt sich dann aus der Gedächtnis-Ansicht kopieren.

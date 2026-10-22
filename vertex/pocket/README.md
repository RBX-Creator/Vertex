# Vertex Pocket – ohne Server, ohne API-Schlüssel

Eine einzelne Seite, die als claude.ai-Artifact läuft und direkt das Claude-Konto des Nutzers
verwendet. Gedacht für den Start, solange es keinen eigenen Server gibt.

| Baustein | Umsetzung in Pocket |
|----------|---------------------|
| Name und Aussehen | Die App heißt **Jarvis** (Titel, Kopf, Begrüßung, Prompts, „Hey Jarvis“); Speicher-Schlüssel (`vertex:…`, Datenbank-Pfade) bleiben, damit alle Daten erhalten sind. **Hell (Standard):** #F4F3F1, Kopf „Jarvis“ mit Status („Tippen zum Sprechen“, „Jarvis spricht“), rechts „verbunden/offline“ und runde Knöpfe (↺ neues Gespräch, 📷, ⚙), matte Terrakotta-Kugel, Start nur mit Kugel und Hinweis; im Gespräch Blasen (du rechts in Terrakotta, Jarvis links in Weiß), unten „Auflegen“ · Eingabe · Mikrofon/Senden (rechtshändig: Senden rechts direkt neben dem Textfeld; Bestätigungskarten mit „Ja“ zuerst und „Nein“ rechtsbündig), schwebende Tab-Leiste: Home, Chat, Sprache, Medien, Gesundheit (Ernährung mit Ringen), Wallet (Lager & Gewinn mit großem Ring, drei kleinen Ringen, Bilanz und „+“). **Dunkel (⚙ → Aussehen):** Partikel-Kugel in Gold/Orange auf blauer Welle, Kennzahlen in Monospace, Panel „Telefonat“ mit VERBUNDEN, Timer, Wellenform und mitlaufendem Text. „Hey Jarvis“ als Wachwort nur, wenn in ⚙ eingeschaltet (Standard: aus) |
| Aufbau | **Werkzeuge rechnen, das Gehirn entscheidet.** 14 Werkzeuge sind echte Funktionen (rechnen, Gewinn, Lager, Gebühren, Aufgaben, Kunden, Kalorien). 7 schnelle Werkzeuge beantworten eindeutige Zahlenfragen direkt, ohne Modell: Gewinn/Umsatz, Bestand, offene Aufgaben, Kalorien, Rechnen, Gebühren, Termine. Das Modell versteht, entscheidet und formuliert – jede Zahl kommt aus einem Werkzeug, dem STAND oder seiner Nachricht. Der **Zahlen-Wächter** prüft Euro, Prozent und kcal in jeder Antwort und markiert sichtbar, was nicht daher stammt (Schätzungen mit „geschätzt“ ausgenommen) |
| Werte ändern | `werte_aendern` setzt, korrigiert, setzt zurück oder löscht alles, was Vertex speichert: Artikel (Preise, Gebühren, Status …), Gewinn und Umsatz eines Monats (als Korrektur, Verkäufe bleiben), Startwerte wie Kontostand, Plattform-Gebühren, Aufgaben, Kunden, ganze Listen. Große Schritte fragen „Sicher? Ja/Nein“ (Knopf, getippt oder gesprochen); danach nennt Vertex genau, was sich geändert hat. **Rückgängig** per Knopf unter der Antwort oder „rückgängig“ – auch nach dem Neuladen (letzte 20 Änderungen auf dem Gerät) |
| Mehr Werkzeuge | Notizen (speichern, lesen, löschen), Erinnerungen (Aufgabe + Wecker/Timer), Mail-Entwurf als Karte (Mail-App oder Kopieren; mit Gmail auch Gmail-Entwurf), Websuche, Wetter und News als Knopf, Einstellungen per Sprache (Name, Anrede, Sparmodus, Tempo, Tonhöhe, Stimme, Aussehen …), Timer und Wecker (klingeln, solange Jarvis offen ist), Umrechnen (Gewicht, Länge, Volumen, Temperatur, Sneaker-Größen US/UK/EU), Wochen- und Monatsbericht als Dokument mit CSV-Export. „Setz mein Geld/Gewinn/Umsatz auf 0“ und „… zurücksetzen“ führt die Seite selbst aus (mit „Sicher?“ und Rückgängig); `lager_liste` trennt „im Lager“ strikt von „verkauft“, der Lagestand nennt die Artikel im Lager namentlich. Werkzeuge, die zur Nachricht passen, werden immer mitgeschickt |
| Folien-Stil | Standard-Aussehen: helle Karte mit großem Radius auf blauem Grund, schwarze fette Titel mit Terrakotta-Punkt, kleine Terrakotta-Labels, Monospace für Werte, feine Trennlinien, unten Punkt-Navigation (Gespräch · Heute · Bauplan). „Nacht“ (dunkles Terrakotta-HUD) unter ⚙ → Aussehen |
| Aussehen (Nacht) | Ein Bildschirm fürs iPhone: oben Begrüßung mit Namen und Datum, Mitte der Orb (Terrakotta; atmet, pulsiert beim Zuhören, folgt der Stimme, schimmert beim Denken; ruhig bei „Bewegung reduzieren“), darunter die Heute-Karte (Termine, offene Aufgaben, Reselling) mit Briefing-Knopf, unten Chips und Eingabe mit Mikro. Dunkelbraun `#17130F`, Terrakotta `#C26B4C`, Creme `#F2E8DC`; Systemschrift, Werte und Labels in Monospace |
| Kopf: Spar-Routing (Haiku ist Standard) | **Lokal ohne Modell:** Grüße, Danke, Ja/Nein, Uhrzeit, Datum, „Welche Modelle nutzt du?“, Stopp, Wiederholen, Tempo, Ansichten öffnen, Sparmodus an/aus, die tägliche Begrüßung beim Öffnen und einfache Werte über die schnellen Werkzeuge (Gewinn, Bestand, Aufgaben, Kalorien, Rechnen, Gebühren, Zurücksetzen). **Haiku ohne Werkzeuge:** Smalltalk und einfache Fragen, letzte 4 Nachrichten, kompaktes Gedächtnis – braucht es Werkzeuge, gibt es mit `[[STARK]]` an Haiku mit Werkzeugen ab. **Haiku mit Werkzeugen:** eintragen, rechnen, Fotos, Apps, Aufträge – kompakter Prompt (nur die Abschnitte, die die Anfrage braucht), letzte 6 Nachrichten, höchstens 10 passende Werkzeuge. **Stark:** nur auf Wunsch („denk gründlich“, Knopf „Gründlicher“ unter einer Haiku-Antwort, ⚙ immer gründlich) oder bei komplexen Fragen (Strategie, Recht, Steuern, Analysen, sehr lange Texte). Jede Antwort zeigt, wer geantwortet hat; ⚙ zeigt das zuletzt genutzte Modell und die Zähler von heute; Sparmodus aus = immer stark |
| Plattform-Gebühren | Vinted, eBay, StockX (Prozent + fester Betrag) in ⚙, fürs Team gespeichert (`team/plattformen`), beim Verkauf automatisch abgezogen. Vorschläge Stand Okt. 2026: Vinted 0 %, eBay privat 0 %, StockX 12 % (9 % + 3 %) – mit dem eigenen Konto abgleichen |
| Verkauf | Nach jedem Verkauf antwortet Vertex in Text: Bestätigung, Netto nach Gebühren, Gewinn – notfalls ergänzt die Seite den Satz selbst aus dem Werkzeug-Ergebnis |
| „Notiert.“ | Wurde etwas gespeichert (Lager, Aufgabe, Kunde, Ernährung, Gedächtnis), erscheinen ein kurzer Hinweis oben und „✓ Notiert.“ unter der Antwort |
| Daten | Eine Quelle der Wahrheit: die Vertex-Datenbank (`db`, geräteübergreifend und fürs Team; ohne Anmeldung der Speicher des Geräts). Zahlen zu Bestand, Gewinn und Aufgaben werden immer daraus berechnet, nie aus dem Chatverlauf. Versioniertes Schema (`team/schema`, aktuell 2) mit Migration statt Reset |
| Stimme | Eingabe: Push-to-talk statt Dauerlauschen – Kreis oder 🎙 antippen, nochmal tippen (oder Sprechpause) schickt ab; gedrückt halten und loslassen geht auch. Beim ersten Tipp fragt Jarvis das Mikrofon ausdrücklich an (getUserMedia). Status sichtbar: „Hört zu“, „Versteht …“, „Nichts gehört“, „Kein Mikrofon-Zugriff …“. Wächter erkennen, wenn die Erkennung nicht startet oder nichts ankommt. Bekommt die Seite kein Mikrofon (Claude-App fürs iPhone), öffnet der Tipp die Tastatur fürs iPhone-Diktat (🎤) mit Auto-Senden nach einer Pause. ⚙ → „Sprache prüfen“ zeigt Spracherkennung, Mikrofon-Freigabe, getUserMedia und den letzten Fehler. Ausgabe: ruhig (Tempo 0,9, Pause nach jedem Satz), satzweise schon während die Antwort entsteht, oranger Orb |
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
| Selbstkontrolle | Zahlen nur aus Werkzeugen (der Zahlen-Wächter markiert alles andere), Fakten nur aus Gedächtnis und Stand; Gespeichertes sichtbar und rückgängig machbar |
| Laptop-Brücke | Nur vorgemerkt, nicht gebaut: In der Warteschlange steht nie Code, nur `{cmd, arg, ts, status}`; Namen aus fester Liste, Skripte als Konstanten, Programme per Erlaubnisliste, Befehle verfallen nach 600 s (siehe `hand/README.md` und Seite „Bauplan“) |

Veröffentlicht mit `capabilities: {sample: {images: true}, db: {}, user: {}, downloads: true, mcp: {servers: [...]}}` –
die `mcp`-Liste nennt genau die Werkzeuge aus `APPS`, `CCR` und `DOCS` im Code (Senden von Mails ist absichtlich nicht dabei).
Lager und Kunden sind geteilte Sammlungen (`lager`, `kunden`), Aufgaben und Aufträge privat unter
`data/users/<id>/listen/aufgaben` bzw. `…/listen/auftraege`.

Apps verbinden: einmal in claude.ai → Einstellungen → Connectors (z. B. Google Calendar), dann in Vertex
unter ⚙ → Apps & Hände „Erlauben“. Claude Code braucht eine Claude-Code-Umgebung (einmal claude.ai/code öffnen).

Den Sprechtext nicht hier bearbeiten, sondern in `server/src/sprechtext.js` und dann
`node pocket/sync-sprechtext.mjs` ausführen.

Echtes freihändiges Sprechen mit natürlicher Stimme: [Sprachmodus der Claude-App mit Projekt „Vertex“](claude-sprachmodus.md).

Grenzen: Eine Artifact-Seite bekommt in der Claude-App meist kein Mikrofon (der Rahmen der Seite sperrt es) – gesprochen
wird dann über das Diktat der iPhone-Tastatur. Eine eigene Aufnahme mit Umwandlung in Text hilft dort nicht: Sie bräuchte
dasselbe Mikrofon, und Claude nimmt in Artifacts kein Audio an. Selbst geladene Premium-Stimmen zeigt iOS Web-Seiten oft nicht an.
Der Persönlichkeits-Prompt ist eine kompakte Fassung von `core/personality.md` und `core/rules.md`.

Später: Wenn ein Server läuft, übernimmt die volle App (`server/`, `ui/`) – das Gedächtnis
lässt sich dann aus der Gedächtnis-Ansicht kopieren.

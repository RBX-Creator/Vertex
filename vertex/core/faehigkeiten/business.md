# Fähigkeit: Business (Listen und exakte Zahlen)

Für Geld, Bestand, Aufgaben und Kalorien gibt es Werkzeuge. Sie rechnen exakt (Geld in Cent) und
führen feste Listen: Lager und Kunden fürs ganze Team, Aufgaben und Ernährung pro Person.
Der aktuelle Stand steht schon im Kontext („Stand aus den Listen“).

## Rechnen – nie im Kopf
- Jede Rechnung über `rechnen`, auch kleine. Tausender ohne Punkt (`1200`), Dezimalstellen mit Komma.
  Meldet das Werkzeug „mehrdeutig“ (z. B. „1.200“): nachfragen, was gemeint ist – nicht raten.
- Gewinn, Marge, ROI, Mindestpreis eines Artikels: `gewinn_berechnen`. Plattformgebühren stehen in
  `/memories/team/business/gebuehren.md` (nur mit Quelle eintragen). Steht dort nichts: nachfragen
  oder mit 0 rechnen und das dazusagen.
- Monatszahlen (Umsatz, Gewinn, Marge, Lagerwert, Standzeit): `lager_auswertung` – nie selbst zusammenzählen.
- Beträge als Zahl in Euro übergeben (`140`, `4.99`), Daten als JJJJ-MM-TT. Relative Angaben
  („Freitag“, „letzten Monat“) vorher mit dem heutigen Datum umrechnen.

## Welches Werkzeug?
| Der Nutzer sagt …                              | Werkzeug |
|------------------------------------------------|----------|
| „Panda Dunks 43 für 80 gekauft“                | `lager_hinzufuegen` |
| „Für 140 auf Vinted verkauft, 4,99 Versand“    | `lager_aktualisieren` (verkauf, gebuehren, versand, plattform) |
| „Ist zurückgekommen“                           | `lager_aktualisieren` mit status `retoure` |
| „Der Verkauf war eigentlich 135“               | `lager_aktualisieren` mit id und `korrektur: true` |
| „Was liegt noch im Lager?“                     | `lager_liste` |
| „Wie lief der Oktober?“                        | `lager_auswertung` |
| „Erinner mich bis Freitag an …“                | `aufgabe_hinzufuegen` · erledigt → `aufgabe_erledigen` · Überblick → `aufgaben_liste` |
| Webdesign: Anfrage, Angebot, Auftrag, bezahlt  | `kunde_speichern` · Überblick → `kunden_liste` |
| Essen (auch als Foto)                          | `ernaehrung_eintragen` · „war weniger“, „lösch das“ → `ernaehrung_korrigieren` · Tagesstand → `ernaehrung_tag` |

## Mehrdeutig? Nachfragen.
- Meldet ein Werkzeug „Mehrdeutig“ oder „schon verkauft“, nicht selbst einen Treffer wählen: kurz fragen,
  welcher gemeint ist (die Liste nennt Größe, Status und Datum), dann mit der id weitermachen.
- Fehlt eine Zahl, die das Ergebnis ändert (Einkauf, Verkauf, Gebühren), fragen statt schätzen.
  Nur Kalorien und Nährwerte sind Schätzungen – und werden als „geschätzt“ benannt.

## Listen und Gedächtnis
- Aufgaben, Lager, Kunden-Status und Mahlzeiten gehören in die Listen, nicht in Gedächtnis-Dateien.
  Was noch in `/memories/ich/aufgaben.md` steht, gilt weiter – beim Briefing beides beachten.
- Essen: statt der Tabelle aus der Fähigkeit Augen `ernaehrung_eintragen`. Das Tagesziel bleibt in
  `/memories/ich/tracking/ernaehrung/ziele.md`.
- Wissen in Worten (Lieferanten, Zielgruppe, Projektdetails) gehört weiter ins Gedächtnis.

## Danach
- Ergebnis in einem Satz, wichtigste Zahl zuerst: „Eingetragen. Gewinn 55,01 €.“ Nicht alles Gespeicherte
  vorlesen. Zahlen aus dem Werkzeug-Ergebnis übernehmen, nicht neu rechnen.
- Fehlt dir eines dieser Werkzeuge, rechne sorgfältig, prüfe jede Zahl zweimal und sag dazu, dass sie
  nicht mit dem Rechner geprüft ist.

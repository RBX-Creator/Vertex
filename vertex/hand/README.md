# Hand – Vertex erledigt statt bespricht

## Heute: Hände auf dem Server (`server/src/browser.js`)
Der Arbeitsmodus (Claude) steuert einen echten Chromium-Browser auf dem Server:
`oeffnen`, `lesen`, `klicken`, `tippen`, `scrollen`, `zurueck`, `bildschirmfoto`.

- Jede Person hat ein eigenes Browser-Profil (Cookies, Warenkorb bleiben erhalten).
- **🔴-Sperre:** Klicks auf Kaufen/Bestellen/Senden/Posten/Löschen (und Enter in solchen Formularen)
  werden technisch blockiert, solange der Auftrag keine **Freigabe** des Nutzers enthält.
  Ablauf: Vertex legt in den Warenkorb → fragt → Nutzer sagt „Ja, bestell es, max. 130 €“ →
  neuer Auftrag mit genau dieser Freigabe.
- Bildschirmfotos für den Nutzer erscheinen im Chat beim Auftragsergebnis.
- Mails: nur Entwürfe im eigenen Postfach (`mail_entwurf`), gesendet wird nie automatisch.
- Abschalten: `VERTEX_BROWSER=0`.

**Grenze:** Seiten mit Login gehen nur, wenn das Server-Profil schon angemeldet ist. Passwörter
fragt Vertex nie ab.

## Nächster Schritt: Hände auf dem eigenen PC
Für Apps und Konten, in denen du ohnehin eingeloggt bist:

```
Vertex-Server ──Auftrag──► Hand-Agent auf dem PC (verbindet sich ausgehend, kein offener Port)
                              ├─ Browser mit deinen Logins (Playwright, eigenes Profil)
                              ├─ Desktop: Claude Computer Use (Bildschirm sehen, klicken, tippen)
                              └─ Apps öffnen, Dateien (Allowlist)
```
Die Sicherheitsstufen 🟢/🟡/🔴 aus `core/rules.md` gelten dort genauso – 🔴 mit Bestätigung auf dem Handy.

## Vorgemerkt: Laptop-Brücke für Pocket (noch nicht gebaut)
**In der Warteschlange steht niemals Code.** Die Vertex-Seite klickt nichts auf dem Laptop. Sie schreibt nur eine Zeile:

```json
{ "cmd": "musik_pause", "arg": "", "ts": 1785236351, "status": "offen" }
```

Auf dem Laptop fragt ein kleines Programm alle zwei Sekunden nach, ob etwas anliegt. Regeln, bevor eine Zeile gebaut wird:

| | Regel | kurz |
|---|---|---|
| 01 | Nur Namen aus einer festen Liste (z. B. `warenkorb`, `musik_aus`, `tabs_zu`). Die Liste liegt auf dem Laptop; unbekannte Namen werden verworfen und gemeldet. | kein Code |
| 02 | Ein Skript im Browser ist eine Konstante im Programm, nicht in der Zeile. | fest |
| 03 | Programme nur aus einer Erlaubnisliste. | allowlist |
| 04 | **Befehle verfallen nach zehn Minuten.** Zeitstempel und einmalige ID; Abgelaufenes oder schon Ausgeführtes wird ignoriert, nichts wird nachgeholt. | 600 s |

🔴-Aktionen (senden, kaufen, löschen) gibt es über die Brücke nicht.

Die bequeme Variante wäre, beliebigen Code zuzulassen – ein Nachmittag Arbeit. Es wäre auch die Hintertür in den
Rechner, in dem man bei seiner Bank eingeloggt ist. Deshalb nicht.

Die gleiche Notiz steht im Code der Seite (`pocket/vertex-pocket.html`, Abschnitt „Laptop-Brücke“) und auf der Seite
„Bauplan“ der App.

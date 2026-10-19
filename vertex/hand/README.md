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

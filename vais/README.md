# VAIs

KI-Modelle kostenlos nutzen und vergleichen. Aktueller Stand: **Login mit E-Mail-Bestätigung** und eine erste Startseite.

## Lokal starten

Voraussetzung: [Node.js](https://nodejs.org) ab Version 22.13.

```bash
cd vais
npm install
npm start
```

Dann im Browser http://localhost:3000 öffnen.

Ohne E-Mail-Einstellungen läuft VAIs im **Entwicklungsmodus**: Der 6-stellige Code wird nicht verschickt, sondern im Terminal angezeigt, in dem `npm start` läuft.

## Echte E-Mails verschicken

1. `.env.example` nach `.env` kopieren.
2. SMTP-Zugangsdaten eintragen. Zwei einfache Möglichkeiten:
   - **Gmail**: In deinem Google-Konto die Bestätigung in zwei Schritten aktivieren, dann unter *Sicherheit → App-Passwörter* ein App-Passwort erstellen.
     `SMTP_HOST=smtp.gmail.com`, `SMTP_PORT=465`, `SMTP_USER=deine@gmail.com`, `SMTP_PASS=<App-Passwort>`
   - **Resend** (resend.com, 3.000 Mails/Monat kostenlos, besser für eine eigene Domain):
     `SMTP_HOST=smtp.resend.com`, `SMTP_PORT=465`, `SMTP_USER=resend`, `SMTP_PASS=<API-Key>`
3. Server neu starten.

## So funktioniert der Login

1. E-Mail eingeben → VAIs erkennt, ob es schon ein Konto gibt.
2. **Neu:** Passwort wählen → Code per E-Mail → Code eingeben → Konto ist aktiv.
   **Bestehend:** Passwort eingeben → angemeldet.
3. *Passwort vergessen?* schickt einen Code, mit dem ein neues Passwort gesetzt wird (alle anderen Geräte werden dabei abgemeldet).

Sicherheit: Passwörter mit scrypt gehasht, Codes nur als Hash gespeichert, 10 Minuten gültig, max. 5 Fehlversuche, 45 s Wartezeit zwischen Codes, Rate-Limit pro IP, Session als HttpOnly-Cookie (30 Tage).

## Dateien

| Datei | Inhalt |
| --- | --- |
| `server.js` | Webserver (Express) |
| `src/auth.js` | Registrieren, Anmelden, Codes, Sessions |
| `src/mailer.js` | E-Mail-Versand und Mail-Vorlage |
| `src/db.js` | SQLite-Datenbank (`data/vais.db`) |
| `public/login.html`, `login.js` | Login-Fenster |
| `public/app.html`, `app.css` | Startseite nach dem Login |
| `public/styles.css` | Gemeinsames Design (hell/dunkel automatisch) |

## Online stellen

GitHub Pages reicht hier nicht, weil VAIs einen Server braucht. Gut geeignet und kostenlos bzw. günstig: **Render**, **Railway** oder **Fly.io**. Dort das Repo verbinden, als Ordner `vais` wählen, Startbefehl `npm start`, die Werte aus `.env` als Umgebungsvariablen eintragen und `COOKIE_SECURE=true` setzen.

Hinweis: Die Datenbank liegt in `data/`. Bei Hostern ohne festen Speicher (z. B. Render Free) braucht es dafür ein „Persistent Disk“/Volume, sonst gehen Konten bei einem Neustart verloren.

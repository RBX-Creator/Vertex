# VAIs

KI-Modelle kostenlos nutzen und vergleichen. Aktueller Stand: **Login mit E-Mail-Bestätigung** und eine erste Startseite.

## Online stellen – nur mit dem Handy (kostenlos)

Du brauchst 3 kostenlose Konten. Alles geht im Handy-Browser.

### 1. Datenbank: Turso
1. turso.tech öffnen → **Sign up** → mit GitHub anmelden.
2. **Create Database** → Name `vais` → erstellen.
3. In der Datenbank: die **URL** kopieren (beginnt mit `libsql://`) → das ist `DATABASE_URL`.
4. **Create Token** / „Generate Token“ → kopieren → das ist `DATABASE_TOKEN`.

### 2. E-Mails: Brevo
1. brevo.com → kostenlos registrieren (300 Mails/Tag gratis).
2. **Senders, Domains & Dedicated IPs → Senders → Add a sender** → deine Gmail-Adresse eintragen und den Link in der Bestätigungs-Mail antippen.
3. **SMTP & API → SMTP** → „Generate a new SMTP key“.
   - **Login** (sieht aus wie `xxxx@smtp-brevo.com`) → `SMTP_USER`
   - **SMTP-Key** → `SMTP_PASS`
4. `MAIL_FROM` = `VAIs <deine-adresse@gmail.com>` (genau die bestätigte Adresse).

### 3. Webseite: Render
1. render.com → mit GitHub anmelden → Zugriff auf das Repo `Vertex` erlauben.
2. **New → Blueprint** → Repo `Vertex` wählen, Branch `claude/vais-login`.
3. Render fragt die 5 Werte ab: `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM`, `DATABASE_URL`, `DATABASE_TOKEN` → einfügen → **Apply**.
4. Nach ein paar Minuten ist VAIs unter `https://vais-xxxx.onrender.com` online.

Hinweis: Im Gratis-Tarif schläft die Seite nach 15 Minuten ohne Besucher ein; der erste Aufruf danach dauert ca. 1 Minute. Die Konten bleiben dank Turso trotzdem erhalten.

## Lokal starten (am Computer)

Voraussetzung: [Node.js](https://nodejs.org) ab Version 20.12. Werte aus `.env.example` in eine `.env` kopieren.

```bash
cd vais
npm install
npm start
```

Dann im Browser http://localhost:3000 öffnen.

Ohne E-Mail-Einstellungen läuft VAIs im **Entwicklungsmodus**: Der 6-stellige Code wird nicht verschickt, sondern im Terminal angezeigt, in dem `npm start` läuft.

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
| `src/db.js` | Datenbank (Turso online, lokal `data/vais.db`) |
| `public/login.html`, `login.js` | Login-Fenster |
| `public/app.html`, `app.css` | Startseite nach dem Login |
| `public/styles.css` | Gemeinsames Design (hell/dunkel automatisch) |

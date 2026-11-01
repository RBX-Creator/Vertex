# VAIs

KI-Modelle kostenlos nutzen und vergleichen. Aktueller Stand:
- **Login** mit E-Mail-Bestätigung
- **Agent X**: arbeitet selbstständig in mehreren Schritten (Websuche, Webseiten lesen, Rechnen, Datum/Uhrzeit) mit dem stärksten verfügbaren Modell; braucht `GROQ_API_KEY`
- **Chat** in drei Modi: **Battle** (2 anonyme Modelle, Namen erst nach der Abstimmung), **Side by Side** (2 Modelle deiner Wahl), **Direkt** (1 Modell)
- Antworten nebeneinander (PC) bzw. zum Wischen (Handy), Abstimmen mit „A ist besser“, Unentschieden, Beide schlecht, „B ist besser“
- **Art der Anfrage** (zweites Menü): Auto, Text, Code (mit Vorschau für erstellte Webseiten), Websuche; Bild und Video folgen
- **Seitenleiste** mit gespeichertem Chat-Verlauf (suchen, öffnen, löschen)
- **Bestenliste**: Elo-Wertung aus allen Battle-Stimmen (Unentschieden und „beide schlecht“ zählen halb)

Ohne OpenRouter-Schlüssel läuft der Chat im **Demo-Modus** mit Platzhalter-Modellen.

## Online stellen – nur mit dem Handy (kostenlos)

Du brauchst 4 kostenlose Konten. Alles geht im Handy-Browser.

### 1. Datenbank: Turso
1. turso.tech öffnen → **Sign up** → mit GitHub anmelden.
2. **Create Database** → Name `vais` → erstellen.
3. In der Datenbank: die **URL** kopieren (beginnt mit `libsql://`) → das ist `DATABASE_URL`.
4. **Create Token** / „Generate Token“ → kopieren → das ist `DATABASE_TOKEN`.

### 2. E-Mails: Brevo
1. brevo.com → kostenlos registrieren (300 Mails/Tag gratis).
2. **Senders, Domains & Dedicated IPs → Senders → Add a sender** → deine Gmail-Adresse eintragen und den Link in der Bestätigungs-Mail antippen.
3. **SMTP & API → API-Schlüssel** → „API-Schlüssel generieren“ → kopieren (beginnt mit `xkeysib-`) → das ist `BREVO_API_KEY`.
   (Alternativ geht SMTP mit `SMTP_USER` + `SMTP_PASS`; ist `BREVO_API_KEY` gesetzt, wird SMTP ignoriert.)
4. `MAIL_FROM` = `VAIs <deine-adresse@gmail.com>` (genau die bestätigte Adresse).

### 3. KI-Modelle: OpenRouter
1. openrouter.ai → **Sign in** (mit Google oder GitHub).
2. Menü → **Keys** → **Create Key** → kopieren → das ist `OPENROUTER_API_KEY`.

Weitere kostenlose Modelle (optional, je ein Schlüssel in Render unter **Environment** eintragen):
- **Google Gemini/Gemma:** aistudio.google.com/apikey → `GEMINI_API_KEY`
- **Groq** (gpt-oss von OpenAI, Llama, Qwen, Kimi und Websuche über `compound`): console.groq.com/keys → `GROQ_API_KEY`
- **Cerebras** (gpt-oss, Llama, Qwen, GLM; verlangt inzwischen eine Zahlungsmethode): cloud.cerebras.ai → `CEREBRAS_API_KEY`
- **Mistral** (API nur mit bezahltem Plan): console.mistral.ai → `MISTRAL_API_KEY`
- Kostenpflichtige Modelle wie **Grok**, Claude oder GPT: Guthaben bei OpenRouter aufladen und die IDs in `OPENROUTER_EXTRA_MODELS` eintragen (durch Komma getrennt, z. B. `x-ai/grok-4.7,x-ai/grok-4.3`). Sie erscheinen als **Premium**; jeder Nutzer darf sie höchstens `PAID_DAILY_LIMIT` Mal pro Tag nutzen (Standard 20).

Fällt ein Modell aus (z. B. Tageslimit), merkt sich VAIs das und überspringt es; im Battle springt automatisch ein anderes Modell ein.

Kostenlose Modelle haben ein Tageslimit (ca. 50 Anfragen pro Tag; mit einmalig 10 $ Guthaben bei OpenRouter ca. 1.000 pro Tag).

### 4. Webseite: Render
1. render.com → mit GitHub anmelden → Zugriff auf das Repo `Vertex` erlauben.
2. **New → Blueprint** → Repo `Vertex` wählen, Branch `claude/vais-login`.
3. Render fragt die 6 Werte ab: `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM`, `OPENROUTER_API_KEY`, `DATABASE_URL`, `DATABASE_TOKEN` → einfügen → **Apply**.
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
| `src/agent.js` | Agent X: Werkzeuge und Ablauf |
| `src/chat.js` | Chats starten, Antworten streamen, Abstimmen |
| `src/models.js` | Modelle von OpenRouter, Google, Groq, Cerebras und Mistral, Logos, Kategorien (+ Demo-Modus) |
| `public/icons/` | Hersteller-Logos (MIT, LobeHub) |
| `src/mailer.js` | E-Mail-Versand und Mail-Vorlage |
| `src/db.js` | Datenbank (Turso online, lokal `data/vais.db`) |
| `public/login.html`, `login.js` | Login-Fenster |
| `public/app.html`, `app.js`, `app.css` | Chat-Oberfläche |
| `public/styles.css` | Gemeinsames Design (hell/dunkel automatisch) |

# VAIs

KI-Modelle kostenlos nutzen und vergleichen. Aktueller Stand:
- **Login** mit E-Mail-Bestätigung
- **Agent X**: arbeitet selbstständig in mehreren Schritten mit dem stärksten verfügbaren Modell – mehrere Websuchen gleichzeitig (Quellen werden entdoppelt, seriöse zuerst), Wikipedia, Webseiten lesen, Rechnen, Datum/Uhrzeit; baut Webseiten und **prüft sie selbst** (`validate_html`: Aufbau, offene Tags, JavaScript-Fehler) und **sieht angehängte Bilder** (ein Bildmodell beschreibt sie); braucht `GROQ_API_KEY`
- **Chat** in drei Modi: **Battle** (2 anonyme Modelle, Namen erst nach der Abstimmung), **Side by Side** (2 Modelle deiner Wahl), **Direkt** (1 Modell)
- Antworten nebeneinander (PC) bzw. zum Wischen (Handy), Abstimmen mit „A ist besser“, Unentschieden, Beide schlecht, „B ist besser“
- **Art der Anfrage** (zweites Menü): Auto, Text, Code (mit Vorschau für erstellte Webseiten), Websuche, **Bild** (Bilder aus Text, kostenlos über Pollinations – ohne Schlüssel; mit `POLLINATIONS_API_KEY` mehr Modelle und Bild-Battles); Video folgt
- **Anhänge (+)**: Bilder (werden verkleinert, für Modelle mit 👁), **PDFs** (Text wird im Browser ausgelesen, bis ca. 60.000 Zeichen) und Textdateien/Code bis 200 KB; auch per Einfügen oder Drag & Drop
- **Chats teilen**: Link erstellen, den jeder ohne Konto lesen kann (`/s/…`); Teilen jederzeit beendbar, Dateiinhalte werden nicht mitgeteilt
- **Meine Statistik**: Chats, Fragen, Stimmen, 👍, genutzte Modi, Lieblings- und meistgenutzte Modelle
- **Seitenleiste** mit gespeichertem Chat-Verlauf (suchen, öffnen, umbenennen, löschen)
- **Nachrichten bearbeiten** (✏️ unter der eigenen Nachricht – ab dort wird neu geantwortet)
- **Spracheingabe** (🎙️ neben Senden) und **Vorlesen** (🔊 an jeder Antwort), direkt über den Browser
- **Einstellungen**: Hell/Dunkel/System, Deutsch/English, Passwort ändern, alle Chats löschen, Konto löschen
- **Als App installierbar** (PWA) mit eigenem Symbol; schläft der kostenlose Server, erscheint „VAIs wacht auf …“ statt einer leeren Seite
- **Antworten**: farbiger Code mit Kopier-Knopf, Mathe-Formeln (KaTeX), 3 **Vorschläge für die nächste Frage** unter jeder Antwort, **automatische Chat-Titel**
- **Offline lesen**: die letzten 25 Chats liegen auf dem Gerät und lassen sich ohne Internet öffnen (beim Abmelden gelöscht)
- **Willkommens-Tour** beim ersten Besuch (in den Einstellungen wiederholbar), sanfte Animationen und kurzes Vibrieren beim Senden/Abstimmen (Android)
- **Tageslimit pro Nutzer**: jeder hat Punkte pro Tag (Standard 100), jede Antwort kostet Punkte (Antwort 1, Websuche 2, Bild 3, Agent X 4, Premium 5); Verbrauch in „Meine Statistik“ als 0–100 %; keine Antwort → Punkte zurück
- **Agent X in der Modell-Liste** ganz oben (auch für „Direkt“ und „Nebeneinander“, z. B. Agent X gegen ein anderes Modell); **reagiert mit Emojis** auf deine Nachricht (👀 beim Arbeiten, z. B. 😂 🎉 ✅ danach), kurze Antworten wie „ok“ oder „danke“ bekommen nur ein Emoji und kosten keine Punkte
- **Notfall-Modelle**: ist das gewählte Modell oder sein Anbieter voll, antwortet automatisch ein starkes freies Modell (bevorzugt Groq), markiert mit „⚡ Notfall“
- **Mehrere Schlüssel pro Anbieter**: `GROQ_API_KEY` (auch mehrere mit Komma), `GROQ_API_KEY_2` … `_9` oder im Admin-Bereich; ist einer voll, springt der nächste ein
- **Admin-Seite** (`/admin`, nur für `ADMIN_EMAILS`): Limits und Kosten einstellen, eigenes Limit pro Nutzer, Verbrauch zurücksetzen, API-Schlüssel verwalten, Nutzerzahlen, Fragen pro Tag, beliebte Modelle, Fehlerprotokoll, Nutzer sperren/entsperren, Bestenliste zurücksetzen (rückgängig machbar)
- **Datenschutz** (`/datenschutz`) und **Impressum** (`/impressum`) mit Betreiber-Angaben aus `OWNER_NAME`, `OWNER_EMAIL`, `IMPRESSUM_ADDRESS`
- **Bestenliste**: Elo-Wertung aus allen Battle-Stimmen, getrennt nach Alle/Text/Code/Websuche, mit Siegquote (Unentschieden und „beide schlecht“ zählen halb)

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

Sicherheit: Content-Security-Policy, Schutz vor fremden Webseiten (CSRF), Sperre nach 8 falschen Passwörtern in 15 Minuten, Tageslimit pro Nutzer (`USER_DAILY_LIMIT`, Standard 500 Antworten), Webseiten-Vorschau in abgeschirmter Seite, Passwörter mit scrypt gehasht, Codes nur als Hash gespeichert, 10 Minuten gültig, max. 5 Fehlversuche, 45 s Wartezeit zwischen Codes, Rate-Limit pro IP, Session als HttpOnly-Cookie (30 Tage).

## Dateien

| Datei | Inhalt |
| --- | --- |
| `server.js` | Webserver (Express) |
| `src/auth.js` | Registrieren, Anmelden, Codes, Sessions |
| `src/agent.js` | Agent X: Werkzeuge und Ablauf |
| `src/admin.js`, `public/admin.*` | Admin-Seite |
| `src/config.js` | Betreiber-Angaben und Admin-Konten |
| `src/limits.js` | Tageslimit und Punkte pro Nutzer |
| `public/render.js` | Markdown, Formeln, Code-Farben |
| `public/tour.js` | Willkommens-Tour |
| `public/legal/` | Datenschutz und Impressum |
| `src/chat.js` | Chats starten, Antworten streamen, Abstimmen |
| `src/models.js` | Modelle von OpenRouter, Google, Groq, Cerebras und Mistral, Logos, Kategorien (+ Demo-Modus) |
| `public/icons/` | Hersteller-Logos (MIT, LobeHub) |
| `src/mailer.js` | E-Mail-Versand und Mail-Vorlage |
| `src/db.js` | Datenbank (Turso online, lokal `data/vais.db`) |
| `public/login.html`, `login.js` | Login-Fenster |
| `public/app.html`, `app.js`, `app.css` | Chat-Oberfläche |
| `public/styles.css` | Gemeinsames Design (hell/dunkel) |
| `public/i18n.js`, `src/i18n.js` | Deutsch/Englisch (Oberfläche und Server) |
| `public/boot.js` | Sprache, Design und Service Worker beim Start |
| `public/sw.js`, `waking.html` | App-Installation und „VAIs wacht auf“-Seite |
| `public/sandbox.html` | Abgeschirmte Vorschau für erstellte Webseiten |

# 🚀 VERTEX Partner – Telegram-Bot für Business-Partner

Ein Matchmaking-Bot für **Business-Partner** (kein Dating!) – aufgebaut wie der bekannte Telegram-Bot „Leo“:
Profil erstellen → Profile durchswipen (❤️ / 👎) → bei gegenseitigem Interesse **Match** → **anonym über den Bot chatten**.
Jeder hat seinen eigenen privaten Chat mit dem Bot.

## ✨ Funktionen

- **Profil-Wizard** (Schritt für Schritt, alles geprüft): Name, Alter (min. 13), Stadt oder „🌐 Online“, Rolle
  (Gründer, Entwickler, Designer, Marketing, Content Creator, Investor, Sonstiges), gesuchte Rolle, Was ich biete,
  Was ich suche, Beschreibung, Foto/Logo (optional), Link (optional). Am Ende Vorschau + Bestätigung.
- **Regeln** beim Start („Nur Business, kein Dating, respektvoll“) – müssen akzeptiert werden.
- **Menü** wie bei Leo mit Zahlen-Buttons:
  `1` 🚀 Partner finden · `2` 👤 Mein Profil · `3` 🖼 Foto ändern · `4` ✏️ Text ändern · `5` ⏸ Pausieren/Aktivieren · `6` 💬 Matches
- **Partner finden**: eine Profilkarte nach der anderen mit ❤️ Interesse · 💌 Interesse + Nachricht · 👎 Weiter · 💤 Menü ·
  ⚠️ Melden · 🚫 Blockieren. Passende Rollen kommen zuerst (z. B. Gründer sucht Entwickler → Entwickler zuerst).
  Eigene, pausierte, gebannte und blockierte Profile werden nie gezeigt, gesehene erst nach 24 h wieder.
- **Interesse**: Die Person bekommt „✨ Jemand hat Interesse an dir!“ und kann das Profil ansehen und ❤️ zurückgeben oder 👎.
- **Match** → beide bekommen eine Nachricht mit „💬 Chat mit …“.
- **Anonymer Chat über den Bot**: Nachrichten (Text, Fotos, Sticker …) werden weitergeleitet, **ohne Nummer oder Username**.
  `/ende` oder „🚪 Chat beenden“ verlässt den Chat. Ab 18 kann man freiwillig den Telegram-Username tauschen (nur wenn **beide** zustimmen).
- **Sicherheit** (wichtig, weil auch Minderjährige den Bot nutzen):
  - Unter 18 sieht/trifft **nur** unter 18, ab 18 **nur** ab 18 (auch Chats und Likes sind getrennt).
  - Für unter 18 werden Telefonnummern, Links, E-Mails und @Usernames in Chats und Profiltexten **blockiert**; kein Username-Tausch.
  - Überall ⚠️ Melden und 🚫 Blockieren. Meldungen gehen an die Admins (mit „🔨 Bannen“-Button).
  - Rate-Limits: Likes pro Tag (Standard 50) und Nachrichten pro Minute (Standard 20).
  - Wechselt jemand per `/neu` die Altersgruppe, werden alte Likes und Matches gelöscht.
- **Befehle**: `/start`, `/profil`, `/matches`, `/interessen`, `/neu`, `/ende`, `/regeln`, `/hilfe`, `/loeschen` (mit Bestätigung)
- **Admin**: `/admin_bann <id> [Grund]`, `/admin_entbann <id>`, `/admin_info <id>`, `/admin_stats`
- Keine Werbung, kein Premium, keine Zahlungen.

## 🧰 Technik

- Node.js ≥ 18 (empfohlen **22**), keine Frameworks – Telegram Bot API direkt per `fetch`.
- **Long Polling** (lokal) oder **Webhook** (Server) mit Prüfung des Secret-Token-Headers.
- Speicher: **SQLite-Datei** lokal (eingebautes `node:sqlite` ab Node 22) oder **Postgres**, sobald `DATABASE_URL` gesetzt ist.
- `GET /health` für Hosting-Health-Checks.

```
src/
  index.js      Start (Polling/Webhook, HTTP-Server)
  bot.js        Die ganze Bot-Logik
  texts.js      Alle deutschen Texte & Buttons (hier kannst du Texte anpassen)
  filter.js     Kontaktdaten-Filter, Link-Prüfung
  server.js     /health + Webhook-Endpunkt
  telegram.js   Mini-Client für die Telegram-API
  store/        Datenbank (SQLite + Postgres, gleiche Schnittstelle)
test/           Automatische Tests mit Fake-Telegram
```

---

## 1️⃣ Bot bei @BotFather erstellen

1. In Telegram **@BotFather** öffnen → `/newbot`.
2. Anzeigename eingeben, z. B. `VERTEX Partner`.
3. Username eingeben (muss auf `bot` enden), z. B. `VertexPartnerBot`.
4. BotFather schickt dir den **Token** (sieht aus wie `123456789:AA...`). **Niemandem zeigen, nicht in GitHub hochladen!**
5. Optional bei BotFather:
   - `/setdescription` → „Finde Business-Partner: Mitgründer, Entwickler, Designer & Creator. Nur Business, kein Dating. 🚀“
   - `/setabouttext` → „VERTEX Partner – Business-Matching für die VERTEX Community.“
   - `/setuserpic` → dein VERTEX-Logo
   - Die Befehlsliste setzt der Bot beim Start automatisch.
6. Deine eigene Telegram-ID herausfinden (für Admin-Rechte): z. B. **@userinfobot** anschreiben → die Zahl bei „Id“ ist deine ID.

## 2️⃣ Umgebungsvariablen

| Variable | Pflicht | Bedeutung |
|---|---|---|
| `TELEGRAM_BOT_TOKEN` | ✅ | Token von @BotFather |
| `ADMIN_IDS` | empfohlen | Deine Telegram-ID(s), mit Komma getrennt – bekommen Meldungen und Admin-Befehle |
| `DATABASE_URL` | auf Servern ✅ | Postgres-URL (Neon/Supabase). Leer = SQLite-Datei |
| `SQLITE_PATH` | – | Pfad der SQLite-Datei (Standard `./data/bot.sqlite`) |
| `WEBHOOK_URL` | – | Öffentliche URL, z. B. `https://vertex-partner-bot.onrender.com`. Leer = Polling. Auf Render automatisch |
| `WEBHOOK_SECRET` | – | Geheimer Header-Wert für den Webhook (wird sonst aus dem Token abgeleitet) |
| `PORT` | – | HTTP-Port (Standard 3000; Render setzt ihn selbst) |
| `LIKES_PER_DAY` / `MSGS_PER_MINUTE` | – | Limits (Standard 50 / 20) |
| `VIEW_COOLDOWN_HOURS` | – | Nach wie vielen Stunden ein gesehenes Profil wieder kommt (Standard 24) |
| `BOT_NAME` | – | Name in den Texten (Standard „VERTEX Partner“) |
| `FORCE_POLLING` | – | `1` = auf Render trotzdem Polling statt Webhook |

## 3️⃣ Lokal starten (PC/Mac)

Voraussetzung: [Node.js 22 LTS](https://nodejs.org) installiert.

```bash
cd partner-bot
npm install
cp .env.example .env        # Windows: copy .env.example .env
# .env öffnen und TELEGRAM_BOT_TOKEN + ADMIN_IDS eintragen
npm start
```

Dann deinem Bot in Telegram `/start` schicken. Lokal läuft der Bot per **Long Polling** und speichert alles in `data/bot.sqlite`.
Beenden mit `Strg + C`. (Der Bot läuft nur, solange der PC an ist.)

Tests laufen lassen:

```bash
npm test
```

## 4️⃣ Kostenlos online stellen: Render + Neon (empfohlen)

Render (Free) hat eine **flüchtige Festplatte** – deshalb kommt die Datenbank zu **Neon** (kostenloses Postgres, läuft nicht ab).

### A) Datenbank bei Neon
1. Auf **https://neon.tech** kostenlos registrieren → **New Project** (Region z. B. *Frankfurt / eu-central-1*).
2. Im Dashboard auf **Connect** → den **Connection string** kopieren
   (`postgresql://user:passwort@ep-....eu-central-1.aws.neon.tech/neondb?sslmode=require...`).
   Falls es später einen Verbindungsfehler gibt: den Teil `&channel_binding=require` am Ende weglassen.

### B) Code auf GitHub
1. Auf **https://github.com** ein neues **privates** Repository anlegen, z. B. `vertex-partner-bot`.
2. Den Inhalt des Ordners `partner-bot` hochladen („Add file → Upload files“ – **ohne** `node_modules`, `data` und `.env`).

### C) Web Service bei Render
1. Auf **https://render.com** registrieren (mit GitHub) → **New → Web Service** → dein Repo auswählen.
2. Einstellungen:
   - **Runtime**: Node · **Build Command**: `npm install --omit=dev` · **Start Command**: `npm start`
   - **Instance Type**: **Free**
   - **Health Check Path** (unter Advanced): `/health`
3. **Environment Variables** hinzufügen:
   - `TELEGRAM_BOT_TOKEN` = dein Token
   - `ADMIN_IDS` = deine Telegram-ID
   - `DATABASE_URL` = Neon-Connection-String
   - `NODE_VERSION` = `22`
4. **Create Web Service**. Render setzt `RENDER_EXTERNAL_URL` automatisch – der Bot erkennt das und richtet den **Webhook selbst ein**
   (im Log steht dann „🔗 Webhook gesetzt: …“).
5. Testen: `https://<dein-service>.onrender.com/health` muss `{"ok":true,...}` zeigen. Dann in Telegram `/start`.

> Alternative: Im Repo liegt eine `render.yaml`. Bei Render **New → Blueprint** wählen, Repo verbinden und nur die Variablen eintragen.

**Gut zu wissen (Render Free):** Ohne Anfragen schläft der Dienst nach 15 Minuten ein. Die erste Nachricht danach weckt ihn –
das dauert ca. 1 Minute, Telegram liefert die Nachricht dann automatisch nach. 750 Free-Stunden/Monat reichen für einen Dienst.
Nimm **nicht** die kostenlose Render-Postgres-DB – die wird nach 30 Tagen gelöscht.

### Alternativen
- **Supabase** statt Neon: Projekt anlegen → *Connect* → „Session pooler“-URI als `DATABASE_URL` (Passwort einsetzen).
- **Eigener Rechner / Raspberry Pi / alter Laptop**: einfach `npm start` (Polling, SQLite) – kostenlos, solange das Gerät läuft.
- **Docker** (z. B. Koyeb, Fly.io, eigener Server): `Dockerfile` liegt bei. `TELEGRAM_BOT_TOKEN`, `DATABASE_URL`, `WEBHOOK_URL` setzen.
  Free-Angebote ändern sich öfter – vorher die aktuellen Bedingungen prüfen.

## 🛡 Hinweise zu Sicherheit & Grenzen

- Das Alter wird nicht verifiziert (Telegram bietet das nicht). Getrennte Altersgruppen + Melden/Bannen sind der Schutz –
  schau als Admin regelmäßig in die Meldungen.
- Der Kontaktfilter erkennt **offensichtliche** Nummern/Links/@Usernames, nicht jede Umschreibung („null eins sieben …“).
- Sprachnachrichten/Videos werden ab 18 weitergeleitet; unter 18 nur Text, Fotos und Sticker.
- Fotos werden über Telegram-`file_id` gespeichert (keine Dateien auf dem Server).
- Wer den Bot in Telegram stoppt, bekommt keine Nachrichten mehr; der Absender erhält dann einen Hinweis.

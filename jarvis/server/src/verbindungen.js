// Verbindungen pro Person: Kalender (ICS-Abo-Links) und Postfach (IMAP).
// Zugangsdaten liegen nur auf dem Server in data/users/<id>/verbindungen.json (Rechte 600)
// und werden nie an die App oder an ein KI-Modell zurückgegeben.
import fs from "node:fs/promises";
import path from "node:path";
import ical from "node-ical";
import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import MailComposer from "nodemailer/lib/mail-composer/index.js";
import { userDir } from "./paths.js";

const TZ = process.env.JARVIS_TZ || "Europe/Berlin";
const file = (userId) => path.join(userDir(userId), "verbindungen.json");

export class VerbindungsFehler extends Error {
  name = "VerbindungsFehler";
}

export async function load(userId) {
  try {
    return JSON.parse(await fs.readFile(file(userId), "utf8"));
  } catch {
    return { kalender: [], mail: null };
  }
}

async function save(userId, data) {
  await fs.writeFile(file(userId), JSON.stringify(data, null, 1), { mode: 0o600 });
}

// Für die App: alles außer dem Passwort.
export async function publicView(userId) {
  const v = await load(userId);
  return {
    kalender: v.kalender,
    mail: v.mail ? { host: v.mail.host, port: v.mail.port, user: v.mail.user, passwortGesetzt: Boolean(v.mail.pass) } : null,
  };
}

export async function update(userId, patch) {
  const v = await load(userId);
  if (Array.isArray(patch.kalender)) {
    v.kalender = patch.kalender
      .map((k) => ({ name: String(k.name || "Kalender").slice(0, 40), url: String(k.url || "").trim().replace(/^webcal:/i, "https:") }))
      .filter((k) => /^https?:\/\//i.test(k.url))
      .slice(0, 5);
  }
  if (patch.mail === null) v.mail = null;
  else if (patch.mail) {
    const m = patch.mail;
    const host = String(m.host || "").trim();
    const user = String(m.user || "").trim();
    if (!host || !user) throw new VerbindungsFehler("Für das Postfach braucht es Server und Benutzer.");
    v.mail = {
      host,
      port: Number(m.port) || 993,
      user,
      pass: m.pass ? String(m.pass) : v.mail?.pass || "",
    };
  }
  await save(userId, v);
  return publicView(userId);
}

export const hasKalender = async (userId) => (await load(userId)).kalender.length > 0;
export const hasMail = async (userId) => Boolean((await load(userId)).mail?.pass);

// ---------- Kalender ----------

const cache = new Map(); // url → { at, data }

async function fetchCalendar(url) {
  const hit = cache.get(url);
  if (hit && Date.now() - hit.at < 5 * 60_000) return hit.data;
  const res = await fetch(url, { headers: { Accept: "text/calendar" }, signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new VerbindungsFehler(`Kalender nicht erreichbar (HTTP ${res.status}).`);
  const data = ical.sync.parseICS(await res.text());
  cache.set(url, { at: Date.now(), data });
  return data;
}

const val = (v) => (v && typeof v === "object" && "val" in v ? v.val : v || "");

const fmt = (d, opts) => new Intl.DateTimeFormat("de-DE", { timeZone: TZ, ...opts }).format(d);

/** Termine der nächsten `tage` Tage (ab heute 0 Uhr), sortiert. */
export async function termine(userId, tage = 7) {
  const { kalender } = await load(userId);
  if (!kalender.length) throw new VerbindungsFehler("Kein Kalender verbunden. In den Einstellungen unter „Verbindungen“ eintragen.");
  const from = new Date();
  from.setHours(0, 0, 0, 0);
  const to = new Date(from.getTime() + Math.max(1, Math.min(60, tage)) * 86_400_000);
  const out = [];
  for (const k of kalender) {
    const data = await fetchCalendar(k.url);
    for (const ev of Object.values(data)) {
      if (ev.type !== "VEVENT") continue;
      const instances = ev.rrule
        ? ical.expandRecurringEvent(ev, { from, to })
        : ev.start && ev.start < to && (ev.end || ev.start) >= from
          ? [{ start: ev.start, end: ev.end, summary: ev.summary, isFullDay: ev.datetype === "date" }]
          : [];
      for (const i of instances) {
        out.push({
          start: new Date(i.start),
          ende: i.end ? new Date(i.end) : null,
          ganztags: Boolean(i.isFullDay),
          titel: String(val(i.summary || ev.summary)).slice(0, 120),
          ort: String(val(ev.location)).slice(0, 120),
          kalender: k.name,
        });
      }
    }
  }
  out.sort((a, b) => a.start - b.start);
  return out.slice(0, 80).map((t) => ({
    tag: fmt(t.start, { weekday: "short", day: "2-digit", month: "2-digit" }),
    zeit: t.ganztags ? "ganztägig" : `${fmt(t.start, { hour: "2-digit", minute: "2-digit" })}${t.ende ? "–" + fmt(t.ende, { hour: "2-digit", minute: "2-digit" }) : ""}`,
    titel: t.titel,
    ...(t.ort ? { ort: t.ort } : {}),
    ...(kalender.length > 1 ? { kalender: t.kalender } : {}),
  }));
}

// ---------- Postfach ----------

async function withImap(userId, fn) {
  const { mail } = await load(userId);
  if (!mail?.pass) throw new VerbindungsFehler("Kein Postfach verbunden. In den Einstellungen unter „Verbindungen“ eintragen.");
  const client = new ImapFlow({
    host: mail.host,
    port: mail.port,
    secure: mail.port === 993,
    auth: { user: mail.user, pass: mail.pass },
    logger: false,
    socketTimeout: 30_000,
  });
  try {
    await client.connect();
  } catch (err) {
    throw new VerbindungsFehler(`Anmeldung am Postfach fehlgeschlagen: ${err.responseText || err.message}`);
  }
  try {
    return await fn(client, mail);
  } finally {
    await client.logout().catch(() => {});
  }
}

/** Die letzten Mails im Posteingang (ohne sie als gelesen zu markieren). */
export async function postfach(userId, { anzahl = 10, nurUngelesen = true } = {}) {
  anzahl = Math.max(1, Math.min(25, Number(anzahl) || 10));
  return withImap(userId, async (client) => {
    const lock = await client.getMailboxLock("INBOX");
    try {
      const uids = (await client.search(nurUngelesen ? { seen: false } : { all: true }, { uid: true })) || [];
      const pick = uids.slice(-anzahl);
      const mails = [];
      if (pick.length) {
        for await (const msg of client.fetch(pick, { uid: true, envelope: true, flags: true, source: true }, { uid: true })) {
          const parsed = await simpleParser(msg.source);
          mails.push({
            von: parsed.from?.text || "",
            betreff: parsed.subject || "(kein Betreff)",
            datum: parsed.date ? fmt(parsed.date, { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "",
            gelesen: msg.flags?.has("\\Seen") || false,
            text: (parsed.text || "").replace(/\s+/g, " ").trim().slice(0, 700),
          });
        }
      }
      return { anzahlUngelesen: nurUngelesen ? uids.length : undefined, mails: mails.reverse() };
    } finally {
      lock.release();
    }
  });
}

/** Legt einen Entwurf im Entwürfe-Ordner ab. Gesendet wird nie automatisch. */
export async function entwurf(userId, { an, betreff, text }) {
  if (!an || !betreff || !text) throw new VerbindungsFehler("an, betreff und text sind Pflicht.");
  return withImap(userId, async (client, mail) => {
    const raw = await new MailComposer({ from: mail.user, to: an, subject: betreff, text }).compile().build();
    const boxes = await client.list();
    const drafts = boxes.find((b) => b.specialUse === "\\Drafts") || boxes.find((b) => /draft|entw/i.test(b.path));
    if (!drafts) throw new VerbindungsFehler("Kein Entwürfe-Ordner im Postfach gefunden.");
    await client.append(drafts.path, raw, ["\\Draft"]);
    return `Entwurf an ${an} („${betreff}“) liegt im Ordner ${drafts.path}. Senden muss der Nutzer selbst.`;
  });
}

/** Für die App: prüft, ob die Verbindungen funktionieren. */
export async function testen(userId) {
  const v = await load(userId);
  const result = {};
  if (v.kalender.length) {
    try {
      result.kalender = `ok – ${(await termine(userId, 7)).length} Termine in 7 Tagen`;
    } catch (err) {
      result.kalender = err.message;
    }
  }
  if (v.mail) {
    try {
      const r = await postfach(userId, { anzahl: 1, nurUngelesen: true });
      result.mail = `ok – ${r.anzahlUngelesen} ungelesen`;
    } catch (err) {
      result.mail = err.message;
    }
  }
  return result;
}

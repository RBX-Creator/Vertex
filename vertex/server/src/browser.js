// Vertex' Hände auf dem Server: ein echter Browser (Chromium), den der Arbeitsmodus steuert.
// Pro Person ein eigenes Browser-Profil (Cookies, Warenkorb bleiben erhalten).
// Aktionen der Stufe 🔴 (kaufen, senden, posten, löschen …) sind gesperrt, solange der Nutzer
// sie nicht ausdrücklich freigegeben hat.
import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright-core";
import { userDir } from "./paths.js";

const EXECUTABLE = process.env.CHROMIUM_PATH || "/usr/bin/chromium";
const IDLE_MS = 10 * 60_000;
const ROT = /kaufen|kauf abschlie|bestell|zahlungspflichtig|bezahlen|zur kasse.*abschlie|buy now|place order|checkout|pay now|\bpay\b|senden|absenden|abschicken|send\b|veröffentlich|publish|posten|\bpost\b|löschen|delete|remove account|kündigen|abonnieren|subscribe/i;

export const browserEnabled = () => process.env.VERTEX_BROWSER !== "0";

const sessions = new Map(); // userId → { context, page, timer }

async function session(userId) {
  let s = sessions.get(userId);
  if (!s) {
    const dir = path.join(userDir(userId), "browser");
    await fs.mkdir(dir, { recursive: true });
    const context = await chromium.launchPersistentContext(dir, {
      executablePath: EXECUTABLE,
      headless: true,
      locale: "de-DE",
      timezoneId: process.env.VERTEX_TZ || "Europe/Berlin",
      viewport: { width: 1280, height: 900 },
      args: ["--no-sandbox", "--disable-dev-shm-usage"],
    });
    const page = context.pages()[0] || (await context.newPage());
    s = { context, page };
    sessions.set(userId, s);
  }
  clearTimeout(s.timer);
  s.timer = setTimeout(() => closeSession(userId), IDLE_MS);
  return s;
}

async function closeSession(userId) {
  const s = sessions.get(userId);
  sessions.delete(userId);
  await s?.context.close().catch(() => {});
}

// Nummeriert sichtbare, bedienbare Elemente und liefert Seitentext + Liste.
async function snapshot(page) {
  const data = await page.evaluate(() => {
    const visible = (el) => {
      const r = el.getBoundingClientRect();
      const st = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && st.visibility !== "hidden" && st.display !== "none";
    };
    const els = [...document.querySelectorAll('a[href], button, input:not([type=hidden]), select, textarea, [role=button], [role=link], [contenteditable=true]')]
      .filter(visible)
      .slice(0, 120);
    document.querySelectorAll("[data-vertex-id]").forEach((e) => e.removeAttribute("data-vertex-id"));
    const items = els.map((el, i) => {
      el.setAttribute("data-vertex-id", String(i + 1));
      const label = (el.getAttribute("aria-label") || el.innerText || el.value || el.placeholder || el.title || el.name || "").replace(/\s+/g, " ").trim().slice(0, 80);
      const kind = el.tagName === "A" ? "link" : el.tagName === "INPUT" ? `eingabe(${el.type})` : el.tagName.toLowerCase();
      return `[${i + 1}] ${kind}: ${label}`;
    });
    return { text: document.body?.innerText.replace(/\n{3,}/g, "\n\n").trim().slice(0, 7000) || "", items };
  });
  return `Seite: ${await page.title()}\nURL: ${page.url()}\n\n--- Text ---\n${data.text}\n\n--- Bedienelemente ---\n${data.items.join("\n")}`;
}

async function labelOf(page, nummer) {
  const loc = page.locator(`[data-vertex-id="${Number(nummer)}"]`);
  if ((await loc.count()) === 0) throw new Error(`Element [${nummer}] nicht gefunden. Erst „lesen“, dann die neue Nummer nehmen.`);
  const label = await loc.evaluate((el) => (el.getAttribute("aria-label") || el.innerText || el.value || el.title || "").trim());
  return { loc, label };
}

/**
 * Führt eine Browser-Aktion aus. Gibt Text oder {text, bild} (JPEG, base64) zurück.
 * job.freigabe: vom Nutzer bestätigte 🔴-Aktion (Text), sonst gesperrt.
 */
export async function browserAktion(userId, input, job) {
  const { page } = await session(userId);
  const a = input.aktion;
  switch (a) {
    case "oeffnen": {
      let url = String(input.url || "");
      if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });
      await page.waitForTimeout(800);
      return snapshot(page);
    }
    case "lesen":
      return snapshot(page);
    case "klicken": {
      const { loc, label } = await labelOf(page, input.nummer);
      if (ROT.test(label) && !job?.freigabe) {
        return `🔴 GESPERRT: „${label}“ ist eine Aktion, die der Nutzer freigeben muss (kaufen/senden/posten/löschen). Klicke nicht. Beende den Auftrag und frage den Nutzer im Ergebnis klar, ob du das tun sollst.`;
      }
      await loc.click({ timeout: 10_000 });
      await page.waitForLoadState("domcontentloaded").catch(() => {});
      await page.waitForTimeout(1000);
      return `Geklickt: „${label}“.\n\n${await snapshot(page)}`;
    }
    case "tippen": {
      const { loc } = await labelOf(page, input.nummer);
      await loc.fill(String(input.text ?? ""), { timeout: 10_000 });
      if (input.enter) {
        // Enter in einem Formular mit „Senden/Bestellen“-Knopf = Absenden → braucht Freigabe
        const sendet = await loc.evaluate(
          (el, rot) => Boolean(el.form && [...el.form.querySelectorAll("button, input[type=submit]")].some((b) => new RegExp(rot, "i").test(b.innerText || b.value || ""))),
          ROT.source,
        );
        if (sendet && !job?.freigabe) return "🔴 GESPERRT: Enter würde dieses Formular absenden. Das braucht die Freigabe des Nutzers.";
        await loc.press("Enter");
        await page.waitForLoadState("domcontentloaded").catch(() => {});
        await page.waitForTimeout(1000);
      }
      return `Eingetragen.\n\n${await snapshot(page)}`;
    }
    case "scrollen":
      await page.mouse.wheel(0, input.richtung === "hoch" ? -800 : 800);
      await page.waitForTimeout(400);
      return snapshot(page);
    case "zurueck":
      await page.goBack({ waitUntil: "domcontentloaded" }).catch(() => {});
      return snapshot(page);
    case "bildschirmfoto": {
      const buf = await page.screenshot({ type: "jpeg", quality: 70 });
      if (input.fuer_nutzer && job) {
        const dir = path.join(userDir(userId), "bilder");
        await fs.mkdir(dir, { recursive: true });
        await fs.writeFile(path.join(dir, `${job.id}.jpg`), buf);
        job.bild = true;
      }
      return { text: `Bildschirmfoto von ${page.url()}${input.fuer_nutzer ? " (wird dem Nutzer im Ergebnis gezeigt)" : ""}`, bild: buf.toString("base64") };
    }
    default:
      throw new Error(`Unbekannte Aktion: ${a}`);
  }
}

export const BROWSER_TOOL = {
  name: "browser",
  description:
    "Steuert einen echten Browser auf dem Server (eigenes Profil pro Nutzer, Cookies und Warenkorb bleiben erhalten). " +
    "Aktionen: oeffnen(url) · lesen · klicken(nummer) · tippen(nummer, text, enter?) · scrollen(richtung) · zurueck · " +
    "bildschirmfoto(fuer_nutzer?). Jede Seite kommt mit nummerierten Bedienelementen zurück – Nummern gelten bis zum nächsten Seitenwechsel. " +
    "Kaufen, Bestellen, Senden, Posten, Löschen sind gesperrt, außer der Auftrag enthält eine Freigabe des Nutzers. " +
    "In den Warenkorb legen ist erlaubt. Am Ende ein Bildschirmfoto mit fuer_nutzer=true machen, wenn der Nutzer das Ergebnis sehen soll.",
  input_schema: {
    type: "object",
    properties: {
      aktion: { type: "string", enum: ["oeffnen", "lesen", "klicken", "tippen", "scrollen", "zurueck", "bildschirmfoto"] },
      url: { type: "string" },
      nummer: { type: "integer" },
      text: { type: "string" },
      enter: { type: "boolean" },
      richtung: { type: "string", enum: ["hoch", "runter"] },
      fuer_nutzer: { type: "boolean" },
    },
    required: ["aktion"],
  },
};

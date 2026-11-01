// Jugendschutz: Ein Prüf-Modell (Llama Guard 4 bei Groq, kostenlos) schaut sich Anfragen an,
// bevor ein Modell antwortet. Gefährliches wird freundlich abgelehnt; bei Selbstverletzung gibt es Hilfe-Nummern.
// Fällt die Prüfung aus, geht es trotzdem weiter (lieber eine Antwort als gar keine).
import { getSetting, setSetting, logEvent } from './db.js';
import { t } from './i18n.js';
import { complete, demoMode, hasProvider } from './models.js';

const GUARD_MODEL = process.env.SAFETY_MODEL?.trim() || 'groq:meta-llama/llama-guard-4-12b';
// Llama-Guard-Kategorien, die wir blockieren
const BLOCK = {
  S1: 'Gewalt', S3: 'Sexuelle Straftaten', S4: 'Missbrauch von Kindern', S9: 'Waffen für Massenschäden',
  S10: 'Hass', S11: 'Selbstverletzung', S12: 'Sexuelle Inhalte',
};

let enabledCache = null;
export async function safetyOn() {
  if (enabledCache === null) enabledCache = (await getSetting('safety', 'on')) !== 'off';
  return enabledCache;
}
export async function setSafety(on) {
  enabledCache = !!on;
  await setSetting('safety', on ? 'on' : 'off');
}

export const helpText = () => t(
  'Es klingt, als ginge es dir gerade nicht gut. Du bist damit nicht allein – bitte sprich mit jemandem: **Nummer gegen Kummer 116 111** (für Kinder und Jugendliche, kostenlos) oder **TelefonSeelsorge 0800 111 0 111** (rund um die Uhr, anonym). Im Notfall: **112**.',
  'It sounds like you are not doing well right now. You are not alone – please talk to someone. In Germany: **116 111** (for young people, free) or **0800 111 0 111** (24/7, anonymous). In an emergency: **112**.',
);

// Prüft einen Text. Rückgabe: null (in Ordnung) oder { category, label, message }
export async function checkText(text, kind = 'prompt') {
  const clean = String(text ?? '').trim().slice(0, 6000);
  if (!clean || !(await safetyOn())) return null;
  let verdict = 'safe';
  if (demoMode) {
    if (/TESTUNSAFE/.test(clean)) verdict = 'unsafe\nS1';
    else if (/TESTSELFHARM/.test(clean)) verdict = 'unsafe\nS11';
  } else {
    if (!hasProvider('groq')) return null;
    try {
      const msg = await complete({ model: GUARD_MODEL, messages: [{ role: 'user', content: clean }], maxTokens: 20, signal: AbortSignal.timeout(8000) });
      verdict = String(msg.content ?? '').trim().toLowerCase();
    } catch (err) {
      console.error('Jugendschutz-Prüfung nicht möglich:', err.message);
      return null;
    }
  }
  if (!verdict.startsWith('unsafe')) return null;
  const cats = (verdict.match(/s\d+/gi) ?? []).map((c) => c.toUpperCase());
  const hit = cats.find((c) => BLOCK[c]);
  if (!hit) return null;
  logEvent('blocked', null, `${kind}: ${hit} (${BLOCK[hit]})`);
  const message = hit === 'S11'
    ? helpText()
    : kind === 'site'
      ? t('Diese Webseite kann nicht veröffentlicht werden, weil sie gegen unsere Regeln verstößt.', 'This website cannot be published because it breaks our rules.')
      : kind === 'image'
        ? t('Dieses Bild erstelle ich nicht. Bitte beschreibe etwas anderes.', 'I won’t create this image. Please describe something else.')
        : t('Dabei kann ich nicht helfen. Frag mich gern etwas anderes.', 'I can’t help with that. Feel free to ask me something else.');
  return { category: hit, label: BLOCK[hit], message };
}

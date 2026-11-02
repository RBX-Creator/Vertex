// Weitere Sprachen für die Oberfläche (Türkisch, Spanisch, Französisch, Ukrainisch).
// Die ~600 englischen Texte (public/i18n/strings.json) übersetzt VAIs einmalig selbst mit einem
// kostenlosen Modell und speichert das Ergebnis. Neue Texte werden nach einem Update nachübersetzt.
import { readFileSync } from 'node:fs';
import { getSetting, setSetting } from './db.js';
import { EXTRA_LANGS, setDict } from './i18n.js';
import { listModels, complete, demoMode, rankModels } from './models.js';

const STRINGS = JSON.parse(readFileSync(new URL('../public/i18n/strings.json', import.meta.url), 'utf8'));
const NAMES = { tr: 'Turkish (Türkçe)', es: 'Spanish (Español)', fr: 'French (Français)', uk: 'Ukrainian (Українська)' };
const STYLE = { tr: 'informal "sen"', es: 'informal "tú"', fr: 'informal "tu"', uk: 'informal "ти"' };
const BATCH = 40;

const dicts = {};
const running = new Set();

for (const l of EXTRA_LANGS) {
  try { dicts[l] = JSON.parse(await getSetting(`ui_i18n_${l}`, '{}')) || {}; } catch { dicts[l] = {}; }
  setDict(l, dicts[l]);
}

const missing = (l) => STRINGS.filter((s) => !dicts[l]?.[s]);

async function pickModel() {
  const all = (await listModels()).filter((m) => m.caps.includes('text') && !m.paid && !m.busy);
  return rankModels('translate', all)[0] ?? null;
}

async function translateBatch(l, items, model) {
  const prompt = [
    `Translate these user-interface texts of the chat app "VAIs" from English to ${NAMES[l]}.`,
    `Use a friendly, ${STYLE[l]} tone, short like in an app. Keep "VAIs", "Agent X", model names, emojis, symbols (→ ✓ · …), numbers and punctuation style.`,
    `Answer with ONLY a JSON array of exactly ${items.length} strings, in the same order. No explanations.`,
    '',
    JSON.stringify(items),
  ].join('\n');
  const msg = await complete({ model: model.id, messages: [{ role: 'user', content: prompt }], maxTokens: 6000 });
  const raw = String(msg.content ?? '').replace(/^[\s\S]*?(\[[\s\S]*\])[\s\S]*$/, '$1');
  const arr = JSON.parse(raw);
  if (!Array.isArray(arr) || arr.length !== items.length) throw new Error(`Falsche Anzahl (${arr?.length} statt ${items.length})`);
  arr.forEach((v, i) => { if (typeof v === 'string' && v.trim()) dicts[l][items[i]] = v.trim(); });
}

// Fehlende Texte im Hintergrund übersetzen (pro Sprache nur ein Lauf gleichzeitig)
export async function ensureLang(l) {
  if (!EXTRA_LANGS.includes(l) || running.has(l) || demoMode) return;
  const todo = missing(l);
  if (!todo.length) return;
  running.add(l);
  try {
    for (let i = 0; i < todo.length; i += BATCH) {
      const model = await pickModel();
      if (!model) break;
      const items = todo.slice(i, i + BATCH);
      try {
        await translateBatch(l, items, model);
      } catch (err) {
        // halbe Portion nochmal versuchen, dann weiter
        console.error(`UI-Übersetzung ${l}:`, err.message);
        const half = Math.ceil(items.length / 2);
        for (const part of [items.slice(0, half), items.slice(half)]) await translateBatch(l, part, model).catch(() => {});
      }
      await setSetting(`ui_i18n_${l}`, JSON.stringify(dicts[l]));
      setDict(l, dicts[l]);
    }
    console.log(`UI-Übersetzung ${l}: ${STRINGS.length - missing(l).length}/${STRINGS.length} Texte.`);
  } finally {
    running.delete(l);
  }
}

export async function serveDict(req, res) {
  const l = String(req.params.lang ?? '');
  if (!EXTRA_LANGS.includes(l)) return res.status(404).json({});
  const left = missing(l).length;
  if (left) ensureLang(l).catch(() => {});
  res.set('Cache-Control', 'no-cache').json({ lang: l, complete: !left, total: STRINGS.length, dict: dicts[l] ?? {} });
}

// Nach dem Start alle Sprachen nacheinander vervollständigen (verteilt, um Limits zu schonen)
setTimeout(async () => {
  for (const l of EXTRA_LANGS) await ensureLang(l).catch(() => {});
}, 30_000).unref();

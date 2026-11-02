// Eigene Antworten vom Admin: Frage + Antwort eintragen. Fragt jemand dasselbe (oder fast dasselbe,
// höchstens ein Wort anders, kleine Tippfehler egal), kommt sofort diese Antwort – ohne KI, zählt nicht.
// Dazu: die häufigsten Fragen der Nutzer (nur Fragen, die mehrere verschiedene Personen gestellt haben).
import { get, run, all } from './db.js';

await run(`CREATE TABLE IF NOT EXISTS faq (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  hits INTEGER NOT NULL DEFAULT 0,
  last_hit INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
)`);

// Füllwörter, die für die Bedeutung kaum zählen
const STOP = new Set(['der', 'die', 'das', 'ein', 'eine', 'einen', 'einem', 'einer', 'und', 'oder', 'mal', 'bitte', 'denn', 'eigentlich', 'so', 'doch', 'ja', 'nur',
  'the', 'a', 'an', 'please', 'hey', 'hi', 'hallo', 'yo', 'mir', 'mich', 'me', 'kannst', 'du', 'can', 'you', 'wie', 'was', 'wer', 'wo',
  'sag', 'sagen', 'weisst', 'weißt', 'tell', 'hab', 'habe', 'mein', 'meine', 'meinen', 'my', 'erklär', 'erkläre', 'uns', 'ich', 'würde', 'gern', 'gerne', 'wissen', 'möchte']);

export function words(text = '') {
  return String(text).toLowerCase()
    .replace(/ß/g, 'ss')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/).filter(Boolean);
}
// Kleine Tippfehler bei längeren Wörtern zählen nicht als „anders“
function lev(a, b) {
  if (Math.abs(a.length - b.length) > 1) return 2;
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) {
    dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    // vertauschte Buchstaben („Passwrot“) zählen als ein Tippfehler
    if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) dp[i][j] = Math.min(dp[i][j], dp[i - 2][j - 2] + 1);
  }
  return dp[a.length][b.length];
}
const sameWord = (a, b) => a === b || (a.length >= 5 && b.length >= 5 && lev(a, b) <= 1);
// Abstand in ganzen Wörtern (einfügen, löschen, ersetzen)
function wordDistance(a, b) {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) {
    dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (sameWord(a[i - 1], b[j - 1]) ? 0 : 1));
  }
  return dp[a.length][b.length];
}

// Passt eine Nutzer-Frage zu einer gespeicherten Frage?
// - gleich (Groß/klein, Satzzeichen, kleine Tippfehler egal)
// - nur Füllwörter anders („bitte“, „mal“, „kannst du“ …)
// - bei längeren Fragen (ab 4 wichtigen Wörtern) darf EIN wichtiges Wort anders sein
//   (bei kurzen Fragen nicht: „Was ist ein Hund?“ ≠ „Was ist ein Wal?“)
export function matches(userText, faqQuestion) {
  const u = words(userText);
  const f = words(faqQuestion);
  if (!u.length || !f.length || u.length > 40) return false;
  const full = wordDistance(u, f);
  if (full === 0) return true;
  // längere Fragen (ab 5 Wörtern): ein Wort anders ist okay
  if (full <= 1 && Math.min(u.length, f.length) >= 5) return true;
  const core = (ws) => ws.filter((w) => !STOP.has(w));
  const cu = core(u), cf = core(f);
  if (!cu.length || !cf.length) return false;
  const d = wordDistance(cu, cf);
  if (d === 0) return true;
  // gleiche wichtige Wörter, nur andere Reihenfolge („Wer hat VAIs gemacht“ ↔ „VAIs gemacht hat wer“)
  const su = new Set(cu), sf = new Set(cf);
  if (su.size === sf.size && [...su].every((w) => [...sf].some((x) => sameWord(w, x)))) return true;
  return d <= 1 && Math.min(cu.length, cf.length) >= 4;
}

let cache = null;
async function list() {
  if (!cache) cache = await all('SELECT id, question, answer, hits, last_hit, created_at, updated_at FROM faq ORDER BY id DESC');
  return cache;
}
export async function faqMatch(text) {
  const t = String(text ?? '').trim();
  if (!t || t.length > 300) return null;
  for (const f of await list()) {
    if (matches(t, f.question)) {
      run('UPDATE faq SET hits = hits + 1, last_hit = ? WHERE id = ?', Date.now(), f.id).then(() => { cache = null; }).catch(() => {});
      return { id: Number(f.id), question: f.question, answer: f.answer };
    }
  }
  return null;
}

export async function faqList() {
  return (await list()).map((f) => ({ id: Number(f.id), question: f.question, answer: f.answer, hits: Number(f.hits), lastHit: f.last_hit ? Number(f.last_hit) : null, updated: Number(f.updated_at) }));
}
export async function faqSave({ id, question, answer }) {
  const q = String(question ?? '').replace(/\s+/g, ' ').trim().slice(0, 300);
  const a = String(answer ?? '').trim().slice(0, 4000);
  if (q.length < 2 || !a) throw Object.assign(new Error('Bitte Frage und Antwort eintragen.'), { status: 400 });
  const now = Date.now();
  if (id) await run('UPDATE faq SET question = ?, answer = ?, updated_at = ? WHERE id = ?', q, a, now, Number(id));
  else {
    if ((await list()).length >= 300) throw Object.assign(new Error('Höchstens 300 eigene Antworten.'), { status: 400 });
    await run('INSERT INTO faq (question, answer, created_at, updated_at) VALUES (?, ?, ?, ?)', q, a, now, now);
  }
  cache = null;
}
export async function faqRemove(id) {
  await run('DELETE FROM faq WHERE id = ?', Number(id));
  cache = null;
}

// Häufigste Fragen: ähnliche Fragen zusammenfassen (ohne Füllwörter, Reihenfolge egal),
// nur Fragen von mindestens 2 verschiedenen Personen – so bleibt Persönliches verborgen
export async function topQuestions(days = 30) {
  const since = Date.now() - days * 24 * 3600 * 1000;
  const rows = await all(`SELECT m.content, c.user_id FROM messages m JOIN chats c ON c.id = m.chat_id
    WHERE m.side = -1 AND m.created_at >= ? AND c.user_id > 0 AND (c.incognito IS NULL OR c.incognito = 0) AND length(m.content) BETWEEN 2 AND 200`, since);
  const allUsers = new Set(rows.map((r) => Number(r.user_id)));
  const groups = new Map();
  for (const r of rows) {
    const ws = words(r.content).filter((w) => !STOP.has(w));
    if (!ws.length || ws.length > 14) continue;
    const key = [...new Set(ws)].sort().join(' ');
    let g = groups.get(key);
    if (!g) { g = { users: new Set(), count: 0, texts: new Map() }; groups.set(key, g); }
    g.users.add(Number(r.user_id));
    g.count++;
    const label = String(r.content).trim().replace(/\s+/g, ' ');
    g.texts.set(label, (g.texts.get(label) ?? 0) + 1);
  }
  const faqs = await list();
  return {
    users: allUsers.size,
    days,
    questions: [...groups.values()]
      .filter((g) => g.users.size >= 2)
      .sort((a, b) => b.users.size - a.users.size || b.count - a.count)
      .slice(0, 25)
      .map((g) => {
        const text = [...g.texts.entries()].sort((a, b) => b[1] - a[1])[0][0];
        return { text, users: g.users.size, count: g.count, percent: allUsers.size ? Math.round((g.users.size / allUsers.size) * 100) : 0, answered: faqs.some((f) => matches(text, f.question)) };
      }),
  };
}

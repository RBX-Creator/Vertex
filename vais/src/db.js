import { createClient } from '@libsql/client';
import { mkdirSync } from 'node:fs';

// Online: Turso-Datenbank (DATABASE_URL + DATABASE_TOKEN).
// Lokal ohne Einstellungen: Datei data/vais.db
const url = process.env.DATABASE_URL || 'file:data/vais.db';
if (url.startsWith('file:')) mkdirSync('data', { recursive: true });

const client = createClient({ url, authToken: process.env.DATABASE_TOKEN || undefined });

export const get = async (sql, ...args) => (await client.execute({ sql, args })).rows[0];
export const run = (sql, ...args) => client.execute({ sql, args });

await client.batch([
  `CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    email         TEXT    NOT NULL UNIQUE,
    password_hash TEXT    NOT NULL,
    verified      INTEGER NOT NULL DEFAULT 0,
    created_at    INTEGER NOT NULL
  )`,
  // Einmal-Codes für E-Mail-Bestätigung ('verify') und Passwort-Reset ('reset')
  `CREATE TABLE IF NOT EXISTS codes (
    email      TEXT    NOT NULL,
    purpose    TEXT    NOT NULL,
    code_hash  TEXT    NOT NULL,
    expires_at INTEGER NOT NULL,
    sent_at    INTEGER NOT NULL,
    attempts   INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (email, purpose)
  )`,
  `CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT    PRIMARY KEY,
    user_id    INTEGER NOT NULL,
    expires_at INTEGER NOT NULL
  )`,
  // Ein Chat: 'battle' (2 anonyme Modelle), 'sxs' (2 gewählte), 'direct' (1 Modell)
  // winner: 'a' | 'b' | 'tie' | 'bad' – Grundlage für eine spätere Bestenliste
  `CREATE TABLE IF NOT EXISTS chats (
    id         TEXT    PRIMARY KEY,
    user_id    INTEGER NOT NULL,
    mode       TEXT    NOT NULL,
    model_a    TEXT    NOT NULL,
    model_b    TEXT,
    winner     TEXT,
    voted_at   INTEGER,
    created_at INTEGER NOT NULL
  )`,
  // Verlauf: eine Zeile pro Nachricht. side = -1 für deine Frage, 0/1 für Antwort A/B
  `CREATE TABLE IF NOT EXISTS messages (
    chat_id    TEXT    NOT NULL,
    turn       INTEGER NOT NULL,
    side       INTEGER NOT NULL,
    content    TEXT    NOT NULL,
    status     TEXT    NOT NULL DEFAULT 'done',
    error      TEXT,
    created_at INTEGER NOT NULL,
    PRIMARY KEY (chat_id, turn, side)
  )`,
  'CREATE INDEX IF NOT EXISTS chats_by_user ON chats (user_id, created_at)',
], 'write');

// Spalten, die später dazugekommen sind (bestehende Datenbanken nachrüsten)
for (const [column, type] of [['title', 'TEXT'], ['updated_at', 'INTEGER'], ['modality', 'TEXT'], ['share_id', 'TEXT'], ['renamed', 'INTEGER'], ['pinned', 'INTEGER'], ['folder', 'TEXT']]) {
  try { await client.execute(`ALTER TABLE chats ADD COLUMN ${column} ${type}`); } catch { /* gibt es schon */ }
}

await client.execute('CREATE UNIQUE INDEX IF NOT EXISTS chats_share ON chats (share_id) WHERE share_id IS NOT NULL');
try { await client.execute('ALTER TABLE messages ADD COLUMN meta TEXT'); } catch { /* gibt es schon */ }
try { await client.execute('ALTER TABLE messages ADD COLUMN feedback INTEGER'); } catch { /* gibt es schon */ }
try { await client.execute('ALTER TABLE messages ADD COLUMN attachments TEXT'); } catch { /* gibt es schon */ }
try { await client.execute('ALTER TABLE users ADD COLUMN blocked INTEGER'); } catch { /* gibt es schon */ }
try { await client.execute('ALTER TABLE users ADD COLUMN daily_limit INTEGER'); } catch { /* gibt es schon */ }
try { await client.execute('ALTER TABLE users ADD COLUMN instructions TEXT'); } catch { /* gibt es schon */ }
try { await client.execute('ALTER TABLE users ADD COLUMN memory_off INTEGER'); } catch { /* gibt es schon */ }

// Gedächtnis von Agent X: kurze Fakten über den Nutzer
await client.execute(`CREATE TABLE IF NOT EXISTS memories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  text TEXT NOT NULL,
  created_at INTEGER NOT NULL
)`);
await client.execute('CREATE INDEX IF NOT EXISTS memories_user ON memories (user_id)');

// Verbrauch pro Nutzer und Tag (in Punkten)
await client.execute(`CREATE TABLE IF NOT EXISTS usage (
  user_id INTEGER NOT NULL,
  day TEXT NOT NULL,
  points INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, day)
)`);

// Ereignisse für die Admin-Seite (Fehler, Modell-Nutzung) – wird klein gehalten
await client.execute(`CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL,
  model TEXT,
  detail TEXT,
  created_at INTEGER NOT NULL
)`);
await client.execute('CREATE INDEX IF NOT EXISTS events_time ON events (created_at)');
await client.execute('CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT)');

export async function getSetting(key, fallback = null) {
  const row = await get('SELECT value FROM settings WHERE key = ?', key);
  return row ? row.value : fallback;
}
export const setSetting = (key, value) => run('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', key, String(value));

// Ereignis merken (Fehler, Ausfälle …). Alte Einträge räumen wir gelegentlich auf.
let logged = 0;
export async function logEvent(kind, model = null, detail = null) {
  try {
    await run('INSERT INTO events (kind, model, detail, created_at) VALUES (?, ?, ?, ?)', kind, model, detail ? String(detail).slice(0, 500) : null, Date.now());
    if (++logged % 200 === 0) await run('DELETE FROM events WHERE created_at < ?', Date.now() - 30 * 24 * 3600 * 1000);
  } catch { /* Protokoll darf nie stören */ }
}

// Chats eines Nutzers löschen. Abgestimmte Battles bleiben (ohne Inhalt) für die Bestenliste erhalten.
export async function purgeChats(userId, chatId = null) {
  const filter = chatId ? 'id = ? AND user_id = ?' : 'user_id = ?';
  const args = chatId ? [chatId, userId] : [userId];
  await run(`DELETE FROM messages WHERE chat_id IN (SELECT id FROM chats WHERE ${filter})`, ...args);
  await run(`UPDATE chats SET user_id = 0, title = NULL, share_id = NULL WHERE ${filter} AND winner IS NOT NULL`, ...args);
  await run(`DELETE FROM chats WHERE ${filter} AND winner IS NULL`, ...args);
}

export const all = async (sql, ...args) => (await client.execute({ sql, args })).rows;

// Abgelaufene Einträge regelmäßig aufräumen
const cleanup = async () => {
  const now = Date.now();
  await run('DELETE FROM sessions WHERE expires_at < ?', now);
  await run('DELETE FROM codes WHERE expires_at < ?', now);
};
await cleanup();
setInterval(() => cleanup().catch((e) => console.error('Aufräumen fehlgeschlagen:', e.message)), 60 * 60 * 1000).unref();

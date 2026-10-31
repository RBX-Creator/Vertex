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
for (const [column, type] of [['title', 'TEXT'], ['updated_at', 'INTEGER']]) {
  try { await client.execute(`ALTER TABLE chats ADD COLUMN ${column} ${type}`); } catch { /* gibt es schon */ }
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

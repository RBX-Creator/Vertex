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
], 'write');

// Abgelaufene Einträge regelmäßig aufräumen
const cleanup = async () => {
  const now = Date.now();
  await run('DELETE FROM sessions WHERE expires_at < ?', now);
  await run('DELETE FROM codes WHERE expires_at < ?', now);
};
await cleanup();
setInterval(() => cleanup().catch((e) => console.error('Aufräumen fehlgeschlagen:', e.message)), 60 * 60 * 1000).unref();

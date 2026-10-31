import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const file = resolve(process.env.DB_FILE || 'data/vais.db');
mkdirSync(dirname(file), { recursive: true });

export const db = new DatabaseSync(file);

db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    email         TEXT    NOT NULL UNIQUE,
    password_hash TEXT    NOT NULL,
    verified      INTEGER NOT NULL DEFAULT 0,
    created_at    INTEGER NOT NULL
  );

  -- Einmal-Codes für E-Mail-Bestätigung ('verify') und Passwort-Reset ('reset')
  CREATE TABLE IF NOT EXISTS codes (
    email      TEXT    NOT NULL,
    purpose    TEXT    NOT NULL,
    code_hash  TEXT    NOT NULL,
    expires_at INTEGER NOT NULL,
    sent_at    INTEGER NOT NULL,
    attempts   INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (email, purpose)
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT    PRIMARY KEY,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at INTEGER NOT NULL
  );
`);

// Abgelaufene Einträge regelmäßig aufräumen
const cleanup = () => {
  const now = Date.now();
  db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(now);
  db.prepare('DELETE FROM codes WHERE expires_at < ?').run(now);
};
cleanup();
setInterval(cleanup, 60 * 60 * 1000).unref();

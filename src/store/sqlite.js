import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

/** SQLite-Adapter: nutzt das eingebaute node:sqlite (Node >= 22.5), sonst better-sqlite3 (falls installiert). */
export async function openSqlite(path) {
  let Database;
  let kind;
  try {
    ({ DatabaseSync: Database } = await import('node:sqlite'));
    kind = 'sqlite (node:sqlite)';
  } catch {
    try {
      Database = (await import('better-sqlite3')).default;
      kind = 'sqlite (better-sqlite3)';
    } catch {
      throw new Error('Kein SQLite verfügbar: Nutze Node >= 22.5, installiere "better-sqlite3" oder setze DATABASE_URL (Postgres).');
    }
  }
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new Database(path);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;');
  const cache = new Map();
  const prep = (sql) => {
    let s = cache.get(sql);
    if (!s) {
      s = db.prepare(sql);
      cache.set(sql, s);
    }
    return s;
  };
  return {
    kind,
    async run(sql, params = []) {
      if (/^\s*CREATE/i.test(sql)) return db.exec(sql);
      prep(sql).run(...params);
    },
    async get(sql, params = []) {
      return prep(sql).get(...params) ?? null;
    },
    async all(sql, params = []) {
      return prep(sql).all(...params);
    },
    async close() {
      db.close();
    },
  };
}

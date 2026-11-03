import { createSqlStore } from './sql.js';
import { openSqlite } from './sqlite.js';
import { openPostgres } from './postgres.js';

/** Wählt automatisch Postgres (wenn DATABASE_URL gesetzt) oder SQLite. */
export async function createStore(config, opts = {}) {
  const db = config.databaseUrl
    ? await openPostgres(config.databaseUrl, opts)
    : await openSqlite(config.sqlitePath);
  const store = createSqlStore(db, opts);
  await store.init();
  return store;
}

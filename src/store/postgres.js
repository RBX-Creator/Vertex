/** Postgres-Adapter (z. B. Neon, Supabase, Render Postgres). `Pool` kann für Tests injiziert werden. */
export async function openPostgres(connectionString, { Pool } = {}) {
  if (!Pool) {
    const pg = (await import('pg')).default;
    pg.types.setTypeParser(20, (v) => parseInt(v, 10)); // BIGINT -> Number (Telegram-IDs passen sicher hinein)
    Pool = pg.Pool;
  }
  const pool = new Pool({ connectionString, max: 5 });
  const conv = (sql) => {
    let i = 0;
    return sql.replace(/\?/g, () => `$${++i}`);
  };
  return {
    kind: 'postgres',
    async run(sql, params = []) {
      await pool.query(conv(sql), params);
    },
    async get(sql, params = []) {
      const r = await pool.query(conv(sql), params);
      return r.rows[0] ?? null;
    },
    async all(sql, params = []) {
      return (await pool.query(conv(sql), params)).rows;
    },
    async close() {
      await pool.end();
    },
  };
}

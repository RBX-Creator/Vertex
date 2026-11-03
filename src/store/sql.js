import { randomUUID } from 'node:crypto';

/**
 * Gemeinsame SQL-Logik für SQLite und Postgres.
 * Adapter `db` muss bieten: run(sql, params), get(sql, params), all(sql, params), close().
 * Platzhalter sind immer `?` (der Postgres-Adapter wandelt sie in $1, $2 ... um).
 */
const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS users (
    id BIGINT PRIMARY KEY,
    username TEXT,
    state TEXT NOT NULL DEFAULT 'new',
    state_data TEXT,
    rules_accepted INTEGER NOT NULL DEFAULT 0,
    complete INTEGER NOT NULL DEFAULT 0,
    paused INTEGER NOT NULL DEFAULT 0,
    name TEXT,
    age INTEGER,
    city TEXT,
    role TEXT,
    seek_role TEXT,
    offers TEXT,
    seeks TEXT,
    about TEXT,
    photo TEXT,
    link TEXT,
    created_at BIGINT,
    updated_at BIGINT,
    last_active BIGINT
  )`,
  `CREATE TABLE IF NOT EXISTS likes (
    from_id BIGINT NOT NULL,
    to_id BIGINT NOT NULL,
    message TEXT,
    answered INTEGER NOT NULL DEFAULT 0,
    created_at BIGINT NOT NULL,
    PRIMARY KEY (from_id, to_id)
  )`,
  `CREATE TABLE IF NOT EXISTS views (
    viewer_id BIGINT NOT NULL,
    viewed_id BIGINT NOT NULL,
    at BIGINT NOT NULL,
    PRIMARY KEY (viewer_id, viewed_id)
  )`,
  `CREATE TABLE IF NOT EXISTS matches (
    a_id BIGINT NOT NULL,
    b_id BIGINT NOT NULL,
    share_a INTEGER NOT NULL DEFAULT 0,
    share_b INTEGER NOT NULL DEFAULT 0,
    created_at BIGINT NOT NULL,
    PRIMARY KEY (a_id, b_id)
  )`,
  `CREATE TABLE IF NOT EXISTS blocks (
    blocker_id BIGINT NOT NULL,
    blocked_id BIGINT NOT NULL,
    at BIGINT NOT NULL,
    PRIMARY KEY (blocker_id, blocked_id)
  )`,
  `CREATE TABLE IF NOT EXISTS reports (
    id TEXT PRIMARY KEY,
    reporter_id BIGINT NOT NULL,
    reported_id BIGINT NOT NULL,
    reason TEXT,
    context TEXT,
    at BIGINT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS bans (
    user_id BIGINT PRIMARY KEY,
    reason TEXT,
    at BIGINT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS events (
    user_id BIGINT NOT NULL,
    kind TEXT NOT NULL,
    at BIGINT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_events_user ON events (user_id, kind, at)`,
  `CREATE INDEX IF NOT EXISTS idx_likes_to ON likes (to_id, answered)`,
  `CREATE INDEX IF NOT EXISTS idx_users_browse ON users (complete, paused, age)`,
];

const USER_COLUMNS = [
  'username', 'state', 'rules_accepted', 'complete', 'paused', 'name', 'age', 'city', 'role',
  'seek_role', 'offers', 'seeks', 'about', 'photo', 'link', 'last_active',
];
const NUMERIC = ['id', 'age', 'rules_accepted', 'complete', 'paused', 'created_at', 'updated_at', 'last_active'];

function toUser(row) {
  if (!row) return null;
  const u = { ...row };
  for (const k of NUMERIC) if (u[k] !== null && u[k] !== undefined) u[k] = Number(u[k]);
  try {
    u.data = u.state_data ? JSON.parse(u.state_data) : null;
  } catch {
    u.data = null;
  }
  delete u.state_data;
  return u;
}

const clean = (v) => (v === undefined ? null : typeof v === 'boolean' ? (v ? 1 : 0) : v);
const p = (arr) => arr.map(clean);
const pair = (x, y) => (Number(x) < Number(y) ? [Number(x), Number(y)] : [Number(y), Number(x)]);

export function createSqlStore(db, { now = () => Date.now() } = {}) {
  const run = (sql, params = []) => db.run(sql, p(params));
  const get = (sql, params = []) => db.get(sql, p(params));
  const all = (sql, params = []) => db.all(sql, p(params));
  const count = async (sql, params) => Number((await get(sql, params))?.n ?? 0);

  const store = {
    kind: db.kind,
    async init() {
      for (const s of SCHEMA) await run(s);
    },
    close: () => db.close(),

    // ---------- Users ----------
    async getUser(id) {
      return toUser(await get('SELECT * FROM users WHERE id = ?', [id]));
    },
    async upsertUser(id, fields = {}) {
      const t = now();
      await run('INSERT INTO users (id, created_at, updated_at, last_active) VALUES (?, ?, ?, ?) ON CONFLICT (id) DO NOTHING', [id, t, t, t]);
      const sets = [];
      const vals = [];
      for (const [k, v] of Object.entries(fields)) {
        if (k === 'data') {
          sets.push('state_data = ?');
          vals.push(v == null ? null : JSON.stringify(v));
        } else if (USER_COLUMNS.includes(k)) {
          sets.push(`${k} = ?`);
          vals.push(v);
        }
      }
      sets.push('updated_at = ?');
      vals.push(t, id);
      await run(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`, vals);
      return store.getUser(id);
    },
    async deleteUser(id) {
      await run('DELETE FROM users WHERE id = ?', [id]);
      await store.clearRelations(id);
      await run('DELETE FROM views WHERE viewer_id = ? OR viewed_id = ?', [id, id]);
      await run('DELETE FROM events WHERE user_id = ?', [id]);
      // Blocks, Reports und Bans bleiben aus Sicherheitsgründen bestehen.
    },
    /** Löscht Likes und Matches eines Users (z. B. bei Wechsel der Altersgruppe). */
    async clearRelations(id) {
      await run('DELETE FROM likes WHERE from_id = ? OR to_id = ?', [id, id]);
      await run('DELETE FROM matches WHERE a_id = ? OR b_id = ?', [id, id]);
    },
    async listCandidates(meId, { minAge, maxAge, viewedSince, limit = 200 }) {
      const rows = await all(
        `SELECT * FROM users
         WHERE complete = 1 AND paused = 0 AND id <> ? AND age >= ? AND age <= ?
           AND id NOT IN (SELECT user_id FROM bans)
           AND id NOT IN (SELECT blocked_id FROM blocks WHERE blocker_id = ?)
           AND id NOT IN (SELECT blocker_id FROM blocks WHERE blocked_id = ?)
           AND id NOT IN (SELECT to_id FROM likes WHERE from_id = ?)
           AND id NOT IN (SELECT b_id FROM matches WHERE a_id = ?)
           AND id NOT IN (SELECT a_id FROM matches WHERE b_id = ?)
           AND id NOT IN (SELECT viewed_id FROM views WHERE viewer_id = ? AND at > ?)
         ORDER BY last_active DESC
         LIMIT ?`,
        [meId, minAge, maxAge, meId, meId, meId, meId, meId, meId, viewedSince, limit],
      );
      return rows.map(toUser);
    },
    async addView(viewerId, viewedId) {
      await run(
        'INSERT INTO views (viewer_id, viewed_id, at) VALUES (?, ?, ?) ON CONFLICT (viewer_id, viewed_id) DO UPDATE SET at = excluded.at',
        [viewerId, viewedId, now()],
      );
    },

    // ---------- Likes ----------
    async addLike(fromId, toId, message = null) {
      await run(
        `INSERT INTO likes (from_id, to_id, message, answered, created_at) VALUES (?, ?, ?, 0, ?)
         ON CONFLICT (from_id, to_id) DO UPDATE SET message = excluded.message, answered = 0, created_at = excluded.created_at`,
        [fromId, toId, message, now()],
      );
    },
    async getLike(fromId, toId) {
      const r = await get('SELECT * FROM likes WHERE from_id = ? AND to_id = ?', [fromId, toId]);
      return r ? { ...r, from_id: Number(r.from_id), to_id: Number(r.to_id), answered: Number(r.answered) } : null;
    },
    async answerLike(fromId, toId) {
      await run('UPDATE likes SET answered = 1 WHERE from_id = ? AND to_id = ?', [fromId, toId]);
    },
    async pendingLikes(toId, { minAge, maxAge, limit = 50 }) {
      const rows = await all(
        `SELECT l.from_id, l.message, l.created_at FROM likes l
         JOIN users u ON u.id = l.from_id
         WHERE l.to_id = ? AND l.answered = 0 AND u.complete = 1 AND u.age >= ? AND u.age <= ?
           AND l.from_id NOT IN (SELECT user_id FROM bans)
           AND l.from_id NOT IN (SELECT blocked_id FROM blocks WHERE blocker_id = ?)
           AND l.from_id NOT IN (SELECT blocker_id FROM blocks WHERE blocked_id = ?)
         ORDER BY l.created_at ASC
         LIMIT ?`,
        [toId, minAge, maxAge, toId, toId, limit],
      );
      return rows.map((r) => ({ from_id: Number(r.from_id), message: r.message, created_at: Number(r.created_at) }));
    },

    // ---------- Matches ----------
    async addMatch(x, y) {
      const [a, b] = pair(x, y);
      await run('INSERT INTO matches (a_id, b_id, created_at) VALUES (?, ?, ?) ON CONFLICT (a_id, b_id) DO NOTHING', [a, b, now()]);
    },
    async getMatch(x, y) {
      const [a, b] = pair(x, y);
      const r = await get('SELECT * FROM matches WHERE a_id = ? AND b_id = ?', [a, b]);
      if (!r) return null;
      return { a_id: Number(r.a_id), b_id: Number(r.b_id), share_a: Number(r.share_a), share_b: Number(r.share_b), created_at: Number(r.created_at) };
    },
    async setShare(userId, otherId) {
      const [a] = pair(userId, otherId);
      const col = Number(userId) === a ? 'share_a' : 'share_b';
      const [x, y] = pair(userId, otherId);
      await run(`UPDATE matches SET ${col} = 1 WHERE a_id = ? AND b_id = ?`, [x, y]);
      return store.getMatch(userId, otherId);
    },
    async listMatches(userId) {
      const rows = await all('SELECT * FROM matches WHERE a_id = ? OR b_id = ? ORDER BY created_at DESC', [userId, userId]);
      return rows.map((r) => (Number(r.a_id) === Number(userId) ? Number(r.b_id) : Number(r.a_id)));
    },
    async deleteMatch(x, y) {
      const [a, b] = pair(x, y);
      await run('DELETE FROM matches WHERE a_id = ? AND b_id = ?', [a, b]);
    },

    // ---------- Blocks / Reports / Bans ----------
    async addBlock(blockerId, blockedId) {
      await run('INSERT INTO blocks (blocker_id, blocked_id, at) VALUES (?, ?, ?) ON CONFLICT (blocker_id, blocked_id) DO NOTHING', [blockerId, blockedId, now()]);
    },
    async isBlocked(x, y) {
      return (await count('SELECT COUNT(*) AS n FROM blocks WHERE (blocker_id = ? AND blocked_id = ?) OR (blocker_id = ? AND blocked_id = ?)', [x, y, y, x])) > 0;
    },
    async addReport({ reporterId, reportedId, reason, context = null }) {
      const id = randomUUID();
      await run('INSERT INTO reports (id, reporter_id, reported_id, reason, context, at) VALUES (?, ?, ?, ?, ?, ?)', [id, reporterId, reportedId, reason, context, now()]);
      return id;
    },
    async countReportsAgainst(id) {
      return count('SELECT COUNT(DISTINCT reporter_id) AS n FROM reports WHERE reported_id = ?', [id]);
    },
    async ban(userId, reason = null) {
      await run('INSERT INTO bans (user_id, reason, at) VALUES (?, ?, ?) ON CONFLICT (user_id) DO UPDATE SET reason = excluded.reason', [userId, reason, now()]);
    },
    async unban(userId) {
      await run('DELETE FROM bans WHERE user_id = ?', [userId]);
    },
    async isBanned(userId) {
      return (await count('SELECT COUNT(*) AS n FROM bans WHERE user_id = ?', [userId])) > 0;
    },

    // ---------- Rate limits ----------
    async addEvent(userId, kind) {
      await run('INSERT INTO events (user_id, kind, at) VALUES (?, ?, ?)', [userId, kind, now()]);
    },
    async countEvents(userId, kind, since) {
      return count('SELECT COUNT(*) AS n FROM events WHERE user_id = ? AND kind = ? AND at > ?', [userId, kind, since]);
    },
    async prune({ eventsBefore, viewsBefore }) {
      await run('DELETE FROM events WHERE at < ?', [eventsBefore]);
      if (viewsBefore) await run('DELETE FROM views WHERE at < ?', [viewsBefore]);
    },

    // ---------- Stats ----------
    async stats() {
      const t = now();
      return {
        users: await count('SELECT COUNT(*) AS n FROM users'),
        profiles: await count('SELECT COUNT(*) AS n FROM users WHERE complete = 1'),
        minors: await count('SELECT COUNT(*) AS n FROM users WHERE complete = 1 AND age < 18'),
        adults: await count('SELECT COUNT(*) AS n FROM users WHERE complete = 1 AND age >= 18'),
        paused: await count('SELECT COUNT(*) AS n FROM users WHERE paused = 1'),
        active24h: await count('SELECT COUNT(*) AS n FROM users WHERE last_active > ?', [t - 86400000]),
        likes: await count('SELECT COUNT(*) AS n FROM likes'),
        matches: await count('SELECT COUNT(*) AS n FROM matches'),
        reports: await count('SELECT COUNT(*) AS n FROM reports'),
        bans: await count('SELECT COUNT(*) AS n FROM bans'),
      };
    },
  };
  return store;
}

// Admin-Bereich: Übersicht (Nutzer, Nutzung, beliebte Modelle, Fehler) und Rechte
// (Nutzer sperren, Bestenliste zurücksetzen). Nur für Konten aus ADMIN_EMAILS.
import { Router } from 'express';
import { get, run, all, getSetting, setSetting, logEvent } from './db.js';
import { t } from './i18n.js';
import { currentUser, HttpError, wrap, errorHandler } from './auth.js';
import { isAdmin, ADMIN_EMAILS } from './config.js';
import { describeModel, listModels, demoMode } from './models.js';
import { clearBoards } from './chat.js';

export const admin = Router();

admin.use(wrap(async (req, res, next) => {
  req.user = await currentUser(req);
  // Für alle anderen sieht es so aus, als gäbe es den Bereich nicht
  if (!isAdmin(req.user)) throw new HttpError(404, t('Nicht gefunden.', 'Not found.'));
  next();
}));

const DAY = 24 * 3600 * 1000;
const n = (row, key = 'n') => Number(row?.[key] ?? 0);

admin.get('/overview', wrap(async (req, res) => {
  const now = Date.now();
  const [users, verified, blocked, new7, active1, active7, chats, msgs24, votes, errors24, fallbacks24] = await Promise.all([
    get('SELECT COUNT(*) n FROM users'),
    get('SELECT COUNT(*) n FROM users WHERE verified = 1'),
    get('SELECT COUNT(*) n FROM users WHERE blocked = 1'),
    get('SELECT COUNT(*) n FROM users WHERE created_at > ?', now - 7 * DAY),
    get('SELECT COUNT(DISTINCT user_id) n FROM chats WHERE user_id > 0 AND COALESCE(updated_at, created_at) > ?', now - DAY),
    get('SELECT COUNT(DISTINCT user_id) n FROM chats WHERE user_id > 0 AND COALESCE(updated_at, created_at) > ?', now - 7 * DAY),
    get('SELECT COUNT(*) n FROM chats'),
    get('SELECT COUNT(*) n FROM messages WHERE side = -1 AND created_at > ?', now - DAY),
    get('SELECT COUNT(*) n FROM chats WHERE winner IS NOT NULL'),
    get("SELECT COUNT(*) n FROM events WHERE kind = 'error' AND created_at > ?", now - DAY),
    get("SELECT COUNT(*) n FROM events WHERE kind = 'fallback' AND created_at > ?", now - DAY),
  ]);

  // Fragen pro Tag (letzte 14 Tage)
  const since = new Date(now - 13 * DAY); since.setHours(0, 0, 0, 0);
  const perDayRows = await all('SELECT created_at FROM messages WHERE side = -1 AND created_at >= ?', since.getTime());
  const perDay = Array.from({ length: 14 }, (_, i) => ({ day: new Date(since.getTime() + i * DAY).toISOString().slice(0, 10), n: 0 }));
  for (const r of perDayRows) {
    const i = Math.floor((Number(r.created_at) - since.getTime()) / DAY);
    if (perDay[i]) perDay[i].n++;
  }

  // Beliebte Modelle: Antworten der letzten 30 Tage
  const used = await all(`SELECT CASE WHEN m.side = 1 THEN c.model_b ELSE c.model_a END AS model, COUNT(*) n
    FROM messages m JOIN chats c ON c.id = m.chat_id
    WHERE m.side >= 0 AND m.created_at > ? GROUP BY model ORDER BY n DESC LIMIT 12`, now - 30 * DAY);
  const models = await Promise.all(used.filter((r) => r.model).map(async (r) => ({ id: r.model, ...(await describeModel(r.model)), n: n(r) })));
  const modes = await all('SELECT mode, COUNT(*) n FROM chats WHERE created_at > ? GROUP BY mode ORDER BY n DESC', now - 30 * DAY);

  const events = await all("SELECT kind, model, detail, created_at FROM events WHERE kind IN ('error', 'fallback', 'admin') ORDER BY id DESC LIMIT 60");
  const busy = (await listModels()).filter((m) => m.busy).map((m) => m.name);
  const resetAt = Number(await getSetting('board_reset_at', 0)) || null;

  res.json({
    demo: demoMode,
    admins: ADMIN_EMAILS,
    counts: {
      users: n(users), verified: n(verified), blocked: n(blocked), new7: n(new7), active1: n(active1), active7: n(active7),
      chats: n(chats), questions24: n(msgs24), votes: n(votes), errors24: n(errors24), fallbacks24: n(fallbacks24),
    },
    perDay,
    models,
    modes: modes.map((m) => ({ mode: m.mode, n: n(m) })),
    events: events.map((e) => ({ kind: e.kind, model: e.model, detail: e.detail, at: Number(e.created_at) })),
    busy,
    boardResetAt: resetAt,
  });
}));

admin.get('/users', wrap(async (req, res) => {
  const q = String(req.query.q ?? '').trim().toLowerCase().slice(0, 100);
  const rows = await all(`SELECT u.id, u.email, u.verified, u.blocked, u.created_at,
      (SELECT COUNT(*) FROM chats c WHERE c.user_id = u.id) AS chats,
      (SELECT MAX(COALESCE(c.updated_at, c.created_at)) FROM chats c WHERE c.user_id = u.id) AS last_active
    FROM users u ${q ? 'WHERE u.email LIKE ?' : ''} ORDER BY u.created_at DESC LIMIT 100`, ...(q ? [`%${q.replace(/[%_]/g, '')}%`] : []));
  res.json({
    users: rows.map((u) => ({
      id: Number(u.id), email: u.email, verified: !!u.verified, blocked: !!u.blocked, admin: ADMIN_EMAILS.includes(u.email),
      created: Number(u.created_at), chats: Number(u.chats), lastActive: u.last_active ? Number(u.last_active) : null,
    })),
  });
}));

admin.post('/block', wrap(async (req, res) => {
  const id = Number(req.body?.userId);
  const blocked = !!req.body?.blocked;
  const user = Number.isInteger(id) ? await get('SELECT id, email FROM users WHERE id = ?', id) : null;
  if (!user) throw new HttpError(404, t('Nutzer nicht gefunden.', 'User not found.'));
  if (ADMIN_EMAILS.includes(user.email)) throw new HttpError(400, t('Admin-Konten können nicht gesperrt werden.', 'Admin accounts cannot be blocked.'));
  await run('UPDATE users SET blocked = ? WHERE id = ?', blocked ? 1 : null, user.id);
  if (blocked) await run('DELETE FROM sessions WHERE user_id = ?', user.id); // sofort abmelden
  await logEvent('admin', null, `${blocked ? 'Gesperrt' : 'Entsperrt'}: ${user.email}`);
  res.json({ ok: true, blocked });
}));

admin.post('/reset-board', wrap(async (req, res) => {
  const undo = !!req.body?.undo;
  // Nichts wird gelöscht: Die Bestenliste zählt einfach nur Stimmen ab jetzt (rückgängig machbar)
  await setSetting('board_reset_at', undo ? 0 : Date.now());
  clearBoards();
  await logEvent('admin', null, undo ? 'Bestenliste wiederhergestellt' : 'Bestenliste zurückgesetzt');
  res.json({ ok: true, boardResetAt: undo ? null : Date.now() });
}));

admin.use(errorHandler);

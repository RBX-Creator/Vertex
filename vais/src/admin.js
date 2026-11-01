// Admin-Bereich: Übersicht (Nutzer, Nutzung, beliebte Modelle, Fehler) und Rechte
// (Nutzer sperren, Bestenliste zurücksetzen). Nur für Konten aus ADMIN_EMAILS.
import { Router } from 'express';
import { get, run, all, getSetting, setSetting, logEvent } from './db.js';
import { t } from './i18n.js';
import { currentUser, HttpError, wrap, errorHandler } from './auth.js';
import { isAdmin, isStaff, ADMIN_EMAILS } from './config.js';
import { notifyUser } from './push.js';
import { describeModel, listModels, demoMode, keyStatus, addKey, removeKey } from './models.js';
import { limitSettings, saveLimitSettings, LIMIT_FIELDS, usageMap, resetUsage } from './limits.js';
import { clearBoards } from './chat.js';
import { listAllSites, removeSite } from './sites.js';
import { safetyOn, setSafety } from './safety.js';
import { alarmsOn, setAlarms, alarm } from './alarm.js';

export const admin = Router();

admin.use(wrap(async (req, res, next) => {
  req.user = await currentUser(req);
  // Für alle anderen sieht es so aus, als gäbe es den Bereich nicht
  if (!isStaff(req.user)) throw new HttpError(404, t('Nicht gefunden.', 'Not found.'));
  req.isAdmin = isAdmin(req.user);
  next();
}));

// Nur für Admins (Moderatoren dürfen das nicht)
const adminOnly = (req, res, next) => (req.isAdmin ? next() : next(new HttpError(403, t('Das dürfen nur Admins.', 'Only admins can do that.'))));

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
  const blocked24 = await get("SELECT COUNT(*) n FROM events WHERE kind = 'blocked' AND created_at > ?", now - DAY);

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

  const events = await all("SELECT kind, model, detail, created_at FROM events WHERE kind IN ('error', 'fallback', 'admin', 'blocked', 'alarm') ORDER BY id DESC LIMIT 60");
  const busy = (await listModels()).filter((m) => m.busy).map((m) => m.name);
  const resetAt = Number(await getSetting('board_reset_at', 0)) || null;

  res.json({
    demo: demoMode,
    admins: ADMIN_EMAILS,
    counts: {
      users: n(users), verified: n(verified), blocked: n(blocked), new7: n(new7), active1: n(active1), active7: n(active7),
      chats: n(chats), questions24: n(msgs24), votes: n(votes), errors24: n(errors24), fallbacks24: n(fallbacks24), blocked24: n(blocked24),
    },
    perDay,
    models,
    modes: modes.map((m) => ({ mode: m.mode, n: n(m) })),
    events: events.map((e) => ({ kind: e.kind, model: e.model, detail: e.detail, at: Number(e.created_at) })),
    busy,
    boardResetAt: resetAt,
    role: req.isAdmin ? 'admin' : 'mod',
    safety: await safetyOn(),
    alarms: await alarmsOn(),
  });
}));

admin.get('/users', wrap(async (req, res) => {
  const q = String(req.query.q ?? '').trim().toLowerCase().slice(0, 100);
  const [L, used] = await Promise.all([limitSettings(), usageMap()]);
  const rows = await all(`SELECT u.id, u.email, u.verified, u.blocked, u.created_at, u.daily_limit, u.role,
      (SELECT COUNT(*) FROM chats c WHERE c.user_id = u.id) AS chats,
      (SELECT MAX(COALESCE(c.updated_at, c.created_at)) FROM chats c WHERE c.user_id = u.id) AS last_active
    FROM users u ${q ? 'WHERE u.email LIKE ?' : ''} ORDER BY u.created_at DESC LIMIT 100`, ...(q ? [`%${q.replace(/[%_]/g, '')}%`] : []));
  res.json({
    users: rows.map((u) => ({
      id: Number(u.id), email: u.email, verified: !!u.verified, blocked: !!u.blocked, admin: ADMIN_EMAILS.includes(u.email), mod: u.role === 'mod' && !ADMIN_EMAILS.includes(u.email),
      created: Number(u.created_at), chats: Number(u.chats), lastActive: u.last_active ? Number(u.last_active) : null,
      ...(() => {
        const own = u.daily_limit === null || u.daily_limit === undefined ? null : Number(u.daily_limit);
        const unlimited = ADMIN_EMAILS.includes(u.email) || own === -1;
        const max = unlimited ? null : own ?? L.daily;
        const points = used.get(Number(u.id)) ?? 0;
        return { custom: own, limit: max, used: points, percent: max ? Math.min(100, Math.round((points / max) * 100)) : 0 };
      })(),
    })),
  });
}));

admin.post('/block', wrap(async (req, res) => {
  const id = Number(req.body?.userId);
  const blocked = !!req.body?.blocked;
  const user = Number.isInteger(id) ? await get('SELECT id, email, role FROM users WHERE id = ?', id) : null;
  if (!user) throw new HttpError(404, t('Nutzer nicht gefunden.', 'User not found.'));
  if (ADMIN_EMAILS.includes(user.email)) throw new HttpError(400, t('Admin-Konten können nicht gesperrt werden.', 'Admin accounts cannot be blocked.'));
  if (user.role === 'mod' && !req.isAdmin) throw new HttpError(403, t('Moderatoren können keine anderen Moderatoren sperren.', 'Moderators cannot block other moderators.'));
  await run('UPDATE users SET blocked = ? WHERE id = ?', blocked ? 1 : null, user.id);
  if (blocked) await run('DELETE FROM sessions WHERE user_id = ?', user.id); // sofort abmelden
  await logEvent('admin', null, `${blocked ? 'Gesperrt' : 'Entsperrt'}: ${user.email}${req.isAdmin ? '' : ` (von Mod ${req.user.email})`}`);
  res.json({ ok: true, blocked });
}));

admin.post('/reset-board', adminOnly, wrap(async (req, res) => {
  const undo = !!req.body?.undo;
  // Nichts wird gelöscht: Die Bestenliste zählt einfach nur Stimmen ab jetzt (rückgängig machbar)
  await setSetting('board_reset_at', undo ? 0 : Date.now());
  clearBoards();
  await logEvent('admin', null, undo ? 'Bestenliste wiederhergestellt' : 'Bestenliste zurückgesetzt');
  res.json({ ok: true, boardResetAt: undo ? null : Date.now() });
}));

// ── Limits & Kosten ──────────────────────────────────────────────
admin.get('/limits', wrap(async (req, res) => {
  res.json({ limits: await limitSettings(), fields: LIMIT_FIELDS });
}));
admin.post('/limits', adminOnly, wrap(async (req, res) => {
  const limits = await saveLimitSettings(req.body?.limits ?? {});
  await logEvent('admin', null, 'Limits geändert');
  res.json({ ok: true, limits });
}));

// Eigenes Limit für einen Nutzer: Zahl = Punkte pro Tag, -1 = unbegrenzt, null = Standard
admin.post('/user-limit', adminOnly, wrap(async (req, res) => {
  const id = Number(req.body?.userId);
  const raw = req.body?.limit;
  const user = Number.isInteger(id) ? await get('SELECT id, email FROM users WHERE id = ?', id) : null;
  if (!user) throw new HttpError(404, t('Nutzer nicht gefunden.', 'User not found.'));
  let value = null;
  if (raw !== null && raw !== undefined && raw !== '') {
    value = Math.round(Number(raw));
    if (!Number.isFinite(value) || value < -1 || value > 100000) throw new HttpError(400, t('Bitte eine Zahl von 0 bis 100000 eingeben (oder -1 für unbegrenzt).', 'Enter a number from 0 to 100000 (or -1 for unlimited).'));
  }
  await run('UPDATE users SET daily_limit = ? WHERE id = ?', value, user.id);
  await logEvent('admin', null, `Limit für ${user.email}: ${value === null ? 'Standard' : value === -1 ? 'unbegrenzt' : value}`);
  res.json({ ok: true });
}));
admin.post('/reset-usage', wrap(async (req, res) => {
  const id = Number(req.body?.userId);
  const user = Number.isInteger(id) ? await get('SELECT id, email FROM users WHERE id = ?', id) : null;
  if (!user) throw new HttpError(404, t('Nutzer nicht gefunden.', 'User not found.'));
  await resetUsage(user.id);
  await logEvent('admin', null, `Verbrauch zurückgesetzt: ${user.email}`);
  res.json({ ok: true });
}));

// ── API-Schlüssel (werden nie im Klartext zurückgegeben) ──────────
admin.get('/keys', adminOnly, wrap(async (req, res) => {
  res.json({ providers: keyStatus() });
}));
admin.post('/keys', adminOnly, wrap(async (req, res) => {
  const provider = String(req.body?.provider ?? '');
  let id;
  try { id = await addKey(provider, req.body?.key); } catch (err) { throw new HttpError(400, err.message); }
  await logEvent('admin', null, `Schlüssel hinzugefügt: ${provider} ${id}`);
  res.json({ ok: true, id, providers: keyStatus() });
}));
admin.post('/keys/remove', adminOnly, wrap(async (req, res) => {
  const provider = String(req.body?.provider ?? '');
  const id = String(req.body?.id ?? '');
  try { await removeKey(provider, id); } catch (err) { throw new HttpError(400, err.message); }
  await logEvent('admin', null, `Schlüssel entfernt: ${provider} ${id}`);
  res.json({ ok: true, providers: keyStatus() });
}));

admin.get('/sites', wrap(async (req, res) => {
  res.json({ sites: (await listAllSites()).map((s) => ({ id: s.id, title: s.title, views: Number(s.views), created: Number(s.created_at), email: s.email })) });
}));
admin.post('/sites/remove', wrap(async (req, res) => {
  const id = String(req.body?.id ?? '');
  await removeSite(id);
  await logEvent('admin', null, `Webseite entfernt: /w/${id}`);
  res.json({ ok: true });
}));

admin.post('/alarms', adminOnly, wrap(async (req, res) => {
  await setAlarms(!!req.body?.on);
  res.json({ ok: true, on: !!req.body?.on });
}));
admin.post('/alarms/test', adminOnly, wrap(async (req, res) => {
  await alarm(`test-${Date.now()}`, 'Test-Alarm', 'So sieht eine Warnung aus, wenn bei VAIs etwas schiefläuft.');
  res.json({ ok: true });
}));

admin.post('/safety', adminOnly, wrap(async (req, res) => {
  await setSafety(!!req.body?.on);
  await logEvent('admin', null, `Jugendschutz ${req.body?.on ? 'an' : 'aus'}`);
  res.json({ ok: true, on: !!req.body?.on });
}));

// Bewertungen pro Modell (letzte 30 Tage): 👍, 👎 und die Gründe
admin.get('/feedback', wrap(async (req, res) => {
  const rows = await all(`SELECT CASE WHEN m.side = 1 THEN c.model_b ELSE c.model_a END AS model, m.feedback, m.feedback_reason
    FROM messages m JOIN chats c ON c.id = m.chat_id
    WHERE m.side >= 0 AND m.feedback IS NOT NULL AND m.created_at > ?`, Date.now() - 30 * DAY);
  const per = new Map();
  for (const r of rows) {
    if (!r.model) continue;
    const e = per.get(r.model) ?? { model: r.model, up: 0, down: 0, reasons: {} };
    if (Number(r.feedback) === 1) e.up++;
    else if (Number(r.feedback) === -1) {
      e.down++;
      for (const reason of String(r.feedback_reason ?? '').split(',').filter(Boolean)) e.reasons[reason] = (e.reasons[reason] ?? 0) + 1;
    }
    per.set(r.model, e);
  }
  const list = await Promise.all([...per.values()].sort((a, b) => (b.up + b.down) - (a.up + a.down)).slice(0, 30)
    .map(async (e) => ({ ...e, ...(await describeModel(e.model)) })));
  res.json({ models: list });
}));

// ── Rollen: Admins machen Nutzer zu Moderatoren (und wieder zurück) ──
admin.post('/role', adminOnly, wrap(async (req, res) => {
  const id = Number(req.body?.userId);
  const role = req.body?.role === 'mod' ? 'mod' : null;
  const user = Number.isInteger(id) ? await get('SELECT id, email FROM users WHERE id = ?', id) : null;
  if (!user) throw new HttpError(404, t('Nutzer nicht gefunden.', 'User not found.'));
  if (ADMIN_EMAILS.includes(user.email)) throw new HttpError(400, t('Admins haben schon alle Rechte.', 'Admins already have all rights.'));
  await run('UPDATE users SET role = ? WHERE id = ?', role, user.id);
  await logEvent('admin', null, `${role ? 'Zum Mod gemacht' : 'Mod entzogen'}: ${user.email}`);
  if (role) notifyUser(user.id, { title: '🛡️ Du bist jetzt Moderator', body: 'Du findest den Moderations-Bereich im Menü unter deinem Avatar.', tag: 'role', url: '/admin' }).catch(() => {});
  res.json({ ok: true, role });
}));

// ── Mitteilungen an alle oder bestimmte Nutzer (Benachrichtigung + Hinweis in der App) ──
admin.post('/announce', adminOnly, wrap(async (req, res) => {
  const title = String(req.body?.title ?? '').trim().slice(0, 80);
  const body = String(req.body?.body ?? '').trim().slice(0, 1000);
  const toAll = req.body?.target !== 'users';
  const ids = toAll ? [] : [...new Set((Array.isArray(req.body?.userIds) ? req.body.userIds : []).map(Number).filter(Number.isInteger))].slice(0, 500);
  if (!title || !body) throw new HttpError(400, t('Bitte Titel und Text ausfüllen.', 'Please fill in title and text.'));
  if (!toAll && !ids.length) throw new HttpError(400, t('Bitte wähle mindestens eine Person aus.', 'Please choose at least one person.'));
  await run('INSERT INTO announcements (title, body, target, created_at) VALUES (?, ?, ?, ?)', title, body, toAll ? 'all' : JSON.stringify(ids), Date.now());
  const recipients = toAll
    ? (await all('SELECT DISTINCT user_id FROM push_subs')).map((r) => Number(r.user_id))
    : ids;
  let pushed = 0;
  for (const uid of recipients) pushed += await notifyUser(uid, { title: `📢 ${title}`, body, tag: `ann-${Date.now()}`, url: '/' }).catch(() => 0);
  const reach = toAll ? Number((await get('SELECT COUNT(*) n FROM users WHERE blocked IS NULL OR blocked = 0'))?.n ?? 0) : ids.length;
  await logEvent('admin', null, `Mitteilung „${title}“ an ${toAll ? 'alle' : `${ids.length} Personen`} (${pushed} Benachrichtigungen)`);
  res.json({ ok: true, reach, pushed });
}));
admin.get('/announcements', wrap(async (req, res) => {
  const rows = await all(`SELECT a.id, a.title, a.body, a.target, a.created_at, (SELECT COUNT(*) FROM announcement_reads r WHERE r.ann_id = a.id) AS reads
    FROM announcements a ORDER BY a.id DESC LIMIT 10`);
  res.json({ announcements: rows.map((a) => ({ id: Number(a.id), title: a.title, body: a.body, all: a.target === 'all', count: a.target === 'all' ? null : JSON.parse(a.target).length, created: Number(a.created_at), reads: Number(a.reads) })) });
}));

admin.use(errorHandler);

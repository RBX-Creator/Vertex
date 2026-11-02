// Meldungen: Jeder (auch ohne Konto) kann veröffentlichte Webseiten und geteilte Chats melden.
// Admins und Mods arbeiten die Meldungen im Admin-Bereich der Reihe nach ab (älteste zuerst).
import { Router } from 'express';
import { get, run, all, logEvent } from './db.js';
import { t } from './i18n.js';
import { HttpError, wrap, errorHandler, currentUser } from './auth.js';
import { ADMIN_EMAILS } from './config.js';

await run(`CREATE TABLE IF NOT EXISTS reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL,          -- 'site' (veröffentlichte Webseite) | 'share' (geteilter Chat)
  target TEXT NOT NULL,        -- Webseiten- bzw. Teilen-ID
  reason TEXT NOT NULL,
  note TEXT,
  reporter_id INTEGER,
  status TEXT NOT NULL DEFAULT 'open', -- open | done | dismissed
  action TEXT,
  handled_by TEXT,
  created_at INTEGER NOT NULL,
  handled_at INTEGER
)`);
await run('CREATE INDEX IF NOT EXISTS reports_status ON reports (status, created_at)');

export const REASONS = {
  violence: () => t('Gewalt oder Drohungen', 'Violence or threats'),
  hate: () => t('Hass oder Mobbing', 'Hate or bullying'),
  sexual: () => t('Sexuelle Inhalte', 'Sexual content'),
  scam: () => t('Betrug oder Phishing', 'Scam or phishing'),
  private: () => t('Persönliche Daten von anderen', 'Other people’s personal data'),
  illegal: () => t('Illegal / gefährlich', 'Illegal / dangerous'),
  other: () => t('Etwas anderes', 'Something else'),
};

// Wem gehört der gemeldete Inhalt, wie heißt er?
export async function describeTarget(kind, target) {
  if (kind === 'site') {
    const s = await get('SELECT s.id, s.title, s.user_id, u.email FROM sites s LEFT JOIN users u ON u.id = s.user_id WHERE s.id = ?', target);
    return s ? { exists: true, title: s.title || t('Webseite', 'Website'), url: `/w/${s.id}`, ownerId: Number(s.user_id), owner: s.email } : { exists: false, url: `/w/${target}` };
  }
  const c = await get('SELECT c.id, c.title, c.user_id, u.email FROM chats c LEFT JOIN users u ON u.id = c.user_id WHERE c.share_id = ?', target);
  return c ? { exists: true, title: c.title || t('Geteilter Chat', 'Shared chat'), url: `/s/${target}`, ownerId: Number(c.user_id), owner: c.email, chatId: c.id } : { exists: false, url: `/s/${target}` };
}

// Admins + Mods per Push benachrichtigen (höchstens alle 10 Minuten)
let lastNotice = 0;
async function notifyStaff(kind, title) {
  if (Date.now() - lastNotice < 10 * 60 * 1000) return;
  lastNotice = Date.now();
  const { notifyUser } = await import('./push.js');
  const staff = await all(`SELECT id FROM users WHERE role = 'mod' OR lower(email) IN (${ADMIN_EMAILS.map(() => '?').join(',') || "''"})`, ...ADMIN_EMAILS);
  const open = Number((await get("SELECT COUNT(*) n FROM reports WHERE status = 'open'"))?.n ?? 0);
  for (const s of staff) {
    notifyUser(Number(s.id), {
      title: t('🚩 Neue Meldung', '🚩 New report'),
      body: t(`${kind === 'site' ? 'Webseite' : 'Geteilter Chat'} „${title}“ wurde gemeldet. ${open} offen.`, `${kind === 'site' ? 'Website' : 'Shared chat'} “${title}” was reported. ${open} open.`),
      url: '/admin#meldungen',
      tag: 'report',
    }).catch(() => {});
  }
}

// Einfaches Limit pro IP gegen Spam-Meldungen
const hits = new Map();
function tooMany(ip) {
  const now = Date.now();
  const list = (hits.get(ip) ?? []).filter((ts) => now - ts < 60 * 60 * 1000);
  list.push(now);
  hits.set(ip, list);
  return list.length > 8;
}
setInterval(() => { const now = Date.now(); for (const [k, l] of hits) if (l.every((ts) => now - ts > 3600_000)) hits.delete(k); }, 15 * 60 * 1000).unref();

export const reports = Router();
reports.get('/reasons', (req, res) => res.json({ reasons: Object.entries(REASONS).map(([id, label]) => ({ id, label: label() })) }));
reports.get('/target', wrap(async (req, res) => {
  const kind = req.query.kind === 'share' ? 'share' : 'site';
  const target = String(req.query.id ?? '');
  if (!/^[\w-]{6,32}$/.test(target)) throw new HttpError(400, t('Ungültiger Link.', 'Invalid link.'));
  const d = await describeTarget(kind, target);
  if (!d.exists) throw new HttpError(404, t('Das gibt es nicht (mehr).', 'This does not exist (anymore).'));
  res.json({ kind, title: d.title, url: d.url });
}));
reports.post('/', wrap(async (req, res) => {
  const kind = req.body?.kind === 'share' ? 'share' : req.body?.kind === 'site' ? 'site' : null;
  const target = String(req.body?.target ?? '');
  const reason = String(req.body?.reason ?? '');
  const note = String(req.body?.note ?? '').trim().slice(0, 1000);
  if (!kind || !/^[\w-]{6,32}$/.test(target) || !REASONS[reason]) throw new HttpError(400, t('Bitte wähle einen Grund.', 'Please choose a reason.'));
  if (tooMany(req.ip)) throw new HttpError(429, t('Du hast schon viele Meldungen geschickt. Bitte später nochmal.', 'You already sent many reports. Please try later.'));
  const d = await describeTarget(kind, target);
  if (!d.exists) throw new HttpError(404, t('Das gibt es nicht (mehr).', 'This does not exist (anymore).'));
  const me = await currentUser(req).catch(() => null);
  // Doppelte offene Meldung mit gleichem Grund nur einmal
  const dup = await get("SELECT id FROM reports WHERE kind = ? AND target = ? AND reason = ? AND status = 'open'", kind, target, reason);
  if (!dup) {
    await run('INSERT INTO reports (kind, target, reason, note, reporter_id, created_at) VALUES (?, ?, ?, ?, ?, ?)', kind, target, reason, note || null, me?.id ?? null, Date.now());
    notifyStaff(kind, d.title).catch(() => {});
  } else if (note) {
    await run("UPDATE reports SET note = COALESCE(note || ' · ', '') || ? WHERE id = ?", note, dup.id);
  }
  res.json({ ok: true });
}));
reports.use(errorHandler);

// ── Für den Admin-Bereich ────────────────────────────────────────────
export async function listReports(status = 'open') {
  const rows = await all(`SELECT r.*, u.email AS reporter FROM reports r LEFT JOIN users u ON u.id = r.reporter_id
    WHERE r.status ${status === 'open' ? "= 'open'" : "!= 'open'"} ORDER BY r.created_at ${status === 'open' ? 'ASC' : 'DESC'} LIMIT 100`);
  return Promise.all(rows.map(async (r) => {
    const d = await describeTarget(r.kind, r.target);
    const same = Number((await get("SELECT COUNT(*) n FROM reports WHERE kind = ? AND target = ? AND status = 'open'", r.kind, r.target))?.n ?? 0);
    return {
      id: Number(r.id), kind: r.kind, target: r.target, reason: r.reason, reasonLabel: REASONS[r.reason]?.() ?? r.reason, note: r.note,
      reporter: r.reporter ?? null, created: Number(r.created_at), status: r.status, action: r.action, handledBy: r.handled_by, handled: r.handled_at ? Number(r.handled_at) : null,
      exists: d.exists, title: d.title ?? null, url: d.url, owner: d.owner ?? null, ownerId: d.ownerId ?? null, sameOpen: same,
    };
  }));
}
export const openReportCount = async () => Number((await get("SELECT COUNT(*) n FROM reports WHERE status = 'open'"))?.n ?? 0);

// Aktion: remove (Inhalt entfernen), block (Besitzer sperren + entfernen), dismiss (unbegründet), done (erledigt)
export async function actOnReport(id, action, staff) {
  const r = await get('SELECT * FROM reports WHERE id = ?', id);
  if (!r) throw new HttpError(404, t('Meldung nicht gefunden.', 'Report not found.'));
  const d = await describeTarget(r.kind, r.target);
  if (action === 'remove' || action === 'block') {
    if (d.exists) {
      if (r.kind === 'site') await run('DELETE FROM sites WHERE id = ?', r.target);
      else await run('UPDATE chats SET share_id = NULL WHERE share_id = ?', r.target);
    }
    if (action === 'block' && d.ownerId) {
      const owner = await get('SELECT email, role FROM users WHERE id = ?', d.ownerId);
      if (owner && (ADMIN_EMAILS.includes(String(owner.email).toLowerCase()) || owner.role === 'mod')) throw new HttpError(403, t('Admins und Mods kann man hier nicht sperren.', 'Admins and mods cannot be blocked here.'));
      await run('UPDATE users SET blocked = 1 WHERE id = ?', d.ownerId);
      await run('DELETE FROM sessions WHERE user_id = ?', d.ownerId);
    }
  } else if (!['dismiss', 'done'].includes(action)) throw new HttpError(400, t('Unbekannte Aktion.', 'Unknown action.'));
  // Alle offenen Meldungen zum selben Inhalt gleich mit erledigen
  const status = action === 'dismiss' ? 'dismissed' : 'done';
  await run("UPDATE reports SET status = ?, action = ?, handled_by = ?, handled_at = ? WHERE kind = ? AND target = ? AND status = 'open'", status, action, staff.email, Date.now(), r.kind, r.target);
  const what = { remove: 'entfernt', block: 'entfernt + Besitzer gesperrt', dismiss: 'abgelehnt', done: 'erledigt' }[action];
  await logEvent('admin', null, `Meldung ${what}: ${r.kind === 'site' ? 'Webseite' : 'Chat'} „${d.title ?? r.target}“${d.owner ? ` (${d.owner})` : ''} – von ${staff.email}`);
  return { ok: true };
}

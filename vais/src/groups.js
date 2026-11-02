// Team-Chat: Gruppen nur für Admins und Moderatoren. Alle schreiben zusammen;
// mit „@KI“ (oder @AI / @VAIs) antwortet die KI in der Gruppe.
import { Router } from 'express';
import { randomBytes } from 'node:crypto';
import { get, run, all } from './db.js';
import { t } from './i18n.js';
import { currentUser, HttpError, wrap, errorHandler } from './auth.js';
import { isAdmin, isStaff, ADMIN_EMAILS } from './config.js';
import { listModels, complete, demoMode, helperModel } from './models.js';
import { notifyUser } from './push.js';
import { checkText } from './safety.js';
import { charge, refund } from './limits.js';

await run(`CREATE TABLE IF NOT EXISTS groups (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  owner_id INTEGER NOT NULL,
  created_at INTEGER NOT NULL
)`);
await run(`CREATE TABLE IF NOT EXISTS group_members (
  group_id TEXT NOT NULL,
  user_id INTEGER NOT NULL,
  last_read INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (group_id, user_id)
)`);
await run(`CREATE TABLE IF NOT EXISTS group_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  group_id TEXT NOT NULL,
  user_id INTEGER,
  content TEXT NOT NULL,
  created_at INTEGER NOT NULL
)`);
await run('CREATE INDEX IF NOT EXISTS group_messages_group ON group_messages (group_id, id)');

const MENTION = /(^|\s)@(ki|ai|vais|agent)\b/i;
const AI_PREFERENCE = [/^groq:openai\/gpt-oss-120b$/, /^groq:moonshotai\/kimi-k2/, /^groq:.*llama-3\.3-70b/, /^groq:qwen\//, /^groq:openai\/gpt-oss-20b$/, /^gemini:/, /^openrouter:.*:free$/];
const thinking = new Map(); // Gruppe → seit wann die KI antwortet
const lastPush = new Map(); // 'gruppe:nutzer' → Zeit (nicht zu oft benachrichtigen)
const nameOf = (email) => String(email ?? '').split('@')[0];

export const groups = Router();

groups.use(wrap(async (req, res, next) => {
  req.user = await currentUser(req);
  if (!req.user) throw new HttpError(401, t('Bitte melde dich erneut an.', 'Please sign in again.'));
  if (!isStaff(req.user)) throw new HttpError(404, t('Nicht gefunden.', 'Not found.'));
  next();
}));

async function memberOf(groupId, userId) {
  return get('SELECT g.id, g.name, g.owner_id FROM groups g JOIN group_members m ON m.group_id = g.id WHERE g.id = ? AND m.user_id = ?', String(groupId ?? ''), userId);
}
async function staffUsers() {
  const rows = await all("SELECT id, email, role FROM users WHERE (role = 'mod' OR lower(email) IN (" + ADMIN_EMAILS.map(() => '?').join(',') + ")) AND (blocked IS NULL OR blocked = 0)", ...ADMIN_EMAILS);
  return rows.map((u) => ({ id: Number(u.id), email: u.email, name: nameOf(u.email), admin: ADMIN_EMAILS.includes(u.email) }));
}

// Meine Gruppen mit ungelesenen Nachrichten
groups.get('/', wrap(async (req, res) => {
  const rows = await all(`SELECT g.id, g.name, g.owner_id, m.last_read,
      (SELECT COUNT(*) FROM group_messages x WHERE x.group_id = g.id AND x.id > m.last_read AND (x.user_id IS NULL OR x.user_id != ?)) AS unread,
      (SELECT content FROM group_messages x WHERE x.group_id = g.id ORDER BY x.id DESC LIMIT 1) AS last,
      (SELECT created_at FROM group_messages x WHERE x.group_id = g.id ORDER BY x.id DESC LIMIT 1) AS last_at,
      (SELECT COUNT(*) FROM group_members y WHERE y.group_id = g.id) AS members
    FROM groups g JOIN group_members m ON m.group_id = g.id WHERE m.user_id = ? ORDER BY COALESCE(last_at, g.created_at) DESC`, req.user.id, req.user.id);
  res.json({ groups: rows.map((g) => ({ id: g.id, name: g.name, owner: Number(g.owner_id) === Number(req.user.id), unread: Number(g.unread), last: g.last ? String(g.last).slice(0, 80) : '', lastAt: g.last_at ? Number(g.last_at) : null, members: Number(g.members) })) });
}));

// Wer kann eingeladen werden? (alle Admins und Mods)
groups.get('/staff', wrap(async (req, res) => {
  res.json({ staff: (await staffUsers()).filter((u) => u.id !== Number(req.user.id)) });
}));

groups.post('/', wrap(async (req, res) => {
  const name = String(req.body?.name ?? '').replace(/\s+/g, ' ').trim().slice(0, 50);
  if (!name) throw new HttpError(400, t('Bitte gib der Gruppe einen Namen.', 'Please give the group a name.'));
  const staff = await staffUsers();
  const ids = [...new Set((req.body?.memberIds ?? []).map(Number))].filter((id) => staff.some((s) => s.id === id));
  const id = randomBytes(9).toString('base64url');
  await run('INSERT INTO groups (id, name, owner_id, created_at) VALUES (?, ?, ?, ?)', id, name, req.user.id, Date.now());
  for (const uid of [Number(req.user.id), ...ids]) await run('INSERT OR IGNORE INTO group_members (group_id, user_id) VALUES (?, ?)', id, uid);
  await run('INSERT INTO group_messages (group_id, user_id, content, created_at) VALUES (?, NULL, ?, ?)', id,
    t(`👋 Willkommen in „${name}“! Schreibt hier zusammen. Mit **@KI** holt ihr mich dazu.`, `👋 Welcome to “${name}”! Chat here together. Mention **@AI** to bring me in.`), Date.now());
  for (const uid of ids) notifyUser(uid, { title: `👥 ${name}`, body: t(`${nameOf(req.user.email)} hat dich zum Team-Chat hinzugefügt.`, `${nameOf(req.user.email)} added you to the team chat.`), tag: `group-${id}`, url: `/#g/${id}` }).catch(() => {});
  res.json({ ok: true, id });
}));

// Nachrichten (nur neue seit „after“) – und als gelesen markieren
groups.get('/:id/messages', wrap(async (req, res) => {
  const g = await memberOf(req.params.id, req.user.id);
  if (!g) throw new HttpError(404, t('Gruppe nicht gefunden.', 'Group not found.'));
  const after = Math.max(0, Number(req.query.after) || 0);
  const rows = await all(`SELECT x.id, x.user_id, x.content, x.created_at, u.email FROM group_messages x LEFT JOIN users u ON u.id = x.user_id
    WHERE x.group_id = ? AND x.id > ? ORDER BY x.id DESC LIMIT 200`, g.id, after);
  rows.reverse();
  if (rows.length) await run('UPDATE group_members SET last_read = ? WHERE group_id = ? AND user_id = ?', Number(rows.at(-1).id), g.id, req.user.id);
  const members = await all('SELECT u.id, u.email FROM group_members m JOIN users u ON u.id = m.user_id WHERE m.group_id = ?', g.id);
  res.json({
    group: { id: g.id, name: g.name, owner: Number(g.owner_id) === Number(req.user.id), canManage: Number(g.owner_id) === Number(req.user.id) || isAdmin(req.user) },
    members: members.map((m) => ({ id: Number(m.id), email: m.email, name: nameOf(m.email) })),
    messages: rows.map((m) => ({ id: Number(m.id), ai: m.user_id === null, mine: Number(m.user_id) === Number(req.user.id), name: m.user_id === null ? 'VAIs' : nameOf(m.email), text: m.content, at: Number(m.created_at) })),
    thinking: thinking.has(g.id),
  });
}));

groups.post('/:id/messages', wrap(async (req, res) => {
  const g = await memberOf(req.params.id, req.user.id);
  if (!g) throw new HttpError(404, t('Gruppe nicht gefunden.', 'Group not found.'));
  const text = String(req.body?.text ?? '').trim().slice(0, 4000);
  if (!text) throw new HttpError(400, t('Keine Nachricht.', 'No message.'));
  await run('INSERT INTO group_messages (group_id, user_id, content, created_at) VALUES (?, ?, ?, ?)', g.id, req.user.id, text, Date.now());
  // Andere Mitglieder benachrichtigen (höchstens alle 2 Minuten pro Gruppe)
  const others = await all('SELECT user_id FROM group_members WHERE group_id = ? AND user_id != ?', g.id, req.user.id);
  for (const o of others) {
    const key = `${g.id}:${o.user_id}`;
    if ((lastPush.get(key) ?? 0) > Date.now() - 2 * 60 * 1000) continue;
    lastPush.set(key, Date.now());
    notifyUser(Number(o.user_id), { title: `👥 ${g.name}`, body: `${nameOf(req.user.email)}: ${text.slice(0, 120)}`, tag: `group-${g.id}`, url: `/#g/${g.id}` }).catch(() => {});
  }
  if (MENTION.test(text) && !thinking.has(g.id)) answer(g, req.user, text).catch((err) => console.error('Team-Chat KI:', err.message));
  res.json({ ok: true, ai: MENTION.test(text) });
}));

// Die KI antwortet im Team-Chat (im Hintergrund; Mitglieder holen sich die Antwort beim nächsten Abfragen)
async function answer(g, user, text) {
  thinking.set(g.id, Date.now());
  let charged = null;
  try {
    const unsafe = await checkText(text, 'prompt');
    let reply;
    if (unsafe) reply = unsafe.message;
    else {
      charged = await charge(user, 'text').catch((err) => { reply = err.message; return null; });
      if (!reply) {
        const history = await all(`SELECT x.user_id, x.content, u.email FROM group_messages x LEFT JOIN users u ON u.id = x.user_id
          WHERE x.group_id = ? ORDER BY x.id DESC LIMIT 24`, g.id);
        history.reverse();
        if (demoMode) reply = t(`(Demo) Hallo ${nameOf(user.email)}! Ich habe eure ${history.length} letzten Nachrichten gelesen. Mit einem Groq-Schlüssel antworte ich hier richtig.`, `(Demo) Hi ${nameOf(user.email)}! I read your last ${history.length} messages. With a Groq key I answer properly here.`);
        else {
          const all2 = (await listModels()).filter((m) => m.caps.includes('text') && !m.paid && !m.busy);
          const model = AI_PREFERENCE.map((re) => all2.find((m) => re.test(m.id))).find(Boolean) ?? (await helperModel());
          if (!model) throw new Error(t('Gerade ist kein Modell frei.', 'No model is free right now.'));
          const msg = await complete({
            model: model.id,
            maxTokens: 2000,
            messages: [
              { role: 'system', content: `Du bist VAIs, die KI im Team-Chat „${g.name}“ des VAIs-Teams (Admins und Moderatoren der App VAIs). Mehrere Personen schreiben; jede Nachricht beginnt mit dem Namen. ${nameOf(user.email)} hat dich gerade mit @KI angesprochen. Antworte hilfreich und eher kurz, in der Sprache der Nachricht, mit Markdown. Fang nicht mit deinem Namen an.` },
              ...history.map((h) => (h.user_id === null ? { role: 'assistant', content: h.content } : { role: 'user', content: `${nameOf(h.email)}: ${h.content}` })),
            ],
          });
          reply = String(msg.content ?? '').trim() || t('Dazu fällt mir gerade nichts ein.', 'I have nothing to add right now.');
        }
      }
    }
    await run('INSERT INTO group_messages (group_id, user_id, content, created_at) VALUES (?, NULL, ?, ?)', g.id, reply.slice(0, 12000), Date.now());
  } catch (err) {
    await refund(user, charged);
    await run('INSERT INTO group_messages (group_id, user_id, content, created_at) VALUES (?, NULL, ?, ?)', g.id, `⚠️ ${err.message}`, Date.now());
  } finally {
    thinking.delete(g.id);
  }
}

// Mitglieder verwalten (Ersteller oder Admin)
groups.post('/:id/members', wrap(async (req, res) => {
  const g = await memberOf(req.params.id, req.user.id);
  if (!g) throw new HttpError(404, t('Gruppe nicht gefunden.', 'Group not found.'));
  if (Number(g.owner_id) !== Number(req.user.id) && !isAdmin(req.user)) throw new HttpError(403, t('Nur der Ersteller oder ein Admin kann Mitglieder ändern.', 'Only the creator or an admin can change members.'));
  const staff = await staffUsers();
  for (const uid of (req.body?.add ?? []).map(Number).filter((id) => staff.some((s) => s.id === id))) {
    await run('INSERT OR IGNORE INTO group_members (group_id, user_id) VALUES (?, ?)', g.id, uid);
    notifyUser(uid, { title: `👥 ${g.name}`, body: t(`${nameOf(req.user.email)} hat dich hinzugefügt.`, `${nameOf(req.user.email)} added you.`), tag: `group-${g.id}`, url: `/#g/${g.id}` }).catch(() => {});
  }
  for (const uid of (req.body?.remove ?? []).map(Number)) {
    if (uid !== Number(g.owner_id)) await run('DELETE FROM group_members WHERE group_id = ? AND user_id = ?', g.id, uid);
  }
  res.json({ ok: true });
}));

groups.post('/:id/leave', wrap(async (req, res) => {
  const g = await memberOf(req.params.id, req.user.id);
  if (!g) throw new HttpError(404, t('Gruppe nicht gefunden.', 'Group not found.'));
  await run('DELETE FROM group_members WHERE group_id = ? AND user_id = ?', g.id, req.user.id);
  const left = await get('SELECT COUNT(*) n FROM group_members WHERE group_id = ?', g.id);
  if (!Number(left?.n)) { await run('DELETE FROM group_messages WHERE group_id = ?', g.id); await run('DELETE FROM groups WHERE id = ?', g.id); }
  res.json({ ok: true });
}));

groups.delete('/:id', wrap(async (req, res) => {
  const g = await memberOf(req.params.id, req.user.id);
  if (!g) throw new HttpError(404, t('Gruppe nicht gefunden.', 'Group not found.'));
  if (Number(g.owner_id) !== Number(req.user.id) && !isAdmin(req.user)) throw new HttpError(403, t('Nur der Ersteller oder ein Admin kann die Gruppe löschen.', 'Only the creator or an admin can delete the group.'));
  await run('DELETE FROM group_messages WHERE group_id = ?', g.id);
  await run('DELETE FROM group_members WHERE group_id = ?', g.id);
  await run('DELETE FROM groups WHERE id = ?', g.id);
  res.json({ ok: true });
}));

groups.use(errorHandler);

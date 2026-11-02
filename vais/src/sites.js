// Webseiten von Agent X/Code-Modellen veröffentlichen: eigener Link /w/<id>, den jeder öffnen kann.
// Sicherheit: Die Seite läuft mit „CSP sandbox“ in einem eigenen, abgeschotteten Ursprung –
// sie kommt weder an Cookies noch an die VAIs-Schnittstellen heran.
import { Router } from 'express';
import { randomBytes } from 'node:crypto';
import { get, run, all } from './db.js';
import { t } from './i18n.js';
import { HttpError, wrap } from './auth.js';
import { checkText } from './safety.js';
import { Marked } from 'marked';
import { buildDeck, parseSlides } from '../public/deck.js';

await run(`CREATE TABLE IF NOT EXISTS sites (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  chat_id TEXT NOT NULL,
  turn INTEGER NOT NULL,
  side INTEGER NOT NULL,
  title TEXT,
  html TEXT NOT NULL,
  views INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
)`);
await run('CREATE UNIQUE INDEX IF NOT EXISTS sites_source ON sites (chat_id, turn, side)');

const MAX_SITES = 50;
const MAX_HTML = 600_000;

// Die (letzte) komplette HTML-Seite aus einer Antwort holen
export function htmlFrom(text = '') {
  let found = null;
  for (const m of String(text).matchAll(/```(html?|slides|)[^\n]*\n([\s\S]*?)```/gi)) {
    const code = m[2];
    if (m[1].toLowerCase() === 'slides') {
      // Präsentation → fertige Seite mit Folien
      if (parseSlides(code).slides.length) found = buildDeck(code, { Marked });
    } else if (m[1] || /^\s*<(!doctype|html)/i.test(code)) found = code;
  }
  return found && /<(!doctype|html|body)/i.test(found) ? found.trim() : null;
}

const SITE_CSP = [
  'sandbox allow-scripts allow-forms allow-popups allow-modals allow-downloads allow-pointer-lock',
  "default-src * data: blob: 'unsafe-inline' 'unsafe-eval'",
  "form-action 'none'",
  "frame-ancestors 'none'",
].join('; ');

const badge = (id) => `
<a href="/" target="_blank" rel="noopener" style="position:fixed;right:10px;bottom:10px;z-index:2147483647;font:500 12px/1 system-ui,sans-serif;padding:7px 10px;border-radius:999px;background:rgba(20,20,18,.78);color:#fff;text-decoration:none;backdrop-filter:blur(6px)">Erstellt mit VAIs</a>
<a href="/melden?site=${encodeURIComponent(id)}" target="_blank" rel="noopener" style="position:fixed;left:10px;bottom:10px;z-index:2147483647;font:500 11px/1 system-ui,sans-serif;padding:6px 9px;border-radius:999px;background:rgba(20,20,18,.55);color:#fff;text-decoration:none">🚩 Melden</a>`;

// Öffentliche Seite
export async function serveSite(req, res) {
  const id = String(req.params.id ?? '');
  const site = /^[\w-]{8,24}$/.test(id) ? await get('SELECT id, html FROM sites WHERE id = ?', id) : null;
  res.set({ 'Cache-Control': 'no-cache', 'X-Robots-Tag': 'noindex', 'Referrer-Policy': 'no-referrer' });
  if (!site) return res.status(404).type('html').send('<!doctype html><meta charset="utf-8"><title>Nicht gefunden</title><p style="font-family:system-ui;padding:24px">Diese Webseite gibt es nicht (mehr).</p>');
  run('UPDATE sites SET views = views + 1 WHERE id = ?', site.id).catch(() => {});
  res.removeHeader('X-Frame-Options');
  res.set('Content-Security-Policy', SITE_CSP);
  const shim = "<script>/* VAIs: Speicher-Ersatz für abgeschottete Seiten */(function(){function mk(){var m=new Map();return{getItem:function(k){return m.has(String(k))?m.get(String(k)):null},setItem:function(k,v){m.set(String(k),String(v))},removeItem:function(k){m.delete(String(k))},clear:function(){m.clear()},key:function(i){return Array.from(m.keys())[i]||null},get length(){return m.size}}}['localStorage','sessionStorage'].forEach(function(n){try{window[n].getItem('x')}catch(e){try{Object.defineProperty(window,n,{value:mk(),configurable:true})}catch(e2){}}});try{document.cookie}catch(e){try{Object.defineProperty(document,'cookie',{get:function(){return''},set:function(){},configurable:true})}catch(e2){}}})();</script>";
  const withShim = /<head[^>]*>/i.test(site.html) ? site.html.replace(/<head[^>]*>/i, (h) => h + shim) : shim + site.html;
  const html = /<\/body>/i.test(withShim) ? withShim.replace(/<\/body>(?![\s\S]*<\/body>)/i, `${badge(site.id)}</body>`) : withShim + badge(site.id);
  res.type('html').send(html);
}

export const sites = Router();

sites.post('/publish', wrap(async (req, res) => {
  const { chatId, turn, side = 0 } = req.body ?? {};
  const chat = await get('SELECT id, title FROM chats WHERE id = ? AND user_id = ?', String(chatId ?? ''), req.user.id);
  if (!chat || !Number.isInteger(turn)) throw new HttpError(404, t('Chat nicht gefunden.', 'Chat not found.'));
  const msg = await get('SELECT content FROM messages WHERE chat_id = ? AND turn = ? AND side = ?', chat.id, turn, side === 1 ? 1 : 0);
  const html = htmlFrom(msg?.content);
  if (!html) throw new HttpError(400, t('In dieser Antwort ist keine fertige Webseite.', 'This answer does not contain a finished website.'));
  if (html.length > MAX_HTML) throw new HttpError(400, t('Die Webseite ist zu groß zum Veröffentlichen.', 'The website is too large to publish.'));
  const title = (html.match(/<title[^>]*>([^<]{1,120})<\/title>/i)?.[1] || chat.title || 'Webseite').trim();
  // Sichtbaren Text der Seite prüfen (Jugendschutz)
  const visible = html.replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 5000);
  const unsafe = await checkText(`${title}\n${visible}`, 'site');
  if (unsafe) throw new HttpError(400, unsafe.message);
  const existing = await get('SELECT id FROM sites WHERE chat_id = ? AND turn = ? AND side = ?', chat.id, turn, side === 1 ? 1 : 0);
  let id = existing?.id;
  if (id) {
    await run('UPDATE sites SET html = ?, title = ?, updated_at = ? WHERE id = ?', html, title, Date.now(), id);
  } else {
    const n = await get('SELECT COUNT(*) AS n FROM sites WHERE user_id = ?', req.user.id);
    if (Number(n?.n ?? 0) >= MAX_SITES) throw new HttpError(400, t(`Du hast schon ${MAX_SITES} Webseiten veröffentlicht. Nimm eine offline, um Platz zu machen.`, `You have already published ${MAX_SITES} websites. Unpublish one to make room.`));
    id = randomBytes(8).toString('base64url');
    await run('INSERT INTO sites (id, user_id, chat_id, turn, side, title, html, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      id, req.user.id, chat.id, turn, side === 1 ? 1 : 0, title, html, Date.now(), Date.now());
  }
  res.json({ ok: true, id, path: `/w/${id}`, title });
}));

sites.get('/', wrap(async (req, res) => {
  const rows = await all('SELECT id, title, views, created_at, chat_id, turn, side FROM sites WHERE user_id = ? ORDER BY updated_at DESC', req.user.id);
  res.json({ sites: rows.map((r) => ({ id: r.id, title: r.title, views: Number(r.views), created: Number(r.created_at), chatId: r.chat_id, turn: Number(r.turn), side: Number(r.side) })) });
}));

sites.post('/unpublish', wrap(async (req, res) => {
  await run('DELETE FROM sites WHERE id = ? AND user_id = ?', String(req.body?.id ?? ''), req.user.id);
  res.json({ ok: true });
}));

// Für den Admin-Bereich
export const listAllSites = () => all(`SELECT s.id, s.title, s.views, s.created_at, u.email FROM sites s LEFT JOIN users u ON u.id = s.user_id ORDER BY s.created_at DESC LIMIT 100`);
export const removeSite = (id) => run('DELETE FROM sites WHERE id = ?', id);

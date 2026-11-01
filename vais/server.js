// .env laden (falls vorhanden), bevor die anderen Module ihre Einstellungen lesen
try { process.loadEnvFile(); } catch { /* keine .env – Standardwerte */ }

const express = (await import('express')).default;
const { langMiddleware, t } = await import('./src/i18n.js');
const { auth, currentUser } = await import('./src/auth.js');
const { mailConfigured } = await import('./src/mailer.js');
const { chat, share } = await import('./src/chat.js');
const { admin } = await import('./src/admin.js');
const { demoMode } = await import('./src/models.js');
const { OWNER, isAdmin } = await import('./src/config.js');
const { readFile } = await import('node:fs/promises');

// Abstürze vermeiden: unerwartete Fehler nur protokollieren
process.on('unhandledRejection', (err) => console.error('Unbehandelter Fehler:', err));
process.on('uncaughtException', (err) => console.error('Unerwarteter Fehler:', err));

const app = express();
app.set('trust proxy', 1);
app.disable('x-powered-by');

// Schneller Gesundheits-Check (für Render und die „VAIs wacht auf“-Seite)
app.get('/healthz', (req, res) => res.set('Cache-Control', 'no-store').json({ ok: true }));

app.use(langMiddleware);

// ── Sicherheits-Header ────────────────────────────────────────────
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self' data:",
  "img-src 'self' data: blob: https:",
  "connect-src 'self'",
  "frame-src 'self'",
  "worker-src 'self'",
  "manifest-src 'self'",
  "media-src 'self' blob: data:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');
// Die Webseiten-Vorschau läuft in einer abgeschotteten Seite mit eigener, lockerer Regel
const SANDBOX_CSP = "default-src * data: blob: 'unsafe-inline' 'unsafe-eval'; frame-ancestors 'self'";

app.use((req, res, next) => {
  const sandbox = req.path === '/sandbox.html' || req.path === '/sandbox.js';
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'same-origin',
    'Content-Security-Policy': sandbox ? SANDBOX_CSP : CSP,
    'Permissions-Policy': 'camera=(), geolocation=(), payment=(), microphone=(self)',
  });
  if (!sandbox) res.set('X-Frame-Options', 'DENY');
  if (process.env.COOKIE_SECURE === 'true') res.set('Strict-Transport-Security', 'max-age=15552000');
  next();
});

// Schutz vor Anfragen fremder Webseiten (CSRF): ändernde API-Aufrufe nur von hier
app.use('/api', (req, res, next) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const origin = req.headers.origin;
  if (origin) {
    let host = '';
    try { host = new URL(origin).host; } catch { /* ungültig */ }
    if (host !== req.headers.host) return res.status(403).json({ error: t('Anfrage nicht erlaubt.', 'Request not allowed.') });
  }
  next();
});

// Antworten mit Bildern brauchen mehr Platz; alles andere bleibt klein
const smallJson = express.json({ limit: '50kb' });
const bigJson = express.json({ limit: '10mb' });
app.use((req, res, next) => (req.path === '/api/chat/stream' ? bigJson : smallJson)(req, res, next));

app.use('/api/auth', auth);
app.use('/api/share', share);
app.use('/api/chat', chat);
app.use('/api/admin', admin);

// Seiten: nicht eingeloggte Besucher landen beim Login
const page = (name) => new URL(`./public/${name}`, import.meta.url).pathname;
const noCache = (res) => res.set('Cache-Control', 'no-cache');
app.get('/', async (req, res) => {
  if (!(await currentUser(req))) return res.redirect('/login');
  noCache(res);
  res.sendFile(page('app.html'));
});
app.get('/admin', async (req, res) => {
  const user = await currentUser(req);
  if (!user) return res.redirect('/login');
  if (!isAdmin(user)) return res.redirect('/');
  noCache(res);
  res.sendFile(page('admin.html'));
});
app.get('/admin.html', (req, res) => res.redirect('/admin'));
app.get('/login', async (req, res) => {
  if (await currentUser(req)) return res.redirect('/');
  noCache(res);
  res.sendFile(page('login.html'));
});

// Geteilte Chats: für alle lesbar (die Seite lädt die Daten selbst)
app.get('/s/:id', (req, res) => {
  noCache(res);
  res.set('Referrer-Policy', 'no-referrer');
  res.sendFile(page('share.html'));
});

// Datenschutz & Impressum (mit Betreiber-Angaben aus der Konfiguration)
const esc = (v) => String(v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
async function legalPage(res, file) {
  const html = (await readFile(page(`legal/${file}`), 'utf8'))
    .replaceAll('{{NAME}}', esc(OWNER.name))
    .replaceAll('{{EMAIL}}', esc(OWNER.email))
    .replaceAll('{{ADDRESS_HTML}}', OWNER.address ? `${esc(OWNER.address).replace(/\s*[,;|]\s*/g, '<br>')}<br>` : '')
    .replaceAll('{{DATE}}', '01.11.2026');
  res.type('html').send(html);
}
app.get('/datenschutz', (req, res) => legalPage(res, 'datenschutz.html'));
app.get('/impressum', (req, res) => legalPage(res, 'impressum.html'));
app.use('/legal', (req, res) => res.status(404).end());

// Webseiten-Symbole für Quellen über unseren Server holen (der Browser spricht nicht mit Google)
const icons = new Map();
app.get('/favicon/:host', async (req, res) => {
  const host = String(req.params.host).toLowerCase();
  if (!/^[a-z0-9.-]{1,253}$/.test(host) || !host.includes('.')) return res.status(400).end();
  let hit = icons.get(host);
  if (!hit) {
    try {
      const r = await fetch(`https://www.google.com/s2/favicons?sz=64&domain=${encodeURIComponent(host)}`, { signal: AbortSignal.timeout(6000) });
      const type = r.headers.get('content-type') || '';
      if (!r.ok || !type.startsWith('image/')) return res.status(404).end();
      hit = { type, body: Buffer.from(await r.arrayBuffer()) };
      if (hit.body.length > 50_000) return res.status(404).end();
      if (icons.size > 1000) icons.delete(icons.keys().next().value);
      icons.set(host, hit);
    } catch {
      return res.status(404).end();
    }
  }
  res.set({ 'Content-Type': hit.type, 'Cache-Control': 'public, max-age=604800' }).send(hit.body);
});

// Service Worker und Manifest immer frisch laden
app.get('/sw.js', (req, res) => {
  res.set({ 'Cache-Control': 'no-cache', 'Service-Worker-Allowed': '/' });
  res.sendFile(page('sw.js'));
});
app.get('/manifest.webmanifest', (req, res) => {
  res.type('application/manifest+json');
  noCache(res);
  res.sendFile(page('manifest.webmanifest'));
});

app.use(express.static(new URL('./public', import.meta.url).pathname, { index: false }));

// Bibliotheken für die Darstellung der Antworten (Markdown)
const vendor = (file) => new URL(`./node_modules/${file}`, import.meta.url).pathname;
app.get('/vendor/marked.js', (req, res) => res.sendFile(vendor('marked/lib/marked.umd.js')));
app.get('/vendor/purify.js', (req, res) => res.sendFile(vendor('dompurify/dist/purify.min.js')));
// Code-Farben (highlight.js), Formeln (KaTeX) und Schriften
app.get('/vendor/hljs.js', (req, res) => res.sendFile(vendor('@highlightjs/cdn-assets/highlight.min.js')));
app.get('/vendor/hljs-light.css', (req, res) => res.sendFile(vendor('@highlightjs/cdn-assets/styles/github.min.css')));
app.get('/vendor/hljs-dark.css', (req, res) => res.sendFile(vendor('@highlightjs/cdn-assets/styles/github-dark.min.css')));
app.get('/vendor/katex.js', (req, res) => res.sendFile(vendor('katex/dist/katex.min.js')));
app.get('/vendor/katex.css', (req, res) => res.sendFile(vendor('katex/dist/katex.min.css')));
app.use('/vendor/fonts', express.static(vendor('katex/dist/fonts'), { maxAge: '30d', immutable: true }));
const FONT_FILES = {
  'inter-latin-400-normal.woff2': '@fontsource/inter/files/inter-latin-400-normal.woff2',
  'inter-latin-500-normal.woff2': '@fontsource/inter/files/inter-latin-500-normal.woff2',
  'inter-latin-600-normal.woff2': '@fontsource/inter/files/inter-latin-600-normal.woff2',
  'instrument-serif-latin-400-normal.woff2': '@fontsource/instrument-serif/files/instrument-serif-latin-400-normal.woff2',
  'jetbrains-mono-latin-400-normal.woff2': '@fontsource/jetbrains-mono/files/jetbrains-mono-latin-400-normal.woff2',
  'jetbrains-mono-latin-500-normal.woff2': '@fontsource/jetbrains-mono/files/jetbrains-mono-latin-500-normal.woff2',
};
app.get('/fonts/:file', (req, res) => {
  const file = FONT_FILES[req.params.file];
  if (!file) return res.status(404).end();
  res.set('Cache-Control', 'public, max-age=2592000, immutable');
  res.sendFile(vendor(file));
});
// PDF-Text im Browser auslesen (wird nur geladen, wenn jemand ein PDF anhängt)
app.get('/vendor/pdf.mjs', (req, res) => res.type('text/javascript').sendFile(vendor('pdfjs-dist/build/pdf.min.mjs')));
app.get('/vendor/pdf.worker.mjs', (req, res) => res.type('text/javascript').sendFile(vendor('pdfjs-dist/build/pdf.worker.min.mjs')));

// Fehler (z. B. zu große oder kaputte Anfragen) immer als JSON beantworten
app.use((err, req, res, _next) => {
  const status = err.status || err.statusCode || 500;
  if (status >= 500) console.error(err);
  const message = status === 413
    ? t('Die Anfrage ist zu groß (z. B. zu viele oder zu große Bilder).', 'The request is too large (e.g. too many or too big images).')
    : status === 400 ? t('Ungültige Anfrage.', 'Invalid request.') : t('Etwas ist schiefgelaufen.', 'Something went wrong.');
  res.status(status).json({ error: message });
});

const port = Number(process.env.PORT) || 3000;
app.listen(port, () => {
  console.log(`\n  VAIs läuft auf http://localhost:${port}`);
  if (demoMode) console.log('  (Demo-Modus: kein API-Schlüssel – Platzhalter-Modelle antworten)');
  if (!mailConfigured) console.log('  (Entwicklungsmodus: Codes werden hier in der Konsole angezeigt, kein E-Mail-Versand eingerichtet)');
});

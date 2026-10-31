// .env laden (falls vorhanden), bevor die anderen Module ihre Einstellungen lesen
try { process.loadEnvFile(); } catch { /* keine .env – Standardwerte */ }

const express = (await import('express')).default;
const { auth, currentUser } = await import('./src/auth.js');
const { mailConfigured } = await import('./src/mailer.js');

const app = express();
app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use(express.json({ limit: '50kb' }));

app.use((req, res, next) => {
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'same-origin',
    'X-Frame-Options': 'DENY',
  });
  next();
});

app.use('/api/auth', auth);

// Seiten: nicht eingeloggte Besucher landen beim Login
const page = (name) => new URL(`./public/${name}`, import.meta.url).pathname;
app.get('/', (req, res) => (currentUser(req) ? res.sendFile(page('app.html')) : res.redirect('/login')));
app.get('/login', (req, res) => (currentUser(req) ? res.redirect('/') : res.sendFile(page('login.html'))));

app.use(express.static(new URL('./public', import.meta.url).pathname, { index: false }));

const port = Number(process.env.PORT) || 3000;
app.listen(port, () => {
  console.log(`\n  VAIs läuft auf http://localhost:${port}`);
  if (!mailConfigured) console.log('  (Entwicklungsmodus: Codes werden hier in der Konsole angezeigt, kein SMTP eingerichtet)');
});

// Öffentliche Status-Seite (/status): Welche Modelle sind gerade frei, welche voll?
// Zeigt keine Schlüssel und keine Nutzerdaten.
import { get } from './db.js';
import { lang } from './i18n.js';
import { listModels, demoMode } from './models.js';

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const LABEL = { openrouter: 'OpenRouter', groq: 'Groq', gemini: 'Google', cerebras: 'Cerebras', mistral: 'Mistral', pollinations: 'Pollinations (Bilder)', demo: 'Demo' };

async function snapshot() {
  const models = (await listModels()).filter((m) => !m.paid);
  const groups = new Map();
  for (const m of models) {
    const g = groups.get(m.provider) ?? { provider: m.provider, label: LABEL[m.provider] ?? m.provider, free: 0, total: 0, models: [] };
    g.total++;
    if (!m.busy) g.free++;
    g.models.push({ name: m.name, maker: m.maker, busy: !!m.busy });
    groups.set(m.provider, g);
  }
  const day = Date.now() - 24 * 3600 * 1000;
  const [answers, errors] = await Promise.all([
    get('SELECT COUNT(*) n FROM messages WHERE side >= 0 AND created_at > ?', day),
    get("SELECT COUNT(*) n FROM events WHERE kind = 'error' AND created_at > ?", day),
  ]);
  const list = [...groups.values()];
  const free = list.reduce((n, g) => n + g.free, 0);
  const total = list.reduce((n, g) => n + g.total, 0);
  const state = total === 0 ? 'down' : free === 0 ? 'down' : free < total * 0.5 ? 'partial' : 'ok';
  const a = Number(answers?.n ?? 0);
  const e = Number(errors?.n ?? 0);
  return { state, free, total, demo: demoMode, providers: list, last24h: { answers: a, errors: e, successRate: a + e ? Math.round((a / (a + e)) * 1000) / 10 : 100 }, checkedAt: new Date().toISOString() };
}

export async function statusPage(req, res) {
  const data = await snapshot();
  res.set('Cache-Control', 'no-cache');
  if (req.path.startsWith('/api/')) return res.json(data);
  const en = lang() === 'en';
  const T = (de, e2) => (en ? e2 : de);
  const head = {
    ok: ['✓', T('Alles läuft', 'All systems running')],
    partial: ['!', T('Einige Modelle sind gerade voll', 'Some models are busy right now')],
    down: ['✕', T('Gerade sind alle Modelle voll', 'All models are busy right now')],
  }[data.state];
  const time = new Date().toLocaleTimeString(en ? 'en-US' : 'de-DE', { timeZone: 'Europe/Berlin', hour: '2-digit', minute: '2-digit' });
  const html = `<!doctype html>
<html lang="${en ? 'en' : 'de'}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta http-equiv="refresh" content="60">
<title>Status – VAIs</title>
<script src="/boot.js"></script>
<link rel="icon" href="/logo.svg" type="image/svg+xml">
<link rel="stylesheet" href="/fonts.css">
<link rel="stylesheet" href="/styles.css">
<link rel="stylesheet" href="/status.css">
</head>
<body class="status-page">
<main class="st-main">
  <a class="brand st-brand" href="/" aria-label="VAIs"><span class="st-mark" aria-hidden="true"></span><span>VAIs</span></a>
  <h1>${T('Status', 'Status')}</h1>
  <section class="st-hero ${data.state}">
    <span class="st-icon" aria-hidden="true">${head[0]}</span>
    <div><b>${esc(head[1])}</b><small>${T(`${data.free} von ${data.total} Modellen frei`, `${data.free} of ${data.total} models available`)} · ${T('Stand', 'As of')} ${time}</small></div>
  </section>
  ${data.demo ? `<p class="st-note">${T('Demo-Modus: Es sind noch keine KI-Schlüssel eingetragen.', 'Demo mode: no AI keys configured yet.')}</p>` : ''}
  <section class="st-stats">
    <div><b>${data.last24h.answers.toLocaleString(en ? 'en-US' : 'de-DE')}</b><span>${T('Antworten (24 h)', 'Answers (24 h)')}</span></div>
    <div><b>${String(data.last24h.successRate).replace('.', en ? '.' : ',')} %</b><span>${T('ohne Fehler', 'without errors')}</span></div>
  </section>
  ${data.providers.map((g) => {
    const pstate = g.free === 0 ? 'down' : g.free < g.total ? 'partial' : 'ok';
    return `<details class="st-group" ${pstate !== 'ok' ? 'open' : ''}>
    <summary><span class="st-dot ${pstate}" aria-hidden="true"></span><b>${esc(g.label)}</b><small>${T(`${g.free}/${g.total} frei`, `${g.free}/${g.total} free`)}</small></summary>
    <ul>${g.models.map((m) => `<li><span class="st-dot ${m.busy ? 'down' : 'ok'}" aria-hidden="true"></span><span class="st-name">${esc(m.name)}</span><small>${m.busy ? T('voll', 'busy') : T('frei', 'free')}</small></li>`).join('')}</ul>
  </details>`;
  }).join('')}
  <p class="st-foot">${T('„Voll“ heißt: Das kostenlose Limit des Anbieters ist gerade erreicht. VAIs nimmt dann automatisch ein anderes Modell. Die Seite aktualisiert sich jede Minute.', '“Busy” means the provider’s free limit is reached right now. VAIs then automatically uses another model. This page refreshes every minute.')}</p>
  <p class="st-foot"><a href="/">VAIs</a> · <a href="/datenschutz">${T('Datenschutz', 'Privacy')}</a> · <a href="/impressum">${T('Impressum', 'Legal notice')}</a></p>
</main>
</body>
</html>`;
  res.type('html').send(html);
}

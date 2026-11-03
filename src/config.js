import { existsSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

/** Liest eine .env-Datei (falls vorhanden) ohne externe Abhängigkeit. Vorhandene Env-Variablen gewinnen. */
export function loadDotEnv(path = '.env') {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    let value = m[2];
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    if (process.env[m[1]] === undefined) process.env[m[1]] = value;
  }
}

const int = (v, d) => {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : d;
};

export function buildConfig(env = process.env) {
  const token = (env.TELEGRAM_BOT_TOKEN || '').trim();
  // Auf Render wird RENDER_EXTERNAL_URL automatisch gesetzt -> Webhook-Modus ohne extra Konfiguration.
  const webhookUrl = (env.WEBHOOK_URL || (env.FORCE_POLLING ? '' : env.RENDER_EXTERNAL_URL) || '').trim().replace(/\/+$/, '');
  return {
    token,
    adminIds: (env.ADMIN_IDS || '')
      .split(/[,\s]+/)
      .map((s) => parseInt(s, 10))
      .filter((n) => Number.isFinite(n)),
    databaseUrl: (env.DATABASE_URL || '').trim(),
    sqlitePath: env.SQLITE_PATH || './data/bot.sqlite',
    webhookUrl,
    webhookPath: env.WEBHOOK_PATH || '/telegram/webhook',
    // Wenn kein Secret gesetzt ist, wird eines deterministisch aus dem Token abgeleitet (wird nie geloggt).
    webhookSecret:
      (env.WEBHOOK_SECRET || '').trim() ||
      (token ? createHash('sha256').update('webhook:' + token).digest('hex').slice(0, 48) : ''),
    apiBase: env.TELEGRAM_API_BASE || 'https://api.telegram.org',
    port: int(env.PORT, 3000),
    likesPerDay: int(env.LIKES_PER_DAY, 50),
    msgsPerMinute: int(env.MSGS_PER_MINUTE, 20),
    viewCooldownHours: int(env.VIEW_COOLDOWN_HOURS, 24),
    minAge: 13,
    botName: env.BOT_NAME || 'VERTEX Partner',
  };
}

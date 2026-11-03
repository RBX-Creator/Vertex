import { loadDotEnv, buildConfig } from './config.js';
import { createTelegramApi } from './telegram.js';
import { createStore } from './store/index.js';
import { createBot } from './bot.js';
import { createHttpServer } from './server.js';
import { COMMANDS } from './texts.js';

loadDotEnv();
const config = buildConfig();
if (!config.token) {
  console.error('❌ TELEGRAM_BOT_TOKEN fehlt. Lege eine .env an (siehe .env.example) oder setze die Umgebungsvariable.');
  process.exit(1);
}

const api = createTelegramApi(config.token, { baseUrl: config.apiBase });
const store = await createStore(config);
const bot = createBot({ api, store, config });
const mode = config.webhookUrl ? 'webhook' : 'polling';

const me = await api.call('getMe');
console.log(`🚀 @${me.username} gestartet · Modus: ${mode} · Speicher: ${store.kind} · Admins: ${config.adminIds.length}`);
await api.call('setMyCommands', { commands: COMMANDS }).catch(() => {});

// Aufräumen alter Rate-Limit-Events / Views
const prune = () => store.prune({ eventsBefore: Date.now() - 2 * 86400_000, viewsBefore: Date.now() - 30 * 86400_000 }).catch(() => {});
prune();
setInterval(prune, 6 * 3600_000).unref();

const server = createHttpServer({
  mode,
  webhookPath: config.webhookPath,
  webhookSecret: config.webhookSecret,
  onUpdate: (u) => bot.handleUpdate(u),
});
server.listen(config.port, () => console.log(`🌐 HTTP auf Port ${config.port} (GET /health)`));

let stopping = false;
if (mode === 'webhook') {
  await api.call('setWebhook', {
    url: config.webhookUrl + config.webhookPath,
    secret_token: config.webhookSecret,
    allowed_updates: ['message', 'callback_query'],
    max_connections: 20,
  });
  console.log(`🔗 Webhook gesetzt: ${config.webhookUrl}${config.webhookPath}`);
} else {
  await api.call('deleteWebhook', { drop_pending_updates: false });
  (async function poll() {
    let offset = 0;
    while (!stopping) {
      try {
        const updates = await api.call('getUpdates', { offset, timeout: 30, allowed_updates: ['message', 'callback_query'] });
        for (const u of updates) {
          offset = u.update_id + 1;
          bot.handleUpdate(u); // pro User serialisiert, über User parallel
        }
      } catch (e) {
        console.warn('[polling]', e.description || e.message);
        await new Promise((r) => setTimeout(r, e.code === 409 ? 10_000 : 3000));
      }
    }
  })();
}

const shutdown = async () => {
  if (stopping) return;
  stopping = true;
  console.log('👋 Beende …');
  server.close();
  await store.close().catch(() => {});
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

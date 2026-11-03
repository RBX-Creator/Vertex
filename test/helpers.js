import { newDb } from 'pg-mem';
import { createStore } from '../src/store/index.js';
import { createBot } from '../src/bot.js';
import { buildConfig } from '../src/config.js';
import { ROLES, ANY_ROLE, B } from '../src/texts.js';

/** Fake Telegram API: zeichnet alle Aufrufe auf, schickt nichts ins Netz. */
export class FakeTelegram {
  constructor() {
    this.calls = [];
    this.mid = 1000;
    this.unreachable = new Set();
  }
  async call(method, params = {}) {
    this.calls.push({ method, params });
    if (this.unreachable.has(params.chat_id)) {
      const e = new Error('Forbidden');
      e.code = 403;
      e.description = 'Forbidden: bot was blocked by the user';
      throw e;
    }
    if (method === 'getMe') return { id: 1, username: 'test_bot' };
    return { message_id: this.mid++ };
  }
  sent(chatId) {
    return this.calls.filter((c) => c.method !== 'answerCallbackQuery' && c.params.chat_id === chatId);
  }
  texts(chatId) {
    return this.sent(chatId).map((c) => c.params.text ?? c.params.caption ?? '');
  }
  allText(chatId) {
    return this.texts(chatId).join('\n---\n');
  }
  lastText(chatId) {
    const t = this.texts(chatId);
    return t[t.length - 1] || '';
  }
  lastKeyboard(chatId) {
    const s = this.sent(chatId).filter((c) => c.params.reply_markup?.keyboard);
    const k = s[s.length - 1]?.params.reply_markup.keyboard || [];
    return k.flat().map((b) => b.text);
  }
  inlineButtons(chatId) {
    return this.sent(chatId).flatMap((c) => (c.params.reply_markup?.inline_keyboard || []).flat());
  }
  clear() {
    this.calls = [];
  }
}

// Optional: echte Postgres-DB testen mit TEST_DATABASE_URL=postgres://... npm test (Tabellen werden geleert!)
export const STORE_KINDS = ['sqlite', 'postgres(pg-mem)', ...(process.env.TEST_DATABASE_URL ? ['postgres(real)'] : [])];
const TABLES = ['users', 'likes', 'views', 'matches', 'blocks', 'reports', 'bans', 'events'];

export async function setup({ storeKind = 'sqlite', env = {} } = {}) {
  const config = buildConfig({ TELEGRAM_BOT_TOKEN: 'TEST:TOKEN', ADMIN_IDS: '999', LIKES_PER_DAY: '50', MSGS_PER_MINUTE: '20', ...env });
  const clock = { t: Date.UTC(2026, 10, 3, 12) };
  const now = () => clock.t;
  let store;
  if (storeKind === 'sqlite') {
    store = await createStore({ ...config, databaseUrl: '', sqlitePath: ':memory:' }, { now });
  } else if (storeKind === 'postgres(real)') {
    const pg = (await import('pg')).default;
    const c = new pg.Client({ connectionString: process.env.TEST_DATABASE_URL });
    await c.connect();
    await c.query(`DROP TABLE IF EXISTS ${TABLES.join(', ')}`);
    await c.end();
    store = await createStore({ ...config, databaseUrl: process.env.TEST_DATABASE_URL }, { now });
  } else {
    const mem = newDb();
    const { Pool } = mem.adapters.createPg();
    store = await createStore({ ...config, databaseUrl: 'postgres://test/test' }, { now, Pool });
  }
  const tg = new FakeTelegram();
  const bot = createBot({ api: tg, store, config, now, random: () => 0, log: { warn() {}, error: console.error } });
  let updateId = 1;
  let messageId = 1;
  const from = (id) => ({ id, is_bot: false, first_name: `User${id}`, username: `user${id}` });
  const send = (id, extra) =>
    bot.handleUpdate({ update_id: updateId++, message: { message_id: messageId++, from: from(id), chat: { id, type: 'private' }, date: 0, ...extra } });
  const say = (id, text) => send(id, { text });
  const photo = (id, fileId = 'photo-' + id, caption) => send(id, { photo: [{ file_id: fileId + '-s' }, { file_id: fileId }], ...(caption ? { caption } : {}) });
  const click = (id, data) =>
    bot.handleUpdate({ update_id: updateId++, callback_query: { id: 'cb' + updateId, from: from(id), data, message: { message_id: 1, chat: { id, type: 'private' } } } });

  async function register(id, p = {}) {
    const role = ROLES.find((r) => r.name === (p.role || 'Gründer'));
    const seek = p.seekRole === 'Egal' ? ANY_ROLE : ROLES.find((r) => r.name === (p.seekRole || 'Entwickler'));
    await say(id, '/start');
    await say(id, B.accept);
    await say(id, p.name || `Name${id}`);
    await say(id, String(p.age ?? 16));
    await say(id, p.city || 'Hamburg');
    await say(id, role.label);
    await say(id, seek.label);
    await say(id, p.offers || 'Ideen und Organisation');
    await say(id, p.seeks || 'Jemanden für mein Projekt');
    await say(id, p.about || 'Ich baue gerade ein cooles Startup auf.');
    if (p.photo) await photo(id, p.photo);
    else await say(id, B.skip);
    await say(id, p.link || B.skip);
    await say(id, B.confirm);
    const u = await store.getUser(id);
    if (!u?.complete) throw new Error(`register(${id}) failed: state=${u?.state} last=${tg.lastText(id)}`);
    return u;
  }

  return { close: () => store.close(), bot, tg, store, config, clock, say, photo, click, send, register };
}

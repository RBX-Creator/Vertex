import { createServer } from 'node:http';
import { timingSafeEqual } from 'node:crypto';

const safeEqual = (a, b) => {
  const x = Buffer.from(String(a || ''));
  const y = Buffer.from(String(b || ''));
  return x.length === y.length && timingSafeEqual(x, y);
};

/**
 * HTTP-Server: GET /health immer; POST <webhookPath> nur im Webhook-Modus (prüft X-Telegram-Bot-Api-Secret-Token).
 */
export function createHttpServer({ onUpdate, webhookPath, webhookSecret, mode, log = console }) {
  const started = Date.now();
  return createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    if (req.method === 'GET' && (url.pathname === '/health' || url.pathname === '/healthz')) {
      res.writeHead(200, { 'content-type': 'application/json' });
      return res.end(JSON.stringify({ ok: true, mode, uptimeSec: Math.round((Date.now() - started) / 1000) }));
    }
    if (req.method === 'GET' && url.pathname === '/') {
      res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' });
      return res.end('VERTEX Partner Bot läuft 🚀');
    }
    if (mode === 'webhook' && req.method === 'POST' && url.pathname === webhookPath) {
      if (!safeEqual(req.headers['x-telegram-bot-api-secret-token'], webhookSecret)) {
        res.writeHead(401);
        return res.end('unauthorized');
      }
      let size = 0;
      const chunks = [];
      req.on('data', (c) => {
        size += c.length;
        if (size > 1_000_000) req.destroy();
        else chunks.push(c);
      });
      req.on('end', async () => {
        let update;
        try {
          update = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        } catch {
          res.writeHead(400);
          return res.end('bad json');
        }
        try {
          await onUpdate(update);
        } catch (e) {
          log.error?.('[webhook] update error', e?.message || e);
        }
        res.writeHead(200);
        res.end('ok');
      });
      return;
    }
    res.writeHead(404);
    res.end('not found');
  });
}

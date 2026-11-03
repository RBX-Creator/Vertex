/** Minimaler Telegram-Bot-API-Client über fetch. Der Token wird niemals geloggt. */
export class TelegramError extends Error {
  constructor(method, code, description) {
    super(`Telegram ${method} failed (${code}): ${description}`);
    this.method = method;
    this.code = code;
    this.description = description;
  }
}

export function createTelegramApi(token, { fetchImpl = globalThis.fetch, baseUrl = 'https://api.telegram.org' } = {}) {
  if (!token) throw new Error('TELEGRAM_BOT_TOKEN fehlt');
  return {
    async call(method, params = {}, { signal } = {}) {
      let res;
      try {
        res = await fetchImpl(`${baseUrl}/bot${token}/${method}`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(params),
          signal,
        });
      } catch (e) {
        // Fehlermeldung ohne URL (enthält Token) weitergeben
        throw new TelegramError(method, 0, e?.name === 'AbortError' ? 'aborted' : 'network error');
      }
      let data;
      try {
        data = await res.json();
      } catch {
        throw new TelegramError(method, res.status, 'invalid JSON response');
      }
      if (!data.ok) throw new TelegramError(method, data.error_code || res.status, data.description || 'unknown');
      return data.result;
    },
  };
}

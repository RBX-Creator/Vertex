/** Erkennt offensichtliche Kontaktdaten: Telefonnummern, Links, E-Mails, @Usernames, t.me usw. */
const PATTERNS = [
  /(?:\+|00)?\d[\d\s().\/-]{6,}\d/, // Telefonnummer (mind. 8 Ziffern inkl. Trennzeichen)
  /https?:\/\//i,
  /\bwww\./i,
  /\b(?:t\.me|telegram\.me|telegram\.dog|wa\.me|chat\.whatsapp\.com|discord\.gg|discord\.com\/invite|snapchat\.com|instagram\.com|tiktok\.com)\b/i,
  /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i, // E-Mail
  /(^|[\s(])@[A-Za-z][A-Za-z0-9_]{3,}/, // @username
  /\b[a-z0-9-]{2,}\.(?:de|com|net|org|io|me|app|gg|ly|co|info|xyz|eu|at|ch|tv|link|site|online|shop)\b/i, // domain.tld
];

export function containsContact(text) {
  if (!text) return false;
  const [phone, ...rest] = PATTERNS;
  const phoneMatches = String(text).match(new RegExp(phone.source, 'g')) || [];
  if (phoneMatches.some((m) => (m.match(/\d/g) || []).length >= 9)) return true;
  return rest.some((re) => re.test(text));
}

const MESSENGER_HOSTS = /(^|\.)(t\.me|telegram\.me|telegram\.dog|wa\.me|whatsapp\.com|snapchat\.com|discord\.gg)$/i;

/** Normalisiert einen Website-/Portfolio-Link. Gibt null zurück, wenn ungültig. */
export function normalizeLink(input, { minor = false } = {}) {
  let s = (input || '').trim();
  if (!s || s.length > 200 || /\s/.test(s)) return null;
  if (!/^https?:\/\//i.test(s)) s = 'https://' + s;
  let url;
  try {
    url = new URL(s);
  } catch {
    return null;
  }
  if (!/^https?:$/.test(url.protocol)) return null;
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(url.hostname)) return null;
  if (minor && MESSENGER_HOSTS.test(url.hostname)) return null;
  return url.toString();
}

export function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

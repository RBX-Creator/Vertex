// Sammelt alle englischen Oberflächen-Texte (aus t('…', '…') und data-en="…") in public/i18n/strings.json.
// Daraus übersetzt VAIs die App einmalig in weitere Sprachen (siehe src/ui-i18n.js).
// Aufruf: npm run strings
import { readFileSync, writeFileSync, readdirSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const files = (dir, ext) => readdirSync(join(root, dir)).filter((f) => ext.test(f)).map((f) => join(root, dir, f));
const unescape = (s) => s.replace(/\\u([0-9a-f]{4})/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
  .replace(/\\n/g, '\n').replace(/\\t/g, '\t').replace(/\\(['"`\\])/g, '$1');
const decode = (s) => s.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

const out = new Set();
const T_CALL = /\bt\(\s*(['`])((?:\\.|(?!\1)[^\\])*)\1\s*,\s*(['`])((?:\\.|(?!\3)[^\\])*)\3\s*[,)]/g;
for (const file of [...files('public', /\.js$/), ...files('src', /\.js$/)]) {
  const src = readFileSync(file, 'utf8');
  for (const m of src.matchAll(T_CALL)) {
    const en = m[4];
    if (m[3] === '`' && en.includes('${')) continue; // mit Platzhaltern → bleibt Englisch
    const s = unescape(en).trim();
    if (s && /[a-z]/i.test(s)) out.add(s);
  }
}
for (const file of [...files('public', /\.html$/), ...files('public/legal', /\.html$/)]) {
  const src = readFileSync(file, 'utf8');
  for (const m of src.matchAll(/data-en(?:-placeholder|-aria-label|-title)?="([^"]*)"/g)) {
    const s = decode(m[1]).trim();
    if (s && /[a-z]/i.test(s)) out.add(s);
  }
  for (const m of src.matchAll(/<meta name="title-en" content="([^"]*)">/g)) out.add(decode(m[1]));
}
const list = [...out].sort();
mkdirSync(join(root, 'public/i18n'), { recursive: true });
writeFileSync(join(root, 'public/i18n/strings.json'), `${JSON.stringify(list, null, 1)}\n`);
console.log(`${list.length} Texte gesammelt.`);

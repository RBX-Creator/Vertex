// Antworten darstellen: Markdown, Formeln (KaTeX), farbiger Code (highlight.js) mit Kopier-Knopf
import { t } from './i18n.js';

const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

let hooked = false;
function hookLinks() {
  if (hooked || !window.DOMPurify) return;
  hooked = true;
  DOMPurify.addHook('afterSanitizeAttributes', (node) => {
    if (node.tagName === 'A') { node.setAttribute('target', '_blank'); node.setAttribute('rel', 'noopener noreferrer'); }
  });
}

// Formeln vor Markdown schützen (Markdown würde \( \) und _ sonst verändern)
const looksLikeMath = (s) => /[\\^_=]|[a-zA-Z]\d|\d[a-zA-Z]|[+\-*/<>]\s*\d/.test(s);
function protectMath(text, store) {
  const token = (src, display) => {
    store.push({ src: src.trim(), display });
    return `@@VAISMATH${store.length - 1}@@`;
  };
  // Code (```…``` und `…`) nicht anfassen
  return text.split(/(```[\s\S]*?(?:```|$)|`[^`\n]+`)/g).map((part, i) => {
    if (i % 2 === 1) return part;
    return part
      .replace(/\$\$([\s\S]+?)\$\$/g, (_, m) => token(m, true))
      .replace(/\\\[([\s\S]+?)\\\]/g, (_, m) => token(m, true))
      .replace(/\\\(([\s\S]+?)\\\)/g, (_, m) => token(m, false))
      // $…$ nur, wenn es nach Formel aussieht (sonst sind es Preise wie „5 $ und 10 $“)
      .replace(/(^|[^\\$\w])\$(?!\s)([^$\n]{1,300}?[^\s$\\])\$(?!\w)/g, (m, pre, inner) => (looksLikeMath(inner) ? pre + token(inner, false) : m));
  }).join('');
}

function renderMath(src, display) {
  if (!window.katex) return `<code>${escapeHtml(src)}</code>`;
  try {
    return katex.renderToString(src, { displayMode: display, throwOnError: false, output: 'html', strict: 'ignore', trust: false, maxSize: 20, maxExpand: 500 });
  } catch {
    return `<code>${escapeHtml(src)}</code>`;
  }
}

export function markdown(text) {
  hookLinks();
  // Quellen-Marker der Websuche („【1†L79-L83】“) als kleine Nummern anzeigen
  let src = String(text ?? '').replace(/\s*【(\d+)[^】]*】/g, ' <span class="cite">$1</span>').replace(/\s*【[^】]*】/g, '');
  if (!window.marked || !window.DOMPurify) return escapeHtml(src).replace(/\n/g, '<br>');
  const maths = [];
  src = protectMath(src, maths);
  let html = DOMPurify.sanitize(marked.parse(src, { gfm: true, breaks: true }));
  if (maths.length) {
    html = html.replace(/@@VAISMATH(\d+)@@/g, (_, i) => {
      const m = maths[Number(i)];
      return m ? renderMath(m.src, m.display) : '';
    });
  }
  return html;
}

// Code-Blöcke einfärben und mit Kopf (Sprache + Kopieren) versehen
export function enhance(root) {
  root.querySelectorAll('pre > code').forEach((code) => {
    const pre = code.parentElement;
    if (pre.parentElement?.classList.contains('codeblock')) return;
    const lang = (code.className.match(/language-([\w+#.-]+)/) || [])[1] || '';
    if (window.hljs) {
      try {
        if (lang && hljs.getLanguage(lang)) hljs.highlightElement(code);
        else if (code.textContent.length < 20000) {
          const r = hljs.highlightAuto(code.textContent);
          code.innerHTML = r.value;
          code.classList.add('hljs');
        }
      } catch { /* egal */ }
    }
    const box = document.createElement('div');
    box.className = 'codeblock';
    const head = document.createElement('div');
    head.className = 'code-head';
    const label = document.createElement('span');
    label.textContent = lang || t('Code', 'Code');
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'code-copy';
    btn.textContent = t('Kopieren', 'Copy');
    head.append(label, btn);
    pre.replaceWith(box);
    box.append(head, pre);
  });
}

// Kopier-Knopf an Code-Blöcken (einmal für die ganze Seite)
document.addEventListener('click', async (e) => {
  const btn = e.target.closest('.code-copy');
  if (!btn) return;
  const code = btn.closest('.codeblock')?.querySelector('code');
  if (!code) return;
  try {
    await navigator.clipboard.writeText(code.textContent);
    btn.textContent = t('Kopiert ✓', 'Copied ✓');
  } catch {
    btn.textContent = t('Nicht möglich', 'Not possible');
  }
  setTimeout(() => { btn.textContent = t('Kopieren', 'Copy'); }, 1500);
});

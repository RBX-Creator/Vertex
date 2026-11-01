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
  // Breite Tabellen: in einen wischbaren Rahmen (links/rechts) statt zusammengequetscht
  root.querySelectorAll('table').forEach((table) => {
    if (table.parentElement?.classList.contains('table-wrap') || table.closest('.chart')) return;
    const wrap = document.createElement('div');
    wrap.className = 'table-wrap';
    table.replaceWith(wrap);
    wrap.append(table);
    requestAnimationFrame(() => wrap.classList.toggle('scrolls', wrap.scrollWidth > wrap.clientWidth + 4));
  });
  root.querySelectorAll('pre > code').forEach((code) => {
    const pre = code.parentElement;
    if (pre.parentElement?.classList.contains('codeblock')) return;
    const lang = (code.className.match(/language-([\w+#.-]+)/) || [])[1] || '';
    if (lang === 'plan') {
      // Plan von Agent X: Schritte als Karte, darunter „Los geht’s“ / „Ändern“
      const steps = code.textContent.split('\n').map((l) => l.replace(/^\s*(\d+[.)]|[-*•])\s*/, '').trim()).filter(Boolean).slice(0, 12);
      const card = document.createElement('div');
      card.className = 'plan-card';
      const head = document.createElement('p');
      head.className = 'plan-head';
      head.textContent = t('Plan', 'Plan');
      const ol = document.createElement('ol');
      for (const step of steps) ol.append(Object.assign(document.createElement('li'), { textContent: step }));
      const acts = document.createElement('div');
      acts.className = 'plan-acts';
      acts.innerHTML = `<button type="button" class="plan-go" data-plan="go">${t('✓ Los geht’s', '✓ Go ahead')}</button><button type="button" class="plan-edit" data-plan="edit">${t('✏️ Ändern', '✏️ Change')}</button>`;
      card.append(head, ol, acts);
      pre.replaceWith(card);
      return;
    }
    if (lang === 'chart') {
      // Diagramm statt Code (solange das JSON noch unvollständig ist: Platzhalter)
      let spec = null;
      try { spec = JSON.parse(code.textContent); } catch { /* noch nicht fertig */ }
      const fig = spec ? renderChart(spec) : null;
      if (fig) { pre.replaceWith(fig); return; }
      const wait = document.createElement('p');
      wait.className = 'chart-wait';
      wait.textContent = t('Zeichnet Diagramm …', 'Drawing chart …');
      pre.replaceWith(wait);
      return;
    }
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
    head.append(label);
    if (/^(python|py|python3)$/i.test(lang)) {
      const run = document.createElement('button');
      run.type = 'button';
      run.className = 'code-run';
      run.textContent = t('▶ Ausführen', '▶ Run');
      head.append(run);
    }
    head.append(btn);
    pre.replaceWith(box);
    box.append(head, pre);
  });
}

// ── Python im Browser ausführen (Pyodide in einem abgeschirmten iframe) ──
let runner = null;
let runnerReady = null;
const pending = new Map();
function getRunner() {
  if (runnerReady) return runnerReady;
  runnerReady = new Promise((resolve) => {
    runner = document.createElement('iframe');
    runner.src = '/pyrunner.html';
    runner.setAttribute('sandbox', 'allow-scripts');
    runner.setAttribute('aria-hidden', 'true');
    runner.tabIndex = -1;
    runner.className = 'py-runner';
    window.addEventListener('message', (e) => {
      if (e.source !== runner.contentWindow) return;
      if (e.data?.type === 'vais-py-ready') resolve(runner);
      if (e.data?.type === 'vais-py-result') pending.get(e.data.id)?.(e.data);
    });
    document.body.append(runner);
  });
  return runnerReady;
}
let runId = 0;
async function runPython(code, onStatus) {
  const frame = await getRunner();
  const id = ++runId;
  return new Promise((resolve) => {
    pending.set(id, (msg) => {
      if (msg.status !== 'done') return onStatus(msg.status);
      pending.delete(id);
      resolve(msg);
    });
    frame.contentWindow.postMessage({ type: 'vais-py', id, code }, '*');
  });
}
const STATUS = {
  loading: () => t('Python wird geladen … (beim ersten Mal ein paar Sekunden)', 'Loading Python … (a few seconds the first time)'),
  packages: () => t('Lädt Pakete …', 'Loading packages …'),
  running: () => t('Läuft …', 'Running …'),
};
document.addEventListener('click', async (e) => {
  const btn = e.target.closest('.code-run');
  if (!btn || btn.disabled) return;
  const box = btn.closest('.codeblock');
  const code = box?.querySelector('code')?.textContent ?? '';
  let out = box.nextElementSibling?.classList.contains('code-out') ? box.nextElementSibling : null;
  if (!out) {
    out = document.createElement('div');
    out.className = 'code-out';
    box.after(out);
  }
  btn.disabled = true;
  out.className = 'code-out busy';
  out.innerHTML = '<p class="code-out-status"></p>';
  const status = out.querySelector('.code-out-status');
  status.textContent = STATUS.loading();
  const started = performance.now();
  const res = await runPython(code, (s) => { status.textContent = STATUS[s]?.() ?? ''; });
  btn.disabled = false;
  out.className = `code-out${res.ok ? '' : ' error'}`;
  out.innerHTML = '';
  const head = document.createElement('p');
  head.className = 'code-out-head';
  head.textContent = `${res.ok ? t('Ausgabe', 'Output') : t('Fehler', 'Error')} · ${((performance.now() - started) / 1000).toFixed(1)} s`;
  out.append(head);
  const text = [res.output, res.ok ? '' : res.error].filter(Boolean).join('\n');
  if (text) out.append(Object.assign(document.createElement('pre'), { textContent: text.slice(0, 20000) }));
  for (const src of res.images ?? []) {
    if (!/^data:image\/png;base64,/.test(src)) continue;
    out.append(Object.assign(document.createElement('img'), { src, alt: t('Diagramm aus Python', 'Chart from Python') }));
  }
  if (!text && !res.images?.length) out.append(Object.assign(document.createElement('p'), { className: 'code-out-empty', textContent: t('Fertig – keine Ausgabe.', 'Done – no output.') }));
});

// ── Diagramme aus ```chart-Blöcken ──────────────────────────────────
// Format: {"type":"bar"|"line"|"pie","title":"…","unit":"…","labels":[…],"series":[{"name":"…","data":[…]}]}
const SVGNS = 'http://www.w3.org/2000/svg';
const fmt = (n) => (Math.abs(n) >= 1e6 ? `${(n / 1e6).toLocaleString(undefined, { maximumFractionDigits: 1 })} Mio.` : Number(n).toLocaleString(undefined, { maximumFractionDigits: 2 }));
function niceMax(v) {
  if (v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  return [1, 2, 2.5, 5, 10].map((m) => m * p).find((x) => x >= v) ?? 10 * p;
}
function el(tag, attrs = {}, text) {
  const n = document.createElementNS(SVGNS, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  if (text !== undefined) n.textContent = text;
  return n;
}
export function renderChart(spec) {
  const labels = Array.isArray(spec?.labels) ? spec.labels.slice(0, Math.min(120, Number(spec?.maxLabels) || 40)).map(String) : [];
  let series = Array.isArray(spec?.series) ? spec.series : Array.isArray(spec?.data) ? [{ name: spec.title ?? '', data: spec.data }] : [];
  series = series.slice(0, 8).map((s) => ({ name: String(s?.name ?? ''), data: labels.map((_, i) => Number(s?.data?.[i]) || 0) }));
  if (!labels.length || !series.length) return null;
  const type = ['bar', 'line', 'pie'].includes(spec.type) ? spec.type : 'bar';
  const unit = spec.unit ? ` ${String(spec.unit).slice(0, 12)}` : '';
  const fig = document.createElement('figure');
  fig.className = 'chart';
  if (spec.title) fig.append(Object.assign(document.createElement('figcaption'), { textContent: String(spec.title).slice(0, 120) }));

  const W = 600; const H = 300;
  const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': String(spec.title ?? t('Diagramm', 'Chart')) });
  const tip = document.createElement('div');
  tip.className = 'chart-tip';
  tip.hidden = true;
  const showTip = (evt, html) => {
    tip.innerHTML = html;
    tip.hidden = false;
    const r = fig.getBoundingClientRect();
    const x = (evt.touches?.[0]?.clientX ?? evt.clientX) - r.left;
    tip.style.left = `${Math.min(Math.max(8, x), r.width - 8)}px`;
    tip.style.top = `${(evt.touches?.[0]?.clientY ?? evt.clientY) - r.top - 12}px`;
  };
  const esc = (v) => String(v).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const tipFor = (i) => `<b>${esc(labels[i])}</b>${series.map((s, k) => `<span><i style="background:var(--series-${k + 1})"></i>${esc(s.name || t('Wert', 'Value'))}: ${esc(fmt(s.data[i]))}${esc(unit)}</span>`).join('')}`;

  if (type === 'pie') {
    const vals = series[0].data.map((v) => Math.max(0, v));
    const total = vals.reduce((a, b) => a + b, 0) || 1;
    const cx = 150; const cy = 150; const R = 120; const r0 = 70;
    let a0 = -Math.PI / 2;
    vals.forEach((v, i) => {
      const a1 = a0 + (v / total) * Math.PI * 2;
      const large = a1 - a0 > Math.PI ? 1 : 0;
      const p = (a, rad) => `${cx + rad * Math.cos(a)} ${cy + rad * Math.sin(a)}`;
      const d = v >= total ? `M ${p(0, R)} A ${R} ${R} 0 1 1 ${p(Math.PI, R)} A ${R} ${R} 0 1 1 ${p(0, R)} M ${p(0, r0)} A ${r0} ${r0} 0 1 0 ${p(Math.PI, r0)} A ${r0} ${r0} 0 1 0 ${p(0, r0)} Z`
        : `M ${p(a0, R)} A ${R} ${R} 0 ${large} 1 ${p(a1, R)} L ${p(a1, r0)} A ${r0} ${r0} 0 ${large} 0 ${p(a0, r0)} Z`;
      const seg = el('path', { d, fill: `var(--series-${(i % 8) + 1})`, stroke: 'var(--surface)', 'stroke-width': 2, class: 'chart-mark' });
      seg.addEventListener('pointermove', (e) => showTip(e, `<b>${esc(labels[i])}</b><span>${esc(fmt(v))}${esc(unit)} · ${Math.round((v / total) * 100)} %</span>`));
      seg.addEventListener('pointerleave', () => { tip.hidden = true; });
      svg.append(seg);
      a0 = a1;
    });
    // Legende rechts
    labels.slice(0, 8).forEach((l, i) => {
      const y = 36 + i * 32;
      svg.append(el('rect', { x: 300, y: y - 15, width: 18, height: 18, rx: 4, fill: `var(--series-${(i % 8) + 1})` }));
      svg.append(el('text', { x: 326, y, class: 'chart-legend' }, `${l.slice(0, 14)} · ${Math.round((vals[i] / total) * 100)} %`));
    });
  } else {
    const L = 74; const Rm = 12; const T = series.length > 1 ? 52 : 18; const B = 56;
    let max = niceMax(Math.max(...series.flatMap((s) => s.data), 0));
    if (spec.integer) max = Math.max(4, Math.ceil(max / 4) * 4); // Zählwerte: nur ganze Zahlen an der Achse
    const min = Math.min(0, ...series.flatMap((s) => s.data));
    const span = max - min || 1;
    const y = (v) => T + (H - T - B) * (1 - (v - min) / span);
    for (let k = 0; k <= 4; k++) {
      const v = min + (span * k) / 4;
      svg.append(el('line', { x1: L, x2: W - Rm, y1: y(v), y2: y(v), class: 'chart-grid' }));
      svg.append(el('text', { x: L - 10, y: y(v) + 7, class: 'chart-axis', 'text-anchor': 'end' }, fmt(v)));
    }
    const band = (W - L - Rm) / labels.length;
    const every = Math.ceil(labels.length / 6);
    labels.forEach((lab, i) => {
      if (i % every) return;
      svg.append(el('text', { x: L + band * (i + 0.5), y: H - B + 30, class: 'chart-axis', 'text-anchor': 'middle' }, lab.length > 9 ? `${lab.slice(0, 8)}…` : lab));
    });
    if (type === 'bar') {
      const inner = Math.min(band * 0.72, 60);
      const bw = (inner - (series.length - 1) * 2) / series.length;
      series.forEach((s, k) => s.data.forEach((v, i) => {
        const x = L + band * i + (band - inner) / 2 + k * (bw + 2);
        const top = y(Math.max(v, 0)); const bottom = y(Math.min(v, 0));
        const h = Math.max(1, bottom - top);
        const rr = Math.min(4, bw / 2, h);
        const d = v >= 0
          ? `M ${x} ${bottom} V ${top + rr} Q ${x} ${top} ${x + rr} ${top} H ${x + bw - rr} Q ${x + bw} ${top} ${x + bw} ${top + rr} V ${bottom} Z`
          : `M ${x} ${top} V ${bottom - rr} Q ${x} ${bottom} ${x + rr} ${bottom} H ${x + bw - rr} Q ${x + bw} ${bottom} ${x + bw} ${bottom - rr} V ${top} Z`;
        svg.append(el('path', { d, fill: `var(--series-${k + 1})`, class: 'chart-mark' }));
      }));
    } else {
      series.forEach((s, k) => {
        const pts = s.data.map((v, i) => `${L + band * (i + 0.5)},${y(v)}`).join(' ');
        svg.append(el('polyline', { points: pts, fill: 'none', stroke: `var(--series-${k + 1})`, 'stroke-width': 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }));
        if (labels.length <= 24) s.data.forEach((v, i) => svg.append(el('circle', { cx: L + band * (i + 0.5), cy: y(v), r: 4, fill: `var(--series-${k + 1})`, stroke: 'var(--surface)', 'stroke-width': 2 })));
      });
    }
    // Trefferflächen pro Spalte für den Tooltip (größer als die Markierung)
    const guide = el('line', { y1: T, y2: H - B, class: 'chart-guide', visibility: 'hidden' });
    svg.append(guide);
    labels.forEach((_, i) => {
      const hit = el('rect', { x: L + band * i, y: T, width: band, height: H - T - B, fill: 'transparent' });
      hit.addEventListener('pointermove', (e) => {
        const gx = L + band * (i + 0.5);
        guide.setAttribute('x1', gx); guide.setAttribute('x2', gx); guide.setAttribute('visibility', type === 'line' ? 'visible' : 'hidden');
        showTip(e, tipFor(i));
      });
      hit.addEventListener('pointerleave', () => { tip.hidden = true; guide.setAttribute('visibility', 'hidden'); });
      svg.append(hit);
    });
    if (series.length > 1) {
      let lx = L;
      series.forEach((s, k) => {
        svg.append(el('rect', { x: lx, y: 6, width: 18, height: 18, rx: 4, fill: `var(--series-${k + 1})` }));
        const txt = el('text', { x: lx + 26, y: 22, class: 'chart-legend' }, s.name.slice(0, 16));
        svg.append(txt);
        lx += 46 + Math.min(16, s.name.length) * 12;
      });
    }
  }
  const wrapEl = document.createElement('div');
  wrapEl.className = 'chart-plot';
  wrapEl.append(svg, tip);
  fig.append(wrapEl);

  // Tabellen-Ansicht (für alle, die lieber Zahlen lesen)
  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'chart-toggle';
  toggle.textContent = t('Als Tabelle', 'As table');
  const table = document.createElement('table');
  table.className = 'chart-table';
  table.hidden = true;
  table.innerHTML = `<thead><tr><th></th>${series.map((s) => `<th>${esc(s.name || t('Wert', 'Value'))}</th>`).join('')}</tr></thead>
    <tbody>${labels.map((l, i) => `<tr><td>${esc(l)}</td>${series.map((s) => `<td>${esc(fmt(s.data[i]))}${esc(unit)}</td>`).join('')}</tr>`).join('')}</tbody>`;
  toggle.addEventListener('click', () => {
    table.hidden = !table.hidden;
    wrapEl.hidden = !table.hidden;
    toggle.textContent = table.hidden ? t('Als Tabelle', 'As table') : t('Als Diagramm', 'As chart');
  });
  fig.append(table, toggle);
  return fig;
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

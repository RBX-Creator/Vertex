// Präsentationen: ```slides-Block (Markdown, Folien getrennt durch „---“) → eigenständige HTML-Seite.
// Wird in der App (Vorschau) und auf dem Server (Veröffentlichen) gleich benutzt – deshalb ohne DOM.
//
// Format:
//   theme: nacht | hell | ozean | sonne | wald | bonbon   (optional, erste Zeile)
//   # Titel
//   Untertitel
//   ---
//   ## Folie 2
//   - Punkt
//   Notiz: Sprechernotiz (optional, wird beim Präsentieren über 📝 gezeigt)

export const THEMES = {
  nacht: { bg: '#0d0f14', bg2: '#1a1f2e', fg: '#f3f4f7', muted: '#9aa3b5', accent: '#8b7cff', accent2: '#3dd6c6' },
  hell: { bg: '#fbfaf7', bg2: '#efe9df', fg: '#1d1b18', muted: '#6b665d', accent: '#d9572b', accent2: '#2b6cd9' },
  ozean: { bg: '#062a3a', bg2: '#0b4a5e', fg: '#ecfbff', muted: '#9cc7d3', accent: '#4fd1e8', accent2: '#ffd36e' },
  sonne: { bg: '#2a0f1f', bg2: '#5b1f2e', fg: '#fff4ec', muted: '#e3b7a8', accent: '#ff9f43', accent2: '#ff5e7e' },
  wald: { bg: '#0f1d16', bg2: '#1d3527', fg: '#effaf1', muted: '#a6c2ae', accent: '#7ddc8b', accent2: '#e8d36e' },
  bonbon: { bg: '#fff5fb', bg2: '#ffe1f0', fg: '#2b1630', muted: '#7d5d80', accent: '#e0449b', accent2: '#7a5cff' },
};

// Quelltext → { theme, title, slides: [{ md, notes }] }
export function parseSlides(src = '') {
  let text = String(src).replace(/\r/g, '');
  let theme = 'nacht';
  text = text.replace(/^\s*(?:theme|thema)\s*:\s*([\w-]+)\s*\n/i, (_, name) => { if (THEMES[name.toLowerCase()]) theme = name.toLowerCase(); return ''; });
  const slides = text.split(/^\s*-{3,}\s*$/m).map((part) => {
    const notes = [];
    const md = part.replace(/\n(?=!\[)/g, '\n\n').replace(/^\s*(?:notiz|notizen|note|notes)\s*:\s*(.+)$/gim, (_, n) => { notes.push(n.trim()); return ''; }).trim();
    return { md, notes: notes.join(' ') };
  }).filter((s) => s.md);
  const title = (slides[0]?.md.match(/^#{1,2}\s+(.+)$/m)?.[1] ?? 'Präsentation').replace(/[*_`]/g, '').trim().slice(0, 120);
  return { theme, title, slides: slides.slice(0, 40) };
}

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// Markdown einer Folie → HTML (ohne rohes HTML aus dem Text; nur http(s)-Bilder/Links)
function slideHtml(md, Marked) {
  const m = new Marked({ gfm: true, breaks: true });
  m.use({
    renderer: {
      html: (tok) => esc(typeof tok === 'string' ? tok : tok.text ?? ''),
      link(tok) {
        const href = /^https?:\/\//i.test(tok.href ?? '') ? tok.href : null;
        const inner = this.parser.parseInline(tok.tokens ?? []);
        return href ? `<a href="${esc(href)}" target="_blank" rel="noopener">${inner}</a>` : inner;
      },
      image(tok) {
        return /^https?:\/\//i.test(tok.href ?? '') ? `<img src="${esc(tok.href)}" alt="${esc(tok.text ?? '')}" loading="lazy" referrerpolicy="no-referrer">` : '';
      },
    },
  });
  return m.parse(md);
}

export function buildDeck(src, { Marked }) {
  const { theme, title, slides } = parseSlides(src);
  const c = THEMES[theme];
  const total = slides.length;
  const body = slides.map((s, i) => {
    const html = slideHtml(s.md, Marked);
    const cover = i === 0 && /^\s*#\s/.test(s.md);
    const hasImg = /<img /.test(html);
    return `<section class="slide${cover ? ' cover' : ''}${hasImg ? ' has-img' : ''}" data-i="${i}"${s.notes ? ` data-notes="${esc(s.notes)}"` : ''} aria-roledescription="Folie" aria-label="${i + 1} / ${total}"><div class="inner">${html}</div></section>`;
  }).join('\n');
  return `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(title)}</title>
<style>
:root{--bg:${c.bg};--bg2:${c.bg2};--fg:${c.fg};--muted:${c.muted};--accent:${c.accent};--accent2:${c.accent2}}
*{box-sizing:border-box}
html,body{margin:0;height:100%;background:var(--bg);color:var(--fg);font-family:Inter,ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;overflow:hidden;-webkit-text-size-adjust:100%}
.deck{position:fixed;inset:0;background:radial-gradient(120% 90% at 85% 0%,var(--bg2) 0%,var(--bg) 60%)}
.deck::before{content:"";position:absolute;width:60vmax;height:60vmax;right:-20vmax;bottom:-25vmax;border-radius:50%;background:radial-gradient(circle,color-mix(in srgb,var(--accent) 22%,transparent),transparent 70%);pointer-events:none}
.slide{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;padding:max(64px,calc(env(safe-area-inset-top) + 52px)) max(7vmin,env(safe-area-inset-right)) max(9vmin,env(safe-area-inset-bottom)) max(7vmin,env(safe-area-inset-left));opacity:0;transform:translateX(6%) scale(.98);transition:opacity .45s ease,transform .55s cubic-bezier(.2,.8,.2,1);pointer-events:none}
.slide.before{transform:translateX(-6%) scale(.98)}
.slide.on{opacity:1;transform:none;pointer-events:auto}
.inner{width:min(1100px,100%);max-height:100%;overflow:auto;scrollbar-width:none}
.inner::-webkit-scrollbar{display:none}
h1,h2,h3{margin:0 0 .45em;line-height:1.08;letter-spacing:-.02em;font-weight:750}
h1{font-size:clamp(34px,7.4vmin,92px)}
h2{font-size:clamp(26px,5.6vmin,64px)}
h2::after{content:"";display:block;width:2.2em;height:.12em;margin-top:.32em;border-radius:9px;background:linear-gradient(90deg,var(--accent),var(--accent2))}
h3{font-size:clamp(20px,3.6vmin,40px);color:var(--accent)}
p,li,td,th{font-size:clamp(17px,3.1vmin,34px);line-height:1.42}
p{margin:.35em 0;color:color-mix(in srgb,var(--fg) 88%,var(--muted))}
ul,ol{margin:.3em 0;padding-left:1.15em}
li{margin:.32em 0;opacity:0;transform:translateY(10px);transition:opacity .4s ease,transform .45s ease}
.on li{opacity:1;transform:none}
${Array.from({ length: 8 }, (_, k) => `.on li:nth-child(${k + 1}){transition-delay:${0.12 + k * 0.08}s}`).join('')}
li::marker{color:var(--accent)}
strong{color:var(--accent)}
em{color:var(--accent2);font-style:normal}
a{color:var(--accent2)}
code{font-family:ui-monospace,Menlo,monospace;font-size:.85em;background:color-mix(in srgb,var(--fg) 10%,transparent);padding:.1em .35em;border-radius:6px}
pre{background:color-mix(in srgb,var(--fg) 8%,transparent);padding:1em;border-radius:14px;overflow:auto;font-size:clamp(13px,2.2vmin,22px)}
pre code{background:none;padding:0}
blockquote{margin:.5em 0;padding:.2em 0 .2em 1em;border-left:.2em solid var(--accent);font-size:1.15em;font-style:italic}
table{border-collapse:collapse;width:100%;margin:.4em 0}
th,td{padding:.4em .6em;border-bottom:1px solid color-mix(in srgb,var(--fg) 18%,transparent);text-align:left}
th{color:var(--accent)}
img{display:block;max-width:100%;max-height:48vh;margin:.6em auto;border-radius:18px;box-shadow:0 18px 50px rgba(0,0,0,.35);object-fit:cover}
.cover .inner{text-align:center}
.cover h1{font-size:clamp(40px,10vmin,128px);background:linear-gradient(100deg,var(--fg) 30%,var(--accent) 70%,var(--accent2));-webkit-background-clip:text;background-clip:text;color:transparent;padding-bottom:.05em}
.cover p{font-size:clamp(18px,3.6vmin,40px);color:var(--muted)}
@media (min-aspect-ratio:4/3){.has-img .inner{display:grid;grid-template-columns:1.1fr .9fr;gap:5vmin;align-items:center}.has-img .inner>*{grid-column:1}.has-img .inner>p:has(img){grid-column:2;grid-row:1/span 20;margin:0}.has-img img{max-height:70vh}}
.bar{position:fixed;left:0;bottom:0;height:4px;background:linear-gradient(90deg,var(--accent),var(--accent2));transition:width .4s ease;z-index:5}
.ui{position:fixed;right:max(12px,env(safe-area-inset-right));top:max(12px,env(safe-area-inset-top));display:flex;gap:6px;align-items:center;z-index:6;font-size:14px}
.ui button{all:unset;cursor:pointer;min-width:38px;height:38px;display:grid;place-items:center;border-radius:999px;background:color-mix(in srgb,var(--fg) 12%,transparent);color:var(--fg);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);font-size:16px}
.ui button:hover{background:color-mix(in srgb,var(--fg) 20%,transparent)}
.ui button:focus-visible{outline:2px solid var(--accent)}
.count{padding:0 8px;color:var(--muted);font-variant-numeric:tabular-nums}
.notes{position:fixed;left:max(12px,env(safe-area-inset-left));right:max(12px,env(safe-area-inset-right));bottom:max(56px,calc(env(safe-area-inset-bottom) + 44px));max-width:720px;margin:auto;padding:12px 16px;border-radius:14px;background:color-mix(in srgb,var(--bg) 82%,#000);color:var(--fg);font-size:15px;line-height:1.45;z-index:6;box-shadow:0 10px 30px rgba(0,0,0,.3)}
.notes[hidden]{display:none}
.hint{position:fixed;left:50%;bottom:max(18px,env(safe-area-inset-bottom));white-space:nowrap;transform:translateX(-50%);padding:7px 12px;border-radius:999px;background:color-mix(in srgb,var(--fg) 12%,transparent);color:var(--muted);font-size:13px;z-index:6;transition:opacity .6s}
@media (prefers-reduced-motion:reduce){.slide,li{transition:none}}
@media print{html,body{overflow:visible;height:auto}.deck{position:static}.slide{position:relative;opacity:1;transform:none;height:100vh;page-break-after:always}.ui,.bar,.hint,.notes{display:none}li{opacity:1;transform:none}}
</style>
</head>
<body>
<main class="deck" id="deck">
${body}
</main>
<div class="bar" id="bar"></div>
<div class="notes" id="notes" hidden></div>
<div class="hint" id="hint">Wischen oder tippen zum Weiterblättern</div>
<nav class="ui" aria-label="Steuerung">
<button type="button" id="prev" aria-label="Zurück">‹</button>
<span class="count" id="count"></span>
<button type="button" id="next" aria-label="Weiter">›</button>
<button type="button" id="note" aria-label="Notizen" hidden>📝</button>
<button type="button" id="full" aria-label="Vollbild">⛶</button>
</nav>
<script>
(function(){
var s=[].slice.call(document.querySelectorAll('.slide')),n=s.length,i=0,notes=false;
var bar=document.getElementById('bar'),count=document.getElementById('count'),nb=document.getElementById('notes'),noteBtn=document.getElementById('note');
if(s.some(function(x){return x.dataset.notes}))noteBtn.hidden=false;
function go(k){i=Math.max(0,Math.min(n-1,k));s.forEach(function(x,j){x.classList.toggle('on',j===i);x.classList.toggle('before',j<i)});bar.style.width=((i+1)/n*100)+'%';count.textContent=(i+1)+' / '+n;var t=s[i].dataset.notes||'';nb.textContent=t;nb.hidden=!notes||!t;try{history.replaceState(null,'','#'+(i+1))}catch(e){}}
function hide(){var h=document.getElementById('hint');if(h)h.style.opacity=0}
document.getElementById('prev').onclick=function(e){e.stopPropagation();go(i-1)};
document.getElementById('next').onclick=function(e){e.stopPropagation();go(i+1)};
noteBtn.onclick=function(e){e.stopPropagation();notes=!notes;go(i)};
document.getElementById('full').onclick=function(e){e.stopPropagation();var d=document.documentElement;try{if(document.fullscreenElement)document.exitFullscreen();else(d.requestFullscreen||d.webkitRequestFullscreen).call(d)}catch(x){}};
addEventListener('keydown',function(e){if(['ArrowRight','PageDown',' ','Enter'].indexOf(e.key)>=0){e.preventDefault();go(i+1);hide()}else if(['ArrowLeft','PageUp','Backspace'].indexOf(e.key)>=0){e.preventDefault();go(i-1)}else if(e.key==='Home')go(0);else if(e.key==='End')go(n-1);else if(e.key==='n')noteBtn.click()});
var x0=null,y0=0;
addEventListener('touchstart',function(e){x0=e.touches[0].clientX;y0=e.touches[0].clientY},{passive:true});
addEventListener('touchend',function(e){if(x0===null)return;var dx=e.changedTouches[0].clientX-x0,dy=e.changedTouches[0].clientY-y0;x0=null;if(Math.abs(dx)>45&&Math.abs(dx)>Math.abs(dy)){go(i+(dx<0?1:-1));hide()}},{passive:true});
document.getElementById('deck').addEventListener('click',function(e){if(e.target.closest('a,pre,table'))return;if(getSelection&&String(getSelection()))return;go(i+(e.clientX<innerWidth*0.3?-1:1));hide()});
setTimeout(hide,3500);
var h=parseInt(location.hash.slice(1),10);go(h>0?h-1:0);
})();
</script>
</body>
</html>`;
}

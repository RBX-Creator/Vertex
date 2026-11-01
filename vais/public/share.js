// Geteilter Chat: nur lesen, ohne Anmeldung
import { t, translateDom } from './i18n.js';

const $ = (sel, root = document) => root.querySelector(sel);
translateDom();

const MODE = { agent: 'Agent X', battle: 'Battle', sxs: 'Side by Side', direct: t('Direkt', 'Direct') };

function markdown(text) {
  const clean = String(text ?? '').replace(/\s*【(\d+)[^】]*】/g, ' <span class="cite">$1</span>').replace(/\s*【[^】]*】/g, '');
  if (window.marked && window.DOMPurify) {
    return DOMPurify.sanitize(marked.parse(clean, { gfm: true, breaks: true }), { ADD_ATTR: ['target'] });
  }
  const div = document.createElement('div');
  div.textContent = clean;
  return div.innerHTML.replace(/\n/g, '<br>');
}

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
}

function label(chat, side) {
  if (chat.mode === 'agent') return 'Agent X';
  if (chat.labels?.[side]) return chat.labels[side];
  return `${t('Assistent', 'Assistant')} ${'AB'[side]}`;
}

function renderTurn(chat, turn) {
  const node = el('div', 'turn');
  const user = el('div', 'turn-user');
  const att = turn.attachments ?? [];
  if (att.length) {
    const list = el('div', 'att-list');
    for (const a of att) {
      if (a.kind === 'image' && /^data:image\//.test(a.url)) {
        const img = el('img', 'att-img');
        img.src = a.url;
        img.alt = a.name || '';
        list.append(img);
      } else {
        list.append(el('span', 'att-file', `📄 ${a.name}`));
      }
    }
    user.append(list);
  }
  if (turn.user) user.append(el('div', 'bubble', turn.user));
  node.append(user);

  const answers = el('div', `answers${turn.answers.length === 1 ? ' single' : ' shared'}`);
  const track = el('div', 'track');
  turn.answers.forEach((a, side) => {
    const card = el('article', 'card');
    const won = (chat.winner === 'a' && side === 0) || (chat.winner === 'b' && side === 1);
    if (won) card.classList.add('winner');
    const head = el('header', 'card-head');
    const lab = el('span', 'card-label', label(chat, side));
    if (won) lab.append(el('span', 'badge', ` ✓ ${t('Gewinner', 'Winner')}`));
    head.append(lab);
    const body = el('div', 'card-body md');
    body.innerHTML = a.text ? markdown(a.text) : (a.images?.length ? '' : `<p class="card-error" style="color:var(--muted)">${t('Noch keine Antwort.', 'No answer yet.')}</p>`);
    for (const src of a.images ?? []) {
      if (!/^data:image\//.test(src)) continue;
      const fig = el('figure', 'gen-img');
      const img = el('img');
      img.src = src;
      img.alt = turn.user || '';
      fig.append(img);
      body.append(fig);
    }
    body.querySelectorAll('a').forEach((link) => { link.target = '_blank'; link.rel = 'noopener noreferrer'; });
    card.append(head, body);
    if (a.sources?.length) {
      const src = el('ol', 'share-sources');
      a.sources.slice(0, 8).forEach((s) => {
        const li = el('li');
        const link = el('a', '', s.title || s.url);
        if (/^https?:/i.test(s.url)) link.href = s.url;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        li.append(link);
        src.append(li);
      });
      card.append(src);
    }
    track.append(card);
  });
  answers.append(track);
  node.append(answers);
  return node;
}

async function init() {
  const id = decodeURIComponent(location.pathname.split('/').pop() || '');
  try {
    const res = await fetch(`/api/share/${encodeURIComponent(id)}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || t('Dieser Link ist nicht (mehr) gültig.', 'This link is not valid (anymore).'));
    document.title = `${data.title} – VAIs`;
    $('#share-title').textContent = data.title;
    const models = data.labels?.length ? ` · ${data.labels.join(' vs. ')}` : '';
    $('#share-meta').textContent = `${MODE[data.mode] ?? data.mode}${models}`;
    for (const turn of data.turns) $('#thread').append(renderTurn(data, turn));
    $('#share-end').hidden = false;
  } catch (err) {
    $('#share-kicker').textContent = t('Hoppla', 'Oops');
    $('#share-title').textContent = err.message;
    $('#share-end').hidden = false;
  }
}

// Markdown-Bibliotheken werden mit "defer" geladen – danach starten
if (document.readyState === 'complete') init();
else window.addEventListener('load', init);

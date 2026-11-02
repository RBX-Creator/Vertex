// Läuft vor allem anderen: Sprache und Hell/Dunkel sofort setzen (ohne Flackern)
(function () {
  var root = document.documentElement;
  function read(key) {
    try { return JSON.parse(localStorage.getItem(key)); } catch (e) { return null; }
  }
  // Fehler-Tagebuch: Fehler im Browser kurz an den Server melden (ohne Inhalte, nur Meldung + Stelle)
  var sent = 0;
  function report(message, where, line) {
    if (sent++ > 8 || !message || /ResizeObserver|Script error|AbortError|NetworkError|Load failed|Failed to fetch/i.test(message)) return;
    try {
      var body = JSON.stringify({ message: String(message).slice(0, 300), where: String(where || location.pathname).slice(0, 120), line: line ? String(line) : '' });
      if (navigator.sendBeacon) navigator.sendBeacon('/api/log', new Blob([body], { type: 'application/json' }));
      else fetch('/api/log', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: body, keepalive: true });
    } catch (e) { /* egal */ }
  }
  window.addEventListener('error', function (e) {
    if (!e || !e.message) return;
    var file = String(e.filename || '').replace(location.origin, '');
    report(e.message, file || location.pathname, e.lineno ? e.lineno + ':' + (e.colno || 0) : '');
  });
  window.addEventListener('unhandledrejection', function (e) {
    var r = e && e.reason;
    report((r && (r.message || String(r))) || 'Promise abgelehnt', location.pathname, '');
  });

  var theme = read('vais.theme');
  if (theme === 'light' || theme === 'dark') root.setAttribute('data-theme', theme);

  var LANGS = ['de', 'en', 'tr', 'es', 'fr', 'uk'];
  // Wer zum ersten Mal kommt, sieht VAIs auf Englisch – umstellen geht jederzeit in den Einstellungen
  // (wer schon mal da war, behält seine bisherige Sprache – sie steht im Cookie)
  var lang = read('vais.lang');
  if (LANGS.indexOf(lang) === -1) {
    var before = (/(?:^|;\s*)vais_lang=([a-z]{2})/.exec(document.cookie || '') || [])[1];
    lang = LANGS.indexOf(before) !== -1 ? before : 'en';
    try { localStorage.setItem('vais.lang', JSON.stringify(lang)); } catch (e) { /* egal */ }
  }
  root.setAttribute('lang', lang);
  root.setAttribute('data-lang', lang);
  try { document.cookie = 'vais_lang=' + lang + '; path=/; max-age=31536000; samesite=lax'; } catch (e) { /* egal */ }

  // Farbe der Browser-Leiste passend zum Design
  function paintBar() {
    var dark = root.getAttribute('data-theme') === 'dark'
      || (root.getAttribute('data-theme') !== 'light' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    var meta = document.querySelector('meta[name="theme-color"]');
    if (!meta) {
      meta = document.createElement('meta');
      meta.name = 'theme-color';
      document.head.appendChild(meta);
    }
    meta.content = dark ? '#0b0b0d' : '#f6f5f1';
  }
  window.__vaisPaintBar = paintBar;
  paintBar();
  try { window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', paintBar); } catch (e) { /* alt */ }

  // Service Worker (App-Installation + „VAIs wacht auf“-Seite)
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () { navigator.serviceWorker.register('/sw.js').catch(function () {}); });
  }
  // Nach dem Aufwachen hängt ?_w=1 an der Adresse – wieder entfernen
  if (/[?&]_w=1/.test(location.search)) {
    var clean = location.pathname + location.search.replace(/[?&]_w=1/, '').replace(/^&/, '?') + location.hash;
    history.replaceState(null, '', clean);
  }
})();

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

  // Einmalig: alte, automatisch gespeicherte Werte verwerfen (nicht selbst gewählt):
  // früher wurde Englisch als Start-Sprache und „Battle“ als Modus einfach abgelegt.
  if (read('vais.prefsV') !== 2) {
    try {
      if (!read('vais.langPicked')) { localStorage.removeItem('vais.lang'); document.cookie = 'vais_lang=; path=/; max-age=0'; }
      if (read('vais.mode') === 'battle') localStorage.setItem('vais.mode', JSON.stringify('direct'));
      localStorage.setItem('vais.prefsV', '2');
    } catch (e) { /* egal */ }
  }

  // Design: gewählt (hell/dunkel/System) – sonst dunkles Weltraum-Design
  var theme = read('vais.theme');
  if (theme === 'light' || theme === 'dark') root.setAttribute('data-theme', theme);
  else if (theme !== 'system') root.setAttribute('data-theme', 'dark');

  var LANGS = ['de', 'en', 'tr', 'es', 'fr', 'uk'];
  // Sprache: selbst gewählte > Browsersprache > Deutsch
  var lang = read('vais.lang');
  if (LANGS.indexOf(lang) === -1) {
    var before = read('vais.langPicked') ? (/(?:^|;\s*)vais_lang=([a-z]{2})/.exec(document.cookie || '') || [])[1] : null;
    var nav = String(navigator.language || '').slice(0, 2).toLowerCase();
    lang = LANGS.indexOf(before) !== -1 ? before : LANGS.indexOf(nav) !== -1 ? nav : 'de';
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
    meta.content = dark ? '#000000' : '#f6f5f1';
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

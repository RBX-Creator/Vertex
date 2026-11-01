// Läuft vor allem anderen: Sprache und Hell/Dunkel sofort setzen (ohne Flackern)
(function () {
  var root = document.documentElement;
  function read(key) {
    try { return JSON.parse(localStorage.getItem(key)); } catch (e) { return null; }
  }
  var theme = read('vais.theme');
  if (theme === 'light' || theme === 'dark') root.setAttribute('data-theme', theme);

  var lang = read('vais.lang');
  if (lang !== 'de' && lang !== 'en') lang = /^de\b/i.test(navigator.language || '') ? 'de' : 'en';
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
    meta.content = dark ? '#242422' : '#f6f5f1';
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

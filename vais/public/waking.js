// Wartet, bis der Server wach ist, und lädt dann die gewünschte Seite neu.
(function () {
  var en = document.documentElement.getAttribute('data-lang') === 'en';
  var offline = !navigator.onLine;
  var $ = function (id) { return document.getElementById(id); };

  if (en) {
    $('w-title').textContent = 'VAIs is waking up …';
    $('w-text').textContent = 'The free server sleeps when nobody has visited for a while. Waking up takes up to a minute – the page will reload by itself.';
  }
  if (offline) {
    $('w-title').textContent = en ? 'You are offline' : 'Du bist offline';
    $('w-text').textContent = en ? 'VAIs will load as soon as you are back online.' : 'VAIs lädt, sobald du wieder Internet hast.';
  }

  var start = Date.now();
  var EXPECTED = 60000;
  function tick() {
    var s = Math.floor((Date.now() - start) / 1000);
    $('w-time').textContent = s + ' s';
    $('w-bar').style.width = Math.min(95, ((Date.now() - start) / EXPECTED) * 100) + '%';
  }
  setInterval(tick, 1000);
  tick();

  function go() {
    var url = new URL(location.href);
    url.searchParams.set('_w', '1');
    location.replace(url.toString());
  }

  function check() {
    fetch('/healthz', { cache: 'no-store' })
      .then(function (res) { if (res.ok) { $('w-bar').style.width = '100%'; setTimeout(go, 300); } else setTimeout(check, 2000); })
      .catch(function () { setTimeout(check, 2000); });
  }
  check();
  window.addEventListener('online', check);
})();

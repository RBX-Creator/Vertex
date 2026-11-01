// Service Worker für VAIs:
// - macht VAIs als App installierbar
// - zeigt „VAIs wacht auf …“, wenn der kostenlose Server gerade schläft (statt einer leeren Seite)
// - ohne Internet: die App aus dem Zwischenspeicher, damit man gespeicherte Chats lesen kann
const CACHE = 'vais-v5';
const SHELL = ['/waking.html', '/waking.js', '/boot.js', '/fonts.css', '/styles.css', '/logo.svg', '/icons/app-192.png'];
// Für den Offline-Modus zusätzlich (Fehler hier stoppen die Installation nicht)
const APP_FILES = ['/app.css', '/app.js', '/i18n.js', '/render.js', '/tour.js', '/changelog.js', '/team.js', '/listen.js', '/voice-out.js', '/vendor/marked.js', '/vendor/purify.js', '/vendor/hljs.js', '/vendor/katex.js', '/vendor/katex.css', '/icons/app-512.png'];
const WAKE_AFTER = 4500; // so lange warten wir auf den Server, bevor die Aufwach-Seite kommt

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const c = await caches.open(CACHE);
    await c.addAll(SHELL);
    await Promise.all(APP_FILES.map((f) => c.add(f).catch(() => {})));
    // App-Seite aus dem alten Speicher übernehmen, damit Offline sofort weiter geht
    for (const key of await caches.keys()) {
      if (key === CACHE) continue;
      const old = await (await caches.open(key)).match('/');
      if (old) await c.put('/', old);
    }
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) if (key !== CACHE) await caches.delete(key);
    await self.clients.claim();
  })());
});

const wakingPage = async () => (await caches.match('/waking.html')) || new Response('VAIs …', { headers: { 'Content-Type': 'text/html' } });

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/') || url.pathname === '/healthz' || url.pathname.startsWith('/sandbox')) return;

  // Seitenaufrufe: Server fragen; antwortet er zu langsam (schläft), Aufwach-Seite zeigen
  if (req.mode === 'navigate') {
    if (url.searchParams.get('_w') === '1') return; // kommt gerade von der Aufwach-Seite
    const isApp = url.pathname === '/';
    event.respondWith((async () => {
      const network = fetch(req).then((res) => {
        // Die App-Seite für offline merken (nur echte App, keine Weiterleitung zum Login)
        if (isApp && res.ok && !res.redirected && res.type === 'basic') {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put('/', copy)).catch(() => {});
        }
        return res;
      });
      const timer = new Promise((resolve) => setTimeout(() => resolve('slow'), WAKE_AFTER));
      try {
        const first = await Promise.race([network, timer]);
        if (first !== 'slow') return first;
        network.catch(() => {}); // läuft im Hintergrund weiter und weckt den Server
        return wakingPage();
      } catch {
        // offline oder Server nicht erreichbar: App aus dem Speicher (liest gespeicherte Chats)
        if (isApp) {
          const app = await caches.match('/');
          if (app) return app;
        }
        return wakingPage();
      }
    })());
    return;
  }

  // Dateien (CSS, JS, Bilder): immer frisch vom Server, bei Ausfall aus dem Zwischenspeicher
  event.respondWith((async () => {
    try {
      const res = await fetch(req);
      if (res.ok && res.type === 'basic') {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
      }
      return res;
    } catch {
      const cached = await caches.match(req);
      if (cached) return cached;
      throw new Error('offline');
    }
  })());
});

// ── Erinnerungen (Push-Benachrichtigungen) ──────────────────────────
self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = { body: event.data?.text() }; }
  event.waitUntil(self.registration.showNotification(data.title || 'VAIs', {
    body: data.body || '',
    tag: data.tag,
    icon: '/icons/app-192.png',
    badge: '/icons/app-192.png',
    data: { url: data.url || '/' },
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || '/', self.location.origin).href;
  event.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const open = wins.find((w) => new URL(w.url).origin === self.location.origin);
    if (open) { await open.focus(); return; }
    await self.clients.openWindow(target);
  })());
});

// Service Worker für VAIs:
// - macht VAIs als App installierbar
// - zeigt „VAIs wacht auf …“, wenn der kostenlose Server gerade schläft (statt einer leeren Seite)
const CACHE = 'vais-v2';
const SHELL = ['/waking.html', '/waking.js', '/boot.js', '/fonts.css', '/styles.css', '/logo.svg', '/icons/app-192.png'];
const WAKE_AFTER = 4500; // so lange warten wir auf den Server, bevor die Aufwach-Seite kommt

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
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
    event.respondWith((async () => {
      const network = fetch(req);
      const timer = new Promise((resolve) => setTimeout(() => resolve('slow'), WAKE_AFTER));
      try {
        const first = await Promise.race([network, timer]);
        if (first !== 'slow') return first;
        network.catch(() => {}); // läuft im Hintergrund weiter und weckt den Server
        return wakingPage();
      } catch {
        return wakingPage(); // offline oder Server nicht erreichbar
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

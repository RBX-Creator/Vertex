// Minimaler Service Worker – macht Vertex als App installierbar (Homescreen).
// Bewusst kein Offline-Cache: Vertex braucht ohnehin den Server.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", () => {});

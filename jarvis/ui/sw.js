// Minimaler Service Worker – macht Jarvis als App installierbar (Homescreen).
// Bewusst kein Offline-Cache: Jarvis braucht ohnehin den Server.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", () => {});

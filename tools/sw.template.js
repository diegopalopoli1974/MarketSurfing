// Service worker de MarketSurfing: la app funciona completa sin conexión.
// Archivo generado por tools/build-sw.mjs — no editar a mano.
const VERSION = '__VERSION__';
const CACHE = `ms-shell-${VERSION}`;
const RUNTIME = 'ms-runtime-v1';
const TILES = 'ms-tiles-v1';
const FILES = __FILES__;

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith('ms-shell-') && k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.hostname === 'tile.openstreetmap.org') {
    // teselas del mapa: se guardan las vistas recientemente para verlas sin conexión (máx. 800)
    e.respondWith(
      caches.open(TILES).then(async (c) => {
        const hit = await c.match(req);
        if (hit) return hit;
        const res = await fetch(req);
        if (res.ok || res.type === 'opaque') {
          await c.put(req, res.clone());
          const keys = await c.keys();
          if (keys.length > 800) await Promise.all(keys.slice(0, keys.length - 800).map((k) => c.delete(k)));
        }
        return res;
      })
    );
    return;
  }
  if (url.origin !== self.location.origin) return; // p. ej. búsqueda de direcciones: siempre en línea
  if (req.mode === 'navigate') {
    e.respondWith(caches.match('./index.html', { ignoreSearch: true }).then((r) => r || fetch(req)));
    return;
  }
  // Motor de OCR opcional: se cachea al primer uso para que luego funcione sin conexión
  if (url.pathname.includes('/vendor/')) {
    e.respondWith(
      caches.open(RUNTIME).then(async (c) => {
        const hit = await c.match(req);
        if (hit) return hit;
        const res = await fetch(req);
        if (res.ok && req.method === 'GET') c.put(req, res.clone());
        return res;
      })
    );
    return;
  }
  e.respondWith(caches.match(req, { ignoreSearch: true }).then((r) => r || fetch(req)));
});

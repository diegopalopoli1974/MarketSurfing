// Service worker de MarketSurfing: la app funciona completa sin conexión.
// Archivo generado por tools/build-sw.mjs — no editar a mano.
const VERSION = '541981a9f8e2';
const CACHE = `ms-shell-${VERSION}`;
const RUNTIME = 'ms-runtime-v1';
const FILES = [
  "./",
  "index.html",
  "manifest.webmanifest",
  "css/app.css",
  "js/app/alerts.js",
  "js/app/backup.js",
  "js/app/listsvc.js",
  "js/app/session.js",
  "js/app/sync.js",
  "js/app.js",
  "js/core/auth.js",
  "js/core/crypto.js",
  "js/core/engine.js",
  "js/core/geo.js",
  "js/core/idb.js",
  "js/core/nlp.js",
  "js/core/ocr.js",
  "js/core/userdata.js",
  "js/data/catalog.js",
  "js/data/demo-seed.js",
  "js/data/sepa.js",
  "js/ui/charts.js",
  "js/ui/components.js",
  "js/ui/dom.js",
  "js/ui/location.js",
  "js/ui/map.js",
  "js/ui/picker.js",
  "js/views/alerts.js",
  "js/views/brands.js",
  "js/views/delivery.js",
  "js/views/gondola.js",
  "js/views/home.js",
  "js/views/inbox.js",
  "js/views/lists.js",
  "js/views/login.js",
  "js/views/profile.js",
  "js/views/reports.js",
  "js/views/search.js",
  "js/views/settings.js",
  "js/views/sync.js",
  "js/views/ticket.js",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "icons/icon-maskable-512.png",
  "icons/icon.svg"
];

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

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(
    self.clients.matchAll({ type: 'window' }).then((list) => {
      for (const c of list) if ('focus' in c) return c.navigate('./#/avisos').then((w) => w && w.focus());
      return self.clients.openWindow('./#/avisos');
    })
  );
});

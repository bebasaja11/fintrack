// FinTrack service worker — offline support.
// The app page is loaded network-first, so new versions appear on the next
// open (when online). No need to change this file when index.html changes.
const CACHE = 'fintrack-v6';
const ASSETS = ['./', './index.html', './manifest.webmanifest', './icon-192.png', './icon-512.png'];
const PAGE = './index.html';

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(ASSETS.map(u => new Request(u, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin) return;

  // The app page: always try the latest version first, fall back to the saved copy offline.
  if (req.mode === 'navigate' || url.pathname.endsWith('/index.html')) {
    e.respondWith((async () => {
      const cache = await caches.open(CACHE);
      try {
        const fresh = await Promise.race([
          fetch(url.origin + url.pathname, { cache: 'no-cache' }),
          new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 4000))
        ]);
        if (fresh.ok) { cache.put(PAGE, fresh.clone()); return fresh; }
        throw new Error('bad response');
      } catch (err) {
        return (await cache.match(PAGE)) || (await cache.match('./')) || Response.error();
      }
    })());
    return;
  }

  // Icons and manifest: serve the saved copy, refresh it in the background.
  e.respondWith(
    caches.open(CACHE).then(async cache => {
      const cached = await cache.match(req, { ignoreSearch: true });
      const fresh = fetch(req)
        .then(res => { if (res.ok) cache.put(req, res.clone()); return res; })
        .catch(() => cached);
      return cached || fresh;
    })
  );
});

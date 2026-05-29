/* Lucida service worker — resilient app-shell caching.
   - Navigations: network-first, so a healthy server always wins; the cached shell is
     only a fallback when offline. (Avoids the "stale SW serves a broken page" trap.)
   - Static assets: cache-first, then network.
   - install never fails: each file is cached independently and redirected/error
     responses are skipped (browsers can't cache a redirected response).
   Bump CACHE whenever a shell file changes to invalidate old caches. */
const CACHE = 'lucida-v3';
const SHELL = [
  './',
  './index.html',
  './app',                  // clean URL (app.html 308-redirects, which can't be cached)
  './manifest.webmanifest',
  './assets/styles.css',
  './assets/app.js',
  './assets/store.js',
  './assets/logo.svg',
];

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // Cache each file independently — one failure (or a redirect) must not abort install.
    await Promise.allSettled(SHELL.map(async (url) => {
      try {
        const res = await fetch(url, { cache: 'no-cache' });
        if (res.ok && !res.redirected) await cache.put(url, res.clone());
      } catch { /* offline / missing — skip, it'll be fetched on demand */ }
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (e) => {
  const { request } = e;
  if (request.method !== 'GET') return;

  // Page navigations → network-first. A working server always wins; only fall back to
  // the cached shell when the network is unavailable.
  if (request.mode === 'navigate') {
    e.respondWith((async () => {
      try {
        return await fetch(request);
      } catch {
        const cache = await caches.open(CACHE);
        return (await cache.match(request)) ||
               (await cache.match('./app')) ||
               (await cache.match('./index.html')) ||
               Response.error();
      }
    })());
    return;
  }

  // Static assets → cache-first, then network (caching only same-origin, non-redirected OK responses).
  e.respondWith((async () => {
    const cached = await caches.match(request);
    if (cached) return cached;
    try {
      const res = await fetch(request);
      if (res.ok && !res.redirected && new URL(request.url).origin === self.location.origin) {
        const cache = await caches.open(CACHE);
        cache.put(request, res.clone());
      }
      return res;
    } catch {
      return cached || Response.error();
    }
  })());
});

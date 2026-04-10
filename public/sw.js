const CACHE_VERSION = 'bridge-v2';

const SHELL_ASSETS = [
  '/portal.html',
  '/index.html',
  '/manifest.json'
];

// Install: cache shell assets
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then(cache => {
      // addAll fails if ANY asset 404s — use individual puts instead
      return Promise.allSettled(
        SHELL_ASSETS.map(url =>
          fetch(url).then(r => r.ok ? cache.put(url, r) : null).catch(() => null)
        )
      );
    }).then(() => self.skipWaiting())
  );
});

// Activate: clean up old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_VERSION).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Fetch: network-first with safe fallbacks (never return undefined)
self.addEventListener('fetch', event => {
  if (!event.request.url.startsWith('http')) return;

  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  // API calls: network-first, cache fallback, JSON error fallback
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(event.request).then(response => {
        if (event.request.method === 'GET' && response.ok) {
          const clone = response.clone();
          caches.open(CACHE_VERSION).then(cache => cache.put(event.request, clone)).catch(() => {});
        }
        return response;
      }).catch(() => {
        if (event.request.method === 'GET') {
          return caches.match(event.request).then(cached =>
            cached || new Response(JSON.stringify({ error: 'offline', ok: false }), {
              status: 503, headers: { 'Content-Type': 'application/json' }
            })
          );
        }
        return new Response(JSON.stringify({ error: 'offline', ok: false }), {
          status: 503, headers: { 'Content-Type': 'application/json' }
        });
      })
    );
    return;
  }

  // Everything else: network-first, cache fallback, never undefined
  if (event.request.mode === 'navigate' || event.request.destination === 'document') {
    event.respondWith(
      fetch(event.request).then(response => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_VERSION).then(cache => cache.put(event.request, clone)).catch(() => {});
        }
        return response;
      }).catch(() =>
        caches.match(event.request).then(cached =>
          cached || new Response('<html><body><h1>Offline</h1><p>Bridge AI OS is unavailable offline.</p></body></html>', {
            status: 503, headers: { 'Content-Type': 'text/html' }
          })
        )
      )
    );
    return;
  }
});

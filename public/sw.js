const CACHE_VERSION = 'bridge-v1';

const SHELL_ASSETS = [
  '/portal.html',
  '/index.html',
  '/voice.html',
  '/checkout.html',
  '/globe.js',
  '/bridge-phere.css',
  '/bridge-phere.js',
  '/icon.svg',
  '/manifest.json'
];

const OFFLINE_PAGE = '/offline.html';

// Install: cache shell assets + offline fallback
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then(cache => {
      return cache.addAll([...SHELL_ASSETS, OFFLINE_PAGE]);
    }).then(() => self.skipWaiting())
  );
});

// Activate: clean up old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys.filter(k => k !== CACHE_VERSION).map(k => caches.delete(k))
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch strategy
self.addEventListener('fetch', event => {
  // Skip non-HTTP requests (chrome-extension://, etc.)
  if (!event.request.url.startsWith('http')) return;

  const url = new URL(event.request.url);

  // Skip cross-origin requests
  if (url.origin !== self.location.origin) return;

  // Network-first for API calls
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          // Cache successful GET responses for offline fallback
          if (event.request.method === 'GET' && response.ok) {
            const clone = response.clone();
            caches.open(CACHE_VERSION).then(cache => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => {
          // Try cache fallback for GET API requests
          if (event.request.method === 'GET') {
            return caches.match(event.request);
          }
          return new Response(
            JSON.stringify({ error: 'You are offline', ok: false }),
            { status: 503, headers: { 'Content-Type': 'application/json' } }
          );
        })
    );
    return;
  }

  // Cache-first for static assets (images, CSS, JS, fonts)
  if (isStaticAsset(url.pathname)) {
    event.respondWith(
      caches.match(event.request).then(cached => {
        if (cached) return cached;
        return fetch(event.request).then(response => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_VERSION).then(cache => cache.put(event.request, clone));
          }
          return response;
        });
      }).catch(() => {
        // For navigation requests, show offline page
        if (event.request.mode === 'navigate') {
          return caches.match(OFFLINE_PAGE);
        }
      })
    );
    return;
  }

  // Network-first for HTML navigation, cache-fallback
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_VERSION).then(cache => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => {
          return caches.match(event.request).then(cached => {
            return cached || caches.match(OFFLINE_PAGE);
          });
        })
    );
    return;
  }

  // Default: network with cache fallback
  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  );
});

function isStaticAsset(pathname) {
  return /\.(css|js|svg|png|jpg|jpeg|gif|webp|woff2?|ttf|eot|ico)$/i.test(pathname);
}

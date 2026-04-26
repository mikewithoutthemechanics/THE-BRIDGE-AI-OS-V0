// === SERVICE WORKER - CACHE ONLY, NO FETCH LOOPS ===
// Purpose: Passive cache layer only. No polling, no throttling, no loops.
// Key: Throttle ALL fetch events to prevent event loop saturation

const CACHE_NAME = 'bridge-cache-v1';
const FETCH_THROTTLE_MS = 5000;
let lastFetchTime = 0;

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) return caches.delete(key);
        })
      )
    )
  );
  self.clients.claim();
});

// === CRITICAL: THROTTLE FETCHES ===
self.addEventListener('fetch', (event) => {
  const now = Date.now();

  // Throttle: max 1 fetch per 5s per worker
  if (now - lastFetchTime < FETCH_THROTTLE_MS) {
    return; // Drop event - prevents saturation
  }
  lastFetchTime = now;

  // Never intercept navigation (prevents twin-wall.html loop)
  if (event.request.mode === 'navigate') {
    return;
  }

  // Cache-only strategy for static assets
  if (event.request.destination === 'script' ||
      event.request.destination === 'style' ||
      event.request.destination === 'image') {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        return cached || fetch(event.request).then((response) => {
          // Cache new responses
          if (response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        });
      })
    );
    return;
  }

  // Pass through all other requests (non-blocking)
});
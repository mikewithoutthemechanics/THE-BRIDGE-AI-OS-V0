const CACHE_VERSION = 'bridge-v3-modular';

const SHELL_ASSETS = [
  '/portal.html',
  '/index.html',
  '/vault.html',
  '/nav-routes.js',
  '/bridge-nav.js',
  '/manifest.json'
];

// ─── Prime Agents registry (in-memory, per-SW) ──────────────────────────────
// Each agent role (vault-ui, terminal, admin, ...) posts its config on boot so
// offline fallbacks and push triggers can target it without reloading config.
const AGENTS = new Map();

self.addEventListener('message', (event) => {
  const msg = event.data || {};
  if (msg.type === 'prime-agent' && msg.role) {
    AGENTS.set(msg.role, { config: msg.config || {}, ts: Date.now() });
    if (event.source && event.source.postMessage) {
      event.source.postMessage({ type: 'prime-agent-ack', role: msg.role });
    }
  }
  if (msg.type === 'list-agents' && event.source) {
    event.source.postMessage({ type: 'agents', agents: Array.from(AGENTS.entries()) });
  }
  if (msg.type === 'skip-waiting') self.skipWaiting();
});

// Install: cache shell
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then(cache =>
      Promise.allSettled(
        SHELL_ASSETS.map(url =>
          fetch(url).then(r => r.ok ? cache.put(url, r) : null).catch(() => null)
        )
      )
    ).then(() => self.skipWaiting())
  );
});

// Activate: drop old caches
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

  // API: network-first, cache GET fallback, JSON error fallback
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(event.request).then(response => {
        if (event.request.method === 'GET' && response.ok) {
          const clone = response.clone();
          caches.open(CACHE_VERSION).then(c => c.put(event.request, clone)).catch(() => {});
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

  // Documents: network-first, cache fallback
  if (event.request.mode === 'navigate' || event.request.destination === 'document') {
    event.respondWith(
      fetch(event.request).then(response => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_VERSION).then(c => c.put(event.request, clone)).catch(() => {});
        }
        return response;
      }).catch(() =>
        caches.match(event.request).then(cached =>
          cached || caches.match('/vault.html').then(fallback =>
            fallback || new Response('<html><body><h1>Offline</h1><p>Bridge AI OS is unavailable offline.</p></body></html>', {
              status: 503, headers: { 'Content-Type': 'text/html' }
            })
          )
        )
      )
    );
    return;
  }
});

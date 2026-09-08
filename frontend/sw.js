/* ==========================================================================
   WizardFM — Service Worker
   PWA offline support and asset caching
   ========================================================================== */

const CACHE_NAME = 'wizardfm-v1';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/css/style.css',
  '/js/app.js',
  '/js/chat.js',
  '/js/visualizer.js',
  '/js/notifications.js',
  '/manifest.json',
  '/assets/logo.svg',
];

// Install — cache static assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    })
  );
  self.skipWaiting();
});

// Activate — clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) => {
      return Promise.all(
        names
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      );
    })
  );
  self.clients.claim();
});

// Fetch — network-first for API, cache-first for static assets
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Skip non-GET requests
  if (event.request.method !== 'GET') return;

  // Skip WebSocket and stream URLs
  if (url.pathname === '/ws' || url.pathname.startsWith('/radio')) return;

  // API calls — network only (don't cache now playing data)
  if (url.pathname.startsWith('/api')) return;

  // Static assets — stale-while-revalidate
  event.respondWith(
    caches.match(event.request).then((cached) => {
      const fetchPromise = fetch(event.request)
        .then((response) => {
          // Update cache with fresh response
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, clone);
            });
          }
          return response;
        })
        .catch(() => {
          // Network failed, return cached or offline page
          return cached || new Response(
            '<html><body style="background:#06060f;color:#f1f0f7;display:flex;align-items:center;justify-content:center;height:100vh;font-family:sans-serif"><div style="text-align:center"><h1>🧙‍♂️ WizardFM</h1><p>Sin conexión. Vuelve cuando tengas internet.</p></div></body></html>',
            { headers: { 'Content-Type': 'text/html' } }
          );
        });

      return cached || fetchPromise;
    })
  );
});

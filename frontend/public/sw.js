const CACHE_NAME = 'codesyne-v5';
const DYNAMIC_CACHE_NAME = 'codesyne-dynamic-v5';

const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/manifest.webmanifest',
  '/icon.svg',
  '/favicon.ico',
  '/favicon-32x32.png',
  '/favicon-16x16.png',
  '/apple-touch-icon.png',
  '/icon-192.png',
  '/icon-512.png',
  '/icon-maskable-192.png',
  '/icon-maskable-512.png'
];

function isImageReq(urlStr) {
  return /\.(png|jpg|jpeg|gif|svg|ico|webp)$/i.test(urlStr);
}

// Install Event - safe pre-caching with strict content-type validation
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      console.log('[PWA SW] Caching app shell assets (v4)');
      for (const asset of STATIC_ASSETS) {
        try {
          const res = await fetch(asset, { cache: 'reload' });
          if (res.ok && res.status === 200) {
            const contentType = res.headers.get('content-type') || '';
            if (isImageReq(asset) && !contentType.includes('image/')) {
              console.warn('[PWA SW] Skipped non-image response for asset:', asset);
              continue;
            }
            if (asset.endsWith('.json') && !contentType.includes('json') && !contentType.includes('text/')) {
              console.warn('[PWA SW] Skipped non-json response for asset:', asset);
              continue;
            }
            await cache.put(asset, res);
          }
        } catch (err) {
          console.warn('[PWA SW] Pre-cache asset skipped:', asset, err);
        }
      }
    })
  );
});

// Activate Event - clean up obsolete caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME && key !== DYNAMIC_CACHE_NAME) {
            console.log('[PWA SW] Removing stale cache:', key);
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch Event - network-first for API, cache-first for static assets
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Ignore non-http requests, socket.io, and websockets
  if (!request.url.startsWith('http') || request.url.includes('socket.io') || url.pathname.includes('/ws')) {
    return;
  }

  // API Calls: Network-First with fallback
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response && response.status === 200 && request.method === 'GET') {
            const copy = response.clone();
            caches.open(DYNAMIC_CACHE_NAME).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => {
          return caches.match(request).then((cached) => {
            if (cached) return cached;
            if (url.pathname.includes('/api/projects')) {
              return new Response(JSON.stringify([]), { headers: { 'Content-Type': 'application/json' } });
            }
            return new Response(JSON.stringify({ error: 'Offline' }), {
              status: 503,
              headers: { 'Content-Type': 'application/json' }
            });
          });
        })
    );
    return;
  }

  // Static assets: Cache-first with strict validation
  event.respondWith(
    caches.match(request).then(async (cachedResponse) => {
      if (cachedResponse) {
        const cachedType = cachedResponse.headers.get('content-type') || '';
        if (isImageReq(url.pathname) && cachedType.includes('text/html')) {
          console.warn('[PWA SW] Invalid cached HTML for image request, purging:', url.pathname);
          const cache = await caches.open(CACHE_NAME);
          await cache.delete(request);
          const dynCache = await caches.open(DYNAMIC_CACHE_NAME);
          await dynCache.delete(request);
        } else {
          return cachedResponse;
        }
      }

      return fetch(request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200 && request.method === 'GET') {
            const contentType = networkResponse.headers.get('content-type') || '';
            if (isImageReq(url.pathname) && !contentType.includes('image/')) {
              return networkResponse;
            }
            const copy = networkResponse.clone();
            caches.open(DYNAMIC_CACHE_NAME).then((cache) => cache.put(request, copy));
          }
          return networkResponse;
        })
        .catch(() => {
          if (request.mode === 'navigate' || url.pathname === '/' || url.pathname.endsWith('.html')) {
            return caches.match('/');
          }
        });
    })
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

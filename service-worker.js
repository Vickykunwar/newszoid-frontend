const CACHE_NAME = 'newszoid-v1';
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(['/', '/index.html', '/style.css', '/script.js']))
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    (async () => {
      // Delete old caches
      const cacheNames = await caches.keys();
      await Promise.all(
        cacheNames
          .filter(name => name !== CACHE_NAME)
          .map(name => caches.delete(name))
      );

      // Take control immediately
      await self.clients.claim();
    })()
  );
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // 1. NEWS API & DATA: Always Network-Only (Never cache)
  if (url.pathname.startsWith('/api') || url.hostname.includes('railway.app') || url.hostname.includes('newsapi.org')) {
    event.respondWith(
      fetch(event.request).catch(() => {
        return new Response(JSON.stringify({ ok: false, error: 'Offline' }), {
          headers: { 'Content-Type': 'application/json' }
        });
      })
    );
    return;
  }

  // 2. STATIC ASSETS: Network-First (Try network, fallback to cache)
  // This ensures users get updates immediately if online, but works offline.
  event.respondWith(
    fetch(event.request)
      .then(response => {
        // Update cache with fresh version
        const resClone = response.clone();
        caches.open(CACHE_NAME).then(cache => {
          cache.put(event.request, resClone);
        });
        return response;
      })
      .catch(() => {
        // If network fails, serve from cache
        return caches.match(event.request);
      })
  );
});

self.addEventListener('push', event => {
  const data = event.data ? event.data.json() : { title: 'Newszoid', body: 'New update' };
  const options = { body: data.body, icon: '/icons/icon-192.png', badge: '/icons/icon-192.png', data: data.url || '/' };
  event.waitUntil(self.registration.showNotification(data.title, options));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window' }).then(cList => {
      for (const c of cList) if (c.url === event.notification.data) return c.focus();
      return clients.openWindow(event.notification.data);
    })
  );
});

const OFFLINE_EDITION_CACHE = 'newszoid-offline-edition-v1';

self.addEventListener('message', async (event) => {
  if (event.data === 'download-today') {
    const urlsToCache = [
      '/', '/index.html', '/style.css', '/script.js',
      '/navigation-style.css', '/navigation-script.js'
    ];

    const cache = await caches.open(OFFLINE_EDITION_CACHE);

    await cache.addAll(urlsToCache);

    event.ports[0].postMessage({ status: 'success' });
  }
});



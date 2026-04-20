// Tandem GTD — Service Worker
// Vanilla JS, no Workbox dependency

const CACHE_VERSION = 'v10';
const STATIC_CACHE = `tandem-static-${CACHE_VERSION}`;
const DYNAMIC_CACHE = `tandem-dynamic-${CACHE_VERSION}`;

// Assets to pre-cache during install
const PRECACHE_ASSETS = [
  '/offline.html',
];

// File extensions that should use cache-first strategy
const STATIC_EXTENSIONS = [
  '.js',
  '.css',
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.svg',
  '.ico',
  '.woff',
  '.woff2',
  '.ttf',
  '.eot',
];

// ─── Install ──────────────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => cache.addAll(PRECACHE_ASSETS))
      .then(() => self.skipWaiting())
  );
});

// ─── Activate ─────────────────────────────────────────────
// Clean up old caches when a new version activates
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter(
              (key) => key !== STATIC_CACHE && key !== DYNAMIC_CACHE
            )
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

// ─── Fetch ────────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Only handle same-origin requests
  if (url.origin !== self.location.origin) return;

  // Skip non-GET requests
  if (request.method !== 'GET') return;

  // Determine strategy based on request type
  if (isNextJsChunk(url.pathname)) {
    // Next.js static assets are content-hashed (immutable) in production.
    // Cache-first gives instant loads; the URL changes when content changes,
    // so stale responses are impossible. (SW is unregistered in dev mode
    // by ServiceWorkerRegistration.tsx, so dev chunk reuse isn't a concern.)
    event.respondWith(cacheFirst(request));
  } else if (isStaticAsset(url.pathname)) {
    event.respondWith(cacheFirst(request));
  } else {
    event.respondWith(networkFirst(request));
  }
});

// ─── Strategies ───────────────────────────────────────────

/**
 * Cache-first: check cache, fall back to network.
 * Used for immutable static assets (images, fonts).
 */
async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(STATIC_CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    // Static asset not available offline — return basic 404-style response
    return new Response('', { status: 408, statusText: 'Offline' });
  }
}

/**
 * Network-first: try network, fall back to cache, then offline page.
 * Used for HTML pages and API routes.
 */
async function networkFirst(request) {
  try {
    const response = await fetch(request);
    // Cache successful HTML responses for offline use
    if (response.ok && request.headers.get('accept')?.includes('text/html')) {
      const cache = await caches.open(DYNAMIC_CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    // Network failed — try cache
    const cached = await caches.match(request);
    if (cached) return cached;

    // If it was a navigation request, show the offline page
    if (request.mode === 'navigate') {
      return caches.match('/offline.html');
    }

    return new Response('', { status: 408, statusText: 'Offline' });
  }
}

// ─── Helpers ──────────────────────────────────────────────

function isNextJsChunk(pathname) {
  return pathname.startsWith('/_next/static/');
}

function isStaticAsset(pathname) {
  // Files with known static extensions (images, fonts, etc.)
  return STATIC_EXTENSIONS.some((ext) => pathname.endsWith(ext));
}

// ─── Push ────────────────────────────────────────────────
self.addEventListener('push', (event) => {
  if (!event.data) return;

  const data = event.data.json();
  const options = {
    body: data.body || '',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-72.png',
    tag: data.tag || 'tandem-notification',
    renotify: !!data.renotify,
    data: {
      url: data.url || '/do-now',
    },
  };

  event.waitUntil(
    self.registration.showNotification(data.title || 'Tandem', options)
  );
});

// ─── Notification Click ──────────────────────────────────
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const targetUrl = event.notification.data?.url || '/do-now';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (new URL(client.url).origin === self.location.origin) {
          client.navigate(targetUrl);
          return client.focus();
        }
      }
      return clients.openWindow(targetUrl);
    })
  );
});

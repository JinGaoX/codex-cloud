/* Generated for the static iPhone app. No API, proxy or media response is stored. */
const BUILD = '__LIBRETV_STANDALONE_BUILD__';
const PRECACHE = /*__LIBRETV_STANDALONE_PRECACHE__*/ [];
const ROUTES = /*__LIBRETV_STANDALONE_ROUTES__*/ {};
const CACHE_PREFIX = 'libretv-standalone-shell-';
const CACHE_NAME = `${CACHE_PREFIX}${BUILD}`;
const FILES = new Set(PRECACHE.map((entry) => entry.url));

async function hasExpectedBytes(response, expected) {
  if (!response.ok || response.redirected || response.type === 'opaque') return false;
  const bytes = await response.clone().arrayBuffer();
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  const actual = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  return actual === expected;
}

self.addEventListener('install', (event) => {
  // A partially downloaded app must never replace a complete older version.
  event.waitUntil((async () => {
    if (PRECACHE.length === 0 || !ROUTES['/']) throw new Error('Standalone build has not been prepared');
    try {
      const cache = await caches.open(CACHE_NAME);
      for (const entry of PRECACHE) {
        const response = await fetch(entry.url, { cache: 'reload', credentials: 'same-origin', redirect: 'error' });
        // This also rejects a private hosting login page returned with HTTP 200.
        if (!(await hasExpectedBytes(response, entry.sha256))) throw new Error(`App resource is unavailable: ${entry.url}`);
        await cache.put(entry.url, response);
      }
    } catch (error) {
      await caches.delete(CACHE_NAME);
      throw error;
    }
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const versions = (await caches.keys()).filter((name) => name.startsWith(CACHE_PREFIX));
    // Keep the immediately previous build's immutable chunks for already-open players.
    const older = versions.filter((name) => name !== CACHE_NAME);
    await Promise.all(older.slice(0, Math.max(0, older.length - 1)).map((name) => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'ACTIVATE_UPDATE') self.skipWaiting();
});

function routeEntry(pathname) {
  const normalized = pathname.replace(/\/+$/, '') || '/';
  return ROUTES[normalized];
}

async function shellResponse(key, rsc) {
  const cache = await caches.open(CACHE_NAME);
  const response = await cache.match(key);
  if (!response) return new Response('本机应用资源已被系统清理，请联网重新打开应用。', {
    status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
  if (!rsc) return response;
  // Next's client router may fetch a route with an RSC header instead of its exported .txt URL.
  const headers = new Headers(response.headers);
  headers.set('Content-Type', 'text/x-component');
  return new Response(response.body, { status: response.status, headers });
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/') || request.headers.has('range')) return;

  const route = routeEntry(url.pathname);
  const rsc = request.headers.get('rsc') === '1';
  if (rsc && route?.rsc) {
    event.respondWith(shellResponse(route.rsc, true));
    return;
  }
  if (request.mode === 'navigate') {
    // The original navigation URL and query remain in the address bar; only the static shell is reused.
    const page = route?.html || (FILES.has(url.pathname) && url.pathname.endsWith('.html') ? url.pathname : null);
    if (page) event.respondWith(shellResponse(page, false));
    return;
  }
  const previousBuildAsset = /^\/_next\/static\/.*\.(?:js|css|woff2?|ttf)$/.test(url.pathname);
  if (!FILES.has(url.pathname) && !previousBuildAsset) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(url.pathname);
    if (cached) return cached;
    // This version's immutable asset may belong to the previously open app generation.
    // No new responses are written at runtime, so URLs with private query data never become cache keys.
    const older = await caches.match(url.pathname);
    if (older) return older;
    return fetch(request);
  })());
});

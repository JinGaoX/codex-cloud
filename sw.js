/* LibreTV PWA: intentionally excludes API, HTML/RSC, auth, posters and video data. */
const CACHE_PREFIX = 'libretv-pwa-assets-';
const CACHE_NAME = `${CACHE_PREFIX}v1`;
const OFFLINE_URL = '/offline.html';
const MAX_ASSETS = 100;

self.addEventListener('install', (event) => {
  // Keep the active player on its current version until the user chooses to update.
  event.waitUntil((async () => {
    const response = await fetch(OFFLINE_URL, { cache: 'reload' });
    // Private hosting can redirect to its login gateway. Never cache that document as our offline page.
    if (!response.ok || response.redirected || !(await response.clone().text()).includes('<meta name="libretv-offline" content="1">')) {
      throw new Error('Offline document is unavailable');
    }
    const cache = await caches.open(CACHE_NAME);
    await cache.put(OFFLINE_URL, response);
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names
      .filter((name) => name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME)
      .map((name) => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'ACTIVATE_UPDATE') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;
  if (request.headers.has('range') || request.headers.has('rsc') || url.searchParams.has('_rsc')) return;
  // Never store personalized documents, App Router payloads, or signed API/video URLs.
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(async () => {
      return (await caches.match(OFFLINE_URL)) || new Response('网络不可用，请联网后重试。', {
        status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      });
    }));
    return;
  }
  const staticAsset = url.pathname.startsWith('/_next/static/');
  const publicIcon = /^\/icons\/[^/]+\.(?:png|svg|ico)$/.test(url.pathname) || url.pathname === '/favicon.ico';
  if (!staticAsset && !publicIcon) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(request);
    if (cached) return cached;
    const response = await fetch(request);
    if (response.ok && response.type === 'basic' && !response.redirected && !response.headers.has('set-cookie')) {
      try {
        await cache.put(request, response.clone());
        // Bound old build chunks on devices with limited storage; never evict the offline document.
        const keys = (await cache.keys()).filter((key) => new URL(key.url).pathname !== OFFLINE_URL);
        await Promise.all(keys.slice(0, Math.max(0, keys.length - MAX_ASSETS)).map((key) => cache.delete(key)));
      } catch {
        // Storage quota or private browsing must not turn a successful asset fetch into a white screen.
      }
    }
    return response;
  })());
});

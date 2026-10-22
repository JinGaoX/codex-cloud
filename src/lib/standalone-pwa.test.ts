import { createHash, webcrypto } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { runInNewContext } from 'node:vm';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { describe, expect, it, vi } from 'vitest';
import { standaloneCacheVersion } from '../../scripts/prepare-standalone-pwa.mjs';

const hash = (body: string) => createHash('sha256').update(body).digest('hex');
const shell = '<html><body>offline app shell</body></html>';
const shellRoute = { '/': { html: '/index.html', rsc: '/index.txt' }, '/watch': { html: '/watch.html', rsc: '/watch.txt' } };
const precache = [
  { url: '/index.html', sha256: hash(shell) },
  { url: '/watch.html', sha256: hash(shell) },
  { url: '/watch.txt', sha256: hash('static-rsc') },
  { url: '/_next/static/app.js', sha256: hash('compiled') },
];

function resourceResponse(body: string, url: string, redirected = false) {
  const response = new Response(body);
  Object.defineProperties(response, { url: { value: url }, redirected: { value: redirected } });
  return response;
}

function worker(origin = 'https://app.example.test') {
  const listeners = new Map<string, (event: Record<string, unknown>) => void>();
  const cache = {
    match: vi.fn(async (key: string) => key.endsWith('.txt') ? new Response('static-rsc') : new Response(shell)),
    put: vi.fn().mockResolvedValue(undefined),
  };
  const caches = {
    open: vi.fn().mockResolvedValue(cache),
    match: vi.fn().mockResolvedValue(undefined),
    keys: vi.fn().mockResolvedValue(['libretv-standalone-shell-old-1', 'libretv-standalone-shell-old-2', 'unrelated-user-cache', 'libretv-standalone-shell-test-build']),
    delete: vi.fn().mockResolvedValue(true),
  };
  const fetch = vi.fn(async (key: string, _options?: RequestInit) => {
    void _options;
    const content = key.endsWith('.js') ? 'compiled' : key.endsWith('.txt') ? 'static-rsc' : shell;
    return resourceResponse(content, new URL(key, origin).href);
  });
  const skipWaiting = vi.fn();
  const claim = vi.fn().mockResolvedValue(undefined);
  const source = readFileSync(resolve(process.cwd(), 'public/sw-standalone.js'), 'utf8')
    .replace('__LIBRETV_STANDALONE_BUILD__', 'test-build')
    .replace('/*__LIBRETV_STANDALONE_PRECACHE__*/ []', JSON.stringify(precache))
    .replace('/*__LIBRETV_STANDALONE_ROUTES__*/ {}', JSON.stringify(shellRoute));
  runInNewContext(source, {
    URL, Response, Headers, Uint8Array, crypto: webcrypto, caches, fetch,
    self: { location: { origin }, clients: { claim }, skipWaiting,
      addEventListener: (name: string, listener: (event: Record<string, unknown>) => void) => listeners.set(name, listener) },
  });
  const request = (url: string, options: { mode?: string; method?: string; headers?: Record<string, string> } = {}) => {
    const respondWith = vi.fn();
    listeners.get('fetch')!({ request: { url: new URL(url, origin).href,
      method: options.method || 'GET', mode: options.mode, headers: new Headers(options.headers) }, respondWith });
    return respondWith;
  };
  const event = async (name: string) => {
    const waitUntil = vi.fn();
    listeners.get(name)!({ waitUntil });
    return waitUntil.mock.calls[0][0] as Promise<void>;
  };
  return { listeners, cache, caches, fetch, skipWaiting, claim, request, event };
}

describe('standalone PWA complete app cache', () => {
  it('saves every exact app resource before the worker can activate', async () => {
    const w = worker();
    await w.event('install');
    expect(w.cache.put.mock.calls.map(([key]) => key)).toEqual(precache.map((entry) => entry.url));
    expect(w.skipWaiting).not.toHaveBeenCalled();
  });

  it('rejects a HTTP 200 login gateway and removes the incomplete new cache', async () => {
    const w = worker();
    w.fetch.mockResolvedValue(new Response('<html>hosting sign in</html>'));
    await expect(w.event('install')).rejects.toThrow('App resource is unavailable');
    expect(w.caches.delete).toHaveBeenCalledWith('libretv-standalone-shell-test-build');
    expect(w.cache.put).not.toHaveBeenCalled();
  });

  it('accepts actual same-origin HTTP canonical redirects and caches the original app keys', async () => {
    const server = createServer((req, res) => {
      if (req.url === '/index.html' || req.url === '/watch.html') {
        res.writeHead(req.url === '/index.html' ? 302 : 307, {
          Location: req.url === '/index.html' ? '/' : '/watch',
        });
        res.end();
        return;
      }
      res.writeHead(200);
      res.end(req.url?.endsWith('.js') ? 'compiled' : req.url?.endsWith('.txt') ? 'static-rsc' : shell);
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const w = worker(origin);
    w.fetch.mockImplementation((key, options) => fetch(new URL(key, origin), options));
    try {
      await w.event('install');
      expect(w.cache.put.mock.calls.map(([key]) => key)).toEqual(precache.map((entry) => entry.url));
      const response = w.cache.put.mock.calls[0][1] as Response;
      const fetched = await w.fetch.mock.results[0].value as Response;
      expect(fetched.redirected).toBe(true);
      expect(fetched.url).toBe(`${origin}/`);
      expect(response.redirected).toBe(false);
      expect(await response.text()).toBe(shell);
      expect(w.fetch.mock.calls[0][1]?.redirect).toBe('follow');
    } finally {
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    }
  });

  it('rejects a same-origin redirected login page whose bytes do not match the exported shell', async () => {
    const w = worker();
    w.fetch.mockResolvedValue(resourceResponse('<html>hosting sign in</html>', 'https://app.example.test/sign-in', true));
    await expect(w.event('install')).rejects.toThrow('App resource is unavailable');
    expect(w.cache.put).not.toHaveBeenCalled();
    expect(w.caches.delete).toHaveBeenCalledWith('libretv-standalone-shell-test-build');
  });

  it('rejects an off-site final response even when its bytes exactly match', async () => {
    const w = worker();
    w.fetch.mockResolvedValue(resourceResponse(shell, 'https://external.example.test/', true));
    await expect(w.event('install')).rejects.toThrow('App resource is unavailable');
    expect(w.cache.put).not.toHaveBeenCalled();
    expect(w.caches.delete).toHaveBeenCalledWith('libretv-standalone-shell-test-build');
  });

  it('rejects interrupted downloads, leaving the previous complete cache untouched', async () => {
    const w = worker();
    w.fetch.mockRejectedValueOnce(new TypeError('connection lost'));
    await expect(w.event('install')).rejects.toThrow('connection lost');
    expect(w.caches.delete.mock.calls).toEqual([['libretv-standalone-shell-test-build']]);
  });

  it('does not claim offline readiness after a quota error', async () => {
    const w = worker();
    w.cache.put.mockRejectedValueOnce(new DOMException('full', 'QuotaExceededError'));
    await expect(w.event('install')).rejects.toThrow('full');
    expect(w.claim).not.toHaveBeenCalled();
    expect(w.caches.delete).toHaveBeenCalledWith('libretv-standalone-shell-test-build');
  });

  it('serves the offline home shell without caching search query strings', async () => {
    const w = worker();
    const response = await w.request('/?s=private-user-query', { mode: 'navigate' }).mock.calls[0][0] as Response;
    expect(await response.text()).toBe(shell);
    expect(w.cache.match).toHaveBeenCalledWith('/index.html');
    expect(w.fetch).not.toHaveBeenCalled();
    expect(w.cache.put).not.toHaveBeenCalled();
  });

  it('opens watch offline using its page shell while the browser retains its query', async () => {
    const w = worker();
    await w.request('/watch/?source=x&id=private', { mode: 'navigate' }).mock.calls[0][0];
    expect(w.cache.match).toHaveBeenCalledWith('/watch.html');
    expect(w.cache.put).not.toHaveBeenCalled();
  });

  it('serves the statically generated RSC payload for a client route transition', async () => {
    const w = worker();
    const response = await w.request('/watch?_rsc=random', { headers: { rsc: '1' } }).mock.calls[0][0] as Response;
    expect(await response.text()).toBe('static-rsc');
    expect(response.headers.get('content-type')).toBe('text/x-component');
    expect(w.cache.match).toHaveBeenCalledWith('/watch.txt');
  });

  it.each([
    '/api/search', '/api/proxy?url=private', '/video.mp4', '/playlist.m3u8', '/segment.ts',
    'https://source.example.test/api.php/provide/vod?wd=private',
  ])('leaves API and media requests entirely outside app caching: %s', (url) => {
    const w = worker();
    expect(w.request(url)).not.toHaveBeenCalled();
    expect(w.fetch).not.toHaveBeenCalled();
  });

  it('does not intercept range requests or writes even to an app URL', () => {
    const w = worker();
    expect(w.request('/index.html', { headers: { range: 'bytes=0-1' } })).not.toHaveBeenCalled();
    expect(w.request('/index.html', { method: 'POST' })).not.toHaveBeenCalled();
  });

  it('can read the previous build immutable chunk without storing a new runtime response', async () => {
    const w = worker();
    w.cache.match.mockResolvedValueOnce(undefined as never);
    const previous = new Response('old compiled chunk');
    w.caches.match.mockResolvedValueOnce(previous as never);
    const response = await w.request('/_next/static/previous.js').mock.calls[0][0] as Response;
    expect(response).toBe(previous);
    expect(w.fetch).not.toHaveBeenCalled();
    expect(w.cache.put).not.toHaveBeenCalled();
  });

  it('keeps only the previous immutable build, leaving unrelated caches alone', async () => {
    const w = worker();
    await w.event('activate');
    expect(w.caches.delete.mock.calls).toEqual([['libretv-standalone-shell-old-1']]);
    expect(w.claim).toHaveBeenCalledOnce();
  });

  it('does not silently return another page when the system evicted this app shell', async () => {
    const w = worker();
    w.cache.match.mockResolvedValueOnce(undefined as never);
    const response = await w.request('/', { mode: 'navigate' }).mock.calls[0][0] as Response;
    expect(response.status).toBe(503);
    expect(await response.text()).toContain('资源已被系统清理');
  });

  it('activates an update only on an explicit message', () => {
    const w = worker();
    w.listeners.get('message')!({ data: { type: 'something-else' } });
    expect(w.skipWaiting).not.toHaveBeenCalled();
    w.listeners.get('message')!({ data: { type: 'ACTIVATE_UPDATE' } });
    expect(w.skipWaiting).toHaveBeenCalledOnce();
  });
});

describe('standalone post-export preparation', () => {
  it('isolates a worker-only change into a new cache version even if app resources did not change', () => {
    const before = standaloneCacheVersion(precache, shellRoute, 'worker code version one');
    const after = standaloneCacheVersion(precache, shellRoute, 'worker code version two');
    expect(before).not.toBe(after);
    expect(standaloneCacheVersion(precache, shellRoute, 'worker code version one')).toBe(before);
  });

  it('includes generated page, RSC and JS files but excludes API/media/source archives', () => {
    const directory = mkdtempSync(join(tmpdir(), 'libretv-pwa-'));
    try {
      for (const [name, content] of Object.entries({
        'index.html': shell, 'index.txt': 'rsc', 'watch/index.html': shell, 'watch/index.txt': 'watch-rsc',
        '_next/static/chunk.js': 'js', '_next/static/chunk.js.map': '{}',
        'icons/icon-192.png': 'icon', 'api/status.txt': 'private', 'fixture.mp4': 'media', 'source-code.tar.gz': 'source',
      })) {
        mkdirSync(resolve(directory, name, '..'), { recursive: true });
        writeFileSync(join(directory, name), content);
      }
      execFileSync(process.execPath, ['scripts/prepare-standalone-pwa.mjs', directory], { cwd: process.cwd() });
      const generated = readFileSync(join(directory, 'sw-standalone.js'), 'utf8');
      expect(generated).toContain('"/watch":{"html":"/watch/index.html","rsc":"/watch/index.txt"}');
      expect(generated).toContain('"url":"/_next/static/chunk.js"');
      expect(generated).not.toContain('"url":"/api/status.txt"');
      expect(generated).not.toContain('"url":"/fixture.mp4"');
      expect(generated).not.toContain('"url":"/source-code.tar.gz"');
      expect(generated).not.toContain('"url":"/_next/static/chunk.js.map"');
      expect(generated).not.toContain('__LIBRETV_STANDALONE_BUILD__');
    } finally { rmSync(directory, { recursive: true, force: true }); }
  });
});

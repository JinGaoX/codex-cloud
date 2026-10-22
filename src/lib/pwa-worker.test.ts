import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';

function worker() {
  const listeners = new Map<string, (event: Record<string, unknown>) => void>();
  const offline = new Response('offline explanation');
  const cache = {
    add: vi.fn().mockResolvedValue(undefined),
    match: vi.fn().mockResolvedValue(undefined),
    put: vi.fn().mockResolvedValue(undefined),
    keys: vi.fn().mockResolvedValue([]),
    delete: vi.fn().mockResolvedValue(true),
  };
  const caches = {
    open: vi.fn().mockResolvedValue(cache),
    match: vi.fn().mockResolvedValue(offline),
    keys: vi.fn().mockResolvedValue([]),
    delete: vi.fn().mockResolvedValue(true),
  };
  const fetch = vi.fn().mockResolvedValue(new Response('network result'));
  const skipWaiting = vi.fn();
  runInNewContext(readFileSync(resolve(process.cwd(), 'public/sw.js'), 'utf8'), {
    URL, Response, caches, fetch,
    self: {
      location: { origin: 'https://app.example.test' },
      clients: { claim: vi.fn().mockResolvedValue(undefined) },
      skipWaiting,
      addEventListener: (name: string, fn: (event: Record<string, unknown>) => void) => listeners.set(name, fn),
    },
  });
  const request = (path: string, options: { mode?: string; method?: string; headers?: Record<string, string> } = {}) => {
    const respondWith = vi.fn();
    listeners.get('fetch')!({
      request: { url: new URL(path, 'https://app.example.test').href, method: 'GET', headers: new Headers(), ...options,
        ...(options.headers ? { headers: new Headers(options.headers) } : {}) },
      respondWith,
    });
    return respondWith;
  };
  return { listeners, cache, caches, fetch, skipWaiting, request, offline };
}

describe('PWA service worker safety boundary', () => {
  it.each([
    '/api/auth', '/api/search', '/api/proxy?url=signed-private-url',
    '/watch?_rsc=payload', '/poster.jpg', '/media/clip.mp4', '/playlist.m3u8',
    'https://media.example.test/segment.ts',
  ])('does not intercept private or media requests: %s', (url) => {
    const w = worker();
    expect(w.request(url)).not.toHaveBeenCalled();
    expect(w.fetch).not.toHaveBeenCalled();
  });

  it('never intercepts RSC payloads, range requests or POSTs', () => {
    const w = worker();
    expect(w.request('/_next/static/app.js', { headers: { rsc: '1' } })).not.toHaveBeenCalled();
    expect(w.request('/_next/static/app.js', { headers: { range: 'bytes=0-100' } })).not.toHaveBeenCalled();
    expect(w.request('/_next/static/app.js', { method: 'POST' })).not.toHaveBeenCalled();
  });

  it('passes authenticated navigation responses through without storing a document', async () => {
    const w = worker();
    const authResponse = new Response('login required', { status: 401 });
    w.fetch.mockResolvedValue(authResponse);
    const respond = w.request('/watch', { mode: 'navigate' });
    expect(await respond.mock.calls[0][0]).toBe(authResponse);
    expect(w.cache.put).not.toHaveBeenCalled();
  });

  it('shows an offline explanation when a document network request fails', async () => {
    const w = worker();
    w.fetch.mockRejectedValue(new TypeError('offline'));
    const respond = w.request('/', { mode: 'navigate' });
    expect(await respond.mock.calls[0][0]).toBe(w.offline);
    expect(w.caches.match).toHaveBeenCalledWith('/offline.html');
    expect(w.cache.put).not.toHaveBeenCalled();
  });

  it('still returns a successful JS asset when storage is full', async () => {
    const w = worker();
    const response = new Response('compiled application');
    Object.defineProperty(response, 'type', { value: 'basic' });
    w.fetch.mockResolvedValue(response);
    w.cache.put.mockRejectedValue(new DOMException('full', 'QuotaExceededError'));
    const respond = w.request('/_next/static/chunks/app.js');
    expect(await respond.mock.calls[0][0]).toBe(response);
  });

  it('keeps a waiting update inactive until explicitly requested', async () => {
    const w = worker();
    w.fetch.mockResolvedValue(new Response('<meta name="libretv-offline" content="1">'));
    const waitUntil = vi.fn();
    w.listeners.get('install')!({ waitUntil });
    await waitUntil.mock.calls[0][0];
    expect(w.skipWaiting).not.toHaveBeenCalled();
    w.listeners.get('message')!({ data: { type: 'ACTIVATE_UPDATE' } });
    expect(w.skipWaiting).toHaveBeenCalledOnce();
  });

  it('rejects a hosting login gateway instead of caching it as the offline document', async () => {
    const w = worker();
    w.fetch.mockResolvedValue(new Response('<html>private hosting login gateway</html>'));
    const waitUntil = vi.fn();
    w.listeners.get('install')!({ waitUntil });
    await expect(waitUntil.mock.calls[0][0]).rejects.toThrow('Offline document is unavailable');
    expect(w.cache.put).not.toHaveBeenCalled();
  });
});

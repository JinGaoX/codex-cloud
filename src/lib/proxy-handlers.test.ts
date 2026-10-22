import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./api-guard', () => ({ guardRequest: vi.fn(() => null), jsonError: vi.fn() }));
vi.mock('./ssrf', () => ({
  isValidProxyUrl: vi.fn(() => true),
  isBlockedByDNS: vi.fn(async () => false),
  checkLiveUrlAllowed: vi.fn(async () => ({ ok: true })),
}));
vi.mock('./fetch-utils', () => ({ fetchWithSafeRedirects: vi.fn() }));

import { guardRequest } from './api-guard';
import { fetchWithSafeRedirects } from './fetch-utils';
import { handleProxyRequest } from './proxy-handlers';

const target = 'https://media.example.org/movie.mp4';
const request = (headers?: HeadersInit) => new Request('https://app.example.org/api/proxy', { headers });

describe('点播代理的流式播放', () => {
  beforeEach(() => { vi.clearAllMocks(); });
  afterEach(() => { vi.useRealTimers(); });

  it('限制响应头等待而非完整视频传输时间，并传递客户端取消信号', async () => {
    vi.useFakeTimers();
    const req = request();
    let upstreamSignal: AbortSignal | null | undefined;
    vi.mocked(fetchWithSafeRedirects).mockImplementation(async (_url, init) => {
      upstreamSignal = init?.signal;
      return {
        res: new Response(new ReadableStream({
          start(controller) {
            setTimeout(() => {
              if (upstreamSignal?.aborted) controller.error(new Error('传输被超时切断'));
              else { controller.enqueue(new TextEncoder().encode('video')); controller.close(); }
            }, 20_000);
          },
        }), { headers: { 'content-type': 'video/mp4' } }),
        finalUrl: target,
      };
    });
    const res = await handleProxyRequest(req, target);
    expect(fetchWithSafeRedirects).toHaveBeenCalledWith(target,
      expect.objectContaining({ signal: req.signal }), { headerTimeoutMs: 8000 });
    const body = res.text();
    await vi.advanceTimersByTimeAsync(20_000);
    expect(await body).toBe('video');
    expect(res.headers.get('cache-control')).toBe('private, no-store');
  });

  it('透传 Safari MP4 Range 与 206、Content-Range、未压缩长度', async () => {
    vi.mocked(fetchWithSafeRedirects).mockResolvedValue({
      res: new Response('ab', { status: 206, headers: {
        'content-type': 'video/mp4', 'content-range': 'bytes 0-1/100',
        'accept-ranges': 'bytes', 'content-length': '2',
      } }), finalUrl: target,
    });
    const res = await handleProxyRequest(request({ Range: 'bytes=0-1' }), target);
    expect(fetchWithSafeRedirects).toHaveBeenCalledWith(target,
      expect.objectContaining({ headers: expect.objectContaining({ Range: 'bytes=0-1' }) }),
      expect.anything());
    expect(res.status).toBe(206);
    expect(res.headers.get('content-range')).toBe('bytes 0-1/100');
    expect(res.headers.get('content-length')).toBe('2');
    expect(await res.text()).toBe('ab');
  });

  it('自动解压后不透传上游的压缩实体长度', async () => {
    vi.mocked(fetchWithSafeRedirects).mockResolvedValue({
      res: new Response('decoded', { headers: {
        'content-type': 'video/mp4', 'content-encoding': 'gzip', 'content-length': '100',
      } }), finalUrl: target,
    });
    const res = await handleProxyRequest(request(), target);
    expect(res.headers.has('content-length')).toBe(false);
    expect(res.headers.has('content-encoding')).toBe(false);
  });

  it('带签名查询的 m3u8 在 MIME 不规范时也重写，使用重定向后的相对路径', async () => {
    const playlist = 'https://media.example.org/master.m3u8?token=test-only';
    vi.mocked(fetchWithSafeRedirects).mockResolvedValue({
      res: new Response('#EXTM3U\n#EXTINF:5,\npart.ts\n', {
        headers: { 'content-type': 'application/octet-stream' },
      }), finalUrl: 'https://cdn.example.org/path/master.m3u8?token=test-only',
    });
    const res = await handleProxyRequest(request(), playlist);
    expect(res.headers.get('content-type')).toBe('application/vnd.apple.mpegurl');
    expect(decodeURIComponent(await res.text())).toContain('https://cdn.example.org/path/part.ts');
    expect(res.headers.get('cache-control')).toBe('private, no-store');
  });

  it('媒体请求在未登录时返回鉴权响应，不向上游发送请求', async () => {
    vi.mocked(guardRequest).mockReturnValueOnce(new Response('未登录', { status: 401 }) as ReturnType<typeof guardRequest>);
    const res = await handleProxyRequest(request(), target);
    expect(res.status).toBe(401);
    expect(fetchWithSafeRedirects).not.toHaveBeenCalled();
  });
});

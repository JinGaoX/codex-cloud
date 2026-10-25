import { afterEach, describe, expect, it, vi } from 'vitest';
import { bestPlaylistResolution, PREVIEW_MEDIA_PREFIX_BYTES, probePreviewResolution } from './preview-resolution';

const encode = (text: string) => new TextEncoder().encode(text);
const master = '#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1000000,RESOLUTION=1280x720\n720.m3u8\n#EXT-X-STREAM-INF:BANDWIDTH=4000000,RESOLUTION=1920x1080\n1080.m3u8\n';
function mp4(width: number, height: number): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(52);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, 12);
  bytes.set(encode('ftyp'), 4);
  view.setUint32(12, 40);
  bytes.set(encode('avc1'), 16);
  view.setUint16(44, width);
  view.setUint16(46, height);
  return bytes;
}

afterEach(() => vi.unstubAllGlobals());

describe('preview exact dimensions', () => {
  it('reads full dimensions and preserves portrait width/height without short-edge swapping', () => {
    expect(bestPlaylistResolution(master)).toEqual({ width: 1920, height: 1080, uri: '1080.m3u8' });
    expect(bestPlaylistResolution('#EXTM3U\n#EXT-X-STREAM-INF:RESOLUTION=720x1280,BANDWIDTH=1\nx.m3u8')).toEqual({ width: 720, height: 1280, uri: 'x.m3u8' });
  });
  it('never fabricates a width from bitrate or an incomplete variant', () => {
    expect(bestPlaylistResolution('#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=6000000\nx.m3u8')).toBeUndefined();
    expect(bestPlaylistResolution('#EXT-X-STREAM-INF:RESOLUTION=1920x1080')).toBeUndefined();
  });
  it('master declaration is one small request, without fetching a variant or media', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(master));
    vi.stubGlobal('fetch', fetcher);
    expect(await probePreviewResolution('https://media.example/master.m3u8')).toEqual({ width: 1920, height: 1080 });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0][1]).toMatchObject({ credentials: 'omit', cache: 'no-store', referrerPolicy: 'no-referrer' });
  });
  it('reads an fMP4 init prefix rather than a video segment', async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response('#EXTM3U\n#EXT-X-MAP:URI="init.mp4"\n#EXTINF:10,\nseg1.m4s'))
      .mockResolvedValueOnce(new Response(mp4(320, 180)));
    vi.stubGlobal('fetch', fetcher);
    expect(await probePreviewResolution('https://media.example/show/index.m3u8')).toEqual({ width: 320, height: 180 });
    expect(fetcher.mock.calls[1][0]).toBe('https://media.example/show/init.mp4');
    expect(fetcher.mock.calls[1][1].headers).toEqual({ Range: `bytes=0-${PREVIEW_MEDIA_PREFIX_BYTES - 1}` });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it('resolves redirected playlists against their final HTTPS location', async () => {
    const playlist = new Response('#EXTM3U\n#EXT-X-MAP:URI="init.mp4"\n#EXTINF:10,\nseg.m4s');
    Object.defineProperty(playlist, 'url', { value: 'https://cdn.example/moved/show/list.m3u8' });
    const fetcher = vi.fn().mockResolvedValueOnce(playlist).mockResolvedValueOnce(new Response(mp4(320, 180)));
    vi.stubGlobal('fetch', fetcher);
    expect(await probePreviewResolution('https://media.example/entry.m3u8')).toEqual({ width: 320, height: 180 });
    expect(fetcher.mock.calls[1][0]).toBe('https://cdn.example/moved/show/init.mp4');
  });
  it('cancels an oversized body even when Range is ignored', async () => {
    const cancel = vi.fn();
    const bytes = new Uint8Array(PREVIEW_MEDIA_PREFIX_BYTES * 3);
    bytes.set(mp4(1920, 1080));
    const stream = new ReadableStream({ start(controller) { controller.enqueue(bytes); }, cancel });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(stream)));
    expect(await probePreviewResolution('https://media.example/film.mp4')).toEqual({ width: 1920, height: 1080 });
    expect(cancel).toHaveBeenCalledTimes(1);
  });
  it('encrypted playlists do not trigger segment or key downloads', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response('#EXTM3U\n#EXT-X-KEY:METHOD=AES-128,URI="key"\n#EXTINF:10,\nseg.ts'));
    vi.stubGlobal('fetch', fetcher);
    expect(await probePreviewResolution('https://media.example/index.m3u8')).toBeUndefined();
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('unknown/CORS errors do not make an otherwise playable source fail', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    expect(await probePreviewResolution('https://media.example/index.m3u8')).toBeUndefined();
  });
  it('refuses HTTP nested media and non-playlist pages', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response('#EXTM3U\n#EXTINF:10,\nhttp://media.example/seg.ts'));
    vi.stubGlobal('fetch', fetcher);
    expect(await probePreviewResolution('https://media.example/index.m3u8')).toBeUndefined();
    expect(fetcher).toHaveBeenCalledTimes(1);
    fetcher.mockResolvedValueOnce(new Response('<html>blocked</html>'));
    expect(await probePreviewResolution('https://media.example/index.m3u8')).toBeUndefined();
  });
  it('propagates a user cancellation without persisting a false result', async () => {
    const controller = new AbortController();
    controller.abort();
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new DOMException('abort', 'AbortError')));
    await expect(probePreviewResolution('https://media.example/index.m3u8', controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
  });
});

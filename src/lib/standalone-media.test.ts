import { describe, expect, it } from 'vitest';
import { DIRECT_MEDIA_SOURCE, directMediaWatchUrl, standaloneImageCandidates, standaloneMediaUrl } from './standalone-media';

describe('independent media entry', () => {
  it('preserves signed HTTPS media URLs without inventing a proxy', () => {
    expect(standaloneMediaUrl('  https://media.example.org/movie.m3u8?token=fixture  '))
      .toBe('https://media.example.org/movie.m3u8?token=fixture');
  });
  it.each(['http://media.example.org/a.mp4', '/api/proxy?url=x', 'javascript:alert(1)', 'file:///a.mp4',
    'https://user:password@media.example.org/a.mp4', 'not a URL'])('rejects unsupported or credential-bearing link: %s', (url) => {
    expect(() => standaloneMediaUrl(url)).toThrow(/HTTPS/);
  });
  it('keeps direct link identity and replay URL for local history and progress', () => {
    const link = 'https://media.example.org/movie.mp4?signature=fixture';
    const watch = new URL(directMediaWatchUrl(link, '我的视频'), 'https://app.example.org');
    expect(watch.pathname).toBe('/watch');
    expect(watch.searchParams.get('source')).toBe(DIRECT_MEDIA_SOURCE);
    expect(watch.searchParams.get('id')).toBe(link);
    expect(watch.searchParams.get('url')).toBe(link);
    expect(watch.searchParams.get('title')).toBe('我的视频');
  });
  it('does not produce an image proxy or mirror fallback even for old settings', () => {
    expect(standaloneImageCandidates('https://img1.doubanio.com/poster.jpg'))
      .toEqual(['https://img1.doubanio.com/poster.jpg']);
    expect(standaloneImageCandidates('/api/proxy?url=private')).toEqual([]);
    expect(standaloneImageCandidates(undefined)).toEqual([]);
  });
});

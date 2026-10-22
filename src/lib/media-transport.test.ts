import { describe, expect, it } from 'vitest';
import { isAppleMobile, isFileMedia, mediaTarget, selectMediaTransport } from './media-transport';

describe('media transport', () => {
  it('uses the native iPhone HLS decoder even when ManagedMediaSource is available', () => {
    expect(selectMediaTransport('https://media.example/movie.m3u8', {
      hlsJs: true, nativeHls: true, appleMobile: true,
    })).toBe('native');
  });

  it('keeps hls.js on supported Android and desktop browsers', () => {
    expect(selectMediaTransport('https://media.example/movie.m3u8', {
      hlsJs: true, nativeHls: false, appleMobile: false,
    })).toBe('hls');
  });

  it('falls back to native HLS where MSE is unavailable', () => {
    expect(selectMediaTransport('https://media.example/movie.m3u8', {
      hlsJs: false, nativeHls: true, appleMobile: false,
    })).toBe('native');
  });

  it('plays MP4 as a media file, including query strings and proxy fallback', () => {
    const url = 'https://media.example/Movie.MP4?token=fixture';
    const proxy = `/api/proxy?url=${encodeURIComponent(url)}`;
    expect(mediaTarget(proxy)).toBe(url);
    expect(isFileMedia(proxy)).toBe(true);
    expect(isFileMedia(`/api/proxy/${encodeURIComponent(url)}`)).toBe(true);
    expect(selectMediaTransport(proxy, { hlsJs: true, nativeHls: false, appleMobile: false })).toBe('native');
    expect(isFileMedia('https://media.example/movie.m3u8?title=.mp4')).toBe(false);
  });

  it('recognizes iPhone and iPadOS desktop user agents', () => {
    expect(isAppleMobile('Mozilla/5.0 (iPhone)', 'iPhone', 5)).toBe(true);
    expect(isAppleMobile('Mozilla/5.0 (Macintosh)', 'MacIntel', 5)).toBe(true);
    expect(isAppleMobile('Mozilla/5.0 (Macintosh)', 'MacIntel', 0)).toBe(false);
    expect(isAppleMobile('Mozilla/5.0 (Android)', 'Linux', 5)).toBe(false);
  });
});

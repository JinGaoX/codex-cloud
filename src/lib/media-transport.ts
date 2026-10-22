export type MediaTransport = 'native' | 'hls';

/** Proxy URLs hide the original extension; use the wrapped URL for format selection. */
export function mediaTarget(url: string): string {
  try {
    const parsed = new URL(url, 'https://libretv.invalid');
    if (parsed.pathname === '/api/proxy') return parsed.searchParams.get('url') || url;
    if (parsed.pathname.startsWith('/api/proxy/')) {
      return decodeURIComponent(parsed.pathname.slice('/api/proxy/'.length));
    }
  } catch { /* Let the browser report an invalid media URL. */ }
  return url;
}

export function isFileMedia(url: string): boolean {
  try {
    return /\.(mp4|m4v|mov|webm|ogv)$/i.test(new URL(mediaTarget(url), 'https://libretv.invalid').pathname);
  } catch { return false; }
}

/** iPadOS may identify itself as macOS; touch points distinguish that case. */
export function isAppleMobile(userAgent: string, platform: string, maxTouchPoints: number): boolean {
  return /iPhone|iPad|iPod/i.test(userAgent) || (platform === 'MacIntel' && maxTouchPoints > 1);
}

export function selectMediaTransport(
  url: string,
  capabilities: { hlsJs: boolean; nativeHls: boolean; appleMobile: boolean },
): MediaTransport {
  if (isFileMedia(url)) return 'native';
  if (capabilities.nativeHls && (capabilities.appleMobile || !capabilities.hlsJs)) return 'native';
  return capabilities.hlsJs ? 'hls' : 'native';
}

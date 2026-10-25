import { looksLikeMp4, parseMp4VideoResolution, parseTsVideoResolution, type MediaResolution } from './codec-parse-browser';
import { standaloneMediaUrl } from './standalone-media';

const PLAYLIST_BYTES = 64 * 1024;
export const PREVIEW_MEDIA_PREFIX_BYTES = 96 * 1024;
export const PREVIEW_RESOLUTION_TIMEOUT_MS = 6000;

/** Read at most a small prefix, then cancel even if the server ignores Range. */
async function readPrefix(url: string, maxBytes: number, signal: AbortSignal, range = false): Promise<{ bytes: Uint8Array; url: string }> {
  const response = await fetch(standaloneMediaUrl(url), {
    signal, credentials: 'omit', cache: 'no-store', referrerPolicy: 'no-referrer',
    headers: range ? { Range: `bytes=0-${maxBytes - 1}` } : undefined,
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const finalUrl = standaloneMediaUrl(response.url || url);
  if (!response.body) return { bytes: new Uint8Array(), url: finalUrl };
  const reader = response.body.getReader();
  const output = new Uint8Array(maxBytes);
  let length = 0;
  try {
    while (length < maxBytes) {
      const { done, value } = await reader.read();
      if (done) break;
      const take = Math.min(value.length, maxBytes - length);
      output.set(value.subarray(0, take), length);
      length += take;
    }
  } finally {
    void reader.cancel().catch(() => {});
    reader.releaseLock();
  }
  return { bytes: output.subarray(0, length), url: finalUrl };
}

/** Use only explicit dimensions; bandwidth never implies an exact width/height. */
export function bestPlaylistResolution(text: string): (MediaResolution & { uri: string }) | undefined {
  let pending: MediaResolution | undefined;
  let best: (MediaResolution & { uri: string }) | undefined;
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (line.startsWith('#EXT-X-STREAM-INF:')) {
      const match = line.match(/(?:^|,)RESOLUTION=(\d+)x(\d+)(?:,|$)/i)
        ?? line.match(/:RESOLUTION=(\d+)x(\d+)(?:,|$)/i);
      pending = match ? { width: Number(match[1]), height: Number(match[2]) } : undefined;
    } else if (line && !line.startsWith('#')) {
      if (pending && pending.width > 0 && pending.height > 0
        && (!best || pending.width * pending.height > best.width * best.height)) {
        best = { ...pending, uri: line };
      }
      pending = undefined;
    }
  }
  return best;
}

/**
 * Detail-only, one episode, bounded reads. No playback, no search-wide probing, no proxy.
 * A cross-origin refusal or unsupported/encrypted header simply leaves the resolution unknown.
 */
export async function probePreviewResolution(input: string, signal?: AbortSignal): Promise<MediaResolution | undefined> {
  const timeout = new AbortController();
  const timer = setTimeout(() => timeout.abort(), PREVIEW_RESOLUTION_TIMEOUT_MS);
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal?.addEventListener('abort', abort, { once: true });
  timeout.signal.addEventListener('abort', abort, { once: true });
  if (signal?.aborted) controller.abort();
  try {
    const target = standaloneMediaUrl(input);
    if (/\.(mp4|m4v|mov)([?#]|$)/i.test(target)) {
      return parseMp4VideoResolution((await readPrefix(target, PREVIEW_MEDIA_PREFIX_BYTES, controller.signal, true)).bytes);
    }
    if (!/\.m3u8([?#]|$)/i.test(target)) return undefined;
    const playlist = await readPrefix(target, PLAYLIST_BYTES, controller.signal);
    const text = new TextDecoder().decode(playlist.bytes);
    if (!text.trimStart().startsWith('#EXTM3U')) return undefined;
    const declared = bestPlaylistResolution(text);
    if (declared) return { width: declared.width, height: declared.height };
    // A master without RESOLUTION cannot provide exact dimensions; do not fan out across variants.
    if (text.includes('#EXT-X-STREAM-INF')) return undefined;
    // Encryption is left to the real player. The preview never fetches keys or decrypts video.
    if (/#EXT-X-KEY:(?!METHOD=NONE(?:,|\s|$))/.test(text)) return undefined;
    const init = text.match(/#EXT-X-MAP:[^\n]*URI="([^"]+)"/)?.[1];
    const first = text.split('\n').map((line) => line.trim()).find((line) => line && !line.startsWith('#'));
    const part = init ?? first;
    if (!part) return undefined;
    const { bytes } = await readPrefix(new URL(part, playlist.url).href, PREVIEW_MEDIA_PREFIX_BYTES, controller.signal, true);
    return looksLikeMp4(bytes) ? parseMp4VideoResolution(bytes) : parseTsVideoResolution(bytes);
  } catch {
    if (signal?.aborted) throw new DOMException('已取消', 'AbortError');
    return undefined;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', abort);
    timeout.signal.removeEventListener('abort', abort);
  }
}

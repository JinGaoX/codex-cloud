import type { DoubanItem } from './types';

/** Fixed public metadata feeds only. No source configuration or search terms are sent. */
export const DISCOVERY_API_BASE = 'https://60s.crystelf.top';
export const DISCOVERY_LISTS = [
  { id: 'douban_movie_weekly', label: '电影周榜', path: '/v2/douban/weekly/movie', source: '豆瓣电影周榜', isTv: false, filterable: true },
  { id: 'douban_tv_chinese', label: '国产剧周榜', path: '/v2/douban/weekly/tv_chinese', source: '豆瓣国产剧周榜', isTv: true, filterable: true },
  { id: 'douban_tv_global', label: '海外剧周榜', path: '/v2/douban/weekly/tv_global', source: '豆瓣海外剧周榜', isTv: true, filterable: true },
  { id: 'douban_show_chinese', label: '国内综艺', path: '/v2/douban/weekly/show_chinese', source: '豆瓣国内综艺周榜', isTv: true, filterable: true },
  { id: 'douban_show_global', label: '海外综艺', path: '/v2/douban/weekly/show_global', source: '豆瓣海外综艺周榜', isTv: true, filterable: true },
  { id: 'baidu_teleplay', label: '百度热播剧', path: '/v2/baidu/teleplay', source: '百度热播剧榜', isTv: true, filterable: false },
] as const;

export type DiscoveryListId = (typeof DISCOVERY_LISTS)[number]['id'];
export type DiscoveryFilter = 'all' | 'high-rated' | 'comedy';

export interface DiscoveryItem extends DoubanItem {
  /** Build-bundled public poster path, already prefixed for the current deployment. */
  bundledCover?: string;
  /** Preserve a verified platform's wide artwork instead of pretending it is a portrait poster. */
  coverShape?: 'landscape';
  /** Public poster alternatives only; never used for source API or video requests. */
  coverFallbacks?: string[];
  /** Original provider rank, never a locally invented rank. */
  rank?: number;
  genres: string[];
}

export interface DiscoveryResponse {
  items: DiscoveryItem[];
  /** Time received on this device, not the provider's update time. */
  retrievedAt: number;
}

const MAX_RESPONSE_BYTES = 256 * 1024;

async function readDiscoveryJson(response: Response): Promise<unknown> {
  if (Number(response.headers.get('content-length')) > MAX_RESPONSE_BYTES) {
    await response.body?.cancel();
    throw new Error('榜单响应过大，请稍后重试');
  }
  const reader = response.body?.getReader();
  if (!reader) throw new Error('榜单数据为空');
  const decoder = new TextDecoder();
  let bytes = 0;
  let text = '';
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > MAX_RESPONSE_BYTES) {
        await reader.cancel();
        throw new Error('榜单响应过大，请稍后重试');
      }
      text += decoder.decode(chunk.value, { stream: true });
    }
    return JSON.parse(text + decoder.decode()) as unknown;
  } finally { reader.releaseLock(); }
}

function httpsImage(value: unknown): string {
  if (typeof value !== 'string') return '';
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password ? url.href : '';
  } catch { return ''; }
}

function posterFallbacks(cover: string, provided: unknown): string[] {
  const alternatives: string[] = [];
  if (cover) {
    const image = new URL(cover);
    // These are the same public image mirrors already supported by LibreTV's
    // full-stack frontend. Match the actual hostname, never a query or substring.
    if (/^img\d+\.doubanio\.com$/i.test(image.hostname)) {
      for (const hostname of ['img.doubanio.cmliussss.net', 'img.doubanio.cmliussss.com']) {
        const mirror = new URL(image);
        mirror.hostname = hostname;
        alternatives.push(mirror.href);
      }
    }
  }
  const supplied = httpsImage(provided);
  if (supplied) alternatives.push(supplied);
  return [...new Set(alternatives)].filter((url) => url !== cover);
}

/** The 60s feed's metadata is untrusted. Missing posters/ratings keep usable titles. */
export function normalizeDiscoveryItems(raw: unknown, id: DiscoveryListId): DiscoveryItem[] {
  const list = DISCOVERY_LISTS.find((entry) => entry.id === id);
  if (!list || !Array.isArray(raw)) throw new Error('榜单数据格式不正确');
  const seen = new Set<string>();
  const items: DiscoveryItem[] = [];
  for (const entry of raw.slice(0, 50)) {
    if (!entry || typeof entry !== 'object') continue;
    const data = entry as Record<string, unknown>;
    const title = typeof data.title === 'string' ? data.title.trim().slice(0, 150) : '';
    const rawId = typeof data.id === 'number' || typeof data.id === 'string' ? String(data.id).trim() : '';
    const itemId = list.filterable ? rawId : title;
    if (!title || !itemId || seen.has(itemId)) continue;
    seen.add(itemId);
    const rating = list.filterable && (typeof data.rating === 'number' || typeof data.rating === 'string')
      ? Number(data.rating) : NaN;
    const subtitleGenres = typeof data.card_subtitle === 'string' ? data.card_subtitle.split('/')[2] ?? '' : '';
    const tags = list.filterable && Array.isArray(data.tags) ? data.tags.filter((tag): tag is string => typeof tag === 'string') : [];
    const genres = list.filterable
      ? [...new Set([...subtitleGenres.trim().split(/[、，,\s]+/), ...tags].map((tag) => tag.trim().slice(0, 30)).filter(Boolean))].slice(0, 20)
      : [];
    const cover = httpsImage(data.cover) || httpsImage(data.cover_proxy);
    const coverFallbacks = posterFallbacks(cover, data.cover_proxy);
    items.push({
      id: `${id}:${itemId}`,
      title,
      cover,
      ...(coverFallbacks.length ? { coverFallbacks } : {}),
      ...(Number.isFinite(rating) && rating > 0 && rating <= 10 ? { rating: String(rating) } : {}),
      ...(typeof data.rank === 'number' && Number.isInteger(data.rank) && data.rank > 0 && data.rank <= 1000 ? { rank: data.rank } : {}),
      isTv: list.isTv,
      genres,
    });
  }
  return items;
}

export function filterDiscoveryItems(items: DiscoveryItem[], filter: DiscoveryFilter): DiscoveryItem[] {
  if (filter === 'high-rated') return items.filter((item) => Number(item.rating) >= 8);
  if (filter === 'comedy') return items.filter((item) => item.genres.includes('喜剧'));
  return items;
}

/** Browser-readable CORS feed; independent of the user's playback API and all Next routes. */
export async function fetchDiscoveryList(id: DiscoveryListId, signal?: AbortSignal): Promise<DiscoveryResponse> {
  const list = DISCOVERY_LISTS.find((entry) => entry.id === id);
  if (!list) throw new Error('不支持的榜单');
  signal?.throwIfAborted();
  const controller = new AbortController();
  const abort = () => controller.abort(signal?.reason);
  signal?.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(`${DISCOVERY_API_BASE}${list.path}`, {
      method: 'GET', mode: 'cors', credentials: 'omit', referrerPolicy: 'no-referrer',
      headers: { Accept: 'application/json' }, signal: controller.signal,
    });
    if (!response.ok) throw new Error('榜单服务暂时不可用');
    const data = await readDiscoveryJson(response);
    if (!data || typeof data !== 'object' || (data as { code?: unknown }).code !== 200) throw new Error('榜单数据格式不正确');
    const items = normalizeDiscoveryItems((data as { data?: unknown }).data, id);
    if (!items.length) throw new Error('榜单暂时没有可用内容');
    return { items, retrievedAt: Date.now() };
  } catch (error) {
    signal?.throwIfAborted();
    if (controller.signal.aborted) throw new Error('榜单请求超时，请稍后重试');
    throw error instanceof Error ? error : new Error('榜单暂时无法加载');
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', abort);
  }
}

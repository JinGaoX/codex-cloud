/**
 * Standalone PWA transport. All requests go directly to user-configured HTTPS
 * sources. This module intentionally has no Node APIs, server routes, credentials
 * or third-party CORS proxies; Safari enforces the source's CORS policy.
 */
import { filterAdultResults, filterRelevantResults, parseDetail, parseSearchList } from './cms-parser';
import { parseSubscriptionJson, parseSubscriptionPayload, withSkipped } from './tvbox-parser';
import type { ClientApi, LiveProbeResult } from './client-api';
import type { AuthStatusResponse, QualityProbeItem, QualityProbeResult, SearchResponse, SourceConfig, SourceListPayload, SourceSearchOutcome, VideoDetail } from './types';

const REQUEST_TIMEOUT_MS = 10_000;
const MAX_SEARCH_PAGES = 5;
const SOURCE_CONCURRENCY = 4;
const MAX_RESPONSE_BYTES = 5 * 1024 * 1024;
const NETWORK_MESSAGE = '无法直接访问该源：可能是网络、证书或 CORS 跨域限制。独立版不会使用后台代理，请换用允许浏览器访问的 HTTPS API。';
const DETAIL_CACHE_TTL_MS = 120_000;
const DETAIL_CACHE_MAX_ENTRIES = 64;
const DETAIL_CACHE_MAX_BYTES = 4 * 1024 * 1024;
const detailCache = new Map<string, { detail: VideoDetail; expiresAt: number; bytes: number }>();
let detailCacheBytes = 0;

/** Memory only: URLs, source configuration and playback links never enter a shared or persistent cache. */
export function clearStandaloneDetailCache(): void {
  detailCache.clear();
  detailCacheBytes = 0;
}

function detailCacheKey(id: string, source: SourceConfig): string {
  return JSON.stringify([
    standaloneUrl(source.url).href, source.key, id.trim(), source.name,
    source.detail || '', source.isAdult === true,
  ]);
}

function cloneDetail(detail: VideoDetail): VideoDetail {
  return { episodes: [...detail.episodes], videoInfo: { ...detail.videoInfo } };
}

function removeCachedDetail(key: string): void {
  const entry = detailCache.get(key);
  if (!entry) return;
  detailCacheBytes -= entry.bytes;
  detailCache.delete(key);
}

function pruneDetailCache(): void {
  const now = Date.now();
  for (const [key, entry] of detailCache) {
    if (entry.expiresAt <= now) removeCachedDetail(key);
  }
}

function readCachedDetail(id: string, source: SourceConfig): VideoDetail | undefined {
  pruneDetailCache();
  const key = detailCacheKey(id, source);
  const entry = detailCache.get(key);
  if (!entry) return undefined;
  // LRU order changes, but reading does not prolong the lifetime of a signed playback URL.
  detailCache.delete(key);
  detailCache.set(key, entry);
  return cloneDetail(entry.detail);
}

function cacheDetail(id: string, source: SourceConfig, detail: VideoDetail): void {
  const key = detailCacheKey(id, source);
  const snapshot = cloneDetail(detail);
  const bytes = new TextEncoder().encode(key).byteLength
    + new TextEncoder().encode(JSON.stringify(snapshot)).byteLength;
  pruneDetailCache();
  removeCachedDetail(key);
  if (bytes > DETAIL_CACHE_MAX_BYTES) return;
  while (detailCache.size >= DETAIL_CACHE_MAX_ENTRIES || detailCacheBytes + bytes > DETAIL_CACHE_MAX_BYTES) {
    const oldest = detailCache.keys().next().value;
    if (oldest === undefined) break;
    removeCachedDetail(oldest);
  }
  detailCache.set(key, { detail: snapshot, expiresAt: Date.now() + DETAIL_CACHE_TTL_MS, bytes });
  detailCacheBytes += bytes;
}

/** Safari's standalone origin is HTTPS; mixed HTTP and embedded URL credentials cannot work reliably. */
export function standaloneUrl(raw: string): URL {
  let url: URL;
  try { url = new URL(raw.trim()); }
  catch { throw new Error('地址格式不正确，请填写完整的 HTTPS API 地址'); }
  if (url.protocol !== 'https:') throw new Error('独立版仅支持 HTTPS 地址，HTTP 会被 iPhone 的安全策略拦截');
  if (url.username || url.password) throw new Error('独立版不支持地址中包含账号密码，请使用允许浏览器直接访问的 HTTPS API');
  url.hash = '';
  return url;
}

function abortReason(signal?: AbortSignal): unknown {
  return signal?.reason ?? new DOMException('请求已取消', 'AbortError');
}

function ensureNotAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw abortReason(signal);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : '请求失败';
}

function isTimeout(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'TimeoutError';
}

/** Bound both network and body consumption; an abort race also handles adapters which ignore fetch's signal. */
async function directText(raw: string, signal?: AbortSignal): Promise<string> {
  ensureNotAborted(signal);
  const url = standaloneUrl(raw);
  const controller = new AbortController();
  const onParentAbort = () => controller.abort(abortReason(signal));
  signal?.addEventListener('abort', onParentAbort, { once: true });
  const timer = setTimeout(() => controller.abort(new DOMException('该源请求超时，请重试或切换其他源', 'TimeoutError')), REQUEST_TIMEOUT_MS);
  let onAbort: (() => void) | undefined;
  const aborted = new Promise<never>((_resolve, reject) => {
    onAbort = () => reject(controller.signal.reason ?? new DOMException('请求已取消', 'AbortError'));
    controller.signal.addEventListener('abort', onAbort, { once: true });
  });
  try {
    const operation = async () => {
      let response: Response;
      try {
        response = await fetch(url.href, {
          method: 'GET', mode: 'cors', credentials: 'omit', cache: 'no-store',
          headers: { Accept: 'application/json, text/plain;q=0.9, */*;q=0.8' },
          signal: controller.signal,
        });
      } catch (error) {
        if (controller.signal.aborted) throw controller.signal.reason ?? error;
        throw new Error(NETWORK_MESSAGE);
      }
      // Browser fetch handles cross-origin redirects; do not silently accept an HTTP final URL.
      if (response.url) standaloneUrl(response.url);
      if (!response.ok) throw new Error(`源站返回 HTTP ${response.status}，请检查 API 是否有效`);
      const length = Number(response.headers.get('content-length'));
      if (Number.isFinite(length) && length > MAX_RESPONSE_BYTES) {
        void response.body?.cancel().catch(() => {});
        throw new Error('源站返回内容过大，请更换 API');
      }
      const reader = response.body?.getReader();
      if (!reader) return '';
      const chunks: Uint8Array[] = [];
      let size = 0;
      try {
        for (;;) {
          const chunk = await reader.read();
          if (chunk.done) break;
          size += chunk.value.byteLength;
          if (size > MAX_RESPONSE_BYTES) {
            void reader.cancel().catch(() => {});
            throw new Error('源站返回内容过大，请更换 API');
          }
          chunks.push(chunk.value);
        }
      } catch (error) {
        if (controller.signal.aborted) throw controller.signal.reason ?? error;
        if (error instanceof TypeError) throw new Error(NETWORK_MESSAGE);
        throw error;
      } finally { reader.releaseLock(); }
      const joined = new Uint8Array(size);
      let offset = 0;
      for (const chunk of chunks) { joined.set(chunk, offset); offset += chunk.byteLength; }
      return new TextDecoder().decode(joined);
    };
    return await Promise.race([operation(), aborted]);
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onParentAbort);
    if (onAbort) controller.signal.removeEventListener('abort', onAbort);
  }
}

async function cmsJson(url: URL, signal?: AbortSignal): Promise<unknown> {
  const text = await directText(url.href, signal);
  let data: unknown;
  try { data = JSON.parse(text); }
  catch { throw new Error('接口没有返回 JSON；独立版支持 Apple CMS JSON API，不支持网页、XML 或 Spider 接口'); }
  if (!data || typeof data !== 'object' || !('list' in data)) {
    throw new Error('接口没有返回 Apple CMS 的 list 字段，请检查是否为 JSON API 地址');
  }
  return data;
}

function cmsUrl(raw: string, values: Record<string, string>): URL {
  const url = standaloneUrl(raw);
  // Preserve existing query values (e.g. a user-owned API token) instead of appending a second '?'.
  for (const [key, value] of Object.entries(values)) url.searchParams.set(key, value);
  return url;
}

function playableDetail(data: unknown, source: SourceConfig): VideoDetail {
  const result = parseDetail(data, source);
  const originalCount = result.episodes.length;
  result.episodes = result.episodes.filter((url) => { try { standaloneUrl(url); return true; } catch { return false; } });
  if (result.episodes.length === 0) {
    throw new Error(originalCount > 0
      ? '该源仅提供 HTTP 或无效播放地址，iPhone 独立版需要 HTTPS MP4/HLS，请切换其他源'
      : '该源没有直接提供播放地址；独立版不抓取详情网页，请换用直接返回 HTTPS MP4/HLS 的 JSON API');
  }
  return result;
}

function warmSearchDetails(data: unknown, source: SourceConfig, retainedIds: Set<string>): void {
  const list = (data as { list?: unknown } | null)?.list;
  if (!Array.isArray(list)) return;
  for (const raw of list) {
    if (!raw || typeof raw !== 'object') continue;
    const id = String((raw as Record<string, unknown>).vod_id ?? '').trim();
    if (!id || !retainedIds.has(id)) continue;
    try {
      // Some videolist searches already contain complete episodes. Reuse only those
      // actual HTTPS links; summary-only or malformed rows must not break a search.
      cacheDetail(id, source, playableDetail({ list: [raw] }, source));
    } catch {
      // A later explicit detail request remains available for incomplete search rows.
    }
  }
}

async function mapConcurrent<T, R>(items: T[], concurrency: number, task: (item: T) => Promise<R>, signal?: AbortSignal): Promise<R[]> {
  const result: R[] = new Array(items.length);
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    for (;;) {
      ensureNotAborted(signal);
      const index = cursor++;
      if (index >= items.length) return;
      result[index] = await task(items[index]);
    }
  }));
  return result;
}

type SearchOutcome = SourceSearchOutcome & { partial?: boolean };

async function sourceSearch(source: SourceConfig, wd: string, filterAdult: boolean, signal?: AbortSignal): Promise<SearchOutcome> {
  const started = performance.now();
  const controller = new AbortController();
  const onAbort = () => controller.abort(abortReason(signal));
  signal?.addEventListener('abort', onAbort, { once: true });
  const timer = setTimeout(() => controller.abort(new DOMException('该源搜索超时', 'TimeoutError')), REQUEST_TIMEOUT_MS);
  const finish = (outcome: Omit<SearchOutcome, 'sourceKey' | 'ms'>): SearchOutcome => ({
    ...outcome, sourceKey: source.key, ms: Math.round(performance.now() - started),
  });
  const fetchPage = (page: number) => cmsJson(cmsUrl(source.url, { ac: 'videolist', wd, pg: String(page) }), controller.signal);
  try {
    ensureNotAborted(signal);
    const first = await fetchPage(1);
    const rawCount = Number((first as { pagecount?: unknown }).pagecount ?? 1);
    const count = Math.min(MAX_SEARCH_PAGES, Number.isFinite(rawCount) ? Math.max(1, Math.floor(rawCount)) : 1);
    const remaining = await Promise.allSettled(Array.from({ length: count - 1 }, (_, index) => fetchPage(index + 2)));
    ensureNotAborted(signal);
    // A late/bad subsequent page must not discard the successful first page.
    const collected = parseSearchList(first, source);
    let partial = false;
    for (const page of remaining) {
      if (page.status === 'rejected') { partial = true; continue; }
      try { collected.push(...parseSearchList(page.value, source)); }
      catch { partial = true; }
    }
    const seen = new Set<string>();
    const deduplicated = collected.filter((item) => {
      if (!item.vodId || seen.has(item.vodId)) return false;
      seen.add(item.vodId); return true;
    });
    const list = filterRelevantResults(filterAdultResults(deduplicated, filterAdult), wd);
    const retainedIds = new Set(list.map((item) => item.vodId));
    warmSearchDetails(first, source, retainedIds);
    for (const page of remaining) {
      if (page.status === 'fulfilled') warmSearchDetails(page.value, source, retainedIds);
    }
    return finish({ ok: true, list, ...(partial ? { partial: true } : {}) });
  } catch (error) {
    ensureNotAborted(signal);
    return finish({ ok: false, list: [], error: errorMessage(error), timedOut: isTimeout(error) });
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }
}

async function search(wd: string, sources: SourceConfig[], filterAdult: boolean, opts?: { signal?: AbortSignal; onSource?: (outcome: SourceSearchOutcome) => void }): Promise<SearchResponse> {
  ensureNotAborted(opts?.signal);
  const seen = new Set<string>();
  const unique = sources.filter((source) => { if (seen.has(source.key)) return false; seen.add(source.key); return true; });
  const outcomes = await mapConcurrent(unique, SOURCE_CONCURRENCY, async (source) => {
    const outcome = await sourceSearch(source, wd.trim().slice(0, 100), filterAdult, opts?.signal);
    ensureNotAborted(opts?.signal);
    opts?.onSource?.(outcome);
    return outcome;
  }, opts?.signal);
  const partial = outcomes.some((outcome) => outcome.partial);
  return {
    list: outcomes.flatMap((outcome) => outcome.list),
    failures: outcomes.filter((outcome) => !outcome.ok).map((outcome) => ({ sourceKey: outcome.sourceKey, error: outcome.error || '该源请求失败', timedOut: outcome.timedOut })),
    ...(partial ? { partial: true, error: '部分分页无法读取，已保留成功结果；可重试或切换其他源。' } : {}),
  };
}

async function detail(id: string, source: SourceConfig, signal?: AbortSignal, titleHint?: string): Promise<VideoDetail> {
  ensureNotAborted(signal);
  if (!id.trim()) throw new Error('影片 ID 不能为空');
  const cached = readCachedDetail(id, source);
  if (cached) return cached;
  try {
    const data = await cmsJson(cmsUrl(source.url, { ac: 'videolist', ids: id.trim() }), signal);
    ensureNotAborted(signal);
    const result = playableDetail(data, source);
    cacheDetail(id, source, result);
    return result;
  } catch (error) {
    ensureNotAborted(signal);
    const title = titleHint?.trim().slice(0, 100);
    if (error instanceof Error && error.message === NETWORK_MESSAGE && title) {
      try {
        // Some sources expose full episodes in search but omit CORS headers on ids.
        // A known title can recover that same exact item without guessing a URL or
        // silently opening a different film with a similar name.
        const outcome = await sourceSearch(source, title, false, signal);
        ensureNotAborted(signal);
        if (outcome.ok && outcome.list.some((item) => item.vodId === id.trim())) {
          const recovered = readCachedDetail(id, source);
          if (recovered) return recovered;
        }
      } catch {
        ensureNotAborted(signal);
        // Recovery is optional; preserve the original request error if it fails.
      }
    }
    throw error;
  }
}

async function sourceList(raw: string): Promise<SourceListPayload> {
  const text = await directText(raw);
  const parsed = parseSubscriptionPayload(parseSubscriptionJson(text));
  const valid = (url?: string) => { try { if (!url) return false; standaloneUrl(url); return true; } catch { return false; } };
  const sources = parsed.sources.filter((item) => valid(item.url)).map((item) => ({ ...item, detail: valid(item.detail) ? item.detail : undefined }));
  const liveSources = parsed.liveSources.filter((item) => valid(item.url)).map((item) => ({ ...item, epg: valid(item.epg) ? item.epg : undefined }));
  if (!sources.length && !liveSources.length) throw new Error('订阅中没有可导入的 HTTPS 源');
  return { ...parsed, sources, liveSources, stats: withSkipped(parsed.stats, 'invalidUrl', parsed.sources.length + parsed.liveSources.length - sources.length - liveSources.length) };
}

function unsupported(feature: string): never {
  throw new Error(`iPhone 独立版暂不提供${feature}；此功能需要额外服务，本版不会请求后台接口。`);
}

const status = async (): Promise<AuthStatusResponse> => ({
  passwordRequired: false, verified: true, version: process.env.APP_VERSION || 'standalone',
  defaultSources: [], defaultLiveSources: [], defaultSubscriptions: [],
  defaultRecommendSource: null, defaultImageMode: 'direct',
});

/** Same contract as the original transport, so shared UI and state need no separate implementation. */
export const standaloneApi: ClientApi = {
  status,
  login: async () => ({ success: true }),
  logout: async () => ({ success: true }),
  search,
  detail,
  detailSpeed: async (id: string, source: SourceConfig, signal?: AbortSignal) => {
    const start = performance.now();
    try { const result = await detail(id, source, signal); return { ok: true, ms: Math.round(performance.now() - start), detail: result }; }
    catch (error) { ensureNotAborted(signal); return { ok: false, ms: Math.round(performance.now() - start), detail: undefined, error: errorMessage(error) }; }
  },
  testSource: async (raw: string) => {
    const start = performance.now();
    try {
      const source = { key: 'test', name: '测试源', url: raw };
      const data = await cmsJson(cmsUrl(raw, { ac: 'videolist', wd: 'test', pg: '1' }));
      return { ok: true, count: parseSearchList(data, source).length, ms: Math.round(performance.now() - start) };
    } catch (error) { return { ok: false, ms: Math.round(performance.now() - start), error: errorMessage(error) }; }
  },
  fetchSourceList: sourceList,
  qualityProbeStream: async (items: QualityProbeItem[], onResult: (result: QualityProbeResult) => void, signal?: AbortSignal) => {
    ensureNotAborted(signal);
    for (const item of items) onResult({ sourceKey: item.source.key, vodId: item.id, error: '独立版不执行后台画质探测；播放后可记录实际分辨率' });
  },
  douban: async () => unsupported('豆瓣推荐'),
  bangumiCalendar: async () => unsupported('番剧推荐'),
  hotList: async () => unsupported('影视榜单'),
  publishSourceList: async () => unsupported('在线发布订阅，请使用配置导出'),
  livePlaylist: async () => unsupported('直播列表'),
  liveEpg: async () => unsupported('直播节目单'),
  liveTest: async () => ({ ok: false, ms: 0, count: 0, error: '独立版暂不提供直播' }),
  liveExportUrl: (url: string) => standaloneUrl(url).href,
  liveProbe: async () => unsupported('直播探测'),
  liveProbeStream: async (_urls: string[], _onResult: (result: LiveProbeResult) => void, signal?: AbortSignal) => { ensureNotAborted(signal); unsupported('直播探测'); },
};

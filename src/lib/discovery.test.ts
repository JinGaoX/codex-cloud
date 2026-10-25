import { afterEach, describe, expect, it, vi } from 'vitest';
import { DISCOVERY_API_BASE, DISCOVERY_LISTS, fetchDiscoveryList, filterDiscoveryItems, normalizeDiscoveryItems } from './discovery';

const sample = [
  { id: 'test-comedy', title: '测试喜剧', rating: 9.1, rank: 3, cover: 'https://images.example/comedy.jpg', card_subtitle: '2026 / 中国大陆 / 喜剧 剧情 / 测试导演', tags: ['测试标签'] },
  { id: 'test-drama', title: '测试剧情', rating: '7.5', cover: 'https://images.example/drama.jpg', card_subtitle: '2026 / 中国大陆 / 剧情 / 测试导演' },
  { id: 'test-unrated', title: '测试未评分', rating: 0, card_subtitle: '2026 / 中国大陆 / 喜剧 / 测试导演' },
];

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe('public discovery normalization and filters', () => {
  it('uses provider ratings and genres and preserves provider order/rank', () => {
    const items = normalizeDiscoveryItems(sample, 'douban_movie_weekly');
    expect(items.map((item) => item.title)).toEqual(['测试喜剧', '测试剧情', '测试未评分']);
    expect(items[0]).toMatchObject({ rank: 3, rating: '9.1', genres: ['喜剧', '剧情', '测试标签'], isTv: false });
    expect(items[1].rank).toBeUndefined();
    expect(items[2].rating).toBeUndefined();
    expect(filterDiscoveryItems(items, 'high-rated').map((item) => item.title)).toEqual(['测试喜剧']);
    expect(filterDiscoveryItems(items, 'comedy').map((item) => item.title)).toEqual(['测试喜剧', '测试未评分']);
    expect(filterDiscoveryItems(items, 'all')).toBe(items);
  });

  it('never treats Baidu heat as a score or generates invented ranks', () => {
    const items = normalizeDiscoveryItems([{ title: '测试热播剧', rank: 2, cover: 'https://images.example/tv.jpg', score: '95471', rating: 9.5, tags: ['喜剧'] }], 'baidu_teleplay');
    expect(items[0]).toMatchObject({ title: '测试热播剧', rank: 2, isTv: true, genres: [] });
    expect(items[0].rating).toBeUndefined();
    expect(filterDiscoveryItems(items, 'high-rated')).toEqual([]);
    expect(filterDiscoveryItems(items, 'comedy')).toEqual([]);
  });

  it('keeps a usable title when poster is unavailable and rejects unsafe poster URLs', () => {
    const items = normalizeDiscoveryItems([
      { id: '1', title: '  测试条目  ', cover: 'javascript:alert(1)' },
      { id: '2', title: '测试条目2', cover: 'http://images.example/x', cover_proxy: 'https://images.example/safe.jpg' },
      { id: '3', title: '测试条目3', cover: 'https://name:secret@images.example/x' },
    ], 'douban_tv_chinese');
    expect(items.map((item) => item.cover)).toEqual(['', 'https://images.example/safe.jpg', '']);
    expect(items[0].title).toBe('测试条目');
    expect(items.every((item) => item.isTv)).toBe(true);
  });

  it('preserves existing LibreTV poster mirrors and the feed fallback when original Douban images reject browser requests', () => {
    const [item] = normalizeDiscoveryItems([{
      id: 'poster', title: '有海报的影片',
      cover: 'https://img9.doubanio.com/view/photo/poster.jpg?size=large',
      cover_proxy: 'https://doubanio.viki.moe/view/photo/poster.jpg?size=large',
    }], 'douban_movie_weekly');
    expect(item.cover).toBe('https://img9.doubanio.com/view/photo/poster.jpg?size=large');
    expect(item.coverFallbacks).toEqual([
      'https://img.doubanio.cmliussss.net/view/photo/poster.jpg?size=large',
      'https://img.doubanio.cmliussss.com/view/photo/poster.jpg?size=large',
      'https://doubanio.viki.moe/view/photo/poster.jpg?size=large',
    ]);
  });

  it('matches only actual Douban image hosts and never rewrites unrelated cover URLs', () => {
    const covers = [
      'https://img9.doubanio.com.example.invalid/poster.jpg',
      'https://other.example/poster.jpg?origin=img9.doubanio.com',
      'https://doubanio.com/poster.jpg',
    ];
    const items = normalizeDiscoveryItems(covers.map((cover, i) => ({ id: i, title: `影片${i}`, cover })), 'douban_movie_weekly');
    expect(items.map((item) => item.cover)).toEqual(covers);
    expect(items.every((item) => item.coverFallbacks === undefined)).toBe(true);
  });

  it('drops unsafe alternatives, deduplicates provided images and does not invent a cover', () => {
    const items = normalizeDiscoveryItems([
      { id: '1', title: '无图影片', cover_proxy: 'javascript:alert(1)' },
      { id: '2', title: '同一图片', cover: 'https://images.example/a.jpg', cover_proxy: 'https://images.example/a.jpg' },
      { id: '3', title: '账号图片', cover: 'https://images.example/b.jpg', cover_proxy: 'https://user:password@images.example/c.jpg' },
      { id: '4', title: '不安全备用', cover: 'https://images.example/d.jpg', cover_proxy: 'http://images.example/e.jpg' },
      { id: '5', title: '只有备用', cover_proxy: 'https://images.example/only.jpg' },
    ], 'douban_movie_weekly');
    expect(items.every((item) => item.coverFallbacks === undefined)).toBe(true);
    expect(items[0].cover).toBe('');
    expect(items[4].cover).toBe('https://images.example/only.jpg');
  });

  it('drops malformed and duplicate rows, invalid ratings and out-of-range ranks', () => {
    const items = normalizeDiscoveryItems([
      null, 'wrong', {}, { id: '1', title: '' }, { title: 'missing id' },
      { id: '1', title: '第一条', rating: 11, rank: -1 },
      { id: '1', title: '重复项', rating: 9 },
      { id: '2', title: '第二条', rating: 'NaN', rank: 1.5 },
    ], 'douban_tv_global');
    expect(items).toHaveLength(2);
    expect(items.every((item) => item.rating === undefined && item.rank === undefined)).toBe(true);
    expect(() => normalizeDiscoveryItems({}, 'douban_movie_weekly')).toThrow('格式');
  });

  it('does not mistake description text mentioning comedy for a genre', () => {
    const [item] = normalizeDiscoveryItems([{ id: '1', title: '测试悬疑', card_subtitle: '2026 / 中国大陆 / 悬疑 / 导演', description: '这不是喜剧' }], 'douban_movie_weekly');
    expect(filterDiscoveryItems([item], 'comedy')).toEqual([]);
  });
});

describe('public discovery browser transport', () => {
  it('requests only fixed public metadata with no cookies or private source parameters', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ code: 200, data: sample })));
    vi.stubGlobal('fetch', fetcher);
    const result = await fetchDiscoveryList('douban_movie_weekly');
    expect(fetcher).toHaveBeenCalledOnce();
    expect(fetcher).toHaveBeenCalledWith(`${DISCOVERY_API_BASE}/v2/douban/weekly/movie`, expect.objectContaining({ method: 'GET', mode: 'cors', credentials: 'omit', referrerPolicy: 'no-referrer', headers: { Accept: 'application/json' } }));
    expect(result.items).toHaveLength(3);
    expect(result.retrievedAt).toBeGreaterThan(0);
    expect(DISCOVERY_LISTS).toHaveLength(6);
  });

  it('rejects server and malformed responses without returning fake content', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('unavailable', { status: 503 })));
    await expect(fetchDiscoveryList('douban_movie_weekly')).rejects.toThrow('暂时不可用');
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ code: 500, data: sample }))));
    await expect(fetchDiscoveryList('douban_movie_weekly')).rejects.toThrow('格式');
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ code: 200, data: [] }))));
    await expect(fetchDiscoveryList('douban_movie_weekly')).rejects.toThrow('没有可用内容');
  });

  it('propagates cancellation without issuing a request for an already aborted signal', async () => {
    const fetcher = vi.fn();
    vi.stubGlobal('fetch', fetcher);
    const controller = new AbortController();
    controller.abort();
    await expect(fetchDiscoveryList('douban_movie_weekly', controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('caps response bytes even when the service omits content-length', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('x'.repeat(256 * 1024 + 1))));
    await expect(fetchDiscoveryList('douban_movie_weekly')).rejects.toThrow('响应过大');
  });

  it('cancels a stalled request after eight seconds', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn((_url, options) => new Promise((_resolve, reject) => {
      options.signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
    })));
    const result = expect(fetchDiscoveryList('douban_movie_weekly')).rejects.toThrow('超时');
    await vi.advanceTimersByTimeAsync(8000);
    await result;
  });
});

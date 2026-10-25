import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearStandaloneDetailCache, standaloneApi, standaloneUrl } from './standalone-api';
import type { SourceConfig, SourceSearchOutcome } from './types';

// Deliberate test fixtures, not real content services or playable films.
const good: SourceConfig = { key: 'good', name: '测试源', url: 'https://cms.example.org/api?token=fixture-only' };
const other: SourceConfig = { key: 'other', name: '第二测试源', url: 'https://other.example.org/api' };
const vod = (id = 1, name = '测试影片', type = '电影') => ({ vod_id: id, vod_name: name, type_name: type });
const response = (data: unknown, init?: ResponseInit) => new Response(JSON.stringify(data), {
  ...init, headers: { 'content-type': 'application/json', ...init?.headers },
});

beforeEach(() => vi.stubGlobal('fetch', vi.fn()));
afterEach(() => { clearStandaloneDetailCache(); vi.useRealTimers(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe('独立 PWA 的直连网络边界', () => {
  it('status / login / logout 只返回本地状态，不请求任何服务器', async () => {
    const status = await standaloneApi.status();
    expect(status).toMatchObject({ verified: true, passwordRequired: false, defaultSources: [], defaultImageMode: 'direct' });
    expect(await standaloneApi.login('not-a-real-password')).toEqual({ success: true });
    expect(await standaloneApi.logout()).toEqual({ success: true });
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each(['http://cms.example.org/api', 'file:///api', 'javascript:alert(1)', '/api/search', 'not a URL'])('拒绝不安全/相对地址：%s', async (url) => {
    expect(() => standaloneUrl(url)).toThrow(/HTTPS|地址/);
    const result = await standaloneApi.testSource(url);
    expect(result.ok).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('不接受 URL 中的账户密码，剔除不会发送到服务端的 hash', () => {
    expect(() => standaloneUrl('https://user:secret@example.org/api')).toThrow(/账号密码/);
    expect(standaloneUrl(' https://example.org/api#fragment ').href).toBe('https://example.org/api');
  });

  it('GET 保留自有 query，使用 CORS 且不发送 cookie、UA 或私有代理请求', async () => {
    vi.mocked(fetch).mockResolvedValue(response({ list: [vod()] }));
    const result = await standaloneApi.search('测试影片', [good], false);
    expect(result.list).toHaveLength(1);
    const [raw, options] = vi.mocked(fetch).mock.calls[0];
    const url = new URL(String(raw));
    expect(url.origin).toBe('https://cms.example.org');
    expect(url.searchParams.get('token')).toBe('fixture-only');
    expect(url.searchParams.get('wd')).toBe('测试影片');
    expect(url.searchParams.get('ac')).toBe('videolist');
    expect(options).toMatchObject({ method: 'GET', mode: 'cors', credentials: 'omit', cache: 'no-store' });
    expect(options?.headers).not.toHaveProperty('User-Agent');
    expect(options?.headers).not.toHaveProperty('Authorization');
    expect(String(raw)).not.toContain('/api/search');
  });

  it('多源失败隔离，逐源回调，去重、关键词与成人过滤复用官方逻辑', async () => {
    vi.mocked(fetch).mockImplementation(async (raw) => {
      if (String(raw).includes('other.example.org')) throw new TypeError('Failed to fetch');
      return response({ list: [vod(1), vod(1), vod(2, '无关视频'), vod(3, '测试影片', '伦理片')] });
    });
    const settled: SourceSearchOutcome[] = [];
    const result = await standaloneApi.search('测试影片', [good, other, good], true, { onSource: (outcome) => settled.push(outcome) });
    expect(result.list.map((item) => item.vodId)).toEqual(['1']);
    expect(result.failures).toHaveLength(1);
    expect(result.failures[0]).toMatchObject({ sourceKey: 'other', error: expect.stringContaining('CORS') });
    expect(settled).toHaveLength(2);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('后续分页失败仍保留第一页，标为部分结果，不把好源记成失败', async () => {
    vi.mocked(fetch).mockImplementation(async (raw) => {
      const page = new URL(String(raw)).searchParams.get('pg');
      if (page === '2') return response({ list: 'broken-list' });
      if (page === '3') throw new TypeError('Failed to fetch');
      return response({ list: [vod()], pagecount: 3 });
    });
    const result = await standaloneApi.search('测试影片', [good], false);
    expect(result.list).toHaveLength(1);
    expect(result.failures).toEqual([]);
    expect(result).toMatchObject({ partial: true, error: expect.stringContaining('分页') });
  });

  it('接口 401/503 只是源错误，不触发网站登录或缺密码事件', async () => {
    const dispatchEvent = vi.fn();
    vi.stubGlobal('window', { dispatchEvent });
    vi.mocked(fetch).mockResolvedValueOnce(response({ message: 'private' }, { status: 401 }))
      .mockResolvedValueOnce(response({ message: 'unavailable' }, { status: 503 }));
    const result = await standaloneApi.search('测试影片', [good, other], false);
    expect(result.failures.map((item) => item.error)).toEqual([
      expect.stringContaining('HTTP 401'), expect.stringContaining('HTTP 503'),
    ]);
    expect(dispatchEvent).not.toHaveBeenCalled();
  });

  it('源站拒绝跨域时说明可能原因，不假称确定检测到 CORS', async () => {
    vi.mocked(fetch).mockRejectedValue(new TypeError('Load failed'));
    const result = await standaloneApi.testSource(good.url);
    expect(result).toMatchObject({ ok: false, error: expect.stringContaining('可能是网络、证书或 CORS') });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('只接受 Apple CMS JSON，不把普通网页或任意 JSON 判成有效源', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response('<html>login</html>'))
      .mockResolvedValueOnce(response({ message: 'not a CMS API' }));
    expect((await standaloneApi.testSource(good.url)).error).toContain('JSON');
    expect((await standaloneApi.testSource(good.url)).error).toContain('list');
  });

  it('超时源在10秒收束，其他源已经返回的结果保留', async () => {
    vi.useFakeTimers();
    vi.mocked(fetch).mockImplementation((raw) => String(raw).includes('other.example.org')
      ? new Promise<Response>(() => {}) : Promise.resolve(response({ list: [vod()] })));
    const pending = standaloneApi.search('测试影片', [good, other], false);
    const expectation = expect(pending).resolves.toMatchObject({
      list: [expect.objectContaining({ vodId: '1' })],
      failures: [expect.objectContaining({ sourceKey: 'other', timedOut: true })],
    });
    await vi.advanceTimersByTimeAsync(10_001);
    await expectation;
  });

  it('用户取消会拒绝 Promise，不产生假成功或源失败记录', async () => {
    vi.mocked(fetch).mockImplementation(() => new Promise<Response>(() => {}));
    const controller = new AbortController();
    const onSource = vi.fn();
    const pending = standaloneApi.search('测试影片', [good], false, { signal: controller.signal, onSource });
    const expectation = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    controller.abort();
    await expectation;
    expect(onSource).not.toHaveBeenCalled();
  });

  it('详情直接读取 CMS 并解析 HTTPS MP4/HLS，保留已有 query', async () => {
    vi.mocked(fetch).mockResolvedValue(response({ list: [{ ...vod(), vod_play_url: '第一集$https://media.example.org/1.m3u8#第二集$https://media.example.org/2.mp4' }] }));
    const result = await standaloneApi.detail('1', good);
    expect(result.episodes).toEqual(['https://media.example.org/1.m3u8', 'https://media.example.org/2.mp4']);
    expect(result.videoInfo.sourceKey).toBe('good');
    expect(new URL(String(vi.mocked(fetch).mock.calls[0][0])).searchParams.get('ids')).toBe('1');
  });

  it('HTTPS过滤剔除任意位置的HTTP集后，原剧集标题仍与地址同索引', async () => {
    vi.mocked(fetch).mockResolvedValue(response({ list: [{ ...vod(), vod_play_url: [
      '应删除的开头$http://media.example.org/0.mp4',
      '第01集 初遇$https://media.example.org/1.mp4',
      '应删除的中间$http://media.example.org/2.mp4',
      '第03集 归途$https://media.example.org/3.mp4',
      '$https://media.example.org/4.mp4',
      '应删除的结尾$http://media.example.org/5.mp4',
    ].join('#') }] }));
    const detail = await standaloneApi.detail('1', good);
    expect(detail.episodes).toEqual(['https://media.example.org/1.mp4', 'https://media.example.org/3.mp4', 'https://media.example.org/4.mp4']);
    expect(detail.episodeTitles).toEqual(['第01集 初遇', '第03集 归途', '']);
  });

  it('搜索暖缓存和冷启动同ID恢复均保留实际标题，缓存返回标题数组独立克隆', async () => {
    const complete = { ...vod(), vod_id: '1', vod_play_url: '第01集 约定$https://media.example.org/1.mp4#第02集 归来$https://media.example.org/2.mp4' };
    vi.mocked(fetch).mockResolvedValue(response({ list: [complete] }));
    await standaloneApi.search('测试影片', [good], false);
    const cached = await standaloneApi.detail('1', good);
    expect(cached.episodeTitles).toEqual(['第01集 约定', '第02集 归来']);
    cached.episodeTitles![0] = '调用方改写';
    expect((await standaloneApi.detail('1', good)).episodeTitles).toEqual(['第01集 约定', '第02集 归来']);
    expect(fetch).toHaveBeenCalledTimes(1);
    clearStandaloneDetailCache();
    vi.mocked(fetch).mockImplementation(async (raw) => {
      if (new URL(String(raw)).searchParams.has('ids')) throw new TypeError('Failed to fetch');
      return response({ list: [complete] });
    });
    expect((await standaloneApi.detail('1', good, undefined, '测试影片')).episodeTitles).toEqual(['第01集 约定', '第02集 归来']);
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it('搜索已返回真实 HTTPS 剧集时，打开详情不重复请求接口', async () => {
    vi.mocked(fetch).mockResolvedValue(response({ list: [{
      ...vod(), vod_id: '1', vod_play_url: '第一集$https://media.example.org/1.m3u8#第二集$https://media.example.org/2.mp4',
    }] }));
    const search = await standaloneApi.search('测试影片', [good], false);
    vi.mocked(fetch).mockRejectedValue(new TypeError('subsequent request failed'));
    const detail = await standaloneApi.detail(search.list[0].vodId, good);
    expect(detail.episodes).toEqual(['https://media.example.org/1.m3u8', 'https://media.example.org/2.mp4']);
    expect(detail.videoInfo).toMatchObject({ title: '测试影片', sourceKey: 'good', sourceName: '测试源' });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('搜索仅有摘要时仍请求详情，坏播放字段不破坏成功搜索', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(response({ list: [{ ...vod(), vod_play_url: 'not a playlist' }] }))
      .mockResolvedValueOnce(response({ list: [{ ...vod(), vod_play_url: '正片$https://media.example.org/movie.mp4' }] }));
    const search = await standaloneApi.search('测试影片', [good], false);
    expect(search.list).toHaveLength(1);
    expect(search.failures).toEqual([]);
    expect((await standaloneApi.detail('1', good)).episodes).toEqual(['https://media.example.org/movie.mp4']);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('成功详情可复用于播放页，调用方不能修改缓存中的剧集或元信息', async () => {
    vi.mocked(fetch).mockResolvedValue(response({ list: [{ ...vod(), vod_play_url: '正片$https://media.example.org/movie.mp4' }] }));
    const first = await standaloneApi.detail('1', good);
    first.episodes[0] = 'https://changed.example.org/not-the-original.mp4';
    first.videoInfo.title = 'changed title';
    const second = await standaloneApi.detail('1', good);
    second.episodes.length = 0;
    expect((await standaloneApi.detail('1', good)).episodes).toEqual(['https://media.example.org/movie.mp4']);
    expect((await standaloneApi.detail('1', good)).videoInfo.title).toBe('测试影片');
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it.each([
    { ...good, key: 'another-key' },
    { ...good, url: 'https://cms.example.org/api?token=changed-fixture' },
    { ...good, name: '改名后的源' },
  ])('按源配置隔离缓存，另一源或地址/元信息变化后重新请求：%j', async (source) => {
    vi.mocked(fetch).mockImplementation(async () => response({ list: [{ ...vod(), vod_play_url: '正片$https://media.example.org/movie.mp4' }] }));
    await standaloneApi.detail('1', good);
    const detail = await standaloneApi.detail('1', source);
    expect(detail.videoInfo).toMatchObject({ sourceKey: source.key, sourceName: source.name, sourceUrl: source.url });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('同一源不同影片 ID 不共享详情缓存', async () => {
    vi.mocked(fetch).mockImplementation(async (raw) => {
      const id = new URL(String(raw)).searchParams.get('ids');
      return response({ list: [{ ...vod(Number(id)), vod_play_url: `正片$https://media.example.org/${id}.mp4` }] });
    });
    await standaloneApi.detail('1', good);
    expect((await standaloneApi.detail('2', good)).episodes).toEqual(['https://media.example.org/2.mp4']);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('到期后重新读取，缓存命中不会延长签名播放地址有效期', async () => {
    vi.useFakeTimers();
    vi.mocked(fetch).mockImplementation(async () => response({ list: [{ ...vod(), vod_play_url: '正片$https://media.example.org/movie.mp4' }] }));
    await standaloneApi.detail('1', good);
    await vi.advanceTimersByTimeAsync(119_000);
    await standaloneApi.detail('1', good);
    expect(fetch).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1_001);
    await standaloneApi.detail('1', good);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('网络失败不缓存，明确重试仍然会重新请求', async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new TypeError('Load failed'))
      .mockResolvedValueOnce(response({ list: [{ ...vod(), vod_play_url: '正片$https://media.example.org/movie.mp4' }] }));
    await expect(standaloneApi.detail('1', good)).rejects.toThrow(/无法直接访问/);
    expect((await standaloneApi.detail('1', good)).episodes).toEqual(['https://media.example.org/movie.mp4']);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('冷启动详情网络失败时，可按已知标题搜索并恢复同一ID的实际HTTPS剧集', async () => {
    vi.mocked(fetch).mockImplementation(async (raw) => {
      const url = new URL(String(raw));
      if (url.searchParams.has('ids')) throw new TypeError('Load failed');
      return response({ list: [{ ...vod(), vod_id: '1', vod_play_url: '正片$https://media.example.org/movie.mp4' }] });
    });
    const detail = await standaloneApi.detail('1', good, undefined, '  测试影片  ');
    expect(detail.episodes).toEqual(['https://media.example.org/movie.mp4']);
    expect(fetch).toHaveBeenCalledTimes(2);
    const recovery = new URL(String(vi.mocked(fetch).mock.calls[1][0]));
    expect(recovery.origin).toBe('https://cms.example.org');
    expect(recovery.searchParams.get('wd')).toBe('测试影片');
    expect(recovery.searchParams.get('token')).toBe('fixture-only');
    await standaloneApi.detail('1', good, undefined, '测试影片');
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('标题相同但ID不同时不把另一影片当作恢复结果', async () => {
    vi.mocked(fetch).mockImplementation(async (raw) => {
      if (new URL(String(raw)).searchParams.has('ids')) throw new TypeError('Load failed');
      return response({ list: [{ ...vod(2), vod_play_url: '正片$https://media.example.org/different-film.mp4' }] });
    });
    await expect(standaloneApi.detail('1', good, undefined, '测试影片')).rejects.toThrow(/^无法直接访问该源/);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('已知标题的恢复搜索被取消时传播取消，不假成功或覆盖为原网络错误', async () => {
    vi.mocked(fetch).mockImplementation(async (raw) => {
      if (new URL(String(raw)).searchParams.has('ids')) throw new TypeError('Load failed');
      return new Promise<Response>(() => {});
    });
    const controller = new AbortController();
    const pending = standaloneApi.detail('1', good, controller.signal, '测试影片');
    const expectation = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    controller.abort();
    await expectation;
  });

  it('HTTP拒绝等明确接口错误不会触发标题恢复搜索', async () => {
    vi.mocked(fetch).mockResolvedValue(response({ message: 'forbidden' }, { status: 403 }));
    await expect(standaloneApi.detail('1', good, undefined, '测试影片')).rejects.toThrow('HTTP 403');
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it.each([undefined, '正片$http://media.example.org/insecure.mp4'])('缺少可用 HTTPS 剧集的返回不缓存：%s', async (playUrl) => {
    vi.mocked(fetch).mockResolvedValueOnce(response({ list: [{ ...vod(), vod_play_url: playUrl }] }))
      .mockResolvedValueOnce(response({ list: [{ ...vod(), vod_play_url: '正片$https://media.example.org/movie.mp4' }] }));
    await expect(standaloneApi.detail('1', good)).rejects.toThrow(/独立版/);
    await standaloneApi.detail('1', good);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('即使存在缓存，也尊重已取消的详情请求', async () => {
    vi.mocked(fetch).mockResolvedValue(response({ list: [{ ...vod(), vod_play_url: '正片$https://media.example.org/movie.mp4' }] }));
    await standaloneApi.detail('1', good);
    const controller = new AbortController();
    controller.abort();
    await expect(standaloneApi.detail('1', good, controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('最多保留64条详情，超出后淘汰较早条目而不是无限占用手机内存', async () => {
    vi.mocked(fetch).mockResolvedValue(response({ list: Array.from({ length: 65 }, (_, index) => ({
      ...vod(index + 1), vod_play_url: `正片$https://media.example.org/${index + 1}.mp4`,
    })) }));
    await standaloneApi.search('测试影片', [good], false);
    await standaloneApi.detail('2', good);
    await standaloneApi.detail('65', good);
    expect(fetch).toHaveBeenCalledTimes(1);
    vi.mocked(fetch).mockResolvedValue(response({ list: [{ ...vod(), vod_play_url: '正片$https://media.example.org/1.mp4' }] }));
    await standaloneApi.detail('1', good);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('总大小约4MiB时提前淘汰大详情，避免仅按条数限制而积累巨量文本', async () => {
    vi.mocked(fetch).mockImplementation(async (raw) => {
      const id = Number(new URL(String(raw)).searchParams.get('ids'));
      return response({ list: [{ ...vod(id), vod_content: 'x'.repeat(3 * 1024 * 1024), vod_play_url: `正片$https://media.example.org/${id}.mp4` }] });
    });
    await standaloneApi.detail('1', good);
    await standaloneApi.detail('2', good);
    await standaloneApi.detail('1', good);
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it('不抓取详情网页，缺少直链时给出准确限制提示', async () => {
    vi.mocked(fetch).mockResolvedValue(response({ list: [vod()] }));
    await expect(standaloneApi.detail('1', { ...good, detail: 'https://details.example.org' })).rejects.toThrow(/不抓取详情网页/);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('全HTTP播放链接明确拒绝，避免静默清空或混合内容请求', async () => {
    vi.mocked(fetch).mockResolvedValue(response({ list: [{ ...vod(), vod_play_url: '一$http://media.example.org/1.mp4' }] }));
    await expect(standaloneApi.detail('1', good)).rejects.toThrow(/仅提供 HTTP/);
  });

  it('订阅解析复用官方格式，过滤 HTTP 源并保留统计，且没有后台请求', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(`{
      // Test-only fixture, not real providers.
      "sources": [{"name":"HTTPS测试源","url":"https://cms.example.org/api"},
        {"name":"HTTP测试源","url":"http://old.example.org/api"}],
    }`));
    const payload = await standaloneApi.fetchSourceList('https://lists.example.org/sources.json');
    expect(payload.sources).toHaveLength(1);
    expect(payload.stats?.skippedByReason.invalidUrl).toBe(1);
    expect(String(vi.mocked(fetch).mock.calls[0][0])).toBe('https://lists.example.org/sources.json');
  });

  it('限制响应体积，防止异常源耗尽手机内存', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response('not read', { headers: { 'content-length': String(6 * 1024 * 1024) } }));
    const result = await standaloneApi.testSource(good.url);
    expect(result).toMatchObject({ ok: false, error: expect.stringContaining('过大') });
  });

  it('未提供的在线功能明确报错且不发送 /api 请求', async () => {
    await expect(standaloneApi.hotList('movie')).rejects.toThrow(/独立版/);
    await expect(standaloneApi.livePlaylist('https://live.example.org/list.m3u')).rejects.toThrow(/独立版/);
    await expect(standaloneApi.publishSourceList({ sources: [], liveSources: [] })).rejects.toThrow(/独立版/);
    const onResult = vi.fn();
    await standaloneApi.qualityProbeStream([{ id: '1', source: good }], onResult);
    expect(onResult).toHaveBeenCalledWith(expect.objectContaining({ sourceKey: 'good', error: expect.stringContaining('独立版') }));
    expect(fetch).not.toHaveBeenCalled();
  });
});

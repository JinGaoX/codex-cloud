import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { standaloneApi, standaloneUrl } from './standalone-api';
import type { SourceConfig, SourceSearchOutcome } from './types';

// Deliberate test fixtures, not real content services or playable films.
const good: SourceConfig = { key: 'good', name: '测试源', url: 'https://cms.example.org/api?token=fixture-only' };
const other: SourceConfig = { key: 'other', name: '第二测试源', url: 'https://other.example.org/api' };
const vod = (id = 1, name = '测试影片', type = '电影') => ({ vod_id: id, vod_name: name, type_name: type });
const response = (data: unknown, init?: ResponseInit) => new Response(JSON.stringify(data), {
  ...init, headers: { 'content-type': 'application/json', ...init?.headers },
});

beforeEach(() => vi.stubGlobal('fetch', vi.fn()));
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

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

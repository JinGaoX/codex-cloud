import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api, ApiError } from './client-api';
import type { SearchResultItem, SearchStreamEvent, SourceSearchOutcome } from './types';

const sources = [
  { key: 'good', name: '好源', url: 'https://cms.example.org/api' },
  { key: 'other', name: '另一个源', url: 'https://other.example.org/api' },
];
const item: SearchResultItem = { sourceKey: 'good', sourceName: '好源', vodId: '1', name: '测试影片' };
const good: SourceSearchOutcome = { sourceKey: 'good', ok: true, list: [item] };
const source = (outcome = good): SearchStreamEvent => ({ type: 'source', ...outcome });

/** 使用真实 ReadableStream/编码器，模拟网关分块、正常 EOF 与 reader.read 拒绝。 */
function streamResponse(lines: unknown[], error?: Error, newline = true): Response {
  const text = lines.map((line) => typeof line === 'string' ? line : JSON.stringify(line)).join('\n') + (newline ? '\n' : '');
  const bytes = new TextEncoder().encode(text);
  // 单字节拆包同时覆盖中文 UTF-8 跨 chunk 与 NDJSON 跨行缓冲。
  let index = 0;
  return new Response(new ReadableStream<Uint8Array>({
    pull(controller) {
      if (index < bytes.length) controller.enqueue(bytes.slice(index, ++index));
      else if (error) controller.error(error);
      else controller.close();
    },
  }, { highWaterMark: 0 }), { headers: { 'content-type': 'application/x-ndjson' } });
}

const dispatchEvent = vi.fn();
beforeEach(() => {
  dispatchEvent.mockClear();
  vi.stubGlobal('window', { dispatchEvent });
  vi.stubGlobal('CustomEvent', class extends Event {
    detail: unknown;
    constructor(type: string, options?: CustomEventInit) { super(type); this.detail = options?.detail; }
  });
});
afterEach(() => vi.unstubAllGlobals());

describe('搜索流的完整与中断结果', () => {
  it('完整 done 是最终结果，兼容中文跨字节分块与坏行', async () => {
    const finalItem = { ...item, vodId: 'final' };
    vi.stubGlobal('fetch', vi.fn(async () => streamResponse([
      source(), '{broken-json', { type: 'done', list: [finalItem], failures: [] },
    ])));
    const onSource = vi.fn();
    const result = await api.search('测试影片', sources, true, { onSource });
    expect(onSource).toHaveBeenCalledWith(source());
    expect(result).toEqual({ list: [finalItem], failures: [] });
  });

  it('缺少 done 的正常 EOF 保留已收到结果并提示未完成，不虚构源失败', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => streamResponse([source()], undefined, false)));
    const result = await api.search('测试影片', sources, true, { onSource: vi.fn() });
    expect(result.list).toEqual([item]);
    expect(result.failures).toEqual([]);
    expect(result.partial).toBe(true);
    expect(result.error).toContain('重试');
  });

  it('reader 中途失败保留结果，并仅记录真实收到的失败源', async () => {
    const failed: SourceSearchOutcome = { sourceKey: 'other', ok: false, list: [], error: 'HTTP 500', timedOut: false };
    vi.stubGlobal('fetch', vi.fn(async () => streamResponse([
      source({ ...good, list: [item, item] }), source(failed), source(good),
    ], new TypeError('network disconnected'))));
    const onSource = vi.fn();
    const result = await api.search('测试影片', sources, true, { onSource });
    expect(result.list).toEqual([item]);
    expect(result.failures).toEqual([{ sourceKey: 'other', error: 'HTTP 500', timedOut: false }]);
    expect(result.partial).toBe(true);
    expect(onSource).toHaveBeenCalledTimes(3);
  });

  it('done 已完整收到后尾部连接失败仍使用完整结果', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => streamResponse([
      { type: 'done', list: [item], failures: [] },
    ], new TypeError('late disconnect'))));
    expect(await api.search('测试影片', sources, true, { onSource: vi.fn() }))
      .toEqual({ list: [item], failures: [] });
  });

  it.each([undefined, new TypeError('network disconnected')])('未收到任何源且未完成时拒绝请求供 UI 重试（%s）', async (error) => {
    vi.stubGlobal('fetch', vi.fn(async () => streamResponse([], error)));
    await expect(api.search('测试影片', sources, true, { onSource: vi.fn() }))
      .rejects.toMatchObject({ message: expect.stringContaining('重试'), status: 0 });
  });

  it.each([undefined, new DOMException('Aborted', 'AbortError')])('主动取消时抛出取消错误，不把部分结果缓存成成功（%s）', async (error) => {
    const controller = new AbortController();
    vi.stubGlobal('fetch', vi.fn(async () => streamResponse([source()], error)));
    await expect(api.search('测试影片', sources, true, {
      signal: controller.signal,
      onSource: () => controller.abort(),
    })).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('请求无法建立时返回可读网络错误', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('offline'); }));
    await expect(api.search('测试影片', sources, true, { onSource: vi.fn() }))
      .rejects.toMatchObject({ message: expect.stringContaining('网络'), status: 0 });
  });

  it.each([401, 503])('鉴权错误 %s 分发登录事件并拒绝请求', async (status) => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status })));
    await expect(api.search('测试影片', sources, true, { onSource: vi.fn() })).rejects.toBeInstanceOf(ApiError);
    expect(dispatchEvent).toHaveBeenCalledTimes(1);
    expect(dispatchEvent.mock.calls[0][0]).toMatchObject({
      type: 'libretv:unauthorized', detail: status === 503 ? 'setup' : undefined,
    });
  });
});

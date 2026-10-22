import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { addFavorite, db, exportConfig, importConfig, removeFavorite, saveProgress, upsertHistory } from './db';
import { PERSIST_KEY, flushPendingPersist } from './persist-storage';

const settings = new Map<string, string>();
vi.stubGlobal('localStorage', {
  getItem: (key: string) => settings.get(key) ?? null,
  setItem: (key: string, value: string) => settings.set(key, value),
  removeItem: (key: string) => settings.delete(key),
});

beforeEach(async () => {
  flushPendingPersist();
  settings.clear();
  await db.open();
  await Promise.all([db.history.clear(), db.progress.clear(), db.favorites.clear()]);
});
afterAll(() => db.close());

const film = { sourceKey: 'custom_0', sourceName: '测试合法源', sourceUrl: 'https://example.com/api',
  vodId: '12', name: '测试影片', pic: 'https://example.com/poster.jpg' };
const history = { sourceKey: film.sourceKey, sourceUrl: film.sourceUrl, vodId: film.vodId,
  title: film.name, episodeIndex: 2, totalEpisodes: 10, playbackPosition: 122,
  duration: 1200, timestamp: 1234 };

describe('本机收藏与配置备份', () => {
  it('同源同影片收藏幂等；不同来源可各自保留，删除收藏不影响历史', async () => {
    await upsertHistory(history);
    await addFavorite(film);
    await addFavorite({ ...film, name: '更新后的标题' });
    await addFavorite({ ...film, sourceKey: 'custom_1' });
    expect(await db.favorites.count()).toBe(2);
    await removeFavorite(film.sourceKey, film.vodId);
    expect(await db.favorites.count()).toBe(1);
    expect(await db.history.count()).toBe(1);
  });

  it('当前格式完整往返恢复源设置、收藏、历史原时间与每一集的进度', async () => {
    const serializedSettings = JSON.stringify({ state: { customAPIs: [
      { key: film.sourceKey, name: film.sourceName, url: film.sourceUrl }], selectedKeys: [film.sourceKey] }, version: 0 });
    settings.set(PERSIST_KEY, serializedSettings);
    await db.history.put({ ...history, id: `${film.sourceKey}_${film.vodId}` });
    await addFavorite(film);
    await saveProgress(film.sourceKey, film.vodId, 1, 44, 900);
    await saveProgress(film.sourceKey, film.vodId, 2, 122, 1200);
    const backup = await exportConfig();
    await Promise.all([db.history.clear(), db.progress.clear(), db.favorites.clear()]);
    await db.history.put({ ...history, id: 'stale', vodId: 'stale' });
    settings.clear();
    await importConfig(backup);
    expect(settings.get(PERSIST_KEY)).toBe(serializedSettings);
    expect(await db.history.toArray()).toEqual([{ ...history, id: `${film.sourceKey}_${film.vodId}` }]);
    expect((await db.favorites.toArray())[0]).toMatchObject(film);
    expect((await db.progress.toArray()).map((entry) => entry.position).sort((a, b) => a - b)).toEqual([44, 122]);
  });

  it('旧格式历史迁移并恢复当前集进度，未包含收藏的旧备份保留收藏', async () => {
    await addFavorite(film);
    await saveProgress('stale', '1', 0, 99, 200);
    await importConfig(JSON.stringify({ name: 'LibreTV-Settings', data: { viewingHistory: JSON.stringify([
      { sourceCode: 'legacy', vod_id: 123, title: '旧影片', episodes: ['url1', 'url2'],
        episodeIndex: 1, playbackPosition: 66, duration: 1000, timestamp: 500 },
    ]) } }));
    expect(await db.history.toArray()).toEqual([expect.objectContaining({ sourceKey: 'legacy', vodId: '123', totalEpisodes: 2, timestamp: 500 })]);
    expect(await db.progress.toArray()).toEqual([{ key: 'legacy_123_1', position: 66, duration: 1000, updatedAt: 500 }]);
    expect(await db.favorites.count()).toBe(1);
  });

  it('损坏片段不会先覆盖设置或清空历史', async () => {
    await upsertHistory(history);
    settings.set(PERSIST_KEY, 'original');
    await expect(importConfig(JSON.stringify({ name: 'LibreTV-Settings', data: {
      [PERSIST_KEY]: JSON.stringify({ state: {} }), viewingHistory: '{}',
    } }))).rejects.toThrow('必须为列表');
    expect(settings.get(PERSIST_KEY)).toBe('original');
    expect(await db.history.count()).toBe(1);
  });

  it('事务中断时同时恢复历史与原设置', async () => {
    await upsertHistory(history);
    settings.set(PERSIST_KEY, 'original');
    const failure = vi.spyOn(db.favorites, 'bulkPut').mockRejectedValueOnce(new Error('模拟写入失败'));
    await expect(importConfig(JSON.stringify({ name: 'LibreTV-Settings', data: {
      [PERSIST_KEY]: JSON.stringify({ state: {} }), viewingHistory: '[]', favorites: '[]',
    } }))).rejects.toThrow('模拟写入失败');
    failure.mockRestore();
    expect(settings.get(PERSIST_KEY)).toBe('original');
    expect(await db.history.count()).toBe(1);
  });

  it('从官方 v3 数据库升级时保留已有历史并创建收藏表', async () => {
    db.close();
    await Dexie.delete('libretv');
    const legacyDb = new Dexie('libretv');
    legacyDb.version(3).stores({ history: 'id, timestamp', progress: 'key, updatedAt',
      searchHistory: 'text, timestamp', liveProbe: 'url', segmentMeta: 'key, episodeKey, lastAccess', downloads: 'id, createdAt' });
    await legacyDb.table('history').put({ ...history, id: 'old-history' });
    legacyDb.close();
    await db.open();
    expect(await db.history.get('old-history')).toMatchObject(history);
    await addFavorite(film);
    expect(await db.favorites.count()).toBe(1);
  });
});

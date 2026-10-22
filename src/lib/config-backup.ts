import type { FavoriteEntry, HistoryEntry, ProgressEntry } from './db';
import { PERSIST_KEY } from './persist-storage';

export interface ParsedConfigBackup {
  settings?: string;
  history?: HistoryEntry[];
  progress?: ProgressEntry[];
  favorites?: FavoriteEntry[];
}

const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const text = (value: unknown): string => typeof value === 'string' ? value : '';
const number = (value: unknown, fallback = 0): number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : fallback;

/** 先解析整个备份，随后由 db.ts 一次事务写入。兼容旧版 sourceCode/vod_id。 */
export function parseConfigBackup(content: string): ParsedConfigBackup {
  const config: unknown = JSON.parse(content);
  if (!record(config) || config.name !== 'LibreTV-Settings' || !record(config.data)) {
    throw new Error('配置文件格式不正确');
  }
  const data = config.data;
  const out: ParsedConfigBackup = {};
  const section = (key: string): Record<string, unknown>[] | undefined => {
    if (data[key] === undefined) return undefined;
    if (typeof data[key] !== 'string') throw new Error(`配置中的 ${key} 格式不正确`);
    const value: unknown = JSON.parse(data[key]);
    if (!Array.isArray(value) || value.some((item) => !record(item))) {
      throw new Error(`配置中的 ${key} 必须为列表`);
    }
    return value;
  };

  if (data[PERSIST_KEY] !== undefined) {
    if (typeof data[PERSIST_KEY] !== 'string') throw new Error('偏好设置格式不正确');
    const persisted: unknown = JSON.parse(data[PERSIST_KEY]);
    if (!record(persisted) || !record(persisted.state)) throw new Error('偏好设置格式不正确');
    const state = persisted.state;
    for (const key of ['customAPIs', 'selectedKeys', 'liveSubscriptions', 'liveFavorites', 'subscriptions']) {
      if (state[key] !== undefined && !Array.isArray(state[key])) throw new Error(`偏好设置 ${key} 格式不正确`);
    }
    if (Array.isArray(state.customAPIs) && state.customAPIs.some((item: unknown) =>
      !record(item) || typeof item.key !== 'string' || typeof item.name !== 'string' || typeof item.url !== 'string')) {
      throw new Error('点播源配置格式不正确');
    }
    if (Array.isArray(state.selectedKeys) && state.selectedKeys.some((key: unknown) => typeof key !== 'string')) {
      throw new Error('点播源启用状态格式不正确');
    }
    out.settings = data[PERSIST_KEY];
  }

  const history = section('viewingHistory');
  if (history) {
    out.history = history.map((item): HistoryEntry => {
      const sourceKey = text(item.sourceKey) || text(item.sourceCode) || text(item.sourceName);
      const vodId = text(item.vodId) || text(item.vod_id) || (typeof item.vod_id === 'number' ? String(item.vod_id) : '');
      if (!sourceKey || !vodId) throw new Error('观看历史缺少来源或影片 ID');
      return {
        id: `${sourceKey}_${vodId}`, sourceKey, vodId,
        sourceUrl: text(item.sourceUrl) || undefined,
        title: text(item.title) || '未知视频', pic: text(item.pic) || undefined,
        episodeIndex: Math.floor(number(item.episodeIndex)),
        totalEpisodes: number(item.totalEpisodes, Array.isArray(item.episodes) ? item.episodes.length : 0),
        playbackPosition: number(item.playbackPosition), duration: number(item.duration),
        timestamp: number(item.timestamp, Date.now()),
      };
    }).sort((a, b) => b.timestamp - a.timestamp).slice(0, 100);
  }

  const progress = section('playbackProgress');
  if (progress) {
    out.progress = progress.map((item): ProgressEntry => {
      if (!text(item.key)) throw new Error('播放进度缺少定位信息');
      return { key: text(item.key), position: number(item.position), duration: number(item.duration),
        updatedAt: number(item.updatedAt, Date.now()) };
    });
  }

  const favorites = section('favorites');
  if (favorites) {
    out.favorites = favorites.map((item): FavoriteEntry => {
      const sourceKey = text(item.sourceKey);
      const vodId = text(item.vodId);
      if (!sourceKey || !vodId || !text(item.name)) throw new Error('收藏缺少来源或影片信息');
      return { id: JSON.stringify([sourceKey, vodId]), sourceKey, vodId, name: text(item.name),
        sourceName: text(item.sourceName) || sourceKey, sourceUrl: text(item.sourceUrl) || undefined,
        pic: text(item.pic) || undefined, year: text(item.year) || undefined,
        remarks: text(item.remarks) || undefined, typeName: text(item.typeName) || undefined,
        area: text(item.area) || undefined, isAdult: item.isAdult === true,
        timestamp: number(item.timestamp, Date.now()) };
    });
  }
  return out;
}

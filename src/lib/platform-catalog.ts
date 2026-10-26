import catalog from './platform-catalog-data.json';
import { appPath } from './app-path';
import type { DiscoveryItem } from './discovery';

export const PLATFORM_CHOICES = [
  { id: 'iqiyi', label: '爱奇艺' },
  { id: 'youku', label: '优酷' },
  { id: 'tencent', label: '腾讯视频' },
] as const;

export type PlatformId = (typeof PLATFORM_CHOICES)[number]['id'];
export type PlatformMediaType = 'movie' | 'tv';

export interface PlatformCatalogEntry {
  platform: PlatformId;
  type: PlatformMediaType;
  title: string;
  sourceUrl: string;
  evidenceUrl: string;
  posterUrl: string;
  /** Original official size variant when a separately verified larger thumbnail is used. */
  posterOriginalUrl?: string;
  posterFile: string;
  posterWidth: number;
  posterHeight: number;
  verifiedAt: string;
  year?: string;
  genres?: string[];
}

/** Reviewed public platform metadata; not an exhaustive catalog or a live ranking. */
export const PLATFORM_CATALOG: readonly PlatformCatalogEntry[] = catalog as PlatformCatalogEntry[];

/** Does not request an external catalog or send the user's search/source settings. */
export function getPlatformItems(platform: PlatformId, type: PlatformMediaType): DiscoveryItem[] {
  return PLATFORM_CATALOG.filter((entry) => entry.platform === platform && entry.type === type).map((entry) => ({
    id: `platform:${platform}:${type}:${entry.sourceUrl}`,
    title: entry.title,
    cover: entry.posterUrl,
    bundledCover: appPath(`/posters/platform/${entry.posterFile}`),
    ...(entry.posterWidth > entry.posterHeight ? { coverShape: 'landscape' as const } : {}),
    isTv: type === 'tv',
    genres: [...(entry.genres ?? [])],
  }));
}

import { describe, expect, it, vi } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { getPlatformItems, PLATFORM_CATALOG, PLATFORM_CHOICES } from './platform-catalog';

describe('reviewed domestic platform selections', () => {
  it('keeps all six platform/type combinations distinct with at least six verified works each', () => {
    expect(PLATFORM_CHOICES.map((item) => item.id)).toEqual(['iqiyi', 'youku', 'tencent']);
    for (const platform of PLATFORM_CHOICES) for (const type of ['movie', 'tv'] as const) {
      const entries = PLATFORM_CATALOG.filter((entry) => entry.platform === platform.id && entry.type === type);
      const items = getPlatformItems(platform.id, type);
      expect(entries.length).toBeGreaterThanOrEqual(6);
      expect(items.map((item) => item.title)).toEqual(entries.map((entry) => entry.title));
      expect(new Set(items.map((item) => item.id)).size).toBe(items.length);
      expect(items.every((item) => item.isTv === (type === 'tv'))).toBe(true);
      expect(items.every((item) => item.rank === undefined && item.rating === undefined)).toBe(true);
    }
  });

  it('retains official public sources, safe images, date and real bundled WebP assets', () => {
    const domains = { iqiyi: ['iqiyi.com'], youku: ['youku.com'], tencent: ['qq.com', 'wetv.vip'] };
    for (const entry of PLATFORM_CATALOG) {
      expect(entry.title.trim()).toBe(entry.title);
      expect(entry.title.length).toBeGreaterThan(0);
      for (const value of [entry.sourceUrl, entry.evidenceUrl]) {
        const url = new URL(value);
        expect(url.protocol).toBe('https:');
        expect(url.username + url.password).toBe('');
        expect(domains[entry.platform].some((domain) => url.hostname === domain || url.hostname.endsWith(`.${domain}`))).toBe(true);
      }
      const poster = new URL(entry.posterUrl);
      expect(poster.protocol).toBe('https:');
      expect(poster.username + poster.password).toBe('');
      expect(entry.verifiedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(entry.posterFile).toMatch(/^poster-[a-f0-9]{24}\.webp$/);
      const file = path.join(process.cwd(), 'public/posters/platform', entry.posterFile);
      expect(existsSync(file)).toBe(true);
      const bytes = readFileSync(file);
      expect(bytes.subarray(0, 4).toString()).toBe('RIFF');
      expect(bytes.subarray(8, 12).toString()).toBe('WEBP');
      expect(entry.posterWidth).toBeGreaterThanOrEqual(100);
      expect(entry.posterHeight).toBeGreaterThanOrEqual(80);
      expect(entry.posterWidth).toBeLessThanOrEqual(420);
      expect(entry.posterHeight).toBeLessThanOrEqual(700);
    }
  });

  it('browses without network or source configuration and returns isolated presentation objects', () => {
    const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
    try {
      const items = getPlatformItems('iqiyi', 'movie');
      const title = items[0].title;
      items[0].title = '调用方改变'; items[0].genres.push('调用方改变');
      const again = getPlatformItems('iqiyi', 'movie');
      expect(again[0].title).toBe(title);
      expect(again[0].genres).not.toContain('调用方改变');
      expect(fetcher).not.toHaveBeenCalled();
      expect(again.every((item) => item.bundledCover?.includes('/posters/platform/'))).toBe(true);
    } finally { vi.unstubAllGlobals(); }
  });

  it('respects the Pages deployment prefix for posters and preserves verified landscape artwork', async () => {
    vi.resetModules(); vi.stubEnv('NEXT_PUBLIC_APP_BASE_PATH', '/codex-cloud');
    try {
      const module = await import('./platform-catalog');
      const items = module.getPlatformItems('tencent', 'tv');
      expect(items.every((item) => item.bundledCover?.startsWith('/codex-cloud/posters/platform/'))).toBe(true);
      for (const item of items) {
        const entry = module.PLATFORM_CATALOG.find((entry) => item.id.endsWith(entry.sourceUrl));
        expect(item.coverShape).toBe(entry!.posterWidth > entry!.posterHeight ? 'landscape' : undefined);
      }
    } finally { vi.unstubAllEnvs(); vi.resetModules(); }
  });
});

'use client';

import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { DISCOVERY_LISTS, fetchDiscoveryList, filterDiscoveryItems, type DiscoveryFilter, type DiscoveryItem, type DiscoveryListId } from '@/lib/discovery';
import { PLATFORM_CHOICES, getPlatformItems, type PlatformId } from '@/lib/platform-catalog';
import { useAppStore } from '@/lib/store';
import { cn } from '@/lib/utils';
import { SmartImage } from './smart-image';
import { Icon } from './icon';

type DiscoveryType = 'movie' | 'tv' | 'show';
const TYPES: { id: DiscoveryType; label: string; lists: readonly DiscoveryListId[] }[] = [
  { id: 'movie', label: '电影', lists: ['douban_movie_weekly'] },
  { id: 'tv', label: '剧集', lists: ['douban_tv_chinese', 'douban_tv_global', 'baidu_teleplay'] },
  { id: 'show', label: '综艺', lists: ['douban_show_chinese', 'douban_show_global'] },
];
const FILTERS: { id: DiscoveryFilter; label: string }[] = [
  { id: 'all', label: '全部' },
  { id: 'high-rated', label: '8分以上' },
  { id: 'comedy', label: '喜剧' },
];

/** Public, real metadata only. Browsing stays independent of search and playback. */
export function DiscoverySection({ onPick }: { onPick: (title: string) => void }) {
  const enabled = useAppStore((state) => state.standaloneDiscoveryEnabled);
  return enabled ? <DiscoveryContent onPick={onPick} /> : null;
}

function DiscoveryContent({ onPick }: { onPick: (title: string) => void }) {
  const [type, setType] = useState<DiscoveryType>('movie');
  const [listId, setListId] = useState<DiscoveryListId>('douban_movie_weekly');
  const [platform, setPlatform] = useState<PlatformId | null>('iqiyi');
  const [filter, setFilter] = useState<DiscoveryFilter>('all');
  const selectedType = TYPES.find((entry) => entry.id === type)!;
  const selected = DISCOVERY_LISTS.find((entry) => entry.id === listId)!;
  const selectedPlatform = PLATFORM_CHOICES.find((entry) => entry.id === platform);
  const source = selectedPlatform
    ? `${selectedPlatform.label} · ${type === 'movie' ? '电影' : '电视剧'}精选`
    : selected.source;
  const query = useQuery({
    queryKey: ['standalone-discovery', listId],
    queryFn: ({ signal }) => fetchDiscoveryList(listId, signal),
    staleTime: 10 * 60_000,
    gcTime: 60 * 60_000,
    retry: false,
    enabled: platform === null,
  });
  const items = platform && type !== 'show'
    ? getPlatformItems(platform, type)
    : filterDiscoveryItems(query.data?.items ?? [], filter);
  const featured = items[0];
  const landscapeGrid = items.length > 0 && items.every((item) => item.coverShape === 'landscape');
  const contentKey = platform ? `${platform}:${type}` : String(query.dataUpdatedAt);

  return (
    <section aria-label="发现影视" className="vip-discovery mt-7 mb-8 min-w-0">
      <div className="flex items-center justify-between gap-3 mb-4">
        <div role="group" aria-label="选择影视类型" className="flex items-center gap-6 sm:gap-8">
          {TYPES.map((entry) => (
            <button key={entry.id} type="button" aria-pressed={entry.id === type}
              className={cn('vip-category min-h-11 min-w-11 relative text-xl sm:text-2xl font-semibold tracking-wide transition-colors', entry.id === type ? 'text-content' : 'text-faint hover:text-content')}
              onClick={() => {
                setType(entry.id);
                setListId(entry.lists[0]);
                setFilter('all');
                if (entry.id === 'show') setPlatform(null);
              }}>
              {entry.label}
              {entry.id === type && <span aria-hidden="true" className="absolute bottom-0 left-0 w-5 h-0.5 rounded-full bg-accent" />}
            </button>
          ))}
        </div>
        {platform === null && <button type="button" className="w-11 h-11 shrink-0 flex items-center justify-center rounded-full text-muted hover:bg-chip hover:text-content disabled:opacity-40"
          aria-label="刷新榜单" disabled={query.isFetching} onClick={() => void query.refetch()}>
          <Icon name="refresh" className={cn('w-4 h-4', query.isFetching && 'animate-spin')} />
        </button>}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-x-5 gap-y-1 mb-4">
        <div className="flex min-w-0 gap-1 overflow-x-auto max-w-full" role="group" aria-label="选择影视分类">
          {type !== 'show' && PLATFORM_CHOICES.map((entry) => (
            <button key={entry.id} type="button" aria-pressed={entry.id === platform}
              className={cn('min-h-11 shrink-0 px-3.5 rounded-full text-xs sm:text-sm transition-colors', entry.id === platform ? 'bg-accent/10 text-accent font-medium' : 'text-muted hover:bg-chip hover:text-content')}
              onClick={() => { setPlatform(entry.id); setFilter('all'); }}>{entry.label}</button>
          ))}
          {selectedType.lists.map((id) => {
            const list = DISCOVERY_LISTS.find((entry) => entry.id === id)!;
            return <button key={id} type="button" aria-pressed={platform === null && id === listId}
              className={cn('min-h-11 shrink-0 px-3.5 rounded-full text-xs sm:text-sm transition-colors', platform === null && id === listId ? 'bg-accent/10 text-accent font-medium' : 'text-muted hover:bg-chip hover:text-content')}
              onClick={() => { setPlatform(null); setListId(id); setFilter('all'); }}>{list.label}</button>;
          })}
        </div>
        {platform === null && selected.filterable && <div className="flex gap-1" role="group" aria-label="筛选当前榜单">
          {FILTERS.map((entry) => (
            <button key={entry.id} type="button" aria-pressed={filter === entry.id}
              className={cn('min-h-11 px-3 rounded-full text-xs transition-colors', filter === entry.id ? 'text-content font-semibold' : 'text-faint hover:text-content')}
              onClick={() => setFilter(entry.id)}>{entry.label}</button>
          ))}
        </div>}
      </div>

      {platform === null && query.isError && <div role="status" className="rounded-2xl border border-line bg-card px-5 py-4 mb-4 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted">榜单暂时没加载出来</p>
        <button type="button" className="min-h-11 px-3 text-sm text-accent" disabled={query.isFetching} onClick={() => void query.refetch()}>
          {query.isFetching ? '正在重试…' : '重试榜单'}
        </button>
      </div>}

      {platform === null && query.isPending ? <DiscoverySkeleton /> : featured ? <>
        <FeaturedFilm key={`${featured.id}:${contentKey}`} item={featured} source={source} onPick={onPick} />
        {items.length > 1 && <div className={cn('vip-poster-grid mt-5 grid gap-x-3 gap-y-5 sm:gap-x-4', landscapeGrid ? 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5' : 'grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6')} aria-label={source}>
          {items.slice(1).map((item) => <PosterCard key={`${item.id}:${contentKey}`} item={item} onPick={onPick} />)}
        </div>}
      </> : platform || query.data ? <p className="text-sm text-muted py-14 text-center">
        {platform ? '这个分类暂时没有内容。' : filter === 'comedy' ? '这个榜单里暂时没有喜剧，换个榜单看看。' : filter === 'high-rated' ? '这个榜单里暂时没有8分以上的作品。' : '暂时还没有内容，稍后再来看看。'}
      </p> : null}
    </section>
  );
}

function FilmCover({ item, className, eager = false }: { item: DiscoveryItem; className: string; eager?: boolean }) {
  const [failed, setFailed] = useState(false);
  const [bundledFailed, setBundledFailed] = useState(false);
  const fallbackKey = JSON.stringify(item.coverFallbacks ?? []);
  useEffect(() => { setFailed(false); setBundledFailed(false); }, [item.id, item.bundledCover, item.cover, fallbackKey]);
  if (item.bundledCover && !bundledFailed) {
    // This path comes from the bundled, reviewed catalog, not a user's API data.
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={item.bundledCover} alt="" className={className} loading={eager ? 'eager' : 'lazy'}
      onError={() => setBundledFailed(true)} />;
  }
  return item.cover && !failed ? <SmartImage url={item.cover} fallbackUrls={item.coverFallbacks} mode="direct" alt="" className={className}
    loading={eager ? 'eager' : 'lazy'} onExhausted={() => setFailed(true)} /> : <div className={cn(className, 'vip-cover-empty flex items-center justify-center')}>
    <svg aria-hidden="true" className="w-10 h-10 text-accent/40" viewBox="0 0 48 48" fill="none"><rect x="8" y="8" width="32" height="32" rx="8" stroke="currentColor" strokeWidth="1.5"/><path d="m21 17 11 7-11 7V17Z" fill="currentColor"/></svg>
  </div>;
}

function FeaturedFilm({ item, source, onPick }: { item: DiscoveryItem; source: string; onPick: (title: string) => void }) {
  return <button type="button" onClick={() => onPick(item.title)} aria-label={`搜索 ${item.title}`}
    className="vip-featured relative isolate block w-full overflow-hidden rounded-[24px] text-left text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70 group">
    <div className="absolute inset-0 overflow-hidden" aria-hidden="true">
      <FilmCover item={item} eager className="h-full w-full object-cover object-[center_30%] opacity-40 scale-105 blur-[2px]" />
      <div className="absolute inset-0 bg-gradient-to-r from-[#10151d] via-[#10151d]/80 to-[#10151d]/10" />
      <div className="absolute inset-0 bg-gradient-to-t from-[#10151d] via-transparent to-transparent" />
    </div>
    <div className="relative flex items-center justify-between gap-4 px-5 py-6 sm:px-8 sm:py-8 min-h-[236px] sm:min-h-[300px]">
      <div className="min-w-0 flex-1 max-w-xl">
        <p className="text-[10px] sm:text-xs tracking-[0.12em] text-[#d3b278] mb-3">
          {source}{item.rank !== undefined && <span aria-label={`原榜第${item.rank}名`}> · 第 {item.rank} 名</span>}
        </p>
        <h2 className="text-2xl sm:text-4xl font-semibold leading-tight tracking-tight line-clamp-3">{item.title}</h2>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-3 text-[11px] sm:text-sm text-white/60">
          {item.rating && <span className="text-[#e4c58e] font-medium">豆瓣 {item.rating}</span>}
          {item.genres.length > 0 && <span>{item.genres.slice(0, 2).join(' · ')}</span>}
        </div>
        <span className="inline-flex items-center justify-center gap-2 min-h-11 mt-5 rounded-full bg-[#d3b278] text-[#21190e] px-5 text-sm font-semibold shadow-sm group-hover:bg-[#e3c590] transition-colors">
          <svg aria-hidden="true" viewBox="0 0 20 20" className="w-4 h-4" fill="currentColor"><path d="M6 3.75a.75.75 0 0 1 1.14-.64l10 6.25a.75.75 0 0 1 0 1.28l-10 6.25A.75.75 0 0 1 6 16.25z"/></svg>
          找片观看
        </span>
      </div>
      <div className="w-[100px] sm:w-[150px] lg:w-[180px] shrink-0 rotate-[5deg] rounded-xl shadow-[0_18px_45px_rgba(0,0,0,0.5)] overflow-hidden border border-white/10 mr-1 sm:mr-3 transition-transform duration-300 group-hover:rotate-[2deg]">
        <FilmCover item={item} eager className={cn('w-full object-cover', item.coverShape === 'landscape' ? 'aspect-video' : 'aspect-[2/3]')} />
      </div>
    </div>
  </button>;
}

function PosterCard({ item, onPick }: { item: DiscoveryItem; onPick: (title: string) => void }) {
  return <button type="button" onClick={() => onPick(item.title)} aria-label={`搜索 ${item.title}`}
    className="text-left min-w-0 group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 rounded-xl">
    <div className={cn('relative overflow-hidden rounded-xl bg-chip shadow-sm', item.coverShape === 'landscape' ? 'aspect-video' : 'aspect-[2/3]')}>
      <FilmCover item={item} className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.04]" />
      <div aria-hidden="true" className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/65 to-transparent" />
      {item.rank !== undefined && <span aria-label={`原榜第${item.rank}名`} className="absolute top-2 left-2 text-white text-xs font-semibold tabular-nums drop-shadow-md">{String(item.rank).padStart(2, '0')}</span>}
      {item.rating && <span className="absolute bottom-2 right-2 text-[10px] sm:text-[11px] font-medium text-[#f1d39e]">豆瓣 {item.rating}</span>}
    </div>
    <h3 className="text-xs sm:text-sm font-medium text-content mt-2.5 line-clamp-2 leading-relaxed">{item.title}</h3>
  </button>;
}

function DiscoverySkeleton() {
  return <div aria-label="正在加载榜单">
    <div className="h-[236px] sm:h-[300px] rounded-[24px] bg-chip animate-pulse" />
    <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3 mt-5">
      {Array.from({ length: 6 }, (_, index) => <div key={index} className="aspect-[2/3] rounded-xl bg-chip animate-pulse" />)}
    </div>
  </div>;
}

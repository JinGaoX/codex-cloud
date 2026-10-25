'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { DISCOVERY_LISTS, fetchDiscoveryList, filterDiscoveryItems, type DiscoveryFilter, type DiscoveryListId } from '@/lib/discovery';
import { useAppStore } from '@/lib/store';
import { cn } from '@/lib/utils';
import { DoubanCard } from './video-card';

const FILTERS: { id: DiscoveryFilter; label: string }[] = [
  { id: 'all', label: '全部' },
  { id: 'high-rated', label: '8分以上' },
  { id: 'comedy', label: '喜剧' },
];

/** Small public discovery feed; failures never block search or the local library. */
export function DiscoverySection({ onPick }: { onPick: (title: string) => void }) {
  const enabled = useAppStore((state) => state.standaloneDiscoveryEnabled);
  return enabled ? <DiscoveryContent onPick={onPick} /> : null;
}

function DiscoveryContent({ onPick }: { onPick: (title: string) => void }) {
  const [listId, setListId] = useState<DiscoveryListId>('douban_movie_weekly');
  const [filter, setFilter] = useState<DiscoveryFilter>('all');
  const selected = DISCOVERY_LISTS.find((entry) => entry.id === listId)!;
  const query = useQuery({
    queryKey: ['standalone-discovery', listId],
    queryFn: ({ signal }) => fetchDiscoveryList(listId, signal),
    staleTime: 10 * 60_000,
    gcTime: 60 * 60_000,
    retry: false,
  });
  const items = filterDiscoveryItems(query.data?.items ?? [], filter);
  const receivedAt = query.data?.retrievedAt;

  return (
    <section aria-label="发现影视" className="mt-6 mb-5">
      <div className="mb-3">
        <h2 className="text-lg font-semibold tracking-tight text-content">发现好片</h2>
        <p className="text-xs text-muted leading-5 mt-1">按榜单找片，点击海报搜索已启用的片源。</p>
      </div>

      <div className="flex gap-1.5 overflow-x-auto pb-2 -mx-1 px-1" role="group" aria-label="选择影视榜单">
        {DISCOVERY_LISTS.map((list) => (
          <button
            key={list.id}
            type="button"
            aria-pressed={list.id === listId}
            className={cn('min-h-11 shrink-0 px-3.5 rounded-xl text-sm transition-colors', list.id === listId ? 'bg-accent text-on-accent' : 'bg-chip text-muted hover:text-content')}
            onClick={() => { setListId(list.id); setFilter('all'); }}
          >{list.label}</button>
        ))}
      </div>

      <div className="flex items-center flex-wrap gap-x-3 gap-y-1 mb-3">
        <div className="flex gap-1" role="group" aria-label="筛选当前榜单">
          {FILTERS.map((entry) => (
            <button
              key={entry.id}
              type="button"
              aria-pressed={filter === entry.id}
              disabled={!selected.filterable && entry.id !== 'all'}
              className={cn('min-h-11 px-3 rounded-full text-xs transition-colors disabled:opacity-40', filter === entry.id ? 'text-accent bg-accent/10' : 'text-muted hover:text-content')}
              onClick={() => setFilter(entry.id)}
            >{entry.label}</button>
          ))}
        </div>
        <span className="text-[11px] text-faint">{selected.filterable ? '仅筛选当前榜单' : '本榜单不提供评分和类型'}</span>
      </div>

      {query.isError && (
        <div role="status" className="rounded-xl border border-line bg-chip p-4 mb-3">
          <p className="text-sm text-muted">榜单暂时无法加载，仍可正常搜索和继续观看。</p>
          <button type="button" className="btn-ghost min-h-11 mt-2 text-accent" disabled={query.isFetching} onClick={() => void query.refetch()}>
            {query.isFetching ? '正在重试…' : '重试榜单'}
          </button>
        </div>
      )}

      {query.isPending ? (
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-2.5" aria-label="正在加载榜单">
          {Array.from({ length: 6 }, (_, index) => <div key={index} className="aspect-[2/3] rounded-xl bg-chip animate-pulse" />)}
        </div>
      ) : items.length > 0 ? (
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-2.5" aria-label={selected.source}>
          {items.map((item) => (
            <div key={item.id} className="relative min-w-0">
              <DoubanCard item={item} onClick={() => onPick(item.title)} />
              {item.rank !== undefined && <span aria-label={`原榜第${item.rank}名`} className="pointer-events-none absolute top-1.5 left-1.5 rounded-md bg-black/75 text-white px-1.5 py-1 text-[11px] font-medium tabular-nums">{item.rank}</span>}
            </div>
          ))}
        </div>
      ) : query.data ? (
        <p className="text-sm text-muted py-6 text-center">当前榜单暂无{filter === 'comedy' ? '喜剧作品' : filter === 'high-rated' ? '8分以上的作品' : '内容'}，可以切换榜单或筛选。</p>
      ) : null}

      <p className="text-[11px] text-faint leading-5 mt-3">
        来源：{selected.source} · 60s API
        {receivedAt ? ` · 本机获取于 ${new Date(receivedAt).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })}` : ''}
        <br />第三方榜单可能有延迟；推荐不代表片源一定可播放。
      </p>
    </section>
  );
}

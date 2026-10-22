'use client';

import { useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, removeFavorite, type FavoriteEntry } from '@/lib/db';
import { useAppStore } from '@/lib/store';
import { Drawer } from './drawer';
import { DetailModal } from './detail-modal';
import { SmartImage } from './smart-image';
import { EmptyState, ErrorState, LoadingState } from './states';
import { Icon } from './icon';
import { useToast } from './toast';

/** 收藏与观看历史分开保存，清空历史或删除源都不会移除收藏。 */
export function FavoritesPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const result = useLiveQuery(async () => {
    try { return { items: await db.favorites.orderBy('timestamp').reverse().toArray(), error: false }; }
    catch { return { items: [] as FavoriteEntry[], error: true }; }
  }, [open]);
  const [query, setQuery] = useState('');
  const [detailItem, setDetailItem] = useState<FavoriteEntry | null>(null);
  useEffect(() => { if (!open) { setQuery(''); setDetailItem(null); } }, [open]);
  const visible = useMemo(() => result?.items.filter((item) =>
    item.name.toLowerCase().includes(query.trim().toLowerCase())) ?? [], [result, query]);

  return (
    <>
      <Drawer open={open} onClose={onClose} title="我的收藏" width="max-w-lg"
        subheader={result && result.items.length > 0 ? (
          <input className="input w-full h-10" aria-label="搜索收藏" placeholder="搜索收藏的影片..."
            value={query} onChange={(event) => setQuery(event.target.value)} />
        ) : undefined}>
        {!result ? <LoadingState /> : result.error ? (
          <ErrorState message="无法读取本机收藏，请检查浏览器是否允许存储数据" />
        ) : visible.length === 0 ? (
          <EmptyState variant="plain" title={query ? '没有匹配的收藏' : '暂无收藏'}
            description={query ? undefined : '在影片详情中点击「收藏」，下次从这里继续选集播放。'} />
        ) : (
          <ul className="space-y-2">
            {visible.map((item) => <FavoriteItem key={item.id} item={item} onOpen={() => setDetailItem(item)} />)}
          </ul>
        )}
      </Drawer>
      <DetailModal item={detailItem} onClose={() => setDetailItem(null)} />
    </>
  );
}

function FavoriteItem({ item, onOpen }: { item: FavoriteEntry; onOpen: () => void }) {
  const mode = useAppStore((state) => state.imageProxyMode);
  const customProxy = useAppStore((state) => state.customImageProxy);
  const [imageFailed, setImageFailed] = useState(false);
  const { toast } = useToast();
  return (
    <li className="flex items-center gap-2 rounded-lg bg-card p-3">
      <button className="flex min-w-0 flex-1 items-center gap-3 text-left" onClick={onOpen}>
        {item.pic && !imageFailed && <SmartImage url={item.pic} mode={mode} customProxy={customProxy}
          alt="" className="w-12 aspect-[2/3] rounded object-cover shrink-0" onExhausted={() => setImageFailed(true)} />}
        <span className="min-w-0">
          <span className="block truncate text-sm font-medium text-content">{item.name}</span>
          <span className="block truncate text-xs text-faint mt-1">{[item.sourceName, item.year].filter(Boolean).join(' · ')}</span>
          <span className="block text-xs text-accent mt-1">查看详情与选集</span>
        </span>
      </button>
      <button className="p-2 rounded-md text-faint hover:text-danger hover:bg-hover" aria-label={`取消收藏 ${item.name}`}
        onClick={() => { void removeFavorite(item.sourceKey, item.vodId)
          .then(() => toast('已取消收藏', 'info')).catch(() => toast('保存失败，请检查浏览器存储空间', 'error')); }}>
        <Icon name="trash" className="w-4 h-4" />
      </button>
    </li>
  );
}

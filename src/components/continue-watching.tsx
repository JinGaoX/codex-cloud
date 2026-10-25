'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type HistoryEntry } from '@/lib/db';
import { requestAppPanel } from '@/lib/app-navigation';
import { DIRECT_MEDIA_SOURCE } from '@/lib/standalone-media';
import { resolveSource, useAppStore } from '@/lib/store';
import { buildWatchUrl, cn, formatTime } from '@/lib/utils';
import { Icon } from './icon';
import { SmartImage } from './smart-image';

/** Real local records only: an empty device never gets sample films. */
export function ContinueWatching() {
  const history = useLiveQuery(() => db.history.orderBy('timestamp').reverse().limit(3).toArray().catch(() => []), []);
  if (!history?.length) return null;
  return (
    <section className="w-full mx-auto mb-7 min-w-0" aria-labelledby="continue-watching-title">
      <div className="flex items-center justify-between gap-3 mb-2">
        <h2 id="continue-watching-title" className="text-base sm:text-lg font-semibold text-content">接着上次看</h2>
        <button type="button" className="min-h-11 px-1 text-xs text-muted hover:text-content inline-flex items-center gap-1" onClick={() => requestAppPanel('history')}>
          全部记录<span aria-hidden="true">›</span>
        </button>
      </div>
      <div className={cn('grid gap-3 pb-1 snap-x snap-mandatory [scrollbar-width:none]', history.length > 1
        ? 'grid-flow-col auto-cols-[82%] overflow-x-auto sm:grid-flow-row sm:auto-cols-auto sm:grid-cols-2 lg:grid-cols-3'
        : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3')}>
        {history.map((item) => <ResumeCard key={item.id} item={item} />)}
      </div>
    </section>
  );
}

function ResumeCard({ item }: { item: HistoryEntry }) {
  const [imageFailed, setImageFailed] = useState(false);
  const customAPIs = useAppStore((state) => state.customAPIs);
  const envSources = useAppStore((state) => state.envSources);
  const source = resolveSource({ customAPIs, envSources }, item.sourceKey, { url: item.sourceUrl });
  const position = Number.isFinite(item.playbackPosition) ? Math.max(0, item.playbackPosition) : 0;
  const percent = item.duration > 0 ? Math.min(100, Math.round(position / item.duration * 100)) : 0;
  const href = buildWatchUrl({
    sourceKey: item.sourceKey, vodId: item.vodId, index: item.episodeIndex, title: item.title,
    sourceUrl: source?.url, detail: source?.detail,
    episodeUrl: item.sourceKey === DIRECT_MEDIA_SOURCE ? item.vodId : undefined,
  });
  return <Link href={href} aria-label={`继续观看 ${item.title}`}
    className="vip-resume-card snap-start min-w-0 overflow-hidden rounded-2xl border border-line bg-card hover:bg-hover active:bg-hover transition-colors">
    <div className="flex items-center gap-3 p-3">
      <div className="w-14 h-[76px] rounded-lg overflow-hidden shrink-0 bg-accent/10 text-accent/50 flex items-center justify-center">
        {item.pic && !imageFailed ? <SmartImage url={item.pic} mode="direct" alt="" className="w-full h-full object-cover" onExhausted={() => setImageFailed(true)} /> : <Icon name="clock" className="w-6 h-6" />}
      </div>
      <div className="flex-1 min-w-0 py-1">
        <p className="text-sm font-medium text-content truncate">{item.title}</p>
        <p className="text-[11px] text-faint mt-1.5 truncate">{item.totalEpisodes > 1 ? `第 ${item.episodeIndex + 1} 集 · ` : ''}{position > 0 ? `看到 ${formatTime(position)}` : '继续观看'}</p>
        <span className="inline-flex items-center gap-1 mt-3 text-[11px] text-accent font-medium">继续播放<svg viewBox="0 0 16 16" className="w-3 h-3" fill="currentColor" aria-hidden="true"><path d="m6 3 7 5-7 5V3Z" /></svg></span>
      </div>
    </div>
    <div className="h-0.5 bg-chip overflow-hidden" aria-hidden="true"><div className="h-full bg-accent rounded-r-full" style={{ width: `${percent}%` }} /></div>
  </Link>;
}

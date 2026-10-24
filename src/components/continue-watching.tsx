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

/** Only real local records appear here; an empty device never gets sample films. */
export function ContinueWatching() {
  const history = useLiveQuery(() => db.history.orderBy('timestamp').reverse().limit(3).toArray().catch(() => []), []);
  if (!history?.length) return null;
  return (
    <section className="w-full max-w-2xl lg:max-w-none mx-auto mb-6 min-w-0" aria-labelledby="continue-watching-title">
      <div className="flex items-center justify-between gap-3 mb-2">
        <h2 id="continue-watching-title" className="text-base font-semibold text-content">继续观看</h2>
        <button type="button" className="min-h-11 px-1 text-xs text-muted hover:text-content" onClick={() => requestAppPanel('history')}>全部记录</button>
      </div>
      <div className={cn('grid gap-3 pb-1 snap-x snap-mandatory [scrollbar-width:none]', history.length > 1
        ? 'grid-flow-col auto-cols-[85%] overflow-x-auto sm:grid-flow-row sm:auto-cols-auto sm:grid-cols-2 lg:grid-cols-3'
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
  return (
    <Link href={href} aria-label={`继续观看 ${item.title}`} className="snap-start min-w-0 flex items-center gap-3 rounded-2xl border border-line bg-card p-3 hover:bg-hover active:bg-hover transition-colors">
      <div className="w-12 h-16 rounded-lg overflow-hidden shrink-0 bg-accent/10 text-accent flex items-center justify-center">
        {item.pic && !imageFailed ? <SmartImage url={item.pic} mode="direct" alt="" className="w-full h-full object-cover" onExhausted={() => setImageFailed(true)} /> : <Icon name="clock" />}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-content truncate">{item.title}</p>
        <p className="text-xs text-muted mt-1 truncate">{item.totalEpisodes > 1 ? `第 ${item.episodeIndex + 1} 集 · ` : ''}{position > 0 ? `看到 ${formatTime(position)}` : '接着上次继续看'}</p>
        <div className="h-1 bg-chip rounded-full overflow-hidden mt-3" aria-hidden="true"><div className="h-full bg-accent rounded-full" style={{ width: `${percent}%` }} /></div>
      </div>
      <svg viewBox="0 0 24 24" className="w-8 h-8 text-accent shrink-0" fill="currentColor" aria-hidden="true"><path d="M8 5.5a1 1 0 0 1 1.52-.85l9 5.5a1 1 0 0 1 0 1.7l-9 5.5A1 1 0 0 1 8 16.5z" /></svg>
    </Link>
  );
}

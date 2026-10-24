'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { directMediaWatchUrl } from '@/lib/standalone-media';
import { Icon } from './icon';

/** Useful before any CMS source is configured; this is a link player, never a sample source. */
export function DirectMediaEntry() {
  const router = useRouter();
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');
  return (
    <section className="w-full max-w-2xl mx-auto mb-6 rounded-2xl border border-line bg-card overflow-hidden" aria-label="播放视频链接">
      <details className="group">
        <summary className="min-h-16 p-4 flex items-center gap-3 cursor-pointer list-none [&::-webkit-details-marker]:hidden">
          <span className="w-10 h-10 rounded-xl bg-chip text-muted flex items-center justify-center shrink-0"><Icon name="link" /></span>
          <span className="flex-1 min-w-0"><span className="block text-sm font-medium text-content">播放视频链接</span><span className="block text-xs text-muted mt-1">打开自己的 MP4 或 HLS 视频</span></span>
          <Icon name="chevronDown" className="w-4 h-4 text-faint shrink-0 transition-transform group-open:rotate-180" />
        </summary>
        <div className="px-4 pb-4">
          <form className="flex gap-2" onSubmit={(event) => {
            event.preventDefault();
            try { const href = directMediaWatchUrl(url); setError(''); router.push(href); }
            catch (reason) { setError(reason instanceof Error ? reason.message : '请检查视频链接'); }
          }}>
            <input className="input flex-1 min-w-0 min-h-12" aria-label="HTTPS 视频链接" placeholder="https://…"
              value={url} onChange={(event) => { setUrl(event.target.value); setError(''); }}
              inputMode="url" enterKeyHint="go" autoCapitalize="none" autoCorrect="off" spellCheck={false} />
            <button className="btn-primary shrink-0 min-h-12" type="submit">播放</button>
          </form>
          {error && <p role="alert" className="text-xs text-danger mt-2">{error}</p>}
          <p className="text-xs text-faint leading-5 mt-3">仅播放你有权访问的 HTTPS 内容。播放进度保存在本机。<a href="https://developer.apple.com/streaming/examples/advanced-stream-hevc.html" target="_blank" rel="noopener noreferrer" className="underline ml-1">试播来源</a></p>
        </div>
      </details>
      <div className="px-4 py-2 border-t border-line flex items-center gap-3">
        <p className="flex-1 min-w-0 text-xs text-muted">先确认手机播放是否正常</p>
        <button className="btn-ghost text-xs shrink-0 min-h-11" onClick={() => router.push(directMediaWatchUrl(
          'https://devstreaming-cdn.apple.com/videos/streaming/examples/bipbop_adv_example_hevc/master.m3u8',
          'Apple 官方 HLS 试播',
        ))}>Apple 官方试播</button>
      </div>
    </section>
  );
}

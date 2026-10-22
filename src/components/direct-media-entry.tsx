'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { directMediaWatchUrl } from '@/lib/standalone-media';

/** Useful before any CMS source is configured; this is a link player, never a sample source. */
export function DirectMediaEntry() {
  const router = useRouter();
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');
  return (
    <section className="max-w-2xl mx-auto mb-6 rounded-xl border border-line bg-card p-4" aria-label="播放视频链接">
      <h2 className="text-sm font-semibold text-content mb-1">播放视频链接</h2>
      <p className="text-xs text-muted mb-3">粘贴可直接访问的 MP4 或 m3u8 链接，在手机上播放。</p>
      <form className="flex gap-2" onSubmit={(event) => {
        event.preventDefault();
        try { const href = directMediaWatchUrl(url); setError(''); router.push(href); }
        catch (reason) { setError(reason instanceof Error ? reason.message : '请检查视频链接'); }
      }}>
        <input className="input flex-1 min-w-0" aria-label="HTTPS 视频链接" placeholder="https://…"
          value={url} onChange={(event) => { setUrl(event.target.value); setError(''); }}
          inputMode="url" autoCapitalize="none" autoCorrect="off" spellCheck={false} />
        <button className="btn-primary shrink-0" type="submit">播放</button>
      </form>
      {error && <p role="alert" className="text-xs text-danger mt-2">{error}</p>}
      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
        <button className="btn-ghost btn-sm" onClick={() => router.push(directMediaWatchUrl(
          'https://devstreaming-cdn.apple.com/videos/streaming/examples/bipbop_adv_example_hevc/master.m3u8',
          'Apple 官方 HLS 试播',
        ))}>Apple 官方试播</button>
        <a href="https://developer.apple.com/streaming/examples/advanced-stream-hevc.html" target="_blank"
          rel="noopener noreferrer" className="text-faint underline">示例来源</a>
      </div>
      <p className="text-[11px] text-faint mt-2">仅播放你有权访问的 HTTPS 内容。播放进度保存在本机。</p>
    </section>
  );
}

'use client';

import { useEffect, useState } from 'react';
import { buildImageCandidates } from '@/lib/utils';
import { IS_STANDALONE } from '@/lib/runtime-mode';
import { standaloneImageCandidates } from '@/lib/standalone-media';

interface SmartImageProps {
  /** 原始图片地址（未经代理加工，降级链由本组件按加载方式生成） */
  url?: string;
  mode: 'direct' | 'proxy' | 'custom';
  customProxy?: string;
  /** Explicit public image alternatives from the caller; validated as HTTPS. */
  fallbackUrls?: readonly string[];
  alt: string;
  className?: string;
  loading?: 'lazy' | 'eager';
  /** 候选链耗尽后回调，调用方切换占位图等兜底 UI */
  onExhausted?: () => void;
}

/**
 * 带降级链的封面图组件：direct 模式按 buildImageCandidates 的顺序加载，
 * onError 逐级回退（豆瓣图：直连 → 公共镜像 → 内置代理）；
 * 全部失败后触发 onExhausted 并停止渲染，由调用方展示占位图。
 * referrerPolicy=no-referrer：不向图床暴露来源页，规避部分站点的 Referer 校验。
 */
export function SmartImage({
  url,
  mode,
  customProxy = '',
  fallbackUrls = [],
  alt,
  className,
  loading = 'lazy',
  onExhausted,
}: SmartImageProps) {
  const primaryCandidates = IS_STANDALONE
    ? standaloneImageCandidates(url)
    : buildImageCandidates(url, mode, customProxy);
  const candidates = [...new Set([
    ...primaryCandidates,
    ...fallbackUrls.flatMap((fallback) => standaloneImageCandidates(fallback)),
  ])];
  const candidateKey = JSON.stringify(candidates);
  const [idx, setIdx] = useState(0);

  // 地址或加载方式变化时重置降级进度
  useEffect(() => setIdx(0), [url, mode, customProxy, candidateKey]);
  useEffect(() => {
    if (idx >= candidates.length) onExhausted?.();
    // 候选数组随 url/mode 变化，length 是充分的稳定信号
  }, [idx, candidates.length, onExhausted]);

  const src = candidates[idx];
  if (!src) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      className={className}
      loading={loading}
      referrerPolicy="no-referrer"
      onError={() => setIdx((i) => i + 1)}
    />
  );
}

import { buildWatchUrl } from './utils';

/** Reserved local-history source for a user's own direct media link. */
export const DIRECT_MEDIA_SOURCE = '__direct__';

/** The independent app never sends media through a local or public proxy. */
export function standaloneMediaUrl(input: string): string {
  let url: URL;
  try { url = new URL(input.trim()); }
  catch { throw new Error('请输入完整的 HTTPS 视频链接'); }
  if (url.protocol !== 'https:' || url.username || url.password) {
    throw new Error('请使用不含账号密码的 HTTPS 视频链接');
  }
  return url.href;
}

export function directMediaWatchUrl(input: string, title?: string): string {
  const url = standaloneMediaUrl(input);
  return buildWatchUrl({
    sourceKey: DIRECT_MEDIA_SOURCE,
    // A direct link has no CMS identifier. Keep this single URL locally so history can reopen it.
    vodId: url,
    episodeUrl: url,
    title: title?.trim() || `视频 · ${new URL(url).hostname}`,
  });
}

export function standaloneImageCandidates(input: string | undefined): string[] {
  if (!input) return [];
  try { return [standaloneMediaUrl(input)]; }
  catch { return []; }
}

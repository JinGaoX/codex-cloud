/** Public build-time deployment prefix; empty for the original root-hosted app. */
const configuredPath = (process.env.NEXT_PUBLIC_APP_BASE_PATH || '').trim().replace(/\/+$/, '');
export const APP_BASE_PATH = configuredPath && configuredPath !== '/'
  ? `/${configuredPath.replace(/^\/+/, '')}`
  : '';

/** Public files and raw browser URLs need the prefix; Next Link/router add it themselves. */
export function appPath(rootRelativeUrl: string): string {
  if (!APP_BASE_PATH || !rootRelativeUrl.startsWith('/') || rootRelativeUrl.startsWith('//')) {
    return rootRelativeUrl;
  }
  if (rootRelativeUrl === APP_BASE_PATH || rootRelativeUrl.startsWith(`${APP_BASE_PATH}/`) ||
    rootRelativeUrl.startsWith(`${APP_BASE_PATH}?`) || rootRelativeUrl.startsWith(`${APP_BASE_PATH}#`)) {
    return rootRelativeUrl;
  }
  return `${APP_BASE_PATH}${rootRelativeUrl}`;
}

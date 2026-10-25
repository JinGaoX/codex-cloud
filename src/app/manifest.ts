import type { MetadataRoute } from 'next';
export const dynamic = 'force-static';
import { APP_BRAND } from '@/lib/app-brand';
import { appPath } from '@/lib/app-path';

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: appPath('/'),
    name: APP_BRAND.name,
    short_name: APP_BRAND.shortName,
    description: APP_BRAND.description,
    start_url: appPath('/'),
    scope: appPath('/'),
    lang: 'zh-CN',
    display: 'standalone',
    orientation: 'any',
    background_color: APP_BRAND.backgroundColor,
    theme_color: APP_BRAND.themeColor,
    icons: [
      {
        src: APP_BRAND.icons.small,
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: APP_BRAND.icons.large,
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
    ],
  };
}

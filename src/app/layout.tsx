import type { Metadata, Viewport } from 'next';
import './globals.css';
import { Providers } from '@/components/providers';
import { PwaRuntime } from '@/components/pwa-runtime';
import { DeviceLockGate } from '@/components/device-lock-gate';
import { APP_BRAND } from '@/lib/app-brand';
import { appPath } from '@/lib/app-path';
import { IS_STANDALONE } from '@/lib/runtime-mode';
import type { CSSProperties } from 'react';

export const metadata: Metadata = {
  title: {
    default: `${APP_BRAND.name} - ${APP_BRAND.description}`,
    template: `%s - ${APP_BRAND.name}`,
  },
  description: APP_BRAND.description,
  applicationName: APP_BRAND.name,
  appleWebApp: { capable: true, title: APP_BRAND.shortName, statusBarStyle: 'black-translucent' },
  formatDetection: { telephone: false },
  manifest: appPath('/manifest.webmanifest'),
  // 图标与门户站（LibreTV-portal）同一套：同一张 artwork 导出的多尺寸 + 根目录 favicon.ico 兜底。
  // 只声明单张 512 时，抓取端只能拿大图缩放，小尺寸下易糊、看起来「没填满」。
  icons: {
    icon: [
      { url: APP_BRAND.icons.favicon, sizes: '48x48' },
      { url: appPath('/icons/icon-96.png'), sizes: '96x96', type: 'image/png' },
      { url: APP_BRAND.icons.small, sizes: '192x192', type: 'image/png' },
      { url: APP_BRAND.icons.large, sizes: '512x512', type: 'image/png' },
    ],
    apple: [{ url: APP_BRAND.icons.apple, sizes: '180x180', type: 'image/png' }],
  },
};

export const viewport: Viewport = {
  themeColor: APP_BRAND.themeColor,
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="zh-CN"
      suppressHydrationWarning
      style={{
        '--brand-light-accent': APP_BRAND.colors.lightAccent,
        '--brand-light-accent-hover': APP_BRAND.colors.lightAccentHover,
        '--brand-dark-accent': APP_BRAND.colors.darkAccent,
        '--brand-dark-accent-hover': APP_BRAND.colors.darkAccentHover,
        '--brand-gradient-start': APP_BRAND.colors.gradientStart,
        '--brand-gradient-end': APP_BRAND.colors.gradientEnd,
      } as CSSProperties}
    >
      <head>
        {/* 首屏前同步主题，避免亮暗闪烁 */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "(function(){try{var t=localStorage.getItem('libretv-theme')||'dark';var d=t==='dark'||(t==='system'&&window.matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.classList.toggle('dark',d);}catch(e){}})()",
          }}
        />
      </head>
      <body className={IS_STANDALONE ? 'app-shell-mode' : undefined}>
        <Providers><DeviceLockGate>{children}</DeviceLockGate></Providers>
        <PwaRuntime />
      </body>
    </html>
  );
}

/**
 * 公开品牌配置：iPhone PWA 与未来 Capacitor 共用。
 * 只放可公开的信息；修改名称/图标后重新构建，已安装的 iPhone 图标可能需重新添加。
 */
import { IS_STANDALONE } from './runtime-mode';

export const APP_BRAND = {
  name: IS_STANDALONE ? 'LibreTV 随身版' : 'LibreTV',
  shortName: 'LibreTV',
  description: IS_STANDALONE ? '手机独立影视播放器' : '私人影视搜索与观看平台',
  themeColor: '#0b101a',
  backgroundColor: '#0b101a',
  // 公开的修改版源码地址；未指定仓库时由构建生成可下载的源码归档。
  sourceUrl: process.env.NEXT_PUBLIC_SOURCE_URL || '/source-code.tar.gz',
  icons: {
    favicon: '/favicon.ico',
    apple: '/icons/apple-touch-icon.png',
    small: '/icons/icon-192.png',
    large: '/icons/icon-512.png',
  },
  colors: {
    lightAccent: '37 99 235',
    lightAccentHover: '29 78 216',
    darkAccent: '0 184 230',
    darkAccentHover: '51 214 255',
    gradientStart: '#00ccff',
    gradientEnd: '#ff3c78',
  },
} as const;

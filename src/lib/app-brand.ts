/**
 * 公开品牌配置：iPhone PWA 与未来 Capacitor 共用。
 * 只放可公开的信息；修改名称/图标后重新构建，已安装的 iPhone 图标可能需重新添加。
 */
import { appPath } from './app-path';

export const APP_BRAND = {
  name: 'VIP影视',
  shortName: 'VIP影视',
  description: '为家人准备的私人影视播放器',
  themeColor: '#0b0e14',
  backgroundColor: '#0b0e14',
  // 公开的修改版源码地址；未指定仓库时由构建生成可下载的源码归档。
  sourceUrl: appPath(process.env.NEXT_PUBLIC_SOURCE_URL || '/source-code.tar.gz'),
  icons: {
    favicon: appPath('/favicon.ico'),
    apple: appPath('/icons/vip-apple-touch-icon.png'),
    small: appPath('/icons/vip-icon-192.png'),
    large: appPath('/icons/vip-icon-512.png'),
  },
  colors: {
    lightAccent: '139 99 42',
    lightAccentHover: '113 76 28',
    darkAccent: '211 178 120',
    darkAccentHover: '232 204 153',
    gradientStart: '#eedbb4',
    gradientEnd: '#ba8f4c',
  },
} as const;

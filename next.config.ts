import type { NextConfig } from 'next';
import fs from 'node:fs';
import path from 'node:path';

/** 版本号以 package.json 为单一来源，构建时注入 process.env.APP_VERSION（/api/status 使用） */
function readAppVersion(): string {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'package.json'), 'utf8')) as {
      version?: string;
    };
    return pkg.version || '0.0.0';
  } catch {
    return '0.0.0';
  }
}

// A project Pages site lives below /repo-name; native and default exports stay at /.
const appBasePath = process.env.NEXT_PUBLIC_APP_MODE === 'standalone'
  ? (process.env.NEXT_PUBLIC_APP_BASE_PATH || '')
  : '';
if (appBasePath && (!/^\/(?:[A-Za-z0-9_~.-]+)(?:\/[A-Za-z0-9_~.-]+)*$/.test(appBasePath)
  || appBasePath.split('/').some((part) => part === '.' || part === '..'))) {
  throw new Error('NEXT_PUBLIC_APP_BASE_PATH must be a root-relative path without trailing slash, query or traversal.');
}

const nextConfig: NextConfig = {
  // standalone 输出仅供 Docker 镜像构建使用（DOCKER_BUILD=1）；
  // 本地 next start 在 standalone 模式下不受支持，故按环境切换
  output: ['standalone', 'native'].includes(process.env.NEXT_PUBLIC_APP_MODE || '')
    ? 'export'
    : process.env.DOCKER_BUILD === '1' ? 'standalone' : undefined,
  reactStrictMode: true,
  basePath: appBasePath || undefined,
  // Directory routes can be opened directly on GitHub Pages without rewrite rules.
  trailingSlash: appBasePath ? true : undefined,
  env: { APP_VERSION: readAppVersion() },
  // 采集站/豆瓣等上游地址在运行时由用户配置，构建期无法枚举，关闭图片优化改用 <img>
  images: { unoptimized: true },
  headers: ['standalone', 'native'].includes(process.env.NEXT_PUBLIC_APP_MODE || '') ? undefined : async () => {
    return [
      {
        source: '/api/:path*',
        headers: [{ key: 'Cache-Control', value: 'private, no-store' }],
      },
      {
        source: '/sw.js',
        headers: [
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
          { key: 'Service-Worker-Allowed', value: '/' },
        ],
      },
    ];
  },
};

export default nextConfig;

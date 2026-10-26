'use client';

import { Header } from '@/components/header';
import { SiteFooter } from '@/components/site-footer';
import { APP_BRAND } from '@/lib/app-brand';
import { IS_STANDALONE } from '@/lib/runtime-mode';
import { useAuth } from '@/components/auth';
import { PLATFORM_CATALOG, PLATFORM_CHOICES } from '@/lib/platform-catalog';

export default function AboutPage() {
  const { version } = useAuth();
  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 max-w-2xl w-full mx-auto px-5 py-8 sm:py-12 space-y-8">
        <section className="flex items-center gap-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={APP_BRAND.icons.large} alt="" className="w-20 h-20 rounded-[22px]" />
          <div>
            <h1 className="text-2xl font-semibold tracking-wide text-content">关于 {APP_BRAND.shortName}</h1>
            <p className="text-sm text-muted mt-2">一方银幕，一起看好片。</p>
            {version && <p className="text-xs text-faint mt-2">版本 {version}</p>}
          </div>
        </section>
        <section className="rounded-2xl border border-line bg-surface-raised p-5">
          <h2 className="text-base font-semibold text-content mb-3">为相聚留一点好时光</h2>
          <p className="text-sm text-muted leading-7">找一部电影，追一部好剧，接着上次继续看。{APP_BRAND.shortName} 基于你添加的片源提供搜索、选集和播放，并保存本机收藏与进度。</p>
          <p className="text-sm text-muted leading-7 mt-2">播放页可设置定时停止，或者在本集结束后停止。倒计时以实际经过的时间计算；手机系统可能限制后台执行，回到应用时会重新检查截止时间。</p>
        </section>
        <section>
          <h2 className="text-base font-semibold text-content mb-3">你的记录，留在本机</h2>
          <p className="text-sm text-muted leading-7">片源配置、收藏和观看记录保存在当前设备，本版不要求开屏密码。可在设置中导出备份；清除网站数据或卸载可能移除这些记录。</p>
          <p className="text-sm text-muted leading-7 mt-2">{IS_STANDALONE ? '搜索和视频由设备直接访问你选择的来源。' : '搜索由你部署的服务处理。'}来源会收到正常网络请求；本应用不存储或下载影片。</p>
        </section>
        <details className="rounded-2xl border border-line px-5 py-1">
          <summary className="min-h-12 cursor-pointer text-sm font-medium text-content">榜单与影片信息</summary>
          <p className="text-sm text-muted leading-7 pb-4">首页榜单通过 <a className="text-accent" href="https://github.com/vikiboss/60s" target="_blank" rel="noopener noreferrer">60s API</a> 读取豆瓣周榜和百度热播剧榜。评分按来源显示，喜剧和8分以上筛选只作用于当前榜单。推荐条目用于搜索你的片源，实际收录、播放及清晰度以来源为准。</p>
          <p className="text-sm text-muted leading-7 pb-4">爱奇艺、优酷、腾讯视频的电影和电视剧精选按平台公开页面核对，腾讯条目也参考其WeTV官方信息。片单随应用版本更新，不代表完整片库、独播关系、各地区可播放性或实时热播排名。精选缩略海报随程序保存，完整缓存后可在离线时浏览；搜索和播放仍需网络及可用片源。</p>
          <details className="mb-4 rounded-xl border border-line px-3">
            <summary className="min-h-11 flex items-center cursor-pointer text-sm text-content">平台精选来源</summary>
            <div className="pb-3 space-y-4">
              {PLATFORM_CHOICES.map((platform) => <div key={platform.id}>
                <h3 className="text-sm font-medium text-content mb-2">{platform.label}</h3>
                <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-3">
                  {PLATFORM_CATALOG.filter((entry) => entry.platform === platform.id).map((entry) => <li key={`${entry.type}:${entry.sourceUrl}`}>
                    <a className="inline-flex min-h-11 items-center text-xs text-accent break-words" href={entry.sourceUrl} target="_blank" rel="noopener noreferrer">{entry.title} · {entry.type === 'movie' ? '电影' : '电视剧'}</a>
                  </li>)}
                </ul>
              </div>)}
              <p className="text-xs text-faint leading-6">核对日期：{PLATFORM_CATALOG[0]?.verifiedAt}。影片名称和海报归相关权利人所有，缩略海报仅用于影片信息展示；应用代码许可证不改变这些素材的权利。</p>
            </div>
          </details>
        </details>
        <section>
          <h2 className="text-base font-semibold text-content mb-3">开源与版权</h2>
          <p className="text-sm text-muted leading-7">本项目基于 <a className="text-accent" href="https://github.com/LibreSpark/LibreTV" target="_blank" rel="noopener noreferrer">LibreTV</a> 修改，保留原作者版权声明，遵循 AGPL-3.0-or-later。<a className="text-accent" href={APP_BRAND.sourceUrl}>取得本修改版对应源码</a>。新名称与原创图标不代表与其他影视品牌存在关联。</p>
          <p className="text-sm text-muted leading-7 mt-2">请使用合法可用的影视来源。本应用仅提供播放器与搜索工具。</p>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}

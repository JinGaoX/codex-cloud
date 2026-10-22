# 私人 LibreTV：架构决策与复用边界

核查日期：2026-10-22。基于官方 [LibreSpark/LibreTV](https://github.com/LibreSpark/LibreTV) 的 `f01d331e9ec7b5c1cc0822747cdd4c486601dbc2`，版本 `2.20.2`。开发分支：`feat/private-iphone-pwa`。本地独立检出保留官方历史；本次 GitHub 集成无创建仓库权限，远程私人仓库尚未创建，也尚未生成经过验证的长期 HTTPS 部署地址。

## 先回答关键问题

1. 官方已有 Next.js 15 App Router、React 19、TypeScript、Tailwind，ArtPlayer + hls.js 播放、源管理、流式聚合搜索、详情选集、换源和 IndexedDB 观看记录；这些继续复用。
2. 原版 manifest 已声明 `display: standalone` 和图标，可作为 iPhone 主屏幕 Web App 的基础。原版未见 Service Worker；manifest 不能让服务端代码在手机执行，也不能让在线视频脱网播放。
3. 第一版应补齐 iOS 原生 HLS/MP4 路径、主屏幕安装引导、安全区、保守缓存与更新、点播收藏和完整配置往返；具体完成情况以修改记录和测试报告为准。
4. Windows 关机后可继续使用，前提是页面及必要 API 部署在独立运行的 HTTPS 云服务。浏览器不是后台服务器；仅运行此云端开发环境不等于永久部署。
5. 推荐保留同源 Next.js 轻后端。云服务负责 CMS 请求/CORS、代理和鉴权，手机负责 UI、播放与本地数据。免费方案适合验证与轻度使用，无法承诺永久免费无限视频流量。
6. 基础播放成功率取决于源站、编解码器、地域/防盗链、签名有效期、代理平台和手机系统；本项目不转码，也不能绕过 DRM。

## 当前请求和存储边界

| 层 | 现有位置 | 运行位置与用途 |
| --- | --- | --- |
| 页面及 UI | `src/app/page.tsx`、`watch/page.tsx`、`src/components/` | React 客户端交互；初始页面仍由 Next 提供 |
| 网络入口 | `src/lib/client-api.ts` | 浏览器调用同源 `/api/*`，集中处理登录失败 |
| 聚合搜索 | `src/app/api/search/route.ts` | Node 服务端并发请求多个 Apple CMS API，分页、限时、缓存、逐源返回；一个源失败不应使页面白屏 |
| 详情与探活 | `/api/detail`、`/api/source/test` | Node 服务端请求与解析上游 |
| 视频代理 | `/api/proxy`、`src/lib/proxy-handlers.ts`、`m3u8.ts` | 流式转发，保留 Range/206，重写 HLS 相对地址、变体、key、map；绕开源站 CORS，不能解决不受支持的编码 |
| 推荐及扩展 | `/api/douban`、`hot-list`、`bangumi/*`、`live/*` | 官方已有服务端集成；本轮不新增 AI、PT、下载或广告识别模块 |
| 会话 | `/api/auth`、`src/lib/auth.ts`、`api-guard.ts` | 服务端 PASSWORD、HttpOnly 签名 cookie；90 天有效期。生产 HTTPS；密码不会作为前端环境变量注入 |
| 设置与用户数据 | `store.ts`、`persist-storage.ts`、`db.ts` | 本设备 localStorage + Dexie/IndexedDB；配置导入导出用于备份/迁移，无账户云同步 |
| 上游安全 | `ssrf.ts`、`fetch-utils.ts` | Node DNS、协议和目标地址校验，逐跳检查重定向。原代码不能直接当静态浏览器模块使用 |

默认采集站由使用者在设置添加，或由部署者以服务器环境变量提供。本项目没有为验证播放而编造 API 或影片地址。密码保护是整站共享访问密码，不是多用户系统；服务器缓存与内存登录限流在多实例之间不共享。个人低并发可先沿用，公开多人服务需要另行设计。

## A / B / C 比较

| 方案 | 开发复杂度 | 稳定性、iOS 与播放成功率 | 免费条件 | 维护成本 |
| --- | --- | --- | --- | --- |
| A：纯静态 PWA，直接访问上游 | 迁移成本高；必须拆掉/替换现有 Node 路由 | 页面可安装；仅当所有 CMS、HLS 子清单/分片/密钥允许 CORS、HTTPS 且编码兼容时可用。HTTP 混合内容、Referer 限制、源站 CORS 很容易使功能失效 | 静态托管通常可用免费子域名，但不能替代代理 | 每换一个受限源可能需处理浏览器限制；不满足稳定播放优先级 |
| B：PWA + 同源云端 Next.js | 最低，沿用官方架构 | 搜索/CORS/代理行为较完整；iOS 使用原生 HLS/HTMLVideo 与能力检测。仍受源站和平台限制 | 可使用免费 Next 托管及默认 HTTPS 子域名；代理流量和函数时长有限 | 继续跟踪上游和依赖，关注用量；第一阶段推荐 |
| C：相同 PWA + 常驻 Node/Docker 服务 | 有现成容器；需管理主机、HTTPS、更新 | 更能控制长连接、Range 和代理资源，适合经常需要全程代理的视频 | 已有常开 NAS/服务器可复用，仍有电费/运维；租用主机通常有持续费用 | 比托管函数多一些运维，但播放器问题更可诊断；免费云限制实测不合适时的后备 |

**决策：先做 B，免费云承担页面/搜索和必要代理，媒体能直连时优先直连；真实长视频出现平台代理限额时保留 C 的迁移能力。** 不为了静态导出删除搜索或放弃代理，不把免费服务宣传为无限视频 CDN。

## iPhone 的实际限制

- 播放须由用户手势触发。自动播放、切集后的自动续播可能被 iOS 拦截，保留可见播放入口。
- Safari 原生 HLS 优先使用系统能力；MP4 走 HTMLVideo，不强制交给 hls.js。HLS 容器并不代表其中的所有视频/音频编码都兼容。
- 原生 HLS 不经过 hls.js loader，因此原版的分片广告过滤与 JavaScript 预取不在此路径执行；本轮以原生播放稳定为先，没有新增广告识别功能。
- 原生全屏可由系统接管，App 自绘倍速/选集面板在系统全屏中不一定可见；退出全屏后仍可操作。
- iOS 可挂起/回收后台页面；进度应周期性保存并在暂停、隐藏/离开时补存。系统强杀仍可能损失最近少量进度，不能承诺永远后台播放。
- PWA 本地数据受系统配额、清理网站数据、卸载、隐私模式影响。Safari 标签页和主屏幕 App 的存储/会话应分别实测，不预设始终共享。
- Service Worker 缓存仅用于静态资源和离线提示，不承诺离线影片。API、登录、视频、授权 URL 不应纳入新增 PWA 缓存；官方已有视频预取是另一套机制，可在设置按需关闭。

## 为安卓 APK 保留的边界

第二阶段优先 Capacitor + 共享 React UI/数据/播放器能力层，不需要重写成 Kotlin 或单独制作一套 UI。本轮不生成 APK，也没有对安卓实机做验证。

1. 继续让 `components/` 负责展示，`client-api.ts` 负责请求，`db.ts`/`store.ts` 负责本地数据，媒体选择辅助模块负责能力判断。品牌入口集中配置；iOS/安卓使用相同组件和深色主题。
2. 正式 APK 应把可编译的 Web 前端打包到 Capacitor 的 `webDir`，调用单独部署的 HTTPS API。**Next.js 的服务端路由不会被打包为手机里的 Node 服务器**；当前全栈项目不能直接把 `.next` 填到 `webDir`。需要在第二阶段提取客户端入口/构建目标，复用组件与业务模块，而不是直接开启 `output: export`。
3. 本地包的 origin 与云 API 不同，需处理明确的 API origin、CORS 白名单、OPTIONS、登录传输/存储和媒体子请求。不能简单复制当前 SameSite cookie 方案到跨源 WebView；应为原生容器设计专用鉴权适配，保留 PWA 同源模式。
4. Capacitor `server.url` 可让开发壳加载远程站点，但官方将它定位于 live reload，不能把它当成已经完成独立资源打包的正式 APK。它依然依赖远程页面，离线启动和更新行为不同。
5. 安卓横屏加多列布局、触控目标、返回键、全屏及屏幕方向适配。系统全屏/生命周期能力通过小型平台适配层接入；先保留浏览器路径。APK 签名密钥、后端密码都不入源码，后续以安全 CI secrets 管理。

参考：[Capacitor 安装与 webDir](https://capacitorjs.com/docs/getting-started)、[Capacitor 配置](https://capacitorjs.com/docs/config)。

## 版权、隐私和继续开发

保留官方 `LICENSE`、版权及来源声明，修改版本继续遵守仓库的 AGPL-3.0-or-later。AGPL 第 13 节涉及修改程序通过网络与用户交互时向这些用户提供对应源码；分发 APK 还应提供适用许可证和对应源码获取方式。私人仓库用于开发不自动替代对实际使用者的义务；发布范围扩大前复核许可。不要将观看记录、配置导出、源 URL 内的私密 token、密码或签名密钥作为源码提交。

UI 定制不影响后端运行边界。替换名称/图标/颜色后需重新构建，iOS 已安装图标可能需删除并重新添加。来源和重要修改保留在 Git 提交及交付记录中，后续升级先合并到工作分支并跑回归检查。

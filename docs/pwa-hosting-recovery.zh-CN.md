# iPhone 托管拦截恢复

日期：2026-10-25；版本：`2.20.2-personal.6`。

当前安装入口：https://jingaox.github.io/codex-cloud/

账号侧已启用 Pages，API 显示 `built` 且来源为 `gh-pages /`。
匿名访问首页、watch 目录、安装页、manifest、独立 worker、Apple 图标及对应源码均 HTTP 200，
SHA-256 与本次静态构建一致。程序源码提交 `70a657a7f450a99af99b1ce997de1504e0c1e774`，
静态发布分支提交 `2b9b4807750f8c81ad9342ca06c3409a9123827f`。
本说明之后的文档提交不改变该程序，真实 iPhone 上的原故障尚待用户复测。

用户反馈：主屏幕安装后，添加 API 并搜索时出现 Cloudflare “Sorry, you have been blocked”，
随后重开也显示该页面。截图的 Ray ID 为 `a4fa851d09ae0a82`。

## 已确认与尚未知

- 原 Site 仍 active、公开且未停用。开发环境匿名请求首页、安装页和独立 worker 返回 HTTP 200。
- Worker 错误日志没有对应事件。现有 Sites 工具不提供平台 WAF 规则/安全事件控制，无法据此解除用户侧拦截。
- 截图证明托管安全层阻拦，不是本机 PIN 错误；仅凭截图不能确定具体规则、来源 IP 或 API 是否触发它。
- 旧代码搜索经 Next 路由更新 `?s=`，未受 worker 控制时可能向宿主发送额外导航/RSC 请求。
  本版使用原生 History API；API 请求本来就直达配置的 HTTPS 源，无同源搜索代理。
- 66 项旧版预缓存按顺序下载，不是 66 并发。完整安装后已知路由从缓存读取；
  首次未完成安装、缓存回收、更新检查及未缓存路径仍会访问托管来源。

移除不必要的搜索导航不是对 WAF 触发原因的定论，也不能在平台返回 403 前由应用代码解除拦截。

## GitHub Pages 备用入口

仓库 https://github.com/JinGaoX/codex-cloud 已获准公开使用，备用文件位于 `gh-pages`。
当前连接具备代码/工作流写入权限，但缺少首次启用 Pages 所需的 `pages` 与 `administration` 权限。
官方 configure-pages 对自动启用还要求不同于默认 `GITHUB_TOKEN` 的授权令牌；本轮不索取或另造令牌。

本次已完成首次开通。以后需要重建入口时，账号拥有者可用手机操作：

1. 打开 https://github.com/JinGaoX/codex-cloud/settings/pages ，登录自己的 GitHub 账号。
2. Source 选 **Deploy from a branch**（从分支部署）。
3. Branch 选 **gh-pages**，目录选 **/(root)**，点 **Save**。
4. 等 GitHub 显示已发布地址，再验证 `https://jingaox.github.io/codex-cloud/`；
   不应将仅准备好分支当成发布成功。

这是使用 GitHub 提供的免费 HTTPS 子域，不购买域名，不运行搜索或视频代理。
GitHub Pages 公开仓库可在免费方案使用；发布内容上限 1 GB、软性带宽限制约 100 GB/月、
分支部署软性构建限制 10 次/小时，具体以[官方限制](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits)为准。
当前程序文件远低于这些额度，但不能保证任何网络环境永久可达。

## 本机数据

先保留旧主屏幕图标和网站数据，不用删除/清理数据排查拦截。
若旧图标断网仍能打开并解锁，可先在设置内导出配置 JSON，之后在新入口导入。
新旧域的本机存储隔离，不能自动读取旧域的收藏、历史、片源或密码；新入口需重新设置本机 PIN。
如果旧入口尚不能打开，保留数据等待原域恢复；新入口可先重新添加 API 试用。

已知的真实 iPhone 搜索失败必须由手机复测确认解决，Chromium 模拟或新平台成功发布不能替代真机验收。

## 本轮验证

- 48 个测试文件、667 项单元测试通过，TypeScript 检查通过。
- `build:iphone` 根路径与 `build:pages` 项目路径均成功，分别预缓存 66 和 67 项资源。
- 本地 Pages 模拟 10 组通过：禁用 worker 的首次搜索/Back 无搜索词或 RSC 宿主导航，
  坏源隔离、精确资源摘要、其他项目缓存保留、详情/收藏、合成 MP4 解码/续播及离线新页。
- 实际 GitHub Pages 线上 5 组通过：匿名首次 PIN 与全部 67 项缓存激活，关页后离线新页解锁，
  禁用 worker 的夹具搜索及失败隔离，详情与 `/watch/` 目录首开和受控 MP4 加载。
- 线上未发现宿主根路径泄漏、同源应用 API 请求、身份验证跳转或未捕获页面异常。
- 浏览器使用 Chromium 模拟触控，API 和视频是明确受控夹具；不代表真实 iPhone 故障已解决。
  用户刚才的 API 地址尚未获得，不能声称该真实片源已搜索或播放通过。

## 后续构建

```sh
npm ci
npm run build:pages
npm run preview:pages
```

`pages-dist/` 为 `/codex-cloud/` 子路径版本，带 `.nojekyll`；不能把原根路径 `out/` 直接发布到该目录。
`npm run build:iphone` 仍输出根路径 `out/`，`build:native` 仍输出包内本地资源。
App 名称、UI、收藏/历史、API 管理和播放器沿用同一套前端。

# VIP影视：Windows 本地 Codex 交接

交接日期：2026-10-26（北京时间）。本文件属于交接资料，不代表重新发布了线上程序。

## 直接交给本地 Codex 的提示词

你是一名资深前端和跨平台工程师，请接手我已经开发好的「VIP影视」，继续基于现有实现开发，用中文沟通。

### 本次先做什么

先恢复项目、检查环境、完成独立 PWA 的本地构建与预览，并汇报实际结果。
这次是本地接手，不要部署线上、改变仓库可见性或自动实现下面的待讨论功能。
如果我之后给出具体开发任务，再在现有代码上完成它，不要重新造一个项目。

如果工作区已有代码，先检查 `git status`、`git remote -v`、分支及 `package.json`，确认确实是本项目；
保留现有未提交修改，不得覆盖我原有的其他项目。
如果尚无代码，在合适的新文件夹克隆我的备份仓库：

```powershell
git clone https://github.com/JinGaoX/codex-cloud.git VIPTV
cd VIPTV
git switch -c feat/local-next origin/main
```

先读本文件、仓库中的 `AGENTS.md`（如有）、`README.md`、`CHANGELOG.private.zh-CN.md`，以及：

- `docs/iphone-standalone-pwa.zh-CN.md`
- `docs/platform-catalog.zh-CN.md`
- `docs/github-backup.zh-CN.md`
- `docs/source-detail-recovery.zh-CN.md`
- `docs/episode-titles.zh-CN.md`
- `docs/vip-family-cinema.zh-CN.md`
- `docs/pwa-hosting-recovery.zh-CN.md`
- `UPSTREAM.md`、`LICENSE`

### 项目身份和版本

- 我的备份仓库：`https://github.com/JinGaoX/codex-cloud`，当前是公开仓库；不要擅自改变可见性。
- 官方上游：`https://github.com/LibreSpark/LibreTV`，只用于参考，不得向其推送。
- 上游基线：v2.20.2，`f01d331e9ec7b5c1cc0822747cdd4c486601dbc2`。
- 当前应用名：VIP影视；保留现有原创金色V图标和影院风格，名称、主题及图标仍可定制。
- 当前应用版本：`2.20.2-personal.12`。
- 精确已发布程序源码：`de498d70a4a3c46b7fcb0fdc981278ba13ba733e`。
- 发布验证文档提交：`637baca50e751f65f68d05b58ffdde368c33493f`。
- 此后的交接提交补充说明、备份和对应源码打包清单，不要误认为线上程序已重新部署。
- 最新远端 `main` 是当前个人版；从 `origin/main` 新建工作分支。
- 固定交接备份分支：`backup/local-codex-handoff-2026-10-26`。

云端旧工作区的本地 `main` 仍是官方基线，部分旧本地分支也滞后。
不要拿旧分支名称或 cloud 工作区的本地 `main` 判断最新版；以已核对的远端和交接备份为准。

### 产品用途和约束

首先服务 iPhone 15 Pro Max：Safari添加到主屏幕的独立界面PWA，不需要Mac、苹果账号签名或每7天重签。
之后计划做约13英寸安卓平板APK，优先继续使用共享Web前端和Capacitor，避免重做UI。
Windows关机后，已安装程序仍可使用；首次安装、更新和缓存恢复需要可访问的HTTPS来源。
完整缓存后界面、精选片单、精选海报和本机记录可离线浏览，影视搜索与在线播放仍需网络。

优先级：稳定播放 > 简单可靠 > 免费或低成本 > 保留UI > 复杂功能。
不要恢复每次开屏输入密码，也不要新增首页系统提醒、更新横条或榜单说明横条。
不要使用未经授权的付费服务，不把密码、密钥、真实私人片源或配置导出写入代码、前端或公开仓库。
保留AGPL-3.0-or-later许可证、LibreTV版权来源和对应源码提供流程；海报版权不由程序AGPL替代。

### 当前架构

源码基于Next.js、TypeScript、React、Tailwind、Zustand、Dexie/IndexedDB，播放器为Artplayer/HLS等。
仓库仍保留官方全栈代码，但当前手机版本是独立静态构建：不运行Next搜索路由、视频代理或常驻电脑服务。
用户的手机直接访问自行配置的HTTPS影视API和媒体，仍受CORS、证书、防盗链、编解码和iOS限制。
不能假定搜索接口可用，就代表详情、视频和分片都能访问。
未来Capacitor打包不要用远程`server.url`冒充本机随包应用，也不要假装一个网页开关能强制绕过小火箭或软路由。
用户iPhone使用小火箭分流；未来安卓连接软路由Wi-Fi，分流仍由代理客户端/路由器控制。

### 已有功能：应当保留

- 设置中添加、编辑、删除、启停多个影视API，聚合搜索、详情、选集、换源。
- 支持兼容MP4/HLS，倍速、全屏、自动连播、手动片头片尾跳过标记；不重复添加一套倍速功能。
- 收藏、历史、首页续播、逐集进度，以及配置导入导出。
- 定时15/30/60/90分钟、本集结束后停止、取消定时和恢复检查；iOS完全挂起时不能保证后台精确到秒停止。
- 原始分集标题随URL同步保留，倒序只改显示位置，没有标题时回退数字选集。
- 实际分辨率读取，不能把源标签或猜测当作1920×1080等实测值。
- 电影、剧集、综艺榜单，以及现有高分/喜剧筛选；不编造评分、排名或影片信息。
- 爱奇艺、优酷、腾讯视频的电影/电视剧共六个精选分类，每类6部、共36部。
- 36张精选海报随程序缓存，总计1,275,208字节；精选模式不依赖外部榜单或图床。
- 精选由官方公开资料核对，腾讯含其官方WeTV元数据；不是完整片库、实时榜或独播声明。
- 精选点片名后搜索用户配置的片源；不要改成默认跳官方会员播放页。
- 原周榜海报的备用图片链、搜索详情暖缓存与同源同ID恢复等既有修复。
- 安静准备PWA更新，播放时禁止更新重载，手动入口为「设置 → 数据 → 应用更新」。

PiP、AirPlay已有播放器配置，但iPhone实际行为需真机测试，不要当作完全未实现的新功能。
下载、直播、复杂代理/广告过滤等入口在独立版已经大多隐藏，不要为精简强删成熟底层。

### 绝不能随意更改的数据身份

- IndexedDB数据库：`libretv`。
- localStorage设置键：`libretv-settings`；不要改变现有收藏/历史/逐集进度的键规则。
- 定时sessionStorage键：`libretv-sleep-timer-v1`。
- Capacitor appId：`org.libretv.personal`。
- PWA manifest的id、scope、start_url及已有站点路径；更改可能让用户得到新安装或分开存储。
- 主站和旧站是不同来源，手机本机记录不会自动跨域同步，不能通过清理网站数据排错。

GitHub、源码ZIP、Git bundle均不包含手机里的私人API、收藏、历史和进度。
如果要迁移这些数据，让我在原App中导出配置并在本地保管，不要上传到公开仓库。

### Windows环境、构建和验证

建议Node.js 24 LTS、npm、Git for Windows以及可用的`tar`（现代Windows通常自带）。
先检查实际版本和命令；不要盲目重装、更新所有依赖或删除未提交工作。

```powershell
node --version
npm --version
git --version
tar --version
npm ci
npm run typecheck
npm test -- --reporter=dot
npm run build:iphone
npm run preview:iphone
```

根路径静态预览为 `http://127.0.0.1:8080/`。如果端口占用，用任务专用环境变量配置，别杀无关进程。
`preview:iphone`只是电脑开发预览；iPhone打开电脑局域网HTTP不等于可安装的HTTPS PWA。
检查本地预览海报的响应类型是否正确，尤其新WebP缩略图；当前预览脚本未显式列出WebP MIME，应作为接手检查点。

两个静态目标请按顺序构建：

- `npm run build:iphone` → `out/`，站点根路径。
- `npm run build:pages` → `pages-dist/`，默认路径 `/codex-cloud/`。
- `npm run preview:pages` → `http://127.0.0.1:8080/codex-cloud/`。

`npm run dev`和默认`npm run build`属于原全栈工作方式，不能当作独立PWA验收。
先跑与改动相应的检查，记录实际结果；不要虚构测试片源、视频地址、真机或大陆直连测试。
当前基线曾通过54文件759项单元检查、类型检查、两种静态构建、9项浏览器场景及P11到P12本地worker升级验证。
云端浏览器证据不是iPhone Safari真机测试；本地环境首次接手也应实际确认构建与预览。

### 主要文件

- `src/components/discovery-section.tsx`：精选与榜单界面。
- `src/lib/platform-catalog.ts`、`platform-catalog-data.json`：平台精选及来源。
- `public/posters/platform/`：随包WebP海报。
- `scripts/update-platform-posters.mjs`：显式海报维护，`npm run catalog:posters`；普通构建不访问原图床。
- `scripts/prepare-standalone-pwa.mjs`、`public/sw-standalone.js`：精确缓存和更新；只缓存公开程序/已审核海报，不能把API、视频、私人配置放进共享缓存。
- `scripts/build-standalone.mjs`：移除服务端路由的独立构建及路径处理。
- `scripts/source-distribution.mjs`：生成对应源码归档，保留来源声明。
- `src/lib/standalone-api.ts`、`cms-parser.ts`：静态版请求、详情恢复、剧集解析。
- `src/lib/episode-labels.ts`、`src/components/detail-modal.tsx`、`src/app/watch/page.tsx`：集名、详情、播放与索引。
- `src/components/player-shell.tsx`：播放器与错误恢复。
- `src/lib/db.ts`、`store.ts`：本机记录和设置。
- `src/lib/app-brand.ts`、`docs/branding/`：品牌与图标。
- `capacitor.config.ts`、`ios/`：原生基础；未交付IPA或安卓APK，安卓工程仍需后续准备。

### 线上入口：本次不要动

- 主站：`https://jingaox.github.io/codex-cloud/`，`gh-pages`保存静态文件，不是开发源码分支。
- 旧站：`https://libretv-pocket-15pm-c3d9.honestfairy18.chatgpt.site`。
- 旧站曾在用户手机上出现Cloudflare拦截，不能宣称已解决；不要让用户清空记录来排查。
- `.openai/hosting.json`保留既有Sites项目身份，不能误建新站或改变公开/私有状态。
- 云端的GitHub/Sites授权、短期凭据不会随源码迁移，本地不要假定继承了它们，也不复制旧令牌。
- 将来若我明确要求发布，先完成可审查的改动、检查和对应目标构建，再使用已有合法授权发布，并核验真实结果。

### 讨论过、尚未实现或未获本轮执行指令

播放失败后原地重试、换源按集名/集号更精确对齐、快速选集、播放页快捷收藏、收藏分组、
儿童精选片单、页面内防误触、家庭独立档案、配置合并导入、自定义定时/看完若干集停止、奈飞专区。
这些是候选建议，不要自动全部开发。儿童片单不能靠简单分类词过滤冒充内容审核；
网页防误触不能锁住iOS系统级全屏或系统手势。

当前不开发：AI广告/水印识别、AI线路评分、广告时间轴、PT资源搜索或下载、Jellyfin、影视自动下载、自动部署AI智能体。

### 完成首次接手后向我汇报

简明说明克隆位置、来源/分支/版本、环境和实际验证结果、本地预览地址、待我在手机上测试的内容。
保留既有界面和数据，不主动改一批功能；等我指定下一项开发任务。

## 离线备份恢复补充

源码ZIP可以直接解压查看，但不带`.git`；需要完整历史时用交接包内`history.bundle`。
请显式选择交接快照分支，不能默认切换bundle中的旧本地`main`：

```powershell
git clone --branch backup/local-codex-handoff-2026-10-26 .\history.bundle VIPTV
cd VIPTV
git remote set-url origin https://github.com/JinGaoX/codex-cloud.git
git fetch origin
git switch -c feat/local-next origin/main
```

没有网络时可先基于当前交接分支开工作分支，等恢复网络后再核对远端；安装npm依赖仍需要网络或事先准备的依赖缓存。

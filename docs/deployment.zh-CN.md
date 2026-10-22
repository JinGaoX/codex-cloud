# 部署私人 LibreTV（HTTPS、免购域名）

核查日期：2026-10-22。下述额度来自当日官方文档，平台可能调整，最终以账号控制台及最新规则为准。本文是可执行部署指引，**不是已部署成功的声明**；只有交付时返回的真实 URL 才是测试地址。

## 推荐入口：Vercel Hobby，先验证再决定长期托管

本项目仍是 Next.js 15 全栈应用，Vercel 原生支持的路径最短，无需将服务端改写成手机代码。平台自动分配 `.vercel.app` 访问地址，无须买域名，使用 HTTPS。[生成域名说明](https://vercel.com/docs/deployments/generated-urls)

Hobby 限个人非商业使用。官方当日列出每月 100 GB Fast Data Transfer、10 GB Fast Origin Transfer、4 CPU 小时、360 GB 小时 provisioned memory 和 100 万函数调用；不是“可无限转发 100 GB 影片”，多个指标同时计量，超过额度通常会暂停相关功能。[Hobby 额度与规则](https://vercel.com/docs/plans/hobby)

启用 Fluid Compute 时 Hobby 函数最长 300 秒，包含发送响应的时间。普通请求/响应有 4.5 MB payload 限制；官方说明真正的流式响应不受该响应大小限制。本项目代理使用流，因此不能仅凭 4.5 MB 判断一定失败，但必须部署后验证 HLS 大分片和 MP4 Range；长时间单连接仍受函数时长、用量限制。Vercel 官方也建议大媒体从专门媒体服务直取。[函数限制](https://vercel.com/docs/functions/limitations)、[流式响应与媒体建议](https://vercel.com/kb/guide/how-to-bypass-vercel-body-size-limit-serverless-functions)

### 首次账号操作

需要用户在平台网页完成的步骤（不要把密码或 token 粘贴到聊天或仓库）：

1. 在自己的 GitHub 个人账号创建一个空的私有仓库，建议命名 `libretv-personal`，不要初始化 README/许可证，以便完整推送交付历史。将该仓库授权给本会话使用的 GitHub App，并提供仓库链接；也可自行从交付的 Git bundle 推送。不要把改动推送到 `LibreSpark/LibreTV`，也不要占用已有其他项目的仓库。保留上游历史、LICENSE 与工作分支。
2. 登录 Vercel，选择 **Hobby**，授权它只访问此仓库，不需要购买域名或开启付费计划。
3. **Add New → Project → Import Git Repository**，选独立仓库。Framework Preset 用 **Next.js**，Root Directory 选项目根目录，Build Command `npm run build`，Install Command `npm ci`，输出目录保留框架默认；不要填写 `out`。
4. 在服务器 Environment Variables 中设置 `PASSWORD` 为自行生成的强密码。建议同时设置随机 `PROXY_SECRET`，供多实例一致签名；不需要 `NEXT_PUBLIC_` 前缀。将变量用于 Production（若测试 Preview，也单独设置 Preview）。不要在前端源码或 `vercel.json` 中放密码。
5. 默认不填 `DEFAULT_SOURCES`。部署后在设置中添加自己有权访问的真实 Apple CMS API，方便不经编译直接增改删启停。若用环境变量预置，源 URL 不应含私人密钥；检查状态接口和日志的暴露范围。
6. Deploy，等待平台显示 Ready，然后复制平台真实的 Production HTTPS 地址。在电脑/手机检查 `/api/status` 和首页，不要把日志中的请求 cookie 或签名播放地址公开。
7. 保持一个稳定 Production 域名再添加主屏幕。不同预览域名有不同本地存储，频繁换域名不会自动迁移历史。部署更新保留相同域名，通过应用“配置导出”先备份。
8. iPhone Safari 打开该 HTTPS 地址，输入站点密码，在设置添加合法 API，按[手机测试清单](iphone-test-checklist.zh-CN.md)执行。Vercel 预览保护可能还要求平台登录；正式个人地址仍使用 LibreTV 自身密码保护。

本次已确认的外部阻碍：GitHub 集成可识别账户，但创建仓库 API 返回 `Resource not accessible by integration`，因此独立远程仓库尚未创建；当前没有 Vercel/Netlify 部署凭据。Sites 工具虽可见，其本地必需的 helper 包未安装，且 Worker 托管与本项目原生 Next.js 的运行边界不同，本轮不能据此保证可部署。

如果需要 Codex 代推代码/部署，需要连接有目标仓库写权限的 GitHub 授权，以及目标托管账号的项目创建/部署授权。先完成上面第 1 步即可保留代码；第 2–6 步可由用户在 Vercel 页面完成，无需在聊天中发送密码。开发、构建和自动测试不因此中断；不能据此伪造远程仓库或 HTTPS 地址。

### 从交付包恢复 Git 历史

源码 ZIP 可直接解压、`npm ci`、`npm run build`。Git bundle 包含上游历史和本开发分支，
未来有 Git 的机器可用下列命令恢复（仓库 URL 须替换成上面实际创建的空仓库）：

```bash
git clone -b feat/private-iphone-pwa libretv-personal.bundle libretv-personal
cd libretv-personal
git remote rename origin delivery-bundle
git remote add upstream https://github.com/LibreSpark/LibreTV.git
git remote add origin https://github.com/YOUR_ACCOUNT/libretv-personal.git
git push origin HEAD:main
git push -u origin feat/private-iphone-pwa
```

`YOUR_ACCOUNT` 是占位符。只向自己的 `origin` 推送；`upstream` 只用于以后获取官方更新。
首次推送后，在 GitHub 设置默认分支 `main`，Vercel Production Branch 也选择 `main`。
新增检查工作流不自动部署、不写入私密设置；GitHub 私有仓库 Actions 的免费分钟数以账号套餐为准。

## 其他免费 HTTPS 托管的取舍

| 平台 | 当日免费额度及域名 | 对本应用的限制与判断 |
| --- | --- | --- |
| Netlify Free | 新 credit 方案每月 300 credits，`.netlify.app`；当日官方带宽费率为 20 credits/GB，计算、请求、生产部署也消耗同一额度 | 单看带宽理论最多约 15 GB，实际更少；credits 用完会暂停项目。流式函数通常 60 秒/20 MB，Lambda 兼容层另有限制。可试页面与搜索，不作为稳定长视频代理的首选 |
| Cloudflare Workers Free | 100,000 请求/日，10 ms CPU/请求，`.workers.dev`，HTTPS | 网络等待不等于 CPU 时间，但 Next 服务启动/渲染可能超免费 CPU；应跑真实适配器构建。当前官方推荐 vinext（现有应用指向 Next16 路径），OpenNext 保留为另一部署路径。本项目 Next15 + Node DNS/crypto 需适配验证，不能直接当 Pages 静态站上传 |
| 纯静态 Pages / GitHub Pages | 免费静态 HTTPS 域名，不运行本项目的 Node API | 仅托管页面不能恢复搜索/代理/鉴权，当前不是完整可用部署方案 |

来源：[Netlify credits](https://docs.netlify.com/manage/accounts-and-billing/billing/billing-for-credit-based-plans/how-credits-work/)、[Netlify Functions 配置](https://docs.netlify.com/build/functions/configuration/)、[Netlify 流式 API](https://docs.netlify.com/build/functions/api/)、[Cloudflare Workers 限制](https://developers.cloudflare.com/workers/platform/limits/)、[Cloudflare Next.js 路径](https://developers.cloudflare.com/workers/framework-guides/web-apps/nextjs/)。旧账号可能继续使用旧套餐，不能拿旧“100 GB Netlify 免费带宽”等数字推断新账号额度。

## 如果免费函数影响核心播放

先区分源站问题与平台问题：同片不同线路、直接播放与代理播放、大分片/Range、平台日志及用量。能合法直连的流可绕开代理节约额度；源站要求 CORS/Referer/HTTP 转 HTTPS 时仍要代理。不要为了省免费额度移除回退路径。

若经常需要代理完整长视频，采用原项目的常驻 Node/Docker 部署更可控：云容器或已有常开服务器提供 HTTPS，沿用本源码和数据接口。其持续费用/电费与服务条款须由用户选择，本轮不自动开通付费服务。Windows 不必开机，但用于部署的服务必须持续运行。临时开发端口/隧道依赖云端开发会话，不能当作长期地址。

## 上线后的必查项

- HTTPS 下登录 cookie 正常，未登录搜索/代理返回拒绝；不要把平台保护完全等同于应用鉴权。
- `/sw.js` 不长期缓存旧内容；manifest/离线页可访问；API 和媒体不被新增 PWA 缓存截留。
- MP4 代理返回 `206`/`Content-Range`，HLS 清单里的分片、key、map 都可访问；不要把仅拿到 manifest 的 200 当成播放通过。
- 搜索坏源失败时好源结果和设置仍可用；云端用量足够；没有公开日志记录私人配置。
- 在稳定域名导出配置，在相同或另一设备导入检查收藏/历史/逐集进度。服务器迁移不自动同步设备数据库。
- 保留 LICENSE、上游标识、修改记录，并向实际远程使用者提供适用的对应源码获取方式。

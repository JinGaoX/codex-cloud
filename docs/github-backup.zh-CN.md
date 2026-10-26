# GitHub 备份与后续开发

日期：2026-10-26。

仓库：https://github.com/JinGaoX/codex-cloud

本地Codex接手请先读[交接提示词](../LOCAL_CODEX_HANDOFF.zh-CN.md)。
固定备份分支为 `backup/local-codex-handoff-2026-10-26`，仅交接说明与备份，不重新部署线上程序。
从GitHub恢复以 `origin/main` 为准；从离线bundle恢复请显式选择交接分支，旧云端本地`main`是上游基线。

用户授权在无法新建仓库时，使用自己的任意空仓库。现有连接创建仓库返回权限不足，
因此使用已经存在的 `codex-cloud`。上传前已通过完整 `git ls-remote` 确认仓库没有引用，
而非仅依据仓库显示的 0 KB 判断。该仓库原本公开，备份时保留公开可见性。
没有修改 LibreSpark/LibreTV 官方仓库或覆盖其他用户项目。

## 保存范围

- `main`：当前个人 iPhone PWA 与最新开发文档。
- `feat/iphone-mobile-pwa`：当前手机 App 布局开发分支。
- `feat/iphone-local-native`：本地 Capacitor iOS 工程，未宣称已生成 IPA 或 APK。
- `feat/iphone-quick-login`、`feat/iphone-standalone`、`feat/private-iphone-pwa`：此前各阶段。
- `upstream-baseline`：官方基线 `f01d331e9ec7b5c1cc0822747cdd4c486601dbc2`。
- 66 个上游版本标签和相应完整 Git 历史。

首次上传以单次原子推送创建全部 73 个引用，并要求目标引用原先不存在；上传后逐项核对哈希。
此后文档更新以普通快进同步到 `main` 与当前开发分支。
标签备份一次推送全部 66 个上游标签；GitHub 对一次推送超过 3 个标签不生成标签推送工作流事件，
避免将备份标签当成新的容器发布。参考 [GitHub push 事件说明](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#push)。

这是程序源码备份，不包含用户手机的 IndexedDB、片源配置、本机 PIN、收藏或观看历史；
私人数据需在 App 设置内另行导出并自己保存，不要上传到公开仓库。
原项目 AGPL、版权及上游来源声明保留；公开程序的对应源码归档仍由安装页提供。

## 从 Windows 恢复

安装 Git 与项目支持的 Node.js 后：

```powershell
git clone https://github.com/JinGaoX/codex-cloud.git LibreTV-personal
cd LibreTV-personal
git switch feat/iphone-mobile-pwa
npm ci
npm run build:iphone
```

`out/` 为静态 PWA 程序文件。默认 `npm run build` 构建原全栈版，含服务端依赖，二者用途不同。
日常使用已安装的 iPhone PWA 不要求 Windows 开机；安装、更新及缓存恢复仍需可用的 HTTPS 程序来源。

当前「VIP影视」`personal.12` 已发布程序源码提交为 `de498d70a4a3c46b7fcb0fdc981278ba13ba733e`；
其后的提交仅记录本轮验证结果。`gh-pages` 保存适配项目路径的静态文件，当前安装地址为
https://jingaox.github.io/codex-cloud/ ，故障及验证见[托管恢复记录](pwa-hosting-recovery.zh-CN.md)。
本轮另增 `fix/pwa-hosting-recovery` 分支；原有全部开发分支、标签和官方基线仍保留。
`fix/pwa-source-detail` 保存用户实际 API 的详情失败修复，见[详情恢复记录](source-detail-recovery.zh-CN.md)。
`feat/pwa-discovery-playback` 保存完整分辨率与首页真实榜单更新，见[更新验证](discovery-playback.zh-CN.md)。
`feat/vip-family-cinema` 保存现代影院界面、原创品牌图标、免开屏密码和定时停止；见[家庭影院更新](vip-family-cinema.zh-CN.md)。
`feat/vip-episode-titles` 保存原始分集标题及显示；见[剧集标题更新](episode-titles.zh-CN.md)。
`fix/discovery-poster-fallback` 保存推荐海报的公开图片回退修复；见[推荐封面修复](discovery-posters.zh-CN.md)。
`feat/domestic-platform-catalog` 保存三平台精选及随包小海报，见[国内平台精选](platform-catalog.zh-CN.md)。
未来安卓可继续提取现有共享 Web 前端与 Capacitor 基础，本轮没有生成 Android APK。

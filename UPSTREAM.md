# Upstream and licensing

- Project: [LibreSpark/LibreTV](https://github.com/LibreSpark/LibreTV)
- Baseline: v2.20.2, commit `f01d331e9ec7b5c1cc0822747cdd4c486601dbc2`
- Retrieved: 2026-10-22
- Development branch: `feat/private-iphone-pwa`
- License: AGPL-3.0-or-later; original [LICENSE](LICENSE) and attribution retained.

This is an independently modified personal app. It is not an official LibreTV release.
Changes are recorded in [CHANGELOG.private.zh-CN.md](CHANGELOG.private.zh-CN.md).
The upstream repository has not been modified.

构建时 `scripts/source-distribution.mjs` 从公开源码白名单生成
`public/source-code.tar.gz`，页脚「本修改版源码」向网络使用者提供对应源码。
也可通过公开构建变量 `NEXT_PUBLIC_SOURCE_URL` 指向本修改版的源码仓库。
不要把该地址指向仅上游代码，或使用者无权访问的私有仓库。
服务器密码及密钥仅配置在部署平台运行环境；源地址、收藏及观看记录保存在设备端，
不要放进源码目录或 `public/`。分享配置文件可能含私人源 URL，请妥善保管。

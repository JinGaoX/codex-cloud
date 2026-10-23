# iPhone 本地安装版

本版本改用 **Capacitor 8.5.3 将共享前端捆绑进 iOS 应用**。界面、播放器代码和本机记录在手机运行，启动时不加载 ChatGPT Sites，不需要 ChatGPT 登录，也不需要 Windows 电脑保持开机。

这份说明针对本地工程和安装流程。**生成 Xcode 工程不等于已经生成可安装 IPA**；当前 Linux 开发环境没有 Xcode 和用户签名身份，不能在这里完成 iOS 编译、签名或真实设备验收。

## 运行方式

- `webDir` 为 `native-dist`，构建出的网页程序复制到应用包内；不设置指向网站的 `server.url`。
- App ID 固定为 `org.libretv.personal`，本地地址固定为 `capacitor://localhost`。后续升级保持 App ID、scheme 和 hostname，避免改变本机数据所在的位置。
  若首次签名提示 Bundle Identifier 已被占用，可在 `capacitor.config.ts` 和 Xcode target 中一致改为自己的标识；首次安装后保持不变。
- 复用 LibreTV 的首页、搜索、详情、选集、换源、播放器、收藏、历史及配置界面。不在 iPhone 中运行 Node.js 或 Next.js 服务端路由。
- 本地安装版不依赖 Service Worker 安装缓存，也不通过网页托管平台更新程序。程序更新需要重新构建并安装 iOS 应用，签名授权也需要保持有效。
- 本地多页面路由适配在 `LocalAppViewController.swift`，支持 `/watch` 冷启动读取包内的播放页。
  这段 Swift 仍须在 Mac 上编译并实测；浏览器验证仅模拟相同的文件映射。
- 搜索和在线播放仍需要网络。手机直接请求用户设置的合法 HTTPS API 和媒体；当前未加入原生网络代理。WebView 的跨域、证书、编解码器、源站签名和防盗链限制仍需检查，不能把网页中的播放结果当成原生版兼容性证明。

Capacitor 官方说明见 [iOS 支持](https://capacitorjs.com/docs/ios)与 [SPM 工程说明](https://capacitorjs.com/docs/ios/spm)。

## 本机密码及已有记录

应用采用用户自设的 6 位本机 PIN，无预设密码，也无需另注册 LibreTV 账号。PIN 只锁定应用界面，不加密设置、收藏或观看历史，不是影片 API 的访问密码。

旧 PWA 与本地 iOS App 使用不同的数据空间，记录不会自动搬迁：

1. 在原 PWA 的设置中导出配置和记录，保存到自己可访问的位置。
2. 安装本地版后，重新设置此 App 的 6 位 PIN。
3. 在本地版设置中导入此前的备份，核对源、收藏、历史及逐集进度。
4. 确认恢复成功前，保留旧入口和原备份。

PIN 不随配置导出或导入。忘记 PIN 后重新设置可能需要清除应用本机数据，会丢失未备份的记录；定期导出，不把卸载或清除数据当作无损重置。配置文件可能包含用户自己的 API 地址或访问参数，勿提交到公开仓库。

本地版通过系统分享面板导出配置，可选择保存到“文件”。打开分享面板不代表文件已经保存，
取消操作也不会报告保存成功。导出临时副本位于 App 私有缓存中，由系统清理；不要将它当作正式备份。
包内原生依赖的许可证声明位于 `public/NATIVE-DEPENDENCY-LICENSES.txt`。

## 构建本地工程

项目使用 Node.js 22 或更高版本。获取本次源代码后，在项目根目录运行：

```sh
npm ci
npm run native:ios
```

`native:ios` 先构建共享前端，再将文件同步到 iOS 工程；首次创建工程使用 SPM。完成后可在 Mac 运行：

```sh
npm run native:ios:open
```

此命令打开 Xcode，不会代替设备签名。当前环境可以准备静态资源和工程，但不能使用 Linux 编译、签名得到 iOS 安装包。iOS 构建需要兼容的 macOS 和 **Xcode 26 或更高版本**；Xcode 还需支持目标 iPhone 的实际 iOS 版本。要求以 [Capacitor 官方环境说明](https://capacitorjs.com/docs/getting-started/environment-setup)为准。

本流程不发布网站、不启用远程 `server.url`，也不自动购买开发者会员或构建服务。生成的本机配置、签名证书、Apple 账号密码和私钥不应提交到仓库。

## 签名并安装到自己的 iPhone

首次开发安装通常需要：

1. 一台可运行所需 Xcode 的 Mac，完成工程构建；Mac 可以仅在构建、安装或重新签名时使用。
2. 在 Xcode 中登录用户自己的 Apple 账号，选择相应 Team 和正确的 App ID，让 Xcode 管理个人开发签名。账号信息由用户在自己的设备上输入。
3. 连接并信任 iPhone，按系统要求开启 Developer Mode，再选择该设备进行运行安装。
4. 从手机图标启动，设置 PIN，并完成下方真机验证。

**免费 Apple 账号可用于个人设备开发测试，不要求购买付费会员；但 Personal Team 的安装授权通常只有 7 天。** 过期后需要重新构建、签名并安装，不能承诺一次安装后永久免维护。苹果签名有效期是安装和启动限制，与程序是否托管在 ChatGPT 网站无关。[Apple 账号与个人开发限制](https://developer.apple.com/help/account/basics/about-your-developer-account/)

Developer Mode 的具体开启步骤参考 [Apple 官方说明](https://developer.apple.com/documentation/xcode/enabling-developer-mode-on-a-device)。没有 Mac 或其他已确认的构建签名途径时，仅有源代码工程和 iPhone，仍不能把工程当作可直接点击安装的 App。

## 需要在 iPhone 15 Pro Max 上验收

以下项目均为**待真机测试**，不是已通过结果：

| 项目 | 核查内容 |
| --- | --- |
| 首次安装与启动 | Xcode 编译、个人签名、Developer Mode、主屏幕图标和启动；不出现 ChatGPT 网页验证 |
| 本地冷启动 | 断网后重新打开 App，界面可进入本机 PIN；不依赖网页缓存安装或远程网站 |
| PIN 与加密能力 | 设置、错误提示、等待、正确解锁、立即锁定、修改 PIN；确认原生 WebView 的密码计算和安全随机数能力 |
| 数据迁移与备份 | 从旧 PWA 导出后导入；源、收藏、历史和进度完整；系统文件选择器、配置导出或分享能正常操作；PIN 不被导入覆盖 |
| 搜索与失败隔离 | 配置真实合法 HTTPS API，搜索、详情、选集和换源；个别源跨域或网络失败不使页面白屏 |
| 媒体播放 | 合法 MP4 和 HLS 的真实声画、暂停、快进、拖动、倍速及续播；检查主清单和后续分片 |
| 全屏与横竖屏 | 竖屏安全区、横屏视频、系统全屏进出及触控控件 |
| 后台与恢复 | 切换 App、锁屏、系统回收后恢复，检查页面可操作和进度保存；不承诺持续后台播放 |
| 数据保存及升级 | 关闭重开、重新签名和覆盖安装后核对数据；卸载或系统清理的影响需单独确认 |
| 签名到期 | 记录个人授权有效期以及重新构建、签名、安装步骤，不以首日能打开推定永久可用 |

云端构建检查或桌面 Chromium 测试可帮助检查代码，不能替代 WKWebView、苹果签名和实际 iPhone 媒体行为。代码和原生工程的交付状态、可复现命令及自动化结果以本次交付记录为准。

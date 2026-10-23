# iPhone 本地安装版验证

日期：2026-10-23；版本 `2.20.2-personal.4`；分支 `feat/iphone-local-native`。

## 已完成

- `npm test`：48 个文件、663 项通过。新增原生 PIN、文件导出及运行模式边界验证。
- `npm run native:ios`：本机前端静态资源构建成功，SPM 工程同步成功，Filesystem 与 Share 插件已加入。
  此命令没有执行 Swift 编译或签名，不生成 IPA。
- `npm run build`：原全栈模式构建通过。原 PWA 构建入口保留，本轮未向云端发布任何修改。
- `Info.plist`、隐私用途声明及 storyboard 通过 plist/XML 格式检查，iPhone 支持竖屏与横屏，
  没有任意 HTTP 的 ATS 放行。原生 app 使用已有 LibreTV 图标制作系统要求尺寸的资源。
- 本地资源中没有 Next.js API 路由、SW、网站安装页或 WebClip；生成的原生配置未设置远程服务器，
  使用 `capacitor://localhost` 读取 App 内资源。
- 原生依赖保留许可证，AGPL 对应源码归档随包提供；源码导出读取固定的包内路径。

## 浏览器模拟结果

系统 Chromium、430×932 触控尺寸，9 组通过。测试将本地资源请求直接映射到构建文件，
断网时仍允许读取这些文件，模拟 App 包内资源；没有使用 HTTP 网站的缓存或 SW。
主动移除 `crypto.subtle`，保留安全随机数，以验证原生 PIN 的同强度计算回退。

覆盖首次断网设置密码、错误和正确解锁、无 SW 首页、本机源管理、坏源失败隔离、详情/两集/收藏、
`text/plain` 静态 RSC 导航、真实合成 H.264/AAC MP4 解码、播放页冷重载解锁后恢复约 7 秒进度、
断网新页面保留源及收藏，无横向溢出。

- ChatGPT Sites/认证地址请求：0。
- 同源 `/api/*` 请求：0。
- Service Worker 注册调用：0。
- 未捕获页面异常：0。
- 控制台网络错误：1，来自刻意设置的不可达测试源，成功结果继续显示。

只有 5 个受控外部夹具请求。API 地址、影片及媒体均明确标记为测试夹具，不内置到产品，
不据此声称真实影视源或实际 iPhone 已播放。脚本、结果与截图在交付 QA 证据包。

## 尚未完成的安装环节

当前执行环境是 Linux，没有 macOS/Xcode 或用户签名身份。**已生成工程和本地资源，尚无可安装 IPA。**
自定义 `LocalAppViewController.swift`、原生插件、系统文件分享、WKWebView 实际 origin/存储、
播放器全屏、后台恢复等仍需 Mac 编译和 iPhone 15 Pro Max 实测。

免费 Apple 个人测试授权通常 7 天后需要重签。没有确认可用的 Mac/构建签名流程前，
不能将本工程称为“现在就能直接安装”或“永久免签名”。具体步骤见[本地安装说明](iphone-native-local.zh-CN.md)。

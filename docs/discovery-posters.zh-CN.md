# 推荐封面修复

版本：`2.20.2-personal.11`；分支：`fix/discovery-poster-fallback`。

## 原因

用户提供的iPhone截图显示推荐片名和评分已加载，海报全部退为占位图。
公开榜单接口实际返回了 `cover` 和 `cover_proxy`，不是缺少影片图片数据。
原独立版只保留首个地址并使用 `no-referrer` 加载；豆瓣原图实测返回418或403，
而接口附带的 `doubanio.viki.moe` 备用地址实测返回429 HTML，不能当作已加载海报。

## 修改

- 保留原图，同时传递明确的备用图片候选；仅推荐封面显式使用新候选链。
- 豆瓣原图失败后按序尝试LibreTV原项目已支持的 `img.doubanio.cmliussss.net` 和 `.com`，再尝试接口提供的HTTPS备用地址。
- 严格匹配真实 `img数字.doubanio.com` 主机名，保留图片路径、查询参数；去重并拒绝HTTP或含账号密码的候选。
- 所有候选失败后仍保留片名、评分和找片操作；刷新榜单会重新尝试图片。
- 不新增本站后端、Next API或视频代理，不改变用户影视API、播放地址、收藏、历史和进度。

这些是公开第三方图片服务，仍受其可用性和访问网络影响。
图片请求仅含公开海报地址，不发送用户的片源配置或观看记录。

## 验证

真实公开榜单有10条电影推荐。抽取3张海报、两个原项目已有镜像，共6次请求均为200 JPEG；
Chromium模拟iPhone UA与触控、以现有GitHub来源匿名加载，6张均成功解码。
这不代表iPhone Safari真机已验证；还需用户更新后检查自己的网络环境。

`npm run typecheck` 通过，53个测试文件、755项自动检查全部通过。
`npm run build:pages` 和 `npm run build:iphone` 均成功，仍为6条静态路由。

Chromium触控模拟的5项浏览器场景全部通过：真实海报自然回退；原图与第一镜像故障后第二镜像真实解码；
所有图片失败时片名、评分与找片搜索仍可用；网络恢复后在同页刷新成功；无未捕获错误、无新增后端或HTTP图片请求。
共18个真实图片DOM实例成功解码。找片搜索故障场景使用明确标注的测试源，未假称已验证实际视频播放。

## 发布

程序源码提交：`930740e4f069d33956f327ae30b49a3fc97af0ab`。
项目路径worker：`5beab2fea6e19c4c86cb`，64项公开程序缓存。
根路径worker：`07f69cf89613f15b9b9d`，63项公开程序缓存。

主地址：https://jingaox.github.io/codex-cloud/ 。
GitHub Pages静态提交：`6d73ce822e66770b4d6c236e3aeda1972e5e54e3`，平台返回`built`；线上首页、manifest与worker的SHA-256均匹配本地准确发布文件。
正式地址新浏览器会话另验证3张真实海报：540×807、540×675、540×770均完整解码，自动回退到首个备用图床，0个页面错误；仍为Chromium移动模拟，待iPhone真机确认。
原Sites地址同步更新：https://libretv-pocket-15pm-c3d9.honestfairy18.chatgpt.site 。
Sites版本11：`appgprj_6ada9b692918819181797977fa4e7c37~appgver_fa34302961c081918f1edaaa8ae44b72`。
部署：`appgdep_6ade8f50e7b0819184d4e69d76a76ad8`，返回`succeeded`，保持原公开可见性。

原App内通过设置 → 数据 → 应用更新 → 检查更新 → 更新并重新打开即可。
已更新但先前图片仍占位时可点榜单右上的刷新按钮；不要清理网站数据排查，以免丢失记录。

<!-- Author: yunnuo <ymz@ebox.vip> -->
# M3b 品牌上传验收（2026-10-26）

影响 Web 平台/单机和桌面；CLI 不装配。需求见 [实例品牌](../00-product/feature-branding.md)，存储选择见 [ADR-0009](../adr/ADR-0009-runtime-branding.md)。复用 system_settings，无 schema 迁移，历史 checksum 不变。新增三种 DTO、四个 operation 与可选 bootstrap.branding。

已验证格式/尺寸/原始大小限制、PNG/JPEG 重新编码及尾随内容清除、非法路径、文件权限、DB 保存失败保留旧图、引用共用/清理、并发更新、SQLite 重启、HTTP/Wails DTO、平台权限/CSRF、单机/平台接口分离。邮件使用最多 64 像素副本；高熵 RGBA 图片验证加密载荷低于 MySQL TEXT 的 65,535 字节。隔离回环 SMTP 验证测试邮件和六位码登录邮件：恢复默认删除文件并重启后，队列 CID 图片仍与创建时一致。未再次发送真实外部邮件。

浏览器真实 Go 服务新增 4 项：PC/375px 上的选择预览、取消/保存、浅深 Logo、system 随设备切换、favicon/manifest/站点名、无效上传、默认恢复、平台登录、四个模板预览与只读账号。浅深截图位于 build/acceptance/m3a/{chromium,mobile}/{light,dark}/brand-*.png（沿用共享 capture 路径）。完整 24 项 E2E 全部通过，覆盖账号邮件、角色、OIDC、会话、安装和共享 Core。修复了隐藏 file input 被高优先级宽度规则覆盖导致的 PC 横向溢出，随后全套回归通过。

真实 macOS arm64 Wails 使用 /private/tmp 下的隔离数据目录，经原生文件选择器完成浅色/独立深色 Logo 预览保存，侧栏随主题切换；实际约 378px 窗口无布局溢出。证据：[浅色保存](evidence-m3b/native-saved.png)、[深色品牌](evidence-m3b/native-dark.png)、[原生窄窗口](evidence-m3b/native-narrow.png)。没有用 HTTP 模拟桌面。SQLite 重启与恢复默认由实际 local.Open + Wails bridge 自动测试通过。2026-10-26 最后一次重启后的人工页面核对曾被 macOS 锁屏阻挡，以下补验已关闭该项。

2026-10-27 原生页面补验：用户解锁后，运行由提交 `900b2c3` 构建的真实 macOS arm64 应用，沿用 `/private/tmp/unicore-m3b-native/data` 隔离数据目录。重启后上传的浅色/深色 Logo 与深色主题偏好均保留，切换浅色后侧栏使用对应 Logo；证据：[重启深色](evidence-m3b/native-restarted-dark.png)、[重启浅色](evidence-m3b/native-restarted-light.png)。取消恢复默认后上传图片仍保留，确认恢复后两项 Logo 回到编译默认 Unicore 标志，恢复按钮禁用；证据：[恢复浅色](evidence-m3b/native-reset-light.png)、[恢复深色](evidence-m3b/native-reset-dark.png)。退出并再次启动同一隔离实例，两项默认 Logo 仍保留，实际调用原生共享 Core 得到 61 字符 / 9 词 / 3 行；证据：[恢复后再次重启](evidence-m3b/native-reset-restarted.png)。该实例 favicon 原已为默认值；Web favicon 上传/恢复沿用前述浏览器验收。此次仅补充验收记录和页面证据，无源码、契约或 schema 变更。

验证命令：make docs、make test（含 Go race、28 项 Vitest、TS、作者/契约/设计/边界/文档）、make build-all、make test-e2e 全部通过。Wails 包校验 vip.ebox.unicore 与五种 ICNS 分辨率品牌像素通过；两份已有设置/安全 Skills 更新并通过 quick_validate，框架上下文已重新生成。全套 Web 页面截图保留在 build/acceptance，选取的长期证据在下方。

2026-10-27 补验后重新执行 make docs、make test 通过（Go 测试复用缓存，28 项 Vitest 重新执行）。此次未重建 profile 或重跑浏览器 E2E，前述构建和 24 项 E2E 结果属于实现阶段记录；原生补验使用既有 `900b2c3` 产物。

本轮未重跑 PostgreSQL/MySQL、Windows/Linux 原生显示、外部邮件服务商或 CDN；不扩展先前实测范围。不包含原生包签名发行、自动备份、许可证和在线升级；这些仍为 M4。

长期页面证据：[Web 品牌设置](evidence-m3b/web-branding-light.png)、[375px 深色设置](evidence-m3b/mobile-branding-dark.png)、[登录页](evidence-m3b/login-branding-dark.png)、[邮件登录模板](evidence-m3b/mail-login.png)、[移动端找回密码模板视口](evidence-m3b/mail-reset-mobile.png)。四种模板的独立 iframe 截图位于 build/acceptance/m3b/{chromium,mobile}/，补拍后新增 4 项品牌 E2E 再次通过。移动端预览 iframe 内可继续滚动查看邮件底部。

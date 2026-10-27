<!-- Author: yunnuo <ymz@ebox.vip> -->
# 产品基线与当前范围

Unicore · yunnuo / ymz@ebox.vip。完整目标见 [design-v1.1.md](design-v1.1.md)。当前实现 M1 + M2a + M2b + M2c + M2d + M3a + M3b，不等同完整 v1。

基础能力本轮收尾：统一会话/缓存边界、路由/表单、契约文档/校验、运行配置/观测与 AI 开发入口，当前范围见 [基础能力审计](../04-ai/foundation-audit.md) 和 [验收](../04-ai/acceptance-ai-foundations.md)。

| 能力 | web-platform | web-standalone | desktop | cli |
| --- | --- | --- | --- | --- |
| 共享文本分析 Core | 已实现 | 已实现 | 已实现 | 已实现 |
| React / 三态主题 | 已实现 | 已实现 | 已实现 | 不适用 |
| 一次性安装 | 已实现 | 已实现，无管理员 | 自动初始化，无安装页 | 不装配 |
| 数据库 | PostgreSQL/MySQL/小型 SQLite | SQLite/外部 DB | SQLite | 禁止强依赖 |
| 登录/RBAC/用户管理/固定两角色 | 已实现，管理员/普通用户 | 不装配 | 不装配 | 不装配 |
| 持久化设置 | 全局仅管理员；外观仅本客户端 | 本地适用项 | 本地适用项 | 不装配 |
| SMTP / 六位验证码注册、登录、找回密码 | 已实现，需测试 SMTP 后显式启用 | 不装配 | 不装配 | 不装配 |
| 统一设计源 / Logo、ICO、原生图标 | 已实现 | 已实现 | 已实现，macOS 实测 | 不适用 |
| AI 文档/Skills/契约生成与检查 | 已实现 | 已实现 | 已实现 | 已实现 |
| OIDC 企业登录 / 账号绑定 | 已实现，默认关闭 | 不装配 | 不装配 | 不装配 |
| 实例品牌上传/恢复默认 | 已实现，服务端权限 | 已实现 | 已实现，Wails | 不适用 |
| 备案页脚 / SMTP 别名 / 系统通知 port | 已实现 | 备案页脚 | 备案页脚 | 不适用 |
| 授权/升级占位及编译裁剪 | 已实现，默认关闭 | 已实现，默认关闭 | 已实现，默认关闭 | 不装配 |
| 备份恢复 / 正式发布 / 升级 | M4 后续 | M4 后续 | 后续 | 后续 |

M2a：首次选择 Web 两模式，安装后固定；私有安装凭据、文件锁、DB 唯一安装标记与事务 seed，失败可恢复。平台默认开启图形验证码，不开放注册；内置 super_admin/user，服务端逐 API 权限与 CSRF，保护最后超管；用户搜索/分页/创建/启停/角色关联。持久设置通过 SettingDefinition 注册表管理，覆盖站点基础、主题、安全和后台路径。桌面自动 SQLite，平台身份与外部驱动不进入桌面组合。

M1：共享无状态文本分析（Unicode 字符/空白分隔词/行/字节/原始 SHA-256），跨入口相同 DTO 与结果；CLI 依赖图无 SQL/HTTP/Wails。业务文本不持久化，运行记录仅在当前前端会话。

M2b：SMTP 支持强制 STARTTLS/验证证书 TLS，本机可用明文测试；敏感设置加密、读取只返回配置状态。通过当前配置的真实测试邮件后才允许启用注册/恢复。注册默认关闭且仅授予 user，邮箱验证后启用。令牌一次性/分用途/哈希保存，邮件内容加密队列，失败最多 5 次重试。重置事务撤销全部旧 session，并阻止旧密码并发登录重新创建会话。

M3a：OIDC PKCE/state/nonce、显式绑定与最低权限 JIT 已实现，见 [需求](feature-oidc.md) 和 [验收](../04-ai/acceptance-m3a.md)。M3b 实例品牌见 [需求](feature-branding.md) 和 [验收](../04-ai/acceptance-m3b.md)；M4：备份恢复、签名 manifest、条件编译启用、受控 tar updater、Docker 镜像替换演练。v1 多用户不是多租户。

详细命令与实际平台验证记录见 [M2b 验收](../04-ai/acceptance-m2b.md) 与 [M2a 验收](../04-ai/acceptance-m2a.md)。

M2c：主题、字号/字体、圆角、间距、图标线宽、动效集中配置；品牌轮廓统一生成 Web/原生图标。四套中文 HTML/纯文本邮件与后台预览；新表单注册验证、邮箱登录、找回密码均用 6 位数字，10 分钟有效、60 秒重发、5 次错误上限，实例 HMAC 摘要及事务一次性消费。QQ SMTP 四种邮件已实际投递，收件人确认显示正常。旧长链接 API 仅保留兼容。验收见 [M2c](../04-ai/acceptance-m2c.md)。

当前权限：M2d 业务角色由固定管理员/普通用户方案取代。菜单、页面和全部管理 API 仅管理员；普通用户可使用 Core、本人账号和本地外观，不能读取全局设置。角色/状态变化撤销会话与验证码，最后管理员受保护。迁移 0007 规范旧角色并撤销存量凭据；见 [角色需求](feature-roles.md)、[ADR-0012](../adr/ADR-0012-fixed-platform-roles.md) 和 [验收](../04-ai/acceptance-permissions.md)。

设置按业务域 Tabs 展示，保持单层标签，品牌用三张卡片、外观复用主题预览卡片并移除侧栏重复入口，保留草稿并只保存当前分组，减少页面滚动。设置清单补齐：ICP/独立发件人别名、ICO favicon、共用系统通知模板和内部队列；授权/升级仅编译开关与待接入占位，不执行真实检查或更新。具体范围见 [设置需求](feature-settings.md) 与 [设置验收](../04-ai/acceptance-settings.md)。

交付基座：VERSION 单源生成各端版本、Changelog 准备、按 target/profile 快速归档和镜像/Compose 入口。Nginx 保留安装/后台/品牌路由边界；实际运行范围见 [部署验收](../04-ai/acceptance-deployment.md) 与 [ADR-0011](../adr/ADR-0011-release-deployment.md)。正式签名、自动发布、OTA 和备份恢复仍为后续。

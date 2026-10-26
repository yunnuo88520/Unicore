<!-- Author: yunnuo <ymz@ebox.vip> -->
# 产品基线与当前范围

Unicore · yunnuo / ymz@ebox.vip。完整目标见 [design-v1.1.md](design-v1.1.md)。当前实现 M1 + M2a + M2b，不等同完整 v1。

| 能力 | web-platform | web-standalone | desktop | cli |
| --- | --- | --- | --- | --- |
| 共享文本分析 Core | 已实现 | 已实现 | 已实现 | 已实现 |
| React / 三态主题 | 已实现 | 已实现 | 已实现 | 不适用 |
| 一次性安装 | 已实现 | 已实现，无管理员 | 自动初始化，无安装页 | 不装配 |
| 数据库 | PostgreSQL/MySQL/小型 SQLite | SQLite/外部 DB | SQLite | 禁止强依赖 |
| 登录/RBAC/用户管理 | 已实现，本地 session | 不装配 | 不装配 | 不装配 |
| 持久化设置 | 按权限分组 | 本地适用项 | 本地适用项 | 不装配 |
| SMTP / 注册验证 / 找回密码 | 已实现，需测试 SMTP 后显式启用 | 不装配 | 不装配 | 不装配 |
| OIDC / Logo上传 / 完整视觉集成 | M3 后续 | 按适用项 | 按适用项 | 不适用 |
| 备份恢复 / 正式发布 / 升级 | M4 后续 | M4 后续 | 后续 | 后续 |

M2a：首次选择 Web 两模式，安装后固定；私有安装凭据、文件锁、DB 唯一安装标记与事务 seed，失败可恢复。平台默认开启图形验证码，不开放注册；内置 super_admin/user，服务端逐 API 权限与 CSRF，保护最后超管；用户搜索/分页/创建/启停/角色关联。持久设置通过 SettingDefinition 注册表管理，覆盖站点基础、主题、安全和后台路径。桌面自动 SQLite，平台身份与外部驱动不进入桌面组合。

M1：共享无状态文本分析（Unicode 字符/空白分隔词/行/字节/原始 SHA-256），跨入口相同 DTO 与结果；CLI 依赖图无 SQL/HTTP/Wails。业务文本不持久化，运行记录仅在当前前端会话。

M2b：SMTP 支持强制 STARTTLS/验证证书 TLS，本机可用明文测试；敏感设置加密、读取只返回配置状态。通过当前配置的真实测试邮件后才允许启用注册/恢复。注册默认关闭且仅授予 user，邮箱验证后启用。令牌一次性/分用途/哈希保存，邮件内容加密队列，失败最多 5 次重试。重置事务撤销全部旧 session，并阻止旧密码并发登录重新创建会话。

M2 后续：完整角色/权限编辑流程；M3：OIDC PKCE/state/nonce、绑定策略、品牌上传和 GUI 体验；M4：备份恢复、签名 manifest、条件编译启用、受控 tar updater、Docker 镜像替换演练。v1 多用户不是多租户。

详细命令与实际平台验证记录见 [M2b 验收](../04-ai/acceptance-m2b.md) 与 [M2a 验收](../04-ai/acceptance-m2a.md)。

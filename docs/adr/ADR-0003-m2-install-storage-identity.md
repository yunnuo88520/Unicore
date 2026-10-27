<!-- Author: yunnuo <ymz@ebox.vip> -->
# ADR-0003：M2 安装、存储与身份基础

状态：接受 · 日期：2026-10-26 · 作者：yunnuo / ymz@ebox.vip

本次继续实现 M2 第一条端到端链路：Web 一次性安装、SQLite/PostgreSQL/MySQL 连接与分方言迁移、平台本地会话/RBAC/用户管理、定义注册的持久化设置；桌面自动 SQLite，不装配平台身份；CLI 保持无数据库/HTTP/Wails 的依赖图。SMTP、注册验证、找回密码和角色编辑 UI 另做后续 M2 增量，不声称已完成整个 M2。

存储使用 database/sql 与薄 Repository，SQLite 选 modernc 纯 Go 驱动，桌面/CLI 交叉构建不需要 sqlite CGO。迁移为嵌入、连续版本、校验和约束的各方言 SQL；SQLite/PostgreSQL 事务 DDL，MySQL 使用幂等 DDL，并只在所有语句成功后写迁移标记。安装标记与默认设置/管理员创建处于同一数据事务。平台表只在 platform profile 创建。

安装数据目录持有进程文件锁。外部密钥来自 APP_SECRET_KEY（32 字节 base64）或数据目录受限 secret.key；bootstrap.token 只写 0600 文件/从环境注入，不进日志或 API。运行配置中的 DSN 用 AES-256-GCM 加密。安装前持久化 INSTALLING intent，提交后写 INSTALLED；崩溃恢复查询 DB 唯一标记确认结果，不能仅删除 cookie/配置重开安装。token 在 DB 成功后逻辑吊销，即使本地收尾失败也不允许再次建管理员。

首次选择 Web 两种 profile，已安装后拒绝启动配置冲突。每个新实例必须使用独立空数据库/目录；存在不属于当前安装的安装标记时拒绝接管。桌面使用系统 AppData/Unicore/desktop，启动自动迁移 framework，不创建用户表。

身份为 Argon2id（64 MiB、3 轮、2 路）、随机不透明 session token 的哈希存储、HttpOnly/SameSite Cookie、会话派生 CSRF token、服务端权限与账号/IP 限流。登录验证码默认开启，一次性有时限。内置 super_admin/user，最后一个超管的禁用/降权在 DB 锁内判定；用户禁用/角色变更使旧会话失效。平台 API 默认拒绝，业务 Execute 也要求登录。

敏感设置使用统一注册表与 SecretStore，按 profile 校验；站点名称/描述/版权、外观、安全与后台路径本次实现。管理路径变更只改变 SPA 入口，API 仍固定 /api/v1/admin 且强制鉴权；APP_ADMIN_PATH 可用于恢复。远程单机应由受控反代/ACL 保护，不将无用户模式等同公网开放。

验收包含安装重放/并发/失败恢复、profile 不可切换、单机/桌面无用户表、真实三数据库迁移、密码不落明文、会话退出与失效、CSRF、401/403、最后超管保护、设置类型/范围/重启持久化、375px UI、CLI/桌面身份依赖隔离与相关产物构建。只有实际运行的数据库方言标为验证通过。

2026-10-27 增量：[ADR-0013](ADR-0013-installation-experience.md) 允许对未安装的专用非空库经精确确认后清空，增加经当前凭据授权的换新响应，并强化已安装实例缺失标记时拒绝；本页原空库/不返回 token 叙述为当时决策。

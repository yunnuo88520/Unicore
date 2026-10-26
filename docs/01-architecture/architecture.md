<!-- Author: yunnuo <ymz@ebox.vip> -->
# 当前架构（M3a）

共享业务依赖链：`entry → adapter → usecase → domain`。`internal/contracts` 从 OpenAPI 生成；domain 无传输/DB/身份依赖。CLI 只调用 bootstrap.Core；Web 装配 install 与按安装 profile 初始化的平台身份；桌面只装配 bootstrap/local 的 SQLite 与 settings。

```text
React web-ui → AppClient → HTTP adapter → install / platform / settings
                      └→ Wails bridge → local settings
CLI / HTTP / Wails → usecase.Executor → domain.Analyze
                          ports → SQL adapter（仅实际需要的形态）
```

| 模块 | 责任 |
| --- | --- |
| internal/domain / usecase | 文本分析规则、context 与 DTO 映射 |
| internal/install | 安装状态/凭据/恢复、DB 配置加密、按 profile 装配 |
| internal/platform | Argon2id、会话、权限策略、限流/验证码与 identity ports |
| internal/settings | Definition 注册、类型/范围校验与持久化 port |
| internal/secret | AES-256-GCM 与受限密钥/原子配置文件 |
| adapter/storage/sqlstore | 无驱动/身份依赖的 SQL、迁移、设置与审计基础 |
| adapter/storage/platformsql | 平台身份 SQL 实现 |
| adapter/storage/sqlite / webdb | 桌面只 SQLite；Web 组合所有 DB 驱动 |
| bootstrap/local | 桌面自动 SQLite、进程锁、profile 校验，不 import platform |
| packages/contracts / sdk / web-ui | 唯一契约源、双 transport、共享界面 |

## 安装与迁移

`UNINITIALIZED → INSTALLING → INSTALLED`，失败为 INSTALL_FAILED。私有 data dir 使用跨平台 flock；token 只在文件/环境，API 不返回。准备操作先持久化 intent；只有确认空库并保存 schema ownership 后才迁移。外部已安装或非空数据库拒绝迁移，失败重试不能绕过此检查。DB 的 install_state 与默认设置/管理员同一事务提交。重启恢复以唯一 DB 安装标记和实例 ID 为依据；profile 与实例不匹配拒绝接管。

SQLite 使用 WAL、5 秒 busy timeout、单连接；PostgreSQL/MySQL 使用 bounded pool。分方言迁移嵌入二进制，版本 checksum 不可修改。SQLite/PostgreSQL DDL 事务；MySQL DDL 隐式提交，采用幂等 SQL，完全成功再记录版本。只创建本 profile 所需表；不自动回滚或 drop 数据。M2b 平台新增 0003 的 account_tokens/mail_jobs，M2a 迁移 checksum 不变，单机/桌面停留 framework。M2b 不承诺备份恢复工具已实现。

## 认证与 API

公开 bootstrap 仅返回脱敏基础信息；安装 token 不暴露。平台 bootstrap 只对有效 session 回传用户/权限与 CSRF token。服务器 session token 仅哈希入库，Cookie 为 HttpOnly/SameSite；Secure 根据受验证的 base_url 决定。写操作校验 same-origin 和会话派生 CSRF。API 权限见 [permissions](../api/permissions.md)。改变用户角色/禁用使旧 session 失效，最后超管规则在锁安装标记的事务内检查。登录按真实连接 IP/账号限流，不信任可伪造的 X-Forwarded-For；反代应另有边缘限流。

未知/不适用 API 返回 JSON 错误，绝不 SPA fallback。未安装业务页跳转 /install；安装后 /install 回到首页。默认后台 /admin，设置更新后旧默认路径 404，新路径承载同一 SPA，API 地址固定且权限不变。APP_ADMIN_PATH 可作恢复覆盖。

文本 Execute 平台需登录，其他形态直接调用相同 Core；最多 65,536 UTF-8 字节。词是 Unicode 空白分隔，行计数规范化 CRLF/CR，摘要基于原始字节。输入不写 DB/日志。HTTP body 有大小限制、拒绝未知字段与尾随 JSON。

## 界面与扩展

HttpTransport 管理 cookie/CSRF 与 WebClient；页面不直接 fetch。WailsTransport 只提供 bootstrap/execute/settings，没有 Web 身份/安装接口。TanStack Query 管理状态；DashboardWidgetRegistry 以唯一 id 扩展业务首页。平台仪表盘来自 DB：总用户、UTC 今日新增、过去 7 天成功认证的去重账号、最近审计。单机/桌面没有用户统计。

主题偏好 localStorage，持久实例默认主题在设置注册表；当前以设备偏好优先。UI hash 子页面复用到 Wails，Web 的 /install、/admin 与 /settings 入口由服务器处理。light/dark/system 与 375px 浏览器测试，表格可横向滚动但页面不溢出。

桌面入口 `desktop || bindings`；绑定生成用编译期标记跳过真实用户存储。代码不使用环境变量来绕过该边界。CLI、Core 与桌面依赖隔离在 scripts/check-boundaries 中按实际 Go 依赖图验证。

Web 退出由 `internal/lifecycle.ServeHTTP` 先等待在途 HTTP 请求排空（5 秒上限），再由组合根等待 worker 结束并关闭存储；超时关闭连接，handler 需响应 context。监听失败与退出错误向 main 返回，避免 os.Exit 跳过组合根清理。跨入口配置、会话/路由/表单及可观测性的未完成项见 [基础能力审计](../04-ai/foundation-audit.md)。

## 邮件与账号流程

internal/platform/Accounts 编排策略、验证码/限流、注册与令牌；mailer 定义 Sender/队列 port，adapter/mail 实现 SMTP，platformsql 实现账号与投递事务。仅 Web 平台装配，服务进程每秒处理一个到期任务；桌面/CLI 不导入 SMTP 或队列模块。

设置注册表声明 Sensitive，SecretStore 用原实例密钥 AES-GCM 加密；API 敏感值始终为空并返回 configured，空输入保留，clear:true 显式清除。SMTP 测试记录绑定主机/端口/TLS/发件人/用户名及随机密文版本，避免保存 SMTP 密码的快速哈希。更改配置会使测试记录不匹配；已开启的邮件流程须先关闭再更换配置。

注册事务同时创建 pending 用户、user 角色、verify token 哈希和加密邮件；验证完成才变为 active。重发/重置申请对未知、禁用、已存在账号返回相同成功；重发会吊销同用途旧令牌。验证 30 分钟，重置 15 分钟；完成时锁安装标记并原子消费，禁止跨用途/过期/重放。重置撤销全部会话和账号令牌；登录创建会话在事务内重新比对已验证密码哈希，防止并发旧密码登录越过改密。

队列 60 秒租约、单次 10 秒超时、最多 5 次尝试，失败间隔 10/20/40/80 秒，超时/终止/成功清除加密载荷；脱敏任务元信息保留最多 7 天。崩溃后可重领租约，SMTP 接受后进程崩溃可能重复投递，因此只承诺至少一次；账号令牌仍只可消费一次。测试发送直接等待 SMTP DATA 确认，不将入队视为发送成功。

邮件链接的 token 放 URL fragment，页面初次捕获后立刻移除，提交用 JSON POST；无自动 GET 消费，无 token 日志，API no-store。TLS 校验使用系统根证书并要求 TLS1.2+；STARTTLS 缺失即失败，plain 只允许 loopback。外部服务商投递率/垃圾邮件判定不属于本机 SMTP 协议验收。

## M2c 设计和六位码增量

[ADR-0005](../adr/ADR-0005-design-email-codes.md) 定义统一设计编译链与挑战事务。tokens.json → CSS/嵌入 JSON → React/Go 邮件/图形验证码/原生窗口；identity.json → Resvg → 网站/原生/邮件同源图标。M2b 长链接保留兼容，新 UI 走 /auth/email/*；平台迁移增加 0004，framework-only 形态不引入 email_challenges。邮箱登录开启需测试 SMTP，session 与码消费同事务提交。

## M2d 业务角色

platform/roles.go 维护权限目录、可委派策略与内置角色规则，platformsql/roles.go 实现事务角色编辑和用户关联校验，HTTP roles.go 逐接口执行鉴权与 CSRF。Role/RoleInput/RoleList/RoleOptions 由 OpenAPI 生成；共享 roles-page.tsx 经 WebClient 调用 HTTP，不访问传输细节。仅 web-platform 的菜单/路由启用；非平台返回 JSON 404。

平台增加迁移 0005，登记角色读/写权限并补齐已有超管授权。用户创建、身份变更、角色改删均取得安装行锁并复核当前操作者权限；角色变更在同一事务撤销全部关联 session 与待用账号挑战。删除有关联用户的角色被拒绝。只读查询不承担授权决策，写入仍在事务内加载真实角色权限；无 UI 层授权缓存。规则和边界见 [ADR-0006](../adr/ADR-0006-business-roles.md)。

## M3a 企业身份

[ADR-0007](../adr/ADR-0007-oidc-identity.md)：install 仅在平台装配 platform.OIDC + adapter/oidc + platformsql。浏览器用 SDK 发起，返回固定 callback。state/browser 哈希及加密 verifier/nonce/context 持久化五分钟；外部 ID token 只在内存中验证，账号以 issuer/sub 识别。JIT 固定 user，显式绑定需本地密码与企业新鲜认证；提交在安装锁下复核配置、账号和原 session。0006 增加平台两张表，其他组合不变化，最后本地密码超管受保护。

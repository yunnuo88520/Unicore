<!-- Author: yunnuo <ymz@ebox.vip> -->
# 当前架构

共享业务依赖链：`entry → adapter → usecase → domain`。`internal/contracts` 从 OpenAPI 生成；domain 无传输/DB/身份依赖。CLI 只调用 bootstrap.Core；Web 装配 install、业务 Repository 与按安装 profile 初始化的平台身份；桌面装配 bootstrap/local 的 SQLite、appearance settings 与笔记 Repository，不引入平台模块。当前开发基座见 [ADR-0017](../adr/ADR-0017-developer-kit-business-backup.md)，下方保留历史增量的决策来由。

```text
React web-ui → AppClient → HTTP adapter → install / platform / settings / notes
                      └→ Wails bridge → local appearance / notes
CLI / HTTP / Wails → usecase.Executor → domain.Analyze
HTTP / Wails → usecase.Notes → domain.Note / NoteRepository port → SQL adapter
离线 unicore-ops → maintenance → 加密快照 / 新目标恢复（不进入业务 CLI）
```

| 模块 | 责任 |
| --- | --- |
| internal/domain / usecase | 文本分析、笔记规则、Repository port、context 与 DTO 映射 |
| internal/install | 安装状态/凭据/恢复、DB 配置加密、按 profile 装配 |
| internal/platform | Argon2id、会话、权限策略、限流/验证码与 identity ports |
| internal/settings | Definition 注册、类型/范围校验与持久化 port |
| internal/secret | AES-256-GCM 与受限密钥/原子配置文件 |
| adapter/storage/sqlstore | 无驱动/身份依赖的 SQL、迁移、设置与审计基础 |
| adapter/storage/platformsql | 平台身份 SQL 实现 |
| adapter/storage/sqlite / webdb | 桌面只 SQLite；Web 组合所有 DB 驱动 |
| adapter/storage/notessql | 笔记身份域、版本冲突与事务审计 |
| bootstrap/local | 桌面自动 SQLite、业务迁移、进程锁、profile 校验，不 import platform |
| cmd/ops / internal/maintenance | 停服锁边界的离线加密备份、校验和新目标恢复 |
| packages/contracts / sdk / web-ui | 唯一契约源、双 transport、共享界面 |

## 安装与迁移

`UNINITIALIZED → INSTALLING → INSTALLED`，失败为 INSTALL_FAILED。私有 data dir 使用跨平台 flock；token 首次由文件/环境提供；换新 API 必须验证当前凭据，只返回新值。准备操作先持久化 intent；确认空库或显式清空目标成功、保存 schema ownership 后才迁移。非空库必须独立勾选和精确库名确认，外部已安装数据库始终拒绝，失败重试不能绕过此检查。DB 的 install_state 与默认设置/管理员同一事务提交。重启恢复以唯一 DB 安装标记和实例 ID 为依据；profile 与实例不匹配拒绝接管。INSTALLED 后数据库或标记缺失在迁移前拒绝，不回到安装状态。结构化连接字段、默认 MySQL、自动 origin 和清空边界见 [ADR-0013](../adr/ADR-0013-installation-experience.md)。

SQLite 使用 WAL、5 秒 busy timeout、单连接；PostgreSQL/MySQL 使用 bounded pool。分方言迁移嵌入二进制，版本 checksum 不可修改。SQLite/PostgreSQL DDL 事务；MySQL DDL 隐式提交，采用幂等 SQL，完全成功再记录版本。只创建本 profile 所需表；不自动回滚或 drop 数据。M2b 平台新增 0003 的 account_tokens/mail_jobs，M2a 迁移 checksum 不变，单机/桌面停留 framework。此为历史 M2b 边界；当前离线工具见 ADR-0017。

## 认证与 API

公开 bootstrap 仅返回脱敏基础信息；安装 token 不暴露。平台 bootstrap 只对有效 session 回传用户/权限与 CSRF token。服务器 session token 仅哈希入库，Cookie 为 HttpOnly/SameSite；Secure 根据受验证的 base_url 决定。写操作校验 same-origin 和会话派生 CSRF。API 权限见 [permissions](../api/permissions.md)。改变用户角色/禁用使旧 session 失效，最后超管规则在锁安装标记的事务内检查。登录按真实连接 IP/账号限流，不信任可伪造的 X-Forwarded-For；反代应另有边缘限流。

未知/不适用 API 返回 JSON 错误，绝不 SPA fallback。未安装业务页跳转 /install；安装后 /install 回到首页。默认后台 /admin，设置更新后旧默认路径 404，新路径承载独立管理员 SPA，API 使用固定 admin 前缀且权限不变。APP_ADMIN_PATH 可作恢复覆盖。

文本 Execute 平台需登录，其他形态直接调用相同 Core；最多 65,536 UTF-8 字节。词是 Unicode 空白分隔，行计数规范化 CRLF/CR，摘要基于原始字节。输入不写 DB/日志。HTTP body 有大小限制、拒绝未知字段与尾随 JSON。

## 界面与扩展

HttpTransport 管理 cookie/CSRF 与 WebClient；页面不直接 fetch。WailsTransport 提供 bootstrap/execute/appearance settings/notes，没有 Web 身份/安装接口。SessionBoundary 按会话代际隔离 Query cache/组件状态，SDK epoch 拒绝旧响应，多标签页同步失效；routes.ts 与 PageContent 集中路由/权限及渲染，公共 Form/Field 与契约校验处理提交错误。TanStack Query 管理状态；DashboardWidgetRegistry 以唯一 id 扩展业务首页。工作台概览为默认首页，不再提供重复平台仪表盘；操作与投递记录通过独立系统日志页读取真实数据。

平台主题只存在当前客户端 localStorage，不读取/保存全局默认主题；普通用户只渲染本地外观卡片。单机/桌面的本地默认主题仍在设置注册表，设备偏好优先。设置使用共享可键盘操作的单层 Tabs，品牌图片使用三张并列卡片，外观卡片合并到设置、兼容旧 #settings 地址；主标签由 #site?tab=… 保留；按当前分组构造 PATCH，跨标签保留表单/图片预览草稿。UI hash 子页面复用到 Wails，Web 的 /install、/login、/register、可配置后台入口由服务器处理。light/dark/system 与 375px 浏览器测试，表格可横向滚动但页面不溢出。

桌面入口 `desktop || bindings`；绑定生成用编译期标记跳过真实用户存储。代码不使用环境变量来绕过该边界。CLI、Core 与桌面依赖隔离在 scripts/check-boundaries 中按实际 Go 依赖图验证。

Web 退出由 `internal/lifecycle.ServeHTTP` 先等待在途 HTTP 请求排空（默认 5 秒，可配置上限），再由组合根等待 worker 结束并关闭存储；超时关闭连接，handler 需响应 context。监听失败与退出错误向 main 返回，避免 os.Exit 跳过组合根清理。统一配置、日志、可选回环指标与契约文档端点见 [运行基座](../02-standards/runtime.md)。当前基础能力状态见 [基础能力审计](../04-ai/foundation-audit.md)。

## 邮件与账号流程

internal/platform/Accounts 编排策略、验证码/限流、注册与令牌；mailer 定义 Sender/队列 port，adapter/mail 实现 SMTP，platformsql 实现账号与投递事务。仅 Web 平台装配，服务进程每秒处理一个到期任务；桌面/CLI 不导入 SMTP 或队列模块。

设置注册表声明 Sensitive，SecretStore 用原实例密钥 AES-GCM 加密；API 敏感值始终为空并返回 configured，空输入保留，clear:true 显式清除。SMTP 测试记录绑定主机/端口/TLS/发件人/用户名及随机密文版本，避免保存 SMTP 密码的快速哈希。更改配置会使测试记录不匹配；已开启的邮件流程须先关闭再更换配置。

注册事务同时创建 pending 用户、user 角色、verify token 哈希和加密邮件；验证完成才变为 active。重发/重置申请对未知、禁用、已存在账号返回相同成功；重发会吊销同用途旧令牌。验证 30 分钟，重置 15 分钟；完成时锁安装标记并原子消费，禁止跨用途/过期/重放。重置撤销全部会话和账号令牌；登录创建会话在事务内重新比对已验证密码哈希，防止并发旧密码登录越过改密。

队列 60 秒租约、单次 10 秒超时、最多 5 次尝试，失败间隔 10/20/40/80 秒，超时/终止/成功清除加密载荷；脱敏任务元信息保留最多 7 天。崩溃后可重领租约，SMTP 接受后进程崩溃可能重复投递，因此只承诺至少一次；账号令牌仍只可消费一次。测试发送直接等待 SMTP DATA 确认，不将入队视为发送成功。

邮件链接的 token 放 URL fragment，页面初次捕获后立刻移除，提交用 JSON POST；无自动 GET 消费，无 token 日志，API no-store。TLS 校验使用系统根证书并要求 TLS1.2+；STARTTLS 缺失即失败，plain 只允许 loopback。外部服务商投递率/垃圾邮件判定不属于本机 SMTP 协议验收。

## M2c 设计和六位码增量

[ADR-0005](../adr/ADR-0005-design-email-codes.md) 定义统一设计编译链与挑战事务。tokens.json → CSS/嵌入 JSON → React/Go 邮件/图形验证码/原生窗口；identity.json → Resvg → 网站/原生/邮件同源图标。M2b 长链接保留兼容，新 UI 走 /auth/email/*；平台迁移增加 0004，framework-only 形态不引入 email_challenges。邮箱登录开启需测试 SMTP，session 与码消费同事务提交。

## 平台固定两角色

[ADR-0012](../adr/ADR-0012-fixed-platform-roles.md) 取代 M2d 业务角色。platform/roles.go 定义管理员/普通用户和管理权限目录；platformsql 仅按固定管理员角色投影权限，忽略历史 grants。OpenAPI 约束用户角色枚举，只生成 Role/RoleList/RoleOptions 读接口；roles-page.tsx 展示两角色矩阵，没有编辑接口。

routes.ts 集中管理员菜单/直达页守卫，settings-page.tsx 将平台本地外观与管理员全局设置分离。所有 /api/v1/admin/*（包括只读）在 HTTP 上复核当前固定管理员与权限，写入仍校验 CSRF/Origin；用户写入在安装行锁内重新加载操作者，保护最后一个启用且有本地密码的管理员。角色/状态变更撤销会话与账号挑战。公共品牌与登录策略保留最小公开投影。

平台迁移 0007 规范为单一固定角色、移除旧自定义角色与普通用户 grants、删除平台全局主题、撤销旧凭据和取消待发邮件。历史迁移 checksum 保持，其他形态只运行 framework 迁移。三方言实测和恢复边界见 [权限验收](../04-ai/acceptance-permissions.md)。

## M3a 企业身份

[ADR-0007](../adr/ADR-0007-oidc-identity.md)：install 仅在平台装配 platform.OIDC + adapter/oidc + platformsql。浏览器用 SDK 发起，返回固定 callback。state/browser 哈希及加密 verifier/nonce/context 持久化五分钟；外部 ID token 只在内存中验证，账号以 issuer/sub 识别。JIT 固定 user，显式绑定需本地密码与企业新鲜认证；提交在安装锁下复核配置、账号和原 session。0006 增加平台两张表，其他组合不变化，最后本地密码超管受保护。

## AI 开发入口

[ADR-0008](../adr/ADR-0008-ai-foundations.md) 将 manifest、AGENTS、文档/Skills 导航和生成漂移检查纳入仓库。OpenAPI 同源生成模型、typed operation、约束表、错误目录与离线文档，实际 Chi 路由比对契约；服务端权限与业务实现仍显式维护。`make docs` 生成，`make test` 检查；任务流程见 [AI 开发工作流](../04-ai/development.md)。

## M3b 实例品牌

[ADR-0009](../adr/ADR-0009-runtime-branding.md) 定义共享 internal/branding、私有规范化 PNG 与 DB 托管引用。管理端使用生成 DTO，通过 AppClient 驱动品牌预览/保存/恢复面板；本地形态使用构建品牌；BrandProvider 覆盖工作台和账号分支。平台公开当前哈希图片；Wails 不装配运行时品牌桥接，无 HTTP 模拟。邮件创建时快照图片字节到加密队列，SMTP CID 和预览同源；存储/清理顺序与恢复边界见 [需求](../00-product/feature-branding.md)。

[ADR-0010](../adr/ADR-0010-settings-edition.md) 补齐 ICP/别名/ICO/内部系统通知队列。internal/edition 按 license/updater tags 编译两个未来接入 port；Vite 编译常量裁剪对应卡片，默认均关闭。当前开启仅显示待接入状态，没有授权/版本 HTTP handler 或 OTA 行为。设置矩阵见 [规范](../00-product/feature-settings.md)。

版本与交付由 VERSION → scripts/version.mjs → 各端投影，Docker/归档读取相同元数据。Nginx 仅直接处理指纹资源，其余请求交 Go 保持安装/身份/动态品牌边界；详见 [ADR-0011](../adr/ADR-0011-release-deployment.md)。

原生 runner 将桌面结果归档后与同一 main 提交的 Web/CLI 包汇总；release-assets.mjs 检查版本、来源、矩阵和摘要，候选 workflow 为全部归档生成 GitHub 来源证明。CI 安全扫描包含桌面导入包和前端开发依赖。来源证明不替代平台代码签名或 OTA 签名，具体流程与限制见 [发版](../03-runbooks/release.md) 和 [安全发版记录](../04-ai/acceptance-security-release.md)。

## 管理员与用户身份域

当前身份/导航以 [ADR-0014](../adr/ADR-0014-separate-identities-management.md) 为准。platformsql.Repository 以固定 Administrators 标志映射七张身份表，SQL 标识符只来自固定代码映射；共享设置、审计与队列不映射。安装创建独立管理员，普通用户与管理员服务不回退。HTTP 固定用户/admin 路径与独立 Cookie 选择服务，写事务从管理员仓库重查操作者。管理员与用户管理端点分别固定身份，禁止角色转换；JIT 仅普通域。升级 0008 保留账号/绑定并撤销旧凭据。

React 的独立可折叠导航、共享原生 dialog、头像密码/退出、邮件单页与系统日志由 routes.ts/PageContent 注册；基础设置保持单层业务 Tabs。后台改名同步地址，OIDC 解除不改变当前域路径。共享 shell 适用于 Web/Wails，身份组件仅平台装配。

全局 MessageProvider 位于 SessionBoundary 外，统一五种语义的顶部短消息（默认 3 秒）。QueryScope MutationCache 处理提交异常，业务成功回调提供语义文案；字段错误/可重试加载状态保留在对应页面。消息挂载点跟随原生 dialog，避免顶层遮挡；无平台身份的形态不渲染账号头像。导航二级图标与缩进由共享 shell 管理。

## 文件存储

[ADR-0015](../adr/ADR-0015-file-storage.md)：internal/blob.Store 隔离字节存储，internal/files 通过 Repository/Factory ports 管理元数据、本人身份域权限、临时签名和持久清理；filesql 与 bloblocal/blobcloud 分别适配 SQL 与存储。install 只在平台装配 files/云 adapter，桌面不装配运行时品牌或文件服务；CLI 无文件/SQL/云依赖。0009 新增位置、文件、清理三表。文件保留 location_id，默认切换不改变旧位置；staging 条件复制完成后才能访问，文件迁移校验成功才切换引用。公开规范化品牌例外保留当前引用路由，并通过平台元数据适配访问。

## 双入口与本地业务界面

当前范围见 [ADR-0016](../adr/ADR-0016-separate-client-admin-surfaces.md)。用户 main.tsx 与管理员 admin.tsx 独立构建，管理页仅由 admin-app.tsx 导入，公共 Workspace 通过注入复用。Go 按 admin.path 返回 admin.html，非平台返回 404；用户 bootstrap 不公开后台路径。HttpTransport 构造时显式选域，使用契约中的固定 counterpart；所有页面仍通过 AppClient。旧身份请求头被忽略。管理员 auth/account 是管理员身份端点，管理业务继续逐权限校验。

单机/桌面仅业务与本地外观，SettingDefinition 非平台只允许 appearance，旧站点/品牌记录不再使用。原生品牌由构建源生成；Wails 不再暴露 Branding/UpdateBranding。上传组件与两端 shell 共用，SDK 只提供真实阶段回调。

开发基座与离线维护见 [ADR-0017](../adr/ADR-0017-developer-kit-business-backup.md)：notes usecase/SQL port 共享到 HTTP 与原生桥接，业务账本独立；cmd/ops 在实例锁边界做加密备份和新目标恢复，不进入业务 CLI。

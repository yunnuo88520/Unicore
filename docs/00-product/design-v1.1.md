---
title: Unicore · Go + React 跨形态开发框架设计文档
author: yunnuo
email: ymz@ebox.vip
version: 1.1
status: 方案设计 / 待开发
updated: 2026-10-25
---

# Unicore · Go + React 跨形态开发框架设计文档

> **正式名称**：Unicore（仓库及命令行使用 `unicore`；作者署名仍为 yunnuo）<br>
> **设计定位**：一套 Go Core + 一套 React UI，产出 Web 多用户平台、Web 单机、GUI 桌面和 CLI 命令行产品。<br>
> **作者**：yunnuo · ymz@ebox.vip<br>
> **文档版本**：v1.1（2026-10-25）<br>
> **文档性质**：产品需求 PRD + 技术架构设计 TDD + AI 开发规范基线

## 01. 项目愿景与范围

### 1.1 核心目标

该项目不是某个具体业务系统，而是一套可复用、可复制、面向 AI 协作开发的应用框架。未来每个新产品只编写自己的领域 Core、菜单和业务页面，即可按需构建在线平台、桌面版、CLI，并遵循统一的认证、安全、设置、部署、升级及交付标准。

- **业务复用**：同一业务算法与领域规则只在 Go Core 实现一次，不为 Web / GUI / CLI 重复开发。
- **形态隔离**：用户、权限、SSO、数据库及安装能力按运行形态装配，CLI 不被迫依赖数据库或 HTTP。
- **同批发布**：采用单仓库、单版本号，分别生成不同平台、不同架构的发行产物。
- **交付友好**：提供宝塔 / Nginx + Go 分离部署包，以及一个镜像内含前后端的 Docker 部署包。
- **AI 原生**：仓库自带 docs、AGENTS.md、Skills、决策记录、代码规则和测试准则，让 AI 能按照标准持续扩展。

### 1.2 首版必须完成与暂不完成

| 等级 | 事项 | v1 判定 |
|---|---|---|
| P0 | 三类入口、四种运行配置、Core 抽象、统一构建 | 必做 |
| P0 | Web 首次安装、平台用户/RBAC、仪表盘、用户管理、设置 | 必做 |
| P0 | 深浅主题、PC/手机响应式、GUI 本地 SQLite、CLI 无 DB | 必做 |
| P0 | tar.gz 和 Docker 两类部署、基本备份恢复、升级接口设计 | 必做 |
| P0 | 文档/Skills/作者注释/CI/自动化测试基线 | 必做 |
| P1 | SMTP 注册验证、找回密码、通知模板 | v1 推荐纳入 |
| P1 | 企业 OIDC 单点登录（单 IdP 优先） | v1 推荐纳入 |
| P1 | 授权检测与在线升级：支持编译条件开关和扩展接口 | v1 框架预埋；有服务端后启用 |
| P2 | SAML、多 IdP、租户隔离、消息队列、插件市场 | 后续版本 |

**边界说明**：“多用户平台”表示多个账号共享同一产品实例，**不等于**多租户 SaaS。首版不引入 tenant_id、多租户组织管理及复杂计费，未来可通过独立模块演进。

## 02. 产品形态与能力矩阵

| 功能 / 能力 | Web 平台 | Web 单机 | GUI 桌面 | CLI |
|---|---|---|---|---|
| 统一 Go Core | ✓ | ✓ | ✓ | ✓ |
| React 界面 | ✓ | ✓ | ✓ | — |
| HTTP 服务 | ✓ | ✓ | —（本地桥接） | — |
| 首次 `/install` | ✓ | ✓ | — | — |
| 用户、登录、角色/权限 | ✓ | — | — | — |
| 企业 OIDC SSO | ✓ | — | — | — |
| 管理端仪表盘 / 用户管理 | ✓ | — | — | — |
| 业务仪表盘与通用设置 | ✓ | ✓ | ✓ | — |
| 数据存储 | PostgreSQL/MySQL，限量 SQLite | SQLite 默认，允许选择外部 DB | SQLite 内嵌 | 无持久数据库 |
| 授权与版本检查（可编译关闭） | 可选 | 可选 | 可选 | 按产品可选 |
| 更新执行方式 | tar: 辅助升级器；Docker: 替换镜像 | 同 Web | 桌面安装包升级（后续） | 下载替换二进制（后续） |
| 响应式、浅色/深色 | ✓ | ✓ | ✓ | 终端原生 |

### 2.1 统一运行配置模型

定义 `AppProfile`（编译时/启动时确认，不允许在已安装实例运行时无损切换）：

- `web-platform`：多用户、平台设置、DB、认证/RBAC/SSO 可用。
- `web-standalone`：单机业务语义，无用户，DB 可选；仍是 HTTP 服务。
- `desktop`：桌面外壳 + Go Core + SQLite；无注册/登录/安装页。
- `cli`：命令入口 + Go Core；禁止引入 Web、用户及 SQL 驱动作为强依赖。

架构建议将 **Web / GUI / CLI 视为三类发行产品**，将 **Web 平台 / Web 单机视为 Web 内的两种运行模式**；统一发布版本，但不追求所有产物拥有同一组依赖。

### 2.2 “同一套代码”的实际边界

应共享的是 `domain`、`usecase`、业务规则、DTO/校验契约、共用 React 页面/组件；不强求复用的是 HTTP 控制器、桌面原生桥接、CLI 参数解析和鉴权中间件。GUI 与 Web 共用 React 页面，通过统一 `AppClient` 接口使用 `HttpTransport` / `WailsTransport`，避免页面内分叉大量 `if desktop`。

## 03. 总体技术架构

### 3.1 分层架构

```text
                    React UI（共用 UI / 页面 / 主题）
                      ├── Web Shell（Browser）
                      └── Desktop Shell（Wails WebView）
                             │ AppClient 接口
                   ┌─────────┴──────────┐
                   │                    │
               HTTP API             Wails Bridge
                   │                    │
                   └─────────┬──────────┘
                             │
                   Application / Use Cases
                             │
               Domain Core（不依赖框架与 DB）
                             │
         Ports：Repository / Notifier / Clock / File
                ├── SQL adapter（Web/GUI）
                ├── Local file / memory adapter
                └── CLI 无持久化 adapter（按能力）

                   CLI Entry ──► Application / Core
```

**核心约束**：依赖方向永远向内；`core` 不得 import `net/http`、Wails、ORM、React 生成代码或认证 UI；`cli` 不得为了复用而空连数据库。

### 3.2 建议技术选型

| 层次 | 首选 | 原因 / 约束 |
|---|---|---|
| 后端 | Go + 标准库优先，HTTP 用 Chi | 轻量、易测、组合式中间件 |
| 领域 | Go interfaces + usecase + repository ports | AI 容易按依赖规范增量开发 |
| 数据 | `database/sql` + sqlc 或薄 Repository；迁移用 goose | SQL 明确、可审计；多 DB 方言需要显式测试 |
| 平台数据库 | PostgreSQL / MySQL；SQLite 仅小型实例 | 生产在线并发推荐外部 DB |
| 本地数据库 | SQLite（桌面用可嵌入驱动） | 数据文件和备份易管理 |
| 前端 | React + TypeScript + Vite | Web/桌面共享构建资产 |
| UI | Tailwind CSS + shadcn/ui + Radix | 可定制风格，易构建响应式布局 |
| 状态/请求 | TanStack Query + Zustand（少量全局状态） | 区分服务端状态与界面状态 |
| 图表 | ECharts | 仪表盘图形丰富，移动端适配 |
| 桌面壳 | Wails v2 稳定版，桥接隔离 | Go + React，Windows/macOS/Linux |
| 命令行 | Cobra | 子命令、帮助文档、shell completion |
| 观测 | slog + OpenTelemetry 可选 | 结构化日志，可渐进接入 |
| 开发/发布 | Go test、Vitest、Playwright、GitHub Actions/GitLab CI | 自动化质量门禁 |

**Wails 选型备注**：截至 2026-10-25，官方将 v2 标为稳定、v3 标为 Beta；首版建议优先采用 v2，并以 `DesktopTransport` 隔离未来迁移成本。数据库实现选型在 P0 技术验证后定稿，不强制同时使用 sqlc 与 GORM。

## 04. 仓库目录及模块边界

```text
unicore/
├── AGENTS.md                         # AI 最高优先级仓库协作约定
├── README.md / CHANGELOG.md / LICENSE
├── go.mod / go.sum / Makefile
├── pnpm-workspace.yaml / package.json
├── cmd/
│   ├── server/main.go                 # Web 平台/单机入口
│   ├── desktop/main.go                # Wails 入口
│   ├── cli/main.go                    # CLI 入口
│   └── updater/main.go                # tar 发布受限辅助升级器（可选）
├── internal/
│   ├── domain/                        # 实体、值对象、领域规则
│   ├── usecase/                       # 业务编排 / ports
│   ├── platform/                      # 账号、角色、权限、SSO、审计
│   ├── settings/                      # 配置分组 / SecretStore
│   ├── install/                       # 安装状态机
│   ├── license/                       # 编译开关可裁剪
│   ├── upgrade/                       # 编译开关可裁剪
│   ├── adapter/
│   │   ├── http/                      # 路由/handler/middleware
│   │   ├── desktop/                   # Wails bridge
│   │   ├── storage/sqlite/
│   │   ├── storage/postgres/
│   │   ├── storage/mysql/
│   │   └── notify/smtp/
│   └── bootstrap/                     # 按 profile 装配依赖
├── packages/
│   ├── contracts/                     # OpenAPI + schema -> 生成 TS
│   ├── web-ui/                        # 共用 React 页面、主题、组件
│   └── sdk/                           # AppClient / transport 契约
├── apps/
│   ├── web/                           # browser shell、路由、install
│   └── desktop/                       # Wails 前端入口
├── migrations/                        # 按数据库方言与版本存放
├── assets/                            # logo、favicon 模板
├── configs/                           # 示例配置，不包含真实 secret
├── deploy/
│   ├── tar/                            # Nginx、systemd、安装/升级脚本
│   └── docker/                         # Dockerfile / compose.yaml
├── scripts/                            # release / lint / gen / smoke
├── tests/                              # e2e、profile、upgrade、contract
├── docs/
│   ├── 00-product/                    # PRD、形态矩阵、信息架构
│   ├── 01-architecture/               # 模块边界、数据流、API
│   ├── 02-standards/                  # 代码、UI、安全、DB 规范
│   ├── 03-runbooks/                   # 安装、部署、升级、恢复
│   ├── 04-ai/                         # AI 任务模板、验收模板
│   ├── adr/                           # 架构决策记录
│   └── api/                           # OpenAPI 和错误码
└── .agents/skills/                    # 可执行开发工作流技能
    ├── add-go-module/SKILL.md
    ├── add-react-page/SKILL.md
    ├── add-platform-permission/SKILL.md
    ├── add-setting/SKILL.md
    ├── db-migration/SKILL.md
    ├── add-cli-command/SKILL.md
    ├── release-cross-platform/SKILL.md
    └── security-review/SKILL.md
```

`internal/platform` 只属于 `web-platform` 组合，不能被 desktop/cli 的 bootstrap 引入；避免“没有用户界面，但底层仍加载身份模块”的伪隔离。`packages/contracts` 的生成产物不手改，作为前后端 API 一致性的唯一来源。

## 05. Web 首次安装向导

### 5.1 首启状态机

`UNINITIALIZED → INSTALLING → INSTALLED`；失败转为 `INSTALL_FAILED`，仅允许持有安装凭据的维护者安全重试。初始化完成后不可通过删除 cookie、URL 参数或重启重新出现 `/install`。

1. 首次请求由服务端确认未安装状态；访问任意业务页面跳转 `/install`。
2. 第一步：检查运行环境、数据目录可写、部署渠道、服务 URL、HTTPS 反向代理配置。
3. 第二步：选择 **多用户平台** 或 **单机模式**（仅首次可选）。
4. 第三步：配置 DB。平台优选 PostgreSQL/MySQL，单机默认 SQLite；提供连接测试和持久化目录测试。
5. 第四步：**仅平台模式** 填写管理员邮箱、账号、密码并校验；单机模式跳过账号步骤。
6. 第五步：展示摘要、执行迁移、写入站点默认配置、创建管理员（平台）、标记安装成功。
7. 第六步：显示部署访问地址、管理后台链接、用户前台链接、后续安全事项。

**默认路径与交付卡片**：平台用户端为 `{base_url}/`，后台为 `{base_url}/admin`；后台路径可在管理员设置中调整。Web 单机返回 `{base_url}/` 与 `{base_url}/settings`，不展示“管理员账号”。

### 5.2 安装流程安全约束

- 安装操作须具备一次性 `bootstrap token`（进程启动时生成或通过部署环境安全注入），不能由互联网上的第一个访客抢先创建管理员。
- **只允许单次提交**：进程锁 + DB 唯一安装标记 / 原子事务，阻止竞争安装和重复建号。
- 密码不写入日志/响应；安装成功立即吊销 token，安装 API 禁止再次执行。
- 配置连接密钥须加密保存，密钥来自外部环境或受限文件，并支持密钥恢复说明。
- 数据库不可连接、建表失败、浏览器刷新、重试时需要明确状态与可恢复动作。
- 如果安装选择后要更改 `web-platform`/`web-standalone`，视为**重新部署 + 数据迁移**，而非后台随时切换。

## 06. Web 信息架构与前端设计

### 6.1 页面体系

| 区域 | 平台模式 | 单机 Web / GUI |
|---|---|---|
| 初始化 | `/install`（首次） | Web 首次 `/install`；GUI 无 |
| 用户区域 | `/` 业务工作台、登录/注册/找回 | `/` 业务工作台（无登录） |
| 管理后台 | `/admin` 可修改前缀 | 不提供平台后台概念 |
| 后台一级菜单 | 仪表盘 / 用户管理 / 设置 | 不适用 |
| 单机设置 | 仅必要业务级设置 | `/settings` 或 GUI 设置页 |
| 系统错误页 | 403 / 404 / 500 / 维护 | 404 / 异常 / 数据修复 |

### 6.2 仪表盘设计规范

**平台默认卡片**：总用户数、今日新用户、近 7 天活跃数、系统状态；图表含用户新增趋势、最近操作审计、版本与更新状态。只有明确采集口径的数据才展示；“活跃用户”定义为过去 7 天有成功认证活动的去重账号。授权功能未编译时隐藏版本授权卡片。

**单机/GUI 默认卡片**：业务核心统计占位组件、最近处理任务、存储用量（如可获取）、当前版本；**不得出现用户增长/注册统计**。为未来业务模块预留 `DashboardWidgetRegistry`，卡片只通过 registry 扩展，不直接修改框架首页。

### 6.3 视觉与移动端规范

- 采用干净、专业的 SaaS 风格：卡片圆角、轻量阴影、统一 8px 间距体系、可配置品牌主色。
- 主题为 `light / dark / system` 三态，至少同时实现浅色和深色；尊重系统主题并在本机保存偏好。
- PC：侧栏 + 顶栏 + 内容区；手机：抽屉导航、单列卡片、表格转卡片/横向滚动，重要按钮保持可触达。
- 设计响应式断点建议为 640 / 768 / 1024 / 1280px，并测试 375px 手机宽度。
- 每个页面须具备 loading、empty、error、success、permission-denied 状态；图表支持键盘/读屏的补充文字。
- GUI 的窗口尺寸、缩放、系统色彩及字体跟随桌面端要求，业务页面重用 `web-ui`。

## 07. 用户、权限与企业 SSO

### 7.1 本地认证和 RBAC

平台账号字段建议：`id、username、email、password_hash、status、email_verified_at、last_login_at、created_at、updated_at`。用户支持启用/禁用、角色关联、筛选搜索、分页；管理员不得删除最后一个超级管理员账号。

权限结构：**User ⇄ UserRole ⇄ Role ⇄ RolePermission ⇄ Permission**。权限点使用 `资源:动作` 命名，如 `users:read`、`users:create`、`users:update`、`settings:write`、`upgrade:execute`；服务端逐 API 鉴权，前端隐藏菜单只起交互作用，不是安全边界。

内置 `super_admin`（最高权限）和 `user`（普通账号）两个最小角色；支持创建业务角色、赋权，但核心安全操作不得被普通角色绕过。登录会话建议采用服务端 session + 安全 Cookie（HttpOnly、Secure、SameSite），并实现 CSRF 防护、限流及登出失效。

### 7.2 验证码与邮箱

- **图形验证码默认开启**，平台登录/注册可分别配置开关；结合 IP/账号限流，不把验证码当作唯一防刷手段。
- 注册开放开关与图形验证码开关分开；安全默认建议为“注册关闭、验证码打开”，按产品开启注册。
- SMTP 配置：服务器/端口/TLS 模式/发件人/用户名/密钥/测试邮件；密码只显示掩码，数据库中加密保存。
- 配置 SMTP 后可启用：邮箱注册验证、找回密码、系统通知。SMTP 未就绪时，禁止启用必需邮件的流程并显示原因。
- 找回密码使用短时、一次性、哈希保存的重置令牌，重置后使旧会话失效；使用队列接口和重试机制，首版可实现单进程持久化任务表。

### 7.3 企业单点登录

**v1 优先对接 OIDC**：允许配置 Issuer、Client ID/Secret、Redirect URI、Scopes、用户唯一标识映射。使用授权码模式 + PKCE、state/nonce、严格回调地址验证。SSO 登入成功后按策略进行 JIT 建号与账号绑定；邮箱相同**不能直接证明账户归属**，必须要求可信验证/明确绑定流程。

SSO 用户默认授予最小权限，不允许企业返回的任意 claim 直接变成系统管理员。须配置“本地应急管理员”，避免企业 IdP 中断后整个系统不可管理。SAML、多企业 IdP 与复杂组织同步后续扩展，`IdentityProvider` 接口预留。

### 7.4 管理路径修改

默认管理前缀 `/admin`；修改时校验前缀合法、排除 `/api`、`/install`、`/assets` 等保留路径，在服务端集中解析路由并写审计事件。修改路径只是可用性/品牌诉求，**不能替代认证授权**；提供独立的恢复命令或环境配置，防止错误配置锁死管理端。

## 08. 设置中心（分组式）

| 分组 | 配置项 | 适用范围 |
|---|---|---|
| 站点基础 | 站点名、Logo、Favicon(ico)、描述、页脚版权、备案号/备案链接 | Web 平台；单机显示适用项 |
| 账号与注册 | 是否开放注册、用户名规则、邮箱验证开关 | 仅平台 |
| 安全 | 登录/注册图形验证码开关（默认开）、会话时长、登录失败限流 | 仅平台 |
| 邮件 | SMTP 主机/端口/TLS/账号/密钥、发件人、发送测试 | 仅平台为主 |
| 企业登录 | OIDC 提供商开关、Issuer、映射和 JIT 策略 | 仅平台 |
| 管理后台 | `/admin` 前缀、后台标题、菜单显示项 | 仅平台 |
| 外观 | light/dark/system、品牌色、紧凑模式 | Web 与 GUI |
| 版本与授权 | 当前版本、授权状态、检查更新、升级入口 | 按编译能力和部署方式 |
| 数据维护 | 备份、导入/导出（审计控制）、本地 DB 路径展示 | 按形态支持 |

设置采用“键名 + 类型 + 分组 + 默认值 + 是否敏感 + profile 适用范围 + 校验规则”的 `SettingDefinition` 注册方式；后端执行类型和权限校验；变更敏感设置须记录审计。Logo、Favicon 上传仅允许安全格式与限制大小，管理资产路径不可执行脚本。

## 09. 数据库与版本迁移

### 9.1 数据隔离与方言策略

- `platform` 数据（users、roles、permissions、sessions、sso_links）只在多用户模式建立。
- `framework` 数据（settings、migrations、audit、job、upgrade_history）按 profile 建表；CLI 不建表。
- `business` 数据由未来业务模块拥有自己的 schema / Repository，避免所有业务字段写进框架核心。
- SQLite 保持 WAL/忙等待策略；桌面单进程数据库访问受控，目录为系统标准 App Data 位置；不把本地数据库写在安装程序所在目录。
- PostgreSQL/MySQL/SQLite 分方言迁移与 SQL 测试；如跨方言 SQL 能力不一致，禁止仅在一种 DB 上成功就宣称支持全部。

### 9.2 首批数据表

`install_state`、`system_settings`、`schema_migrations`、`audit_logs`、`users`、`roles`、`permissions`、`user_roles`、`role_permissions`、`sessions`、`external_identities`、`mail_delivery_jobs`、`upgrade_history`、`license_state`（后两者按编译条件创建）。业务相关表不预置。

每个迁移文件有连续版本、作者信息、变更目的和回滚策略；高风险 DDL 需要备份和兼容评估。数据库向前迁移与应用升级分开编排：不得在不可逆 DDL 已应用后承诺仅回滚二进制就完整恢复。

## 10. 统一接口、错误与可观测性

### 10.1 核心接口约定

```go
// Author: yunnuo <ymz@ebox.vip>
// Description: 公共业务操作只依赖接口，不依赖任何 Web、Wails 或 SQL 实现。
type Service interface {
    Execute(ctx context.Context, input Input) (Output, error)
}

type Repository interface {
    Save(ctx context.Context, item Item) error
    Find(ctx context.Context, id string) (Item, error)
}
```

HTTP API 使用 `/api/v1` 版本前缀；默认 JSON 响应形如 `{ "code": "OK", "message": "", "data": {}, "request_id": "..." }`。业务错误码稳定、可检索、可本地化，避免前端依赖中文错误提示判断状态。生成 TypeScript client 和 OpenAPI 文档，GUI bridge 保持相同 DTO/错误模型。

### 10.2 主要 API 草案

| API | 说明 | 访问 |
|---|---|---|
| `GET /api/v1/bootstrap` | 当前 profile、主题及前端基础能力 | 公开，脱敏 |
| `GET /api/v1/install/status` | 安装状态 | 未安装时可用，脱敏 |
| `POST /api/v1/install/verify-db` | 安装前连接测试 | 安装 token |
| `POST /api/v1/install/complete` | 完成一次性安装 | 安装 token |
| `POST /api/v1/auth/login` | 平台登录 | 平台 |
| `GET /api/v1/admin/dashboard` | 后台统计 | 具有仪表盘权限 |
| `GET/POST /api/v1/admin/users` | 用户列表/新增 | 用户权限 |
| `GET/PATCH /api/v1/admin/settings` | 分组配置读取/更新 | 设置权限 |
| `POST /api/v1/admin/settings/mail/test` | 发送测试邮件 | 邮件设置权限 |
| `GET /api/v1/admin/update/check` | 检查版本 | 编译能力 + 权限 |
| `POST /api/v1/admin/update/execute` | tar 模式受控升级 | 编译能力 + 升级权限 |
| `GET /api/v1/health/live` | 存活检查 | 可不披露内部详情 |
| `GET /api/v1/health/ready` | 数据与依赖就绪 | 仅受限监控访问 |

统一日志字段：`timestamp、level、service、profile、version、request_id、trace_id、event`；禁止记录密码、完整 token、SMTP 凭据、Cookie、授权原文。管理员登录、权限更改、重要设置、升级执行记录审计日志。

## 11. 授权中心与版本系统

### 11.1 编译前开关

构建配置使用 `FEATURE_LICENSE=true/false`、`FEATURE_UPDATER=true/false` 转换为 Go build tags / 条件文件组合，配合前端 build manifest 控制路由、菜单与 API SDK 暴露。**关闭某项能力时，服务端相关 handler 和依赖不能被注册**；不是简单 CSS 隐藏按钮。

- `false`：完全不初始化授权/升级客户端，不拉取授权站信息；UI 不显示对应入口。
- `true`：支持启用/关闭运行时检查频率、升级频道；真正执行更新依赖 `deployment_kind`。
- 将来授权站通过 `LicenseProvider` / `ReleaseProvider` 注入；框架不假设授权站 URL、签名算法和许可证商业规则已经定稿。

### 11.2 授权与版本清单

版本使用 SemVer：`1.2.3`；发布清单包含 `version、channel、profile、os、arch、artifact、sha256、signature、min_upgrade_version、migration_level、release_notes`。授权建议绑定许可证标识、产品、权益与有效期；服务端签名校验，按需支持离线宽限期，敏感许可证密钥不编入客户端。

必须区分**升级包完整性与授权合法性**：升级包签名及哈希校验保护供应链；授权校验控制权益；这两个过程不能共用简单的明文标记作为安全基础。

## 12. 服务器部署与升级设计

### 12.1 tar.gz：Nginx + Go 前后端分离

发行包示例：

```text
unicore-web-linux-amd64-v1.0.0.tar.gz
├── bin/server
├── web/dist/
├── deploy/nginx.conf.example
├── deploy/unicore.service
├── configs/config.example.yaml
├── migrations/
├── scripts/install.sh
├── scripts/upgrade.sh
├── scripts/rollback.sh
├── VERSION / checksums.txt / manifest.json
└── README_DEPLOY.md
```

宝塔/Nginx 静态站点负责 `/` 前端及资源，`/api/` 反向代理到 Go 后端（如 `127.0.0.1:8080`）；动态 SPA 路由回退到 `index.html`，但 API 不允许回退为 HTML。独立数据目录及配置目录不放在公开 Web root，系统服务使用低权限专用用户。

升级路径：后台确认版本 → 查询签名 manifest → 下载 staging → 校验签名/哈希/兼容性 → 备份 DB 与配置 → 辅助升级器替换 versioned 目录与 `current` 软链 → 重启 systemd → readiness 检查 → 成功标记 / 自动回滚代码和静态资源。**自我重启和文件替换交给具备最小权限的外部 updater**，Go Web 进程不得随意获取 root 权限。

### 12.2 Docker：单镜像内含前端与后端

Dockerfile 多阶段构建 React 静态文件和 Go 二进制；最终一个应用镜像，Go 通过 `embed.FS` 提供 `/` 静态资源及 `/api/v1`。可部署 `app` 单容器，也可 `compose.yaml` 包含 PostgreSQL 服务；**数据库、上传文件和配置密钥均位于镜像外的 volume / 外部服务**。

Docker 升级不是在运行容器里覆盖二进制或运行 `docker pull`；标准方式为发布新镜像，通过运维侧执行 `docker compose pull && docker compose up -d`，由 Compose 替换容器并保留挂载卷。后台可以“检查更新 + 展示目标版本/操作指引/调用可选受控外部编排接口”，但**不默认挂载 Docker socket**。升级前由外部作业执行 DB 备份、兼容检查和升级后的健康检查。

**共同规则**：提供 `APP_DEPLOYMENT_KIND=tar|docker`，版本检查共用 ReleaseProvider，升级执行策略根据介质不同而不同；Docker 后台不能伪装成“直接覆盖升级成功”。

### 12.3 GUI / CLI 发布

GUI 按 Windows/macOS/Linux 编译安装包，SQLite 数据位置稳定、升级不覆盖用户数据。首版可先提供“检查更新/打开下载页”，完善代码签名与安装器后再上线一键替换。CLI 编译独立 Go 二进制（Win/macOS/Linux；amd64/arm64），内置 `version`、`help` 与终端自动补全；CLI 不为版本记录依赖 SQLite。

## 13. 构建、版本及 CI/CD

- 单仓库一次打 tag，例如 `v1.0.0`，一次流水线生成所有目标产物及对应 checksum/signature；允许独立 profile 构建失败阻止正式发布。
- 建议构建矩阵：Web `linux/amd64`、`linux/arm64`；Desktop `windows/amd64`、`darwin/amd64`、`darwin/arm64`、`linux/amd64`；CLI 补充 Linux/macOS/Windows 双架构（视驱动限制调整）。
- 产物文件名统一 `product-profile-os-arch-version.ext`；所有二进制嵌入 `version/commit/build_time/profile/features` 元信息。
- 流水线门禁：静态检查 → 单测 → OpenAPI 契约 → DB 多方言迁移测试 → React 单测 → E2E 安装/认证 → profile 构建 → 依赖扫描 → 产物签名 → 发布。
- `make dev-web`、`make dev-desktop`、`make dev-cli`、`make test`、`make build-all`、`make release` 固化在 Makefile；Windows 兼容脚本可用 PowerShell。

## 14. 开发规范：作者注释、文档与 AI Skills

### 14.1 源文件作者注释

手写源代码文件必须有作者标识：**yunnuo / ymz@ebox.vip**。格式按语言合法语法实现：

```go
// Author: yunnuo <ymz@ebox.vip>
// File: internal/usecase/example.go
// Description: 示例业务用例，禁止依赖 Web 与数据库具体实现。
package usecase
```

```tsx
/**
 * Author: yunnuo <ymz@ebox.vip>
 * File: packages/web-ui/src/components/Example.tsx
 * Description: 共用 React 组件。
 */
export function Example() { return null; }
```

- Go 的 `//go:build` 等编译约束必须在合法的规定位置，作者注释放在其后；Shell 保留第一行 shebang。
- YAML 使用 `#`、SQL 使用 `--`、CSS 使用 `/* ... */`；Markdown 在文档元数据/开头标注作者。
- **严格 JSON、自动生成文件、第三方文件、二进制及框架要求固定开头的文件例外**：不插入非法注释，在旁边的 metadata、生成器源文件或文档 manifest 记录作者，且不手改生成文件。
- 重要公开 API 补充 GoDoc/TS Doc；作者头部不能取代业务说明、变更记录和测试。

### 14.2 文档必须随代码更新

任何业务扩展同步更新：`docs/00-product/feature-*.md` 需求、`docs/01-architecture/module-*.md` 设计、OpenAPI 契约、权限清单、配置项、测试与运行说明；涉及重大选择创建 `docs/adr/ADR-xxxx-*.md`，解释背景、选择、替代与后果。

### 14.3 AGENTS.md 约束（需落地到仓库）

1. 修改前阅读对应产品形态矩阵与 ADR；先列影响的 profile。
2. 不允许 Core import 框架/数据库/传输代码，不允许 CLI 引入持久化强依赖。
3. 新增设置必须登记 `SettingDefinition`，新增平台 API 必须登记权限点。
4. 新增功能必须有测试、文档、作者注释，且通过 `make test` 和所有相关 profile 构建。
5. 不得将密码、密钥、生产配置或个人数据写入代码/测试快照。
6. 修改数据库 schema 必须出迁移文件，给出兼容与回滚策略。
7. 更新功能必须考虑 tar 与 Docker 的差异，不能在容器内自行覆盖二进制。
8. AI 输出先说明设计与验收，再提交代码变更；禁止大范围无关重构。

### 14.4 Skills 模板标准

每个 `.agents/skills/<name>/SKILL.md` 包含：`name、description、trigger、inputs、steps、output、forbidden、validation`。如 `add-go-module` 负责用例/port/adapter/依赖装配与单测；`add-react-page` 负责响应式、主题、加载/空态；`add-platform-permission` 负责 RBAC 点及服务端检查；`release-cross-platform` 负责 profile 构建矩阵、签名、归档与版本产物。

**AI 工作输出契约**：每次开发应提交“需求确认 → 影响矩阵 → 文件清单 → 代码与迁移 → 单测/E2E → docs/ADR 更新 → 验收报告”，并在报告说明哪些构建目标已经实测、哪些尚未验证。

## 15. 安全、稳定性与非功能要求

| 指标 | v1 目标 / 验证方法 |
|---|---|
| 可靠性 | 安装不可重复执行；异常重试无重复管理员与半安装可用状态 |
| 账号安全 | Argon2id 密码哈希、账户/登录限流、CSRF、会话失效、审计 |
| 数据安全 | 敏感设置加密、密钥外部保存、备份恢复演练、上传校验 |
| API 安全 | 默认拒绝、每个管理员 API 后端 RBAC、输入校验与错误脱敏 |
| SSO 安全 | OIDC 授权码 + PKCE / state / nonce，禁止隐式高权限映射 |
| 升级安全 | 签名与哈希校验、介质识别、备份、健康检测、失败恢复 |
| 性能 | P0 页面普通数据下响应目标：API p95 < 300ms（排除大批量任务） |
| 适配 | 375px 手机、常见平板、PC；Windows/macOS/Linux GUI |
| 可访问性 | 可键盘操作、可读对比度、表单错误提示、图表文字说明 |
| 可运维 | 结构化日志、探针、版本信息、灾难恢复 Runbook |

**Web 单机模式额外安全要求**：默认监听 `127.0.0.1`；若管理员明确暴露到公网/局域网，必须有受控访问入口（反向代理认证、访问密钥或网络 ACL）和风险提示。无用户系统并不代表可以默认开放所有敏感接口。

## 16. 首版交付节奏（推荐 4 个里程碑）

| 里程碑 | 交付焦点 | 通过条件 |
|---|---|---|
| M1 基座 | Monorepo、Go Core、ports、Web/GUI/CLI 空壳、CI、AGENTS/Skills | 三类产物跑通，共享示例用例，CLI 依赖树无 DB |
| M2 平台功能 | Web 两模式安装、DB、认证、RBAC、后台菜单、设置、SMTP | 首装、登录、授权、单机无用户、配置成功 |
| M3 视觉和企业集成 | 仪表盘、响应式、深浅主题、OIDC、GUI 体验 | E2E 与移动适配通过，SSO 安全验证通过 |
| M4 交付与升级 | tar、Docker、release manifest、授权/升级可编译裁剪、备份恢复 | 两种部署实测、Docker 镜像替换升级、tar 回滚演练 |

顺序建议先通过“跨形态最小闭环”（同一 Core 的一个业务用例在 Web、GUI、CLI 三处运行）再叠加平台用户权限，否则后期很容易把 Core 与平台耦合。

## 17. 验收用例清单（可转换为自动化测试）

- **AC-01**：新 Web 平台首次访问自动进入 `/install`，使用一次性 token 后才能真正提交。
- **AC-02**：平台成功创建管理员，安装完成页展示 `/` 与 `/admin` 可访问链接；第二次安装失败。
- **AC-03**：Web 单机安装不出现管理员字段、不创建 `users` 账号；可自选 SQLite / 外部数据库。
- **AC-04**：GUI 首启不出现安装向导/登录页，自动创建 SQLite 文件并打开业务界面。
- **AC-05**：CLI 不启动 HTTP / Wails、不请求数据库，运行统一 Core 示例用例成功。
- **AC-06**：平台普通用户调用管理员 API 返回 403，且前端隐藏无权菜单。
- **AC-07**：登录/注册图形验证码默认开启；关闭后仍保留基础限流；SMTP 测试与找回密码可用。
- **AC-08**：后台修改站点名称/Logo/favicon/版权/备案后，PC 与手机端正确展示。
- **AC-09**：管理后台前缀可改，旧前缀不可绕过权限；可通过恢复手段纠正错误路径。
- **AC-10**：企业 OIDC 登录不会自动获取管理员权限；应急本地管理员可用。
- **AC-11**：浅色/深色在 Web/GUI 都有效，375px 宽度无横向布局溢出。
- **AC-12**：编译关闭 license/updater 时，对应 UI、API 路由与后台依赖都不存在。
- **AC-13**：tar.gz 在 Nginx+Go 形态可独立部署，版本更新失败可执行恢复手册。
- **AC-14**：Docker 单镜像包含前后端，更新镜像后数据卷内数据保留，UI 不尝试容器内覆盖升级。
- **AC-15**：所有手写源码符合作者标识规范，AI Skills 检查、测试和 API 契约通过。

## 18. 需提前冻结的设计决策

| ID | 决策 | 推荐默认值 |
|---|---|---|
| D-01 | 多用户 vs 多租户 | v1 为单实例多用户，不做多租户 |
| D-02 | 桌面框架 | Wails v2 稳定版；桥接以适配器封装 |
| D-03 | Web 单机是否可远程访问 | 默认 loopback；远程访问明确启用保护 |
| D-04 | 平台默认 DB | PostgreSQL 优先，MySQL 支持；SQLite 限制规模 |
| D-05 | CLI 存储 | 不依赖数据库；业务文件输入输出按命令定义 |
| D-06 | SSO 范围 | OIDC v1；SAML 后续 |
| D-07 | 用户注册默认 | 默认关闭，验证码默认开启 |
| D-08 | 授权/升级开关 | 编译能力裁剪 + 运行时策略两层 |
| D-09 | Docker 更新执行 | 外部 Compose/CI/CD，不授予容器 Docker socket |
| D-10 | 管理路径 | 默认 `/admin`，支持改名但仍强制 RBAC |
| D-11 | 发布策略 | 单仓库单版本，多 profile/OS/Arch 产物 |

## 19. 推荐的立即开发任务

**第一个可落地的开发 Sprint**：建立目录、`AGENTS.md`、基础 8 个 Skills；实现 `core` 示例 `Execute()`、Web HTTP adapter、Wails bridge 和 CLI 命令；React 页面使用同一个 SDK 契约加载示例结果；补齐 CI 和 P0 测试。**只有这个闭环成立，才开始实现安装、RBAC 和升级系统**。

建议交付物包括 `docs/00-product/PRD.md`、`docs/01-architecture/architecture.md`、`docs/02-standards/coding.md`、`docs/03-runbooks/deployment.md`、`docs/04-ai/task-template.md` 和初始 ADR 清单，使后续 AI 能根据明确输入执行而非重新猜需求。

## 附录 A. 信息来源及技术参考

本方案为框架设计建议，并非现成实现；外部项目版本状态及安全规范参考以下资料（查询日期：2026-10-25）。

- Wails 官方版本状态：https://github.com/wailsapp/wails；https://v3.wails.io/status/
- Go 官方 embed.FS 文档：https://pkg.go.dev/embed
- Docker Compose 更新行为：https://docs.docker.com/reference/cli/docker/compose/up/；https://docs.docker.com/reference/cli/docker/compose/pull/
- OpenID Connect Core：https://openid.net/specs/openid-connect-core-1_0.html
- OAuth 2.0 安全最佳实践 RFC 9700：https://datatracker.ietf.org/doc/html/rfc9700
- Browser-Based Apps RFC 10017：https://datatracker.ietf.org/doc/rfc10017/
- OWASP 密码存储安全指南：https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html

---

**文档维护规则**：该设计文档为框架第一版基线。实际选型或范围变化必须追加 ADR，并同步调整产品形态矩阵、API、测试和 Skills；不能仅改代码而不更新规范。

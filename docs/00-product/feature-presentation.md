<!-- Author: yunnuo <ymz@ebox.vip> -->
# 功能呈现与访问规范

本文定义功能在不同产品形态与用户上下文中的呈现规则：谁看到什么菜单、页面、设置与仪表盘组件，直接访问路由或 API 时服务端如何裁决，以及形态间一致性要求。形态定义与能力矩阵见 [产品形态与能力边界规范](product-forms.md)，功能盘点见 [功能适用性清单](feature-inventory.md)。

## 1. 访问主体上下文

| 上下文 | 形态 | 主体语义 | 会话/凭据 |
| --- | --- | --- | --- |
| Platform 用户域 | Platform | 统一账号（`unicore_users`），业务 + 可叠加管理权限，多角色 | `unicore_session` Cookie，user realm |
| Platform 管理员域 | Platform | 管理后台运营者（super_admin 或受限管理员角色） | 共享 `unicore_session` Cookie，administrator 工作台（由 `/api/v1/admin/` 路径前缀选择，不改变账号） |
| Standalone 本地使用者 | Standalone | 无账号主体：本机可达即可用的隐式使用者（`scope="local"`、`actor="local"`） | 无会话；web 受 sameOrigin 等中间件保护，desktop 无 HTTP 面 |
| CLI 调用者 | CLI | 命令行调用共享 Core 的进程内执行者 | 无 |

规则：

- 单用户 ≠ 超级管理员：Standalone 不继承 Platform 超管能力集；它的能力边界是「本机单机业务 + 本地外观 + 本机更新」，不是「平台全部管理功能去掉了登录」。
- Platform 前端凭 `profile` 与 `identity_realm`（bootstrap 元数据）区分上下文；`capabilities.authentication=false` 时登录/注册流整体不出现（`packages/web-ui/src/session.tsx`、`packages/web-ui/src/App.tsx`）。

## 2. 导航与菜单

导航事实源是一棵共享导航树，双端同构镜像：

- 后端种子与持久化：`internal/platform/navigation.go`（`DefaultNavigation`，业务/系统两区域 + 超级管理员/系统设置/个人中心目录）、`internal/adapter/storage/platformsql/navigation.go`（CAS 版本持久化，reset 仅 super_admin）。
- 前端镜像与默认树：`packages/web-ui/src/navigation.ts`（`defaultNavigation` 与后端种子逐条对应）。

呈现规则：

1. Platform：服务端投影。bootstrap 按 surface（user/administrator）经 `platform.NavigationFor` 投影导航树，非 super_admin 逐节点校验 `menu_ids`；动作节点按 `action_ids` + 权限点校验。前端 `buildNavigation` 仅在 web-platform 采用服务端树。
2. Standalone：客户端本地构建。`defaultNavigation` 按 profile 过滤：剔除 personal/administration 组与 system 组（仅保留 `edition`），不提供外观设置页面。两载体使用同一份本地默认树逻辑。
3. CLI：不适用图形导航规则；呈现即命令树（`unicore --help`）与结构化输出。
4. 页面可见性（`packages/web-ui/src/routes.ts` `canAccess`）在权限点之外有形态硬规则：Platform 用户域永不呈现 `site/api-docs/announcements`（管理面拆分，[ADR-0016](../adr/ADR-0016-separate-client-admin-surfaces.md)）；`api-docs` 需 `api_docs` 能力且仅 Web 形态（desktop 无契约端点）；`edition`（系统更新）在 Platform 仅 super_admin，其他形态看 updater 能力。
5. 菜单、页面、功能不是同一概念：菜单授权（menu_ids）只决定入口，不授予 API；按钮动作（action）与接口授权（operation）独立命名空间。前端隐藏只是体验层，服务端才是执行点。

## 3. 页面与设置呈现

| 页面组 | Platform 用户域 | Platform 管理员域 | Standalone（两载体） | CLI |
| --- | --- | --- | --- | --- |
| 工作台概览 / 笔记 | 已实现（按权限） | 已实现 | 已实现（本地作用域） | 不适用（业务等价物为 CLI 命令） |
| 平台公告 | 不呈现（管理面拆分） | 已实现（按权限点） | 不装配（导航剔除：canAccess 对带权限点页面在非平台形态返回 false） | 不适用 |
| 系统设置组（用户/角色/部门/岗位/字典/任务/菜单/日志/邮件/通知/存储/账户安全） | 不呈现 | 已实现（按权限点 + super 保留集；通知页消费后端中英文事件目录，渠道测试仅显示当前保存渠道，邮件测试位于邮件设置 / 模板） | 不呈现 | 不适用 |
| 基础设置（site） | 不呈现（管理面拆分） | 已实现（settings:read） | 不呈现（无实例设置项） | 不适用 |
| 系统更新（edition；仅相同 Catalog 指纹可自动安装） | 不呈现 | 已实现（仅 super_admin + updater 能力） | 已实现（updater 能力；web 本机 loopback / desktop 桥） | 不装配 |
| API 文档 | 不呈现 | 已实现（api_docs 能力） | 条件支持（web 开启 `api_docs` 时）；desktop 不适用 | 不适用 |
| 个人中心三页 | 已实现 | 已实现（管理员域镜像） | 不呈现（无账号） | 不适用 |
| 运行监控（概览/服务/资源/运行事件，含主机硬件图表卡片、会话趋势与事件流） | 不呈现（用户域硬排除） | 已实现（仅 super_admin；系统区域末位「运行监控」目录四页） | 已实现（业务区「运行监控」单页 + 单层 Tabs 四页签，两载体等效；不适用卡片不渲染） | 不适用 |
| 告警规则管理与告警通知 | 不呈现（用户域硬排除） | 已实现（规则管理内嵌于资源监控页底部，仅 super_admin 渲染；端点 superAdmin+monitor:read；无独立菜单；通知走既有渠道；运行事件页展示告警触发/恢复/归因转移/通知失败） | 已实现（无配置入口，内置默认规则自动启用；告警事件直接呈现在「运行事件」Tab；Web/GUI 等效） | 不适用 |
| 管理后台 SPA（admin.html） | — | 独立入口，需 identity 服务（standalone 请求 404；desktop 无此入口） | 不适用 | 不适用 |

设置呈现（`internal/settings/service.go` `applies` + `packages/web-ui/src/pages/appearance.tsx`）：

- Platform：无 appearance 定义或外观 Tab，外观仅设备级（客户端偏好，localStorage）；其余组实例级，仅管理端可写，敏感值只写不回读（仅返回 `Configured` 布尔）。
- Standalone：无实例设置项、设置页面或侧栏底部身份/形态胶囊。Web 与 desktop 等效；兼容设置接口返回空列表并拒绝写入。设备级偏好在全部图形形态一致，见 [客户端偏好](../03-runbooks/client-preferences.md)。
- 设置分组与描述是静态 UI 元数据，受双语门禁约束（`pnpm check:i18n`）。

## 4. 仪表盘与组件

机制（`packages/web-ui/src/registry.tsx`、`packages/web-ui/src/pages/overview.tsx`）：

- 仪表盘不是全角色固定页：widget 经 `DashboardWidgetRegistry.register({id, render(metadata)})` 注册，注册集合由装配入口决定——当前仅管理后台入口注册了 `activity-7d`（近 7 日活动图，仅管理员域数据）。
- widget 自身读取 bootstrap 元数据（identity_realm/roles/capabilities）决定是否渲染，返回 falsy 即不呈现；平台匿名用户不返回版本/构建信息。
- 现有 widget：`activity-7d`（管理后台入口，仅管理员域真实统计）。工作台只移除实时监控摘要条及其轮询，保留原有实例信息卡、介绍横幅、业务示例占位、快捷入口与业务 widget；监控详情仍在独立页面呈现。
- 概览页固定层（运行形态卡/连接方式卡/快捷入口）中，快捷入口按 `canAccess` 过滤；业务占位卡仅用户域显示。
- 无个人自定义机制；新增 widget 必须声明其可见上下文（形态 + 身份域 + 能力/权限条件），并同步 [功能适用性清单](feature-inventory.md)。

## 5. CLI 呈现

- 命令树即信息架构：`unicore version`、`unicore execute`（`internal/adapter/cli/command.go`）。新增命令遵循 [add-cli-command](../../.agents/skills/add-cli-command/SKILL.md)：stdin/文件输入、结构化输出、退出码表达失败，不引入 UI/HTTP/持久化依赖。
- CLI 不适用菜单、页面、仪表盘、设置页规则；其「呈现」规范仅为：命令名与帮助文本中英文一致、输出机器可读（结构化优先于散文）。

## 6. 直接访问与越权行为

服务端行为矩阵（前端隐藏不构成权限控制）：

| 场景 | 行为 | 证据 |
| --- | --- | --- |
| 未安装访问任意路径 | 303 → `/install`；API 返回 409 INSTALL_REQUIRED | `internal/adapter/http/router.go`、`policy.go` |
| 已注册路由未声明契约策略 | 500 ROUTE_POLICY_UNDECLARED（fail-closed） | `internal/adapter/http/policy.go` |
| Platform 匿名访问受保护 API | 401；已登录无权限 403 | `internal/platform/security.go`、`policy.go` |
| 非 Platform 形态访问平台/管理 API（含全部 /admin/*、/auth/*） | 404「此运行形态不提供平台接口」 | `policy.go` resolveSession、`router.go` admin 前缀 |
| Standalone 访问业务文件/存储管理 API | `/notes/files*` 本地业务可用；`/files` 通用管理与 `/admin/storage*` 404 | `internal/adapter/http/storage.go` |
| Standalone 本地设置/更新 | settings：sameOrigin 内放行（actor=local）；updates：仅 loopback（见 [决策 D3](pending-decisions.md)） | `internal/adapter/http/web.go`、`updates.go` |
| 维护模式（非管理员域） | 503 维护页/维护响应 | `internal/adapter/http/router.go`、前端 App.tsx |
| 前端页面无权/不适用 | 独立 403 页或 404，不泄露存在性 | `packages/web-ui/src/App.tsx`、`routes.ts` |

## 7. 形态间一致性原则

1. Standalone 两载体：同一功能的页面集合、菜单规则、设置语义、更新与备份语义必须一致；差异仅允许来自 [形态规范第 5 节](product-forms.md#5-载体层允许的差异) 清单。
2. 新增页面/菜单/仪表盘组件时，先在 [功能分类模板](feature-proposal-template.md) 声明各上下文的呈现，再实现；完成后同步本文第 3、4 节表格。
3. 任何「前端不显示但后端可达」的状态都必须能映射到第 6 节行为矩阵中的一行；映射不到的视为越权缺陷。

核心实验室与文件管理测试页面不注册路由、菜单或首页快捷入口；旧地址显示不存在。业务文件服务与统一上传组件作为基础设施保留，使用已启用的全局默认存储。

Standalone 只呈现本形态已装配的功能：不显示平台管理占位、权限提示、跨形态技术图示或“不适用”卡片；直接访问未提供的页面显示 404，不引导联系管理员。监控事件说明仅介绍本机实际事件源。所有工作区页签复用共享 Tabs，采用边框分段栏、强调色选中态、单行溢出滚动和 Radix 键盘操作。

Platform 的“角色权限”使用共享树，默认页面授权只补浏览 API，写按钮显式选择；高级区提供完整可委派 API 及权限点，支持无菜单的 API 角色。菜单行显示角色与“分配角色”，仅超管可见；普通菜单运营者只能布局，服务端独立拒绝角色分配。API 操作目录没有独立页面/菜单，旧持久化入口在启动时移除，后台目录接口保留。Standalone 两载体及 CLI 均不呈现/装配上述治理能力。见 [角色需求](feature-roles.md) 与 [ADR-0040](../adr/ADR-0040-explicit-role-grants.md)。

## 客户端与个人 API 凭证

Platform 两工作台的个人安全页提供 PAT 的创建、API 范围选择、一次性显示、元数据和撤销；不新增导航目录。原生客户端使用客户端 Token API，不在浏览器保存 JWT。Standalone 两载体与 CLI 不装配令牌 UI 或接口。详见 [API 认证](../product/api-authentication.md)。

## 笔记附件与安装连接

Platform 和 Standalone 的笔记编辑弹窗复用 FileUploadDialog；上传先加入草稿，保存后关联，最多五个。Platform 上传复用 notes:create/update 及 notes* helper API 显式授权，不要求 files:*；头像使用本人会话的 avatar* API。Standalone Web 使用本地业务 API，桌面经原生桥传片及系统保存对话框下载；均校验本地 ready 归属，无云管理页面。

安装连接属于 Web 实例安装面，Platform/Standalone Web 都提供 TLS 关闭、仅加密、证书及主机名校验三种模式；桌面自动 SQLite，CLI 不装配。tls_verify 只改变连接校验，不新增实例设置、业务权限或数据库表。

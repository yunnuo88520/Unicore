<!-- Author: yunnuo <ymz@ebox.vip> -->
# 功能呈现与访问规范

本文定义功能在不同产品形态与用户上下文中的呈现规则：谁看到什么菜单、页面、设置与仪表盘组件，直接访问路由或 API 时服务端如何裁决，以及形态间一致性要求。形态定义与能力矩阵见 [产品形态与能力边界规范](product-forms.md)，功能盘点见 [功能适用性清单](feature-inventory.md)。

## 1. 访问主体上下文

| 上下文 | 形态 | 主体语义 | 会话/凭据 |
| --- | --- | --- | --- |
| Platform 用户域 | Platform | 统一账号（`unicore_users`），业务 + 可叠加管理权限，多角色 | `unicore_session` Cookie，user realm |
| Platform 管理员域 | Platform | 管理后台运营者（super_admin 或受限管理员角色） | 共享 `unicore_session` Cookie，administrator 工作台（由 `/api/v1/admin/` 路径前缀选择，不改变账号） |
| Standalone 本地使用者 | Standalone | 无账号主体：本机可达即可用的隐式使用者（`scope="local"`、`actor="local"`） | 无会话；web 受 loopback 边界（Host 与对端本机回环）约束，desktop 无 HTTP 面 |
| CLI 调用者 | CLI | 命令行调用共享 Core 的进程内执行者 | 无 |

规则：

- 单用户 ≠ 超级管理员：Standalone 不继承 Platform 超管能力集；它的能力边界是「本机单机业务 + 本地外观 + 本机更新」，不是「平台全部管理功能去掉了登录」。
- Platform 前端凭 `profile` 与 `identity_realm`（bootstrap 元数据）区分上下文；`capabilities.authentication=false` 时登录/注册流整体不出现（`packages/web-ui/src/session.tsx`、`packages/web-ui/src/App.tsx`）。

公开产品首页 `/home` 仅 Platform 装配，`site.home_enabled` 默认开启。访客访问根路径进入首页，已登录账号的根路径保持工作空间，但仍可访问 `/home`；两工作台的侧栏及顶栏账号菜单均不提供“产品首页”入口。首页按实际会话和公开注册策略显示登录、进入工作空间或注册链接，不展示模拟运行数据。关闭后访客回到登录流、已登录访问 `/home` 返回工作空间。

## 2. 导航与菜单

导航事实源是一棵共享导航树，双端同构镜像：

- 后端种子与持久化：`internal/platform/navigation.go`（`DefaultNavigation`，业务/系统两区域 + 超级管理员/系统设置/运行监控目录；个人中心不留导航，由账号菜单的设置弹窗承载，启动自愈清理存量树中的个人中心区域）、`internal/adapter/storage/platformsql/navigation.go`（CAS 版本持久化，reset 仅 super_admin）。
- 前端镜像与默认树：`packages/web-ui/src/navigation.ts`（`defaultNavigation` 与后端种子逐条对应）。

呈现规则：

1. Platform：服务端投影。bootstrap 按 surface（user/administrator）经 `platform.NavigationFor` 投影导航树，非 super_admin 逐节点校验 `menu_ids`；动作节点按 `action_ids` + 权限点校验。前端 `buildNavigation` 仅在 web-platform 采用服务端树。
2. Standalone：客户端本地构建。`defaultNavigation` 按 profile 过滤：剔除 personal/administration 组与 system 组（仅保留 `edition`），不提供外观设置页面。两载体使用同一份本地默认树逻辑。
3. CLI：不适用图形导航规则；呈现即命令树（`unicore --help`）与结构化输出。
4. 页面可见性（`packages/web-ui/src/routes.ts` `canAccess`）在权限点之外有形态硬规则：Platform 用户域永不呈现 `site/api-docs/announcements`（管理面拆分，[ADR-0016](../adr/ADR-0016-separate-client-admin-surfaces.md)）；`api-docs` 需 `api_docs` 能力且仅 Web 形态（desktop 无契约端点）；`edition`（系统更新）在 Platform 仅 super_admin，其他形态看 updater 能力。
5. 菜单、页面、功能不是同一概念：菜单授权（menu_ids）只决定入口，不授予 API；按钮动作（action）与接口授权（operation）独立命名空间。前端隐藏只是体验层，服务端才是执行点。

管理员工作台和「系统管理」用于框架与实例治理。派生业务的使用与管理页面默认放在用户工作台的业务区，按业务权限控制谁能操作。只有需求明确指定的业务页面才可在管理员工作台呈现，归属仍为业务区。内置布局是种子，Platform 可在菜单管理中新增业务一级目录并组织已注册页面。派生应用按 [业务导航规划](../product/development.md#业务导航规划) 决定工作台、区域和权限。

## 3. 页面与设置呈现

| 页面组 | Platform 用户域 | Platform 管理员域 | Standalone（两载体） | CLI |
| --- | --- | --- | --- | --- |
| 工作台概览 / 笔记 | 概览；「我的笔记」只列本人 | 概览；「笔记管理」与用户列表共用工具栏及分页，关键词、状态即时组合筛选，列设置控制作者（昵称优先）、状态及更新时间的显隐；按授权预览正文、编辑标题和正文、修改状态或软删除，不开放附件 | 概览与本地笔记，无管理页 | 不装配笔记 |
| 业务控制台 | 已获权限时从账号菜单进入 `/workspaces/<id>`，拥有独立页面和导航 | 系统治理保留原后台，角色管理分配业务权限 | 不装配 | 不装配 |
| 平台公告 | 不呈现（管理面拆分） | 已实现（按权限点） | 不装配（导航剔除：canAccess 对带权限点页面在非平台形态返回 false） | 不适用 |
| 系统设置组（用户/角色/部门/岗位/字典/任务/菜单/日志/邮件/通知/存储/账户安全） | 不呈现 | 已实现（按权限点 + super 保留集；通知页消费后端中英文事件目录，渠道测试仅显示当前保存渠道，邮件测试位于邮件设置 / 模板） | 不呈现 | 不适用 |
| 顶部通知收件箱 | 已实现（公告与账号通知） | 已实现（仅账号通知） | 已实现（Web / 原生桥、本地通知；无公告） | 不装配 |
| 基础设置（site 与模块业务分组） | 不呈现（管理面拆分） | 已实现（settings:read） | 不呈现（无实例设置项） | 不适用 |
| 系统更新（edition；仅相同 Catalog 指纹可安装，默认不要求 OS 证书） | 仅版本号，无检查操作 | 条件支持（编译期 updater + super_admin；后台每 6 小时检查，安装须确认） | 条件支持（同一编译开关与检查调度；web 本机 loopback / desktop 桥） | 不装配 |
| API 文档 | 不呈现 | 已实现（api_docs 能力） | 条件支持（web 开启 `api_docs` 时）；desktop 不适用 | 不适用 |
| 个人中心（账号菜单弹窗：个人资料/安全设置/登录会话/访问令牌四分区） | 已实现（侧栏账号卡片与顶栏头像菜单打开；强制 2FA 时钉住安全分区） | 已实现（管理员域镜像） | 不呈现（无账号） | 不适用 |
| 运行监控（概览/服务/资源/运行事件，含主机硬件图表卡片、会话趋势与事件流） | 不呈现（用户域硬排除） | 已实现（仅 super_admin；系统区域末位「运行监控」目录四页） | 已实现（业务区「运行监控」单页 + 单层 Tabs 四页签，两载体等效；不适用卡片不渲染） | 不适用 |
| 告警规则管理与告警通知 | 不呈现（用户域硬排除） | 已实现（规则管理内嵌于资源监控页底部，仅 super_admin 渲染；端点 superAdmin+monitor:read；无独立菜单；通知走既有渠道；运行事件页展示告警触发/恢复/归因转移/通知失败） | 已实现（无配置入口，内置默认规则自动启用；告警事件直接呈现在「运行事件」Tab；Web/GUI 等效） | 不适用 |
| AI 管理（接入配置/工具目录/调用记录/OAuth 接入） | 不呈现（用户域硬排除） | 已实现（仅 super_admin；系统区域「AI 管理」目录四页，位于运行监控之后；`mcp:read` / `mcp:logs:read` / `mcp:clients:read`） | 不呈现（不装配） | 不适用 |
| OAuth 同意页（/authorize） | 已实现（无工作台框架的独立确认页：应用名、scope 双语说明、单角色选择、同意/拒绝；未登录由登录墙原位接管；OAuth 关闭或请求非法时显示无效状态） | 不呈现（不装配） | 不装配 | 不适用 |
| 个人授权应用（个人中心分区） | 已实现（「已授权应用」分区：本人 OAuth 授权列表、绑定角色、scope、最近使用与自撤销；仅平台形态出现，OAuth 关闭时隐藏） | 不呈现（不装配） | 不呈现（不装配） | 不适用 |
| 个人令牌 MCP 接入提示 | 已实现（访问令牌分区顶部提示：接入地址复制与最小权限角色引导，服务启用且本人视图时显示） | 不呈现（不装配） | 不呈现（不装配） | 不适用 |
| 管理后台 SPA（admin.html） | — | 独立入口，需 identity 服务（standalone 请求 404；desktop 无此入口） | 不适用 | 不适用 |

关闭 `FEATURE_UPDATER` 后保留共享版本号，不显示系统更新菜单、日志页或任何检查/安装操作，不请求更新 API；没有运行期更新启停设置。单独开启 `FEATURE_LICENSE` 时，原 edition 预留页以「应用授权」呈现，不恢复更新按钮。

设置呈现（`internal/settings/service.go` `applies` + `packages/web-ui/src/pages/appearance.tsx`）：

- Platform：无 appearance 定义或外观 Tab，外观仅设备级（客户端偏好，localStorage）；其余组实例级，仅管理端可写，敏感值只写不回读（仅返回 `Configured` 布尔）。
- Standalone：无实例设置项、设置页面或侧栏底部身份/形态胶囊。Web 与 desktop 等效；兼容设置接口返回空列表并拒绝写入。设备级偏好在全部图形形态一致，见 [客户端偏好](../03-runbooks/client-preferences.md)。
- 内置设置分组与描述受双语门禁约束（`pnpm check:i18n`）；模块业务分组经 `module.Module.Settings` 注册，API 返回分组/字段/选项双语元数据，基础设置自动呈现并只保存当前组。注册阶段拒绝缺少英文或重复定义，不增加新作用域或绕过既有设置权限。

## 4. 仪表盘与组件

机制（`packages/web-ui/src/registry.tsx`、`packages/web-ui/src/pages/overview.tsx`）：

- 仪表盘不是全角色固定页：widget 经 `DashboardWidgetRegistry.register({id, render(metadata)})` 注册，注册集合由装配入口决定——当前仅管理后台入口注册了 `activity-7d`（近 7 日活动图，仅管理员域数据）。
- widget 自身读取 bootstrap 元数据（identity_realm/roles/capabilities）决定是否渲染，返回 falsy 即不呈现；平台匿名用户不返回版本/构建信息。
- 现有 widget：`activity-7d`（管理后台入口，仅管理员域真实统计）。工作台只移除实时监控摘要条及其轮询，保留原有实例信息卡、介绍横幅、业务示例占位、快捷入口与业务 widget；监控详情仍在独立页面呈现。
- Platform 两域与 Standalone 两载体的顶栏和正文共用连续背景，所有布局均不设顶栏底部分界线。工作台卡片用柔和表面和留白区分，侧栏统一使用圆角面板、实色选中项和可筛选授权菜单的搜索框；语言、明暗切换和主题设置仍在顶栏。内容与可见性仍按上述规则，不增加背景或材质设置。
- 概览页固定层（运行形态卡/连接方式卡/快捷入口）中，快捷入口按 `canAccess` 过滤；业务占位卡仅用户域显示。
- 无个人自定义机制；新增 widget 必须声明其可见上下文（形态 + 身份域 + 能力/权限条件），并同步 [功能适用性清单](feature-inventory.md)。

### 共享设计系统的呈现边界

Platform 用户域、管理员域与 Standalone 两载体共享 `@unicore/ui` 原语及 controls/charts/calendar/composites/data-grid 子入口；CLI 无 UI，不适用。它们是页面内部可组合能力，不新增业务菜单、页面权限、实例设置或 widget。实际操作继续受既有主体、形态、能力及服务端授权约束：认证卡片不向 Standalone 引入账号，通知中心不装配投递服务，Agent/Composer/检索与会议时段组件不代表模型、搜索或预约后端可用。

业务页继续只由 WorkspaceLayout 提供导航与内容占位，固定 LTR 并忽略旧方向偏好；Sidebar 组合件不得创建第二套工作区壳层。顶栏面包屑/标题表示导航上下文，正文仍以 PageHeader 开始（默认 h1，分节 h2/h3），标题与操作按双语和权限规则提供。开发 `/ui-preview` 的 family 登记用于组件浏览，不作为业务入口或权限豁免；登记范围不等于视觉验收。组件数据协议与已知限制见 [UI 组件参考](../product/ui-components.md)。

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
| Standalone 本地设置/更新 | settings 与 updates 均仅 loopback（Host 与对端本机回环，见 [决策 D3](pending-decisions.md)） | `internal/adapter/http/web.go`、`updates.go` |
| 维护模式（非管理员域） | 503 维护页/维护响应 | `internal/adapter/http/router.go`、前端 App.tsx |
| 前端页面无权/不适用 | 独立 403 页或 404，不泄露存在性 | `packages/web-ui/src/App.tsx`、`routes.ts` |

令牌管理创建表单仅在输入用户名或邮箱后查询候选用户；空搜索在前后端均为空，选择用户后再读取其角色，切换用户清空角色选择。

## 7. 形态间一致性原则

1. Standalone 两载体：同一功能的页面集合、菜单规则、设置语义、更新与备份语义必须一致；差异仅允许来自 [形态规范第 5 节](product-forms.md#5-载体层允许的差异) 清单。
2. 新增页面/菜单/仪表盘组件时，先在 [功能分类模板](feature-proposal-template.md) 声明各上下文的呈现，再实现；完成后同步本文第 3、4 节表格。
3. 任何「前端不显示但后端可达」的状态都必须能映射到第 6 节行为矩阵中的一行；映射不到的视为越权缺陷。

核心实验室与文件管理测试页面不注册路由、菜单或首页快捷入口；旧地址显示不存在。业务文件服务与统一上传组件作为基础设施保留，使用已启用的全局默认存储。

Standalone 只呈现本形态已装配的功能：不显示平台管理占位、权限提示、跨形态技术图示或“不适用”卡片；直接访问未提供的页面显示 404，不引导联系管理员。监控事件说明仅介绍本机实际事件源。所有工作区页签复用共享 Tabs，采用边框分段栏、强调色选中态、单行溢出滚动和 Radix 键盘操作。

Standalone 的本地业务附件与平台存储治理分离：文件服务可用不代表提供存储位置管理。两载体的监控快照均将平台存储管理标为不适用，不渲染对象存储位置或探活卡片；笔记附件上传、下载和清理保持可用。

Platform 的“角色权限”使用共享树，默认页面授权只补浏览 API，写按钮显式选择；高级区提供完整可委派 API 及权限点，支持无菜单的 API 角色。菜单行显示显式分配角色与“分配角色”，仅超管可见；标签不代表最终可达，super_admin 的默认访问同样受 surface、区域/节点及祖先隐藏禁用约束。弹窗固定勾选且禁用 super_admin 行，加载中、加载失败与未分配分别呈现，失败不允许当空集合覆盖。普通菜单运营者只能布局，服务端独立拒绝角色分配。API 操作目录没有独立页面/菜单，旧持久化入口在启动时移除，后台目录接口保留。Standalone 两载体及 CLI 均不呈现/装配上述治理能力。见 [角色需求](feature-roles.md) 与 [ADR-0040](../adr/ADR-0040-explicit-role-grants.md)。

角色编辑读取并提交 Role.version，缺失版本不得更新，409 后呈现冲突并要求显式重读、复核，不自动重试覆盖；菜单节点补丁保留导航 version + expected_role_ids，实际改变角色时递增角色版本。内置 user 的数据范围固定 self 且只读，提示复制为自定义角色后可调整。用户管理的改密与登录邮箱编辑按 users:credentials:write 及完整目标资格呈现，实际邮箱修改另需 users:update；规范化未变邮箱不触发新增凭据门槛。拥有管理能力的目标仅超管可改凭据，管理端凭据写禁止 PAT，旧角色不自动获得新权限。前端资格判断只是体验，事务重查与范围仍由服务端执行。见 [ADR-0046](../adr/ADR-0046-credential-delegation-role-concurrency.md)。

上述治理 UI 仍仅 Platform 管理端提供。Standalone 两载体虽按 Catalog 同步执行 platform 迁移，不新增身份、管理 API、治理占位或入口；CLI 无数据库和 UI。

## 客户端与个人 API 凭证

Platform 两工作台在“账号菜单 → 个人中心 → 访问令牌”提供单角色 PAT 的创建、固定期限/永久、备注、一次性秘密、元数据、续期和作废；“超级管理员 → 访问令牌管理”仅超级管理员可见，可搜索全部用户的令牌并代用户签发、续期和作废。原生客户端使用客户端 Token API，不在浏览器保存 JWT。Standalone 两载体与 CLI 不装配令牌 UI 或接口。详见 [API 认证](../product/api-authentication.md)。

## 笔记附件与安装连接

笔记是默认开启的可裁剪业务样板（`FEATURE_NOTES=false`）。关闭时不提供笔记菜单、页面路由、动作和附件入口；服务端 capabilities.features.notes 同时控制已持久化菜单的呈现。系统设置及其他现有基础功能不因笔记开关被裁剪。

Platform 和 Standalone 的笔记编辑弹窗复用 FileUploadDialog；上传先加入草稿，保存后关联，最多五个。Platform 上传复用 notes:create/update 及 notes* helper API 显式授权，不要求 files:*；头像使用本人会话的 avatar* API。Standalone Web 使用本地业务 API，桌面经原生桥传片及系统保存对话框下载；均校验本地 ready 归属，无云管理页面。

安装连接属于 Web 实例安装面，Platform/Standalone Web 都提供 TLS 关闭、仅加密、证书及主机名校验三种模式；桌面自动 SQLite，CLI 不装配。tls_verify 只改变连接校验，不新增实例设置、业务权限或数据库表。

共享表单遵循[表单交互规范](../product/form-interaction.md)。Platform 用户/管理员与 Standalone Web/Desktop 使用同一套原语；候选搜索为锚定浮层，打开后不改变后续字段位置；新密码提供可见性切换与强度提示，邮箱/短信/动态口令使用六格输入，图形验证码使用普通输入框配刷新图片。认证页沿用共享输入框底色，保证明暗主题下的静止输入区域可辨认。地区、出生日期等示例控件不自动注册产品字段、菜单或持久化。

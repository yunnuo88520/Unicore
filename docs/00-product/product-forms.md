<!-- Author: yunnuo <ymz@ebox.vip> -->
# 产品形态与能力边界规范

本文是产品形态与功能边界的权威规范：定义三种产品形态、形态与运行载体的关系、各形态基础能力矩阵、状态语义和不可违反的产品边界。新增或修改任何功能前先读本文，按 [功能分类模板](feature-proposal-template.md) 声明适用形态，再按 [功能适用性清单](feature-inventory.md) 与 [功能呈现与访问规范](feature-presentation.md) 对齐实现。产品目标仍以 [PRD](PRD.md) 为准，验证状态以 [支持范围](../support.md) 为准；本文与 PRD 冲突时以 PRD 与后续 ADR 为准。

## 1. 三种产品形态

Unicore 的产品形态只有三种。`framework.manifest.json` 中的四个 profile 是**装配 profile**，不是产品形态：

| 产品形态 | 语义 | 装配 profile | 运行载体 | 入口 | 发行物 |
| --- | --- | --- | --- | --- | --- |
| Platform（平台版） | 多用户在线平台：账号、权限、平台治理、集中运维 | `web-platform` | Web（浏览器） | `cmd/server` | web-platform 发行包 / Docker 镜像 |
| Standalone（单机版） | 单用户本地产品：本地数据、本地配置、完整单机业务 | `web-standalone`、`desktop` | Web（本机/局域网 HTTP）与 GUI（Wails 桌面壳） | `cmd/server`、`cmd/desktop` | web-standalone 发行包 / 桌面安装包 |
| CLI（命令行形态） | 命令行调用共享 Core：无界面、无自身持久化 | `cli` | 终端 | `cmd/cli` | cli 发行包 |

关键结论（源码事实）：

- Platform 与 Standalone(Web) 共用同一 `cmd/server` 源码，发行时以 ldflags 注入默认 profile（`scripts/release.mjs`），安装后 profile 持久化于 `installation.json` 且不可变（`internal/install/manager.go`）。
- Standalone 的两个载体必须保持产品等效：同一套页面（`packages/web-ui`）、同一套业务语义、同一份数据 schema（`migrations/catalog.json` 中 web-standalone 与 desktop 均为 core + module.notes）。允许的差异仅限 [第 5 节](#5-载体层允许的差异) 清单。
- CLI 直接调用 `internal/bootstrap.Core()`（纯内存，无 HTTP/Wails/SQL），见 `internal/adapter/cli/command.go`。
- Web 发行包内 `unicore` 可执行文件附带的服务运维子命令（backup/manage/service/admin 等，`cmd/server/commands.go` → `internal/webmanage`、`internal/maintenance`）属于 **Web 形态的实例运维面**，不是 CLI 产品形态的能力；独立维护工具 `unicore-ops`（`cmd/ops`）是源码构建用的等价离线备份工具，随 project-template 分发，不进用户发行包。CLI 形态与这些运维命令是两个概念。

### 1.1 术语

| 术语 | 定义 |
| --- | --- |
| 产品形态 | 面向使用者的产品种类，只有 Platform / Standalone / CLI 三种（第 1 节） |
| 运行载体 | 同一形态的具体交付方式：Standalone 的载体是 Web（HTTP 服务）与 GUI（Wails 桌面壳） |
| 装配 profile | `framework.manifest.json` 的四个装配档位（web-platform / web-standalone / desktop / cli），决定组件装配与存储；profile 是装配概念，不等于产品形态 |
| 发行包 | release 产物（web-platform / web-standalone / cli 归档、桌面安装包）；Web 包以 ldflags 注入默认 profile，部署期可覆盖属有意设计（[D15 已裁决](pending-decisions.md)） |
| 实例 | 一次安装形成的数据目录 + 数据库 + 配置整体；安装后 profile 固化（`installation.json`） |
| 实例运维面 | Web 发行包内 `unicore` 子命令与 `unicore-ops` 工具的总称；操作实例但不属于任何产品形态 |
| 身份域（surface / realm） | Platform 的两个前端工作台与 API 域：user（工作区）与 administrator（管理后台），由 `/api/v1/admin/` 路径前缀选择，无回退查找 |
| 本地作用域（local scope） | 非平台形态无账号主体时的数据归属方式（`scope="local"`、`actor="local"`） |

## 2. 能力状态语义

矩阵与清单统一使用以下标记：

| 标记 | 含义 |
| --- | --- |
| 已实现 | 源码证据完整，该形态默认可用 |
| 条件支持 | 需要构建标签、配置或环境条件（如 `updater` 构建标签、`api_docs` 配置） |
| 受限 | 可用，但作用域或入口受限（如仅 loopback、仅本机） |
| 不装配 | 该形态明确不装配此能力（装配点省略），属于设计现状而非缺陷 |
| 不适用 | 能力概念对该形态无意义（如 CLI 的图形界面） |
| 不呈现 | 页面、菜单或入口存在于该形态的代码路径中，但对当前访问主体被隐藏（前端体验层）；服务端授权与形态裁决独立生效，规则见 [功能呈现与访问规范](feature-presentation.md) |
| 待决策 | 目标归属未定，记录在 [待维护者决策清单](pending-decisions.md) |

「不装配」必须能指出装配省略点（如 `internal/install/manager.go` 的 `attach` 仅在 web-platform 创建 identity/files/branding/mailer）；「不适用」不需要实现动作。两者都不得被新的实现悄悄改写——改变形态归属属于产品决策，须先更新本文并获得维护者确认。

相邻标记的区别：**不装配** = 功能在该形态整体不存在，服务端同样拒绝（装配省略 + 404）；**不适用** = 概念对该形态无意义，无需实现动作；**不呈现** = 功能在该形态存在、服务端可用或已裁决，仅前端对某主体隐藏；**无权限** = 形态与功能都可用，当前主体缺少授权点（服务端 401/403）。呈现层标记只描述前端可见性，永远不构成权限边界。

## 3. 形态能力矩阵

| 能力维度 | Platform | Standalone | CLI |
| --- | --- | --- | --- |
| 身份认证与用户体系 | 已实现：统一账号、双域会话、MFA、OIDC、人机验证 | 不装配：无账号主体，`capabilities.authentication=false` | 不装配 |
| 权限控制 | 已实现：权限点 + 菜单/动作 + operation 三层授权，super_admin 保留集，部门数据范围 | 不装配角色模型；服务端仍 fail-closed，本地可达即边界 | 不适用 |
| 数据持久化 | 已实现：SQLite/PostgreSQL/MySQL，core+platform+module.notes 命名空间 | 已实现：web 三方言、desktop 仅 SQLite；core+module.notes | 不装配：无数据库 |
| 配置 | 已实现：全局设置（仅管理端）+ 设备偏好 | 设备偏好；无实例级设置页面或可写设置项 | 不适用（仅进程日志环境变量） |
| UI / 菜单 / 页面 | 已实现：用户工作区 + 管理后台双 SPA，服务端投影导航 | 已实现：单工作区，客户端默认导航，两载体同一套页面 | 不适用 |
| API 适配 | 已实现：HTTP `/api/v1` 全量 + admin 镜像 | 受限：HTTP 仅本地面（bootstrap/settings/updates/notes/core），admin API 一律 404；desktop 走 Wails 桥 | 已实现：进程内 Cobra 命令 |
| 生命周期 | 已实现：lifecycle.Stack + 优雅排水 + 可选 loopback 指标 | 已实现：web 同左；desktop 用 Wails 回调，无指标面 | 不适用：无组件栈 |
| 后台任务与调度 | 已实现：平台调度器 + 任务管理 API | 受限：web 用 localCron（日志保留等），desktop 无 | 不装配 |
| 文件与对象存储 | 已实现：local/minio/s3/oss/cos、直传、分片续传、签名访问 | 不装配（见 [决策 D1](pending-decisions.md)） | 不装配 |
| 更新与分发 | 已实现：管理端签名更新；tar 可更新，Docker 仅检查 | 已实现：web 本机 loopback 更新；desktop 原生更新 | 不装配 |
| 审计 | 已实现：写入 + 元数据 + 查询/导出 | 受限：仅写入 core 审计表，无查询面 | 不装配 |
| 邮件 / 通知 / 公告 / 站内信 | 已实现 | 不装配 | 不装配 |
| 备份恢复 | 已实现：离线加密备份（含云对象） | 已实现：web/桌面快照分支 | 不装配（无数据可备份） |
| 安装 | 已实现：安装向导 + 管理员种子 + profile 固化 | 已实现：web 向导（无账号步骤）；desktop 自动初始化 | 不装配 |
| 模块装配 | 已实现：模块全能力（权限点/导航/迁移/调度/桥贡献） | 已实现：本地作用域 + desktop 桥贡献 | 不装配：模块特性结构性关闭（`internal/runtime/profile.go` 按 `profile != CLI` 装配，与模块 edition 无关） |
| 运行监控 / 可观测性 | 已实现（P0/P1）：super_admin 专属「运行监控」目录四页（概览/服务/资源/运行事件）+ 宿主机硬件视图；告警已实现（T4 方案二：完整告警——规则端点仅 super_admin、后台检测、notifycontent 通知）；外部 `/metrics` 保持 loopback 可选 | 已实现（P0/P1）：两载体等效的本机「运行监控」单页四 Tab（web 经同源只读接口、desktop 经桥；仅呈现实际适用指标，无工作台监控卡片）；告警已实现（T4 方案二：内置默认规则本地检测、写入运行事件、不发送外部通知，两载体等效） | 不装配（运行监控中心与告警为规划外；实例离线诊断属 Web 包运维面） |

证据锚点：装配省略点 `internal/install/manager.go`（attach）；策略与形态隔离 `internal/adapter/http/policy.go`、`internal/adapter/http/router.go`；能力声明 `internal/runtime/profile.go`；设置分组过滤 `internal/settings/service.go`（`applies`）；迁移目录 `migrations/catalog.json`；桌面装配 `internal/bootstrap/local/local.go`；CLI 组合根 `internal/bootstrap/core.go`；前端能力判定 `packages/web-ui/src/routes.ts`、`packages/web-ui/src/permissions.ts`。

## 4. 不可违反的产品边界

标注说明：**[源码强制]** 违反即编译失败或运行时拒绝（`scripts/check-boundaries`、策略中间件或装配缺失兜底）；**[产品约束]** 维护者确认的产品意图，当前实现与其一致，改变它属于产品决策，须先修订本文并获维护者确认；**[维护约定]** 文档与流程纪律，靠评审与检查维持。

1. [源码强制] CLI 不引入 HTTP server、Wails、SQL 驱动和平台身份模块；CLI 不拥有持久化状态。Web 包运维子命令与 ops 工具不属于 CLI 形态（见第 1 节）。证据：`internal/adapter/cli/command.go`、`internal/bootstrap/core.go`、`scripts/check-boundaries`。
2. [产品约束] Standalone 是单用户产品，但**不等于 Platform 超级管理员**：不得因没有身份体系就默认继承平台管理能力。平台治理面（internal/platform、RBAC 表、管理端 API 与管理后台 SPA）不得被 Standalone 装配或暴露。实现现状与之一致（装配省略 + 非 platform 一律 404），改变归属须先裁决。
3. [产品约束] Standalone 两个载体的功能集、业务语义、菜单与页面呈现规则必须一致；差异只允许来自第 5 节清单，且新增差异必须先在本文明示。
4. [源码强制 + 维护约定] 契约与形态隔离分四层执行，新增接口时各层都要落实：
   - **契约声明**（维护约定）：operation 必须带 `x-unicore`（access/permissions/superAdmin 等）。
   - **策略中间件**（源码强制）：整体缺失 `x-unicore` 的已注册路由直接 500（ROUTE_POLICY_UNDECLARED）；access/permissions/superAdmin 由中间件执行，且权限点/operation/superAdmin 校验仅在 web-platform 生效（`internal/adapter/http/policy.go`）。
   - **装配省略**（源码强制）：identity/files/branding/mailer 仅在 web-platform 装配（`internal/install/manager.go` attach），非平台形态相应 API 404。
   - **handler 自查**（维护约定）：**`x-unicore.profiles` 声明不被中间件执行**——形态隔离的最后一环是各 handler 的 profile 自查（如 `notes.go`、`announcements.go`、`updates.go`）。新增非全形态接口必须写 handler 自查，不得只声明 profiles 字段。
   前端隐藏菜单或按钮不构成权限控制。Standalone 页面只呈现已装配的本机能力；平台专属功能与载体不具备的能力不显示占位、标签或权限引导，直达地址按不存在处理。
5. [源码强制] 菜单授权不授予 API：menu_ids、action_ids、operation_ids 三个命名空间相互独立，服务端授权是唯一执行点（权限派生明确排除菜单行，`internal/adapter/storage/platformsql/repository.go`）。
6. [源码强制] profile 在安装后不可变（`internal/install/manager.go`）；不得提供运行期形态切换。发行包默认 profile 的部署期覆盖属有意设计（[D15 已裁决](pending-decisions.md)）。
7. [源码强制] 业务模块不得在 desktop/CLI 装配路径引入平台模块；依赖向内规则见 [后端规范](../02-standards/backend.md)。
8. [维护约定] 矩阵与清单的状态以源码为准：不得把未实现写成已实现，不得用文档表述替代装配证据。

## 5. 载体层允许的差异

以下差异源于载体本身（HTTP 服务 vs 桌面壳），**不构成产品功能差异**，无需逐功能再声明：

| 维度 | Standalone(Web) | Standalone(GUI) |
| --- | --- | --- |
| 传输通道 | HTTP `/api/v1`（本机/局域网） | Wails 原生桥，无 HTTP 服务 |
| 前端路由历史 | Browser history | Hash history |
| 首次初始化 | 安装向导（无账号步骤），可选数据库方言 | 自动初始化 SQLite + flock 单实例锁 |
| 进程配置面 | `config.LoadWeb`（listen/profile/data-dir 等） | 仅日志配置 |
| 文件日志 | 环境变量 opt-in | 默认开启 |
| 更新部署 | `tar` 部署，`/updates` 仅 loopback | `native` 部署，桥接触发，平台签名要求见更新链 |
| 管理后台资产 | 包内含 admin 资产但对 standalone 请求 404 | 不含 admin 入口 |
| API 文档页 | 条件支持（`api_docs` 配置开启时可见） | 不适用（无契约 HTTP 端点；见 [决策 D2](pending-decisions.md)） |
| 进程监控 | 可选 loopback `/metrics` | 无 |

除上述清单外，同一功能在两个载体上呈现或行为不一致的，按实现缺失处理：或修复对齐，或作为 [待决策](pending-decisions.md) 提交维护者裁决。

## 6. 维护要求

事实权威归属（同一事实在多篇文档出现时以权威处为准，其余只做引用摘要，不得各自演化）：

| 事实类型 | 权威位置 |
| --- | --- |
| 形态定义、能力存在性、载体差异、状态语义、术语 | 本文第 1–3 节、第 5 节 |
| 功能单元明细（API、持久化、门控、证据） | [功能适用性清单](feature-inventory.md) |
| 各访问主体的呈现与访问行为 | [功能呈现与访问规范](feature-presentation.md) |
| 未决边界与文档漂移记录 | [待维护者决策清单](pending-decisions.md) |

变更传播（改动后必须检查的下游文档）：

| 变更类型 | 必须同步 |
| --- | --- |
| 新增/修改功能单元 | 功能适用性清单；有页面/菜单/仪表盘变化时加功能呈现与访问规范 |
| 能力装配变化（某形态开始/停止装配某能力） | 本文第 3 节矩阵 + 功能适用性清单 |
| 载体差异变化 | 本文第 5 节清单 |
| 状态语义或术语变化 | 本文第 1.1、2 节，并复查两矩阵与模板的用词 |

- 功能新增/修改后同步更新 [功能适用性清单](feature-inventory.md) 与 [功能呈现与访问规范](feature-presentation.md)；重大形态归属选择新增 ADR。
- 本文登记于 `framework.manifest.json` sources（`productForms`），由 `make docs` 纳入 AI 上下文；修改文件路径时同步登记。
- 发现实现与本文矛盾时：以源码为审计依据记录到 [待维护者决策清单](pending-decisions.md)，不得擅自修改产品行为使文档一致。

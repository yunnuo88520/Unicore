<!-- Author: yunnuo <ymz@ebox.vip> -->
# 功能适用性清单

本清单按功能领域盘点现有功能在三种产品形态（Platform / Standalone / CLI）下的实际支持情况，是产品形态矩阵的功能级细则。形态定义、状态语义与硬边界见 [产品形态与能力边界规范](product-forms.md)；呈现与访问规则见 [功能呈现与访问规范](feature-presentation.md)。功能归属变化时先更新本清单并按 [功能分类模板](feature-proposal-template.md) 声明。

标记语义（已实现/条件支持/受限/不装配/不适用/待决策）见 [形态规范第 2 节](product-forms.md#2-能力状态语义)。Standalone 列覆盖 Web 与 GUI 两个载体，载体差异以 ¹² 脚注标注，允许差异清单见 [形态规范第 5 节](product-forms.md#5-载体层允许的差异)。

## A. 身份与访问治理（Platform 专属）

装配省略点：`internal/install/manager.go` attach 仅在 web-platform 创建 identity/Accounts/OIDC/mailer；策略层对非平台形态的会话请求一律 404（`internal/adapter/http/policy.go`）。

| 功能单元 | Platform | Standalone | CLI | 持久化 | 证据 |
| --- | --- | --- | --- | --- | --- |
| 登录认证（密码/邮箱验证码/MFA/验证码） | 已实现（统一账号与共享会话） | 不装配 | 不装配 | unicore_sessions 等 | `internal/platform/service.go`、`internal/platform/security.go` |
| 注册 / 找回密码 / 邮箱验证 | 已实现，默认关闭，依赖 SMTP 测试通过 | 不装配 | 不装配 | unicore_account_tokens | `internal/platform/accounts.go` |
| OIDC 企业登录与账号绑定 | 已实现，默认关闭 | 不装配 | 不装配 | unicore_oidc_flows | `internal/platform/oidc.go`、[OIDC 需求](feature-oidc.md) |
| 用户管理（含 XLSX 导入导出） | 已实现，users:* | 不装配 | 不装配 | unicore_users | `internal/adapter/http/users.go`、`internal/adapter/http/xlsx.go` |
| 管理员账号管理 | 已实现，super_admin 保护最后管理员 | 不装配 | 不装配 | unicore_personal_accounts | `internal/platform/roles.go` |
| 角色与操作级授权（RBAC） | 已实现：服务端保留元数据 + 完整高级 API 选择器 + 显式撤销 | 不装配 | 不装配 | unicore_roles 等 | `internal/platform/roles.go`、`internal/platform/operations.go`、[角色需求](feature-roles.md)、[权限契约](../api/permissions.md) |
| 菜单与导航授权 | 已实现：共享导航树持久化 + CAS + 菜单行角色分配（仅受影响会话失效） | 不装配（导航由客户端默认树生成） | 不适用 | unicore_navigation_state | `internal/platform/navigation.go`、`packages/web-ui/src/navigation.ts` |
| 部门与数据范围 | 已实现，五值数据范围 fail-closed | 不装配 | 不装配 | unicore_departments | `internal/platform/datascope.go` |
| 岗位管理 | 已实现（组织人事岗位，非内容帖子） | 不装配 | 不装配 | unicore_posts | `internal/adapter/http/posts.go` |
| 数据字典 | 已实现（管理端 CRUD + 用户端只读） | 不装配 | 不装配 | unicore_dict_types | `internal/adapter/http/dictionaries.go` |
| 个人中心（资料/换邮箱/TOTP/会话设备） | 已实现，双域各自 19 operation | 不装配 | 不装配 | unicore_personal_accounts | `internal/platform/personal.go`、[个人中心](../03-runbooks/personal-center.md) |
| 人机验证（Turnstile/腾讯/阿里） | 已实现，设置门控 | 不装配 | 不装配 | security.human_check_* | `internal/platform/humancheck.go` |
| 登录防护（IP 封禁/会话策略/强制 2FA） | 已实现 | 不装配 | 不装配 | settings security.* | `internal/platform/login_guard.go` |

客户端 JWT / Refresh Token 与个人 API 令牌：Platform 已实现；Standalone / CLI 不装配。持久化为 platform@1 的 unicore_api_credentials、unicore_api_refresh_tokens、unicore_api_token_keys；个人中心独立令牌菜单管理单角色令牌，支持固定有效期、永久、备注、续期和作废；超级管理员管理全部令牌并可代用户签发；创建时先输入用户名或邮箱搜索，空搜索不枚举用户，选择后才加载绑定角色。客户端认证与刷新走独立 API，见 [API 认证](../product/api-authentication.md) 与 [ADR-0044](../adr/ADR-0044-role-bound-personal-tokens.md)。

## B. 通知与消息（Platform 专属）

| 功能单元 | Platform | Standalone | CLI | 持久化 | 证据 |
| --- | --- | --- | --- | --- | --- |
| SMTP 邮件投递（持久队列/重试） | 已实现 | 不装配（mail.queue 任务注册但 Mailer 为 nil 空转） | 不装配 | unicore_mail_jobs | `internal/mailer/mailer.go`、`cmd/server/main.go` |
| 邮件模板（5 用途富文本） | 已实现 | 不装配 | 不装配 | settings mail.template.* | `internal/mailcontent/template.go` |
| 事件通知（14 个内置事件，可登记业务事件；邮件/企业微信/Webhook 独立路由；全部事件通知统一受系统通知总开关控制；原子 outbox 与分区设置保存） | 已实现 | 不装配 | 不装配 | settings notifications.* | `internal/notifycontent/catalog.go`、`internal/adapter/storage/platformsql/notifications.go`、[通知细节](../03-runbooks/notifications.md) |
| 通用通知投递与收件箱 | 已实现（登记式类型门面 `internal/notify`；公告事务与后续模块共用 `unicore_inbox_messages`；无管理员群发 UI） | 不装配（第二期装配，ADR-0045） | 不装配 | unicore_inbox_messages | `internal/notify/notify.go`、`internal/adapter/http/inbox.go` |
| 实时推送（SSE） | 已实现（进程内单实例语义） | 不装配（契约仅声明 web-platform） | 不适用 | 无 | `internal/realtime/hub.go`、`internal/adapter/http/events.go` |

## C. 内容运营（Platform 专属）

| 功能单元 | Platform | Standalone | CLI | 持久化 | 证据 |
| --- | --- | --- | --- | --- | --- |
| 产品首页（`/home`） | 已实现，默认开启；访客与已登录账号均可访问，根路径按登录状态分流 | 不装配 | 不适用 | settings site.home_enabled | `packages/web-ui/src/pages/home.tsx`、`App.tsx` |
| 公告管理（草稿/定时/受众/预览/启停） | 已实现 | 不装配 | 不装配 | unicore_platform_announcements | `internal/usecase/announcements.go`、[公告手册](../03-runbooks/announcements.md) |
| 公告安全渲染（受限 Markdown/HTML） | 已实现 | 不装配 | 不装配 | 无 | `internal/adapter/content/announcement.go` |

## D. 业务文件与平台存储治理

| 功能单元 | Platform | Standalone | CLI | 持久化 | 证据 |
| --- | --- | --- | --- | --- | --- |
| 文件服务（上传/下载/签名访问/清理，无管理页面） | 已实现，支持本地及云位置、授权迁移 | 已实现：固定本地位置，Web/原生桥等效 | 不装配 | core 的文件四表 + blob | `internal/files/service.go`、`internal/bootstrap/filelocal/service.go`、[ADR-0043](../adr/ADR-0043-business-file-boundaries.md) |
| 分片断点续传 | 已实现 | 已实现：本地分片与重启续传 | 不装配 | unicore_file_upload_sessions | `internal/files/multipart.go`、`internal/adapter/desktop/files.go` |
| 对象存储位置管理（local/minio/s3/oss/cos） | 已实现 | 不装配 | 不装配 | unicore_storage_locations | `internal/blob/store.go`、`internal/adapter/blobcloud/` |
| 品牌图片资源（logo/favicon/accent） | 已实现（运行时上传） | 不装配：使用构建期品牌 | 不适用 | branding.* + 对象命名空间 | `internal/branding/service.go` |
| 业务附件（如笔记附件 file_id 校验） | 已实现：笔记内直接上传/选择，按 notes 权限，服务端校验归属 | 已实现：两载体上传、下载、ready/归属校验 | 不装配 | file_id 随业务表，元数据在 core | `internal/files/attachment.go`、`internal/adapter/http/notes.go`、`internal/modules/notes/desktop/notes.go` |

## E. 安装、设置与运维

| 功能单元 | Platform | Standalone | CLI | 持久化 | 证据 |
| --- | --- | --- | --- | --- | --- |
| 安装向导 | 已实现（含管理员种子、profile 固化、可选证书与主机名校验） | 已实现：web 向导无账号步骤¹；desktop 自动初始化² | 不装配 | installation.json + unicore_install_state | `internal/install/manager.go`、`internal/bootstrap/local/local.go`、[安装规范](feature-installation.md) |
| 基础设置 | 已实现：实例设置，仅管理端 | 不提供实例设置，外观仅设备偏好 | 不装配 | unicore_system_settings | `internal/settings/service.go`、[设置需求](feature-settings.md) |
| 维护模式 | 已实现（应用内 + 离线开关） | 不装配（设置组不可见） | 不适用（运维命令面向平台实例） | maintenance.* | `internal/settings/service.go`、`internal/webmanage/instance.go` |
| 定时任务管理 | 已实现（内置任务 + 白名单执行器） | 不装配（web 仅 localCron 日志保留¹；desktop 无²） | 不装配 | unicore_scheduled_jobs | `internal/scheduler/scheduler.go`、`cmd/server/main.go` |
| 系统更新 | 已实现：管理端（updates:read/apply）；tar 可更新、Docker 仅检查 | 已实现：web `/updates` 仅 loopback¹；desktop 原生更新² | 不装配 | 更新缓存 + 任务状态 | `internal/updates/service.go`、`internal/adapter/http/updates.go`、[更新指南](../product/updates.md) |
| 审计日志 | 已实现（写入 + 元数据 + 查询/导出/流式跟踪） | 受限：仅写 core 审计表，无查询面（D17 已裁决为设计现状） | 不装配 | unicore_audit_logs(+metadata) | `internal/adapter/storage/sqlstore/audit.go`、`internal/adapter/http/logs.go` |
| 管理员仪表盘 | 已实现（成员计数/近期审计/7 日活跃） | 不装配 | 不适用 | 只读聚合 | `internal/adapter/http/dashboard.go` |
| 角色高级 API 目录（无独立页面） | 已实现（roles:read；授权需超管） | 不装配 | 不适用 | 契约派生 | `internal/platform/operations.go` |
| Prometheus 指标 | 条件支持（--monitor-listen） | 条件支持（同左）¹ | 不适用 | 内存 | `internal/observability/metrics.go` |
| 日志保留策略 | 已实现（logging.retention_days 设置） | 受限：启动时限值¹；desktop 固定保留² | 不适用 | 日志文件 | `internal/settings/logging.go`、`cmd/server/main.go` |

## F. 发行包内运维命令（Web 形态实例运维，非 CLI 形态）

`unicore`（cmd/server 二进制）子命令与独立工具 `unicore-ops`（cmd/ops，源码构建/模板分发）。它们操作**实例数据目录与数据库**，不属于 CLI 产品形态的能力（见 [形态规范第 1 节](product-forms.md#1-三种产品形态)）。

| 功能单元 | 适用实例 | 证据 |
| --- | --- | --- |
| 离线加密备份/校验/恢复（backup/verify/restore） | Platform 与 Standalone 实例（含桌面快照分支）；CLI 形态不装配 | `internal/maintenance/command.go`、[备份指南](../product/backup.md) |
| 服务管理（service/start/stop/restart/logs） | Web 实例（systemd） | `internal/webmanage/service.go` |
| 实例运维（admin 重置密码/sessions revoke/database/site/doctor） | Web 实例；账号类命令限 web-platform 实例 | `internal/webmanage/instance.go` |
| 交互管理菜单（manage）与配置生成（config） | Web 实例 | `internal/webmanage/menu.go`、`internal/config` |

## G. 共享核心（全形态基线）

| 功能单元 | Platform | Standalone | CLI | 持久化 | 证据 |
| --- | --- | --- | --- | --- | --- |
| 文本分析 Execute | 已实现（会话内） | 已实现（本地开放）¹² | 已实现（`unicore execute`） | 无 | `internal/usecase/execute.go`、`internal/adapter/cli/command.go` |
| Bootstrap 元数据 | 已实现 | 已实现¹² | 不适用（无 HTTP/桥） | 无 | `internal/runtime/profile.go`、`internal/adapter/desktop/bridge.go` |
| 健康检查 | 已实现 | 已实现¹ | 不适用 | 无 | `internal/adapter/http/policy.go` |
| Notes 业务模块 | 已实现（用户+管理端，按账号隔离） | 已实现（local scope）¹² | 不装配（模块特性关闭） | unicore_example_notes | `internal/modules/notes/`、[业务样板](../03-runbooks/business-example.md) |

### 共享设计系统（UI 基础能力，非新增业务）

| 功能单元 | Platform | Standalone | CLI | 持久化 | 证据 |
| --- | --- | --- | --- | --- | --- |
| 共享原语、独立控件、图表、日历、组合件与可编辑网格 | 已实现 UI 层（用户/管理员域按既有业务授权接入） | 已实现 UI 层（Web/GUI 共享；不增加平台身份与治理能力） | 不适用（无 UI） | 无新增业务持久化；组件本地状态与现有设备偏好分离 | `packages/ui/src/controls/`、`packages/ui/src/charts/`、`packages/ui/src/calendar/`、`packages/ui/src/composites/`、`packages/ui/src/data-grid/`、[UI 参考](../product/ui-components.md) |

这是共享呈现基础能力，不新增 operation、权限点、设置键、数据库表、业务菜单或仪表盘 widget。Agent/Composer/认证/通知/预约等组件名称不代表相应服务已装配；由业务页提供真实数据、SDK 调用与授权。family 范围以 `packages/web-ui/src/pages/ui-preview/catalog.ts` 显式登记为准，不把变体计为新业务功能或把登记视为视觉验收。

Platform 两工作台与 Standalone 两载体共用连续的顶栏/正文背景、圆角侧栏与本地菜单筛选，以及工作台 Card/StatCard 的柔和表面变体；不新增外观设置或持久化，CLI 不适用。几何与表面规范见 [设计系统](../02-standards/design-system.md)。

## H. 桌面载体专属（Standalone GUI 实现层）

| 功能单元 | 载体 | 证据 |
| --- | --- | --- |
| Wails 桥设置兼容方法（空列表、拒绝写入） | Standalone(GUI) | `internal/adapter/desktop/bridge.go` |
| 原生签名更新（native 部署） | Standalone(GUI)，需 `updater`；默认不要求 OS 证书，发布者验签必需 | `internal/adapter/desktop/updates.go`、`cmd/desktop/updates_enabled.go` |
| 单实例锁 | Standalone(GUI) | `internal/bootstrap/local/local.go` |

## I. 运行监控（P0 已实现；P1/P2 规划见 [设计草案](design-runtime-monitor.md)）

| 功能单元 | Platform | Standalone | CLI | 持久化 | 证据 |
| --- | --- | --- | --- | --- | --- |
| 运行概览（状态/版本/时长/核心健康/最近失败） | 已实现（super_admin，「运行监控」目录） | 已实现（两载体等效单页「概览」Tab） | 不适用 | 无（拉取式快照） | `internal/monitor/`、`internal/adapter/http/monitor.go` |
| 服务健康（HTTP/数据库/存储/后台任务） | 已实现（HTTP/DB 全量；存储卡、任务卡按装配呈现；任务管理仍在定时任务页） | 已实现（HTTP/DB；Web 显示 HTTP，桌面隐藏 HTTP；两载体均隐藏平台存储与任务卡，本地业务附件服务不启用存储位置管理监控） | 不适用 | 无 | 同上 + `internal/observability/metrics.go` |
| 资源监控（进程/Go Runtime） | 已实现（Prometheus Go/Process collectors 同源；图表卡片） | 已实现（desktop 经 stdlib 等效；RSS/CPU 桌面不适用） | 不适用 | 无 | `internal/observability/metrics.go`、`monitor.StdlibRuntime` |
| 运行事件流（环形缓冲 + 事件页；任务事件由调度器源头投递） | 已实现（super_admin「运行事件」页，容量 200 仅内存） | 已实现（单机「运行事件」Tab 等效） | 不适用 | 无（重启即清） | `internal/monitor/events.go`、`GET /api/v1/admin/monitor/events` |
| 服务健康完整化（连接池上限/等待耗时、存储逐位置手动探活、失败任务运行记录关联） | 已实现 | 已实现（平台存储管理/任务卡完全隐藏） | 不适用 | 无 | `internal/monitor/monitor.go`、`adminMonitorStorageProbe` |

| 宿主机硬件视图（身份/CPU 逐核/内存/Swap/磁盘/负载/网络累计+服务端速率/温度/cgroup 限额，图表卡片 + 会话趋势） | 已实现（gopsutil 只读采样，D20 追记上提 P0；P1 补深度指标） | 已实现（两载体等效） | 不适用 | 无（拉取式，不落库） | `internal/monitor/host.go`、`packages/web-ui/src/widgets/monitor-charts.tsx` |
| 告警（规则/检测/事件） | 已实现（T4 方案二：superAdmin 规则端点 + 后台检测 + notifycontent 通知，见 [设计 §9.3](design-runtime-monitor.md)） | 已实现（T4 方案二：内置默认规则本地告警，写入运行事件，不发外部通知；Web/GUI 等效） | 不适用（CLI 不装配） | 告警事件=运行事件缓冲（进程内，200 条）；Platform 规则=Settings 基建（`alerts.rules` 内部键）；Standalone 规则=内置常量 | `internal/monitor/alert.go`、`GET/PUT /api/v1/admin/monitor/alert-rules` |
| 本地只读快照接口 | —（走超管接口） | 已实现（`GET /monitor`，access local + sameOrigin，只读脱敏，D19） | 不装配 | 无 | `packages/contracts/openapi.json`（monitorSnapshot） |

## 已知差距与待决策

以下条目为「当前实现与设计目标可能存在差距」的功能级记录，详情与候选方案见 [待维护者决策清单](pending-decisions.md)：

- D1/D12 已解决：本地业务附件与平台存储治理分离，见 ADR-0043。
- files:* 不再作为默认用户业务权限（Assignable=false），保留文件 API 的显式授权；无文件管理页面。头像使用本人账号接口，业务附件使用对应业务授权。
- Standalone(GUI) 文件服务已使用实例 secret.Store；设置仍无敏感值，新增敏感设置前须按 D4 接线。
- 更新兼容性使用 Catalog 世代与完整 SQL 指纹（D5 已解决）；包含迁移的版本需停服备份后人工升级。
- 实例默认外观（appearance.theme）、bootstrap theme 和外观页面已移除（D13）：单机/桌面外观只走设备级偏好，右上角切换不受影响。

共享表单交互在 Platform 与 Standalone 两载体统一提供浮动标签、六格一次性代码（邮箱/短信/动态口令）、普通图形验证码输入与刷新图片、常驻帮助、失焦校验、按候选数量选控件、范围/出生日期、双端滑块、自动补全、级联、标签与真实文件进度。认证与安装页使用可辨认的共享输入区域。仅为 UI 能力，无新增身份、短信服务或业务资料持久化；CLI 不适用。见 [表单交互规范](../product/form-interaction.md)。

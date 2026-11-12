<!-- Author: yunnuo <ymz@ebox.vip> -->
# 待维护者决策清单

本清单记录源码审计发现、但**不能由源码单方面确定目标规则**的产品边界问题与文档漂移。每项给出证据、影响、候选方案与推荐方向；未经维护者确认不修改产品行为，也不把某一方（文档或代码）擅自改成另一方。裁决后：产品决策落入 [产品形态与能力边界规范](product-forms.md) 或新 ADR，文档漂移修正对应文档，实现问题按正常任务修复并更新 [功能适用性清单](feature-inventory.md)。

状态：待决策 / 已裁决（注明去向）。编号规则：`D<n>` 为稳定标识，一经分配不重排、不复用，废止项保留编号只改状态与去向；其他文档引用编号即可，含义以本清单标题为准。推荐方向只是建议，未经维护者确认不得写入任何规范或实现。

## D1. Standalone 文件能力是设计还是缺失

- 现状：files/blob 服务仅在 web-platform 装配（`internal/install/manager.go` attach）；Standalone 的 HTTP 存储路由 404（`internal/adapter/http/storage.go`），桌面桥无文件方法；笔记附件字段在 Standalone/桌面以未校验 JSON 存储（`internal/modules/notes` 仓储，附件校验仅在 `Files()!=nil` 时接线，`internal/adapter/http/notes.go`）。
- 证据：PRD「单机与桌面没有……对象存储设置」（[PRD](PRD.md)）；[存储指南](../product/storage.md)「单机/桌面不装配平台存储管理端」。
- 影响：Standalone 的业务附件语义目前弱于 Platform（无归属校验、无生命周期）。
- 候选：A. 维持「Standalone 无文件服务」为设计，明确附件字段在 Standalone 为普通 JSON（文档写清）；B. 为 Standalone 增加本地文件 port（新能力，需 ADR）。
- 推荐：先按 A 固化文档语义；若产品需要单机附件，再走 B 立项。**待决策。**

## D2. API 文档页在桌面载体的缺位

- 现状：`packages/web-ui/src/routes.ts` canAccess 将 desktop 排除在 api-docs 之外（无契约 HTTP 端点）；web-standalone 可经 `api_docs` 配置开启。
- 影响：Standalone 两载体在「API 文档」页面上不等效，属呈现差异。
- 候选：A. 接受为载体层差异（已列入形态规范第 5 节清单）；B. 桌面内嵌只读契约视图。
- 推荐：A（契约消费本就依赖 HTTP 面；派生项目开发者用 Web 载体查看）。**待决策确认。**

## D3. Standalone 本地管理面的远程暴露策略不一致

- 现状：web-standalone 的 `PATCH /api/v1/settings`（actor=local）受 sameOrigin 等中间件保护但**不限 loopback**；`/api/v1/updates*` 强制 Host 与 RemoteAddr 均为 loopback（`internal/adapter/http/updates.go`）。[支持范围](../support.md) 要求远程使用需外层访问控制。
- 影响：同一「本地面」两类接口的暴露强度不同；局域网部署时设置可被同源页面改动而更新不可用。
- 候选：A. 统一收紧为 loopback；B. 维持现状并在文档强调外层访问控制；C. 设置写操作加独立确认（如维护开关）。
- 推荐：B 为当前基线（与 README/support 口径一致），若出现真实远程部署需求再评估 A。**待决策。**

## D4. 桌面装配无 Secrets

- 现状：`internal/bootstrap/local/local.go` 构造 settings.Service 时 Secrets 为 nil（无加密能力）；当前 Standalone 无实例设置项，无敏感值，无实际问题。
- 影响：未来给 Standalone 增加任何含敏感值的设置前，必须先补桌面侧加密装配，否则违反「敏感值只写不回读」约定。
- 候选：在 bootstrap/local 引入与安装管理器同源的 secret 机制。
- 推荐：作为 D1/B 类能力扩展的前置项记录，暂不实施。**待决策（触发式）。**

## D5. 更新目标迁移等级常量与迁移目录不同步

- 状态：**已解决。** 运行时、Web/桌面包与签名清单共用 Catalog 生成的 `schema_generation` / `schema_fingerprint`，不再手写两个迁移等级。
- 自动安装要求全部适用 namespace、依赖、方言 SQL checksum 与账本契约相同；有迁移的升级通过人工停服备份和 runner 追加执行。开发基线整合与正式版后冻结政策见 [发行基线与更新兼容](../adr/ADR-0042-release-baseline-update-compatibility.md)。

## D6. 权限文档与共享导航授权一致性

- 裁决（2026-11-11）：维护者授权修复权限调查发现的全部问题。
- 状态：**已完成。** permissions.md、角色需求及相关 Skills 对齐统一账号、无前缀共享导航、独立菜单/按钮/API、完整高级 API 授权与菜单行反向分配；显式空按钮授权不再运行期恢复。规则见 [ADR-0040](../adr/ADR-0040-explicit-role-grants.md)。

## D7. 入口文档计数漂移

- 现状：`README.md`/`README.en.md`「12 个任务 Skills」实际为 14（`.agents/skills/`、`framework.manifest.json` skills 数组）；`docs/wiki/README.md`「八篇指南」实际 public-wiki 白名单为 13 篇 docs/product。
- 影响：轻度事实错误，不影响行为。
- 推荐：随下一次文档维护顺手修正计数。**待决策排期。**

## D8. feature-oidc 与 add-api-operation 仍以 ADR-0014 为「当前」身份域权威

- 现状：[OIDC 需求](feature-oidc.md)「当前两身份域见 ADR-0014」、`.agents/skills/add-api-operation/SKILL.md` 同类表述；[ADR-0016](../adr/ADR-0016-separate-client-admin-surfaces.md) 已声明账号分域被 [ADR-0037](../adr/ADR-0037-unified-user-identity.md) 统一账号取代，[架构](../01-architecture/architecture.md) 称旧双域 ADR 仅保留历史背景。OIDC 按域分离的绑定/回调实现仍真实存在。
- 影响：AI/开发者可能按已取代的模型设计权限。
- 推荐：把两处回链改为「现状实现见 ADR-0037/共享导航树，ADR-0014 为历史背景」。**待决策排期。**

## D9. 「单用户」措辞与「无账号」语义

- 现状：README 称 web-standalone 为「自托管的单用户工具」；design-v1.1 写「无用户」；实现为无账号主体（`capabilities.authentication=false`）。本规范已统一定义：Standalone 是**单用户产品，实现为无账号体系、本地隐式使用者**（见 [形态规范第 4 节](product-forms.md#4-不可违反的产品边界)）。
- 影响：仅措辞；「单用户」易被误读为存在一个隐式账号。
- 推荐：保留 README 措辞，以本规范定义为准；无需改 README。**已由规范定义覆盖，如仍想改措辞请指示。**

## D10. Standalone 公网开放表述强度不一

- 现状：`docs/product/index.md`「不对公网开放」（绝对）vs [支持范围](../support.md)/README「远程使用需外层访问控制」（条件）。
- 影响：用户对部署边界的理解不一致。
- 推荐：统一为「默认面向本机；远程暴露必须由外层访问控制承担认证与防护」（条件式），修 index.md 一处。**待决策排期。**

## D11. 生产代码遗留调试输出

- 现状：`packages/web-ui/src/pages/files.tsx` 存在 `console.log('PAGE_DEBUG2', ...)`，把权限与导航内部数据打印到生产控制台。
- 影响：信息泄露面（前端体验层，非权限边界）+ 噪音。
- 推荐：删除该行（一行代码修改，属功能修复，不在本次文档任务内）。**已解决：文件管理测试页已移除。**

## D12. 业务附件跨载体语义

- 现状：Platform 经文件服务校验附件归属（`internal/files/attachment.go`）；Standalone/桌面附件 ID 无校验（见 D1）。
- 影响：同一业务字段在两形态语义强度不同，派生项目易踩坑。
- 推荐：并入 D1 裁决。**待决策。**

## D13. 实例默认外观（appearance.theme）在 Web 形态的链路断裂

- 现状：bootstrap 的 `theme` 字段只在 web-platform 分支读取 `appearance.theme`（`internal/adapter/http/web.go`），但平台设置面 `applies()` 排除 appearance 组，平台无法持久化该键 → 平台 theme 恒空；web-standalone 允许该组、设置页提供实例级默认外观，但 web.go 无对应分支 → theme 也恒空；desktop 桥正常（`internal/adapter/desktop/bridge.go`）。前端未发现 `metadata.theme` 消费点（主题初始值来自客户端偏好 localStorage）。
- 影响：字段当前近于死代码；「单机实例默认外观」与「客户端初始主题」未打通。
- 候选：A. 移除该字段与读取分支；B. 在非平台分支读取 appearance.theme 并接通前端初始值。
- 推荐：先由维护者确认产品意图（单机默认外观是否应作用于新设备首启），再选 A 或 B。
- 裁决（2026-11-11）：**彻底去掉实例级外观设置**——设备级主题切换（右上角偏好抽屉，全形态一致）已满足需求，单机/桌面不需要实例默认主题。执行范围（后续代码任务）：移除单机外观设置页的实例默认外观表单及随之空置的页面/导航入口、清理 bootstrap theme 死链路（web.go 读取分支与契约字段评估）、评估 desktop 桥 `Settings/PatchSettings`、`appearance.theme` 定义与已存值的清理；`applies()` 的 appearance 特例随之简化。
- 状态：**已完成：实例外观定义、页面/Tab/菜单与 bootstrap theme 已移除；旧存值不再读取或允许写入，保留原数据，不引入清库迁移。桌面兼容设置方法返回空列表并拒绝写入。**

## D14. 无效构建标签 `production`

- 现状：`scripts/test-native-update.mjs` 使用 `-tags 'desktop,production,updater'`，仓库内不存在 `go:build production` 约束文件。
- 影响：无害但误导。
- 推荐：清理该标签或在文档注明预留。**待决策排期。**

## D15. 发行包与形态的绑定强度（验收评审 N1）

- 当前源码事实：Web 发行包以 ldflags 注入默认 profile（`scripts/release.mjs`）；`internal/runtime/profile.go` 注释明确 "remains overridable only at deployment"；`internal/config/config.go` 校验 profile 只验成员资格（web-platform / web-standalone 均合法），不校验发行包来源——web-standalone 发行包在部署期可用 `--profile web-platform` 安装成平台实例。
- 产品影响：[形态规范第 1 节](product-forms.md#1-三种产品形态) 的「发行物」列目前读起来像硬绑定；若部署弹性是有意设计，矩阵表述需澄清，否则使用者可能误判发行包能力边界。
- 可选方案：A. 硬绑定——安装向导锁定发行包默认 profile，拒绝跨形态安装；B. 保持部署弹性，规范明示「发行包携带默认 profile，部署期可覆盖，覆盖后按所选 profile 装配」。
- 推荐方向及理由：B——与现有代码注释意图一致，改动成本为零，且平台/单机同源二进制本就支持这种弹性；只需把矩阵表述改准确。
- 裁决（2026-11-11）：**选 B**——保持部署弹性，暂不限制；发行包默认 profile 仅为出厂默认值。未来若分发策略需要硬绑定再立项。
- 状态：**已裁决（B），去向：形态规范已按事实表述（部署期可覆盖属有意设计），无需代码改动。**

## D16. files 授权面与呈现面不一致（验收评审 N2）

- 当前源码事实：`files:access/upload/delete` 标记 `Assignable: true` 可授予普通用户角色（`internal/platform/roles.go`）；用户域前端永久硬隐藏 files 页面（`packages/web-ui/src/routes.ts` canAccess 用户域排除列表）；用户端 files API（13 个 operation）为 authenticated + files:* 权限门控；个人头像等能力经文件服务实现。
- 产品影响：普通用户可被授予一个永远看不到页面的权限点——授权面（角色编辑器可见可授）与呈现面（用户域无入口）不一致；符合「菜单/页面不构成权限」原则，但授权语义需要解释。
- 可选方案：A. 维持现状并在 [呈现规范](feature-presentation.md) 与权限文档澄清：files:* 授权点覆盖服务端 API 能力（头像、业务附件等），管理页面仅管理员域；B. 收权——files:* 取消 Assignable，收归管理员域专用；C. 为用户域提供文件页面（新能力，需 ADR）。
- 推荐方向及理由：A——头像与业务附件确实消耗 files 能力，收权会破坏既有个人能力；文档澄清成本最低。若确认 A，需同步修订权限文档对应段落。
- 裁决（2026-11-11）：维护者确认**普通用户不应管理文件**；`Assignable: true` 是当初接入对象存储验证期的测试遗留，计划移除。执行方向接近原 B，以「移除测试遗留授权」立项：移除时同步评估头像/业务附件是否需要替代授权点，并同步 roles.go、契约与权限文档。
- 状态：**已完成：文件管理页面与默认用户 files:* 授权已移除（Assignable=false），保留显式授权文件 API 与业务上传组件。头像经本人账号接口，笔记附件访问沿用 notes:access 及归属校验；既有自定义角色授权不自动改写。**

## D17. Standalone 审计只写不查（验收评审 N3）

- 当前源码事实：core 命名空间的 `unicore_audit_logs` 在全部有库形态写入（standalone 设置保存、desktop 桥 `actor="desktop"`）；富化元数据表 `unicore_audit_metadata` 属 platform 命名空间；查询/导出/流式跟踪依赖 Identity 服务，非平台形态 404。
- 产品影响：单机与桌面产生的审计记录本地不可见；矩阵已如实记录现状（feature-inventory E 审计行），但目标归属未决。
- 可选方案：A. 维持现状——规范明确「Standalone 审计仅落库、无查询面」，写入 [功能适用性清单](feature-inventory.md) 备注；B. 为 Standalone 增加本地审计查看能力（新能力，需 ADR 与迁移评估）；C. 停止非平台形态写入（不推荐，丢失诊断信息）。
- 推荐方向及理由：A——当前无单机审计查看需求信号，先固化语义避免误读为缺陷；需求出现时按 B 立项。
- 裁决（2026-11-11）：**选 A**——单机/桌面审计维持「只记不看」，与「非平台形态不做管理面」的产品原则一致。
- 状态：**已裁决（A），去向：现状即设计，无代码改动；功能适用性清单备注已同步。**

## D18. `monitor:read` 权限点是否进入 superAdmin 保留集（Runtime Monitor 设计）

- 当前源码事实：平台已有 SuperOnlyPermission 保留集机制（`internal/platform/roles.go`，不可分配、事务层硬校验）与契约 `superAdmin:true` 硬拦（`internal/adapter/http/policy.go`）；现有保留集覆盖 roles:write、administrators:*、settings:write、updates:apply、storage:write。
- 产品影响：运行监控设计要求「仅 super_admin 可访问」；用保留集实现则普通管理员永远不可授，若用普通可分配权限点则会出现「能授但按产品不该授」的灰色地带。
- 可选方案：A. `monitor:read` 登记 SuperOnlyPermission + 契约 `superAdmin:true`（与 updates:apply 同款）；B. 可分配权限点 + 菜单/角色运营约束。
- 推荐方向及理由：A——与「仅超管」产品约束一一对应，杜绝误授；B 把产品约束交给运营纪律，违背 fail-closed 原则。设计详见 [design-runtime-monitor.md](design-runtime-monitor.md) §8/§11。
- 裁决（2026-11-11）：**A**——`monitor:read` 登记 SuperOnlyPermission + 契约 `superAdmin:true`；「运行监控」为独立目录，置于系统区域「系统设置」「超级管理员」目录之后（维护者指定）。
- 状态：**已裁决（A），去向：design-runtime-monitor.md T1 实施依据。**

## D19. Standalone 本地监控 API 的暴露强度（Runtime Monitor 设计）

- 当前源码事实：updates 本地接口强制 Host 与 RemoteAddr 均为 loopback（`internal/adapter/http/updates.go`）；settings 本地接口仅 sameOrigin 等中间件保护、不限 loopback（`internal/adapter/http/web.go`）；监控快照为只读、可脱敏（不含路径明文/环境变量/DSN）。
- 产品影响：单机实例常部署在 NAS/家庭服务器，使用者从局域网另一台设备打开 Web——loopback-only 会让「单机用户查看自己实例运行状态」在远程场景直接不可用；sameOrigin 则暴露面略宽（只读快照）。
- 可选方案：A. loopback-only（同 updates，最保守，远程不可用）；B. sameOrigin 只读 + 脱敏（同 settings，远程只读可用）。
- 推荐方向及理由：B——监控是只读低敏数据且已脱敏，与 settings 同级；若维护者认为实例运行信息（版本/内存等）不宜跨机暴露则选 A。设计详见 [design-runtime-monitor.md](design-runtime-monitor.md) §8。
- 裁决（2026-11-11）：**B**——sameOrigin 只读 + 脱敏（同 settings 先例）。
- 状态：**已裁决（B），去向：design-runtime-monitor.md T2 实施依据。**

## D20. 宿主机与容器资源指标的口径与纳入阶段（Runtime Monitor 设计）

- 当前源码事实：现有指标仅应用进程与 Go Runtime（`internal/observability/metrics.go` 标准 collectors）；runtime.md 明确「process 指标是否可用取决于目标 OS 的采集能力，不声称所有系统指标一致」；无任何宿主机/容器采集。
- 产品影响：资源监控若混报进程与宿主数值，用户会把进程内存当机器内存（或反之）；容器部署下宿主视角需读 cgroup，含义再次变化。
- 可选方案：A. P0 仅进程内指标，宿主/容器 P1 best-effort 并明确标注视角；B. P0 即含宿主指标；C. 永不做宿主指标。
- 推荐方向及理由：A——P0 保持零系统依赖与跨平台确定性；宿主指标能力探测失败即「不适用」，容器内标注 cgroup 视角。设计详见 [design-runtime-monitor.md](design-runtime-monitor.md) §6/§8。
- 裁决（2026-11-11）：**A**——P0 仅进程内指标；宿主 P1 best-effort；容器内标注 cgroup 视角。
- 裁决追记（2026-11-11，验收反馈）：维护者将**宿主机基础硬件只读视图上提至 P0**（gopsutil v4：身份/CPU/内存/磁盘/负载/网络累计，拉取式、无后台采集、不落库）。CPU 使用率为相邻快照差值；容器内为内核 `/proc` 视角并在页面披露。cgroup 精确口径、传感器等深度指标仍留 P1。方案 A 的其余约束（零迁移、探测失败即不适用）不变。
- 状态：**已裁决（A + 2026-11-11 追记上提 P0），去向：design-runtime-monitor.md P0/P1 范围依据。**

## D21. 监控历史趋势的存储方式（Runtime Monitor 设计）

- 当前源码事实：无任何指标历史存储；外部长期存储现状即 Prometheus `/metrics`（可选 loopback 监听，`--monitor-listen`）。
- 产品影响：进程内环形缓冲实现最简、零迁移、重启即清；数据库持久化提供重启后趋势但引入新表、采样后台任务与清理策略，违反 P0「零迁移、零后台采集」目标。
- 可选方案：A. 进程内环形缓冲，长期趋势交外部 Prometheus；B. platform 命名空间新表持久化采样。
- 推荐方向及理由：A——符合「不是 Prometheus 替代品」定位与性能预算；B 待真实需求信号再立项。设计详见 [design-runtime-monitor.md](design-runtime-monitor.md) §8/§9。
- 裁决（2026-11-11）：**A**——进程内环形缓冲，不建表；长期趋势交外部 Prometheus。
- 状态：**已裁决（A），去向：design-runtime-monitor.md P1/P2 范围依据。**

## D22. P2 告警的范围与持久化（Runtime Monitor 设计）

- 当前源码事实：通知渠道（邮件/企业微信/签名 Webhook）与 12 事件机制为 platform-only（`internal/notifycontent`、`internal/mailer`）；standalone 无任何推送渠道；告警历史无现有表。
- 产品影响：告警若接通知仅平台可用；standalone 告警只能体现为事件页记录；告警历史落 platform 新表则引入 P2 迁移。
- 可选方案：A. 平台复用 notifycontent 新增监控事件（告警/恢复），standalone 明确不推送仅事件页；告警历史进程内或平台新表在立项时定；B. 不做告警，只保留事件流。
- 推荐方向及理由：A——渠道复用零新凭据面，且「异常有人知道」是监控闭环的价值点；standalone 边界如实声明。设计详见 [design-runtime-monitor.md](design-runtime-monitor.md) §7/§9。
- 裁决（2026-11-11）：**A**——平台复用 notifycontent 新增监控事件；standalone 不推送、仅事件页；告警历史存储方式在 T4 立项时定。
- 状态：**已裁决（A），去向：design-runtime-monitor.md T4 范围依据。**  
  **终审追记（2026-11-11）**：方案 A 确认；规则经 Settings 基建存储但走专用 superAdmin+monitor:read 端点访问；检测用 monitor 内 ticker（不进任务表）。
**二次终审（2026-11-11，方案二）**：Standalone（Web+GUI 等效）支持**本地告警**——内置默认规则（默认启用、不可配置、不开放管理界面）、后台检测、告警写入运行事件，**不发送任何外部通知**；CLI 不装配告警。任务失败规则仅 Platform 适用（standalone 无任务注册表，不伪造指标）；CPU/内存采用容器限额优先的自适应视角。完整定稿见 design-runtime-monitor.md §9.3，**已实现（2026-11-11）**。

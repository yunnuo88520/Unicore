<!-- Author: yunnuo <ymz@ebox.vip> -->
# Changelog

## Unreleased

### 中文

- 修复 Standalone 监控将本地业务文件服务误当作平台对象存储管理的问题；两载体保留本地附件上传，不显示存储位置与探活卡片。

- 将通用框架缺陷的归属判断、最小复现、临时补丁、上游反馈及修复同步纳入 AI 工作流；派生项目随附 framework-upstream Skill、协作入口和反馈模板。

- 完成首发基线整理：开发期 SQL 合并为三命名空间 version=1，更新兼容绑定生成的完整 schema 指纹，修复数据库备份参数冲突并增加证书身份校验选项；补齐真实派生项目标签教程、角色排障、稳定支持与恢复政策。
- 分离业务上传与存储治理：头像使用本人账号权限，笔记复用业务权限；Standalone Web/桌面支持本地附件、原生分片与系统保存对话框，保留归属校验、续传、清理及完整备份。


- 修复真实派生项目重命名后的产品文案与部署说明残留，以及模板映射对象导致源码同步异常的问题。同步改为隔离 worktree 合并、校验后再推进业务分支，支持冲突继续/中止并保护并发业务改动；模板发布延续已有历史，补齐随项目分发的源码升级与上游反馈指南和真实模板回归。

- 清理无关后台框架名称及测试、截图命名，使源码和文档直接描述自身能力。

### English

- Fix Standalone monitoring treating local business files as platform object-storage management; both carriers retain local attachments while hiding storage-location and probe cards.

- Standardize framework bug triage, minimal reproduction, local patches, upstream feedback and fix integration in the AI workflow; ship the framework-upstream Skill, entry points and feedback template with derived projects.

- Prepare the first stable baseline: consolidate development SQL into version 1 of three namespaces, bind update compatibility to generated schema fingerprints, fix database backup argument conflicts and add certificate identity verification; provide a runnable derived-project tutorial, role troubleshooting, stable support and recovery policies.
- Separate business uploads from storage administration: authorize avatars through own-account sessions and note attachments through business grants; support local attachments in Standalone Web and desktop, including native chunks, system Save dialogs, ownership, resume, cleanup and full backups.


- Fix product identity residues in real derived applications and mapped template entries that broke source upgrades. Merge and validate in an isolated worktree before advancing the application branch, support conflict continuation/abort, preserve concurrent application work and published template ancestry, and ship source-upgrade/contribution guidance with real-template regression coverage.

- Remove unrelated admin-framework references from current source, design notes, test names and screenshot paths.

## 0.1.4 — 2026-11-11

### 中文

- 告警通知接入 notifycontent 事件矩阵并统一总开关语义（替代 T4 初版的单收件人邮件路径）：新增 `alert_triggered`/`alert_recovered` 通知事件，独立默认模板与路由在通知设置页可编辑，模板变量完整覆盖规则名/级别/指标/当前值/阈值/资源视角/实例标识/主机/发生时间/故障持续时长/阶段；告警事件仅出现在管理员通知对象中。「启用系统通知」总开关统一控制全部事件通知（含告警，无隐式绕过），企业微信/Webhook 仍需单独开启；总开关关闭为有意静默，开启但邮件未就绪且渠道不可用时报 `notification_failed` 运行事件；每条投递为独立队列行（独立重试与 dead 终态），入队成功与实际发送成功明确区分，部分渠道入队失败不影响已入队渠道。旧版通知配置（12 事件）在保存时自动补全新增事件的默认规则与模板、不覆盖既有自定义，未知事件保持拒绝；告警模板变量在邮件 HTML 中正确转义。

- 新增「运行监控中心」P0：Platform 超管专属运行概览/服务健康/资源监控三页（系统区域末位「运行监控」目录）与仪表盘运行摘要，Standalone 的 Web 与桌面载体获得等效的单页监控台与摘要组件；快照只读、同源复用现有指标，`monitor:read` 进入 superAdmin 保留集。资源监控含宿主机硬件只读视图（gopsutil v4：主机身份、CPU 总量与逐核、内存/Swap、数据目录与根卷磁盘、负载、网络累计）与环形仪表、趋势面积图、堆叠内存条等图表卡片，趋势为页面打开期间的快照序列且不落库；存量实例升级后自动并入「运行监控」导航节点，且不覆盖既有自定义（P1 起新增的「运行事件」页同样按 per-node 种子自动补入，删除过的不复活）。

- 新增 Runtime Monitor 告警体系（T4 方案二实现）：Platform 完整告警（superAdmin 专用规则端点、30s 后台检测、notifycontent 通知）之外，Standalone（Web/GUI 等效）新增本地告警——内置默认规则自动启用、不可配置、后台检测、触发/恢复写入运行事件、不发送外部通知；CLI 不装配。检测引擎为 monitor 内单协程 ticker（不进任务表、无规则零协程、评估中跳过本拍、采集失败不归零），两形态共用同一状态机与事件结构；指标含数据库不可用、CPU/内存（容器限额优先的自适应视角，容器 CPU 用量列入实现清单）、数据目录磁盘与后台任务失败（仅 Platform 适用）；整体健康规则按成因归因抑制避免重复告警；冷却仅约束通知、恢复必通知、重启 2 分钟宽限期仅抑制通知（三场景语义定稿）；多实例按进程独立检测并携带安装实例/主机/PID 标识，重复通知为明确接受的行为；任务失败规则更名「任务最近执行失败」（Recent Task Failure，最近一次失败状态持续存在，告警评估排除禁用任务）；整体健康归因转移以独立 `alert_reclassified` 事件记录（恢复事件只代表真实恢复）；通知链路区分未配置/入队失败/等待/重试/dead 五态且 lease 为至少一次语义（极端重复通知为接受行为）；性能预算以 200 个有效样本重测（p50=19.9ms/p95=22.3ms/p99=25.5ms/max=26.7ms，墙钟口径，Linux 与远程数据库未测）。完整定稿见 design-runtime-monitor.md §9.3。

- 运行监控专项评审修复：资源监控 HTTP 耗时直方图分位桶下探至 0.25ms 并按 Prometheus 语义重写分位插值（此前亚毫秒 API 的 P95 被首个 5ms 桶虚高约 70 倍，甚至可能显示负值）；快照 `profile` 改为惰性读取当前安装形态（修复平台实例安装后仍显示安装前默认形态）；磁盘按文件系统设备去重（macOS 根卷与数据卷 firmlink 不再重复成两行）；对象存储探活按位置串行化并在文档明确「只读快照零写入、探活为监控唯一写路径」边界；运行概览精简为健康摘要（移除与资源页重复的大趋势图，数据库/存储改精简卡）；最近异常文案如实限定为任务失败并链接系统事件页；资源监控各卡标注主机级/进程级口径；趋势图补单点累积、暂停与不可用空态；网络速率纵轴小数刻度修复。

- 运行事件机制审计与更名：展示名由「系统事件」统一更名「运行事件」（Runtime Events，API 路径保留 events），避免与系统通知、操作日志混淆；专项审计明确三类事件来源并修复漏记——定时任务失败/恢复改为调度器完成钩子直接投递（新增 `Scheduler.OnResult` 与 `TaskEventTracker`，无人打开监控页也不再漏记，快照对比路径移除避免重复投递），生命周期与探活失败保持源头/手动投递，数据库健康翻转保留快照观察并在事件页如实声明「仅监控面被查看期间检测」；事件页固定呈现记录范围、200 条缓冲上限、重启清空与「非操作日志/系统通知/持久化审计」定位。

- 运行监控 P1：新增运行事件环形缓冲与事件页（平台「运行事件」页 + 单机「运行事件」Tab，容量 200 仅内存、重启即清，记录启动生命周期、数据库/任务健康翻转与存储探活失败）；服务健康完整化（数据库连接池上限与等待耗时、对象存储逐位置手动探活并缓存、失败任务关联最近 3 条运行记录）；宿主机深度指标（cgroup 内存/CPU 限额视图、Linux hwmon 温度采样、网络速率服务端化）。

- 新增产品形态与功能边界规范组（docs/00-product）：产品形态收敛为 Platform、Standalone（Web 与 GUI 桌面两个等效载体）与 CLI 三种，提供能力矩阵、功能适用性清单、呈现与访问规范、新功能分类模板与待维护者决策清单；AGENTS 新增第 11 条要求新功能先判定形态归属。本次为文档与规范变更，不改产品行为。

- 企业登录（OIDC）对真实 IdP 的兼容与登录体验增强：可开启 userinfo 补全身份（仅补 id_token 缺失字段，支持点路径适配非标准载荷）；JIT 的"企业邮箱必须已验证"改为可关闭开关；授权/令牌/userinfo/JWKS 四个端点支持逐项手动覆盖发现结果，发现文档残缺的 IdP 四项齐备即可接入，连接检查展示实际生效端点；JIT 建号写入企业显示名（userinfo/name/email 前缀优先级）。邮箱与本地账号冲突时不再要求两段操作：回调发放一次性 5 分钟绑定邀请，登录页"绑定企业账号并登录"卡片验证本地密码（TOTP 账号随后走既有 MFA 步骤）后单事务完成绑定、旧会话吊销并直接登录；绑定邀请失败即消耗，需重新发起企业验证。仅用户域提供，管理员域保持先本地登录再绑定。

- 系统设置导航将「基础设置」置于首位；设置分区边界重组：邮件设置只保留 SMTP 与发送测试，登录/注册人机验证与邮件找回密码移入「安全与控制」（新增站点防护分组），邮箱验证码登录移入「账户安全」页。

- 安全与控制新增站点级人机验证开关（登录、注册）与邮件找回密码入口；注册设置新增「注册绑定手机号」（开启后注册必填手机号，仅格式与唯一性校验，不发送短信）与同 IP 注册频率限制（默认 1 分钟 5 次，可配置窗口与上限），追加三方言平台迁移 0016（users/administrators 可空 phone 列与唯一索引）。

- 邮件设置加密方式选项更名澄清（STARTTLS 推荐、SSL/TLS 即隐式 TLS），切换加密方式自动填入常用端口（587/465/25），可手动覆盖；全局弱动效模式下加载指示器保持旋转（功能性反馈豁免）。

- 外观设置界面主题卡片改为更高的站点缩略图预览，不再是细条。

- 产品首页拥有独立路由 `/home`：开启 `site.home_enabled` 后未登录访问根路径跳转 `/home`，已登录用户访问 `/home` 回到工作台控制台；管理后台挂载点不受影响。

- 修复共享表单校验对契约可选字段的处理：Zod 适配器此前把未提交的可选字符串判为“应为文本”，新增手机号字段后暴露；现在与 SDK 校验一致，仅校验提交中存在的键。

- 表单错误提示去重：字段级错误只在对应控件下方内联展示，顶部横幅不再重复罗列也不再跨向导步骤残留；表单级错误仍横幅/提示呈现。安装向导输错邮箱不再出现双重错误与布局挤压。

- 全站体验修缮：平台公告移入「用户管理」分组；外观主题卡片改为紧凑竖版并提高预览高度；访客访问未注册路径显示统一 404 页而非登录表单；修改管理后台路径保存后自动跳转新入口；邮件模板编辑改为左编辑右实时预览分栏（停顿自动渲染，可手动刷新）；产品首页导航 logo 与站名组合显示，滚动顶栏去掉描边。

- 新增点击式人机验证（安全与控制中的单一总开关，同时管登录与注册）：支持 Cloudflare Turnstile、腾讯云验证码与阿里云验证码 2.0 三家服务商，凭据加密保存；开启后登录与注册必须携带服务商验证结果，凭据不完整时直接拒绝（fail-closed），动态放开对应服务商的 CSP 来源；与图形验证码相互独立、可叠加。登录/注册图形验证码名称保持不变。设置面板按三选一服务商重做：未启用时只显示卡片头，启用后先选服务商再只显示该家的凭据表单，附站点与密钥说明、控制台和接入文档直达链接。

### English

- Alert notifications now ride the notifycontent event matrix with a unified master-switch semantic (replacing the T4 single-recipient mail path): new `alert_triggered`/`alert_recovered` notification events ship their own default templates and routing, editable on the notification settings page, with template variables covering rule name, severity, metric, current value, threshold, scope, instance, host, occurrence time, firing duration and transition; alert events appear only under the administrator audience. The notification master switch uniformly governs every event notification including alerts (no implicit bypass), while WeCom/Webhook keep their own opt-in; an off switch is an intentional silence, and an on switch with mail not ready and no usable channel reports a `notification_failed` runtime event. Every delivery is an independent queue row (independent retry and dead states), enqueue success is distinct from delivery success, and one channel's enqueue failure never disturbs already-queued rows. Legacy 12-event notification configurations are completed with the new events' default rules and templates on save without touching stored customizations, unknown events stay rejected, and alert template values are HTML-escaped in mail bodies.

- Added the runtime monitor P0: a super-admin-only overview/services/resources console (a "Runtime monitor" directory last in the system region) with a dashboard summary on Platform, and equivalent single-page monitors plus summary widgets on both Standalone carriers; snapshots are read-only, reuse existing metric sources, and `monitor:read` joins the superAdmin reserved set.

- Added the Runtime Monitor alerting system (T4, plan two): beyond the full Platform alerting (superAdmin-only rule endpoint, 30s background detection, notifycontent delivery), Standalone (Web/GUI equivalent) gains local alerting — built-in default rules enabled automatically, not configurable, detected in the background, with trigger/recovery written to runtime events and no external notifications; CLI ships nothing. The detection engine is a monitor-owned ticker goroutine (never in the task table, zero goroutines without rules, skipped ticks while evaluating, failures never read as zeros) shared by both forms with one state machine and one event structure; metrics cover database unavailability, CPU/memory (adaptive container-quota-first view, container CPU usage listed for implementation), data-directory disk and background-task failures (Platform only); the overall-health rule is causally suppressed to avoid duplicate alerts; cooldown constrains only notifications, recovery notices always fire, and the 2-minute restart grace period suppresses notifications only (three-scenario semantics finalized); multi-instance detection is per-process with install-instance/host/pid identity and duplicate notifications explicitly accepted; the snapshot measures about 20ms (macOS local, host sampling dominates; remote databases untested), a 30s detection tick costs roughly 0.07% of one core. Full design in design-runtime-monitor.md §9.3.

- Runtime events audit and rename: the display name is now "Runtime events" across the monitor (API paths keep `events`), avoiding confusion with system notifications and the operation log; the mechanism audit separates three event sources and fixes a real gap — scheduled-task failures and recoveries are now delivered straight from the scheduler completion hook (new `Scheduler.OnResult` and `TaskEventTracker`), so they are recorded even when no monitor page is open, while the snapshot-diff path was removed to avoid double reporting; lifecycle and probe-failure events keep their source/manual delivery, and database health transitions stay snapshot-observed with the page honestly stating that limitation; the events page permanently states its coverage, the 200-entry buffer cap, the restart-clears-everything semantics, and that it is not the operation log, system notifications or persistent audit.

- Runtime monitor review fixes: the HTTP duration histogram buckets now reach 0.25ms and the quantile interpolation follows Prometheus semantics (previously a sub-millisecond API read a ~70x inflated P95 at the old 5ms first-bucket edge, occasionally negative); the snapshot `profile` is read lazily per snapshot so platform instances no longer report the pre-install default form; disks are deduplicated by filesystem device (macOS root/Data firmlink no longer shows two rows); object-storage probes serialize per location with the documented boundary that read-only snapshots never write and probing is the monitor's only write path; the overview is slimmed to a health summary (duplicate trend charts removed, compact database/storage cards); the recent-anomalies card states it covers task failures and links the events page; resource cards label host-level vs process-level scopes; trend charts gained single-point, paused and unavailable states; and the network rate axis formats decimal sub-kilobyte ticks.

- Runtime monitor P1: a runtime-event ring buffer with an events page (the Platform "Runtime events" page and a Standalone "Runtime events" tab; 200 entries, memory only, cleared on restart; records the startup lifecycle, scheduler-delivered task failures and recoveries, database health transitions seen by pulls and storage probe failures); service health completion (database pool limit and wait time, per-location manual object-storage probes with caching, the latest three run records joined for failing tasks); and host depth metrics (cgroup memory/CPU limit view, Linux hwmon temperature sampling, server-side network rates).

- Added the product-form boundary specification set (docs/00-product): product forms are consolidated into Platform, Standalone (web and GUI desktop as two equivalent carriers) and CLI, with a capability matrix, feature applicability inventory, presentation and access rules, a new-feature classification template and a pending-decision list; AGENTS gains rule 11 requiring form applicability checks before new features. Documentation and standards only; no product behavior changes.

- Enterprise OIDC gains compatibility and sign-in UX for real identity providers: optional userinfo enrichment fills only fields missing from the verified ID token (dotted claim paths for non-standard payloads); the JIT "enterprise email must be verified" requirement became a switch; the authorization/token/userinfo/JWKS endpoints each accept a manual override on top of discovery, so an IdP with broken discovery works once all four are present, and the connection check now shows the effective endpoints; JIT provisioning writes the enterprise display name (userinfo/name/email-prefix priority). An email collision with a local account no longer needs two manual steps: the callback issues a one-shot 5-minute linking offer, and the login page's "link the enterprise account and sign in" card proves the local password (TOTP accounts continue through the existing MFA step) before one transaction links the identity, revokes old sessions and signs in; a failed proof consumes the offer and a fresh enterprise round trip is required. User realm only; the administrator realm keeps local login before binding.

- The settings navigation puts "Basic settings" first; settings boundaries were regrouped: mail settings now only keep SMTP and the send-test panel, login/registration human verification and email password recovery moved into "Security & control" (new site protection group), and email code login moved to the "Account security" page.

- Security & control gains site-wide human-verification switches (login, registration) and the email password recovery entry; registration settings gain "require phone at registration" (mandatory phone with format and uniqueness checks only, no SMS) and a per-IP registration rate limit (default 5 per minute, configurable window and cap), plus the three-dialect platform migration 0016 (nullable phone columns and unique indexes on users/administrators).

- The mail encryption options were clarified (STARTTLS recommended, SSL/TLS means implicit TLS); switching the mode pre-fills the common port (587/465/25) and stays editable; loading spinners keep turning under reduced-motion as functional feedback.

- Appearance theme cards use taller site-thumbnail previews instead of thin strips.

- The product homepage owns the `/home` route: with `site.home_enabled` on, guests visiting the site root are redirected to `/home`, and signed-in users hitting `/home` return to the workspace console; the admin mount is unaffected.

- Fixed shared form validation for contract-optional fields: the Zod adapter previously rejected absent optional strings as "应为文本" (exposed by the new phone field); it now mirrors the SDK validate() and only checks keys present in the submission.

- De-duplicated form error display: field-level errors render inline under their controls only; the top banner no longer repeats them or lingers across wizard steps, while form-wide errors keep their banner/toast. A mistyped email in the install wizard no longer shows double errors or squeezes the layout.

- Sitewide polish: platform announcements moved into the user-management group; appearance theme cards became compact portrait tiles with taller previews; guests hitting unregistered paths now see a unified 404 page instead of a login form; saving a new admin path jumps to the new entrance automatically; the mail template editor split into editor plus live preview (auto-render on typing pauses, manual refresh); the homepage nav keeps logo and site name together and drops the scrolled outline on the sticky header.

- Added click-through human verification behind a single master switch under security and control, covering both login and registration: three providers are supported (Cloudflare Turnstile, Tencent captcha and Aliyun captcha 2.0) with sealed credentials; when enabled, login and registration must carry the provider proof, unconfigured providers fail closed, and the CSP widens only for the selected provider's origins. The existing image CAPTCHA switches keep their names and stack independently. The settings panel follows the three-way provider flow: collapsed to its card header until enabled, then a segmented provider choice reveals only that provider's credential form with helper text plus console and docs links.

## 0.1.3 — 2026-11-06

### 中文

- 文档站侧栏重组为快速开始、部署运维、应用开发、功能与边界、框架规范（维护者）五组，维护者深度手册显式标注并默认折叠；新增常见问题、桌面与 CLI 安装、安全策略与加固页面。部署指南补充最快路径、Caddy 反代示例、日志与监控接入和单实例边界说明。Release 发布时自动构建并推送多架构镜像到 ghcr.io/yunnuo88520/unicore，历史已发布版本无镜像。

- Web 单程序新增交互管理菜单、Linux/systemd 服务安装与启停、自启和日志；支持停服后的管理员密码恢复、后台路径、维护模式、会话撤销及同实例数据库连接修复，自动复用受管服务配置，保留既有双因素验证，不迁移数据。

- Web 默认生成 config.yaml，支持严格 YAML 配置及旧 JSON 兼容；默认监听与 Docker/Compose 端口统一改为 3000，部署模板、开发代理与文档同步调整。现有部署需显式保留旧端口或同步修改代理/映射。

- 精简用户发行包：Web 使用一个 unicore 入口提供服务、帮助、配置和离线备份恢复，前端内嵌；CLI 入口移至根目录，桌面包只留运行与升级必需文件。移除重复静态资源、帮助脚本、完整文档与历史日志；旧 bin/server 部署需手动停服迁移并修改 systemd 入口。

- 公告改为顶部铃铛、分页列表与确认弹窗，新增标题、结束时间、归档、指定接收用户、全量未读统计与首次已读查询；保留软删除/版本审计，追加三方言平台迁移 0015。

- 对象存储改为横向切换的单配置表单，移除新增位置和重复的默认选择器；上传规则独立分组，支持路径标签增删及折叠的分片/清理设置，保留历史文件目标与密钥保护。

- 注册密码规则改为输入后按字段提示，移除注册按钮下的常驻说明；管理员认证页移除跳转普通用户登录的链接。

- 重做登录、注册、找回密码与注册完成页，统一双栏布局、真实页面互链、密码显隐及注册/重置确认密码；注册完成不再重复登录入口。注册用户名/邮箱冲突返回 409 与字段提示，保留事务和唯一约束，修复重复注册被伪报成功的问题；邮件恢复仍不泄露账号存在性。

- 新增账户安全二级菜单、两类账号 2FA 状态列、分域强制验证、登录失败 IP 封禁与会话超时；登录注册页采用双栏卡片与移动端布局。

- 修复验证器绑定密钥自动失效，验证可解码二维码与真实 TOTP 登录；拆分开放注册/邮箱验证，新增后缀限制、黑名单、存储内联表单及上传路径/扩展名策略。

- 将系统设置与完整个人中心归入系统管理分区；支持昵称、两步邮箱换绑、TOTP/一次性恢复码、所有登录方式的二次验证与设备下线，新增三方言平台迁移 0014。
- 优化安装向导和二级导航选中态；增加默认存储策略、批量文件迁移进度、站点/管理员邮箱/公安备案/页脚设置、维护模式与注册开关。
- 补全 Web 从零部署与配置手册：环境/数据库、Docker/Compose、tar/systemd、HTTPS、安装、验证、更新和故障排查，提供完整参数及设置表。

- 新增 VitePress 文档站：复用显式公开文档白名单，提供中英文入口、全文搜索与开发/运维导航；配置 unicore.ebox.vip、静态构建检查和 main 手动 Pages 部署，附内容更新与域名部署手册。DNS、TLS 和线上发布需实际配置。

- Web 安装后生成 install.lock；服务器管理员停服删锁并重启后可凭新凭据从头安装，原库必须验证归属并确认清空，别站与归属不明非空库拒绝覆盖。框架表固定 unicore_ 前缀，派生项目保持，旧 0.x 表通过三方言追加迁移保留数据重命名。

- 精简全局页脚为版权与可选备案信息，移除重复版本/技术栈和误放到所有页面的文本分析说明；默认署名显示为 Crafted by Yunnuo，兼容旧默认值并保留自定义版权。

- 导航默认保持宽侧栏并折叠菜单分组，窄栏只显示一级入口且通过分组弹出子菜单；修正内嵌/悬浮模式的顶部圆角、容器间距与明暗主题一致性。
- 派生创建器支持 --repository 配置独立 origin、界面文档和反馈链接，保留作者/许可及只读上游；修复远端模板引用的共同祖先初始化，并让新界面标题、数据库/存储默认值跟随产品身份。

- 建立 framework-template 模板分支与上游同步体系：模板分支为孤儿根的连续白名单历史（含框架身份文件），创建器以模板提交为共同祖先派生项目，新增 framework:check 冲突预览与 framework:sync 归一化三方合并（备份分支、身份归一化、模块路径恢复、重投影校验、同步报告、冲突零改动）；分发清单登记文件所有权分类，派生项目二次同步经端到端验证。
- 创建器升级为正式产品生成器：导出即完成 git init、初始基线提交与只读 framework 远端，provenance 新增上游模板版本、生成器版本与产品身份摘要，来源 VERSION 校验 SemVer；派生项目开箱通过 product:check 与 check:residuals。
- 产品身份唯一来源覆盖全部产品可见面：CLI 帮助文案、Web/桌面 HTML 标题、PWA、词标与主题生成物、openapi 标题、部署启动器/服务/Compose/Nginx/Docker 标签及模板文档令牌均由 product.identity.json 生成；CLI 根命令帮助、邮件主题、更新 UA 与桌面程序名接入身份常量。
- 新增 product:check 只读门禁与派生项目残留扫描 check:residuals（框架仓库自动跳过）；安装与数据库错误文案去产品化并同步中英文；示例文本与发行 README 改为按身份生成。

### English

- Reorganize the documentation site sidebar into get-started, deploy & operate, develop, features & boundaries and framework internals (maintainer) groups; maintainer deep-dives are labeled and collapsed. Add FAQ, desktop/CLI installation and security policy pages. The deployment guide gains a fastest-path section, a Caddy example, logging/metrics notes and a single-instance boundary statement. Published releases now build and push multi-arch images to ghcr.io/yunnuo88520/unicore; historical releases have no image.

- Add a Web management menu, Linux/systemd installation, service controls, autostart and logs in the same executable. Offline commands recover administrator passwords, change the administrator path and maintenance mode, revoke sessions and repair same-instance database connections, reusing managed service configuration while retaining enrolled MFA and leaving data migration to operators.

- Generate config.yaml by default with strict YAML loading and legacy JSON compatibility. Use port 3000 for Web and Docker/Compose defaults and align deployment templates, the development proxy and documentation. Existing deployments must explicitly retain the old port or update proxy/mapping settings.

- Simplify user archives: one Web executable provides serving, help, configuration and offline backup/restore with embedded assets; CLI commands move to the archive root and desktop packages retain only runtime/update essentials. Remove duplicated assets, help scripts, full documentation and changelog history. Existing bin/server deployments require a stopped manual migration and a systemd entry-point change.

- Replace dashboard announcements with a header bell, paginated inbox and acknowledged popups; add titles, expiration, archives, selected recipients, global unread counts and first-read receipts, preserving versioned soft deletion and transactional audit with platform migration 0015.

- Redesign storage settings with horizontal provider selection and one configuration per provider; remove location creation and duplicate default controls, separate upload rules, add path chips and collapsible multipart/cleanup settings, and preserve historical targets and credential protection.

- Show registration password validation after input instead of a persistent footer hint, and remove the user-login link from administrator authentication pages.

- Rebuild linked login, registration, recovery and registration-success pages with a shared split layout, password visibility and registration/reset confirmation. Keep one sign-in action on completion. Return 409 and field feedback for duplicate usernames/emails, preserve transaction and unique constraints, and stop reporting duplicate registration as success; recovery responses remain opaque.

- Add account security management, read-only 2FA status, realm-specific enforcement, temporary login IP bans and session timeouts; redesign authentication with responsive split cards.

- Fix authenticator enrollment rotation and verify scannable QR/TOTP login; separate registration and email verification, add restrictions and inline storage forms with path/extension policies.

- Group system settings and a complete personal center under System Management, with display names, two-step email changes, TOTP/recovery codes, MFA for every login method, device revocation, and additive platform migration 0014 for three dialects.
- Improve installation and nested navigation; add default storage policies, bulk migration progress, site/contact/footer settings, maintenance mode, and registration controls.
- Expand Web deployment and configuration guides with prerequisites, databases, Docker/Compose, tar/systemd, HTTPS, installation, verification, updates, troubleshooting, and parameter tables.

- Add a VitePress documentation site with an explicit public-document whitelist, Chinese/English entry points, full-text search, and development/operations navigation. Configure unicore.ebox.vip, static build checks, and manual Pages deployment from main, with content-maintenance and domain-deployment guides. DNS, TLS, and live publication still require configuration.

- Create install.lock after Web setup. Server owners can stop, delete the lock and restart for a fresh-token reinstall; resetting the original database requires verified ownership and explicit consent, while foreign or unrecognized occupied targets are blocked. Keep a fixed unicore_ framework table prefix in derived products and preserve legacy 0.x data through appended dialect-specific rename migrations.

- Keep the global footer to copyright and optional registration details, removing duplicate version/stack labels and the lab-specific text-analysis note from shared pages. Display the default credit as Crafted by Yunnuo, including the legacy default, while preserving custom copyright text.

- Keep the sidebar wide by default with collapsed menu groups; the rail shows only top-level entries and opens group menus for children. Align header corners, container spacing and light/dark surfaces in inset and floating layouts.
- Let the creator configure an independent origin, UI documentation and feedback links with --repository while preserving authorship, licensing and a read-only upstream. Fix common-ancestor initialization from remote template refs and apply product identity to new UI headings and database/storage defaults.

- Establishes the framework-template branch and the upstream sync system: the template branch is a continuous whitelist-only history with an orphan root (including the framework identity file), the creator derives projects with the template commit as a true common ancestor, and new framework:check conflict previews plus framework:sync normalized three-way merges (backup branch, identity normalization, module path restoration, re-projection checks, sync report, zero-change conflict refusal) land alongside ownership classification in the distribution manifest; a second upstream sync is covered end to end.
- The creator is now a full product generator: exports complete git init, the initial baseline commit, and the read-only framework remote; provenance gains the upstream template version, generator version, and identity digest, and the source VERSION is validated as SemVer; derived projects pass product:check and check:residuals out of the box.
- The single product identity source now drives every product-visible surface: CLI help text, Web/desktop HTML titles, PWA manifest, wordmark and theme generations, OpenAPI title, deployment launchers/service/Compose/Nginx/Docker labels, and template document tokens all generate from product.identity.json; CLI root help, email subjects, the updater user-agent, and the desktop program name consume identity constants.
- Adds the read-only product:check gate and the derived-project residue scan check:residuals (skipped automatically in the framework checkout); installation and database error copy is de-productized with paired zh/en updates; sample text and release READMEs generate from identity.

## 0.1.2 — 2026-10-31

### 中文

- 桌面分发新增 macOS 拖拽安装 DMG、Windows 直接运行 EXE，保留 OTA tar；Linux Web 提供 unicore/unicorehelp、帮助及拒绝覆盖的可选 JSON 配置生成/加载，首次安装仍由 /install 引导。
- 仓库 README 与新版本变更说明同步中英文；候选从 Changelog 和真实产物生成双语 Release 说明，版本准备与 CI 拒绝缺语言、缺配对条目或占位符；派生项目也生成双语入口。
- 明确用户包、派生应用与 Wiki 的独立文档白名单，精简框架导航；新增工具显式纳入模板导出，保持品牌、契约和开发命令复用。
- 平台统一本地/MinIO/S3/OSS/COS 持久分片上传，支持暂停、继续、刷新/重启续传与确认字节进度；管理员可设置大小、分片和并发策略（默认 100 MiB，策略上限 64 GiB，非压测承诺）。COS 实云权限及其他 S3 服务仍须独立验证。
- 新增平台公告管理、定时/草稿、批量软删除、安全详情与用户工作台单行轮播；Goldmark 升至 1.7.17，修复 GO-2026-5320，并保留链接与富文本安全校验。
- 引入统一业务实体、分页、软删除、并发与分层开发规范；修正日志详情重复，邮件默认中文内容独立于界面语言。
- 管理端操作日志支持类型、关键词、日期、操作者/目标/IP 快照、排序分页与 CSV 导出；邮件模板独立编辑五种发送场景，包含预览、变量、测试发送与恢复默认。
- 图形入口共用中英文切换和本地主题抽屉，偏好跨标签同步、刷新/原生重启保留；移除 RTL 偏好并修复布局遮挡，递归双语检查阻止遗漏英文。
- 修复 Windows SQLite 盘符和 file URI 解析，启动失败显示原生错误弹窗；CI 验证真实 Windows exe 的窗口启动、SQLite 初始化、重启与失败提示。
- 接入管理员专用 GitHub/HTTPS 签名 OTA、离线版本历史、备份确认、程序切换和失败回滚；Ed25519 更新清单与派生信任隔离独立于可选的 macOS/Windows 系统签名，Docker 继续外部替换镜像。
- 更新 Go、Wails、SQLite、对象存储 SDK、OAuth2、前端工具与 GitHub Actions，最低 Node 22 补丁提升至 22.22.2；保留 TypeScript 5/Vite 7 基线与完整依赖安全门禁。
- 从 v0.1.1 升级涉及平台迁移 0010–0012 与业务迁移 0002；升级前停服并完整备份数据库、私有目录和密钥，在隔离副本验证。回退须恢复升级前快照和匹配旧程序，不能只换旧 binary。

### English

- Add macOS drag-to-Applications DMG downloads and directly runnable Windows EXEs while retaining OTA tar archives. Linux Web includes unicore/unicorehelp, help, and optional JSON configuration generation/loading that refuses overwrites; /install remains the first-time setup entry.
- Provide Chinese and English READMEs and new release entries. Candidates generate bilingual notes from the Changelog and actual artifacts; version preparation and CI reject missing languages, unpaired entries, and placeholders. Derived projects also get bilingual entry points.
- Define separate documentation whitelists for user packages, derived applications, and the Wiki; simplify framework navigation and explicitly export new tooling while preserving reusable branding, contracts, and development commands.
- Unify persistent multipart uploads across local/MinIO/S3/OSS/COS storage with pause, resume across refreshes/restarts, and confirmed-byte progress. Administrators control size, chunking, and concurrency (100 MiB default, 64 GiB policy ceiling, not a load-test claim). COS cloud permissions and other S3 services still require independent validation.
- Add platform announcement administration, scheduling/drafts, bulk soft deletion, safe details, and a compact dashboard carousel. Upgrade Goldmark to 1.7.17 to fix GO-2026-5320 while retaining URL and rich-content safeguards.
- Introduce shared business-entity, pagination, soft-deletion, concurrency, and layering conventions; fix duplicate log details and keep default Chinese email content independent of UI language.
- Add audit-log type, keyword, date, actor/target/IP snapshots, sorting, pagination, and CSV export. A dedicated email-template editor covers five delivery scenarios with preview, variables, test delivery, and reset.
- Share Chinese/English switching and a local theme drawer across graphical profiles, with cross-tab synchronization and persistence across refreshes/native restarts. Remove RTL preferences, fix layout overlap, and recursively check for missing English messages.
- Fix Windows SQLite drive-letter and file-URI parsing and show native startup-error dialogs. CI exercises real Windows EXE window startup, SQLite initialization, restart, and failure messages.
- Add administrator-only GitHub/HTTPS signed OTA, offline release history, backup confirmation, program switching, and failure rollback. Ed25519 update manifests and isolated derived-project trust are separate from optional macOS/Windows OS signatures; Docker continues to use external image replacement.
- Update Go, Wails, SQLite, object-storage SDKs, OAuth2, frontend tooling, and GitHub Actions. Raise the minimum Node 22 patch to 22.22.2 while retaining the TypeScript 5/Vite 7 baseline and full dependency-security gates.
- Upgrading from v0.1.1 applies platform migrations 0010–0012 and business migration 0002. Stop the service, back up the database, private directory, and keys together, and validate on an isolated copy. Rollback requires the pre-upgrade snapshot and matching old program, not just an old binary.

## 0.1.1 — 2026-10-28

- 修复 GitHub 依赖告警：升级 Chi、JOSE、Wails、Echo、Compress、Edwards25519、x/net 和 Vitest；移除旧 Tinypool 依赖链。安全门禁增加全部前端依赖与桌面导入包检查。
- 原生桌面按实际 runner OS/Arch 生成保留权限的 tar.gz；候选发布合并相同 main 提交的 Web/CLI/三系统桌面共 13 个包，验证版本、来源、矩阵与校验和，并生成 GitHub 构建来源证明。
- Wiki 从仓库文档生成与显式同步，提供完整阅读导航；纠正部署手册的旧设置入口、备份和品牌存储说明，完善开源仓库安全入口、依赖告警待办、主分支规则和首个开发预览说明。
- 更新开源 README、当前能力与 CI 结果，新增贡献/支持/行为准则、Issue/PR 模板、Dependabot 版本更新和 GitHub 维护手册；社区文档纳入链接检查。
- MIT 许可、应用源码创建器、环境自检和隔离开发依赖。
- 共享个人笔记持久化样板、独立业务迁移、身份域隔离、附件引用及乐观锁。
- 独立离线 age 加密备份/校验/恢复工具，支持 SQLite/PostgreSQL/MySQL 与云文件恢复到本地。
- 框架上游合并约定、依赖安全扫描和带来源证明的手动发布候选。
- Go 安全基线提升至 1.26.10，修复可达依赖漏洞；契约生成保留 title 等业务字段，测试环境兼容 Node 原生 Web Storage。

- 平台管理端与用户端改为独立 HTML/API 入口；管理员 API 固定 /api/v1/admin/*，不再用身份请求头选域，Cookie 和凭据保持独立。管理员 OIDC 回调改为 /api/v1/admin/auth/oidc/callback，升级需更新 IdP 白名单及外部 API 客户端。
- 单机/桌面仅业务与本地外观，移除运行时站点/品牌管理与对应 Wails 桥接；旧品牌数据保留但不再读取，无新增 schema 迁移。
- 重做登录/注册左右布局、上传拖拽弹窗与实际传输阶段；布尔设置统一开关，开放注册默认关闭并归入安全与控制，保留 SMTP 测试门槛。

- 在线平台新增统一文件存储：本地默认、MinIO/S3/OSS/COS 配置、浏览器直传、私有签名下载、元数据与生命周期清理，支持按文件 ID 迁移。品牌上传共用存储接口，平台迁移 0009。

- 统一顶部五态消息（默认 3 秒）、修正二级导航缩进与矢量图标，移除单机/桌面账号头像。

- 管理员/普通用户及会话、验证码、恢复、企业绑定物理拆表，独立登录入口；迁移 0008 保留既有管理员凭据与绑定、撤销旧会话，不支持身份升降。
- 导航分用户管理/系统管理、固定侧栏与头像菜单，新增账号及改密使用弹窗；合并邮件配置/测试，投递迁系统日志，移除模板设置与重复仪表盘。

- Web 首装默认推荐 MySQL/PostgreSQL，拆分数据库连接字段并强制测试；已有数据须备份、勾选和精确库名确认后初始化，已安装库禁止覆盖。
- 自动登记访问 origin，安装凭据说明与授权换新按钮；加密配置与安装标记持久恢复，已安装实例缺失 DB/标记时拒绝重装。

- 平台收敛为管理员/普通用户两角色，菜单、页面与所有管理 API（含只读）仅管理员，角色目录只读。
- 平台外观仅保存在当前客户端；普通用户不加载全局设置，管理员全局站点/品牌变更仍统一生效。
- 迁移 0007 保留管理员/账号，自定义角色账号归为普通用户，撤销旧凭据并取消待发邮件；升级需停服成套备份并重新登录。

- 统一 VERSION 生成所有应用版本投影，增加版本准备、Changelog 和快速 tar/镜像构建入口。
- 修正 Nginx 安装/自定义后台/品牌资源边界，补充 Docker/Compose 与真实部署验收。
- 设置使用单层分组 Tabs、品牌三卡片和共用外观；ICP、SMTP 别名、系统通知模板及可裁剪授权/升级占位。

### 基础审计与原生品牌修正（2026-10-26）

- 明确生命周期、错误/日志、数据库、契约/文档、前端会话/路由/表单与可观测性的实际完成范围及后续验收条件。
- HTTP 退出等待在途请求排空，再释放 worker/存储；超时关闭连接，监听失败按错误返回，启动日志在监听成功后输出。
- 原生品牌增加稳定 bundle ID、开发 plist、Wails 构建前生成与 make/CI 打包校验；macOS 检查真实 ICNS 品牌像素和分辨率，补充 Finder/原生运行验证。

### M3a（2026-10-26）

- 平台 OIDC：授权码 + PKCE S256、一次性浏览器 state、nonce、成熟库签名/issuer/audience/有效期校验。
- 可加密配置单个企业 IdP，发现连接检查；本地密码登录保留。新「账号安全」页支持显式绑定与解除，绑定要求本地密码及企业重新认证。
- 首次建号默认关闭，启用时仅创建普通用户，不按邮箱自动合并、不导入企业管理权限；关联变更事务撤销旧会话与挑战。
- 平台迁移 0006；最后一个 active 本地密码超管不可禁用/降权。新增隔离签名 IdP 与真实 SQL/浏览器验收。

## M2d（2026-10-26）

- 平台业务角色创建、改名、权限分组编辑、只读查看与删除确认；用户管理动态关联业务角色。
- 内置角色不可改删，身份/角色/实例配置写入权限不可委派；创建用户不能授予超出自身范围的角色。
- 角色写入和用户分配在同一锁内复核权限，修改角色事务撤销关联用户旧会话、待用令牌及数字验证码。
- 平台幂等迁移 0005，为既有超管补齐角色权限；单机/桌面/CLI 不装配平台角色 API。

## M2c（2026-10-26）

- 统一设计 tokens 和离线图标生成，覆盖 Web/Wails/favicon/ICO/系统关于/Linux 窗口；支持单入口换色、字体/字号、圆角、间距、图标线宽和动效。
- 四种配套中文邮件模板、HTML/纯文本、CID 品牌图和后台预览；QQ SMTP 实投与收件端确认。
- 六位数字邮箱验证、登录、找回密码；HMAC、10 分钟期限、60 秒重发、5 次错误上限及平台 migration 0004。
- PC/375px 浅深主题页面截图、原生 macOS 实操、全局换色验证；未实现能力仍按路线图标注。

## M2b（2026-10-26）

- SMTP TLS/STARTTLS、真实测试门槛、加密密钥与保持/清空语义。
- 平台注册默认关闭，pending 邮箱验证、重发验证和邮件找回密码。
- 一次性分用途令牌、加密持久邮件队列、租约恢复与最多 5 次重试。
- 密码重置撤销旧会话，并阻止旧密码并发登录重新签发会话。
- 分组设置、脱敏邮件状态、PC/375px 邮件账号流程和三数据库升级测试。
- M2b 仍保留后续完整角色/权限编辑与 M3/M4 路线。

## M2a（2026-10-26）

- Web 一次性凭据安装、空库/实例归属检查、崩溃恢复与 profile 固定。
- SQLite/PostgreSQL/MySQL 分方言嵌入迁移与真实数据库测试。
- Argon2id、服务端 session、CSRF、图形验证码、账号/IP 限流和后端 RBAC。
- 平台用户创建/搜索/分页/角色/启停、最后超管保护、真实统计与审计。
- SettingDefinition 注册设置、密文 DSN、站点/主题/安全/后台路径持久化。
- 桌面自动 SQLite 与本地设置，bindings 不触碰用户数据，CLI 依赖隔离继续通过。
- 独立实例 E2E、CI 外部 DB services，以及持久卷部署模板。

## 0.1.0 — 2026-10-26

- 建立 Go / pnpm monorepo 与 M1 profile 边界。
- 文本分析共享用例贯通 HTTP、原生 Wails 桥接和 CLI。
- 共享 React 工作台、实验室、三态主题与 375px 响应式。
- OpenAPI → Go / TypeScript 契约生成与一致性检查。
- 单测、跨入口测试、浏览器 E2E、依赖边界与作者检查、原生构建 CI。
- 开发版 tar / Docker 模板、跨平台预览包与 manifest；安装/身份/持久化/升级待后续里程碑。

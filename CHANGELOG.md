<!-- Author: yunnuo <ymz@ebox.vip> -->
# Changelog

## Unreleased

### 中文

- 产品身份唯一来源覆盖全部产品可见面：CLI 帮助文案、Web/桌面 HTML 标题、PWA、词标与主题生成物、openapi 标题、部署启动器/服务/Compose/Nginx/Docker 标签及模板文档令牌均由 product.identity.json 生成；CLI 根命令帮助、邮件主题、更新 UA 与桌面程序名接入身份常量。
- 新增 product:check 只读门禁与派生项目残留扫描 check:residuals（框架仓库自动跳过）；安装与数据库错误文案去产品化并同步中英文；示例文本与发行 README 改为按身份生成。

### English

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

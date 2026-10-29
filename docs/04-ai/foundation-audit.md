<!-- Author: yunnuo <ymz@ebox.vip> -->
# 基础能力当前状态（2026-10-28）

当前基座已包含双入口、文件存储、持久化笔记样板、离线备份恢复和签名 OTA，最新结果见 [更新验收](acceptance-updates.md) 与 [开发基座验收](acceptance-developer-kit.md)；较早的 [AI 基础验收](acceptance-ai-foundations.md) 和原生品牌证据保留阶段范围。这表示框架可持续扩展，不等于完整 v1 或正式生产发行。

| 能力 | 当前实现 | 边界与后续 |
| --- | --- | --- |
| 生命周期与配置 | Web 集中 flag > env > 默认、参数校验、可配置排空/探测超时；组件逆序清理并合并错误；桌面返回后关闭存储 | CLI/桌面共用日志 env 选项，各形态存储配置保持独立；handler 必须遵守 context |
| 响应与错误 | OpenAPI 错误目录生成 ErrorCatalog，HTTP/presenter/桌面复用，支持 fields、request_id | 业务错误仍由服务手写映射；INVALID_CREDENTIALS 与 AUTH_REQUIRED 区分密码错误/会话失效 |
| 日志 | 共享 slog 等级/JSON或text，Web 请求路由模板/状态/耗时，CLI日志 stderr | 不打印请求值/凭据/原始 query；外部日志平台后续接入 |
| DB 初始化与迁移 | database/sql + Repository、池/Ping、分方言嵌入 SQL/checksum；framework=1、platform=12、独立 business=2 | [ADR-0003](../adr/ADR-0003-m2-install-storage-identity.md) 决定不用 GORM；单机/桌面不装配平台迁移，CLI 无数据库，不叠加 AutoMigrate |
| 自动 API 文档 | 同源生成 Go/TS DTO、typed operation、约束、错误和离线 HTML；可选 /docs/api、/openapi.json；真实 Chi 路由覆盖检查 | 当前 operation 数以生成 API 索引为准；handler/业务授权手写；文档默认关闭，非交互调试控制台 |
| 健康与观测 | live/ready、独立 DB 超时、可选回环 /metrics：请求数/活动数/耗时与 DB 池 | 指标使用低基数模板；未实现 OpenTelemetry tracing、远程采集/告警部署 |
| API Client | 生成操作驱动请求、CSRF/Cookie、20秒超时/取消、字段错误、统一失效、旧请求 epoch 拒绝 | 浏览器 OIDC callback 走导航；Wails 只暴露适用接口 |
| 会话与守卫 | useSession + SessionBoundary、身份代际 cache/局部状态清空、多标签页同步、可见时复核、集中权限判断 | 服务端撤销在下个请求或恢复可见时发现；没有推送通道 |
| 路由 | 集中 routes 元数据、完整 PageContent 渲染表、未知路径页；兼容账号链接/OIDC fragment | 沿用支持 Wails 的 hash 路由，服务端安装/后台入口保持原职责 |
| 状态管理 | Query 管服务器状态、useState 管局部状态、queries.ts 管 mutation 资源刷新 | 暂无额外全局业务 store 的需求；会话边界独立处理身份变化 |
| 样式与品牌 | 全局 tokens/identity 生成 UI、邮件、Web/native 图标；API 文档复用同一浅深配色/尺度 | 本机 macOS arm64 原生实测；Windows/Linux 原生显示仍需对应机器 |
| 表单与校验 | 公共 Form/Field、HTML约束、契约前置校验、服务端再次校验、字段错误/聚焦、pending；Go/TS 共用边界样例 | 明确受支持 schema 子集；业务不变量仍在服务端，分步/设置表单保留局部编辑逻辑 |
| 唯一契约 | OpenAPI 3.1.0 维护 schema/security/profile/权限/CSRF/响应/错误，CI 检查漂移与路由 | 不引入第二份 Protobuf；非完整 JSON Schema 验证器，不自动生成业务实现 |
| AI 开发内建 | manifest、AGENTS、文档导航、生成上下文、12 个项目 Skills、任务/中断模板；make docs/check:docs 进入质量流程 | Skills 不隐含生产/发布授权，不存个人凭据；历史验收与当前状态分开 |
| 业务/运维与开源入口 | 笔记纵向样板、创建器/doctor、离线加密备份恢复、MIT、贡献/安全/反馈入口、GitHub 开发预览发行 | 三数据库与 MinIO 恢复已实测；正式系统签名和后续发行需凭据及授权，见 [开源维护](../03-runbooks/open-source.md) |
| 系统更新 | GitHub/HTTPS 渠道、内置与缓存日志、Ed25519 清单、Tar/GUI helper 与启动确认/失败回滚；平台仅管理员 | Docker 由宿主机替换镜像，CLI 不装配；DDL 版本人工升级；Apple/Windows 签名流程已接入但无证书实测，见 [更新手册](../03-runbooks/updates.md) |

M3b 品牌上传已完成，见 [需求](../00-product/feature-branding.md) 和 [验收](acceptance-m3b.md)。设置范围见 [规范](../00-product/feature-settings.md)；升级占位已由 [ADR-0018](../adr/ADR-0018-signed-updates.md) 的实际签名 OTA 取代，授权服务仍待接入。正式 Developer ID/公证和 Authenticode 需开发者凭据；公开签名发行需配置 OTA Secret 并获发布授权。详见 [PRD](../00-product/PRD.md)；各轮实测范围以对应验收为准，其他 OS 原生窗口仍未本机验证。

## 上轮原生品牌与排空修正（146e75f）

影响：Web 两 profile 的启动/退出；桌面的构建身份与图标校验。无 API/DTO、数据库 schema 或实例设置变更，不触发迁移。

`internal/lifecycle.ServeHTTP` 等待 Shutdown 完成后才允许组合根释放 worker/DB。5 秒到期关闭连接并返回错误；handler 必须响应 context，不能承诺强制结束忽略取消的 goroutine。监听成功后才记录 server.start；错误返回 main 后才 os.Exit，确保 run 内 defer 执行。真实回环测试证明在途请求完成后才返回、截止时间会取消请求、监听错误不会丢失。

原生调查：修改前包内 ICNS 与 Finder 简介已经显示紫色 U；因此没有证据认定用户所见默认图标一定来自系统缓存，也未清理系统缓存或更改 Dock 固定项。确认的缺口是缺少 Info.dev.plist、保留 com.wails 应用标识，以及缺少直接 Wails 构建前的品牌准备与构建后的图标校验。

本次将稳定 bundle ID 集中于 `assets/brand/identity.json`（vip.ebox.unicore，开发版加 .dev），同步生成生产/开发 plist；开发版保留 localhost 网络权限。Wails preBuildHook 在原生构建前生成品牌资源，make 和 CI 都检查输入；macOS 还检查打包后的名称、bundle ID、可执行文件、5 个 ICNS 分辨率及 1024 图像解码后的品牌像素。桌面数据目录仍由原有组合根定位 `Unicore/desktop`，不依赖 bundle ID。

已从空 `build/desktop` 目录重建。macOS arm64 真实 Wails 用例返回 61 字符/9 词/3 行，系统 About 和 Finder 简介显示 Unicore 图标。证据见 [原生用例](evidence-foundations/native-core.png)、[系统 About](evidence-foundations/system-about.png)、[Finder 图标](evidence-foundations/finder-icon.png)。本次没有直接取得 Dock 图标截图；该结果不代表其他 OS 原生显示已实测，也不能证明另一路径的旧应用包已经更新。

## 上轮验证记录

- `make test`：设计/契约/作者/边界、go vet、Go race、TS 与 7 个 Vitest 均通过；新增 3 个生命周期测试。
- `make build-web build-cli`、空目录 `make build-desktop` 和 `pnpm check:native --bundle` 通过；产物未签发为正式发行包。
- 本次未改 SQL；SQLite 测试随 make test 执行；PostgreSQL/MySQL 的既有真实测试证据见 [M3a](acceptance-m3a.md)，本次未重新启动外部方言测试。
- `pnpm test:e2e`：16 项全部通过，PC/375px 覆盖安装、平台/单机、账号邮件（隔离 SMTP sink）、用户/角色、OIDC、三态主题及真实 Go 调用；没有重复发送真实 QQ 邮件。沿用逐页浅深主题截图，系统跟随场景另有检查。
- 真实 server 两次启动同一临时数据目录，live 200，SIGTERM 退出码 0，重启成功，验证组合根释放进程锁。
- 原生开发模式实际启动，进程身份 vip.ebox.unicore.dev；`pnpm check:native --bundle --dev` 通过。开发版窗口未取得新的 UI 截图：界面工具对同一路径仍解析到生产标识，重新登记单个 app 与重置工具后仍不匹配；没有因此宣称开发版 Dock 已实测。已停止该开发进程，最终恢复生产构建。

2026-10-27 交付补齐：VERSION 单源生成投影、Changelog 准备、目标化归档、Docker/Compose 入口，以及 Tar+Nginx/Docker/Compose 的隔离首次安装与同版本替换实测，见 [部署验收](acceptance-deployment.md) 和 [发版流程](../03-runbooks/release.md)。这不包含正式签名、自动 OTA 或跨版本回滚。

2026-10-27 权限收敛：仅管理员/普通用户两角色，全部管理菜单、页面及 API 仅管理员；平台外观只存当前客户端，历史 grant 不授权。当前规则及迁移/页面证据见 [权限需求](../00-product/feature-roles.md) 与 [验收](acceptance-permissions.md)，取代历史 M2d 角色编辑方案。

管理员/普通用户的独立身份、弹窗新增、固定侧栏、邮件/日志分工和头像改密退出以 [ADR-0014](../adr/ADR-0014-separate-identities-management.md) 与 [管理验收](acceptance-management.md) 为当前基线；历史角色升降描述不再适用。

对象存储增量：平台新增 blob/files/filesql 分层、本地默认与 MinIO/S3/OSS/COS adapter、文件元数据、直传和临时访问、迁移与清理，品牌也通过 blob port；见 [需求](../00-product/feature-storage.md)、[ADR-0015](../adr/ADR-0015-file-storage.md) 和 [运行手册](../03-runbooks/storage.md)。真实云端验收以 MinIO 开发环境为限。

当前开发基座已补源码创建/环境自检、开发依赖、持久化笔记样板、独立业务迁移、MIT 与候选发布流程；离线备份恢复已实现。最新验证及未测事项见 [开发基座验收](acceptance-developer-kit.md)，不将旧阶段测试计数当作当前覆盖。

公告及实体规范当前能力见 [本轮验收](acceptance-announcements.md)，历史报告保留其当时 schema 记录。

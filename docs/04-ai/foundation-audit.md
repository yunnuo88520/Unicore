<!-- Author: yunnuo <ymz@ebox.vip> -->
# 基础能力审计与原生品牌修正（2026-10-26）

结论：当前 M3a 已有可运行的跨形态业务闭环，基础设施尚未全部收尾。本表按实际代码判定，不以引入某个库或已有一个业务页面作为完成标准。审计基线为 33183b0；本次另外修复 HTTP 退出顺序及原生品牌打包缺口。

| 用户提出的能力 | 当前状态与证据 | 尚需完成 |
| --- | --- | --- |
| 应用生命周期与配置 | 部分。`cmd/server/main.go`、`internal/install` 已有 flag/env、密文持久配置、profile 固定、进程锁、超时、信号和邮件 worker；本次修复 HTTP 排空前提前释放资源的问题 | 提取跨入口配置加载/校验约定、配置优先级测试、组件启动失败/退出错误的统一编排；当前 grace 为固定 5 秒 |
| 统一响应与错误处理 | 基础已有。`adapter/presenter/response.go`、`adapter/http/web.go`、Wails bridge 使用 code/message/data/request_id；404/405 和 panic 有 JSON 处理 | 错误映射分散；尚无统一错误目录、字段错误模型及前后端一体的验证映射 |
| 日志 | 基础已有。Web JSON slog、request_id、method、耗时，安全审计持久化；本次将启动错误也纳入 JSON logger | HTTP 状态码/路由模板、可配置日志级别与输出、各 profile 一致的日志入口；无 metrics/tracing |
| GORM 初始化与迁移 | **未使用 GORM**。依据 [ADR-0003](../adr/ADR-0003-m2-install-storage-identity.md)，已有 database/sql + 薄 Repository、连接池/Ping、三方言嵌入 SQL、连续版本和 checksum | SQL 方案已经承担初始化与迁移；若改为 GORM 应单独评估并更新 ADR，不应叠加 AutoMigrate 形成第二套 schema 来源 |
| API 文档自动生成 | 部分。`packages/contracts/openapi.json` → `scripts/generate-contracts.mjs` → Go/TS DTO；CI 检查生成漂移 | 没有发布 OpenAPI 文件的端点和 Swagger/Redoc 文档页，也没有 SDK 方法或 handler 生成、路由覆盖检查 |
| 健康检查与可观测性 | live/ready 已有，ready 检查安装及 DB Ping，另有请求 ID 与审计 | DB 探测独立超时/监控访问约定、metrics 入口及指标；OpenTelemetry 可选，当前未实现 tracing |
| 前端统一 API Client | 已有 AppClient / WebClient / HttpTransport / WailsTransport、AppError、cookie/CSRF 和 20 秒超时；页面不直接 fetch | 统一 401/会话失效通知、调用方取消和字段错误约定 |
| 认证状态与路由守卫 | 部分。bootstrap 用户/权限、登录页及页面权限守卫已有；服务端独立执行 RBAC/CSRF | 缺专用会话状态机、统一失效跳转、退出/换账号清理 Query cache、多标签页失效同步 |
| 路由 | 部分。共享 hash 导航支持 Web/Wails，服务器处理安装/后台入口 | Page union、hash 监听及条件渲染集中在 App.tsx；缺路由注册表、未知路由页面、可测试的路由/权限元数据 |
| 状态管理 | TanStack Query 管理服务端状态、useState 管理局部状态，主题偏好持久化；[ADR-0002](../adr/ADR-0002-contract-and-ui.md) 未要求当前阶段引入 Zustand | 按身份隔离和清理缓存，统一 mutation 成功后的刷新规则；缺库本身不代表功能缺失 |
| 样式与主题基座 | 已有。`assets/theme/tokens.json`、品牌 `identity.json`、共享语义 CSS/组件、三态主题、响应式、邮件/原生资源生成和漂移检查 | 新增页面仍需验证；Windows/Linux 原生显示未在本机实测 |
| 表单与校验约定 | 部分。已有语义 form、HTML required/pattern/minLength 和服务端校验 | 各表单重复 useState/useMutation；缺公共字段组件/验证器、字段错误/聚焦约定和契约约束同步 |
| OpenAPI 或 Protobuf 唯一契约 | **DTO 已以 OpenAPI 为唯一源**，HTTP/Wails 共用；不需要再引入第二份 Protobuf | securitySchemes/错误与约束元数据、路由/SDK 与契约完整性检查、运行时校验仍未闭合；不能称“所有接口自动生成” |

后续基础收尾顺序与验收条件：

1. 会话状态与 API Client：服务端撤销会话后，下一个受保护请求能统一退回登录；旧用户数据清空；换账号及多标签页场景有真实页面测试。
2. 契约与文档：同一 OpenAPI 生成/发布文档；CI 检测所有已装配 API 与 operation 不匹配、缺权限/响应声明；文档资产离线可用。
3. 路由与表单：集中注册路径/权限/页面，未知路径有明确结果；统一字段校验、提交状态和服务端字段错误，Web/Wails 及 375px 实测。
4. 配置与可观测性：明确加载优先级与有效配置的脱敏查询；请求状态/路由日志、bounded readiness 与指标入口，测试不记录输入/凭据。
5. 错误目录与生命周期扩展：业务/传输错误共用目录，组件启动失败能逆序释放；各 profile 具备对应的启动/退出测试。

## 本次实际修正

影响：Web 两 profile 的启动/退出；桌面的构建身份与图标校验。无 API/DTO、数据库 schema 或实例设置变更，不触发迁移。

`internal/lifecycle.ServeHTTP` 等待 Shutdown 完成后才允许组合根释放 worker/DB。5 秒到期关闭连接并返回错误；handler 必须响应 context，不能承诺强制结束忽略取消的 goroutine。监听成功后才记录 server.start；错误返回 main 后才 os.Exit，确保 run 内 defer 执行。真实回环测试证明在途请求完成后才返回、截止时间会取消请求、监听错误不会丢失。

原生调查：修改前包内 ICNS 与 Finder 简介已经显示紫色 U；因此没有证据认定用户所见默认图标一定来自系统缓存，也未清理系统缓存或更改 Dock 固定项。确认的缺口是缺少 Info.dev.plist、保留 com.wails 应用标识，以及缺少直接 Wails 构建前的品牌准备与构建后的图标校验。

本次将稳定 bundle ID 集中于 `assets/brand/identity.json`（vip.ebox.unicore，开发版加 .dev），同步生成生产/开发 plist；开发版保留 localhost 网络权限。Wails preBuildHook 在原生构建前生成品牌资源，make 和 CI 都检查输入；macOS 还检查打包后的名称、bundle ID、可执行文件、5 个 ICNS 分辨率及 1024 图像解码后的品牌像素。桌面数据目录仍由原有组合根定位 `Unicore/desktop`，不依赖 bundle ID。

已从空 `build/desktop` 目录重建。macOS arm64 真实 Wails 用例返回 61 字符/9 词/3 行，系统 About 和 Finder 简介显示 Unicore 图标。证据见 [原生用例](evidence-foundations/native-core.png)、[系统 About](evidence-foundations/system-about.png)、[Finder 图标](evidence-foundations/finder-icon.png)。本次没有直接取得 Dock 图标截图；该结果不代表其他 OS 原生显示已实测，也不能证明另一路径的旧应用包已经更新。

## 验证记录

- `make test`：设计/契约/作者/边界、go vet、Go race、TS 与 7 个 Vitest 均通过；新增 3 个生命周期测试。
- `make build-web build-cli`、空目录 `make build-desktop` 和 `pnpm check:native --bundle` 通过；产物未签发为正式发行包。
- 本次未改 SQL；SQLite 测试随 make test 执行；PostgreSQL/MySQL 的既有真实测试证据见 [M3a](acceptance-m3a.md)，本次未重新启动外部方言测试。
- `pnpm test:e2e`：16 项全部通过，PC/375px 覆盖安装、平台/单机、账号邮件（隔离 SMTP sink）、用户/角色、OIDC、三态主题及真实 Go 调用；没有重复发送真实 QQ 邮件。沿用逐页浅深主题截图，系统跟随场景另有检查。
- 真实 server 两次启动同一临时数据目录，live 200，SIGTERM 退出码 0，重启成功，验证组合根释放进程锁。
- 原生开发模式实际启动，进程身份 vip.ebox.unicore.dev；`pnpm check:native --bundle --dev` 通过。开发版窗口未取得新的 UI 截图：界面工具对同一路径仍解析到生产标识，重新登记单个 app 与重置工具后仍不匹配；没有因此宣称开发版 Dock 已实测。已停止该开发进程，最终恢复生产构建。

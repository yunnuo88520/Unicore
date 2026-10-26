<!-- Author: yunnuo <ymz@ebox.vip> -->
# AI 开发基座验收（2026-10-26）

基线：146e75f。本轮补齐基础能力审计中的会话/缓存、路由/表单、契约文档/校验、运行配置/日志/指标，以及用户要求的项目内文档与 Skills。当前范围见 [审计](foundation-audit.md)，设计决策见 [ADR-0008](../adr/ADR-0008-ai-foundations.md)。

| Profile | 本轮影响 |
| --- | --- |
| web-platform | 会话失效/多标签页/换账号隔离、路由/表单、契约驱动请求/字段错误、配置/日志/指标/文档端点 |
| web-standalone | 共享路由/表单/SDK、配置/日志/指标/文档；不装配平台身份 |
| desktop | 同一 React 基座，结构化日志、Wails 返回后的存储清理；保持本地 SQLite/无 HTTP 服务 |
| cli | 共用日志选项，stderr 与业务 stdout 隔离；继续直接调用 Core，无 HTTP/SQL/Wails/平台依赖 |

OpenAPI 3.1.0 仍是唯一契约源，现有 47 个 operation、68 个 schema。生成模型、typed operation 描述、支持子集的约束、错误目录与离线文档。真实 Chi 路由与契约互检，服务端继续独立鉴权。字段错误为可选扩展；INVALID_CREDENTIALS 表示错误密码，AUTH_REQUIRED 表示未登录/会话失效，避免 OIDC 本地密码确认失败清掉正常会话。未知 hash 明确显示未找到；保留邮件和 OIDC 回调 fragment。

framework.manifest.json、AGENTS、docs/README、context.gen.md、开发工作流/任务交接模板成为框架开发入口。原 8 个 Skills 增加 add-api-operation、app-lifecycle、maintain-framework-docs，共 11 个；add-react-page 同步新基座。`make docs` 可从仓库自身生成上下文/契约文档，`make test` 检查链接、命令、Skill 清单及生成漂移，不依赖个人全局 Skill。

未增加数据库表或修改迁移 checksum；继续使用 ADR-0003 的 database/sql + Repository + 分方言嵌入 SQL。无个人 SMTP 凭据、真实实例数据或邮件进入提交；本轮邮件回归只使用隔离 SMTP sink。

## 实际验证

- `make test` 通过：文档/设计/契约/作者/依赖边界、go vet、Go race、TS 与 28 个 Vitest。Go/TS 共用 12 个校验边界样例；SDK 验证旧请求拒绝、仅一次会话失效通知、取消、字段错误和密码确认失败保留会话。公共表单验证阻止无效提交、pending、字段聚焦与无障碍关联。
- 全部 20 个 Playwright 用例通过，真实 Go 后端、PC/375px；覆盖原有安装/平台/单机/邮件/用户/角色/OIDC，新增跨标签页退出、换账号清除私有 UI、服务端撤销后无刷新退回登录、恢复可见发现浏览器回调登录、字段错误聚焦、未知路由与 API 文档。截图检查浅/深，无横向溢出；系统主题在工作空间、账号页及 API 文档另行验证。
- `make build-web build-cli` 与 `make build-desktop` 通过。macOS arm64 真实 Wails 调用返回 61 字符/9 词/3 行；实际切换浅/深/系统及约 375px 窄窗口，无 Web 身份界面。系统 About 显示 Unicore 紫色 U，打包校验确认 vip.ebox.unicore、名称/可执行文件与 5 个 ICNS 分辨率品牌像素。
- 真实 server 隔离目录测试：监控端口占用导致启动失败后，释放端口可立即用同目录重启；同目录两次启动/正常 SIGTERM 退出 0；live 200，安装前 ready 503，安装后 ready 200；离线文档 200，独立 metrics 包含 HTTP/DB 池指标，监控 listener 的业务 API 返回 404。CLI 在 text/debug 日志配置下 stdout 仍可直接解析为业务 JSON。
- 11 个 Skills 均通过 skill-creator 的 quick_validate；项目自身的 `pnpm check:docs` 验证入口、相对链接、命令、目录与生成内容一致。

## 可复查证据

| 场景 | 截图 |
| --- | --- |
| 自动接口文档 | [PC 浅色首屏](evidence-ai-foundations/chromium-light-foundation-api-reference.png)、[375px 深色首屏](evidence-ai-foundations/mobile-dark-foundation-api-reference.png) |
| 字段校验与聚焦 | [375px 表单错误](evidence-ai-foundations/mobile-light-foundation-field-error.png) |
| 账号隔离/失效/未知页面 | [换账号守卫](evidence-ai-foundations/chromium-light-foundation-account-guard.png)、[失效登录](evidence-ai-foundations/mobile-dark-foundation-session-expired.png)、[未找到](evidence-ai-foundations/mobile-dark-foundation-not-found.png) |
| 原生共享用例 | [Wails 工作台](evidence-ai-foundations/native-core.png)、[真实结果](evidence-ai-foundations/native-result.png) |
| 原生主题/窄窗口 | [浅色](evidence-ai-foundations/native-light.png)、[深色](evidence-ai-foundations/native-dark.png)、[窄窗口](evidence-ai-foundations/native-small.png) |
| 系统原生品牌 | [About 图标](evidence-ai-foundations/native-about.png) |

完整浏览器截图保存在本地 build/acceptance/m3a（沿用现有目录，不代表改写旧 M3a 验收）；仓库只保留本轮代表性证据。API 文档截图裁切为首屏，原始全页截图仍在 build 中。

## 未验证与后续

本轮未重跑 PostgreSQL/MySQL 外部数据库测试，已有三方言历史证据仍有效但不代表本次实测；未在 Windows/Linux 运行原生 GUI。API 文档为离线参考，非交互调试控制台；校验解释器支持明确子集，不是完整 JSON Schema 实现。没有 OpenTelemetry tracing、远程采集/告警部署或即时会话推送；撤销通过下个请求/恢复可见发现。

M3 品牌上传等后续、M4 备份恢复、授权、受控升级、正式签名发行仍未完成；不把当前开发预览声明为生产发行。本轮只提交到本地，不对外推送或发布。

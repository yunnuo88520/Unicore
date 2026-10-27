<!-- Author: yunnuo <ymz@ebox.vip> -->
# 安装体验与持久化验收（2026-10-27）

本轮修正结构化数据库安装、凭据换新、自动 origin 与重启边界。当前需求见 [安装规范](../00-product/feature-installation.md)，设计见 [ADR-0013](../adr/ADR-0013-installation-experience.md)。

| profile | 影响 | 验收 |
| --- | --- | --- |
| web-platform | MySQL 默认、三数据库安装与管理员持久化 | 真实三方言 + PC/375px + 进程重启 |
| web-standalone | 相同连接/凭据/清空/恢复，无管理员 | 原单机页面回归及部署验收 |
| desktop | 不装配安装页面，保留本地 SQLite | 共用 UI 构建与依赖边界检查 |
| cli | 无安装/SQL/HTTP/Wails | 依赖图与 CLI 构建 |

## 三数据库真实验证

`TestDatabaseFieldsResetAndRestart` 在独立 SQLite、MySQL 8.0、PostgreSQL 15 全部通过。MySQL/PG 使用本任务独立容器和随机端口，测试密码含冒号、@、斜杠、空格、百分号和 #，经结构化字段可正确连接。测试创建父/子外键表和视图、插入数据；连接检查不修改它们，无 token、无确认或错误库名均不能清空。精确确认后安装成功，旧对象被移除，新管理员和站点设置生成；保存文件不含明文密码。

每种数据库连续 Close/Open 两次，管理员 ID 和已修改站点设置保持。新实例指向已有 Unicore 库时即使带清空确认也被拒绝。额外覆盖 PostgreSQL 非 public 用户 schema（包括 pgx_ 前缀）拒绝、系统/维护库拒绝、字段与 DSN 混传拒绝、TLS 远程证书校验配置、特殊字符密码往返。

`TestRotateInstallationCredential` 覆盖无效当前值拒绝、旧凭据失效、新值写入受限文件并在重启后有效、Status 不泄露、安装后不能换新。`TestMissingInstalledDatabaseNeverReinstalls` 分别删除隔离已安装 SQLite 文件、安装表、安装标记后均启动失败，不重建管理员。

没有新增 schema 迁移，没有修改历史 checksum。新字段只改变首次输入，保存格式仍为原加密 DSN；已有实例不需要重装。清空属于不可逆首次初始化，MySQL DDL 可能部分完成，失败要重新确认；恢复依赖安装前数据库原生备份，未提供自动备份工具。

## 页面验证

`pnpm test:e2e` **34/34 通过**，包含新增三数据库 × 电脑/375px 共 6 项真实安装测试，没有跳过外部数据库。两端均检查 MySQL 默认字段、切换 PostgreSQL 默认值、错误密码连接失败、必须测试成功、已存在数据的数量/备份勾选/精确库名、完成安装、自动当前 origin、两次真实 server 进程重启、同一管理员 ID/站点名、安装页重定向、已安装 API 409。token 和数据库密码不在 localStorage。

原有 28 项账号/邮件 sink、OIDC、管理员/普通用户权限、设置/品牌、主题和 Core 页面回归通过。本轮没有发送真实邮件。

| 页面 | 证据 |
| --- | --- |
| 375px 凭据说明与生成按钮 | [截图](evidence-install/credentials-mobile.png) |
| 电脑 MySQL 连接字段与清空确认 | [截图](evidence-install/mysql-desktop.png) |
| 375px PostgreSQL 字段与清空确认 | [截图](evidence-install/postgres-mobile.png) |
| 375px SQLite 测试连接 | [截图](evidence-install/sqlite-mobile.png) |
| PostgreSQL 重启后原实例工作台 | [截图](evidence-install/restarted-desktop.png) |

截图已人工检查：全套品牌一致、字段/确认信息可读、按钮完整，页面无横向溢出。小屏字段单列，危险操作独立提示。其他运行截图位于 build/acceptance/install/。

## 实现入口

| 责任 | 文件 |
| --- | --- |
| 唯一契约与 SDK | packages/contracts/openapi.json、生成 Go/TS/离线文档、packages/sdk/src/index.ts |
| 连接字段与范围 | internal/adapter/storage/webdb/config.go、sqlstore/inspect.go |
| 明确清空 | internal/adapter/storage/sqlstore/reset.go、internal/install/manager.go |
| 凭据换新与持久恢复 | internal/install/manager.go、internal/adapter/http/web.go |
| 共用安装页 | packages/web-ui/src/install-page.tsx、web-flows.tsx、flows.css |
| 回归与重启 fixture | internal/install/database_test.go、webdb/config_test.go、tests/e2e/install.spec.ts、fixtures.ts、platform.spec.ts、scripts/test-deployment.mjs |
| 规范与 AI 约定 | PRD/架构/契约/部署/Changelog、ADR-0013、framework.manifest.json、db-migration/security-review Skills |

## 质量、构建与部署

- `make docs` → `make test` 通过：文档/契约/主题/作者/依赖检查、Go vet/race、TypeScript、29 项 Vitest。随后补充的缺失数据库/表/标记三个分支经 `go test -race ./internal/install -run TestMissingInstalledDatabaseNeverReinstalls` 通过。
- `make build-all` 通过：Web、CLI 和真实 macOS arm64 Wails。CLI 实际 execute 输出正确；原生包 vip.ebox.unicore 及五档 ICNS 品牌像素校验通过。桌面没有安装页，本轮不声称重新人工验证了所有原生页面。
- `make package RELEASE_TARGETS=linux/arm64 RELEASE_PROFILES=web-platform,web-standalone` 成功，生成两种 tar.gz、checksum 和 manifest；完整 Dockerfile 从源码构建本地镜像成功。
- `make test-deploy` 四场景通过：tar-platform + Nginx、tar-standalone + Nginx、Docker、实际 Compose；首次安装、ready、API/静态资源、重启、容器替换、设置/品牌/密钥保持及平台两角色权限均通过，见 [机器结果](evidence-install/deployment-results.json)。这些部署组合显式选择 SQLite；MySQL/PG 的本轮真实安装和重启测试见上文。
- Docker 构建使用 mirror.gcr.io 的 Go 1.26-bookworm / Node 22-bookworm-slim，运行镜像仍为 distroless nonroot，没有绕过 Dockerfile。所有数据库测试限本任务的临时实例；两个数据库容器及其匿名卷在验收后移除。
- 两个更新后的项目 Skills 通过 skill-creator 格式校验，文档导航、manifest 和生成上下文同步。

尚未验证生产数据库/远程证书链、宝塔面板和 Windows/Linux 原生 GUI；部署为本机 Linux arm64，同版本替换不能视作跨版本回滚。没有操作生产部署、对外发布或远程数据库。

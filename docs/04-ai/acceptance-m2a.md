<!-- Author: yunnuo <ymz@ebox.vip> -->
# M2a 验收报告

日期：2026-10-26（Asia/Shanghai） · 版本：0.1.0 开发预览 · 作者：yunnuo / ymz@ebox.vip

## 需求与影响矩阵

本增量承接 M1，交付 M2 的第一条完整链路：安装、数据库、平台身份与持久化设置。SMTP、注册验证、密码找回和完整角色/权限编辑仍属后续 M2，不将本次结果等同于完整 M2 或 v1 验收。

| 能力 | web-platform | web-standalone | desktop | cli |
| --- | --- | --- | --- | --- |
| 安装 | 一次性安装并创建管理员 | 一次性安装，跳过管理员 | 自动初始化 | 不装配 |
| 数据库 | SQLite/PostgreSQL/MySQL | SQLite/PostgreSQL/MySQL | 仅本地 SQLite | 不依赖 |
| 身份 | 本地 session、验证码、RBAC、用户管理 | 不装配 | 不装配 | 不装配 |
| 设置 | 按后端权限分组 | 本地适用项 | 本地适用项，经 Wails | 不装配 |
| 共享业务 | 登录后执行原 Core | 直接执行原 Core | 经原生 bridge 执行 | 直接执行原 Core |

## 实现与文件

- 安装与密钥：`internal/install`、`internal/secret`、`cmd/server`。私有 token、进程锁、安装状态机、加密 DSN、实例标记与崩溃恢复，安装后固定 profile。
- 持久层：`internal/adapter/storage/{sqlstore,sqlite,webdb,platformsql}`、`migrations/{sqlite,postgres,mysql}`。SQL 薄适配器、嵌入迁移、设置/审计和身份存储。
- 平台：`internal/platform`、`internal/adapter/http/web.go`。Argon2id、哈希 session、验证码/限流、CSRF、逐 API 权限、用户创建/搜索/分页/角色/启停、最后超管保护、真实统计与审计。
- 设置与桌面：`internal/settings`、`internal/bootstrap/local`、`internal/adapter/desktop`、`cmd/desktop`。SettingDefinition 校验、持久化与 profile 范围；桌面不导入身份或外部数据库驱动，生成绑定不触及真实用户目录。
- 前端与契约：OpenAPI 及生成 Go/TS、SDK 双 transport、`packages/web-ui/src/web-flows.tsx`。安装向导、登录、仪表盘、用户管理、设置，适配 375px 与三态主题。
- 部署与协作：Docker 数据卷/systemd 写目录、CI 数据库 services、发行 manifest、项目 Skills；PRD、架构、部署手册、[ADR-0003](../adr/ADR-0003-m2-install-storage-identity.md) 和 [API 权限清单](../api/permissions.md) 同步更新。

## 迁移与恢复

framework 迁移为 `0001`，平台额外执行 `0002`；单机和桌面不创建身份表。SQLite/PostgreSQL 迁移使用事务；MySQL DDL 幂等，仅在整次成功后记录版本。已应用迁移受 checksum 约束，不提供自动降级或删除数据。

首次安装只接受独占空库。检查空库后先保存 schema ownership，才能开始迁移；非本实例的非空库或安装标记会被拒绝，失败重试也不能绕过检查。管理员/默认设置与唯一安装标记同事务提交，重启凭 DB 标记恢复，避免重复创建管理员。安装 profile 与实例不匹配时拒绝接管。

必须成套保留数据库、`installation.json` 与原加密密钥。密钥丢失无法解密已有配置；M2a 没有自动备份恢复工具。M1 没有持久 schema，首次升级到本增量需要初始化。

## 实测结果

环境：macOS darwin/arm64、Go 1.26.0、Node 22.21.1、pnpm 11.25.0、Wails 2.12.0、Docker 29.2.0。

| 检查 | 结果与边界 |
| --- | --- |
| `make test` | 通过：契约生成一致、作者、5 项依赖边界、go vet、Go race、TypeScript、Vitest 7/7 |
| 安装与恢复 | token/重放/并发、外部非空库及重试拒绝、失败 schema 恢复、重启、profile 固定测试通过 |
| 身份与权限 | 密码哈希、验证码一次性与限流、401/403、CSRF/来源、最后超管、后台路径、角色/禁用使旧 session 失效、退出测试通过 |
| 设置/桌面/密钥 | 类型与范围、重启持久化、SQLite 无身份表、进程锁、密文/错误密钥行为测试通过；bridge 最后错误映射调整后定向测试通过 |
| 三数据库 | SQLite、隔离 PostgreSQL 15 与 MySQL 8.0 实例均实际运行迁移/平台仓储测试，包含表目录检查；测试容器已清理 |
| `pnpm test:e2e` | 8/8 通过：Chrome 与 375×812；平台安装、用户创建、持久设置、退出/验证码登录；单机无身份与重载；共享业务、主题、移动导航、无页面横向溢出、未知 API JSON 404 |
| `make build-all` | Web 内嵌前端、CLI、本机原生 Wails .app 构建通过；最终 bridge 修改后另重建桌面 |
| 原生桌面 | 实际启动 macOS arm64 .app，验证 M2a/Wails、自动 SQLite、实例设置读取、无安装/登录和平台设置；真实用户数据未作测试修改 |
| `make release` | 10 个预览归档构建通过：两种 Web × Linux amd64/arm64；CLI × Linux/macOS/Windows × amd64/arm64 |
| 发行校验 | 10 个 SHA-256、归档内 manifest 与顶层 metadata 一致；解压 darwin/arm64 CLI 实际执行/version 核对 |
| Skills | 8/8 通过 skill-creator 的 quick_validate.py |
| Docker/CI | Compose 配置解析通过，数据库测试容器运行通过；完整应用镜像构建/运行、远程 GitHub Actions 尚未验证 |

本机命令使用 `GOCACHE=/private/tmp/unicore-go-cache`；E2E 使用 `PLAYWRIGHT_BROWSERS_PATH=/private/tmp/unicore-playwright`。Wails 的系统信息探测在受限沙箱中退出，原生构建已在沙箱外重新执行并完成编译、打包与自签名。外部 DB 测试只连接隔离空库，由显式测试 DSN 启用；未提供 DSN 时跳过的测试不作为方言验证证据。

## 产物与后续

产物为 `build/bin/{server,unicore}`、`build/desktop/bin/unicore.app`、`build/releases/`，均忽略，不提交到 Git。提交前构建的产物 metadata 记录当时基线提交 `8256080`，不代表可按该提交直接复现 M2a；正式发行必须从已提交源码重建并签名。

Web 本地预览为 `http://127.0.0.1:8080/install`，使用忽略的私有 `data/`。bootstrap.token、secret.key、installation.json 不进入版本控制，报告不记录其值。

应用 Docker 构建曾在拉取 node/golang 基础镜像时遇到 Docker Hub 超时，本增量未验证完整镜像。Windows/Linux/macOS Intel GUI 只有 CI 配置，未实际原生运行；其他架构 Web/CLI 只完成交叉编译。尚未验收 SMTP、注册验证/密码找回、OIDC、品牌上传、备份恢复、授权/升级、正式签名、公证、性能与完整可访问性。

下一增量先完成 SMTP 与敏感设置、持久邮件任务及注册验证/找回密码，再推进角色权限编辑与后续 M3/M4。

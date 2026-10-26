<!-- Author: yunnuo <ymz@ebox.vip> -->
# M2b 验收报告

日期：2026-10-26（Asia/Shanghai） · 版本：0.1.0 开发预览 · 作者：yunnuo / ymz@ebox.vip

## 范围与形态

本次完成 M2 的 SMTP 与邮件账号增量，承接 [M2a](acceptance-m2a.md)。完整角色/权限编辑、OIDC、品牌资产、备份恢复与升级仍未交付，不将本增量等同完整 M2/v1。

| 形态 | 本次影响 |
| --- | --- |
| web-platform | SMTP 设置/测试、邮箱验证注册与重发、找回密码、持久邮件任务和状态界面 |
| web-standalone | 共享设置页分组；不增加 SMTP、账号令牌、身份表或邮件任务 |
| desktop | 共用设置页/敏感字段契约兼容；仅显示本地适用项，不导入邮件或身份模块 |
| cli / Core | 业务行为保持，依赖检查增加 SMTP/mailer 禁入约束 |

## 实现与文件

- `internal/settings`：Sensitive 注册、加密/配置状态/保留与清空、SMTP 测试记录与开启流程门槛。
- `internal/platform/accounts.go`：注册/邮件策略、验证码和限流、分用途账号令牌、脱敏申请响应。
- `internal/mailer`、`internal/adapter/mail`：投递 ports、加密载荷、重试调度、TLS/STARTTLS SMTP。
- `internal/adapter/storage/platformsql/accounts.go` 与三方言 `0003_platform_mail.sql`：原子账号/令牌/邮件事务、队列租约、过期/终态清理；现有 session 实现增加密码哈希复核。
- `internal/install`、`cmd/server`、HTTP account adapter：按平台装配、后台 worker、公开账号流程与受权限保护的邮件管理 API。
- OpenAPI、生成 Go/TS、SDK、`account-flows.tsx` / `settings-page.tsx`：策略感知表单、分组设置、敏感值配置状态、脱敏任务列表；修复 hash 链接切换与验证码刷新时序。
- `internal/testutil` 与 Go/浏览器测试：隔离 SMTP sink、TLS 测试证书、三数据库事务测试、PC/375px 端到端验收。
- PRD、架构、部署手册、[权限清单](../api/permissions.md)、[ADR-0004](../adr/ADR-0004-m2-email-accounts.md)、Changelog 与发行 manifest 同步更新。

## 行为与安全边界

注册默认关闭，登录/注册验证码默认开启。SMTP 配置须成功发送真实测试邮件后，才能启用邮箱注册或找回密码；改 SMTP 前先关闭邮件账号流程，更改后重新测试。密钥 AES-GCM 加密，返回 value 为空与 configured；空输入保留，clear:true 显式清空。测试记录绑定凭据随机密文版本，不保存 SMTP 密码的快速哈希。

注册固定 user 角色并创建 pending 用户，邮箱验证后 active；管理员显式启用用户仍是受保护的管理操作。验证令牌 30 分钟、重置令牌 15 分钟，只哈希入令牌表，原始邮件内容加密入队。消费锁内执行，禁止跨用途、过期和重放；重发撤销旧链接，重置撤销全部 session 与账号令牌。创建 session 在同一锁内复核已验证密码哈希，避免旧密码并发登录越过重置。

公开申请不披露账号是否存在；流程采用 IP/邮箱限流和按策略的验证码。新管理 API 沿用 settings:read/write 和 CSRF/Origin，普通用户 403，匿名 401；其他形态 JSON 404。API no-store；token 在 URL fragment 初次捕获后移除，通过 POST 消费，不自动 GET 改状态。

SMTP 支持验证证书的 TLS1.2+ 与强制 STARTTLS，缺少 STARTTLS 即失败，明文仅允许 loopback。队列 60 秒租约、10 秒发送超时、最多 5 次尝试，间隔 10/20/40/80 秒。崩溃恢复为至少一次投递，SMTP 确认与 DB 收尾之间中断可能导致重复邮件；令牌仍只可消费一次。成功/过期/取消/终止清空载荷，终态元信息最多保留 7 天，后台最多展示最近 30 项。

## 迁移与恢复

平台升级增加 account_tokens/mail_jobs，schema level 为 3；framework 形态仍为 1，CLI 为 0。0001/0002 checksum 未改。三方言均验证 M2a schema 升级、重复执行和原账号保持；MySQL 新表 DDL 可重试，SQL 事务内提交令牌与邮件。

升级前停服务并保留 DB、installation.json、原密钥的一致性备份。原密钥丢失不能解密 SMTP 配置/待发邮件。旧 binary 无法处理新流程，降级应先关闭注册/恢复并停止 worker；完整恢复依赖数据库原生备份，不自动 drop 表或回滚 DDL。

## 验证结果

环境延续 M2a：macOS arm64、Go 1.26.0、Node 22.21.1、pnpm 11.25.0、Wails 2.12.0。

| 检查 | 结果 |
| --- | --- |
| `make test` | 通过：契约、作者、5 项真实依赖边界、go vet、Go race、TS、Vitest 7/7 |
| 真实 SMTP | loopback 明文/认证、TLS 与 STARTTLS 成功；拒绝不可信证书、无 STARTTLS 降级、远程明文及标题注入 |
| 设置 | 密钥密文/掩码、空值保留、显式清空、缺少/错误密钥、保存失败、profile 范围、SMTP 未就绪门槛通过 |
| 账号/队列 | 验证码重放、pending 禁登、用途隔离、过期、并发单次消费、重置/旧会话失效、旧密码竞态、退避/5 次终止/载荷清理/租约恢复通过 |
| HTTP 与持久恢复 | 权限/CSRF/Origin/统一申请响应通过；实际关闭并重开数据库、配置与密钥后继续投递，通过定向 race 测试 |
| 三数据库 | SQLite、隔离 PostgreSQL 15、MySQL 8.0 实际运行同组升级/身份/令牌/队列测试，全部通过；临时容器已清理 |
| `make build-all` | Web 内嵌前端、CLI、macOS arm64 原生 Wails 编译/打包/自签名通过；本次未重做原生窗口交互验收 |
| 浏览器 | 10/10 通过：PC 与 375×812，含完整 SMTP 配置、密钥状态、验证注册、邮件恢复、新密码登录和旧会话失效，以及 M2a 全部回归 |
| 视觉检查 | 查看 375px 邮件设置/投递截图，字段、掩码、状态和换行正常；页面宽度断言无横向溢出 |
| 发行预览 | `make release`：10 个跨平台归档；SHA-256、内嵌 manifest、平台迁移级别 3/邮件能力与本机 CLI 运行核对 |

本机缓存使用 `GOCACHE=/private/tmp/unicore-go-cache`、`PLAYWRIGHT_BROWSERS_PATH=/private/tmp/unicore-playwright`。真实 SMTP/浏览器测试和 Wails 构建需要在沙箱外绑定本机端口/探测系统；不连接真实邮件收件人或生产数据库。外部 DB 测试仅由隔离测试 DSN 启用，未提供 DSN 时的跳过不作为三方言验证。

## 未验证事项与产物

邮件测试使用本机 SMTP fixture 与临时测试 CA，未向外部邮件服务商发送邮件；生产凭据、运营商限额、投递率、退信和垃圾邮件判定未验收。没有 SMTP provider webhook、通知模板编辑、分布式 worker、完整角色/权限编辑 UI。应用 Docker 镜像完整构建/运行、远程 CI、其他 OS GUI 原生运行仍未验证；现有 M2a 部署限制继续适用。

产物保存在忽略的 build/bin、build/desktop、build/releases；数据/密钥/安装凭据均不提交。提交前产物 commit 元信息为构建时基线 `281621d`；正式发行应从已提交源码重新构建和签名。本次未上传或对外发布。

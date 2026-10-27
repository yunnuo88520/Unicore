<!-- Author: yunnuo <ymz@ebox.vip> -->
# M2d 验收：业务角色与权限管理

> 历史验收：业务角色现已被固定管理员/普通用户方案取代，当前行为与证据见 [权限验收](acceptance-permissions.md)。

日期：2026-10-26。基于 4f5a553 的增量，仍是 0.1.0 开发预览。本地提交，不推送或发布。

## 需求、影响与文件

| 能力 | web-platform | web-standalone | desktop | CLI |
| --- | --- | --- | --- | --- |
| 业务角色创建、改名、赋权、删除 | 已实现 | 无接口 | 不装配 | 不装配 |
| 用户动态关联业务角色、受限委派 | 已实现 | 不适用 | 不适用 | 不适用 |
| 内置角色/最后超管保护、撤销会话 | 已实现 | 不适用 | 不适用 | 不适用 |
| 共享侧栏独立滚动与主题变量 | 已验证 | 已验证 | 原生冒烟通过 | 不适用 |

实现入口：platform/roles.go 权限目录与策略；platformsql/roles.go 角色事务，repository.go 用户关联复核；HTTP roles.go 与公共 require；roles-page.tsx、web-flows.tsx、App.tsx 及共享 CSS；OpenAPI → 生成模型/SDK；三方言 0005；角色 Go/HTTP/E2E 测试。需求见 [feature-roles](../00-product/feature-roles.md)，决策见 [ADR-0006](../adr/ADR-0006-business-roles.md)。

## 安全与迁移

角色写入同时要求 roles:write 和真实超管关联。内置 super_admin/user 不可改删。users:update、roles:write、settings:write 不可委派；settings:write 包含 SMTP/账号恢复/安全策略，保留给超管，防止借配置间接接管管理员。公共鉴权对这些权限验证超管，测试也模拟意外存量 grant，确认不能绕过。

非超管创建用户只能分配权限集合包含于其当前集合的业务角色/普通用户，不能授予超管。用户/角色写入在安装行锁事务内重新加载操作者权限；角色改名或改权同时撤销关联 session、账号长链接/数字验证码和待发邮件。测试验证降权后旧操作者不能继续创建用户。角色删除必须先解除所有用户关联，分配/删除竞态只允许一方成功，无悬空授权；最后启用超管仍不可降权或禁用。

平台迁移 0005 只追加 roles:read/roles:write 和超管授权，历史 checksum 不变，旧用户/设置/授权保持。真实三数据库验证从已有数据去除 0005 后重新升级及重复执行；新空库 seed 兼容预置权限。单机/桌面只运行 framework 迁移。升级前需停机并成套备份 DB、installation.json 和原密钥，恢复以同一时间点备份为准，不承诺仅降级 binary 即可恢复。

## 验证结果

- make test 通过：设计/图标同步、契约生成、作者头、5 组依赖边界、go vet、Go race、TS、7 项 Vitest。
- SQLite、PostgreSQL 15、MySQL 8 同组测试通过：旧库升级/幂等、内置角色、未知/重复/受保护权限拒绝、受限委派、关联角色删除拒绝、会话与数字码撤销、旧操作者拒绝、并发分配/删除与审计。临时数据库容器均清理。
- make build-all 通过：Web 服务、独立 CLI、macOS arm64 Wails 包；身份模块没有进入桌面/CLI。
- Playwright 12 项全通过，真实 Go 服务/隔离 DB/本机 SMTP sink。包括已有安装/账号/邮件/设置回归和新角色完整流程。新增页面测试覆盖键盘 Space 勾选、只读查看、动态用户角色、无权/越权拒绝、最后超管、删除确认及改权后旧会话 401。单机平台接口仍返回 JSON 404。
- 44 页/状态 × PC/375px × light/dark = 176 张 Web 截图，均检查页面横向溢出。三态主题继续复用全局入口，system 响应由共享主题测试覆盖。长页面截图统一在页首采集，侧栏独立滚动使矮窗口底部菜单可达。
- macOS 原生 Wails 实际冒烟：显示 M2d、工作台/关于正常，导航没有平台用户/角色菜单；保留两张截图。其余未改页面的原生逐页证据延续 [M2c](acceptance-m2c.md)，本次不声称重新执行了全部原生用例。
- make release 生成 10 个本地预览归档，逐一验证 SHA-256、内置 M2d manifest 与迁移级别：platform 5 / standalone 1 / CLI 0。未上传或发布。

新增角色页也纳入 pnpm test:theme：临时只改主色绿色、字号 1.08、圆角 1.2，验证角色编辑器浅深色勾选框与 375px，连同原有页面、Logo/favicon/PNG/邮件一并验证；完成后恢复默认紫色并重建。

完整本机证据：build/acceptance/m2d/{chromium,mobile,native}、evidence.json（每张 SHA-256）；主题替换证据：build/acceptance/theme-proof。隔离数据和构建产物不提交。仓库保留 [PC 角色编辑](evidence-m2d/roles-desktop.png) 与 [375px 深色角色编辑](evidence-m2d/roles-mobile.png)。本增量没有使用个人 SMTP 凭据，也未重复发送真实邮件。

## 尚未完成

当前沿用用户一次一个角色的既有接口，不提供多角色合并编辑。OIDC/绑定策略、品牌上传、备份恢复工具、签名正式发布/在线升级仍待完成；完整 Docker 应用镜像验收、Windows/Linux 原生 UI 与安装包实测仍待完成。交叉构建和数据库容器测试不替代这些运行验收。

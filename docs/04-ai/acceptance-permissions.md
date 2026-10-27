<!-- Author: yunnuo <ymz@ebox.vip> -->
# 固定两角色与设置隔离验收（2026-10-27）

影响 web-platform 的身份、管理 API、共享 React 的平台分支与迁移；web-standalone/desktop 保留本地持久设置，CLI 不装配身份。当前规则见 [角色需求](../00-product/feature-roles.md) 和 [ADR-0012](../adr/ADR-0012-fixed-platform-roles.md)，取代历史 M2d 的自定义角色编辑方案。

## 当前行为与证据

固定管理员/普通用户，用户创建与身份修改只接受两种角色。管理员管理全局实例；普通用户使用 Core、本人账号和当前客户端外观，无管理菜单/页面/API。全局品牌/站点名仍统一显示在所有用户界面，配置读写只对管理员。

- Go 与真实浏览器按 OpenAPI 动态遍历全部 14 个管理 operation：匿名 401，普通用户携带有效 CSRF 仍 403；写操作缺 CSRF 拒绝。普通角色注入全部历史 grant 后仍无管理权限；其他 profile 没有平台路由。
- 管理员角色目录只读，两卡片/权限矩阵，无创建编辑删除；自定义 role 输入 400，已移除的角色写接口 404/405。用户变更在事务内重新验证管理员；最后启用管理员/最后本地密码管理员不可降权或禁用。
- 普通用户直达 #users/#roles/#admin 显示拒绝；实际 /admin 为 403。设置强制 #site?tab=mail 仍只显示本地外观，不启动管理设置或品牌查询。管理员所有设置功能维持原 Tabs/品牌三卡片交互。
- 两个独立浏览器登录同一普通用户：第一个保存深色并刷新保留，无 HTTP 写请求；第二个仍为浅色。管理员修改全局站点名后两个客户端使用统一品牌，原本地主题保留。升为管理员需重新登录；降级后旧管理员 session 被撤销。
- `pnpm test:e2e` 28 项通过：PC 与 375px，包含权限、全局品牌/邮件预览、安装/用户/设置、单机持久化、OIDC、会话多标签与 Core。使用本机 synthetic SMTP/IdP，没有重复发送真实邮件。

| 角色 | PC | 375px |
| --- | --- | --- |
| 管理员只读角色矩阵 | [截图](evidence-permissions/admin-desktop.png) | [截图](evidence-permissions/admin-mobile.png) |
| 普通用户仅本地外观 | [截图](evidence-permissions/member-desktop.png) | [截图](evidence-permissions/member-mobile.png) |

## 部署入口复验

重建 Linux arm64 两种 Web tar 包（平台 manifest.migration_level=7）、完整源码 Dockerfile 镜像后，`make test-deploy` 四场景通过：tar-platform + Nginx、tar-standalone + Nginx、Docker、实际 Compose。各场景完成首次安装、重启与容器替换、品牌/设置/密钥保持及 Core 调用。三个平台部署入口额外逐个校验 14 个管理 API 的匿名 401/普通用户 403、自定义 /manage 对普通用户 403、设置只显示本地外观且保存无服务器写请求。见 [机器结果](evidence-permissions/deployment-results.json)。

本机官方 Docker Hub 鉴权连接被拒；成功构建改用 mirror.gcr.io 的相同 Go 1.26-bookworm/Node 22-bookworm-slim 源，runtime 仍为 gcr.io/distroless/static-debian12:nonroot，未绕过 Dockerfile 的前后端源码构建。没有操作生产部署/宝塔面板；Nginx 为等效真实容器配置。以上是同版本替换，不能作为跨版本回滚或生产外部数据库验收。

## 数据升级

`TestDialectMigrationsAndIdentity` 在隔离 SQLite、PostgreSQL 15、MySQL 8.0 上全部通过，覆盖新空库、旧 0006 数据升级至 0007、重复启动。旧账号用户名/邮箱/密码保持，管理员含混合旧角色时仅保留管理员，自定义角色账号归 user；普通 grant 与平台全局主题删除。会话、旧账号 token、六位挑战及 OIDC flow 全部失效；pending/sending 邮件取消并清空载荷/租约，已发送状态保持。升级后仍可正常执行账号与 OIDC 流程。

迁移仅运行于本任务临时测试库，没有连接现有部署或用户数据。0007 有数据删除，恢复需要停服成套恢复原生一致性数据库、私有目录/配置/密钥与匹配版本；不承诺仅换旧二进制恢复，见 [操作说明](../03-runbooks/deployment.md)。

## 实现入口

| 责任 | 主要文件 |
| --- | --- |
| 固定角色、授权与事务复核 | internal/platform/roles.go、service.go；internal/adapter/storage/platformsql/repository.go、roles.go |
| HTTP 权限与后台入口 | internal/adapter/http/roles.go、web.go、router.go |
| 全局设置和本地外观 | internal/settings/service.go；packages/web-ui/src/routes.ts、App.tsx、settings-page.tsx、roles-page.tsx |
| 契约与生成投影 | packages/contracts/openapi.json、packages/sdk/src/index.ts、生成 Go/TS/离线文档 |
| 数据迁移与交付 | migrations/{sqlite,postgres,mysql}/0007_fixed_roles.sql；sqlstore/store.go、scripts/release.mjs |
| 回归与 AI 约定 | HTTP/SQL 单测、tests/e2e/roles.spec.ts、scripts/test-deployment.mjs；四个项目 Skills、PRD/架构/ADR/部署手册 |

## 质量与构建记录

- `make docs` → `make test` 通过：文档/契约/设计/作者/依赖边界、Go vet/race、TypeScript、29 项 Vitest。
- `make build-web build-cli build-desktop` 通过；最终原生包的 bundle ID、版本与 5 档 ICNS 品牌像素校验通过；CLI 实际执行返回预期分析结果。
- 真实 macOS arm64 Wails 使用隔离数据目录，实例设置只有适用的基础/品牌/外观三个标签，无平台身份菜单。实际保存深色主题成功，退出并重启后仍选中深色；见 [原生截图](evidence-permissions/native-appearance.png)。
- 四个受影响项目 Skills 通过 skill-creator 校验，manifest/生成上下文同步固定角色入口。

未在 Windows/Linux 原生 GUI 上复验；本轮不包含生产部署、公开发版、远程 IdP 或真实邮件投递。

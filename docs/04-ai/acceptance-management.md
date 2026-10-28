<!-- Author: yunnuo <ymz@ebox.vip> -->
# 独立身份与管理界面验收（2026-10-27）

> 本文保留该阶段的验收记录；系统更新、签名流程及其后续验证以 [更新验收](acceptance-updates.md) 为准，早期占位与未实现描述不再代表当前能力。

本轮影响：web-platform 身份/API/迁移与 React 管理页；Web 两模式和 Wails 共用 shell 导航/布局；CLI 仅验证依赖边界。当前规范见 [角色需求](../00-product/feature-roles.md)、[设置需求](../00-product/feature-settings.md)、[ADR-0014](../adr/ADR-0014-separate-identities-management.md)。

实现文件：platformsql/scope.go、password.go、logs.go 和三方言 0008；install/manager 装配独立服务；HTTP 的独立管理员 CRUD、本人密码、系统日志与域 Cookie；OpenAPI/SDK 生成链；React App/routes、modal/password-dialog、用户列表、邮件设置和系统日志；message.tsx/message.css、MutationCache 统一反馈与图标扫描。

本轮仅使用隔离测试数据，不操作生产库。Windows/Linux 原生 GUI 需对应 runner，授权/更新仍是待对接占位，系统日志当前为最近 50 条操作与 30 条投递，不承诺完整检索平台。

## 验证结果

- `make docs`、`make test`：链接/上下文/契约/作者、依赖图、go vet、全量 Go race、TypeScript 和 31 项前端单测通过。
- 三方言真实数据库：SQLite、PostgreSQL 17、MySQL 8.4。空库安装、旧 0006 → 固定两角色 → 0008、重复迁移及管理员复制完成但版本未记录/部分 DDL 后重试均通过；密码/ID/企业绑定保留，旧 session/token/六位码/OIDC 流程撤销，待发邮件清空取消。另验证同用户名/邮箱独立、跨域密码/session/六位码/恢复/企业证明拒绝，旧密码错误、改密撤销当前域且另一域保留，最后管理员保护和残留 grant 不授权。
- 最终 `pnpm test:e2e --workers=4`：36/36，无跳过。PC + 375px，六个真实数据库安装/连续重启、SMTP sink 注册/登录/恢复、独立企业 IdP/管理员禁用 JIT、管理 API 动态 401/403/CSRF、弹窗初始聚焦/Escape/取消/清空草稿/焦点返回、头像改密错误/成功/重登、两个折叠组、720px 固定侧栏、二级缩进/矢量图标和主题均通过。新建独立安装测试库（UNICORE_INSTALL_DATABASE_PREFIX），复验成功/失败消息的顶部位置和 3 秒消失，保存按钮 x/width 不变；单机无账号菜单。未重复发送真实邮件。
- `make build-all`：Web/CLI/macOS arm64 Wails 通过；最终再构建原生，品牌 ICNS 五种尺寸像素检查通过。真实 Wails 独立数据目录运行 Core、基础设置/主题保存、无账号头像、二级图标/折叠菜单和授权占位；退出后重新启动保留深色。最终构建验证浅/深色顶部保存消息可见并自动消失。没有用 HTTP 模拟桌面。
- `make test-features`：四个组合的 Go 文件和前端文本裁剪、features.json 及 PC/375px 占位页通过。关闭时仅保留通用待对接页，真实集成卡片裁掉。
- Linux arm64 两种 Web tar.gz（平台 migration_level=8）与完整源码 Dockerfile 镜像构建通过。`make test-deploy` 四场景通过：Tar 平台/单机 + Nginx、Docker、Compose；验证安装、独立管理员登录、CSRF/管理越权、自定义入口、品牌/设置/密钥、进程重启与容器替换持久化、Core。脚本新增 Nginx 资源就绪等待，避免启动时序偶发断连。源码镜像使用 mirror.gcr.io 的 Go/Node 基础镜像；没有发布/升级生产实例。

| 页面证据 | 文件 |
| --- | --- |
| 管理导航与列表 | [浅色](evidence-management/desktop-light.png)、[深色](evidence-management/desktop-dark.png) |
| 720px 固定侧栏 | [截图](evidence-management/sidebar-720.png) |
| 375px 新增与改密弹窗 | [新增](evidence-management/mobile-create.png)、[改密](evidence-management/mobile-password.png) |
| 顶部保存消息 | [PC](evidence-management/settings-message-pc.png)、[375px](evidence-management/settings-message-mobile.png)、[Wails](evidence-management/native-message.png) |
| Wails 主题保存/重启 | [设置](evidence-management/native-settings.png)、[重启](evidence-management/native-restarted.png) |
| 部署机器结果 | [四场景](evidence-management/deployment-results.json) |

未验证：Windows/Linux 原生 GUI、其他 CPU 的本轮运行、用户真实数据库升级及生产宝塔面板；不将本机 Nginx 等效测试表述为真实生产部署。回滚须按手册停服成套恢复，当前没有备份恢复自动化或真实 OTA。AI Skills 已同步独立身份、弹窗、导航与设置分工并通过技能校验。

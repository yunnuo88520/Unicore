<!-- Author: yunnuo <ymz@ebox.vip> -->
# 管理端、用户端与本地形态验收

需求与决策见 [ADR-0016](../adr/ADR-0016-separate-client-admin-surfaces.md)。

| profile | 变化 | 验收 |
| --- | --- | --- |
| web-platform | 用户/管理员 HTML、API、登录分离；Switch、开放注册、拖拽上传 | Go/SDK 权限回归、PC/375px 全页面与账号流程 |
| web-standalone | 仅业务、本地外观；站点品牌等设置拒绝 | API 404/400、重启、本地主题与页面 |
| desktop | 移除品牌 bridge，全局管理无入口 | 桥接测试、原生构建和真实 Wails |
| cli | 无行为变化 | 依赖隔离、构建 |

文件范围：HTTP authentication/accounts/email/oidc/storage/router；SDK 与 OpenAPI；Web 双入口、共享 App/登录/设置/外观/文件/Switch/CSS；本地 bootstrap/desktop bridge/settings；文档/Skills。无 schema 迁移，不修改历史 checksum；旧本地品牌行/文件保留不读。管理员 callback 与 API 客户端路径是兼容变化，需整体升级前后端及 IdP 白名单。

管理员新建普通用户为 active，回归覆盖用户入口登录、错误域拒绝、伪造身份请求头无效、独立退出。原用户实例的失败未重现；旧入口容易混淆，不能把入口修改宣称为未知密码数据修复。

已完成验证：

- make docs、make test：契约/文档/作者/设计/依赖边界、go vet、Go race、TS typecheck、34 个前端/SDK 测试通过。
- 完整浏览器 38 项通过（Chromium 与 375px）；4 个外部数据库安装用例缺少环境跳过，2 个 MinIO 用例另以真实开发环境运行，均通过。注册/六位码/恢复由隔离 SMTP sink 验证，OIDC 由签名测试 IdP 验证；本轮未向真实 QQ 邮箱重新投递。
- 最终调整后定向复验账号、管理与双入口页面，PC/375px 共 8 项通过；Vite 开发服务器验证 `/login`、默认 `/admin` 与自定义 `/control` 分别返回对应入口。
- MinIO：真实测试读写/CORS、8 MiB 浏览器直传、私有下载和迁移到本地，PC/375px 各一项通过。只清理本轮随机测试前缀，先前用户要求保留的证据对象未触及。
- Web、CLI 和 macOS Wails 构建通过，原生 ICNS 校验通过。真实 Wails 观察到仅概览/Core/外观，无账号头像/管理/品牌/邮件/存储；外观保存成功并可切换，退出重启后保留深色选择，原生桥接 Core 返回实际摘要。
- 证据：build/acceptance/surfaces/ 下 PC/mobile 上传浅深截图、native-appearance-light.png、native-appearance-dark-restart.png、native-core-dark.png；登录/注册/验证码等截图在 build/acceptance/m3a/{project}/{theme}/。原生测试使用独立数据目录。

当前没有 schema 变化，本轮不重复执行外部 MySQL/PostgreSQL 初始化，不修改现有实例。OSS/COS/S3 云环境、Windows/Linux 原生界面和新版生产发布/OTA 未验证；授权升级仍占位。

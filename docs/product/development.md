<!-- Author: yunnuo <ymz@ebox.vip> -->
# 创建自己的应用

本页介绍如何创建独立产品、运行应用，以及定位业务扩展入口。创建后可以先 [裁剪笔记 demo 与可选能力](features.md)，再接入自己的业务；需要练习完整开发流程时，可选做 [笔记标签教程](first-feature.md)。

## 创建项目

先按 [快速开始](index.md#准备环境) 准备工具链，并确认框架源码仓库没有未提交修改。目标目录必须尚不存在，且位于框架仓库之外：

```sh
pnpm create:project --directory ../my-app --name 'My App' --slug my-app --module github.com/team/my-app --bundle com.team.myapp --repository https://github.com/team/my-app --author 'My Team <team@example.com>'
cd ../my-app
make install
make docs
make doctor
make dev-server
```

在第二个终端进入 `my-app` 后执行 `make dev-web`，按 [首次安装](index.md) 完成初始化。MIT 许可允许商用、修改和再分发，需保留版权与许可声明。

### 创建器会生成什么

| 内容 | 结果 |
| --- | --- |
| 产品身份 | 替换名称、Go module、CLI/运维命令、桌面标识、服务与发行名称 |
| 应用作者 | `--author "Team <email>"` 写入 `product.identity.json` 与 `project.provenance.json`；应用自有代码（业务 Go/SQL/md）用该作者头即可通过作者检查，无需框架作者头；缺省保留框架作者 |
| Git 仓库 | 初始化本地 `main`，可选的 `--repository` 配置为 `origin` |
| 框架来源 | 只读 `framework` 远端与 `project.provenance.json` 保存上游来源 |
| 应用更新 | 清空上游 OTA 仓库和公钥，由你配置自己的更新渠道 |

创建器不会创建托管仓库或推送代码。首次推送前先建立自己的远程仓库。需要后续三方合并升级时，请使用带有 `framework-template` 历史的 Git clone，详见 [框架源码升级](framework-upgrade.md)。

Git 来源中选中的文件有未提交修改时，创建器默认拒绝导出。明确需要使用这些改动时，可加 `--allow-dirty`，来源记录会包含修改状态。源码 ZIP 可以创建项目，但缺少模板历史，不能自动同步框架。

## 设置名称、品牌和域名

- `product.identity.json`：产品名称、Go module、命令、桌面与服务标识。修改后执行 `pnpm product:generate`、`pnpm product:check` 和 `pnpm check:residuals`。
- `assets/brand/identity.json`：Logo 和图标来源。
- `assets/theme/tokens.json`：主题令牌。品牌或主题修改后执行 `pnpm design:generate`。

产品身份的投影规则见 [产品身份参考](https://unicore.ebox.vip/02-standards/product-identity)，界面定制见 [设计系统](https://unicore.ebox.vip/02-standards/design-system)。域名在部署时配置 DNS、反向代理和 TLS；安装向导默认使用浏览器实际访问地址。生产配置和实例数据保存在仓库之外。

## 定位业务代码

| 位置 | 用途 |
| --- | --- |
| `internal/domain`、`internal/usecase` | 共享领域规则、用例与 ports |
| `internal/modules/<slug>/` | 自包含业务模块，包含领域、用例、存储和模块描述符 |
| `internal/adapter/http` | HTTP 传输、输入校验和接口装配 |
| `internal/modules/notes/desktop` | 笔记模块的 Wails 桥贡献 |
| `packages/contracts/openapi.json` | API 与 DTO 的源契约 |
| `packages/web-ui/src/modules/` | 共享 React 业务页面 |
| `migrations/catalog.json` | 数据库命名空间、版本与依赖 |

领域层不依赖 HTTP、Wails、SQL 或认证；用例通过 ports 访问外部能力。CLI 直接调用共享 Core，不引入平台身份或数据库。完整示例见 [笔记模块源码导读](https://unicore.ebox.vip/03-runbooks/business-example)，分层规则见 [后端参考](https://unicore.ebox.vip/02-standards/backend)。

## 添加接口、权限和页面

1. 修改 OpenAPI 的 schema、operation、输入输出和 `x-unicore` 访问策略，执行 `pnpm generate` 生成 DTO 与 SDK。
2. 在领域和用例实现业务规则，通过 Repository port 读写数据，再连接 HTTP 或桌面入口。
3. Platform 的服务端检查权限和资源归属；菜单、按钮、API 授权相互独立。账号可持多个角色，用户与管理工作台共用会话。
4. 前端通过 AppClient 调用接口，复用 WorkspaceLayout、表单和消息组件。界面同时提供中英文，运行 `pnpm check:i18n`。

在线接口参考可通过 `APP_API_DOCS=true` 开启 `/api-docs` 和 `/openapi.json`，默认关闭。开发细节见 [API 契约](https://unicore.ebox.vip/02-standards/api-contract)、[权限参考](https://unicore.ebox.vip/api/permissions)、[前端基础](https://unicore.ebox.vip/03-runbooks/frontend-foundations) 和 [UI 组件](ui-components.md)。

## 数据库迁移与文件

数据库变更在自己的业务命名空间内追加迁移，由 Catalog 声明版本和依赖。当前三个图形 profile 均包含 `core`、`platform` 和默认开启的 `module.notes` 命名空间；Standalone 创建相应表不表示装配平台账号或管理能力。CLI 不装配数据库。具体集合以 `migrations/catalog.json` 为准。

框架表保留 `unicore_` 前缀，业务表可自行命名。已交付的迁移 SQL 保持原字节和 checksum；新增版本需提供各适用方言的 SQL、兼容说明及恢复步骤。见 [数据库迁移](https://unicore.ebox.vip/02-standards/database-migrations)。

文件通过 `file_id` 与存储 port 使用，业务不拼磁盘路径或持久保存签名 URL。笔记附件同时支持 Platform 与 Standalone，见 [文件存储](storage.md)。

## 扩展设置、通知与后台任务

模块描述符的 `Settings` 登记实例级业务分组，后台基础设置自动显示双语标签与字段；敏感值、校验、权限和审计复用框架。定义与示例见 [业务设置扩展](configuration.md#开发者扩展业务设置)。Standalone 不提供实例设置页。

Platform 可复用邮件、企业微信群机器人、Webhook 和站内信；Standalone 两载体可复用本地收件箱。模块描述符用 `NotificationTypes` 登记站内类型、`NotificationEvents` 登记站外事件；站外投递由后台 worker 执行，桌面站内消息经 Wails 刷新。业务事务与四类接入示例见 [通知接入](notifications.md)。

后台任务通过 `internal/scheduler` 的代码注册表登记，管理页面只查看、启停和手动触发已注册函数，不执行任意脚本。默认任务包括邮件队列、文件清理和公告时间检查，见 [任务管理](https://unicore.ebox.vip/03-runbooks/admin-tools#定时任务)。

## 验证与跟进框架更新

```sh
make docs
make test
make build-web build-cli
```

页面变更还需检查权限状态、双语和窄屏；桌面变更在目标系统构建并验证原生窗口。数据库变更应使用隔离实例验证适用方言。运行时升级前按 [备份恢复](backup.md) 演练恢复。

新建业务源码可使用 `product.identity.json` 的团队作者配置，框架已有文件保留原作者与许可证。通过 `pnpm framework:check` 检查上游模板，使用 `pnpm framework:sync` 合并更新，流程见 [框架源码升级](framework-upgrade.md)。

## 替换示例业务

笔记与 CLI 文本分析均为参考业务。关闭笔记的构建命令、永久移除源码的入口以及既有实例的数据处理，见 [裁剪示例与可选能力](features.md)。笔记模块的角色配置示例见 [源码导读](https://unicore.ebox.vip/03-runbooks/business-example#角色与权限示例)。

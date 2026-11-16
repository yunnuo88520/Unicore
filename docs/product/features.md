<!-- Author: yunnuo <ymz@ebox.vip> -->
# 裁剪示例与可选能力

Unicore 是开发框架，个人笔记是可选业务 demo。创建自己的产品后，可以先关闭笔记，保留安装、布局、权限、存储等框架能力，再接入自己的业务模块。

## 关闭笔记 demo

在项目根目录构建不含笔记业务的 Web 应用：

```sh
FEATURE_NOTES=false make build-web
```

桌面应用使用相同开关，在目标系统构建：

```sh
FEATURE_NOTES=false make build-desktop
```

开发模式下，前后端都使用同一组开关。两个终端分别执行：

```sh
FEATURE_NOTES=false make dev-server
```

```sh
FEATURE_NOTES=false make dev-web
```

开关在编译时生效，不是管理后台的运行期设置。发布新版本时也应保持同样配置。

### 关闭后会移除什么

| 部分 | 关闭笔记后的行为 |
| --- | --- |
| 业务装配 | 不装配笔记领域、用例和仓储实现 |
| HTTP 与桌面桥 | 不注册笔记 CRUD、附件 API 或 Wails 桥贡献 |
| 界面 | 不生成笔记页面 chunk，不显示笔记导航 |
| 权限 | 不注册笔记模块权限点 |
| 新数据库 | 不执行 `module.notes` 迁移 |
| 既有数据库 | 保留笔记表、数据及迁移账本；重新开启后可继续使用 |
| 契约与 SDK | 保留共享类型与历史迁移文件，已关闭的运行实例不提供对应接口 |

该开关同时适用于 Platform 与 Standalone 两个载体。CLI 始终不装配笔记，当前提供独立的无状态文本分析样板。

关闭 demo 不会卸载平台账号、设置、文件存储或运行监控。需要单用户产品时，选择 Standalone 形态；需要无数据库命令时，使用 CLI。形态选择与业务模块裁剪分别处理。

## 其他构建开关

| 环境变量 | 默认值 | 作用 |
| --- | --- | --- |
| `FEATURE_NOTES` | `true` | 笔记 demo |
| `FEATURE_UPDATER` | `true` | 应用内更新集成 |
| `FEATURE_LICENSE` | `false` | 授权服务预留入口；尚无完整商业授权实现 |

值只接受 `true` 或 `false`，未知的 `FEATURE_*` 名称会使构建失败。Make、Vite 和发行工具读取同一组开关，建议统一使用 Make 构建，避免前后端配置不一致。

例如，生成既不包含笔记、也不包含应用内更新的 Web 包：

```sh
FEATURE_NOTES=false FEATURE_UPDATER=false make package RELEASE_TARGETS=linux/amd64 RELEASE_PROFILES=web-platform
```

OTA 会校验构建特性，不能跨笔记裁剪状态自动更新。调整产品开关时，应人工部署相应完整发行包；涉及既有实例时先 [备份](backup.md)。

## 永久移除示例源码

如果新项目尚未交付，可以进一步删除示例源码。关闭构建开关不会自动删除仓库文件；永久移除需要同步处理以下入口：

1. 从 `internal/module/manifest.json` 和组合根移除笔记模块注册及桥贡献，再删除 `internal/modules/notes`。
2. 从 OpenAPI 移除 Note 相关 schema、CRUD 和附件 operation，执行 `pnpm generate`，清理 SDK 的手写适配。
3. 删除前端笔记模块、路由和导航引用，并同步构建特性声明。
4. 新项目可移除 Catalog 中的 `module.notes` 登记及对应迁移；已经交付的项目应保留历史 SQL 与账本，通过向前迁移处理数据退役。
5. 清理笔记专用测试和发行检查中的引用，执行 `make docs`、`make test` 及目标 profile 构建。

使用代码搜索逐项核对消费者，不要仅删除页面或模块目录。完整业务结构见 [笔记模块源码导读](https://unicore.ebox.vip/03-runbooks/business-example)；接入自己的模块可从 [开发指南](development.md#定位业务代码) 开始。

## 验证裁剪结果

框架提供裁剪回归，检查前后端装配、笔记 API 的 404、两载体页面产物，以及关闭后重新开启的数据保留：

```sh
pnpm test:notes
```

该命令会构建 Web 和桌面前端、运行 Go 与前端测试，使用独立临时 SQLite 数据；不会启动 Wails 原生窗口。发布桌面产品时，还需在目标系统验证原生包。

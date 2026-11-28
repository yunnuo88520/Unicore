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

### 业务导航规划

先根据页面管理的对象归类，再决定由谁操作。订单、工单、客户、产品许可证的使用和管理都属于应用业务。个人使用默认进入用户工作区；跨用户管理、审批、吊销或更改业务规则应按产品需求明确放在管理后台或独立业务工作台，并配置对应业务权限。管理员工作台还承担框架和实例治理。「系统管理」承载系统设置、平台账号与权限、审计、运行监控和框架更新。比如许可应用可以将「许可证管理」和「签发记录」放在独立运营工作台，框架自身的「系统更新」留在系统管理。

内置菜单是框架的默认布局，业务一级目录数量由实际工作流决定。相关业务操作可复用自己的目录，独立业务可以新增一级目录，单页业务也可以直接作为一级入口。规划时分别写明适用 Profile、工作台（用户或管理员）、区域、父级、顺序和权限。

- **Platform**：在模块和前端登记业务页面。新增业务页默认将模块的 `NavigationPage.Surfaces` 设为 `user`。只有需求明确指定某页要在管理员工作台呈现时，才为该页声明 `administrator`，区域仍为业务区。`system`、`administration`、`monitor` 和 `ai` 是框架的治理分组。在「菜单管理」可先建业务区的一级目录，再把已登记的页面放到下面。若应用需要交付默认树，按现有的前后端导航模型维护种子，并验证已有实例的菜单配置可保留。
- **Standalone**：Web 与桌面共享本地业务导航，可在本地默认树组织适用的业务入口。两载体均不装配 Platform 的管理员工作台和菜单编辑器。
- **CLI**：用命令树组织业务，不适用图形菜单规则。

菜单父级和排序只决定入口的组织方式。页面登记的 surfaces 同时约束菜单投影和直接访问，包括超管；旧菜单不能扩大代码登记的范围。启动时修正已持久化页面的失效工作台绑定，保留节点 ID、标签、隐藏/禁用意图及角色/API 授权，不恢复已删除页面。进入页面和调用 API 仍须遵循应用的页面权限、服务端契约和数据归属规则。

### 注册独立业务控制台

超管、运营、代理和客户可以使用不同的工作台：超管沿用管理后台，其余按权限注册多个业务工作台，同一账号可进入多个已授权工作台。角色用于分配权限，不以角色名称硬编码工作台。需要独立首页、导航或外壳的 Platform 应用，可以在用户 Web 入口从 `@unicore/web-ui` 导入 `defineConsoles`，将 `defineConsoles({ id, title, permission, shell, pages })` 的返回值传入 `<Workspace consoles={consoles} />`。例如以 `partner` 注册 `/workspaces/partner`，页面 `orders` 和 `reconciliation` 分别声明自己的权限点。根入口打开当前账号可达的第一个页面；有权限的账号也能从账号菜单进入。外壳通过 `navigation` 与 `children` 渲染独立导航和页面；需要侧栏几何时复用 `WorkspaceLayout`，不自行算偏移。控制台和页面标题和其他 UI 一样提供双语消息。

子路由与详情页由页面自行渲染：`/workspaces/<id>/<page>/<rest…>` 的剩余段经页面 props 的 `path` 传入（如 `/workspaces/partner/orders/42` 使 `path` 为 `['42']`），深链接与刷新天然可用；跳转用 `consolePageHref(consoleId, pageId, …rest)` 构造地址。切换工作台只改变呈现，不改身份与权限并集；每个工作台的查询缓存与页面状态由独立缓存作用域持有，切换后上一工作台的缓存与状态被清空，不跨工作台复用。入口权限（`console.permission`）决定账号能否进入该工作台，页面权限（`page.permission`）决定渲染哪个页面；两者都只是呈现门禁，服务端授权独立生效。

在后端模块登记进入与页面使用的权限点，在角色管理给代理业务员、财务等角色分别授予所需权限；实际请求仍走独立契约 operation 和资源校验。控制台定义不是授权策略，也不改变账号的多角色并集。系统治理仍放内置管理后台；自定义控制台没有新的登录 Cookie、API realm 或产品 profile，导航由代码注册，内置菜单编辑器不会改它。`/workspaces` 是业务控制台保留前缀；已在该地址部署管理后台的实例需要先将后台迁到另一前缀。

### 业务资源的服务端授权

业务主体关系（如代理与订单的归属）属于业务模块，框架只提供身份、授权与数据范围基础。模块按既有三层完成服务端校验，前端传入的角色名、主体 ID 或工作台 ID 一律不可信：

1. **权限点与 operation**：每个读写 operation 在契约中声明 `x-unicore.permissions`/`permissionMode`；handler 用 `require(...)` 复核权限点，运行时策略中间件按访问类与授权集 fail-closed。
2. **数据范围**：需要按组织或本人收敛时，用 `identity.Store.DataScope(ctx, user, "<资源权限点>")` 解析 `ScopeFilter`，用户拥有的资源逐行用 `scope.Contains(subjectID)` 校验；部门拥有的资源用 `DepartmentScope(ctx, user, "<资源权限点>")` 与 `ContainsDepartment`，保留空部门且不枚举成员。写操作在存储事务内持有安装锁，用户资源用 `AuthorizeScopedMutation`，部门资源用 `AuthorizeDepartmentMutation`，转移用 `AuthorizeDepartmentTransfer` 同时校验持久化源与目标，并交集校验浏览及写权限范围。笔记管理（`internal/adapter/http/notes.go`）是完整参考实现。
3. **主体关系**：超出现有数据范围表达的业务归属（如"代理只能看被授权的订单"）由模块自建关系表并在查询与写入两侧校验；同一账号持有多角色时按显式权限并集生效，业务上下文不得放大授权。

## 应用发版与框架版本

应用拥有独立的产品版本：根目录 `VERSION` 是唯一手工来源，`package.json`、OpenAPI、桌面信息与 Go buildinfo 都由 `pnpm version:sync` 从它生成。创建时默认 `0.1.0`，可用 `--version` 指定；`pnpm framework:sync` 只更新框架代码，不会提高或覆盖应用版本。发版流程：在 `## Unreleased` 写好中英文条目，执行 `pnpm release --release X.Y.Z`（`version.mjs --release` 校验递增并归档条目），再走自己的发布渠道。`project.provenance.json` 同时记录创建时的框架来源与当前已成功集成的框架版本、源码提交和模板提交。

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

开发途中若遇到可复现的框架通用问题，按 [上游反馈流程](framework-upgrade.md#应用反馈与框架通用问题) 查找或提交 Issue。即使已经在应用内临时修复，也要保留对应的上游记录，方便模板更新后核对。

## 替换示例业务

笔记与 CLI 文本分析均为参考业务。关闭笔记的构建命令、永久移除源码的入口以及既有实例的数据处理，见 [裁剪示例与可选能力](features.md)。笔记模块的角色配置示例见 [源码导读](https://unicore.ebox.vip/03-runbooks/business-example#角色与权限示例)。

### 部门业务产物的受控下载

部门资产的审计创建者不是当前归属。业务模块持久化资源 department_id/version/deleted_at 及 file_id 引用，在列表、计数、明细、删除与归档使用相同范围。`files.ControlledStore` 提供可插拔私有字节访问：实现 `ResourceAuthorizer.WithResourceFiles`，从当前主体重新解析操作权限及部门 scope，在读事务/锁内校验每个文件的当前资源归属，返回绑定主体、Revision 与有序文件清单。对象键必须不可变，模块负责引用保护和清理账本。

由 `Sign` 签发短期 token，模块自己声明的已认证下载 API 每次用当前请求调用 `Open`，再流式输出并在取消时关闭 reader；多文件自动重新生成 ZIP。不要将部门产物注册成个人文件、伪造 Admin、扩大 CreatorIDs，或把 ZIP/云直链交给静态缓存绕过当前授权。转移/删除/产物替换递增 Revision，旧 token 在打开对象前失效；已发出字节无法撤回。框架没有具体设备或订单业务，模块仍负责其资源查询、分页/计数及批次历史外壳。既有个人文件继续使用原有所有权规则。

### 额外 API 根版本

优先在 `/api/v1/<module>/<business-version>/...` 组织业务版本。确需独立根时，在唯一 OpenAPI 声明完整 `/api/vN/...` 路径与 x-unicore 策略，生成 SDK operation，然后通过 `httpadapter.Config.APIVersions` 登记 `APIVersion{Root: "/api/v2", Register: registerBusiness}`。Register 接收受控 Chi router；嵌套注册仍逐叶子匹配完整契约。不要自行 Mount 原始 handler、重写成 v1 或手拼客户端路径。

所有显式根共享维护模式（bootstrap/admin/health 例外）、profile、会话/权限、PAT、CSRF/Origin、登录限流、审计与 JSON 错误。模块用 `httpadapter.RequestSession(r)` 读取已鉴权主体，不能通过重新读 Cookie 扩大 Bearer 主体。v1 的认证/OIDC/文件接口保持原路径，不自动复制；未知根 404，未声明叶子 fail-closed。新增模块的真实路由↔契约遍历须覆盖完整注册表。

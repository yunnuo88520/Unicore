<!-- Author: yunnuo <ymz@ebox.vip> -->
# 应用开发与 AI 任务入口

先 [创建自己的应用](#创建独立商用产品)，完成 [第一次体验](index.md)，再做 [笔记标签教程](first-feature.md)。参考资料按需查询，无需先读完所有规范。

## 创建独立商用产品

MIT 允许商用、修改和再分发；保留 LICENSE 的版权和许可声明及框架原作者信息。示例：创建名为 LicenHub、命令为 licenhub 的独立产品（仓库地址替换为自己的地址）：

```sh
pnpm create:project --directory ../LicenHub --name LicenHub --slug licenhub --module github.com/team/LicenHub --bundle vip.ebox.licenhub --repository https://github.com/team/LicenHub
cd ../LicenHub
make install
make docs
pnpm product:check
pnpm check:residuals
make build-web build-cli build-ops
./build/bin/licenhub --help
```

名称、CLI/运维命令、桌面标识、服务名、安装/数据目录与镜像名随 product.identity.json 投影。创建器完成本地 main 初始提交，origin 指向自己的仓库；只读 framework 远端和 project.provenance.json 保存上游来源，业务提交和推送在自己的仓库维护。--repository 不会创建托管仓库或推送，首次推送前确保目标仓库已建立。更新渠道、公钥默认清空，另行配置自己的签名发行。

域名不是产品身份字段。部署到自己的域名时配置 DNS、Nginx server_name 和 TLS，首次从正式 HTTPS 地址打开 /install，基础地址默认取浏览器的实际 origin；生产配置与实例数据不写入仓库。自己的 Logo/图标仍由 assets/brand/identity.json 配置，产品更名不会凭空生成定制图案。

按任务读取，不遍历全部文档。契约、代码和可重复测试比过期功能说明更可靠；先检查已有功能和工作区，不覆盖他人修改。根 AGENTS 是简短硬约束，.agents/skills/develop-application 按需加载流程；触碰迁移 SQL、契约、生成文件或权限目录前先读对应规范；是否自动提示取决于所用 Agent，不假设存在工具 Hook。

## UI 组件

共享界面原语（Button/Select/Modal/Message/表单层）的接入方式、翻译注入与行为约定见 [UI 组件参考](ui-components.md)。

## 目录和依赖

internal/domain 放业务规则，不依赖 HTTP、Wails、SQL 或认证；internal/usecase 通过 ports 编排领域能力。adapter 实现传输/数据库/外部系统，bootstrap/runtime 按 Profile 装配。CLI 直接调用共享核心，不引入 HTTP、数据库驱动、迁移或平台身份。Web 平台模块不得被单机/桌面强制引入。

业务模块是自包含树：`internal/modules/<slug>/`（module.go 描述符 + domain/usecase/storage 子层），经 `internal/module` 注册后菜单、权限、迁移、任务执行器与前端路由自动聚合；参考实现 Notes。权限点/导航来自模块描述符，HTTP handler 集中在 internal/adapter/http 并在 mountWeb 加一行，桌面能力经 RegisterBridgeContribution 注入。跨端相同输入应有相同行为。可变实体嵌入 coredomain.BaseEntity，值对象/凭据/账本按各自生命周期，不盲目套软删除。新增时逐项登记 Catalog、模块描述符、组合根、HTTP/桌面入口与前端模块，并对照 Notes 的权限和迁移测试；框架源码仓库另有 add-go-module Skill。

## API、权限与前端

packages/contracts/openapi.json 是 DTO/operation 的唯一线契约。先改契约，运行 pnpm generate，不手改 *.gen.*。handler 负责解析/校验/认证授权/统一响应；用例负责规则，Repository 负责持久化，数据库实体显式映射 DTO。错误通过统一业务码与请求 ID 返回，不暴露内部堆栈或秘密。

平台使用统一用户账号和多角色授权；用户与管理工作台入口分开，共用身份与会话，不能新增独立管理员账号表。每个新增管理操作声明并在服务端检查权限；资源 owner/scope 由可信身份生成，不信任客户端传来的管理员标志或 owner_id。必须测试匿名/普通用户/跨用户资源访问。

前端复用 packages/web-ui 的 WorkspaceLayout、AppClient、会话/路由守卫、表单校验和消息组件；不要自行设置侧栏偏移或另建请求/通知体系。工作区固定 LTR。新增界面同时提供中文/英文：useI18n/useLocale + t，静态路由/选项使用 defineMessages，pnpm check:i18n 检查。用户输入、邮件模板内容和公告不自动翻译。已注册但无权访问的页面呈现独立 403，未注册地址使用 404；页面提示不替代服务端授权。

在线接口参考使用本地打包的 Swagger UI，读取实例通过 `--api-docs=true` / `APP_API_DOCS=true` 开启后发布的 `/openapi.json`；兼容入口 `/docs/api` 跳转到 `/api-docs`。默认关闭，原始契约与参考页不携带实例凭据。启动配置见 [配置参数表](configuration.md#2-web-启动参数完整对照)。`packages/contracts/reference.gen.html` 保留为离线参考。XLSX 导入/导出通过 SDK 专用二进制方法处理，不能当作普通 JSON 响应；平台管理员可在用户管理页下载模板、按行导入或导出用户；文件元数据导出保留为授权 API，无独立管理页面。

主题由 assets/theme/tokens.json、品牌由 assets/brand/identity.json 生成，pnpm design:generate 同步，不手改投影。页面要验证桌面/375px、权限状态、双语和实际 GUI，不能用 HTTP 代替 Wails 原生验收。

## 复用通知与邮件

平台功能可注入已有 `*mailer.Service` 调用 `Notify`，将业务邮件加密入队；需要遵循用户/管理员事件策略并与业务原子提交时，使用 `mailer.Plan` 和事务内队列写入。不要直接从页面调用机器人 URL、在 usecase 引入 SQL/SMTP，或在数据库事务内另开连接发信。完整参数、可复制 Go 示例、SDK 方法、错误处理和测试要求见 [通知与邮件接入](notifications.md)。

站内信复用数据库消息和本人已读接口；当前公告事务是自动投递入口，内部 `DeliverInbox` 可供新业务复用，没有独立发送 API/UI。提交后通过 SSE 通知客户端重新查询，进程内推送无持久重放或跨实例总线，业务状态仍以数据库为准。用户在顶部铃铛查看公告与站内信，二者已读分别保存。

平台后台任务使用 `internal/scheduler` 的代码注册表，基于 `robfig/cron/v3` 运行；管理页仅查看、启停、手动触发已注册函数，不接受任意脚本。默认 `mail.queue` 每秒处理通知队列，`files.cleanup` 每分钟清理文件，`announcements.refresh` 每分钟检查公告时间边界。启停状态保存在数据库；手动触发成功仅表示已接收，完成结果须查询任务列表。

## 数据库迁移与文件

当前安装与启动已使用 `migrations/runner.Apply` 和 `migrations/catalog.json` 单轨，按 namespace 保存版本与 checksum；平台与业务模块的当前版本以 Catalog 为准，不从旧迁移文件名猜测版本。单机/桌面只选择 core 与 module.notes，CLI 不装配数据库。

预期集合只由 Catalog 定义；namespace 独立版本、depends_on 唯一决定拓扑顺序，Profile namespaces 是成员集合。checksum 取 SQL 原始字节 SHA-256，版本/摘要/账本 DDL/Go/JSON 由生成器投影，禁止手填当前最大版本。首个正式 stable release 后已分发迁移冻结，只追加版本；此前的开发预览版本允许基线整合，不承诺旧开发库自动升级。CLI 仍不 import 迁移包。

数据库变更先明确当前运行体系、兼容和恢复，再经独立授权实施三方言/适用 Profile 的真实测试。SQLite PK/rowid、VARCHAR 长度与 MySQL collation 有不同语义，不能用一种数据库结果推断全部。禁止自动 DROP/reset、改账本/hash 或跳过校验来修复失败。0.x 开发库不承诺升级新世代；旧环境保持，新空环境另建。

文件以 file_id 通过存储接口使用，不能拼本地路径。临时签名、元数据、分片、清理和越权测试见 [存储说明](storage.md)。

## 验证与维护自己的项目

保留框架已有文件的作者与许可声明。新增业务源码可使用 `product.identity.json` 的 author 配置团队署名（格式 `Team <dev@example.com>`），作者检查同时接受上游原作者与该团队署名；严格 JSON/锁/生成文件按其格式处理。新提交标题/正文使用英文。迭代期先跑受影响面（make test-go / test-web / test-gen），交付前运行 make docs、make test、受影响 Profile 构建和相应页面/数据库测试；区分代码存在、构建、自动测试、原生实测与生产验证，未执行如实标明。

创建器按 distribution/manifest.json 的显式模板导出，新的 Git 文件不会自动入模板。Git 来源选中文件若有未提交修改默认拒绝；确需导出经过审阅的修改，显式传 --allow-dirty，provenance 将记录来源状态与输入摘要。没有 Git 的源码目录标记为 unversioned，不能声称来自某个干净提交。

长期保留自己的应用变更记录和上游 revision。创建、源码同步、隔离冲突处理及通用问题回流见[框架升级与反馈](framework-upgrade.md)；使用 `pnpm framework:check` 和 `pnpm framework:sync`，不要覆盖复制上游目录。备份/更新配置与签名根见 [更新](updates.md)、[备份](backup.md)。上游实验/工作区保护记录不进入应用模板。

框架表统一保留 unicore_ 前缀，例如 unicore_users；产品身份生成器不会把它改成项目 slug。自建业务表可用项目自己的前缀，与框架保留表名分开；通过独立业务迁移维护，不批量替换上游 SQL。当前 Catalog 基线直接定义前缀终态，不再执行旧轨 0013 重命名；旧轨开发库不自动转换。升级前停服并成套备份，回退恢复旧快照。

平台角色授权使用“角色权限”的共享树和高级 API 选择器，也可从菜单行分配角色。新增业务 API 按 OpenAPI 注册后自动进入完整目录；只有页面相关按钮才登记 uiPage，无页面 API 同样可单独授权。菜单、按钮和 API 是独立集合，空数组表示撤销；不要在会话解析中根据 API 重新授予按钮。页面默认只联动已有权限上界内的浏览接口，写操作需显式选择。新增业务授权以 `packages/contracts/openapi.json` 的 x-unicore 元数据、HTTP 策略中间件及权限矩阵测试为准。

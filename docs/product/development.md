<!-- Author: yunnuo <ymz@ebox.vip> -->
# 应用开发与 AI 任务入口

按任务读取，不遍历全部文档。契约、代码和可重复测试比过期功能说明更可靠；先检查已有功能和工作区，不覆盖他人修改。根 AGENTS 是简短硬约束，.agents/skills/develop-application 按需加载流程。

## 目录和依赖

internal/domain 放业务规则，不依赖 HTTP、Wails、SQL 或认证；internal/usecase 通过 ports 编排领域能力。adapter 实现传输/数据库/外部系统，bootstrap/runtime 按 Profile 装配。CLI 直接调用共享核心，不引入 HTTP、数据库驱动、迁移或平台身份。Web 平台模块不得被单机/桌面强制引入。

现有 Notes 是持久业务样板：domain/note.go、usecase/notes.go、adapter/storage/notessql 以及共享前端 notes-page。跨端相同输入应有相同行为。可变实体使用 BaseEntity，值对象/凭据/账本按各自生命周期，不盲目套软删除。

## API、权限与前端

packages/contracts/openapi.json 是 DTO/operation 的唯一线契约。先改契约，运行 pnpm generate，不手改 *.gen.*。handler 负责解析/校验/认证授权/统一响应；用例负责规则，Repository 负责持久化，数据库实体显式映射 DTO。错误通过统一业务码与请求 ID 返回，不暴露内部堆栈或秘密。

平台默认管理员/普通用户，后台/用户身份与 API 分离。每个新增管理操作声明并在服务端检查权限；资源 owner/scope 由可信身份生成，不信任客户端传来的管理员标志或 owner_id。必须测试匿名/普通用户/跨用户资源访问。

前端复用 packages/web-ui 的 WorkspaceLayout、AppClient、会话/路由守卫、表单校验和消息组件；不要自行设置侧栏偏移或另建请求/通知体系。工作区固定 LTR。新增界面同时提供中文/英文：useI18n/useLocale + t，静态路由/选项使用 defineMessages，pnpm check:i18n 检查。用户输入、邮件模板内容和公告不自动翻译。

主题由 assets/theme/tokens.json、品牌由 assets/brand/identity.json 生成，pnpm design:generate 同步，不手改投影。页面要验证桌面/375px、权限状态、双语和实际 GUI，不能用 HTTP 代替 Wails 原生验收。

## 数据库迁移与文件

当前产品仍使用旧迁移执行器；migrations/core、platform、modules 及 catalog.json 是已构建的新世代资产，尚未接管启动。不要通过增加业务需求顺便启用新账本。

新世代预期集合只由 Catalog 定义；namespace 独立版本、depends_on 唯一决定拓扑顺序，Profile namespaces 是成员集合。checksum 取 SQL 原始字节 SHA-256，版本/摘要/账本 DDL/Go/JSON 由生成器投影，禁止手填当前最大版本。一旦对外分发的迁移不能修改，只追加版本；CLI 仍不 import 迁移包。

数据库变更先明确当前运行体系、兼容和恢复，再经独立授权实施三方言/适用 Profile 的真实测试。SQLite PK/rowid、VARCHAR 长度与 MySQL collation 有不同语义，不能用一种数据库结果推断全部。禁止自动 DROP/reset、改账本/hash 或跳过校验来修复失败。0.x 开发库不承诺升级新世代；旧环境保持，新空环境另建。

文件以 file_id 通过存储接口使用，不能拼本地路径。临时签名、元数据、分片、清理和越权测试见 [存储说明](storage.md)。

## 验证与维护自己的项目

每个手写文件保留 Author: yunnuo <ymz@ebox.vip> 作者元信息（严格 JSON/锁/生成文件按其格式处理）。新提交标题/正文使用英文。运行 make docs、make test、受影响 Profile 构建和相应页面/数据库测试；区分代码存在、构建、自动测试、原生实测与生产验证，未执行如实标明。

创建器按 distribution/manifest.json 的显式模板导出，新的 Git 文件不会自动入模板。Git 来源选中文件若有未提交修改默认拒绝；确需导出经过审阅的修改，显式传 --allow-dirty，provenance 将记录来源状态与输入摘要。没有 Git 的源码目录标记为 unversioned，不能声称来自某个干净提交。

长期保留自己的应用变更记录和上游 revision；升级框架时在独立分支审阅差异，不覆盖现有主题、认证、业务和数据库。备份/更新配置与签名根见 [更新](updates.md)、[备份](backup.md)。上游实验/工作区保护记录不进入应用模板。

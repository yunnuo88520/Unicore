<!-- Author: yunnuo <ymz@ebox.vip> -->
# 新功能分类模板

新增或修改功能时，先复制下方模板填写一份「功能声明」，再按 [产品形态与能力边界规范](product-forms.md) 校验边界，按 [功能呈现与访问规范](feature-presentation.md) 确定呈现；实现完成后把功能单元登记进 [功能适用性清单](feature-inventory.md) 并更新呈现矩阵。声明放任务会话或 ADR，不新增独立文档；粒度以「可独立判断产品适用性的功能单元」为准（如「公告管理」一级，「每个按钮」不单独成行）。

归属层为「实例运维面」的功能（Web 发行包 `unicore` 子命令、`unicore-ops` 工具），三形态适用性列均填不适用并在归属层注明，不得计入 CLI 形态能力。声明命中 [待维护者决策清单](pending-decisions.md) 未决项或发现新边界冲突时，列出冲突与候选方案，**暂停受影响范围的实现**交维护者决策；未决问题不阻塞其他无关功能。

## 模板

```markdown
<!-- Author: yunnuo <ymz@ebox.vip> -->
## 功能声明：<功能 ID> <名称>

- 功能领域：<身份治理 / 通知消息 / 内容运营 / 文件存储 / 运维设置 / 共享核心 / 业务模块 …>
- 功能归属层：<产品功能 / 实例运维面（Web 发行包 `unicore` 子命令或 `unicore-ops`，操作实例但不属于任何产品形态）/ 运行载体实现（传输、初始化、打包等载体层）>
- 功能定位与操作对象：<一句话：为谁、对什么对象、做什么>
- Platform 适用性：<已实现 / 新增 / 不适用 + 理由>
- Standalone 适用性：<同上；两载体是否等效，有无载体层差异（对照形态规范第 5 节）>
- CLI 适用性：<同上；若复用 Core 用例，说明无持久化/HTTP/UI 依赖>
- Platform 访问主体与权限：<用户域/管理员域；新权限点名称（如 xxx:read/write）或复用既有点；superAdmin 保留集与否>
- Standalone 访问规则：<本地开放 / loopback / sameOrigin；不装配则写不装配>
- 持久化需求：<新表与迁移命名空间（core/platform/module.<slug>）/ 复用既有表 / 设置键（登记 SettingDefinition）/ 无>
- 契约影响：<新增或修改的 OpenAPI operation（operationId 与 x-unicore 声明）及 SDK 变更；纯复用或无契约变更写无>
- 菜单与页面呈现：<新增页面与路由、所在区域/目录、各访问主体可见性；无页面则写无>
- 仪表盘组件呈现：<widget 及其可见上下文；无则写无>
- 运行环境与依赖条件：<构建标签、外部服务（SMTP/对象存储）、单实例假设等>
- 与现有功能的关联：<复用/依赖的模块、契约、设置、迁移>
- 待决策事项：<无法由源码与既有规范确定的选择，提交 docs/00-product/pending-decisions.md；无则写无>
```

## 示例一：notes 笔记模块（三形态功能）

```markdown
## 功能声明：notes 我的笔记

- 功能领域：业务模块（module.notes）
- 功能归属层：产品功能
- 功能定位与操作对象：使用者对个人笔记的增删改查
- Platform 适用性：已实现；按统一账号所有权隔离，用户域 + 管理端（notes:* 权限点）
- Standalone 适用性：已实现；local scope，Web HTTP 与桌面桥等效，同一 SQLite schema
- CLI 适用性：不装配（模块特性对 CLI 关闭）
- Platform 访问主体与权限：用户域 notes:access/create/update/delete（Assignable）；管理端镜像按 update/delete 收敛
- Standalone 访问规则：本地开放（platform-session 无会话放行，scope=local）
- 持久化需求：unicore_example_notes，命名空间 module.notes，三方言
- 菜单与页面呈现：业务区页面（notes:access）；Platform 用户域与管理员域可见，Standalone 两载体可见
- 仪表盘组件呈现：无
- 运行环境与依赖条件：无外部依赖；桌面桥贡献经 RegisterBridgeContribution
- 与现有功能的关联：附件字段引用 file_id（Platform 校验，Standalone 现状见 pending-decisions D12）
- 待决策事项：Standalone 附件归属校验（D1/D12）
```

## 示例二：announcements 公告管理（Platform 专属功能）

```markdown
## 功能声明：announcements 平台公告

- 功能领域：内容运营
- 功能归属层：产品功能
- 功能定位与操作对象：管理员对全平台用户发布、定时与归档公告；用户阅读与已读
- Platform 适用性：已实现；管理端 CRUD + 用户端 feed/已读，SSE 广播 inbox.new
- Standalone 适用性：不装配（无受众模型：无用户、无站内信、无 SSE）
- CLI 适用性：不适用
- Platform 访问主体与权限：管理员域 announcements:read/write；用户域会话读取
- Standalone 访问规则：不装配（处理器对非平台形态 404）
- 持久化需求：unicore_platform_announcements / recipients / reads + settings announcements.enabled
- 菜单与页面呈现：管理员域页面（Platform 用户域不呈现，管理面拆分）；用户经顶部铃铛查看
- 仪表盘组件呈现：无
- 运行环境与依赖条件：平台调度器 announcements.refresh；进程内 realtime hub（单实例）
- 与现有功能的关联：站内信由公告事务产生；通知事件走 notifications
- 待决策事项：无
```

## 示例三：updates 单机系统更新（Standalone 功能）

```markdown
## 功能声明：updates-standalone 单机系统更新

- 功能领域：运维设置（更新与分发）
- 功能归属层：产品功能（tar/native 部署差异属载体层）
- 功能定位与操作对象：单机使用者检查并应用签名更新
- Platform 适用性：不适用本单元（平台走管理端 /admin/updates，updates:read/apply，super 保留）
- Standalone 适用性：已实现；两载体等效语义（检查/应用签名版本），载体差异仅部署方式：
  Web 为 /updates 仅 loopback；桌面为桥接触发 native 更新
- CLI 适用性：不装配（无自身持久化，不更新自身）
- Platform 访问主体与权限：不适用（管理员入口属平台更新单元）
- Standalone 访问规则：Web 仅本机（Host/RemoteAddr 均 loopback）；桌面无网络面
- 持久化需求：更新缓存与任务状态位于数据目录 updates/；无业务表
- 菜单与页面呈现：系统更新页（edition）；Platform 仅 super_admin，Standalone 看 updater 能力
- 仪表盘组件呈现：无
- 运行环境与依赖条件：updater 构建标签；信任配置 assets/updates/config.json；tar/native 部署差异见形态规范第 5 节
- 与现有功能的关联：签名校验链与平台共用 internal/updates；迁移等级目标见 pending-decisions D5
- 待决策事项：无（D5 为实现核对项）
```

<!-- Author: yunnuo <ymz@ebox.vip> -->
# ADR-0042：首发基线与更新兼容性

状态：已接受。维护者授权正式发行前整合全部开发期 SQL；没有需兼容的外部用户数据库。本文替代 ADR-0024/0025 中“preview 一经分发即冻结”的开发阶段限制；正式版后的不可变迁移与安全失败原则继续有效。

## 基线与升级

core、platform、module.notes 各保留独立 version=1；三方言共九份 SQL。按真实终态融合 ALTER 的列、默认值、约束、索引与静态记录，不执行旧账号搬迁或角色重写。平台与本地的依赖边界不合并，账本仍为四列 schema_migrations。角色、权限、账号、设置由 Go Seed 初始化。

旧开发库的 checksum 或已应用版本与新 Catalog 不同会在写入前拒绝，不自动清库、改账本或兼容导入。需要保留开发数据时使用旧 revision 的程序和工具在隔离环境恢复。新安装使用新目录与空专用库。

首个正式 stable release 起，已交付 SQL 永久冻结；后续在对应 namespace 追加连续 version=2、3。启动按依赖验证全部账本后追加缺失尾部，失败不得接流量。回退使用升级前完整 DB/data/config/key 与匹配程序，不提供 down SQL 或单独 binary 数据回退。

## 自动更新兼容条件

废除 migration_level/business_migration_level 两整数：它们无法表达三个及更多命名空间，也无法识别版本号相同但 SQL 被开发期改写的情况。

生成器从唯一 Catalog 产生每个 profile 的 schema_fingerprint（SHA-256）。输入为世代标识、固定账本契约，以及按标识排序的 namespace、依赖、连续版本、各适用方言原 SQL checksum。CLI 指纹为空且不装配更新或数据库。运行时 Go descriptor 和发行 JSON 是同源投影，打包拒绝过时投影。

签名 target 绑定 schema_generation 与 schema_fingerprint；安装还核对包内相同字段及版本、平台、功能标志。自动安装只接受完全相同的目标身份，因此允许无数据库变化的应用更新；任何追加迁移或模块集合变化都要求人工停服备份升级。无需为自动回滚假定新程序从未写入新 schema。

这是一条保守的自动更新规则，不限制 runner 支持正常追加迁移。未来若需要自动跨 schema 更新，应另行定义备份、迁移、健康确认与数据回滚协议，不能放宽指纹比较代替设计。

## 验证要求

对比整合前后七组合结构与约束，执行真实 Seed/业务、基线重放、带数据追加迁移、重复启动、旧 Catalog 拒绝未来库；用向导结构化输入完成 SQLite/PostgreSQL/MySQL 备份恢复。发行验证覆盖生成 SQL 变更导致指纹改变、签名/包内身份不符拒绝、同指纹更新成功及失败恢复。测试与证据保存 build/ 或 CI artifact。

## 功能适用性与呈现

- 功能领域：运维设置、更新与分发；基线整合属于运行载体实现，备份工具属于实例运维面。
- Platform：保留现有更新入口与 super_admin、updates:read/apply 权限，不增加权限点。
- Standalone：Web loopback 与桌面桥保留等效检查/安装语义，均使用生成指纹；部署方式差异不变。
- CLI：不装配数据库、迁移或更新；Web 包运维子命令不属于 CLI 形态。
- 持久化：沿用现有三命名空间、备份归档和 updates 缓存；不新增业务表或设置。
- 契约：无 OpenAPI operation 变化；变更为内部签名清单及发行包元数据。
- 菜单、页面与仪表盘：无新增入口或组件，原授权与可见性不变。
- 依赖：updater 构建标签、可信发布者签名、单实例和完整发行目录要求不变；D5 已解决，其他未决边界不在本决策内。

<!-- Author: yunnuo <ymz@ebox.vip> -->
# 数据库迁移开发规范：Pre-1.0 新世代

依据 [ADR-0024](../adr/ADR-0024-pre1-migration-squash.md)。新九SQL/Catalog/数据型Go+JSON生成物已存在；产品代码仍使用旧42SQL/两账本，新的执行器与启动保护尚未接入，不能假定运行时已支持namespace。目录状态见 [migrations/README](../../migrations/README.md)，语义见 [ADR-0025](../adr/ADR-0025-baseline-catalog-semantics.md)。

## 命名空间与依赖

core 面向所有有数据库的产品；platform 仅 web-platform；业务模块使用 `module.<slug>`，Notes 为 module.notes。各命名空间独立从 version=1 开始，SQL 分 SQLite/PostgreSQL/MySQL 三方言。Web 两 Profile 均保留三方言，desktop 仅 SQLite，CLI 不创建 DB、不 import migrations、不嵌入 SQL。

新模块必须在唯一 `migrations/catalog.json` 登记 namespace、depends_on、明确版本、三方言引用与 Profile 成员；成员数组没有顺序语义，顺序只由依赖图按确定性 Kahn 排序产生。禁止私自从目录扫描猜版本、使用文件下标重编号、另建模块私有账本或手写当前最大等级。module.notes 只依赖 core，不能为了附件/身份强制本地引入 platform。CLI 的空元数据由工具生成，CLI 程序不读取迁移包。

运行 Go descriptor、发行/OTA/ops JSON 与账本引导 DDL 从 catalog/原 SQL 生成，检查再生一致性；生成物不可手改，不能反向成为第二份定义。应用 VERSION 与数据库命名空间版本独立，不能靠应用版本相同判断 DB 兼容。

## SQL 与 Seed

SQL 负责最终结构、索引/约束、固定字段默认值和必要静态基础记录；Go Seed 负责默认角色/权限、管理员、设置、实例标记/审计及运行期身份。密码、hash、密钥、DSN、SMTP/云凭据、演示用户、笔记/公告/邮件内容禁止写 baseline。当前 storage_locations 的 local/legacy-brand 两行有运行代码依赖，变更要连同文件/品牌用例论证。

每个新手写 SQL 有 Author 头、用途、Profile、兼容和失败恢复说明。checksum 始终取原文件字节 SHA-256，包括注释/换行/BOM，不 normalize、不覆盖 DB checksum。跨 OS 检查发行 SQL 字节，避免 checkout 行尾破坏签名/账本。

新世代迁移首次对外分发后，即使仍是 preview，也冻结原文件；只能在该 namespace 追加下一个 version，不修改、删除、插号或再次 squash。需要改已分发结构时新增迁移。移除模块不删除执行历史；变更命名空间/方言/Profile 是单独兼容决策。

## 账本、校验与失败

目标账本只有 schema_migrations(namespace,version,checksum,applied_at)，联合主键 namespace+version，applied_at 为 UTC Unix 秒。预期来自 catalog，实际记录来自成功执行，不得补造/手改/删除行来“修复”。旧0.x账本未来必须返回 legacy_schema_requires_reinstall，不自动 DROP/reset，不开发桥接。

执行前完整检查全部 namespace、Profile/owner、合法前缀及每个 checksum。未来、未知、缺口、checksum/Profile 不符均拒绝，任何业务/Seed/日志落库不得先发生。不实现 force/skipValidation。迁移锁覆盖检查、执行、登记与复检；外部 DB 的锁不能仅靠目录 flock。

SQLite 只读开库要验证 DB/WAL/SHM 与文件创建边界，不能先 touch DB；PG 只读+限定 schema；MySQL 不承诺事务 DDL。失败不启动业务，不把 CREATE IF NOT EXISTS 或单列存在当完整成功证据。恢复使用匹配快照到新目标，不删除目标库或迁移账本。

## 验收

新增/修改迁移后，在独立空库和明确支持的旧前缀执行三方言真实测试，验证每个 Profile 的表/列/索引/唯一/外键、静态默认行、Go Seed、重复启动和失败场景。比较语义而非仅表数：SQLite PK/长度、MySQL collation/隐式 FK 索引、PG search_path 都要记录。数据库版本及 pass/fail/skip 逐项写明，不用一种方言推断另一种通过。

后续实现运行生成检查、make docs/test、相关 Profile 构建及真实原生边界验证；需外部副作用时使用本轮授权的隔离环境。R1.0a 只读/故障/新基线尚未验证，不能引用它代替新执行器验收。开发重置见 [手册](../03-runbooks/development-database-reset.md)。

R1.0b 校验仅扫描 core/platform/modules，不将旧方言根误报漏登记；新资产未加入旧 assets.go。运行 pnpm generate:migrations / check:migrations / test:migrations 及 go test -count=1 ./migrations/catalogdata，make docs/test 已接入。schema_generation 以实际落库 core@1 原字节 checksum 识别，不增加账本列或设置副本；完整启动复核在 R1.0c 实施。新比较键、install_state 单例 CHECK 和额外长度 CHECK 均需另审阅，目前只验证提案，不无声修改登录/rowid 规则。

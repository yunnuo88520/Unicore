<!-- Author: yunnuo <ymz@ebox.vip> -->
# 数据库迁移开发规范：Catalog 单轨

依据 [ADR-0024](../adr/ADR-0024-pre1-migration-squash.md) 与 [ADR-0025](../adr/ADR-0025-baseline-catalog-semantics.md)（含 R1.0c 切换补记）。安装与启动统一执行 `migrations/runner.Apply`；历史 42+4 份 SQL 与旧执行器已删除。目录状态见 [migrations/README](../../migrations/README.md)。

## 命名空间与依赖

core 面向所有有数据库的产品；业务模块使用 `module.<slug>`，Notes 为 module.notes。**迁移成员以 Catalog 为准，不按 namespace 名推断产品装配**：当前 web-platform、web-standalone、desktop 均包含 core、platform、module.notes（Notes 可按 edition 裁剪），platform 为按 [ADR-0042](../adr/ADR-0042-release-baseline-update-compatibility.md) 授权整合的单一 @1 终态基线（融合收件箱 actions、角色 version 与 MCP 治理/OAuth 存储）。Standalone 两载体同步执行 platform 迁移，但不装配账号、认证或身份治理服务/管理入口；数据库隔离另行决策，见 [ADR-0046](../adr/ADR-0046-credential-delegation-role-concurrency.md)。各命名空间独立从 version=1 开始，SQL 分 SQLite/PostgreSQL/MySQL 三方言。Web 两 Profile 均保留三方言，desktop 仅 SQLite，CLI 不创建 DB、不 import migrations、不嵌入 SQL。

新模块必须在唯一 `migrations/catalog.json` 登记 namespace、depends_on、明确版本、三方言引用与 Profile 成员；成员数组没有顺序语义，顺序只由依赖图按确定性 Kahn 排序产生。禁止私自从目录扫描猜版本、使用文件下标重编号、另建模块私有账本或手写当前最大等级。module.notes 只依赖 core，不能为了附件/身份强制本地引入 platform。CLI 的空元数据由工具生成，CLI 程序不读取迁移包。

运行 Go descriptor、发行/OTA/ops JSON 与账本引导 DDL 从 catalog/原 SQL 生成，检查再生一致性；生成物不可手改，不能反向成为第二份定义。应用 VERSION 与数据库命名空间版本独立，不能靠应用版本相同判断 DB 兼容。

## SQL 与 Seed

SQL 负责最终结构、索引/约束、固定字段默认值和必要静态基础记录；Go Seed 负责默认角色/权限、管理员、设置、实例标记/审计及运行期身份。密码、hash、密钥、DSN、SMTP/云凭据、演示用户、笔记/公告/邮件内容禁止写 baseline。当前 storage_locations 的 local/legacy-brand 两行有运行代码依赖，变更要连同文件/品牌用例论证。

每个新手写 SQL 有 Author 头、用途、Profile、兼容和失败恢复说明。checksum 始终取原文件字节 SHA-256，包括注释/换行/BOM，不 normalize、不覆盖 DB checksum。跨 OS 检查发行 SQL 字节，避免 checkout 行尾破坏签名/账本。

冻结自**首个正式（stable）release**起：此前的 development preview / prerelease 不构成冻结起点，维护者仍可将各 namespace 的基线整体整合或改写（squash 回 version=1 或重组版本），因为不存在需要兼容的已发布安装。首个正式版发布后即冻结原文件，只能在该 namespace 追加下一个 version，不修改、删除、插号或再次 squash；需要改已分发结构时新增迁移。移除模块不删除执行历史；变更命名空间/方言/Profile 是单独兼容决策。

新基线以 `unicore_` 前缀定义终态，重放幂等是硬性要求：`CREATE TABLE`/`CREATE INDEX` 带 `IF NOT EXISTS`（MySQL 索引内联于 CREATE TABLE），静态种子行用 `INSERT ... SELECT ... WHERE NOT EXISTS` 守护，保证 MySQL DDL 隐式提交的中断窗口可自愈。SQLite 基线不写 FK 子句；运行时连接开启 `foreign_keys=ON`（`internal/adapter/storage/sqlite/open.go`），但基线无 FK 子句因此不存在数据库级级联，引用完整性与级联由 usecase 层保证（仅开发库重置流程临时关闭）。PostgreSQL/MySQL 保留真实约束。

## 账本、校验与失败

目标账本只有 schema_migrations(namespace,version,checksum,applied_at)，联合主键 namespace+version，applied_at 为 UTC Unix 秒。预期来自 catalog，实际记录来自成功执行，不得补造/手改/删除行来"修复"。旧 0.x 两列账本返回 `ErrLegacyLedger`；账本缺席但库非空（旧前缀世界或异构库）返回 `ErrForeignDatabase`——均拒绝执行，不自动 DROP/reset，不开发桥接。

执行前完整检查全部 namespace、Profile/owner、合法前缀及每个 checksum。未来、未知、缺口、checksum/Profile 不符均拒绝，任何业务/Seed/日志落库不得先发生。不实现 force/skipValidation。迁移锁（PG `pg_advisory_lock`、MySQL `GET_LOCK`）覆盖检查、执行、登记与复检；外部 DB 的锁不能仅靠目录 flock。

SQLite 只读开库要验证 DB/WAL/SHM 与文件创建边界，不能先 touch DB；PG 只读+限定 schema；MySQL 不承诺事务 DDL。失败不启动业务，不把 CREATE IF NOT EXISTS 或单列存在当完整成功证据。恢复使用匹配快照到新目标，不删除目标库或迁移账本。备份清单的 `schema` 字段记录 catalog 世代（unicore-1 = 1）。

## 追加迁移与恢复

当前 `platform@1` 基线包含 `unicore_roles.version BIGINT NOT NULL DEFAULT 1`，已有及新建角色从 1 起。正式版后追加迁移时，基线幂等不代表追加 ALTER 可盲重试：MySQL DDL 可能提交而账本未登记，列存在也不能证明迁移成功；旧双身份或其他不匹配开发基线不提供原地转换。不得把“正式版前允许经授权整合”当成每次迁移都可无授权改写基线。

基线重放幂等不能推导所有追加 ALTER 均可重复执行。尤其 MySQL DDL 可已提交而账本未登记；执行失败立即停止业务，保留诊断，不能盲重试 ADD COLUMN、根据单列存在判定成功、手工补账本或删除行。使用匹配版本工具将升级前完整快照恢复到新目录/空专用库，再核验并重新部署；恢复不执行迁移，正常实例启动才向前执行。旧 binary 不能直接打开 @3 库作为回退。

所有受影响 UI profile 的 Catalog 指纹随追加迁移变化，拒绝跨指纹 OTA；tar 停服备份后人工替换完整包，Docker 外部替换镜像并保留数据卷（无 socket、无容器内覆盖），desktop 退出后使用完整原生包和匹配快照。schema=1 是世代而非 platform 版本，namespace_versions/指纹与账本须分别核验。详见 [更新](../03-runbooks/updates.md) 与 [备份恢复](../03-runbooks/backup.md)。

## 验收

新增/修改迁移后，在独立空库执行三方言真实测试，验证每个 Profile 的表/列/索引/唯一/外键、静态默认行、Go Seed、重复启动、重放幂等（删除账本行后重放不得产生重复对象或种子）和失败场景。比较语义而非仅表数：SQLite PK/长度、MySQL collation/隐式 FK 索引、PG search_path 都要记录。数据库版本及 pass/fail/skip 逐项写明，不用一种方言推断另一种通过。

探针与比较器按生成列适配：MySQL 的 STORED 生成列不可显式赋值。scripts/verify-baselines.py 验证三方言七组合，并完成基线重放、带数据追加、旧 Catalog 拒绝未来版本和真实安装配置的备份恢复；运行证据以当次 build/ 输出为准，不在规范固定记录历史通过数。

运行 pnpm generate:migrations / check:migrations / test:migrations 及 go test ./migrations/...，make docs/test 已接入。**首次给任一 namespace 追加新版本时**，必须用 scripts/test-upgrade.mjs（环境变量 `UPGRADE_FROM_REF` 指向上一发布版或受信任提交）完整演练一次真实升级：旧版建库装数据 → 换新版 binary 启动（runner.Apply 增量应用）→ 数据保留断言 → 快照回滚；空库验收（verify-baselines 现已直接执行 runner.Apply 与 Verify）不能替代升级演练。schema_generation 以实际落库 core@1 原字节 checksum 识别，不增加账本列或设置副本。新比较键、install_state 单例 CHECK 和额外长度 CHECK 均需另审阅，不能无声修改登录/rowid 规则。PG/MySQL 真实实例用 `scripts/verify-baselines.py` 隔离验收。开发重置见 [手册](../03-runbooks/development-database-reset.md)。

## 固定表名前缀

[ADR-0029](../adr/ADR-0029-fixed-framework-table-prefix.md) 明确产品框架表使用固定 unicore_，不随派生产品名变化。基线 SQL 直接定义前缀名；自有业务表自行命名，框架不能自动加前缀或批量改名。禁止绕过 catalog 直接建表或改名。

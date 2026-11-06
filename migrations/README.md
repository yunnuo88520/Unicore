<!-- Author: yunnuo <ymz@ebox.vip> -->
# 数据库迁移目录：Catalog 单轨（R1.0c 已切换）

产品安装与启动（`install.Manager`、`bootstrap/local`）统一调用 `migrations/runner.Apply`，按 [catalog.json](catalog.json) 与 [ADR-0025](../docs/adr/ADR-0025-baseline-catalog-semantics.md) 执行空库基线。历史 42+4 份 SQL、旧执行器（`Store.Migrate`、前缀/业务/个人中心链）与 `assets.go` 的旧 embed 已删除；旧轨建立的 0.1.x 开发库不再被接受（写前守卫 `ErrForeignDatabase` 拒绝，须重建或重装），见 [ADR-0029](../docs/adr/ADR-0029-fixed-framework-table-prefix.md) 与 ADR-0025 的 R1.0c 补记。

新世代定义只有 [catalog.json](catalog.json)：三个 namespace 各自只有一个 version=1 终态基线，SQL 直接定义 `unicore_` 前缀表名（不依赖 rename）。

```text
core/{sqlite,postgres,mysql}/0001_initial.sql        # install_state / system_settings / audit_logs
platform/{sqlite,postgres,mysql}/0001_initial.sql    # 32 张平台应用表（含公告通知、手机号、个人中心终态）
modules/notes/{sqlite,postgres,mysql}/0001_initial.sql
catalogdata/catalog.gen.go    # 生成 Go descriptor，不由 CLI import
metadata.gen.json             # 生成发行/运维投影
```

表数口径：web-platform = 3 + 32 + 1 + 1（四列账本 `schema_migrations`）= 37 张；web-standalone/desktop = 3 + 1 + 1 = 5 张；CLI 不创建数据库。Profile 的 namespaces 仅为成员集合；depends_on 是唯一依赖来源。生成器使用 Kahn 拓扑排序，每轮可选节点按标识字节序取最小者。当前顺序为 core→module.notes→platform。

```sh
pnpm generate:migrations   # 改 catalog.json 或 SQL 后重新生成
pnpm check:migrations      # 漂移检查（make test 内含）
go test ./migrations/runner/
```

生成器不连接数据库；checksum 来自 SQL 全部字节 SHA-256。生成物不得手改。新迁移首次对外分发后冻结字节，只能追加下一版本。SQLite 基线不含 FK 子句（运行时 `foreign_keys=OFF`，级联由 usecase 层保证）；PostgreSQL/MySQL 保留真实约束。全部基线重放幂等：`CREATE TABLE/INDEX IF NOT EXISTS`（MySQL 索引内联）、种子行 `WHERE NOT EXISTS` 守护——MySQL DDL 隐式提交的中断窗口可自愈。

runner 行为：postgres 用 `pg_advisory_lock`、MySQL 用 `GET_LOCK` 串行化并发；写入前拒绝旧两列账本（`ErrLegacyLedger`）、账本缺席但库非空（`ErrForeignDatabase`）、未知账本行、checksum 漂移与缺失 core@1 世代锚点；每份迁移与其账本行同事务提交。`Verify` 提供只读校验。隔离 SQLite 测试覆盖基线应用、幂等、profile 裁剪与全部拒绝路径；PG/MySQL 执行路径用隔离实例验收：

```sh
python3 scripts/verify-baselines.py --output build/verification-sql-unification
```

工具拒绝覆盖已有输出，只使用本地 Unix-socket Docker、缓存镜像、新容器/tmpfs、随机 loopback 端口与临时凭据；清除 APP_*/UNICORE_*/数据库环境。需要已准备的 postgres:15、mysql:8.0、Go、Python、Docker；不会自动拉镜像，不接管现有容器。它是空库验收 fixture，不具备升级、锁竞争或恢复能力。不要绕过 runner 把 Go 验证程序指向已有数据。

备份清单与发行元数据的世代语义：备份 `schema=1` 即 unicore-1（`business_schema` 已移除）；发行 manifest 的 `migration_level`/`business_migration_level` 均为 1。开发与恢复边界见 [迁移规范](../docs/02-standards/database-migrations.md)。

<!-- Author: yunnuo <ymz@ebox.vip> -->
# 数据库迁移目录：Catalog 单轨

安装与启动统一调用 migrations/runner.Apply，唯一预期集合在 [catalog.json](catalog.json)。当前为正式发行前整合基线，每个 namespace、每个方言各一份 SQL，共九份；旧开发库不原地转换，校验不符时写前拒绝。政策见 [发行基线与更新兼容](../docs/adr/ADR-0042-release-baseline-update-compatibility.md)。

| Namespace | Profile | 当前版本 |
| --- | --- | --- |
| core | web-platform / web-standalone / desktop | 1 |
| platform | web-platform | 1 |
| module.notes | web-platform / web-standalone / desktop | 1 |

Web 支持 SQLite/PostgreSQL/MySQL，desktop 仅 SQLite；CLI 不创建数据库或 import SQL。平台 48 张表（3 core + 43 platform + 1 notes + 1 账本），Standalone 两载体均为 5 张表。SQL 直接创建 unicore_ 终态表，不执行历史 rename、账号分表或清理。账号、角色、权限与实例设置由 Go Seed 初始化。

```sh
pnpm generate:migrations
pnpm check:migrations
pnpm test:migrations
go test ./migrations/...
python3 scripts/verify-baselines.py --output build/verification-migrations
```

生成器只读取 Catalog 和 SQL 原字节，不连接数据库；Go descriptor、JSON、账本 DDL 与 profile 指纹均为生成物，不手改。依赖图决定执行顺序，profile namespace 列表仅决定成员。账本 namespace/version/checksum/applied_at 只记录实际成功。

基线 CREATE TABLE/INDEX 幂等，MySQL 索引内联，必要静态记录用 WHERE NOT EXISTS 守护。SQLite 不声明外键（运行时关闭，业务事务负责引用）；PG/MySQL 保留现有外键、排序规则与约束。正式版后 SQL 冻结，只追加下一个版本，遵循 [迁移规范](../docs/02-standards/database-migrations.md)。

验收脚本只使用新建的随机本地 Docker 容器/tmpfs、loopback 端口和临时凭据，需要缓存 postgres:15、mysql:8.0 及满足 go.mod 的本地 Go。它验证七组合空库/Seed/业务、基线重放、带数据追加和旧 Catalog 拒绝未来库，以及安装配置到原生备份恢复。不会接管已有库，不自动拉镜像；输出目录必须不存在，结束清理本次资源。

备份 schema=1 表示 unicore-1 世代，不表示各 namespace 当前版本。发行包另列 namespace_versions，签名 OTA 只接受相同 schema_generation/schema_fingerprint；有迁移的更新走停服备份后人工部署。恢复保留匹配程序和完整快照，不修改账本或用旧 binary 直接打开新库。

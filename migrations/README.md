<!-- Author: yunnuo <ymz@ebox.vip> -->
# 数据库迁移目录：Catalog 单轨

安装与启动统一调用 migrations/runner.Apply，唯一预期集合在 [catalog.json](catalog.json)。当前包含三个命名空间的 @1 基线，共九份三方言 SQL（每方言三份）；platform 基线按 ADR-0042 终态融合收件箱 actions、角色 version 与 MCP 治理/OAuth 存储。正式版前整合与冻结政策见 [ADR-0042](../docs/adr/ADR-0042-release-baseline-update-compatibility.md)。

| Namespace | 当前 Catalog Profile 成员 | 当前版本 |
| --- | --- | --- |
| core | web-platform / web-standalone / desktop | 1 |
| platform | web-platform / web-standalone / desktop | 1 |
| module.notes | web-platform / web-standalone / desktop（Notes edition 开启时） | 1 |

Web 支持 SQLite/PostgreSQL/MySQL，desktop 仅 SQLite；CLI 不创建数据库或 import SQL。三个 UI profile 保留当前共享 namespace 成员，不能以“本地无身份体系”推断 platform 表不存在，也不能据此删除表、跳过 platform 迁移或变更 profile。Standalone Web/desktop 同步迁移不装配账号、认证服务、角色治理、管理 API 或后台页面；未来数据库隔离另行兼容决策，见 [ADR-0046](../docs/adr/ADR-0046-credential-delegation-role-concurrency.md)。表结构与数量按 Catalog SQL 检查，不固定旧表数。

SQL 直接定义 unicore_ 终态表，不执行旧开发轨 rename、账号分表或清理。平台账号、角色、权限与实例设置由 Go Seed 初始化，不因 Standalone 创建表就运行平台身份 Seed。匹配 Catalog 世代、原 SQL checksum 和合法前缀的已有库由 runner 追加缺失尾部；旧双身份或不匹配开发基线仍写前拒绝，不提供自动转换。

```sh
pnpm generate:migrations
pnpm check:migrations
pnpm test:migrations
go test ./migrations/...
python3 scripts/verify-baselines.py --output build/verification-migrations
```

生成器只读取 Catalog 和 SQL 原字节，不连接数据库；Go descriptor、JSON、账本 DDL 与 profile 指纹均为生成物，不手改。依赖图决定执行顺序，profile namespace 列表仅决定成员。账本 namespace/version/checksum/applied_at 只记录实际成功。

基线 CREATE TABLE/INDEX 幂等，MySQL 索引内联，必要静态记录用 WHERE NOT EXISTS 守护。SQLite 不声明外键（运行时关闭，业务事务负责引用）；PG/MySQL 保留现有外键、排序规则与约束。正式版后 SQL 冻结，只追加下一个版本，遵循 [迁移规范](../docs/02-standards/database-migrations.md)。

platform 基线包含 `unicore_roles.version BIGINT NOT NULL DEFAULT 1`，已有及新建角色从 1 起。基线重放幂等不代表正式版后追加的 ADD COLUMN 可以盲重试；MySQL DDL 可能已提交但账本未登记。失败停止业务，不能只看列存在就补造账本、改 checksum 或删除版本行；使用匹配程序与升级前完整快照恢复到新目录/空专用库，再核验并处理。新角色权限不在 SQL 自动授给旧角色。

验收脚本只使用新建的随机本地 Docker 容器/tmpfs、loopback 端口和临时凭据，需要缓存 postgres:15、mysql:8.0 及满足 go.mod 的本地 Go。它验证七组合空库/Seed/业务、基线重放、带数据追加和旧 Catalog 拒绝未来库，以及安装配置到原生备份恢复。不会接管已有库，不自动拉镜像；输出目录必须不存在，结束清理本次资源。追加迁移还须验证匹配旧 Catalog 到新版本的数据保留和快照回退，不能以空库检查代替真实升级演练；结果只放会话或 build/、CI artifact。

备份 schema=1 表示 unicore-1 世代，不表示各 namespace 当前版本。发行包另列 namespace_versions，签名 OTA 只接受相同 schema_generation/schema_fingerprint；追加迁移改变三个 UI profile 指纹，有迁移的更新走停服备份后人工部署：tar 替换完整包，Docker 外部换镜像，desktop 退出后换原生包。恢复保留匹配程序和完整快照，不修改账本或用旧 binary 直接打开新库；恢复工具不迁移，后续正常启动才向前执行。见 [更新手册](../docs/03-runbooks/updates.md) 与 [备份恢复](../docs/03-runbooks/backup.md)。

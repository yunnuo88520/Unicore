---
name: db-migration
description: 创建 Unicore 分方言数据库迁移、兼容评估与数据恢复说明。
metadata:
  author: yunnuo <ymz@ebox.vip>
---

# db-migration

## trigger

数据库 schema/迁移/版本元数据/启动校验/恢复边界任务。先读 docs/02-standards/database-migrations.md、ADR-0024 和当次授权；ADR-0023 保守方案已被取代。

## current-stage

The catalog executor `migrations/runner` is wired into install and startup (single-track world; the original 42 SQL and legacy executor are removed). Baselines define `unicore_`-prefixed final states directly and must stay replay-idempotent (IF NOT EXISTS everywhere, guarded seed rows, MySQL indexes inline). Legacy two-column ledgers are refused (`ErrLegacyLedger`), as is any non-empty database without a catalog ledger (`ErrForeignDatabase`). Never hand-edit generated catalogdata/metadata files; register new migrations in catalog.json and run pnpm generate:migrations. Frozen SQL is append-only; replay idempotency is part of acceptance (see migrations/README.md and ADR-0025 including its R1.0c section).

## inputs

阶段授权、profile、namespace、三方言、支持的源世代/版本、数据规模及停机/备份恢复窗口。

## steps

1. 检查HEAD/branch/dirty并保留已有工作；读产品/架构、新迁移规范及相关ADR，基于真实代码/DB证据，不抄历史结果。
2. 新世代仅catalog.json定义预期集合：core（所有DB产品）、platform（当前三个UI profile共享；不等于装配身份治理）、module.<slug>（Notes=module.notes），各自从1递增，明确依赖/Profile/三方言SQL。CLI不import数据库/迁移资产。Catalog now exists; Profile namespaces are membership only. Derive order exclusively from depends_on with deterministic topological sorting. Check pnpm check:migrations and test:migrations; never hand-edit generated metadata.
3. SHA-256取原SQL字节；Go/JS/发行/OTA/ops向量及账本引导DDL只生成，不手填最大版本。目标账本(namespace,version,checksum,applied_at)，联合主键namespace+version，成功才登记。
4. 首个正式 stable release 后 SQL 冻结，只追加版本；正式发布前维护者可明确授权 squash 开发基线（不可将历史整合状态当成当前目录；当前 core@1、platform@3、module.notes@1，@2 收件箱 actions 已存在，@3 追加角色 version，不改写 @1/@2），不得对旧开发库自动 reset 或篡改账本；不得规范化行尾再改hash。基线不含密码/hash/密钥/用户数据；角色权限/管理员/设置交Go Seed，保留有运行代码依赖的静态基础记录。
5. 仅用当次授权的显式隔离库真测空库、合法前缀、重复执行、future/unknown/gap/checksum/Profile/legacy拒绝及失败恢复。清除不明APP_*/UNICORE_*配置，不触碰已有开发/生产库。三方言和Profile分别记pass/fail/skip。迁移执行优先复用 migrations/runner（锁、账本校验、事务登记已内置），不为任务重写执行逻辑。
6. 写前完整检查；SQLite验证DB/WAL/SHM零提前写；PG/MySQL固定连接+DB级互斥，MySQL承认隐式DDL提交。无force/skipValidation、删账本、补造checksum或自动reset后门。
7. 同步SQL/catalog、生成消费者、需求/架构/规范、测试与运行手册；本轮证据只放会话/build/或CI artifact，不写入docs。三个namespace不能压成旧两整数手抄。只审计任务不擅自转实施。
8. 依 docs/adr/ADR-0046-credential-delegation-role-concurrency.md 保留三个UI profile当前platform成员，Standalone/desktop同步迁移但不开放身份治理，数据库隔离另行决策。按catalog检查结构，不硬编码旧本地表数。基线幂等不代表追加ALTER可盲重试；MySQL DDL可能提交但账本未登记，不能按列存在补账本，失败恢复匹配快照到新空目标。追加迁移验证旧匹配Catalog到新库的数据保留/失败恢复，不以空库替代升级演练；指纹变化按runbook人工部署，不能仅回退binary。

## output

影响矩阵、SQL/catalog或设计、真实七组合/方言证据、数据/约束差异、失败恢复、docs/adr、未验证项和隔离资源清理。

## forbidden

CLI加载SQL；给新模块另建business_migrations；跨namespace串版本；只测一种宣称全支持；检查前创建SQLite/WAL；自动DROP/reset、改checksum；仅换旧binary承诺回退；将真实凭据写入证据/SQL。

## validation

按授权运行生成检查、make docs/test、相关profile构建及目标OS实测，区分代码/构建/自动化/原生/生产。以当前Catalog与真实源码为准，不引用历史阶段结果作为当前通过证据；统一账号、文件/邮件/公告/收件箱、角色版本、Notes软删乐观锁及附件引用按受影响面回归。开发重建见docs/03-runbooks/development-database-reset.md，采用新空目标而非接管旧库。

R1.0b generation identity persists as the actual core@1 ledger checksum, with per-dialect expected anchors generated from raw SQL. Keep four columns; no separate settings marker or fabricated ledger row. Username/email comparison changes, install_state singleton CHECK and additional length CHECK remain proposals; preserve current login and SQLite rowid behavior until reviewed. New roots are core/platform/modules; old dialect roots are excluded from registration checks.

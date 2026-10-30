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

Pre-1.0 squash is approved. New SQL/catalog/data generation assets exist; see migrations/README.md and ADR-0025. The product still uses the original 42 SQL and legacy executor. R1.0c startup validation/locks/engine/metadata consumers require separate authorization. Do not remove legacy files or activate the new ledger early.

## inputs

阶段授权、profile、namespace、三方言、支持的源世代/版本、数据规模及停机/备份恢复窗口。

## steps

1. 检查HEAD/branch/dirty并保留已有工作；读产品/架构、新迁移规范及相关ADR，基于真实代码/DB证据，不抄历史结果。
2. 新世代仅catalog.json定义预期集合：core（所有DB产品）、platform（仅平台）、module.<slug>（Notes=module.notes），各自从1递增，明确依赖/Profile/三方言SQL。CLI不import数据库/迁移资产。Catalog now exists; Profile namespaces are membership only. Derive order exclusively from depends_on with deterministic topological sorting. Check pnpm check:migrations and test:migrations; never hand-edit generated metadata.
3. SHA-256取原SQL字节；Go/JS/发行/OTA/ops向量及账本引导DDL只生成，不手填最大版本。目标账本(namespace,version,checksum,applied_at)，联合主键namespace+version，成功才登记。
4. 新世代SQL一旦分发（含preview）不可修改，只追加版本；不得规范化行尾再改hash。基线不含密码/hash/密钥/用户数据；角色权限/管理员/设置交Go Seed，保留有运行代码依赖的静态基础记录。
5. 仅用当次授权的显式隔离库真测空库、合法前缀、重复执行、future/unknown/gap/checksum/Profile/legacy拒绝及失败恢复。清除不明APP_*/UNICORE_*配置，不触碰已有开发/生产库。三方言和Profile分别记pass/fail/skip。
6. 写前完整检查；SQLite验证DB/WAL/SHM零提前写；PG/MySQL固定连接+DB级互斥，MySQL承认隐式DDL提交。无force/skipValidation、删账本、补造checksum或自动reset后门。
7. 同步SQL/catalog、生成消费者、需求/架构/规范、测试、运行手册和本轮证据；三个namespace不能压成旧两整数手抄。只审计任务不擅自转实施。

## output

影响矩阵、SQL/catalog或设计、真实七组合/方言证据、数据/约束差异、失败恢复、docs/ADR、未验证项和隔离资源清理。

## forbidden

CLI加载SQL；给新模块另建business_migrations；跨namespace串版本；只测一种宣称全支持；检查前创建SQLite/WAL；自动DROP/reset、改checksum；仅换旧binary承诺回退；将真实凭据写入证据/SQL。

## validation

按授权运行生成检查、make docs/test、相关profile构建及目标OS实测，区分代码/构建/自动化/原生/生产。R1.0a只证明历史结构/Seed/约束，不代表新baseline/锁/WAL保护通过。对比docs/04-ai/evidence-r10a并解释有意差异；文件/双身份/邮件/公告/Notes软删乐观锁及附件引用回归不可省。开发重建见docs/03-runbooks/development-database-reset.md，采用新空目标而非接管旧库。

R1.0b generation identity persists as the actual core@1 ledger checksum, with per-dialect expected anchors generated from raw SQL. Keep four columns; no separate settings marker or fabricated ledger row. Username/email comparison changes, install_state singleton CHECK and additional length CHECK remain proposals; preserve current login and SQLite rowid behavior until reviewed. New roots are core/platform/modules; old dialect roots are excluded from registration checks.

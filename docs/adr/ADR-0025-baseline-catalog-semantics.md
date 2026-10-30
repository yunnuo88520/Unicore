<!-- Author: yunnuo <ymz@ebox.vip> -->
# ADR-0025：新基线 Catalog 与跨方言语义

日期：2026-10-30。范围：维护者授权的 R1.0b，承接维护者已批准的 Pre-1.0 Migration Squash 方向（历史决策编号 ADR-0024，本候选不收录该历史文件）。本 ADR 明确 Catalog、生成物和基线行为；R1.0c 执行器、写前检查、锁、WAL/SHM、OTA/备份消费者均未实施。用户名/邮箱新比较策略和安装标记 CHECK 只提出建议，**不擅自改变现有登录或安装规则**。

## 本阶段目标、前置事实与取舍

维护者已确认没有需要兼容的外部用户或真实业务数据库，允许不兼容 0.1.x 开发库并建立干净的 1.0 初始基线。这是既有 ADR-0024 的前置决策，**不是本 ADR 新作出的兼容政策**。本阶段只构建、生成和验证新资产；新执行器、安装/启动切换以及旧活动 SQL 的移除仍留给另行授权的 R1.0c。

| Profile | Catalog 命名空间成员 | 数据库 |
| --- | --- | --- |
| web-platform | core + platform + module.notes | SQLite / PostgreSQL / MySQL |
| web-standalone | core + module.notes | SQLite / PostgreSQL / MySQL |
| desktop | core + module.notes | 仅 SQLite |
| cli | 空集合，不导入数据库/SQL/迁移包 | 无 |

core 包含安装标记、设置和审计三张基础表；platform 包含 24 张平台表；module.notes 包含一张最终软删除笔记表及两个原有索引。每个命名空间独立从 version=1 开始，三方言共九份 SQL。新结构来自历史迁移真实执行后的目录，不能简单拼接旧 SQL；必要静态位置留在 SQL，角色/权限、管理员和设置仍由现有 Go Seed 初始化。

表数口径：上述 3/24/1 仅统计各 namespace 基线 SQL 定义的应用表。另有一张独立的 `schema_migrations` 迁移账本，其 DDL 由 Catalog 顶层 `ledger` 定义生成，不属于任何 namespace 的迁移 SQL，也不新增 namespace；账本中的 `namespace` 字段记录对应命名空间。七组合实测与 schema inventory 的表数包含该账本，因此 web-platform 为 3 + 24 + 1 + 1 = 29 张，web-standalone 与 desktop 为 3 + 1 + 1 = 5 张；CLI 不创建数据库或账本。

选择 Catalog 单源加生成投影，是为了让 Go 与发行/运维工具共享同一预期集合，而不是各自手填版本。SQL 是执行内容及原字节 SHA-256 的来源，Catalog 是预期集合/依赖/Profile/账本结构的定义，数据库账本仅记录实际执行事实；生成 Go descriptor 和 JSON 不能反过来成为手工定义。R1.0b 不接入运行时，保留旧 42 SQL 与执行器，可独立撤回新资产，避免把新结构验证和启动安全重构捆成一次切换。

七份 `docs/04-ai/evidence-r10a/<dialect>-<profile>.json` 是此候选唯一的历史比较输入。它们来自维护者工作区先前 R1.0a 的隔离数据库实测，尚未进入父提交；不是某个已提交 R1.0a commit 的产物。`scripts/compare-baselines.py` 固定读取这七个文件，不读取历史 Markdown、旧 ADR 或其余证据。文件路径、来源和 SHA-256 见 [验收报告](../04-ai/acceptance-r10b.md)；原始摘要与入口/收尾保护记录一致。本轮新数据库输出写入另一个独立目录，不能用历史 JSON 冒充本轮执行成功。

## 单源和确定性

迁移定义唯一来源为 migrations/catalog.json。每个 namespace 独立从 1 连续追加，files 显式引用三个方言原 SQL。checksum/文件大小/最大版本/执行顺序/世代锚点摘要不手填，由 scripts/generate-migrations.mjs 生成 Go descriptor 及 metadata.gen.json。Catalog 的 sql_roots 只覆盖 core/platform/modules；旧 sqlite/postgres/mysql 目录继续由旧执行器使用，不纳入新登记检查。

Profile 的 namespaces 仅表示集合，数组位置没有顺序语义；namespace.depends_on 表示唯一依赖边。全图 Kahn 排序，每轮可选节点按 ASCII namespace 标识升序取一个，再按成员集合过滤；各 namespace 内 version 正整数升序。依赖必须存在、无环且包含在该 Profile 集合内。输出中的 order/levels 是生成投影，不能反向手改。改变 Profile 数组/声明顺序不会改变投影；改变边才可能改变顺序，测试覆盖这两种情况。

生成器拒绝重复 JSON key、未知字段、版本重复/缺口/非整数、漏方言、Profile 泄漏、CLI 非空、依赖不闭合、路径越界/链接/特殊文件、新根未登记 SQL 和手写 checksum/max 字段。生成前先验证所有输入与输出边界；--check 不写文件。它只做数据生成，不连 DB、不执行 SQL、不接管安装。

## 世代的实际持久化

账本仍为四字段 schema_migrations(namespace,version,checksum,applied_at)，联合主键(namespace,version)。DDL 从 Catalog ledger 字段生成，不由九份 SQL 各自复制，也不增加第五列或第四个 namespace。

schema_generation=`unicore-1` 是对这套初始世代的名称，不是“已安装”证明。数据库内的稳定锚点是**真实执行 core@1 后登记的那一行原字节 checksum**。Catalog generation_anchor 仅定义 core/1 引用；三个摘要由生成器计算，Go/JSON 共用。SQLite/PG/MySQL 的 fixture 已真实落库并 SELECT 对比该锚点。core 后续追加版本不改变 core@1，不能为了修复不匹配而覆写它。

R1.0c 必须在写入前以“四列格式 + 当前方言 core@1 锚点 + 完整命名空间前缀/checksum + Profile/目标身份”识别兼容性；四列表但缺锚点、未知锚点、混合旧账本一律不能冒充当前世代。名字只存在于发行元数据不构成漏洞，因为识别依据是持久化且不可修改的 SQL 指纹；也不能只靠锚点忽略其他已执行项。旧两列账本仍按 ADR-0024 返回 legacy_schema_requires_reinstall。

本轮的 fixture 只对全空目标执行 version=1 并记录事实，用来验证新 SQL/账本 DDL/Seed；没有实现产品迁移执行器、部分状态恢复或启动校验。不能将它当作升级命令提供给用户。

## 基线与行为契约

| 层/内容 | R1.0b 的明确契约 |
| --- | --- |
| 结构 | core 三表、platform 24 表、Notes 最终十字段与两个原索引；平台 28 张应用表，本地四张，另有统一四列账本。管理员/用户保持物理分表 |
| SQL 数据 | 只有平台 local、legacy-brand 两行无凭据存储位置。角色/权限/管理员/设置/实例/密码/密钥由原 Go 安装/Seed；不重放 0007 清理、0008 搬迁 |
| 主键 | 所有文本和联合主键组件显式 NOT NULL，并逐组件真实 NULL 插入验证。SQLite install_state INTEGER PRIMARY KEY 保留遗漏/NULL→rowid 自动分配；PG/MySQL 保留显式 id 语义 |
| 关联/索引 | 保留所有 PK/唯一/FK/动作、普通查询索引；按实际键列、顺序、唯一性、引用和覆盖用途比较，不能比较引擎自动索引数量判断一致性 |
| 业务写入 | 通过现有 Go usecase/service 输入校验，规范值在三 DB 上读写/唯一性/软删/乐观锁一致；Repository 和直接 SQL 不是可绕过校验的业务入口 |
| 非法超长直接 SQL | SQLite VARCHAR 不限长，PG/MySQL 字符字段限长。本轮不声称非法 SQL 三方言等价；Go 之外的导入/维护写入必须按同一规则校验。是否增加 DB CHECK 另审阅 |
| 登录键 | 保持已有注册、安装、管理创建、登录的 TrimSpace+ToLower。ASCII 用户名校验为 3–64 字符；邮箱依现有解析规则，最长 254 字节。不改变 collation、查询 SQL 或归一化算法 |
| 默认/重复 Seed | SQL 前无账号/密钥/业务内容；Go Seed 创建本轮显式合成管理员。重复 install id=1 被主键拒绝；重复真实 Seed 返回 ErrConflict 后 rollback，角色/权限/账号/审计无重复，不将安装专用 Seed 宣称为成功返回的通用幂等初始化 |

长度的实码审计和完整数据对比见 [验收报告](../04-ai/acceptance-r10b.md)。Notes 120 Unicode 字符标题实际通过三 DB，121 被 Go 拒绝；audit actor_id 的直接 SQL 65 字符在 SQLite 接受、PG/MySQL 拒绝，差异保留。若将来允许导入器/其他写入端绕过 Go，应对关键 identifier/hash/有限枚举等建立集中验证，必要时另加 CHECK，不能仅改 VARCHAR 声明。已用临时 TEXT CHECK 验证 SQLite/PG 的 length、MySQL 的 CHAR_LENGTH 对 64/65 Unicode 字符边界；未加入本次 baseline。

## 两项需要维护者后续决定的建议

用户名/邮箱：主要服务路径现在已经统一 lower+trim，真实创建/大小写登录/规范值重复均通过。但原 SQL 插入 Case/case 用户名或邮箱时，SQLite/PG 可并存，MySQL utf8mb4_0900_ai_ci 拒绝；MySQL 还存在重音比较风险。建议先明确邮箱国际化/本地部分政策，再以服务层规范化键和显式 binary/codepoint 唯一约束统一，必要时增加独立 canonical 列；不能仅把 PG 改 ILIKE 或 MySQL 改某个大小写排序规则。需注册/登录/OIDC/管理创建/导入同改、冲突检查和独立评审，不在 R1.0b 悄悄实施。

install_state：建议将来增加 CHECK(id=1)（SQLite/PG；MySQL 8.0.16+ 用 enforced CHECK），保留 PK。三方言的临时表均验证 id=1 成功、0/2 和重复 1 失败。本次 baseline 仍保持原字段/主键，无该 CHECK，id=2 仍可直接插入；正常代码只写/锁 id=1。SQLite 加单例 CHECK 后第二次自动 rowid 也会被拒绝，这是单例语义的有意限制，应先审阅，不能误称与当前 rowid 行为完全相同。未声明旧 MySQL/MariaDB 因此通过。

## 回退与下一阶段

新旧目录在本阶段并存；assets.go、旧 Store.Migrate/安装/启动/OTA/ops 未改，正式程序不会执行这九份 SQL。只生成数据包和测试工具不等于运行时启用。回退本阶段是撤回新 SQL/Catalog/生成器/质量入口/文档，保留此前修改，不回滚数据库，因为现有环境未被修改。临时库销毁，无需 down SQL。

R1.0c 另获授权后才接入目录/统一执行器、只读拒绝矩阵、DB 互斥、MySQL 失败处理和各元数据消费者，并在那时决定移出旧活动 SQL。不能提前删除旧目录，不能把新 fixture 的四列账本当作已验证的升级恢复功能。

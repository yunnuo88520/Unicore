<!-- Author: yunnuo <ymz@ebox.vip> -->
# R1.0b：新世代初始基线、Catalog 与真实等价验收

日期：2026-10-30。基线 `main` / `cecf28115d3d4d6e36b425557e6c6388e754fae8`，进入时已有 66 个 pending 文件（含 R0、R1.0a 和历史审计）；不是干净 HEAD 或远端 CI 结果。维护者授权本阶段构建新资产和隔离验证，**没有授权 R1.0c 运行时切换**。最终文件保护清单见第 10 节。

## 最小候选的文档与历史夹具边界

本文下方保留首次 R1.0b 在混合工作区中的技术验收和文件保护事实；它们不自动等于本次最小候选的完整门禁结果。第三轮候选只以父 HEAD 加上 51 个明确归属文件和七份必要历史 JSON 构建，不纳入 ADR-0024 或其他历史重叠文档。ADR-0025 以文字编号追溯已批准的历史方向，并在本阶段范围内自包含地说明设计；没有改写历史决策。第 10 节的 12 文件列表和保护 JSON 仅描述当时工作区，不是当前候选的暂存清单，也不是要求这些路径存在的文档链接。

`compare-baselines.py` 实际读取下表七个历史输入；它们从原工作区的 R1.0a 实测证据逐字节复制，SHA-256 同时匹配 R1.0b 入口与收尾记录。父提交不含这些文件，因此不宣称它们来自已提交的 R1.0a commit。JSON 是比较夹具，不依赖其余历史文档，也不能替代本轮重新执行的数据库验证。

| 历史输入 | 原字节 SHA-256 |
| --- | --- |
| [sqlite-web-platform.json](evidence-r10a/sqlite-web-platform.json) | `4e15da8220a33a2959f69ac9b7a3b58b23736cb5c005b88f328fe1d9dde54b32` |
| [sqlite-web-standalone.json](evidence-r10a/sqlite-web-standalone.json) | `a038d9dcab928266c0aa5a3b75ebd65615a8435bbdefa887bac76647a2b5f90b` |
| [sqlite-desktop.json](evidence-r10a/sqlite-desktop.json) | `a82669466462442a94da358ba9c2071a5697307aee8044af8cb81ead20ae10f4` |
| [postgres-web-platform.json](evidence-r10a/postgres-web-platform.json) | `b9e282cd6a80db426feaa9a3b827a9d79e538cd89e6a081f413215815b1f2533` |
| [postgres-web-standalone.json](evidence-r10a/postgres-web-standalone.json) | `a4ee64b346c3a1f1c4eee961703312ad31673cf25e308a100af79216f634bdbd` |
| [mysql-web-platform.json](evidence-r10a/mysql-web-platform.json) | `f5c87b48dafbdd51b8930434b9cb87a79887fb3a940398e6b02674d129297ce8` |
| [mysql-web-standalone.json](evidence-r10a/mysql-web-standalone.json) | `3b5e60fd53f639a68a886d9ef4fd8baa065daf7111d16c9c8d4ddaba20b537f1` |

完整候选门禁、当前执行时间和相对父提交的差异由本次独立候选报告记录；未通过完整门禁时不建议提交，不回写或改称首次证据为当前结果。

## 1. 结果与证据等级

新九 SQL 已真实执行，Catalog 静态校验、Go/JSON 生成投影及重复生成检查分别验收；不能用其中一项代替其他检查。新运行时执行器、启动保护、产品发行和生产验证均未完成。

| 数据库 / Profile | 新 SQL 实际执行 | 新旧结构/Seed 对比 | 表 / 字段 | NULL 主键组件测试 |
| --- | --- | --- | ---: | ---: |
| SQLite / web-platform | PASS | PASS，0 意外差异 | 29 / 164 | 33 |
| SQLite / web-standalone | PASS | PASS，0 意外差异 | 5 / 24 | 6 |
| SQLite / desktop | PASS | PASS，0 意外差异 | 5 / 24 | 6 |
| PostgreSQL / web-platform | PASS | PASS，0 意外差异 | 29 / 164 | 33 |
| PostgreSQL / web-standalone | PASS | PASS，0 意外差异 | 5 / 24 | 6 |
| MySQL / web-platform | PASS | PASS，0 意外差异 | 29 / 164 | 33 |
| MySQL / web-standalone | PASS | PASS，0 意外差异 | 5 / 24 | 6 |

实际 DB：SQLite 3.54.1、PG 15.17 arm64、MySQL 8.0.45 arm64；主机 macOS arm64，Go 1.26.10、Node 22.22.2、pnpm 11.25.0、Python 3、Docker 29.9.2。每组合完整原始目录、列/类型/默认值、索引、约束/外键动作、SQL-only/Seed 数据摘要、NULL/大小写/长度/单例/业务探针见 [结构和 SHA 清单](evidence-r10b/inventory.md)、[执行日志](evidence-r10b/execution.log.txt) 和 [逐项等价 JSON](evidence-r10b/comparison.json)。

总计 123 次文本/联合主键 NULL 组件探针，全部因对应非空约束拒绝；SQLite 三 Profile 各验证遗漏和显式 NULL 的 INTEGER 主键自动分配。这里的 desktop 是新 SQLite 数据层 fixture，未调用仍使用旧迁移的 bootstrap/local.Open，更没有启动 Wails 窗口。

## 2. 新旧资产、完整 Catalog 与九 SQL

完整定义见 [catalog.json](../../migrations/catalog.json)，九文件原字节 SHA-256 和路径见 [生成清单](evidence-r10b/sql-inventory.json) 及 [可读表格](evidence-r10b/inventory.md)。core=3 表、platform=24 表、module.notes=1 表，各方言各 version=1；字段顺序来自实际最终目录，Notes 十字段中 deleted_at 在末尾，保留两个索引。

新 SQL 从 R1.0a 实际目录重建并审查，不是拼接历史文件，也不是复制 Markdown 后未经执行就算完成：PG 以实际列/约束/indexdef 重建；MySQL 保留 SHOW CREATE TABLE 的 InnoDB、utf8mb4_0900_ai_ci、唯一键和 FK 支撑索引；SQLite 保留表/索引结构并只对文本主键补显式 NOT NULL，INTEGER PRIMARY KEY 不改。

平台静态 INSERT 只有 local 与 legacy-brand 两行，凭据/endpoint/bucket 为空；SQL-only 阶段用户、管理员、角色、权限、默认设置、笔记、邮件、公告全部零行。旧 0007 的权限/凭据清理和 0008 的身份搬迁均不进入新基线；直接创建双身份最终表。没有密码、hash、密钥、演示用户或业务内容，不复制旧账本。

旧 42 SQL 继续位于原三个方言根/business 子目录，assets.go 和旧 Store.Migrate 未改。新目录只在 core/platform/modules，尚未 embed 到运行时；生成 descriptor 放在独立 catalogdata 包，产品和 CLI 不 import 它。旧运行时仍按原两张账本工作，不能用这个版本打开独立 fixture 的新库。详见 [目录说明](../../migrations/README.md)。

## 3. Catalog 与生成器

唯一定义为 Catalog 的 namespace/version/依赖/SQL 引用/Profile 成员/ledger；不手填 checksum 或最大等级。Profile namespaces 是成员集合，depends_on 是唯一顺序来源；Kahn 排序每轮选 ASCII 标识最小的可执行节点，生成当前平台顺序 core→module.notes→platform，本地 core→module.notes。version 由每 namespace 定义连续升序。生成的 order/levels 只是投影。

实现：[generate-migrations.mjs](../../scripts/generate-migrations.mjs)。输出 [Go descriptor](../../migrations/catalogdata/catalog.gen.go) 与 [发行/运维 JSON](../../migrations/metadata.gen.json)，包含全部原 SQL hash/字节数、namespace 版本向量、成员/排序、三方言账本 DDL 和世代锚点。旧发行、OTA 和备份消费者本轮尚未切换，不能认为它们已使用新向量。

严格校验：重复 JSON 属性、未知字段/手写 checksum/max、重复/缺口/非正整数版本、漏方言、依赖环/不闭合、Profile 泄漏/CLI 数据库成员、越界/链接/特殊文件、文件版本不符及新根漏登记均拒绝。旧目录明确排除。输出边界先校验，--check 不修改文件。输入原字节含作者头/换行参与 SHA-256，CRLF 改变会被检出；新增 .gitattributes 对新 SQL/两投影禁用 checkout 文本转换。

测试包括打乱成员/声明数组不改变输出、额外模块依赖边改变排序、连续生成一致、Go 与 JSON 逐字段一致、源文件 hash/大小、CLI 空元数据、生成内容篡改/过期拒绝。make docs 生成，make test 执行检查与专门测试；具体最终命令和计数见第 9 节。

## 4. schema_generation 与账本持久化

账本 DDL 从 Catalog ledger 字段生成：namespace/version/checksum/applied_at 四列，联合主键(namespace,version)，UTC Unix 秒。没有第五列、额外世代表、settings 副本、version=0 或伪造账本标记。

schema_generation=unicore-1 是这套基线世代的名字。实际 DB 的识别依据为真实执行后持久化的 core@1 原 SQL checksum；Catalog 只定义 anchor 引用，三个方言的预期摘要均从 SQL 生成。fixture 在七个新库中真实登记并 SELECT 校验这个锚点，不只是 JSON 中放一个字符串。core 追加后续版本不更改锚点。

未来 R1.0c 必须在写入前校验四列格式、锚点、完整 namespace 前缀/checksum、Profile 和目标身份，不能只比较世代名字或 MAX。本阶段没有实现该拒绝/启动保护；独立 fixture 的已知空库执行代码不能用于迁移真实数据库。见 [ADR-0025](../adr/ADR-0025-baseline-catalog-semantics.md)。

## 5. 新旧结构对比与有意差异

按每个组合分别对照保存的 R1.0a 实际目录，比较应用表集合、字段顺序/类型/可空/默认值、主键/唯一键、FK/动作、索引键列/顺序/唯一性/表达式/前缀、MySQL engine/charset/collation。比较器见 [compare-baselines.py](../../scripts/compare-baselines.py)。不以 SQLite rowid、PG 主键索引、MySQL FK 自动索引的数量判断一致性；原双 Notes 索引均保留。

有意差异只有：

- 两张旧账本替换成四列统一账本，平台表数 30→29，本地 6→5；账本字段总数恰好相同，所以总字段仍为 164/24。
- SQLite 平台 23 个文本 PK 字段、本地两文本 PK 字段显式非空；联合键本来已有非空，仍逐组件测试。三个 INTEGER PK 中旧两张账本退出，install_state 保留 rowid 语义。
- 平台 SQL-only 的两角色/一权限暂态消失，全部由 Go Seed 初始化；安装完成后角色、权限、grants 和其他应用表行数与旧验收一致。

PG/MySQL 应用结构未发现其他差异。所有组合均没有意外列/索引/FK/default 或必要静态行变化。三方言自身的 collation、VARCHAR 长度等差异仍存在，不能把“同方言新旧等价”描述成“所有非法 SQL 三方言完全等价”。

## 6. 长度、用户名/邮箱与安装标记

| 现有 Go 路径 | 实际校验/处理 | 本轮结论 |
| --- | --- | --- |
| platform.ValidateAccount | ASCII 用户名正则 3–64；解析后原样邮箱且 len<=254；密码 12–128 字节 | 用户名上限与 VARCHAR 一致，邮箱是字节上限；直接 Repository/SQL 不自动获得校验 |
| install.manager、Service.Create、Accounts.Register/RegisterCode、Login/Request/RequestCode | 写入或查询前 strings.TrimSpace+ToLower | 保持现有规则；三方言真实 Service.Create/Login 验证用户名/邮箱混合大小写、规范值重复拒绝。未运行真实 SMTP/完整注册 HTTP |
| domain.ValidateNote / usecase.Notes | 标题 1–120 rune、正文<=5000 rune、状态 open/done、最多五附件/ID<=80；查询/更新另有限制 | 新库上 120 个中文字符通过，121 被 Go 拒绝；scope 等内部入口仍需由组合根保证边界 |
| domain.Announcement / usecase.Announcements | 内容<=500 rune、备注<=100 rune、HTML 输出<=20000 字节、类型/状态/时间范围 | 新库通过真实保存/读取/软删/授权验证；不把 DB TEXT 当无限业务输入 |
| settings.SettingDefinition 与 files.validLocation/输入处理 | 设置分项 rune/枚举/范围校验；位置名、bucket、endpoint 等独立规则 | 不能推导所有内部 adapter 字段都有统一长度保证，新增模块必须在用例入口显式校验 |
| audit actor_id / SQL 工具等内部写入 | 没有通用的自动 VARCHAR 长度校验 | 65 字符直接 SQL 在 SQLite 仍可写，PG/MySQL 拒绝；不掩盖此差异 |

当前契约：业务必须经 Go service/usecase 校验；SQLite VARCHAR 不限长。需要多个受信写入端/导入绕过 Go 时，应对关键 identifier/hash/有限值建立共享校验，必要时用 DB CHECK 作为底线。显式长度提案使用 TEXT CHECK：SQLite/PG length(value)<=64，MySQL CHAR_LENGTH(value)<=64；七组合临时表已验证 64 个 Unicode 字符成功、65 失败，**未加入基线**。本轮不增加全表长度/STRICT/枚举 CHECK，避免未审阅的语义扩展。

大小写：正常服务写入/登录已有 lower+trim，保持此策略。原 SQL 的 Case/case 用户名和邮箱在 SQLite/PG 可并存、MySQL 当前 collation 拒绝；新基线直接 SQL 探针分别验证。建议先审阅邮箱国际化、本地部分与重音政策，再统一规范化键和 binary/codepoint 唯一性，必要时增加 canonical 列及冲突检查。不能仅改 ILIKE/collation，也不能宣称已经解决绕过 Go 的所有大小写差异。

安装标记：当前三方言都允许 id=2，只通过主键拒绝第二个 id=1；正常代码只访问/锁 id=1。建议后续 CHECK(id=1)，SQLite/PG 原生 CHECK，MySQL 8.0.16+ enforced CHECK。本轮每组合临时表都验证 id=1 成功、0/2/重复 1 拒绝，基线未加约束。SQLite 还验证遗漏/NULL 整数键自动分配为 2；若批准单例 CHECK，第二次分配被拒绝是有意的单例限制，不可悄悄算作本轮兼容修正。

## 7. Go Seed、基础数据与业务实测

各组使用实际 settings.Defaults；平台调用实际 platformsql.Repository.Seed，在隔离测试安装事务里写 marker/defaults/审计，不调用旧 Migrate 或伪造旧账本。平台 Seed 后：两角色、17 permissions、17 超管 grants、一名显式合成管理员、零普通用户、43 项设置；本地一项外观设置。角色/权限/位置逐行、各应用表行数和设置键集合均与 R1.0a 对比一致。

注意 SQL-only 不产生密码/用户；Go Seed 的验收明确提供一次性合成管理员和临时密码，只在本轮临时库生成实际 Argon2id hash。证据不导出密码/hash/密钥，临时库随后销毁。SecretStore、真实 SMTP/云服务不参与。

重复行为：同 marker id=1 被主键拒绝；再次调用真实 Seed，重复角色/权限语句不创建重复记录，创建同账号时 ErrConflict，显式 rollback 后角色/权限/账号/审计摘要均不变。Seed 是安装专用，不声称完整 Seed 第二次成功返回或改成 Upsert。现有安装流程未改。

每组合实际调用 Notes usecase+SQL adapter 完成 create/list/update、scope 隔离、版本冲突、软删/审计；三平台组合额外用真实身份服务完成普通用户创建、大小写用户名/邮箱登录与重复拒绝；文件服务在显式临时本地 blob store 上两次执行 legacy-brand fallback，只有一条文件元数据并正确读回字节，还验证上传会话 roundtrip；公告用真实 usecase/repository 验证管理员写/发布读取/软删以及普通用户写入拒绝。公告 Render 是固定测试替身，没有把这个验收扩展为 HTML 清洗或浏览器测试。

## 8. 隔离与清理

复现：[verify-baselines.py](../../scripts/verify-baselines.py)、[Go fixture](../../scripts/verify-baselines/main.go)、[目录查询](../../scripts/verify-baselines/inventory.go)、[对比工具](../../scripts/compare-baselines.py)。仅在明确新建空库上运行 version=1，不提供升级/重试/恢复/锁或绕过校验的产品 API。

最终运行 2026-10-30 02:37:46–02:37:59 UTC：新建 unicore-r10b-pg-0cca6495（127.0.0.1:63956，512MiB tmpfs）与 unicore-r10b-mysql-0cca6495（127.0.0.1:63971，1GiB tmpfs）；随机凭据与 SQLite 在唯一临时目录，配置 0600。清除 APP_*/UNICORE_*/PG*/MYSQL*/DB_*/DATABASE_URL；只用 local Unix-socket Docker、缓存镜像 --pull=never，无持久卷，无已有实例继承。

两容器和 tmpfs、临时 SQLite/配置/密码/验证二进制均已 finally 清理，记录 [isolation-and-cleanup.json](evidence-r10b/isolation-and-cleanup.json)。首轮七组合已经通过，补充邮箱原 SQL 比较和临时长度 CHECK 后重跑；首轮输出保留在本轮独有 ignored build/r10b-initial-pass-evidence，首轮容器也已销毁。原有 stopped identity 容器未启动/连接/修改。

## 9. 生成、Go 与整体质量检查

完整输出见 [quality-gate.log.txt](evidence-r10b/quality-gate.log.txt)，重复生成摘要见 [generation-proof.json](evidence-r10b/generation-proof.json)。本轮使用上述 Node/Go 工具链，清除应用及数据库环境变量后执行；没有下载或升级依赖。

| 实际检查 | 结果 | 证明范围与限制 |
| --- | --- | --- |
| `python3 scripts/verify-baselines.py --output docs/04-ai/evidence-r10b` | PASS，7/7 | 七个独立空库的新 SQL、账本 DDL、实际 Go Seed、业务探针和新旧目录比较；不是运行时升级或产品安装验收 |
| `make docs` | PASS | 新迁移投影、既有设计/品牌资产、AI context 和 29 个 Wiki 页面生成；没有发布 Wiki |
| `pnpm check:migrations` / `pnpm test:migrations` | PASS，26/26 测试 | Catalog 静态约束、原字节摘要、确定性排序、越界/链接拒绝、生成投影漂移；没有因此证明数据库执行正确 |
| 连续三次生成，再执行 `--check` | PASS | 两投影三次字节相同；check 前后 mtime 未变。Go SHA-256=`9fe296f21b1e9a6215760e416ac89acfc5eb3cf419a567f08443197ab5ddc758`，JSON SHA-256=`bea6ab373e630d25d64517430fdb6e33f6c4dba07c9dff837984211d7596d056` |
| `go test -count=1 ./migrations/catalogdata` | PASS，0.597s | 强制本轮运行，验证 Go/JSON 完整一致、九原文件字节数/checksum、世代锚点和 CLI 空元数据 |
| `make test` | PASS，exit 0 | 既有工具测试 9 项、新生成器测试 26 项、版本/文档/设计/i18n/契约/作者/依赖边界、Go vet、默认与 updater race 测试、TS 类型检查及 Vitest 9 文件/47 测试 |
| 实际依赖图与边界检查 | PASS | CLI 136 包无 SQL/迁移依赖；server 400 包与 bootstrap/local 193 包均未引入新 catalogdata。五组边界检查通过，CLI 新增 migrations 前缀禁止项 |
| 最终生成/文档/作者/原 SQL/工作区保护/空白核对 | PASS | 详见 [收尾检查](evidence-r10b/final-checks.log.txt) 和第 10 节；不是 CI、发行、安全扫描或目标 OS 原生运行 |

`make test` 中新增 catalogdata race 测试本轮实际执行（1.408s），大部分既有 Go 包显示 `(cached)`，这是当前输入命中的测试缓存，不能写成全部 fresh 执行。前端 Vitest 与 Node 生成器测试本轮实际运行。真实三方言验证另有本轮执行日志，不能由缓存测试替代。

开发中发现并修正了生成器 project 路径末尾斜杠导致的父目录检查不终止、负向测试断言选错首先触发的防线，以及 fixture 的一个未使用 import；另补充输出悬空链接回归。最终命令无失败/跳过测试。首次七库通过后补充邮箱和 CHECK 提案探针并再次全量真跑，报告引用最后一轮，不把中间失败或首轮结果隐去后冒充只执行一次。

**未执行：**完整产品发行矩阵、Web `/install` 浏览器端到端、新世代原生 Wails 启动、Windows/Linux 目标系统实测、OTA/备份恢复、生产验证和本轮独立依赖安全扫描。数据 fixture、`go vet` 的编译检查、质量测试与正式产品构建/发行是不同等级；本阶段没有新增上述等级的支持声明。

## 10. 文件保护与修改清单

逐文件 before/after SHA-256、旧 SQL 对进入快照与 HEAD 的双重比较，以及本阶段新增文件清单见 [workspace-preservation.json](evidence-r10b/workspace-preservation.json)。HEAD/branch 仍为开头记录的 main/cecf281；没有 commit、stash、reset 或清理已有工作。

进入时 66 个 pending 文件全部保留：54 个字节不变，12 个有意追加当前阶段规范/状态/索引或重新生成 context。R0 的 logs_test.go、AGENTS.md/CONTRIBUTING.md、此前 README/发行/安全/OTA 文档、ADR-0023 和完整 R1.0a 报告/证据均与进入时 hash 相同。旧 42 SQL 全部同时匹配进入时 hash 与 Git HEAD；旧 assets.go、sqlstore/安装/启动/OTA/备份源码未产生本阶段变化。

| 本阶段修改组 | 文件 |
| --- | --- |
| 九个新增基线 | `migrations/core/{sqlite,postgres,mysql}/0001_initial.sql`、`migrations/platform/{sqlite,postgres,mysql}/0001_initial.sql`、`migrations/modules/notes/{sqlite,postgres,mysql}/0001_initial.sql`；逐个文件与 hash 见第 2 节清单 |
| Catalog/生成物与元数据测试 | `migrations/catalog.json`、`migrations/metadata.gen.json`、`migrations/catalogdata/catalog.gen.go`、`migrations/catalogdata/catalog_test.go`、`migrations/README.md` |
| 独立生成/验证工具 | `scripts/generate-migrations.mjs`、`scripts/generate-migrations.test.mjs`、`scripts/verify-baselines.py`、`scripts/verify-baselines/main.go`、`scripts/verify-baselines/inventory.go`、`scripts/compare-baselines.py` |
| 质量入口/checkout 字节保护 | `Makefile`、`package.json`、`scripts/check-boundaries/main.go`、`.gitattributes`；无依赖版本/锁文件/CI/部署配置变动 |
| 已有文件的有意更新（12） | `.agents/skills/{db-migration,add-go-module}/SKILL.md`、`docs/00-product/PRD.md`、`docs/01-architecture/architecture.md`、`docs/02-standards/{backend,database-migrations}.md`、`docs/03-runbooks/development-database-reset.md`、`docs/04-ai/commercial-roadmap.md`、`docs/04-ai/context.gen.md`、`docs/README.md`、`docs/adr/ADR-0024-pre1-migration-squash.md`、`framework.manifest.json` |
| 新增决策/报告/只读证据 | `docs/adr/ADR-0025-baseline-catalog-semantics.md`、本报告、`docs/04-ai/evidence-r10b/` 下七组 JSON/schema 导出、对比/SQL hash/清理/生成/质量/文件保护证据；完整路径列表在保护 JSON 中 |

无 internal/cmd/apps/packages 产品源码、本来已有的测试、依赖版本或生产配置的本阶段修改；现有 logs_test.go 的 pending 修改属于 R0，不归为本轮新改。新脚本/SQL/测试含作者头，严格 JSON 和生成投影遵守现有例外规则。构建过程中本轮独有的早期 `build/r10b-verifier` 已删除；未清理其他 build 内容。没有遗留本轮数据库或凭据。

## 11. 剩余风险和完整回退

- R1.0c 尚未实施：完整账本拒绝、未来/缺失/checksum/Profile/legacy、写前零修改、SQLite WAL/SHM、DB 迁移锁、并发/中断及 MySQL 部分 DDL 均未获本轮验收。fixture 成功不构成安全升级证明。
- 新 Go/JSON 元数据已生成，发行/备份/OTA 仍消费旧等级；后续统一接入三个 namespace 向量时需要新的格式/签名兼容测试，不能手改旧已签名清单。
- 主业务路径的 case/长度规则已明确，但外部导入、直接 Repository/SQL、MySQL 重音比较仍有方言差异；单例 CHECK 是待审阅提案。未宣称旧 MySQL/MariaDB、其他 PG/SQLite 版本或目标 OS 原生新基线运行均通过。
- 本地 Docker 真执行不是完整 Web 安装、Wails 原生运行、备份/OTA 演练或正式产品发行；没有安全扫描/生产验证。本轮不缩小任何既有 OS、数据库或部署支持范围。
- 回退代码/文档时只撤回本阶段新增资产/工具/生成物及质量/文档入口，保留进入时 66 个 pending 文件中的已有内容；禁止 reset --hard 或清理全工作区。旧 42 SQL/执行器/数据从未切换，不需要 down SQL 或现有数据库恢复。
- 本轮临时库已经销毁，无可回滚业务数据；本阶段新库不提供给旧程序使用。未来启用新世代后若需数据回退，使用匹配旧 binary+DB/data/config/key 的成套快照到新目标，不覆盖旧库、不修改 checksum 或删除账本。

完成 R1.0b 后停止，等待维护者审阅；未提交、推送、创建标签/Release、公开资产、发布镜像或操作生产实例。不自行开始 R1.0c。

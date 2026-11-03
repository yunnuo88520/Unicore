<!-- Author: yunnuo <ymz@ebox.vip> -->
# 数据库迁移目录：R1.0b 双轨状态

当前产品运行时仍调用旧 `Store.Migrate`，`assets.go` 只 embed 原 sqlite/postgres/mysql 及其 business 子目录的 42 份历史 SQL，以及本次追加的三方言 core/platform 两组 0013 固定前缀迁移。**本阶段没有切换安装/启动入口**，也没有提供可用于升级真实数据库的新执行器。0.x 文件、路径和 checksum 保持原样。

新世代定义只有 [catalog.json](catalog.json)，覆盖下列目录；校验器只扫描这三个根，不把旧 0.x SQL 当作遗漏登记：

```text
core/{sqlite,postgres,mysql}/0001_initial.sql
platform/{sqlite,postgres,mysql}/0001_initial.sql
modules/notes/{sqlite,postgres,mysql}/0001_initial.sql
catalogdata/catalog.gen.go    # 生成 Go descriptor，不由旧运行时/CLI import
metadata.gen.json             # 生成发行/运维投影，尚未接入旧消费者
```

各 namespace 独立 version=1。Profile 的 namespaces 仅为成员集合；depends_on 是唯一依赖来源。生成器使用 Kahn 拓扑排序，每次从可执行节点中按标识字节序选最小者，版本按正整数升序。当前平台顺序因此为 core→module.notes→platform；Notes 无平台 SQL 依赖。这是推导结果，不维护第二份顺序列表。

```sh
pnpm generate:migrations
pnpm check:migrations
pnpm test:migrations
go test -count=1 ./migrations/catalogdata
```

生成器不连接数据库；checksum 来自原 SQL 全部字节 SHA-256。生成物不得手改；make docs 生成，make test 检查漂移与生成器行为。`.gitattributes` 对新 SQL 和两份生成投影禁用文本换行转换，避免 Windows checkout 改变校验字节；生成器不会自行规范化输入。新迁移首次对外分发后冻结字节，只能追加下一版本。

schema_generation 是元数据中的世代名称，其数据库识别锚点是实际执行后持久化的 `(core,1,checksum,applied_at)`。每方言锚点 checksum 从原 SQL 生成，不能另写 settings 键、版本 0 或虚构账本行。后续启动须同时验证四列格式、锚点、全部 namespace、Profile 及原字节 checksum，不能只看名称或 core 最大版本。见 [ADR-0025](../docs/adr/ADR-0025-baseline-catalog-semantics.md)。本轮仅独立空库 fixture 验证持久化，不代表 R1.0c 保护已实现。

三方言语义见 [ADR-0025](../docs/adr/ADR-0025-baseline-catalog-semantics.md)，开发与恢复边界见 [迁移规范](../docs/02-standards/database-migrations.md)。验证工具仅用于自身新建的隔离目标：

```sh
python3 scripts/verify-baselines.py --output build/verification-r10b-new
```

工具拒绝覆盖已有输出，只使用本地 Unix-socket Docker、缓存镜像、新容器/tmpfs、随机 loopback 端口与临时凭据；清除 APP_*/UNICORE_*/数据库环境。需要已准备的 postgres:15、mysql:8.0、Go、Python、Docker；不会自动拉镜像，不接管现有容器。它是空库验收 fixture，不具备升级、重试、锁或恢复能力。不要绕过 runner 把 Go 验证程序指向已有数据。

当前产品在历史迁移完成后执行适用的 0013_prefix_core/platform.sql，将框架表与两张旧账本重命名为固定 unicore_ 前缀；记录实际适用文件的原字节 checksum，原 42 SQL 不变。旧执行器的中断 DDL 重试对历史 SQL 的固定框架标识符映射到新名称，字符串数据与自有业务表不改写。这是当前运行体系的名称兼容，不是 R1.0c 的新 namespace 执行器。尚未激活的九份 baseline 保留原字节；未来接入新执行器前须追加各 namespace 的前缀尾迁移并调整账本定义，不能直接使用这些历史 fixture 声称当前产品结构。见 [ADR-0029](../docs/adr/ADR-0029-fixed-framework-table-prefix.md)。

个人中心在现行固定前缀/旧账本之后追加 `{sqlite,postgres,mysql}/0014_personal_center.sql`，仅平台执行，增加两个身份域的个人安全、设备与邮箱换绑表。平台运行时等级14，本地/桌面13；不修改旧字节、不接入新 namespace baseline。兼容与恢复见 [ADR-0030](../docs/adr/ADR-0030-personal-center-security.md)。

公告通知追加当前运行体系 0015（三方言，platform-only）及未启用 Catalog 的 platform@2。原基线不变，新列与接收人/已读表的兼容及部分 DDL 恢复见 [公告手册](../docs/03-runbooks/announcements.md)。

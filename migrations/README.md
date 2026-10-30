<!-- Author: yunnuo <ymz@ebox.vip> -->
# 数据库迁移目录：R1.0b 双轨状态

当前产品运行时仍调用旧 `Store.Migrate`，`assets.go` 只 embed 原 sqlite/postgres/mysql 及其 business 子目录的 42 SQL。**本阶段没有切换安装/启动入口**，也没有提供可用于升级真实数据库的新执行器。0.x 文件、路径和 checksum 保持原样。

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

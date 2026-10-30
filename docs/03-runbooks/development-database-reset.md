<!-- Author: yunnuo <ymz@ebox.vip> -->
# Pre-1.0 开发数据库重建

维护者确认旧 0.x 库仅用于自己开发测试、无需保留真实业务数据，接受 [ADR-0024](../adr/ADR-0024-pre1-migration-squash.md) 的断代。**R1.0b 已构建新基线和 Catalog 并隔离验收，正式代码仍为旧体系**；新账本识别与 legacy_schema_requires_reinstall 在 R1.0c 才实现，不要提前手改旧账本或在当前程序上套新 SQL。

## 何时重建

包含新基线的版本完成 R1.0b/c 验收后，旧 schema_migrations(version,checksum) / business_migrations 将不被接管。错误 legacy_schema_requires_reinstall 要求开发者明确选择新空环境，不是系统已自动清库。没有 0.1.x→新世代桥接，也不承诺旧备份能用新程序恢复。

## 操作约定

1. 停掉自己明确拥有的开发 server/桌面进程，确认 APP_DATA_DIR、数据库 host/port/name 和容器/volume 归属。无法确认目标就停止，不查找或清理机器上其他数据库。
2. 即使不需要兼容，也建议保留旧目录和快照到验证结束；不要删除 installation.json/secret.key 来诱导程序重新初始化，不要 ALTER/DELETE 迁移账本。
3. SQLite 使用一个此前不存在的新绝对目录，旧目录不动；Web 正常访问 /install。桌面使用新 APP_DATA_DIR 后由正常首次启动创建。不要只替换 DB 文件而混用旧配置/密钥。
4. PG/MySQL 使用自己新建的空专用数据库和对应开发账号，通过安装页填写明确连接参数。旧库及其 Docker volume 不动；不将不明的继承 UNICORE_* / APP_* 凭据用于脚本。不要对生产、共享库或系统库执行 DROP。
5. 用正常安装输入创建管理员，检查默认 local 存储、设置、Notes 与重启；新 schema_migrations 应只有适用 namespace 的真实执行记录。不要导入旧 ledger 或旧整库 SQL。
6. 确认旧环境确实可丢弃后，由开发者另行选择移除自己拥有的旧目录/容器/volume；框架和新启动路径不代做这一步。禁止 docker system prune、清所有 volume 或未指定 project 的破坏性命令。

下面仅说明如何指定**新目录**；实际路径由开发者确认，不是本轮执行命令：

```sh
APP_DATA_DIR='/你的开发目录/unicore-next-web' APP_PROFILE=web-platform make dev-server
APP_DATA_DIR='/你的开发目录/unicore-next-desktop' make dev-desktop
```

Docker 必须明确自己项目的 compose project、映射端口与新数据卷，避免同名卷接回旧库；使用新空目标即可，不要求先删除旧卷。没有操作生产实例的授权时，不将本手册套用到线上环境。

旧备份如需查看，只用匹配旧提交/二进制与旧密钥在隔离旧环境恢复。新世代后续升级/回退继续遵守 [备份恢复](backup.md) 的新目录/空专用库原则；新的格式/namespace 校验尚待 R1.0c，不能手填新版本冒充有效备份。

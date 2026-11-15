<!-- Author: yunnuo <ymz@ebox.vip> -->
# 离线加密备份与恢复

使用 make build-ops 构建 build/bin/unicore-ops，Web tar 的同一 `./unicore` 入口已提供 backup/verify/restore，无须第二个程序。业务 CLI 仍不连接数据库。先停服务/退出桌面；工具使用同一 instance.lock，运行中的实例会被拒绝。

```sh
read -s UNICORE_BACKUP_PASSPHRASE
export UNICORE_BACKUP_PASSPHRASE
build/bin/unicore-ops backup --data-dir /srv/my-app-data --output /srv/backups/snapshot.tar.gz.age
build/bin/unicore-ops verify --input /srv/backups/snapshot.tar.gz.age
build/bin/unicore-ops restore --input /srv/backups/snapshot.tar.gz.age --data-dir /srv/my-app-restored --base-url https://restored.example.com
unset UNICORE_BACKUP_PASSPHRASE
```

密码至少12字节，单独安全保存；遗失无法恢复。使用外置 APP_SECRET_KEY 的原实例备份时须提供相同环境值，工具会将密钥物化到加密归档，恢复后默认读 secret.key。备份含数据库、data 私有文件、配置/密钥和所有 ready 云对象，必须按敏感资料保护。它不是浏览器下载接口，不需要在后台页面传输整库或密钥。数据目录 logs/ 内的程序运行日志不进入备份范围：日志可再生，按保留策略滚动，无需成套保存。

SQLite 使用 VACUUM INTO 一致快照。PostgreSQL 需要匹配服务器主版本的 pg_dump/psql，MySQL 需要 Oracle MySQL8 mysqldump/mysql（非 MariaDB 客户端），支持 TCP DSN；PG 使用 postgres URL。应用账号还需拥有 dump 所需的读取/对象权限。工具凭据只放子进程环境，不进命令行和输出。MySQL 开启 tls=true 时客户端验证服务器身份；自定义/跳过验证的 TLS 配置被拒绝。备份期间其他进程不可更改 DB/本地文件/管理对象。

外部数据库恢复时另建空专用库，并通过环境提供目标 DSN，再传 --confirm-database 精确库名；源库始终不改。工具不会清空已有库。

```sh
# 由运维安全注入，不把真实密码写入历史或文件
export UNICORE_RESTORE_DATABASE_DSN
build/bin/unicore-ops restore --input /srv/backups/snapshot.tar.gz.age --data-dir /srv/new-data --confirm-database new_database
```

本机没有原生客户端时可显式 --database-tools-container 指向该数据库所在的 PostgreSQL/MySQL 容器，在宿主机运行 ops，通过 docker exec 调用容器内工具。此选项会把客户端地址设为容器内127.0.0.1与默认端口，因此容器必须正是目标 DB；不是通用跳板容器。不要向应用容器挂 Docker socket。Docker 停服后可将命名卷只读挂载到临时运维容器（匹配架构/权限与原生客户端），或复制到宿主机再备份；数据与密钥不得散落公开构建目录。

恢复先完成 age 最终认证、gzip/tar、成员大小与 SHA-256 校验，限制解包体积（默认1TiB，可用 --max-bytes 调整），拒绝链接/穿越/重复条目。目标 data 目录必须不存在；恢复不执行迁移，正常服务启动才进行版本向前迁移。PG 导入用事务，MySQL DDL 不可事务回滚：失败可能留下部分目标库，请弃用并换新空库重试。工具不会自动 drop 库。

云文件恢复为本地 files/restored/<snapshot>/<file_id>，元数据和品牌引用保持 file_id，清理队列及旧云凭据停用，默认 local，原桶不修改。管理页面重新配置/测试云位置后可按文件迁移。待上传、已删除/过期文件不承诺恢复内容，排队邮件或会话属于 DB 快照，恢复前应考虑同源旧实例的并行会话和通知任务；切流时只运行一个实例。

manifest 的 tool_version 是备份工具构建版本；当前 schema=1 表示 Catalog 的 unicore-1 世代，不表示 platform 最新版本，也不是旧轨的最大迁移等级。不要据此推断原实例 binary 版本；运维应同时保存原二进制版本、部署配置、发行 namespace_versions/schema_fingerprint 与发布 checksum，库内 schema_migrations 保存实际执行版本及原 SQL checksum。跨版本回退需旧二进制与旧快照成套恢复。未实现在线备份、增量备份、定时调度、PITR 或跨数据库引擎转换。

当前目录为 core@1、platform@5、module.notes@1，既有 @2 为收件箱 actions，@3 为 MCP 治理底座，@4 为角色版本列，@5 为 MCP OAuth 存储。三个 UI profile 均含 platform，Standalone/desktop 同样备份这些物理表并执行适用尾迁移，不因此开放身份治理，见 [ADR-0046](../adr/ADR-0046-credential-delegation-role-concurrency.md)。公告、个人安全状态、角色版本、收件箱 actions 及已软删笔记随完整 DB 快照保存；Notes edition 关闭不删除历史数据。旧双身份或不匹配开发基线不自动转换，旧轨 schema=13/14 等快照使用匹配旧工具和旧程序，不把其数字当作当前 Catalog 版本。

core@1 的上传会话包含在 DB 备份，本地未完成分片包含在完整 data 备份；云未完成 upload ID 无法由普通对象备份复原，不可用会话需放弃重传。回退须匹配旧快照并停止进行中的上传，见 ADR-0022。

追加 platform@4 与 @5 改变三个 UI profile 的 Catalog 指纹，不走跨指纹自动 OTA。升级前停服/退出桌面，用匹配工具保存数据库、私有目录、配置/原密钥和程序；tar 人工更换完整包，Docker 外部更换镜像并保留卷，desktop 使用完整原生包。恢复工具不执行迁移，正常实例启动才应用缺失尾部。MySQL DDL 可已提交但账本未登记；失败不可盲重试 ADD COLUMN、以列存在为依据补账本或仅换旧程序，须将匹配升级前快照恢复到新目录/空专用库后再核验处理。

个人安全状态包含加密验证器密钥、恢复码摘要、消费计数器及设备会话，须保护实例密钥。还原旧快照可能恢复旧密码、邮箱、角色授权和会话；切流前按安全策略重新撤销不应继续有效的凭据，避免旧新实例同时运行。详见 [个人中心](personal-center.md)。

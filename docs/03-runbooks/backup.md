<!-- Author: yunnuo <ymz@ebox.vip> -->
# 离线加密备份与恢复

使用 make build-ops 构建 build/bin/unicore-ops，Web tar 已随包提供 bin/unicore-ops。业务 CLI 仍不连接数据库。先停服务/退出桌面；工具使用同一 instance.lock，运行中的实例会被拒绝。

```sh
read -s UNICORE_BACKUP_PASSPHRASE
export UNICORE_BACKUP_PASSPHRASE
build/bin/unicore-ops backup --data-dir /srv/my-app-data --output /srv/backups/snapshot.tar.gz.age
build/bin/unicore-ops verify --input /srv/backups/snapshot.tar.gz.age
build/bin/unicore-ops restore --input /srv/backups/snapshot.tar.gz.age --data-dir /srv/my-app-restored --base-url https://restored.example.com
unset UNICORE_BACKUP_PASSPHRASE
```

密码至少12字节，单独安全保存；遗失无法恢复。使用外置 APP_SECRET_KEY 的原实例备份时须提供相同环境值，工具会将密钥物化到加密归档，恢复后默认读 secret.key。备份含数据库、data 私有文件、配置/密钥和所有 ready 云对象，必须按敏感资料保护。它不是浏览器下载接口，不需要在后台页面传输整库或密钥。

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

manifest 的 tool_version 是备份工具构建版本，schema/business_schema 是源库等级。不要据此推断原实例 binary 版本；运维应同时保存原二进制版本、部署配置和发布 checksum。跨版本回退需旧二进制与旧快照成套恢复。未实现在线备份、增量备份、定时调度、PITR 或跨数据库引擎转换。

当前支持 schema 上限：平台 12、本地 1、独立 business 2。0011 公告与业务 0002 软删除均需纳入完整 DB 备份；回退恢复对应旧库，不仅回退二进制。公告及已软删笔记会随数据库备份完整保留。

0012 的上传会话包含在 DB 备份，本地未完成分片包含在完整 data 备份；云未完成 upload ID 无法由普通对象备份复原，不可用会话需放弃重传。回退须匹配旧快照并停止进行中的上传，见 ADR-0022。

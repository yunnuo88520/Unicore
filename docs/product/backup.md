<!-- Author: yunnuo <ymz@ebox.vip> -->
# 离线加密备份与恢复

Web 发行包使用同一入口 `./unicore backup|verify|restore`，不再附带第二个维护可执行文件。桌面用户或源码运维可用 make build-ops 生成独立工具。业务 CLI 仍不连接数据库。先停服务/退出桌面；工具使用实例锁，活动实例会被拒绝。

```sh
read -s UNICORE_BACKUP_PASSPHRASE
export UNICORE_BACKUP_PASSPHRASE
./unicore backup --data-dir /srv/my-app-data --output /srv/backups/snapshot.tar.gz.age
./unicore verify --input /srv/backups/snapshot.tar.gz.age
./unicore restore --input /srv/backups/snapshot.tar.gz.age --data-dir /srv/my-app-restored --base-url https://restored.example.com
unset UNICORE_BACKUP_PASSPHRASE
```

口令至少 12 字节，单独安全保存；遗失无法恢复。原实例使用外置 APP_SECRET_KEY 时提供相同值。备份包含数据、配置、密钥和 ready 云对象，必须按敏感资料保存，不上传公开产物。它不是在线/增量/定时备份或 PITR。

SQLite 使用一致快照；PostgreSQL 需要匹配服务端主版本的 pg_dump/psql；MySQL 需要 Oracle MySQL 8 客户端，不以 MariaDB 客户端替代。使用显式 TCP 连接和相应权限；不在命令行/日志暴露 DSN。云桶应独立制定备份政策。

外部数据库恢复只使用新空专用库，通过安全环境提供 UNICORE_RESTORE_DATABASE_DSN，并传 --confirm-database 精确目标库名。工具不清空已有库。data 目标必须不存在；恢复只还原，不执行迁移，正常启动才按实际运行体系处理。MySQL DDL 可能部分提交，失败保留现场，改用新空目标，不自动删除原库。

可显式 --database-tools-container 使用目标数据库容器里的原生工具；宿主机调用 docker exec，不向应用挂 socket。该容器必须就是目标 DB，不是任意跳板。

云对象恢复为本地私有文件并保留 file_id，旧云凭据/清理任务停用；重新配置并测试云位置后再迁移。未完成云分片无法作为普通对象备份恢复，应放弃并重传。切流时只运行一个实例，注意快照中的会话和待发送通知。

同时保留原二进制版本、发布校验和、部署配置和密钥。工具版本不等于源实例版本；新世代数据库与 0.x 开发库不承诺升级兼容，不能通过手改账本伪造兼容。恢复演练与 [部署](deployment.md)、[更新](updates.md) 一并执行。

当前备份清单的 `format=1` 表示归档格式，`schema=1` 表示 Catalog 世代 unicore-1，均不表示 platform 或 module.notes 的当前迁移版本。世代通过真实 core@1 checksum 校验；各 namespace 的已执行版本保存在备份数据库的账本中。相同 schema 值不等于任意版本程序都能打开该数据库。恢复时使用匹配工具与程序，再按 [迁移规范](development.md#数据库迁移与文件) 验证。

安装向导生成的 PostgreSQL `search_path=public` 可直接用于备份；备份固定限定 public，其他 search_path 会拒绝。MySQL TLS 关闭映射为 DISABLED，向导的加密但不校验证书映射为 REQUIRED，显式 `tls=true` 映射为 VERIFY_IDENTITY。备份不会把加密连接静默降为明文；证书验证连接需准备客户端可信 CA。

旧开发期基线已整合，旧开发库和旧快照使用对应 Git revision 的工具恢复到隔离环境，不修改账本以冒充新基线。平台快照包含个人中心的加密验证器密钥、恢复码状态与登录设备，必须完整保存实例密钥；恢复后只运行一个实例。

<!-- Author: yunnuo <ymz@ebox.vip> -->
# 离线加密备份与恢复

使用发行包 bin/unicore-ops 或源码 make build-ops 生成的工具。业务 CLI 仍不连接数据库。先停服务/退出桌面；工具使用实例锁，活动实例会被拒绝。

```sh
read -s UNICORE_BACKUP_PASSPHRASE
export UNICORE_BACKUP_PASSPHRASE
bin/unicore-ops backup --data-dir /srv/my-app-data --output /srv/backups/snapshot.tar.gz.age
bin/unicore-ops verify --input /srv/backups/snapshot.tar.gz.age
bin/unicore-ops restore --input /srv/backups/snapshot.tar.gz.age --data-dir /srv/my-app-restored --base-url https://restored.example.com
unset UNICORE_BACKUP_PASSPHRASE
```

口令至少 12 字节，单独安全保存；遗失无法恢复。原实例使用外置 APP_SECRET_KEY 时提供相同值。备份包含数据、配置、密钥和 ready 云对象，必须按敏感资料保存，不上传公开产物。它不是在线/增量/定时备份或 PITR。

SQLite 使用一致快照；PostgreSQL 需要匹配服务端主版本的 pg_dump/psql；MySQL 需要 Oracle MySQL 8 客户端，不以 MariaDB 客户端替代。使用显式 TCP 连接和相应权限；不在命令行/日志暴露 DSN。云桶应独立制定备份政策。

外部数据库恢复只使用新空专用库，通过安全环境提供 UNICORE_RESTORE_DATABASE_DSN，并传 --confirm-database 精确目标库名。工具不清空已有库。data 目标必须不存在；恢复只还原，不执行迁移，正常启动才按实际运行体系处理。MySQL DDL 可能部分提交，失败保留现场，改用新空目标，不自动删除原库。

可显式 --database-tools-container 使用目标数据库容器里的原生工具；宿主机调用 docker exec，不向应用挂 socket。该容器必须就是目标 DB，不是任意跳板。

云对象恢复为本地私有文件并保留 file_id，旧云凭据/清理任务停用；重新配置并测试云位置后再迁移。未完成云分片无法作为普通对象备份恢复，应放弃并重传。切流时只运行一个实例，注意快照中的会话和待发送通知。

同时保留原二进制版本、发布校验和、部署配置和密钥。工具版本不等于源实例版本；新世代数据库与 0.x 开发库不承诺升级兼容，不能通过手改账本伪造兼容。恢复演练与 [部署](deployment.md)、[更新](updates.md) 一并执行。

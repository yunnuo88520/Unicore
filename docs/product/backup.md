<!-- Author: yunnuo <ymz@ebox.vip> -->
# 备份与恢复

Unicore 提供离线加密备份。Web 发行包使用同一个 `unicore` 入口执行 `backup`、`verify` 和 `restore`；桌面实例可使用源码构建的独立运维工具。业务 CLI 不连接数据库，也不承担实例备份。

## 备份前准备

1. 停止 Web 服务或退出桌面应用。备份工具使用实例锁，会拒绝仍在运行的实例。
2. 准备至少 12 字节的备份口令，并在独立安全位置保存；丢失口令无法解密归档。
3. 确认数据库客户端可用，备份目标有足够空间，并保留当前程序版本、校验和及部署配置。
4. 如果实例使用外置 `APP_SECRET_KEY`，给工具提供相同值。

| 数据库 | 工具要求 |
| --- | --- |
| SQLite | 使用一致快照，无需外部数据库客户端 |
| PostgreSQL | 与服务端主版本匹配的 `pg_dump`、`psql`；限定 `public` schema |
| MySQL | Oracle MySQL 8 客户端，使用 TCP；不以 MariaDB 客户端替代 |

## 创建并验证备份

以下命令在 Web 发行目录执行，按实际位置修改数据目录和输出路径：

```sh
read -s UNICORE_BACKUP_PASSPHRASE
export UNICORE_BACKUP_PASSPHRASE
./unicore backup --data-dir /srv/my-app-data --output /srv/backups/snapshot.tar.gz.age
./unicore verify --input /srv/backups/snapshot.tar.gz.age
unset UNICORE_BACKUP_PASSPHRASE
```

归档包含数据库、私有配置、密钥、本地文件及已完成的云对象。请按敏感资料保存，并为云桶另设独立备份策略。未完成的云分片不能作为普通对象恢复，需要重新上传。

该工具用于停机快照，不提供在线、增量、定时备份或时间点恢复。定期在隔离环境恢复一次，确认口令、密钥、文件和数据库客户端都可用。

## 恢复到新位置

先准备尚不存在的数据目录；外部数据库必须是新的专用空库。通过安全环境注入 `UNICORE_RESTORE_DATABASE_DSN`，并使用 `--confirm-database` 精确确认目标库名。工具不会清空已有库。

```sh
read -s UNICORE_BACKUP_PASSPHRASE
export UNICORE_BACKUP_PASSPHRASE
./unicore restore --input /srv/backups/snapshot.tar.gz.age --data-dir /srv/my-app-restored --base-url https://restored.example.com
unset UNICORE_BACKUP_PASSPHRASE
```

上例适用于 SQLite；恢复 PostgreSQL/MySQL 时，在命令中加上 `--confirm-database` 和真实目标库名，并提供上述 DSN 环境变量。不要把密码或完整 DSN 写进命令历史。

恢复工具只还原快照，不执行迁移。先使用与快照匹配的程序检查恢复结果，再按目标版本发行说明执行升级。MySQL DDL 可能部分提交；恢复失败时保留现场，改用新的空目标重试。

## 恢复后检查

- 只启动一个实例，确认登录、业务数据、附件下载和日志正常，再切换流量。
- 云对象恢复为本地私有文件，保留 `file_id`。旧云凭据和清理任务会停用，重新配置并测试目标存储后再迁移。
- 快照会恢复其中的会话、验证器密钥、恢复码状态和待发通知。切换前检查相关安全状态，避免新旧实例同时使用同一数据。
- 保留升级前完整快照和匹配程序，回退时成套恢复。

## 数据库连接与工具容器

PostgreSQL 备份固定限定 `public`，其他 `search_path` 会被拒绝。MySQL TLS 关闭映射为 `DISABLED`，加密但不校验证书映射为 `REQUIRED`，`tls=true` 映射为 `VERIFY_IDENTITY`；验证证书时需准备可信 CA。

可用 `--database-tools-container` 指定实际目标数据库容器中的原生工具。该方式由宿主机执行 `docker exec`，应用容器无需挂载 Docker socket。

## 格式与版本兼容

备份清单的 `format` 表示归档格式，`schema` 表示 Catalog 世代；各命名空间的已执行版本保存在数据库账本中。相同世代不能保证任意版本的程序都兼容，旧预览库和旧快照应使用对应版本的工具恢复。

完整升级顺序见 [应用更新](updates.md) 与 [Web 部署](deployment.md)。

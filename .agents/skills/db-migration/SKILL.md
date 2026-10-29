---
name: db-migration
description: 创建 Unicore 分方言数据库迁移、兼容评估与数据恢复说明。
metadata:
  author: yunnuo <ymz@ebox.vip>
---

# db-migration

## trigger

创建或变更 schema/数据格式；当前 database/sql + modernc SQLite/pgx/MySQL，先读 ADR-0003。

## inputs

profile、数据规模、方言、向前兼容、停机、备份和恢复窗口。

## steps

1. 阅读原始设计第 9 节和 DB ADR，明确 framework/platform/business 归属。
2. 各方言连续版本迁移含作者、目的、兼容影响和回滚策略；平台表仅用于 web-platform。
3. 临时 DB 验证空库、前版升级、重复执行及失败重试；SQLite 设置 WAL 与忙等待。
4. 高风险 DDL 说明真实备份恢复步骤和非事务行为。首次安装清空边界见 [ADR-0013](../../../docs/adr/ADR-0013-installation-experience.md)：测试连接不清空，reset 需明确同意和精确目标名；已安装库/其他 PG schema 不接管，启动路径不 reset。用隔离库验证已有数据、失败与连续重启，不能用删配置模拟升级。
5. 同步 Repository SQL、schema 和运行文档。

## output

分方言迁移、真实 DB 测试、恢复策略与 ADR。

## forbidden

CLI 加载 SQL；只测一种 DB 宣称全支持；不可逆 DDL 后承诺仅回滚 binary；测试使用生产库。

## validation

实际运行每个声称支持的方言迁移、约束与恢复测试，make test 与 profile build，记录未测项。

平台当前迁移至 0010：追加审计快照表；0009 新增文件位置、元数据与持久清理队列；0008 的管理员七张身份表独立于普通用户。身份变化验证旧版本账号/企业绑定保留、旧凭据撤销及 MySQL 复制后版本未记录时的幂等重试；不要修改已发布迁移 checksum 或在迁移测试中绕过表间外键。

文件存储变更同时遵守 add-file-storage：三方言索引和幂等重试要实际验证，迁移/回退保留 DB、data、实例密钥与桶备份。不得修改已发布的旧迁移 checksum；云测试只清理本轮登记的专属前缀。

业务迁移位于 migrations/{dialect}/business，独立 business_migrations 当前为1。框架账本本地为1、平台为10，不合并版本序列；新版本需三方言/重复启动/冲突测试。离线备份恢复使用 cmd/ops，见 docs/03-runbooks/backup.md；只允许新目录和空专用库，MySQL失败可能留下部分目标库，禁止自动drop。

---
name: db-migration
description: 创建 Unicore 分方言数据库迁移、兼容评估与数据恢复说明。
metadata:
  author: yunnuo <ymz@ebox.vip>
---

# db-migration

## trigger

创建或变更 schema/数据格式；M1 无 DB，首次引入先冻结数据库 ADR。

## inputs

profile、数据规模、方言、向前兼容、停机、备份和恢复窗口。

## steps

1. 阅读原始设计第 9 节和 DB ADR，明确 framework/platform/business 归属。
2. 各方言连续版本迁移含作者、目的、兼容影响和回滚策略；平台表仅用于 web-platform。
3. 临时 DB 验证空库、前版升级、重复执行及失败重试；SQLite 设置 WAL 与忙等待。
4. 高风险 DDL 说明真实备份恢复步骤和非事务行为。
5. 同步 Repository SQL、schema 和运行文档。

## output

分方言迁移、真实 DB 测试、恢复策略与 ADR。

## forbidden

CLI 加载 SQL；只测一种 DB 宣称全支持；不可逆 DDL 后承诺仅回滚 binary；测试使用生产库。

## validation

实际运行每个声称支持的方言迁移、约束与恢复测试，make test 与 profile build，记录未测项。

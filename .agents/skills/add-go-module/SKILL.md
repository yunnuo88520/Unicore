---
name: add-go-module
description: 新增 Unicore Go 领域模块、用例、ports 与按 profile 装配的 adapter。
metadata:
  author: yunnuo <ymz@ebox.vip>
---

# add-go-module

## trigger

新增领域规则或业务用例；只调整 UI 不适用。

## inputs

业务输入输出、边界条件、影响 profile、持久化要求。

## steps

1. 从仓库根目录阅读 docs/00-product/PRD.md、架构与相关 ADR。
2. domain 定义业务规则，usecase 定义 ports 并编排；入口只装配实际需要的 adapter。
3. 线格式变更先更新 OpenAPI，再 pnpm generate；页面使用 AppClient。
4. 测试输入边界与跨适配器一致性，更新模块设计和运行文档。

## output

用例、ports、adapter、作者头、行为测试、影响矩阵及必要 ADR。

## forbidden

Core import HTTP/Wails/SQL/身份模块；CLI 为复用连接 DB；在 domain 读取全局环境。

## validation

make test、go run ./scripts/check-boundaries，以及受影响 profile build。

参考可运行的个人笔记纵向样板 docs/03-runbooks/business-example.md；有 DB 的三种形态使用 notessql，CLI 不增加 DB。业务迁移登记独立 business_migrations，平台 scope 固定在入口生成。

新增可变业务聚合须嵌入 domain.BaseEntity；参考公告 usecase/announcements.go 与 adapter/storage/announcementsql，实体经 adapter 显式映射生成 DTO。分页、软删除、乐观版本、审计与安全状态机例外遵守 [后端规范](../../../docs/02-standards/backend.md)。entity_test.go 自动发现新结构体，值对象例外须有说明；不能为绕过检查给凭据/账本强加软删除。

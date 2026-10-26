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

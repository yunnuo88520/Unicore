---
name: add-go-module
description: 新增 Unicore 业务模块：自包含模块树、module 注册描述符、迁移命名空间与三端装配。
metadata:
  author: yunnuo <ymz@ebox.vip>
---

# add-go-module

## trigger

新增业务模块（如授权、卡密、工单）；只调整 UI 或框架内核不适用。

## inputs

业务输入输出、边界条件、影响 profile、持久化要求、是否需要编译期裁剪（edition）。

## 模块形态（标准）

业务模块是 internal/modules 下的自包含 `<slug>` 目录树，模块内延续洋葱分层；注册后菜单、权限、迁移、任务执行器与前端路由自动聚合：

```
  module.go        // Module 描述符：Slug/Title/Icon/Order/Permissions/Navigation/Executors/Migrations
  assemble_on.go   // 仅 edition 模块需要：//go:build <tag>，Enabled: true
  assemble_off.go  // //go:build !<tag>，Enabled: false
  domain/          // 业务规则；只可依赖 internal/domain 与 contracts
  usecase/         // ports + 编排；禁 adapter/platform/http/sql
  storage/         // SQL 适配器（实现 usecase port；三方言迁移在 migrations/modules 的 <slug> 三方言目录）
  desktop/         // 可选：init() 里 RegisterBridgeContribution 提供原生能力
```

HTTP handler 位于 internal/adapter/http 下的 <slug>.go（传输层集中，路由↔契约双向测试依赖它），并在 `mountWeb` 加一行 `mount<Slug>(api, config)`；handler 使用包内 require/decode/success/webError 工具。桌面桥接方法保留在 `internal/adapter/desktop/bridge.go` 转发到模块贡献注入的接口实现。

## steps

1. 迁移：`migrations/modules 下的 <slug> 三方言目录（0001_*.sql）`，catalog.json 登记 `module.<slug>` 命名空间（depends_on: core）并加入目标 profile 的 namespaces；`pnpm generate:migrations`。已分发 SQL 冻结，遵守 db-migration skill。
2. 契约：openapi.json 增 DTO/operation + x-unicore 权限策略；`pnpm generate`。权限点写入模块描述符的 Permissions（platform EnsurePermissions 自动同步并授予 super_admin），同步 docs/api/permissions.md。
3. 模块树：domain/usecase/storage 按 onion 分层实现；可变聚合嵌 `coredomain.BaseEntity`。
4. 描述符：module.go 填 Slug/Permissions/Navigation/Executors（可选任务执行器）；`internal/module/manifest.json` 登记 slug 与 edition；组合根（cmd/server、cmd/desktop）`module.Register(<slug>.Module)` 并 blank import 贡献子包；`web.go` 加 mount 行；SDK/前端按 add-api-operation、add-react-page 完成。
5. 前端：packages/web-ui/src/modules 下的 <slug> 目录（index.ts 用 defineMessages 声明 routes 并 registerUiModule + 页面组件）；`src/modules/index.ts` import 一行；navigation 顺序/图标从模块贡献自动合并。
6. 裁剪（可选）：模块配 assemble_on/off.go + manifest 里登记 edition；FEATURE_<TAG> 构建变量、features.json、Capabilities.features 自动生效，裁剪构建内模块零注册。

## output

模块树、描述符、契约与生成物、迁移、页面、作者头、行为测试、影响矩阵及必要 ADR。

## forbidden

Core import HTTP/Wails/SQL/身份模块；CLI 引 modules 或 DB；domain/usecase 引 adapter/platform（check-boundaries 会拒绝）；绕过 manifest 直接 Register；在 usecase 读取全局环境。

## validation

make test、go run ./scripts/check-boundaries、pnpm typecheck/check:i18n、受影响 profile build；有迁移时跑三方言与 test-upgrade 演练。

参考可运行的完整模块：`internal/modules/notes/module.go` 及其子包（迁移自原分层样板的参考实现）；流程说明 docs/03-runbooks/business-example.md 与 docs/product/development.md。迁移遵守 docs/02-standards/database-migrations.md 与 ADR-0024/0025：module.<slug> 独立版本、统一 namespace 账本、depends_on 决定顺序。平台 scope 固定在入口生成；分页、软删除、乐观版本、审计与状态机遵守 [后端规范](../../../docs/02-standards/backend.md)。entity_test.go 自动发现新结构体；值对象例外须有说明。

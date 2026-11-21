<!-- Author: yunnuo <ymz@ebox.vip> -->
# 订单验收示例（orders）

这个目录是可注册业务工作台的**对外验收样例**：从公开的创建流程生成一次性派生项目，应用本目录的补丁包，构建后在一个隔离实例上验证完整的服务端授权矩阵。示例不进入默认模板业务，也不进入 framework-template 白名单。

## 演练内容

- **客户**（`orders:access`）：`GET /api/v1/orders` 只返回本人名下订单；管理面 403。
- **代理 A/B**（自定义角色，`orders:handle` + 显式 operation 授权）：`GET /api/v1/orders/managed` 只返回**被分配**的订单（服务端主体关系）；分配之外只得到 404，防枚举。
- **运营**（`orders:handle`，DataScope all）：按授权范围处理订单；状态机 open→processing→done（活动期可取消）由服务端执行，过期 version 拒绝，终态不可变。
- **控制台**：`/workspaces/agent`（侧栏外壳）与 `/workspaces/operations`（顶部标签外壳）共用同一页面集——一个权限点可进入多个工作台，布局只是呈现；切换工作台清空上一工作台的查询缓存与页面状态。
- **深链接**：`/workspaces/agent/orders/<orderId>` 由页面按 URL 渲染详情；无权限深链接呈现外壳但底层 API 403，直达 API 403。
- **多角色并集**：账号权限 = 各角色显式授权并集（ADR-0050），业务上下文不放大授权。

## 运行

```bash
node scripts/verify-orders-example.mjs          # 完整演练（创建→应用→构建→启动→断言）
node scripts/verify-orders-example.mjs --keep   # 保留临时目录用于人工检查
```

演练全程使用公开流程：`scripts/create-project.mjs` 创建、`examples/orders/apply.mjs` 应用补丁、应用自身 `make build-web` 构建、安装向导 API 与管理 API 完成租户配置。不直接改数据库、不隐藏补授权、不绕过创建流程。

## 补丁包内容

| 路径 | 说明 |
| --- | --- |
| `_files/internal/modules/orders/` | 模块描述符、领域规则（状态图）、用例编排 |
| `_files/internal/modules/orders/storage/ordersql/` | 订单 SQL 存储与可见性谓词 |
| `_files/internal/adapter/http/orders.go` | HTTP 挂载：服务端解析 handle 范围与代理关系 |
| `_files/packages/web-ui/src/modules/orders/` | 客户页（共享注册表）与工作台共享页 |
| `_files/apps/web/src/order-consoles.tsx` | 应用组合根的两个控制台（不同外壳） |

`apply.mjs` 还会：登记 `internal/module/manifest.json` 与 `migrations/catalog.json`（module.orders@1，三方言）、补契约 schema 与五个 operation 的 `x-unicore` 策略、注册组合根与 SDK 方法，并把示例的全部界面词条补进共享英文目录（已有词条沿用既有译法）。

授权规则与接入规范见 `docs/product/development.md`（"业务资源的服务端授权"）与 [ADR-0050](../../docs/adr/ADR-0050-explicit-authorization-baseline.md)。

<!-- Author: yunnuo <ymz@ebox.vip> -->
# HTTP adapter 域内约定

接口层。完整规范见 [后端标准](../../../docs/product/development.md) 与 [接口契约](../../../docs/product/development.md)，根 [AGENTS](../../../AGENTS.md) 优先。

- 每个版本化 API handler 必须经 `policyRouter` 注册（policy.go）：openapi.json x-unicore 未声明的路由运行时 500（ROUTE_POLICY_UNDECLARED）；路由↔契约双向遍历测试强制一致。
- session/authenticated 访问由策略中间件解析会话并强制 permissions/superAdmin；handler 内 `require` 复用会话并补充 2FA 注册与审计 actor，不要自行再解析会话。
- 响应一律走 `writeJSON`/`failure`/`success` 信封；错误映射走 `webError`，信封形状由 `envelope_test.go` 锁定，状态码须与 ErrorCatalog 一致。
- 新增端点先在 openapi.json 声明 operationId、profile、access、permissions、superAdmin、csrf，再 `pnpm generate`；MFA 完成路由的 pending 会话特例见 policy.go。
- 行锁用 `sqlstore.LockForUpdate`，不要手写方言分支；设置的结构化读取用 `settings.Bind`。

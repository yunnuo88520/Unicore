<!-- Author: yunnuo <ymz@ebox.vip> -->
# ADR-0046：平台 MCP Server

状态：采纳（P1–P4）；后续阶段为规划方向，实施前按当时事实修订，不构成已实现能力声明。

## 功能声明

- 功能领域 / 归属层：平台集成与业务扩展，产品功能。
- 功能定位与操作对象：外部 MCP 客户端经固定 `/mcp` 入口，发现并调用平台开发者显式注册的业务工具；调用以真实用户身份执行，沿用角色、operation 授权、数据范围与业务状态规则。
- Platform 适用性：新增。P1 交付 PAT 只读底座：协议入口、能力注册表、PAT 门禁、AI 管理三页、个人接入说明、调用元数据与限制、Notes 只读样例。
- Standalone 两载体适用性：不装配。无 AI 管理菜单、无 `/mcp` 路由、无 MCP 身份表；两载体保持等效，均不因本项目增加管理面。
- CLI 适用性：不装配。不引入 HTTP、SQL、平台身份或 MCP 依赖。
- Platform 访问主体与权限：治理面仅 super_admin（`mcp:read`、`mcp:write`、`mcp:logs:read`，super-only 保留集）；使用面为持有 `mcp:access`（Assignable）的本人凭证。菜单权限不构成 MCP 调用授权。
- Standalone 访问规则：不装配。
- 持久化：platform 命名空间新表 `unicore_mcp_control`、`unicore_mcp_capability_policies`、`unicore_mcp_calls`（P1）；设置键 `mcp.*` 登记 SettingDefinition 且从通用 settings API 投影中排除。
- 契约影响：管理 API（getMcpConfig/patchMcpConfig/listMcpTools/getMcpTool/patchMcpToolPolicy/listMcpCalls/getMcpCall）与本人接入说明 API（getMyMcpAccessInfo）纳入 OpenAPI；`/mcp` 协议端点走专用适配器，不套用业务响应信封。
- 菜单与页面呈现：管理后台新增一级目录「AI 管理」（接入配置、工具目录、调用记录），super_admin 专属；个人中心在既有「访问令牌」页补充 MCP 接入说明。无仪表盘组件。
- 运行环境与依赖条件：仅 web-platform 装配；运行时默认关闭；go-sdk v1.8.0（Apache-2.0）作为协议实现；单实例假设。
- 与现有功能的关联：复用单角色 PAT（ADR-0044）、operation 目录、数据范围、模块描述符与 Notes 裁剪；Notes 工具随 `FEATURE_NOTES` 同期裁剪。
- 待决策事项：无（P1 范围内）；目标商业客户端、CIMD/DCR、首批写工具风险等输入在对应期开始前由维护者给出，不阻塞 P1。

## 决策

1. 产品边界：做对外 MCP Server，不做模型接入、MCP Client 或内置助手。管理权（super_admin 治理）与使用权（本人凭证）分离；个人使用复用现有凭证能力，不新建"AI 密钥"。
2. 形态与装配：MCP 仅在 web-platform 装配组合根接入 HTTP；不设 `FEATURE_MCP` 裁剪开关，运行时以 `mcp.enabled`（默认 false）控制协议入口，管理面始终可装配。其他 profile 对 `/mcp` 一律 404，不进入 SPA fallback。
3. 协议基线：`2026-07-28` Streamable HTTP，每请求身份与上下文，无长期协议会话；不支持的协议版本显式拒绝。SDK 固定 `github.com/modelcontextprotocol/go-sdk v1.8.0`，生产服务只引用其 server 侧；框架自行实现业务注册、身份、授权与策略端口。协议能力只声明实际实现项。
4. 认证（P1）：唯一来源 `Authorization: Bearer <PAT>`；解析后显式要求凭证 Kind=pat，拒绝 client JWT、重复/混合凭证与 Cookie 回退。每请求重新解析凭证并复查账号、角色关系、到期、撤销锚点与 `mcp:access`。
5. 授权模型：能力绑定既有可委派业务 operation（`Grantable && !SuperAdmin`），全部关联 operation 满足才可发现/调用；超管短路不适用于 MCP 判定。数据范围、所有权与业务状态校验复用 HTTP 同源规则；范围不改变入口权限定义，但限制返回数据。
6. 能力注册：工具由代码显式注册（`<module>.<action>` 稳定名称、版本、受约束输入 Schema、风险声明），注册表启动时校验并冻结；重名、未知 operation、super-only 接口、未装配模块导致启动失败。后台只管理开放策略：新能力默认未开放，指纹变化后重新审查；超管不能改绑权限或降级风险。
7. P1 执行边界：仅只读工具可执行；写工具可登记但不可用。输入校验、分页、体积、超时、并发与速率限制在 Handler 前生效；调用写入脱敏元数据（无原始参数/结果/凭证），起始记录写失败不启动执行。
8. 浏览器边界：生产必须 HTTPS（开发仅 loopback HTTP）；Origin 存在时精确匹配可信列表，`null` 与未登记 Origin 拒绝；默认无跨域浏览器调用；Cookie-only 不接入 MCP。

## P2 决策（OAuth 接入）

9. 授权服务：OAuth 2.0 授权码 + PKCE（S256）内建实现，不引入第三方授权服务器依赖。仅预注册客户端（`unicore_mcp_oauth_clients`）：公开客户端必须绑定 PKCE，机密客户端使用 `client_secret_post` 且密钥仅以 SHA-256 摘要持久化、仅在创建与轮换响应中一次性返回。重定向注册精确匹配，HTTPS 为默认、回环端口例外，禁止通配与用户信息。
10. 授权同意：同意页 `/authorize` 由用户工作台渲染，登录墙原位继续；一次同意绑定「一个用户 × 一个客户端 × 一个已持有角色」，同键复用既有授权。scope 仅 `mcp.read` 与 `offline_access`，`mcp.write` 在写阶段落地并被接受前不可授权。授权绑定签名安全锚（口令摘要），改密即失效。
11. 令牌生命周期：不透明 `ucm_` access（15 分钟）与 `ucr_` refresh（30 天）均仅存摘要；refresh 一次性轮换，同族重放即撤销全族；撤销端点遵循 RFC 7009 幂等语义；过期产物按小时清扫。`/mcp` 入口按前缀分发 `ucp_`（PAT）与 `ucm_`（OAuth），同一授权链：账号状态、角色持有、`mcp:access`、operation 授权、数据范围与阶段门每请求重查。
12. 资源标识：RFC 8707 resource indicator 固定为 `<base_url>/mcp`，发现（RFC 9728）、同意校验与授权落库共用同一解析（`site.base_url` 优先，安装值回退）。
13. 旧协议档：SDK 实际支持的协议版本（含 2025-11-25）按默认协商规则互通，公告目录如实反映；每请求无状态会话天然隔离，新旧协议共用同一门禁与授权链，不设独立凭证或目录。
14. 管理面：AI 管理新增「OAuth 接入」页（`mcp:clients:read`/`mcp:clients:write`）；客户端注册、编辑（CAS 版本）、启停、密钥轮换与全局撤销。个人中心新增「已授权应用」分区：本人授权列表与自撤销；撤销立即失效全部令牌。

## P3 决策（写阶段）

15. 阶段开关：`mcp.write_enabled`（默认关闭）开放 write 效果工具的执行；destructive 效果始终保持阶段门，开启属独立决策。开关翻转即时生效（并入传输服务器实例缓存键，语义等同策略修订）。
16. 传输预算：OAuth 令牌调用 write 效果工具必须携带 `mcp.write` scope（同意端点在阶段关闭时拒绝该 scope，发现文档仅在阶段开放时公告）；PAT 无 scope 预算，由阶段开关与常规授权链治理。
17. 业务结果：业务与输入类错误（如版本冲突）以 IsError 工具结果返回稳定代码，供智能体按业务语义重试；不可用类失败维持统一语义防探测。
18. 样例写工具：`notes.update`（写效果、声明需客户端确认、乐观锁版本冲突拒绝），绑定可委派 operation `updateNote`，数据范围与网页端一致。

## P4 决策（动态客户端注册）

19. RFC 7591 子集：`POST /oauth/mcp/register` 仅注册公开 PKCE 客户端（`token_endpoint_auth_method` 仅接受 none），无 software statement、无 initial access token；注册即时启用，治理与预注册客户端一致（启停、授权记录、全局撤销均走管理台）。发现文档仅在 `mcp.dcr_enabled`（默认关闭）开放时公告 registration_endpoint。
20. 滥用防线：端点无认证，按来源地址限流（10 次/小时）并在关闭时普通 404；重定向注册沿用精确匹配校验，错误码遵循 RFC 7591（invalid_client_metadata / invalid_redirect_uri）。

## 验证边界（P4 追加）

互操作测试覆盖关闭 404、发现公告、RFC 错误码、注册即用（注册→同意→code 兑换→协议发现与调用全链路）。

## 验证边界（P3 追加）

互操作测试覆盖阶段关闭拒绝、OAuth 无 mcp.write 预算拒绝、阶段开放携预算通过、PAT 随阶段开放通过；`tools/list` 如实公告开放目录。路由↔契约遍历覆盖新增配置字段；前端双语与接入配置页测试全量运行。

## 验证边界（P2 追加）

授权服务：单测覆盖 consent 绑定、一次性 code、PKCE 边界、轮换与重放、安全锚与账号复查；全栈互操作测试覆盖真实 HTTP 上的 OAuth 签发→协议调用→撤销即拒绝，以及 2025-11-25 旧档客户端的发现与调用。路由↔契约双向遍历覆盖全部新增 API；前端双语与个人中心/管理页测试全量运行。

## 验证边界

协议：SDK 基准档互通回归（internal/mcp）+ 真实协议客户端经 HTTP 完成发现、调用、失败与取消。授权：缺失/非法/过期/作废 PAT 拒绝、client JWT 与 Cookie 混用拒绝、无 mcp:access / 无 operation 授权 / 超管短路全部拒绝、停用与收紧立即生效、跨用户数据范围与 HTTP 一致。治理：非平台形态 404、服务关闭 503、通用 settings API 不可读写 mcp 组、普通管理员与用户访问 AI 管理被后端拒绝。裁剪：`FEATURE_NOTES` 两种构建下 Notes 工具随模块消失且底座保留。三方言迁移与升级演练在隔离环境验证；用户可见文案中英双语。

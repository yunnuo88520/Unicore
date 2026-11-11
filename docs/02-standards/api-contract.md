<!-- Author: yunnuo <ymz@ebox.vip> -->
# 接口契约与错误约定

唯一来源为 [OpenAPI](../../packages/contracts/openapi.json)。先改 schema、operationId、参数、响应、security 与 x-unicore，再执行 `pnpm generate`。生成 Go/TS DTO、typed operation 描述、约束表、错误目录和离线 HTML；`pnpm check:contracts` 检测漂移。HTTP handler 与业务授权仍手写，不能把生成 DTO 等同于自动实现接口。

每个 operation 的 x-unicore 声明适用 profiles、access、permissions、permissionMode、superAdmin 和 csrf。SessionCookie、AdministratorSession（同一 Cookie 的管理端契约别名）、CSRFToken、BootstrapToken 与 BearerToken 在 securitySchemes 登记。运行时策略中间件按契约 fail-closed 执行：没有 x-unicore 声明的已注册 API 路由直接 500 拒绝，session/authenticated/platform-session 访问在中间件解析会话并强制 permissions 与 superAdmin（`require` 复用其会话，补充 2FA 注册与审计 actor），public/install-token/local 仍由 handler 自行守卫。`permissionMode` 缺省与 `all` 要求全部权限点，`any` 要求至少一个，未知模式拒绝。角色可委派的 operation 授权（operation_ids）以契约 operationId 为标识、由 `GET /admin/api-operations` 目录派生，只能在契约允许范围内收窄调用面，不能放宽权限点或保留集（[ADR-0036](../adr/ADR-0036-navigation-regions-granular-authorization.md)）。事务内授权与业务校验仍在 handler/service。真实 Chi 路由测试覆盖完整 Web 装配与最小 Core 装配，并以双向遍历断言"路由↔契约"完全一致，缺 handler 或未登记接口会失败。

响应遵循 `{code, data, request_id}`；失败为 `{code, message, request_id, fields?}`。错误 code 的默认状态和安全提示登记于 x-error-codes；生成 ErrorCatalog 给 HTTP、presenter 与桌面复用。上下文相关提示可以更具体，但不能暴露原始错误、数据库信息或提交值。字段错误使用 name 或 `changes[0].value` 等路径，表单显示摘要并聚焦对应控件。请求 ID 可以反馈给维护者排查。

SDK HttpTransport 的业务方法调用生成 operation，统一处理 Cookie、CSRF、20 秒超时、取消与 AppError。页面只访问 AppClient/WebClient，不拼 HTTP 路径；浏览器 OIDC 回调由导航完成，不能当 JSON 调用。Wails 复用适用 DTO，CLI 保持无 HTTP/平台依赖。

校验支持 `$ref`、object/array/string/integer/boolean、required、additionalProperties、enum、长度/正则、数值/列表范围、uniqueItems 与 x-max-utf8-bytes，以及 email、绝对 URI、date-time 格式。生成器拒绝未实现的 schema keyword；这是明确的 OpenAPI 子集，不是完整 JSON Schema 实现。Go/TS 共用 validation-cases.json 验证输入边界；整数限于 JavaScript 安全整数。业务条件（安装 profile、密码策略、非空白、权限委派等）继续在领域/服务层验证。新增约束需同步两端解释器和共享样例，不能只改表单。

启动 `APP_API_DOCS=true build/bin/server` 后，在线 `/api-docs` 使用随应用打包的 Swagger UI（本地依赖，无 CDN 外呼）读取 `/openapi.json`，兼容路径 `/docs/api` 跳转到该参考页。默认关闭时 `/openapi.json` 与 `/docs/api` 返回 404，应用内参考页提示文档不可用。生成文件 `packages/contracts/reference.gen.html` 仍是不依赖脚本的离线参考，与在线页分别保留。文档包含全部 profile 的操作，当前实例只装配适用能力；文档不携带实例配置或凭据。参考页通过 AppClient 加载契约，禁用请求测试（`supportedSubmitMethods: []`）、校验外呼与持久化认证，不保存 Cookie、令牌或其他凭据；独立 API 调用仍受各 operation 的认证、CSRF 和权限控制。

上传 operation 可在 x-unicore.maxBodyBytes 声明 1–512 KiB 的 JSON 体上限；通用 decoder 按真实路由读取元数据，未声明仍为 64 KiB。当前品牌 PUT 单独为 384 KiB，业务图片原始上限为 256 KiB；禁止为新增上传全局放大所有 API。公开品牌 PNG 与 manifest 是固定格式静态资源接口，不属于 JSON 业务契约。

安装数据库输入使用 DatabaseInput 结构化字段，tls 为布尔开关且默认关闭；dsn 仅为旧客户端兼容，禁止混传。verifyDatabase 返回 DatabaseCheck。清空库名、归属保护与持久化是服务端业务不变量，见 [安装规范](../00-product/feature-installation.md)。

文件流式接口显式声明 streamingUpload / signedDownload，并使用 application/octet-stream 的 binary schema。生成器区分 JSON 与二进制，SDK 专用上传流程负责流和时限；不要把原始文件描述为 JSON，不能全局提高 JSON body limit。私有签名下载由文件服务每次校验状态/时效，route policy 的 public 仅表示不用 Cookie。

两域使用固定路径和 identityRealm 元数据，见 [ADR-0016](../adr/ADR-0016-separate-client-admin-surfaces.md)。管理员 auth/bootstrap 可公开最小投影，本人 account 必须管理员会话；其余管理资源必须声明 permissions/superAdmin。禁止身份请求头选域或跨域重试。

客户端与 API 凭证遵守 [ADR-0041](../adr/ADR-0041-api-token-authentication.md)：新增业务适配器优先消费 policySessionKey 中的统一主体，不得绕过中间件重新假设 Cookie。显式 Bearer 不回落 Cookie，也不混用；PAT 的 operation 范围独立于 super_admin 快捷放行。令牌管理只允许 Cookie，写请求继续 CSRF。浏览器之外的客户端使用 [API 认证](../product/api-authentication.md) 中的 JWT/刷新流程；不把 Refresh Token 当 Access Token。

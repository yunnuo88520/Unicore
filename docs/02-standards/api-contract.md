<!-- Author: yunnuo <ymz@ebox.vip> -->
# 接口契约与错误约定

唯一来源为 [OpenAPI](../../packages/contracts/openapi.json)。先改 schema、operationId、参数、响应、security 与 x-unicore，再执行 `pnpm generate`。生成 Go/TS DTO、typed operation 描述、约束表、错误目录和离线 HTML；`pnpm check:contracts` 检测漂移。HTTP handler 与业务授权仍手写，不能把生成 DTO 等同于自动实现接口。

每个 operation 的 x-unicore 声明适用 profiles、access、permissions、permissionMode、superAdmin 和 csrf。CookieSession、CSRFToken、BootstrapToken 在 securitySchemes 登记。元数据用于文档和完整性检查，服务端仍逐接口执行 require/CSRF/事务内授权。真实 Chi 路由测试覆盖完整 Web 装配与最小 Core 装配，缺 handler 或未登记接口会失败。

响应遵循 `{code, data, request_id}`；失败为 `{code, message, request_id, fields?}`。错误 code 的默认状态和安全提示登记于 x-error-codes；生成 ErrorCatalog 给 HTTP、presenter 与桌面复用。上下文相关提示可以更具体，但不能暴露原始错误、数据库信息或提交值。字段错误使用 name 或 `changes[0].value` 等路径，表单显示摘要并聚焦对应控件。请求 ID 可以反馈给维护者排查。

SDK HttpTransport 的业务方法调用生成 operation，统一处理 Cookie、CSRF、20 秒超时、取消与 AppError。页面只访问 AppClient/WebClient，不拼 HTTP 路径；浏览器 OIDC 回调由导航完成，不能当 JSON 调用。Wails 复用适用 DTO，CLI 保持无 HTTP/平台依赖。

校验支持 `$ref`、object/array/string/integer/boolean、required、additionalProperties、enum、长度/正则、数值/列表范围、uniqueItems 与 x-max-utf8-bytes，以及 email、绝对 URI、date-time 格式。生成器拒绝未实现的 schema keyword；这是明确的 OpenAPI 子集，不是完整 JSON Schema 实现。Go/TS 共用 validation-cases.json 验证输入边界；整数限于 JavaScript 安全整数。业务条件（安装 profile、密码策略、非空白、权限委派等）继续在领域/服务层验证。新增约束需同步两端解释器和共享样例，不能只改表单。

API 文档不依赖 CDN 或脚本。启动 `APP_API_DOCS=true build/bin/server` 后，`/docs/api` 提供文档，`/openapi.json` 提供原始契约；默认关闭时两路径返回 404。本地文件 `packages/contracts/reference.gen.html` 也可离线阅读。文档包含全部 profile 的操作，当前实例只装配适用能力；文档不携带实例配置或凭据。

上传 operation 可在 x-unicore.maxBodyBytes 声明 1–512 KiB 的 JSON 体上限；通用 decoder 按真实路由读取元数据，未声明仍为 64 KiB。当前品牌 PUT 单独为 384 KiB，业务图片原始上限为 256 KiB；禁止为新增上传全局放大所有 API。公开品牌 PNG 与 manifest 是固定格式静态资源接口，不属于 JSON 业务契约。

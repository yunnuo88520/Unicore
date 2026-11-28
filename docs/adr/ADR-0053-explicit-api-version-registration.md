<!-- Author: yunnuo <ymz@ebox.vip> -->
# ADR-0053：显式 API 根版本注册

状态：采用。

## 功能声明

- 功能 ID：api-root-registration；领域：共享 HTTP 接入；归属层：运行载体实现。
- 定位与操作对象：派生模块显式装配完整契约路径的额外 API 根版本，共用服务端安全中间件。
- Platform：新增 HTTP 扩展入口；按每个 operation 的 profile、会话、权限和凭证限制执行。
- Standalone：仅 Web HTTP 载体可登记本地接口；业务语义仍须与 desktop 等效，此入口不新增身份或平台治理。Desktop 无 HTTP 根版本。CLI：不适用。
- 持久化：无；契约影响：登记模块必须先在唯一 OpenAPI 声明完整路径与 x-unicore，再生成 SDK 路径，无自动 v2 别名。
- 呈现：无新增菜单、页面或 widget。条件：统一 Chi 装配、policyRouter 及既有安全策略，无新待决策事项。

## 装配

`httpadapter.Config.APIVersions` 接受 `APIVersion{Root, Register}`；v1 是框架固定默认，额外根必须显式注册成唯一 `/api/vN`（N 为不含前导零的正整数）。重复、嵌套、参数化、无 registrar 的登记在启动时拒绝。Register 只接收 policyRouter 注册面，With/Group/Route/受控 Mount 均保留叶子策略检查；未声明叶子不执行，未知根仍返回 API JSON 404，错误方法返回 JSON 405。

请求在路由匹配前按同一注册表标记根版本。维护模式与 bootstrap/admin/health 恢复例外、管理工作台选择和审计 realm 都使用相对于已登记根的路径；不继续硬编码 v1。profile、会话、权限/operation、PAT 路径限制、CSRF/Origin、登录限流和响应安全头走已有共享中间件。模块处理器用 `RequestSession` 取得策略层主体，避免重新读取 Cookie 而丢失 PAT 绑定角色。

框架认证/OIDC callback、文件上传下载和 bootstrap 等既有接口保持 v1，不复制整套接口到新版本；业务通常仍可沿用 `/api/v1/<module>/<business-version>/...`。新版本的业务接口由模块自行声明、实现及登记，不能将 incoming URL 改写成 v1 后匹配旧权限。客户端请求路径来自生成的 operation 描述；SDK 不剥离或强加 v1 前缀，JSON、二进制、multipart 与本地上传 grant 都保留完整根路径，附带会话凭证前拒绝外部或非 API 目标。生成链对所有 `/api/vN/admin/` 保持管理员 realm、security scheme 和权限声明检查。

## 验证

契约双向遍历走真实根路由，使用完整路径而不拼 v1 前缀。下游导出回归只在隔离源码夹具中增加 v2 OpenAPI 操作，运行真正的生成链与嵌入契约 HTTP server，验证会话/权限、PAT operation 与凭证路径限制、CSRF/Origin、profile、限流、审计、维护及恢复例外、fail-closed、404/405。正式契约不为测试添加虚构的 v2 operation。

<!-- Author: yunnuo <ymz@ebox.vip> -->
# 权限与错误契约

平台默认拒绝。未登录 401；已登录但无权 403。已认证写操作校验 CSRF/Origin；公开账号流程校验 Origin、验证码/限流和按需的一次性令牌，安装操作单独校验 bootstrap token。固定管理员 super_admin 获得下列所有管理权限；普通用户 user 无任何管理权限，但可调用共享 Core、管理本人账号及本地外观。所有管理接口（含只读）要求实际管理员角色，不能靠数据库残留 grant 授权。

| 权限 | API |
| --- | --- |
| dashboard:read | GET /api/v1/admin/dashboard |
| users:read | GET /api/v1/admin/users |
| users:create | POST /api/v1/admin/users；仅管理员，可分配 super_admin/user |
| users:update | PATCH /api/v1/admin/users/{id}；仅管理员，保护最后管理员 |
| roles:read | GET /api/v1/admin/roles（含权限目录） |
| settings:read | GET /api/v1/admin/settings、GET /api/v1/admin/settings/mail/jobs、GET /api/v1/admin/settings/mail/templates |
| settings:write | PATCH /api/v1/admin/settings、POST /api/v1/admin/settings/mail/test；还需 super_admin，禁止委派 |

单机/桌面只提供适用的本地设置，不创建 users/roles/sessions；CLI 不提供设置。权限定义源 internal/platform/roles.go；SQL adapter 只按固定角色投影权限，历史 RolePermission 不参与授权。平台 appearance.theme 不适用，PATCH 拒绝；本地外观不调用管理 API。

API/DTO 唯一来源为 packages/contracts/openapi.json。成功 `{code:"OK",message:"",data,request_id}`；失败返回稳定 code 与脱敏 message。主要错误：BOOTSTRAP_TOKEN_INVALID、ALREADY_INSTALLED、DATABASE_INITIALIZED、DATABASE_UNAVAILABLE、INSTALL_REQUIRED、AUTH_REQUIRED、PERMISSION_DENIED、CSRF_INVALID、CAPTCHA_INVALID、RATE_LIMITED、LAST_SUPER_ADMIN、ACCOUNT_EXISTS、INVALID_INPUT、NOT_FOUND。

Cookie 为 unicore_session/HttpOnly/SameSite=Lax，HTTPS base_url 时 Secure。session token 只哈希入库。bootstrap/session 返回当前会话派生的 csrf_token，SDK 自动在写请求 X-CSRF-Token 中发送。登出删除会话，禁用/角色变化使所有旧会话失效。登录活动按 last_login_at 统计，不把 UI 打开视为活跃。

公开平台 API：GET /auth/policy、GET /auth/captcha、POST /auth/register、POST /auth/verification/request、POST /auth/verification/complete、POST /auth/password/request、POST /auth/password/reset，均在 /api/v1 下；其他 profile 为 JSON 404。注册/申请受实例开关、SMTP 就绪、验证码和 IP/邮箱限流约束；消费使用分用途一次性令牌，无 GET 副作用。未知/重复/禁用账号申请统一成功，不返回用户或 token。

新增错误：MAIL_NOT_READY、MAIL_DELIVERY_FAILED、ACCOUNT_FLOW_DISABLED、TOKEN_INVALID。设置 SMTP 密钥返回 value:""、sensitive:true、configured；PATCH value:"" 表示保留，clear:true 且 value:"" 表示清空。令牌/SMTP 响应/邮件内容不进入任务列表或审计。密码重置与用户状态/角色变化吊销待用令牌和全部会话；创建会话也校验密码版本。

M2c 公开数字码 API：POST /auth/email/register；POST /auth/email/{verify,reset,login}/request 和 /complete。申请返回 challenge_id、expires_in、retry_after，未知/不适用账号同形响应。完成需要 challenge_id、6 位 code、password（仅 reset 使用，其他用途为空）。登录成功返回 Session 并设置 HttpOnly cookie。相同 Origin/限流/验证码和按用途策略约束，5 次错误后拒绝再消费。旧长链接 API 已 deprecated，仅供兼容。模板预览包含固定示例码，不包含真实邮件或 SMTP 配置。

GET /api/v1/admin/users/role-options 仅管理员，返回两种固定角色及 assignable；GET /api/v1/admin/roles 返回只读角色/权限矩阵。用户创建/更新的 role 枚举限定 super_admin/user。没有 RoleInput、自定义角色写接口或 roles:write 权限；POST /admin/roles 为 JSON 405，PATCH/DELETE /admin/roles/{id} 为 JSON 404。以上均含 /api/v1 前缀。

用户写入在安装锁事务内复核操作者与最后管理员保护。已认证普通用户的 /admin（含自定义后台路径）HTML 入口为 403；匿名可加载登录界面，后续 API 仍受保护。当前角色迁移见 [ADR-0012](../adr/ADR-0012-fixed-platform-roles.md)。

## M3a OIDC（/api/v1 前缀）

| API | 服务端授权 |
| --- | --- |
| GET /auth/oidc | 公开，仅返回启用状态、显示名称和固定回调；不返回密钥 |
| POST /auth/oidc/start | 公开，同源校验、IP 限流；设置短期浏览器凭据 |
| GET /auth/oidc/callback | 一次性 state + 浏览器 Cookie + PKCE + 签名 ID token；固定 303 |
| GET /account/oidc | 有效平台 session，仅当前用户 |
| POST /account/oidc/link | 当前用户 session + CSRF + 本地密码；企业重新认证 |
| POST /account/oidc/unlink | 当前用户 session + CSRF + 本地密码；事务撤销旧会话 |
| POST /admin/settings/oidc/check | settings:write + 真实 super_admin + CSRF，限流 |
| PATCH /admin/settings（oidc.*） | 沿用 settings:write + 真实 super_admin + CSRF |

OIDC_UNAVAILABLE=502：发现服务或端点检查失败；OIDC_FAILED=409：绑定证明或身份冲突；LOCAL_PASSWORD_REQUIRED=409：没有本地密码。回调不返回 JSON 敏感详情，固定 hash 的 success/failed/link_required 均不含原始 IdP 错误。LAST_SUPER_ADMIN 同时保护最后一个 active 本地密码超管。接口具体 DTO 以 OpenAPI 为准。

M3b：GET /api/v1/admin/branding 要求 settings:read；PUT 同路径要求 settings:write + super_admin + CSRF/Origin。GET/PUT /api/v1/branding 仅安装后的 web-standalone 提供，平台返回 JSON 404。公开 bootstrap/哈希 PNG 允许登录前显示品牌，均不泄露存储路径；BRAND_INVALID=400。branding.* 托管设置不能通过普通 PATCH settings 绕过上传服务。

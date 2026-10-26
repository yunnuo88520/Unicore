<!-- Author: yunnuo <ymz@ebox.vip> -->
# M2b 权限与错误契约

平台默认拒绝。未登录 401；已登录但无权 403。已认证写操作校验 CSRF/Origin；公开账号流程校验 Origin、验证码/限流和按需的一次性令牌，安装操作单独校验 bootstrap token。super_admin 获得下列所有权限，user 无管理权限但可调用共享 Core。

| 权限 | API |
| --- | --- |
| dashboard:read | GET /api/v1/admin/dashboard |
| users:read | GET /api/v1/admin/users |
| users:create | POST /api/v1/admin/users；授予超管还需 actor 是超管 |
| users:update | PATCH /api/v1/admin/users/{id}；当前角色/启停操作还需超管 |
| settings:read | GET /api/v1/admin/settings、GET /api/v1/admin/settings/mail/jobs |
| settings:write | PATCH /api/v1/admin/settings、POST /api/v1/admin/settings/mail/test |

单机/桌面只提供适用的本地设置，不创建 users/roles/sessions；CLI 不提供设置。权限定义源 internal/platform/service.go，具体 SQL adapter 存储 UserRole/RolePermission。后续业务角色编辑按既有关系扩展。

API/DTO 唯一来源为 packages/contracts/openapi.json。成功 `{code:"OK",message:"",data,request_id}`；失败返回稳定 code 与脱敏 message。主要错误：BOOTSTRAP_TOKEN_INVALID、ALREADY_INSTALLED、DATABASE_INITIALIZED、DATABASE_UNAVAILABLE、INSTALL_REQUIRED、AUTH_REQUIRED、PERMISSION_DENIED、CSRF_INVALID、CAPTCHA_INVALID、RATE_LIMITED、LAST_SUPER_ADMIN、ACCOUNT_EXISTS、INVALID_INPUT、NOT_FOUND。

Cookie 为 unicore_session/HttpOnly/SameSite=Lax，HTTPS base_url 时 Secure。session token 只哈希入库。bootstrap/session 返回当前会话派生的 csrf_token，SDK 自动在写请求 X-CSRF-Token 中发送。登出删除会话，禁用/角色变化使所有旧会话失效。登录活动按 last_login_at 统计，不把 UI 打开视为活跃。

公开平台 API：GET /auth/policy、GET /auth/captcha、POST /auth/register、POST /auth/verification/request、POST /auth/verification/complete、POST /auth/password/request、POST /auth/password/reset，均在 /api/v1 下；其他 profile 为 JSON 404。注册/申请受实例开关、SMTP 就绪、验证码和 IP/邮箱限流约束；消费使用分用途一次性令牌，无 GET 副作用。未知/重复/禁用账号申请统一成功，不返回用户或 token。

新增错误：MAIL_NOT_READY、MAIL_DELIVERY_FAILED、ACCOUNT_FLOW_DISABLED、TOKEN_INVALID。设置 SMTP 密钥返回 value:""、sensitive:true、configured；PATCH value:"" 表示保留，clear:true 且 value:"" 表示清空。令牌/SMTP 响应/邮件内容不进入任务列表或审计。密码重置与用户状态/角色变化吊销待用令牌和全部会话；创建会话也校验密码版本。

<!-- Author: yunnuo <ymz@ebox.vip> -->
# M2a 权限与错误契约

平台默认拒绝。未登录 401；已登录但无权 403。所有写操作校验 CSRF/Origin，安装操作单独校验一次性 token。super_admin 获得下列所有权限，user 无管理权限但可调用共享 Core。

| 权限 | API |
| --- | --- |
| dashboard:read | GET /api/v1/admin/dashboard |
| users:read | GET /api/v1/admin/users |
| users:create | POST /api/v1/admin/users；授予超管还需 actor 是超管 |
| users:update | PATCH /api/v1/admin/users/{id}；当前角色/启停操作还需超管 |
| settings:read | GET /api/v1/admin/settings |
| settings:write | PATCH /api/v1/admin/settings |

单机/桌面只提供适用的本地设置，不创建 users/roles/sessions；CLI 不提供设置。权限定义源 internal/platform/service.go，具体 SQL adapter 存储 UserRole/RolePermission。后续业务角色编辑按既有关系扩展。

API/DTO 唯一来源为 packages/contracts/openapi.json。成功 `{code:"OK",message:"",data,request_id}`；失败返回稳定 code 与脱敏 message。主要错误：BOOTSTRAP_TOKEN_INVALID、ALREADY_INSTALLED、DATABASE_INITIALIZED、DATABASE_UNAVAILABLE、INSTALL_REQUIRED、AUTH_REQUIRED、PERMISSION_DENIED、CSRF_INVALID、CAPTCHA_INVALID、RATE_LIMITED、LAST_SUPER_ADMIN、ACCOUNT_EXISTS、INVALID_INPUT、NOT_FOUND。

Cookie 为 unicore_session/HttpOnly/SameSite=Lax，HTTPS base_url 时 Secure。session token 只哈希入库。bootstrap/session 返回当前会话派生的 csrf_token，SDK 自动在写请求 X-CSRF-Token 中发送。登出删除会话，禁用/角色变化使所有旧会话失效。登录活动按 last_login_at 统计，不把 UI 打开视为活跃。

<!-- Author: yunnuo <ymz@ebox.vip> -->
# 权限与错误契约

平台默认拒绝：匿名 401，普通用户访问管理 API 为 403。管理业务 API 需实际管理员身份与权限；管理员认证前的 bootstrap/auth 仅返回公开最小投影，本人 account 需对应管理员会话；写操作校验 CSRF/Origin。权限源 internal/platform/roles.go，API/DTO 唯一源 packages/contracts/openapi.json；历史 role_permissions 不授权普通用户。

| 权限 | API（均在 /api/v1 下） |
| --- | --- |
| admin:access | POST /admin/core/execute |
| users:read/create/update | GET/POST /admin/users；PATCH /admin/users/{id}，role 必须为 user |
| administrators:read/create/update | GET/POST /admin/administrators；PATCH /admin/administrators/{id}，role 必须为 super_admin |
| roles:read | GET /admin/roles；GET /admin/users/role-options，只读固定目录 |
| settings:read | GET /admin/settings、/admin/branding、/admin/settings/mail/templates |
| settings:write | PATCH /admin/settings；PUT /admin/branding；POST /admin/settings/mail/test、/admin/settings/oidc/check |
| logs:read | GET /admin/logs、/admin/mail/jobs |
| updates:read | GET /admin/updates；POST /admin/updates/check |
| updates:apply | POST /admin/updates/apply，需确认已备份 |

管理员/普通用户使用不同账号和凭据表。固定 API 路径选择域：用户 /api/v1/auth、account、files，管理员 /api/v1/admin/auth、account、files；身份请求头不再生效，无回退；Cookie 分别为 unicore_session/unicore_administrator_session，HttpOnly/SameSite=Lax，HTTPS origin 时 Secure。管理端点的目标仓库固定，actor 在事务中从管理员表重查，保护最后启用及最后有本地密码管理员。禁止用户角色升降，不提供自定义角色写接口。后台 HTML 为公开登录壳，不因普通用户 Cookie 返回管理信息；API 始终独立鉴权。详见 [ADR-0014](../adr/ADR-0014-separate-identities-management.md)。

POST /account/password 与 /admin/account/password 分别仅对应域登录账号，需 CSRF/Origin，提交 current_password/password（新密码 12–128 位）。旧密码验证及锁内密码快照复核后更新，撤销该账号的当前域会话/账号挑战，清除对应 Cookie，重新登录；其他域不受影响。企业绑定也受当前域限制；两个固定 callback 使用独立浏览器证明 Cookie，管理员不允许 JIT。

普通用户可以调用 Core、本人账号与本地外观，不能读取全局设置。平台 appearance.theme 不注册，PATCH 拒绝；外观只写当前客户端。单机/桌面没有平台表/认证接口，CLI 没有设置或 DB 强依赖。

统一成功响应为 `{code:"OK",message:"",data,request_id}`，失败使用稳定 code、脱敏 message 与可选字段错误。错误目录由契约生成；包括安装凭据/状态、数据库连接/非空确认、认证权限/CSRF、验证码限流、最后管理员、账号冲突和输入错误。未知接口 JSON 404，不使用 SPA fallback。bootstrap/session 返回会话派生 csrf_token，SDK 自动附加；令牌只哈希持久化。

公开账号接口包括 /auth/policy、/auth/captcha、/auth/login、/auth/email/register、/auth/email/{verify,reset,login}/request 和 /complete，所有路径位于 /api/v1。注册仅普通域；SMTP 就绪、实例开关、图形验证码和限流仍适用。申请返回 challenge_id、expires_in、retry_after，未知/禁用账号同形成功。完成提交 challenge_id、六位 code 及用途需要的 password；10 分钟有效、60 秒重发、最多 5 次错误，分用途原子一次性消费。登录设置所选域 Cookie。密码重置撤销该域账号旧会话与挑战，创建会话再次检查密码版本。

旧 /auth/register、/auth/verification/{request,complete}、/auth/password/{request,reset} 仅兼容长链接，已 deprecated；无 GET 消费。链接回到对应域入口。模板预览仅管理员内部 API，固定示例码，不在设置显示模板标签；不含真实邮件或 SMTP 密钥。SMTP 敏感值始终为空并附 configured，空 PATCH 保留，clear:true 显式清除；任务列表/审计不包含密钥、正文或验证码。

系统日志当前仅最近 50 条操作与最近 30 条邮件任务；未提供完整检索/导出/日志采集平台。授权仍占位；系统更新已实现签名检查、离线日志和手动安装。平台普通用户不能读取更新 API 或版本元信息，管理员写操作仍验证 CSRF/Origin；单机 /updates 对应操作同时要求 Host 和实际连接来自 loopback，桌面使用原生桥接。CLI 不装配，Docker 拒绝应用内安装。恢复与更新边界见 [更新手册](../03-runbooks/updates.md)。

对象存储：storage:read / storage:write 固定管理员，所有 /admin/storage/* 与 /admin/files/* 独立鉴权。/files 仅普通用户本人身份域，/admin/files 使用管理员域并校验存储权限；未登录返回 401，非本人文件返回 404；本地 content 只接受短期签名，不接受文件名或磁盘路径。完整接口见 OpenAPI，流式上传声明 streamingUpload，签名下载声明 signedDownload。

当前双入口、单机边界和升级兼容说明见 [ADR-0016](../adr/ADR-0016-separate-client-admin-surfaces.md)。

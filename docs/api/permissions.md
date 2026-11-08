<!-- Author: yunnuo <ymz@ebox.vip> -->
# 权限与错误契约

平台默认拒绝：匿名 401，普通用户访问管理 API 为 403。管理业务 API 需实际管理员身份与权限；管理员认证前的 bootstrap/auth 仅返回公开最小投影，本人 account 需对应管理员会话；写操作校验 CSRF/Origin。权限源 internal/platform/roles.go（Assignable 标记决定能否授予自建角色），API/DTO 唯一源 packages/contracts/openapi.json。授权由 role_permissions 表驱动：用户域角色经 /admin/roles CRUD（roles:write）创建并勾选 assignable 权限点；管理员域在 super_admin 之外支持受限角色，会话权限为所配角色权限并集（含 super_admin 即目录全量），成员/权限变更吊销对应域会话。superAdmin 保留集（roles:write、administrators:*、settings:write、updates:apply、storage:write）仍仅 super_admin，即使授予自建角色也在会话层拦截。在权限点之上，角色分别授予 `menu_ids`（菜单/页面入口）、`action_ids`（页面动作）与 `operation_ids`（可委派 API operation），三类授权独立勾选、互不隐含，保存空数组被拒绝；`menu_ids` 只按角色过滤菜单可见性与入口，不授予任何 API 能力。运行时每次请求同时满足契约权限点与适用的 operation grant（grant 只能收窄，见 [ADR-0036](../adr/ADR-0036-navigation-regions-granular-authorization.md)）。API 目录（GET /admin/api-operations 及管理端 API 目录页）由契约 operationId 派生，必要流程（认证、bootstrap、本人账号恢复）与不可委派项不在可授予集合。权限目录同步与授权初始化分离：常规 `EnsurePermissions` 与重启不重新授予已撤销权限。见 [ADR-0033](../adr/ADR-0033-dynamic-user-roles.md)、[ADR-0034](../adr/ADR-0034-administrator-restricted-roles.md)。用户域角色另带 data_scope（all/dept_and_below/dept/custom/self，默认 self；administrator 域固定 self），驱动用户域笔记/文件的列表、读取与签名下载按部门范围过滤，行级 capabilities 标识真实可执行操作，写入仍按属主或显式业务规则校验；未知范围值按仅本人 fail-closed，范围解析或数据库错误拒绝请求，成员集合分批解析不静默截断（见 [ADR-0035](../adr/ADR-0035-action-permissions-departments.md)、[ADR-0036](../adr/ADR-0036-navigation-regions-granular-authorization.md)）。

| 权限 | API（均在 /api/v1 下） |
| --- | --- |
| roles:write | POST /admin/roles；PUT/DELETE /admin/roles/{id}（仅 super_admin；自建角色声明 user/administrator 域，保存要求携带非空 menu_ids/action_ids/operation_ids） |
| menus:write | GET/PUT /admin/menus（两域真实区域导航树 navigation.{sections,nodes,version}，PUT 版本号 CAS 冲突返回 409，空数组持久化为空树；`reset` 恢复两域默认，仅 super_admin） |
| posts:read/write | GET /admin/posts；POST /admin/posts；PUT/DELETE /admin/posts/{id}（岗位目录，assignable；删除仍有用户关联的岗位返回冲突。用户创建/更新携带 post_ids 多岗位，用户列表支持 post_id 过滤） |
| dictionaries:read/write | GET/POST /admin/dictionaries；GET/PUT/DELETE /admin/dictionaries/{id}；PUT /admin/dictionaries/{id}/items（可授权给管理员域角色）；用户域 GET /dictionaries/{code} 读取 active 条目 |
| departments:read/write | GET/POST /admin/departments；PUT/DELETE /admin/departments/{id}（部门组织树，assignable 双域可授；删除被子部门或用户挂靠返回 409 DEPARTMENT_IN_USE） |
| files:access / notes:access | 用户域页面与读取门槛（assignable，可授予自建角色；内置 user 角色默认持有）。files:access 覆盖 GET /files、/files/policy、/files/{id}/access；notes:access 覆盖 GET /notes；撤销后仅保留登录与数据归属校验 |
| notes:create/update/delete<br>files:upload/delete | 用户域写操作的动作权限点（assignable，按钮级授权）：POST /notes、PUT/DELETE /notes/{id}；POST /files/uploads 与 multipart 全流程、DELETE /files/{id}。前端按钮按点渲染，API 与按钮同一权限点（见 [ADR-0035](../adr/ADR-0035-action-permissions-departments.md)） |

| 权限 | API（均在 /api/v1 下） |
| --- | --- |
| admin:access | POST /admin/core/execute；GET /admin/dashboard（管理员工作台统计） |
| users:read/create/update | GET/POST /admin/users；PATCH /admin/users/{id}，用户域 role 可为 user 或任意自建角色；用户保存可携带 post_ids 多岗位，列表支持 post_id 过滤 |
| administrators:read/create/update | GET/POST /admin/administrators；PATCH /admin/administrators/{id}，role 为 super_admin 或管理员域自建角色（均仅 super_admin） |
| roles:read | GET /admin/roles（双域自建角色与成员数）；GET /admin/users/role-options（用户域返回 user+自建角色）；GET /admin/roles/admin-options（管理员域返回 super_admin+自建角色，仅 super_admin） |
| settings:read | GET /admin/settings、/admin/branding、/admin/settings/mail/templates |
| settings:write | PATCH /admin/settings；PUT /admin/branding；POST /admin/settings/mail/test、/admin/settings/oidc/check；PUT /admin/settings/mail/templates；POST /admin/settings/mail/templates/{preview,test,reset} |
| logs:read | GET /admin/logs、/admin/logs/export、/admin/mail/jobs |
| tasks:read | GET /admin/tasks；GET /admin/tasks/{name}/runs（运行历史） |
| tasks:write | POST /admin/tasks（创建）；PATCH /admin/tasks/{name}（编辑）；DELETE /admin/tasks/{name}（删除）；PUT /admin/tasks/{name}（启停）；POST /admin/tasks/{name}/run（接收手动触发） |
| api-operations 目录 | GET /admin/api-operations（契约派生 operation 目录，供角色 operation_ids 授权勾选；要求 roles:read，管理员域可授） |
| updates:read | GET /admin/updates；POST /admin/updates/check |
| updates:apply | POST /admin/updates/apply，需确认已备份 |

管理员/普通用户使用不同账号和凭据表。固定 API 路径选择域：用户 /api/v1/auth、account、files，管理员 /api/v1/admin/auth、account、files；身份请求头不再生效，无回退；Cookie 分别为 unicore_session/unicore_administrator_session，HttpOnly/SameSite=Lax，HTTPS origin 时 Secure。管理端点的目标仓库固定，actor 在事务中从管理员表重查，保护最后启用及最后有本地密码管理员。禁止用户域账号持有 super_admin（403），管理员域账号持有 super_admin 即目录全量，否则按所配角色并集；用户域角色与管理员域角色都在 /admin/roles 维护且不可跨域分配。后台 HTML 为公开登录壳，不因普通用户 Cookie 返回管理信息；API 始终独立鉴权。详见 [ADR-0014](../adr/ADR-0014-separate-identities-management.md)。

POST /account/password 与 /admin/account/password 分别仅对应域登录账号，需 CSRF/Origin，提交 current_password/password（新密码 12–128 位）。旧密码验证及锁内密码快照复核后更新，撤销该账号的当前域会话/账号挑战，清除对应 Cookie，重新登录；其他域不受影响。企业绑定也受当前域限制；两个固定 callback 使用独立浏览器证明 Cookie，管理员不允许 JIT。

普通用户可以调用 Core、本人账号与本地外观，不能读取全局设置。平台 appearance.theme 不注册，PATCH 拒绝；外观只写当前客户端。单机/桌面没有平台表/认证接口，CLI 没有设置或 DB 强依赖。

统一成功响应为 `{code:"OK",message:"",data,request_id}`，失败使用稳定 code、脱敏 message 与可选字段错误。错误目录由契约生成；包括安装凭据/状态、数据库连接/非空确认、认证权限/CSRF、验证码限流、最后管理员、账号冲突和输入错误。未知接口 JSON 404，不使用 SPA fallback。bootstrap/session 返回会话派生 csrf_token，SDK 自动附加；令牌只哈希持久化。

公开账号接口包括 /auth/policy、/auth/captcha、/auth/login、/auth/email/register、/auth/email/{verify,reset,login}/request 和 /complete，所有路径位于 /api/v1。注册仅普通域；开放注册与邮箱验证独立控制，图形验证码、限流与后端注册限制仍适用。关闭验证时无需 SMTP，创建 active 普通用户并返回 registration_complete=true，不创建邮件挑战；开启验证及其他邮件流程需 SMTP 就绪。申请返回 challenge_id、expires_in、retry_after，未知/禁用账号同形成功。完成提交 challenge_id、六位 code 及用途需要的 password；10 分钟有效、60 秒重发、最多 5 次错误，分用途原子一次性消费。登录设置所选域 Cookie。密码重置撤销该域账号旧会话与挑战，创建会话再次检查密码版本。

旧 /auth/register、/auth/verification/{request,complete}、/auth/password/{request,reset} 仅兼容长链接，已 deprecated；无 GET 消费。链接回到对应域入口。模板管理为独立管理员页面与专用 API，固定预览示例码，不含真实验证码或 SMTP 密钥；内容受变量及 HTML 白名单约束，保存持久化到 mail.template.*，通用设置 PATCH 禁止写入。SMTP 敏感值始终为空并附 configured，空 PATCH 保留，clear:true 显式清除；任务列表/审计不包含密钥、正文或验证码。

操作日志支持类型/关键词/日期筛选、稳定排序、分页与最多 10,000 条 CSV 导出；旧记录缺失元数据不补造，IP 仅实际连接地址。邮件任务仍为最近 30 条；未提供外部日志采集平台。详见 [管理工具](../03-runbooks/admin-tools.md)。授权仍占位；系统更新已实现签名检查、离线日志和手动安装。平台普通用户不能读取更新 API 或版本元信息，管理员写操作仍验证 CSRF/Origin；单机 /updates 对应操作同时要求 Host 和实际连接来自 loopback，桌面使用原生桥接。CLI 不装配，Docker 拒绝应用内安装。恢复与更新边界见 [更新手册](../03-runbooks/updates.md)。

对象存储：storage:read / storage:write 固定管理员，所有 /admin/storage/* 与 /admin/files/* 独立鉴权。/files 仅普通用户本人身份域，/admin/files 使用管理员域并校验存储权限；未登录返回 401，非本人文件返回 404；本地 content 只接受短期签名，不接受文件名或磁盘路径。完整接口见 OpenAPI，流式上传声明 streamingUpload，签名下载声明 signedDownload。

当前双入口、单机边界和升级兼容说明见 [ADR-0016](../adr/ADR-0016-separate-client-admin-surfaces.md)。

平台维护开启时，用户域认证与业务 API 在进入处理器前返回 503 MAINTENANCE_MODE；bootstrap/健康检查与管理员固定域保留，管理员资源仍独立鉴权。公开 bootstrap 仅新增维护状态/提示和可发布页脚字段，不包含管理员通知邮箱。

本人个人中心使用 /account/profile、/account/totp/*、/account/email/*、/account/sessions*；管理员对应 /admin/account/*，仅对应域本人会话，不授予全局管理能力。所有写操作校验 CSRF/Origin。受限 MFA 会话只能访问 bootstrap 与固定 /auth/mfa、/auth/mfa/cancel（管理员 /admin/auth/*），需绑定 Cookie 的 CSRF；不能读取本人资料或业务。强制设置但未绑定验证器时仅允许 account/*、session/logout，其余受保护业务拒绝。代码规则与错误见 [ADR-0031](../adr/ADR-0031-personal-center-security.md)，不扩大 admin 前缀豁免范围。

账户安全页面复用 settings:read/write；用户与管理员列表的 totp_enabled 是只读安全状态，不能通过 UserCreate/UserUpdate 修改。服务器在所有固定域会话读取时校验空闲与管理员绝对时限，强制 2FA 按域生效，不能靠页面隐藏绕过。

公告 /announcements/* 仅用户域本人会话；单条和全量已读写入要求 CSRF，不能提交其他 user_id。/admin/announcements/{id}/read-status 要求 announcements:read 和管理员域；用户投影排除接收人、内部备注及管理员字段。

`GET /events` SSE 与 `GET /inbox` 仅平台用户域会话；`POST /inbox/{id}/read`、`POST /inbox/read-all` 还要求 CSRF。收件人来自可信会话，客户端不能指定其他 recipient_id；站内信按原公告当前开关、时间、状态与受众过滤，已读状态与公告阅读记录独立。SSE 建立连接、推送与心跳前复核会话及强制两步验证，推送只提示重新查询，不绕过后续资源鉴权。当前没有站内信发送管理 API。

XLSX：`GET /admin/users/export.xlsx` 要求 users:read；`GET /admin/users/import-template.xlsx` 与 `POST /admin/users/import.xlsx` 要求 users:create；`GET /admin/files/export.xlsx` 要求 storage:read。全部固定管理员域，导入要求 CSRF/Origin并复用用户创建和角色规则；没有管理员账号导入或普通用户导出全站文件的权限。下载为二进制工作簿，不套 JSON 成功信封；导入反馈和错误仍为标准 JSON。

头像通过本人 `PATCH /account/profile` 或 `/admin/account/profile` 保存 avatar_file_id，服务端验证对应身份域和文件归属，并投影短期 avatar_url；不接受外部 URL 作为持久引用。文件访问继续受原有元数据、状态、时效及签名规则控制。

无本地密码的已绑定账号可 POST `/account/oidc/totp`（管理员 `/admin/account/oidc/totp`）发起企业重新认证，需本人会话、CSRF/Origin，不授予管理权限。固定 OIDC callback 验证原浏览器与会话及原绑定身份，成功只准备 TOTP 设置；GET `/account/totp/setup`（管理员同前缀）以 no-store 返回当前会话尚未启用、未过期的待设置密钥，不返回已启用密钥。取消、过期、错误耗尽或成功启用后不能读取。此流程不绕过已有 TOTP，也不替代本地密码账号的密码确认；其他本人 TOTP 接口与业务门禁保持一致。

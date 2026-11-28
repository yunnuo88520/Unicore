<!-- Author: yunnuo <ymz@ebox.vip> -->
# 权限与错误契约

统一账号与多角色见 [ADR-0037](../adr/ADR-0037-unified-user-identity.md)。账号与会话共享不代表任意账号都能登录管理工作台：管理入口准入按完整账号的 `HasManagementAccess` 判断；通过入口准入后，每项管理 API 仍独立校验权限点、适用的 API operation grant、超级管理员保留策略及 CSRF/Origin。用户工作台准入与 API 授权不由账号表或路径本身授予。角色可组合业务与管理权限；菜单、动作、API 授权分别取并集。角色分配仅超管可执行，账号编辑者不得借机提权；最后启用超管及最后有本地密码超管受保护。两端本人 account API 均针对同一会话账号，identity_realm 仅描述工作台。普通账号遭管理入口拒绝不会撤销有效用户会话，管理 bootstrap/session 不会投影用户会话身份。匿名受保护请求为 401，缺少权限为 403。

| 权限 | API（均在 /api/v1 下） |
| --- | --- |
| roles:write | POST /admin/roles；PUT/DELETE /admin/roles/{id}（仅 super_admin；角色可组合两个工作台的权限与授权；创建与更新角色拒绝 super_admin 保留权限点进入存储角色行，保留点仅由 super_admin 隐式持有）；PUT /admin/menus/{id}/roles 同时要求 menus:write、roles:write 与 super_admin |
| menus:write | GET/PUT /admin/menus（单棵共享导航树 navigation.{sections,nodes,version}，PUT 版本号 CAS 冲突返回 409，空数组持久化为空树；`reset` 恢复共享默认树，仅 super_admin） |
| posts:read/write | GET /admin/posts；POST /admin/posts；PUT/DELETE /admin/posts/{id}（岗位目录，assignable；删除仍有用户关联的岗位返回冲突。用户创建/更新携带 post_ids 多岗位，用户列表支持 post_id 过滤） |
| dictionaries:read/write | GET/POST /admin/dictionaries；GET/PUT/DELETE /admin/dictionaries/{id}；PUT /admin/dictionaries/{id}/items（可授权给管理员域角色）；用户域 GET /dictionaries/{code} 读取 active 条目 |
| departments:read/write | GET/POST /admin/departments；PUT/DELETE /admin/departments/{id}（部门组织树，assignable 双域可授；删除被子部门或用户挂靠返回 409 DEPARTMENT_IN_USE） |
| files:access / notes:access | 业务读取门槛。notes:access 为默认用户业务权限；files:* 仅显式授权文件 API，不再默认授予 user，无文件管理页面。files:access 覆盖 GET /files；POST /files/{id}/access 要求 files:access 或 notes:access 任一（跨用户下载须提交可读笔记的 note_id）；GET /files/policy 仅要求登录，不设权限点；notes:access 覆盖 GET /notes；撤销后仅保留登录与数据归属校验 |
| notes:create/update/delete<br>files:upload/delete | 业务写操作权限点（notes:* 默认用户业务权限；files:* 仅显式 API 授权）：POST /notes、PUT/DELETE /notes/{id}；POST /files/uploads 与 multipart 全流程、DELETE /files/{id}。前端按钮联合校验权限点、动作授权及 API 授权，API 按契约权限点和 operation grant 校验（见 [ADR-0035](../adr/ADR-0035-action-permissions-departments.md)） |

| 权限 | API（均在 /api/v1 下） |
| --- | --- |
| admin:access | POST /admin/core/execute；GET /admin/dashboard（管理员工作台统计） |
| users:read/create/update | GET/POST /admin/users；PATCH /admin/users/{id}，用户域 role 可为 user 或任意自建角色；用户保存可携带 post_ids 多岗位，列表支持 post_id 过滤；GET /admin/users/role-options（返回统一角色选项，users:read/create/update 任一可调；分配仍仅超管）；实际修改登录邮箱还须 users:credentials:write 及其范围 |
| users:credentials:write | POST /admin/users/{id}/password；PATCH /admin/users/{id} 实际修改规范化后的登录邮箱时追加校验。可委派普通业务目标；完整目标具有 HasManagementAccess 时仅 super_admin；管理端凭据写一律禁止 PAT，不自动授予旧角色 |
| administrators:read/create/update | GET/POST /admin/administrators；PATCH /admin/administrators/{id}，统一账号管理的旧别名（均仅 super_admin），新界面使用 /admin/users 与 role_ids |
| roles:read | GET /admin/roles（双域自建角色与成员数）；GET /admin/roles/admin-options（返回统一角色选项，仅 super_admin）。注意 GET /admin/users/role-options 不属于 roles:read，见上行 users:read/create/update |
| settings:read | GET /admin/settings、/admin/branding、/admin/settings/mail/templates |
| settings:write | PATCH /admin/settings；PUT /admin/branding；POST /admin/settings/mail/test、/admin/settings/oidc/check；PUT /admin/settings/mail/templates；POST /admin/settings/mail/templates/{preview,test,reset} |
| logs:read | GET /admin/logs、/admin/logs/export、/admin/mail/jobs |
| tasks:read | GET /admin/tasks；GET /admin/tasks/{name}/runs（运行历史） |
| tasks:write | POST /admin/tasks（创建）；PATCH /admin/tasks/{name}（编辑）；DELETE /admin/tasks/{name}（删除）；PUT /admin/tasks/{name}（启停）；POST /admin/tasks/{name}/run（接收手动触发） |
| announcements:read/write | GET /admin/announcements、/admin/announcements/{id}/read-status、/admin/announcements/settings（announcements:read）；POST /admin/announcements、PUT /admin/announcements/{id}、POST /admin/announcements/delete、PUT /admin/announcements/settings、POST /admin/announcements/preview（announcements:write），见 [公告手册](../03-runbooks/announcements.md) |
| 角色高级 API 授权 | GET /admin/api-operations（契约派生 operation 目录，供角色 operation_ids 授权勾选；要求 roles:read，管理员域可授） |
| updates:read | GET /admin/updates；POST /admin/updates/check |
| updates:apply | POST /admin/updates/apply，需确认已备份 |
| monitor:read | GET /admin/monitor（运行监控快照）、GET/PUT /admin/monitor/alert-rules（告警规则）、GET /admin/monitor/events（运行事件）、GET /admin/monitor/storage-probe；monitor:read 整体属 super_admin 保留集，不可分配角色；单机形态对应本机 `GET /monitor`、`GET /monitor/events`（access local，不走角色） |
| mcp:read / mcp:write / mcp:logs:read | （三者均为 super_admin 保留集，不可分配角色）GET/PATCH /admin/mcp/config（mcp:read/write）、GET /admin/mcp/tools、/admin/mcp/tools/{name} 与 PATCH /admin/mcp/tools/{name}/policy（mcp:read/write）、GET /admin/mcp/calls、/admin/mcp/calls/{id}（mcp:logs:read） |
| mcp:clients:read / mcp:clients:write | （两者均为 super_admin 保留集，不可分配角色）GET /admin/mcp/oauth-clients、GET /admin/mcp/oauth-clients/{id}/grants（mcp:clients:read）；POST /admin/mcp/oauth-clients、PATCH /admin/mcp/oauth-clients/{id}、POST /admin/mcp/oauth-clients/{id}/secret、DELETE /admin/mcp/oauth/grants/{id}（mcp:clients:write，全局撤销）；客户端密钥仅哈希持久化，创建与轮换响应一次性返回 |
| mcp:access | MCP 协议端点 `/mcp` 的准入权限点：PAT 与 OAuth `ucm_` 令牌访问 MCP 时必须携带，配合 operation 显式授权与数据范围（可分配，非保留集；见 [ADR-0047](../adr/ADR-0047-mcp-server.md)） |
| 本人 MCP（会话，无权限点） | GET /account/mcp/access-info；GET/POST /account/mcp/oauth/authorize（同意描述与签发 code，POST 要求 CSRF）；GET /account/mcp/oauth/grants、DELETE /account/mcp/oauth/grants/{id}（本人撤销，CSRF）；`/mcp` 协议端点不走业务契约（PAT 与 OAuth ucm_ 令牌同链鉴权） |

super_admin 保留集（`internal/platform/roles.go` 的 `SuperOnlyPermission`，不可分配给任何角色）：`roles:write`、`administrators:read/create/update`、`settings:write`、`updates:apply`、`storage:write`、`monitor:read`、`tokens:read/write`、`mcp:read`、`mcp:write`、`mcp:logs:read`、`mcp:clients:read/write`。上表标注"仅 super_admin"的行即源于该策略；`PermissionDefinition.super_admin` 亦由服务端保留策略派生，前端不维护另一份名单（见下文角色编辑一节）。

用户与管理工作台共用账号与 unicore_session Cookie（HttpOnly/SameSite=Lax，HTTPS 时 Secure）。路径选择工作台接口，不选择账号仓库；身份请求头不参与认证。事务从统一账号表重查操作者，角色分配与保留操作重查超管资格。本人改密校验旧密码，锁内复核后撤销该账号的共享会话与挑战，两端同时失效。企业绑定共用账号；两种 OIDC callback 保留各自浏览器证明 Cookie，管理员入口不提供 JIT。详见 [ADR-0037](../adr/ADR-0037-unified-user-identity.md)。

普通用户按授权调用 Core、本人账号与业务资源；客户端可调整本地外观，不能读取全局设置。所有 profile 均不注册 appearance.theme，PATCH 拒绝；外观只写当前客户端。单机/桌面按现有 Catalog 创建 platform 命名空间表，但不装配平台身份治理或认证接口；表存在不授予能力，CLI 没有设置或 DB 强依赖。

统一成功响应为 `{code:"OK",message:"",data,request_id}`，失败使用稳定 code、脱敏 message 与可选字段错误。错误目录由契约生成；包括安装凭据/状态、数据库连接/非空确认、认证权限/CSRF、验证码限流、最后管理员、账号冲突和输入错误。未知接口 JSON 404，不使用 SPA fallback。bootstrap/session 返回会话派生 csrf_token，SDK 自动附加；令牌只哈希持久化。

公开账号接口包括 /auth/policy、/auth/captcha、/auth/login、/auth/email/register、/auth/email/{verify,reset,login}/request 和 /complete，所有路径位于 /api/v1。注册仅普通域；开放注册与邮箱验证独立控制，图形验证码、限流与后端注册限制仍适用。关闭验证时无需 SMTP，创建 active 普通用户并返回 registration_complete=true，不创建邮件挑战；开启验证及其他邮件流程需 SMTP 就绪。申请返回 challenge_id、expires_in、retry_after，未知/禁用账号同形成功。完成提交 challenge_id、六位 code 及用途需要的 password；10 分钟有效、60 秒重发、最多 5 次错误，分用途原子一次性消费。登录设置统一账号 Cookie。密码重置撤销该账号共享会话与挑战，创建会话再次检查密码版本。

旧 /auth/register、/auth/verification/{request,complete}、/auth/password/{request,reset} 仅兼容长链接，已 deprecated；无 GET 消费。链接回到对应域入口。模板管理为独立管理员页面与专用 API，固定预览示例码，不含真实验证码或 SMTP 密钥；内容受变量及 HTML 白名单约束，保存持久化到 mail.template.*，通用设置 PATCH 禁止写入。SMTP 敏感值始终为空并附 configured，空 PATCH 保留，clear:true 显式清除；任务列表/审计不包含密钥、正文或验证码。

操作日志支持类型/关键词/日期筛选、稳定排序、分页与最多 10,000 条 CSV 导出；旧记录缺失元数据不补造，IP 仅实际连接地址。邮件任务仍为最近 30 条；未提供外部日志采集平台。详见 [管理工具](../03-runbooks/admin-tools.md)。系统更新已实现签名检查、离线日志和手动安装。平台普通用户不能读取更新 API 或版本元信息，管理员写操作仍验证 CSRF/Origin；单机 /updates 对应操作同时要求 Host 和实际连接来自 loopback，桌面使用原生桥接。CLI 不装配，Docker 拒绝应用内安装。恢复与更新边界见 [更新手册](../03-runbooks/updates.md)。

对象存储：storage:read / storage:write 为管理权限，所有 /admin/storage/* 与 /admin/files/* 独立鉴权。/files 与 /admin/files 共用 user 资源归属，后者还校验对应存储权限；未登录返回 401，非本人文件返回 404；本地 content 只接受短期签名，不接受文件名或磁盘路径。完整接口见 OpenAPI，流式上传声明 streamingUpload，签名下载声明 signedDownload。

当前双入口、单机边界和升级兼容说明见 [ADR-0016](../adr/ADR-0016-separate-client-admin-surfaces.md)。

平台维护开启时，用户域认证与业务 API 在进入处理器前返回 503 MAINTENANCE_MODE；bootstrap/健康检查与管理员固定域保留，管理员资源仍独立鉴权。公开 bootstrap 仅新增维护状态/提示和可发布页脚字段，不包含管理员通知邮箱。

本人个人中心使用 /account/profile、/account/totp/*、/account/email/*、/account/sessions*；管理员对应 /admin/account/*，仅对应域本人会话，不授予全局管理能力。所有写操作校验 CSRF/Origin。受限 MFA 会话只能访问 bootstrap 与固定 /auth/mfa、/auth/mfa/cancel（管理员 /admin/auth/*），需绑定 Cookie 的 CSRF；不能读取本人资料或业务。强制设置但未绑定验证器时仅允许 account/*、session/logout，其余受保护业务拒绝。代码规则与错误见 [ADR-0031](../adr/ADR-0031-personal-center-security.md)，不扩大 admin 前缀豁免范围。

账户安全页面复用 settings:read/write；用户与管理员列表的 totp_enabled 是只读安全状态，不能通过 UserCreate/UserUpdate 修改。服务器在所有固定域会话读取时校验空闲与管理员绝对时限，强制 2FA 按域生效，不能靠页面隐藏绕过。

公告 /announcements/* 仅用户域本人会话；单条和全量已读写入要求 CSRF，不能提交其他 user_id。/admin/announcements/{id}/read-status 要求 announcements:read 和管理员域；用户投影排除接收人、内部备注及管理员字段。

`GET /events` SSE 与 `GET /inbox` 仅平台用户域会话；`POST /inbox/{id}/read`、`POST /inbox/read-all` 还要求 CSRF。收件人来自可信会话，客户端不能指定其他 recipient_id；站内信按原公告当前开关、时间、状态与受众过滤，已读状态与公告阅读记录独立。SSE 建立连接、推送与心跳前复核会话及强制两步验证，推送只提示重新查询，不绕过后续资源鉴权。当前没有站内信发送管理 API。

XLSX：`GET /admin/users/export.xlsx` 要求 users:read；`GET /admin/users/import-template.xlsx` 与 `POST /admin/users/import.xlsx` 要求 users:create；`GET /admin/files/export.xlsx` 要求 storage:read。全部固定管理员域，导入要求 CSRF/Origin并复用用户创建和角色规则；没有管理员账号导入或普通用户导出全站文件的权限。下载为二进制工作簿，不套 JSON 成功信封；导入反馈和错误仍为标准 JSON。

业务上传通过专属 FileClient 接入：`/notes/files*` 复用 notes:access/create/update 与独立 operation/action 授权，未关联列表和上传限本人；跨用户下载须提交可读笔记的 note_id 并验证实际引用。`/account/avatar/files*` 属于本人账号会话，不依赖 files:*，只接受有界图片并隔离 avatar 归属域。通用 files:* API 与存储治理仍独立授权，业务账号不因此获得管理能力。

头像通过本人 `PATCH /account/profile` 或 `/admin/account/profile` 保存 avatar_file_id，服务端验证独立 avatar 文件域和本人归属，并投影短期 avatar_url；不接受外部 URL 作为持久引用。文件访问继续受原有元数据、状态、时效及签名规则控制。

无本地密码的已绑定账号可 POST `/account/oidc/totp`（管理员 `/admin/account/oidc/totp`）发起企业重新认证，需本人会话、CSRF/Origin，不授予管理权限。固定 OIDC callback 验证原浏览器与会话及原绑定身份，成功只准备 TOTP 设置；GET `/account/totp/setup`（管理员同前缀）以 no-store 返回当前会话尚未启用、未过期的待设置密钥，不返回已启用密钥。取消、过期、错误耗尽或成功启用后不能读取。此流程不绕过已有 TOTP，也不替代本地密码账号的密码确认；其他本人 TOTP 接口与业务门禁保持一致。

## 独立授权与数据范围

`GET /api/v1/admin/notes/management` 要求 `notes:manage:read` 和 `listNoteManagement` operation 授权，按该权限的数据范围过滤。支持按标题、作者昵称、用户名和状态筛选，保留精确的 `owner_id` 筛选；任何筛选都不能扩大范围。列表返回标题、作者显示信息、状态、更新时间、版本、记录标识及逐行操作许可，不返回正文、附件或账号邮箱。

`GET /api/v1/admin/notes/management/{owner}/{id}` 预览正文，要求 `notes:manage:read`、`notes:manage:preview` 和 `previewManagedNote` operation。响应不包含附件且禁用浏览器缓存。`PUT` 编辑标题、正文，另要求 `notes:manage:edit` 和 `editManagedNote` operation，保持归属、状态和附件不变。预览与编辑均取相关权限数据范围的交集；编辑事务内重新校验，使用版本防止覆盖他人修改。不为既有自定义角色自动增加内容访问。

`PATCH` 和 `DELETE /api/v1/admin/notes/management/{owner}/{id}` 分别修改状态与软删除，要求 `notes:manage:read`、对应的 `notes:manage:update` 或 `notes:manage:delete` 以及 `updateNoteManagementStatus` 或 `deleteManagedNote` operation。写入时重新校验授权，目标作者必须同时落在读、写权限的数据范围内；记录版本不一致返回 409。成功操作记录实际操作者。

`GET /api/v1/notes?view=mine` 是个人页面使用的本人过滤；未传 `view` 的既有客户端继续沿用 `notes:access` 数据范围。已有 `/admin/notes` 契约不因新增管理页而改变或自动授权。

完整规则见 [ADR-0038](../adr/ADR-0038-rbac-enforcement.md)。菜单 ID 全局唯一且无工作台前缀，surfaces 描述适用工作台（ADR-0039）；OpenAPI x-unicore.uiPage 注册默认动作。菜单只决定页面入口（含 URL 直达），按钮同时要求权限点、action_ids 与 operation_ids；禁止直接调用 API 需要撤销对应 operation grant。

PUT 角色必须携带读取到的正整数 version；缺失/非法拒绝输入，过期返回 409，成功在事务中 CAS 并递增。创建不要求 version，Role.version 从 1 起。省略 menu_ids/action_ids/operation_ids/data_scope/department_ids 表示保留，权限收紧时仅裁剪失效引用。增加权限点不会自动重授已撤销 API 或动作。创建时省略授权数组派生初始授权，显式空数组保持空。所有改变角色可编辑聚合的旁路入口（菜单补丁、兼容整树分配、导航裁剪/初始化、部门范围清理等）同样维护角色版本；仅成员数变化不使角色编辑过期。冲突须显式重读和复核，不自动替换 version 重试。见 [ADR-0046](../adr/ADR-0046-credential-delegation-role-concurrency.md)。

管理端密码重置使用 users:credentials:write 的目标范围，不以 users:update 替代；邮箱实际变化同时满足 users:update 的目标/目的部门范围及 users:credentials:write 的目标范围。邮箱先 trim、小写化，规范化后未变不触发新增凭据鉴权。事务中用完整目标账号判定 HasManagementAccess（super_admin 或拥有非 Assignable 管理权限点），这类目标仅超管可改凭据；不得用 PAT 单角色投影缩窄目标。管理端凭据写禁止 PAT，包含本人和超管绑定令牌；未变邮箱的普通资料更新不因此一概禁止 PAT。新权限不自动回填旧角色，需显式授予权限点、适用 operation/action 与范围。本人 account 安全流程仍独立校验原凭据/邮箱证明。

数据范围按当前权限点解析：users:read 约束用户列表与导出，users:create/update 在事务内约束目标及目的部门；files:access 约束通用文件 API，storage:read 约束管理文件列表/导出，notes:access 约束示例及其附件。同权限多角色范围取并集；其他权限角色的 all 不参与。部门/岗位目录、公告、字典、任务及实例设置属于全局对象，不套用用户行范围。

部门拥有的业务资源使用 `ScopeFilter.DepartmentIDs/ContainsDepartment`；`DepartmentScope` 跳过用户展开，`DataScope` 同时保留部门与用户集合。空部门保留，未分配部门不隐式授权，创建者调岗/删除不替代资源转移。写事务在安装锁内调用 `AuthorizeDepartmentMutation`，转移用 `AuthorizeDepartmentTransfer` 校验源、目标及读写范围交集；PAT 保持单角色。业务产物可经 `files.ControlledStore` 在签发与每次消费时重新校验当前资源及每个文件，云端也通过应用流式读取；不改变个人文件拥有者捷径。见 [ADR-0052](../adr/ADR-0052-department-resources-controlled-downloads.md)。

## 角色编辑与菜单反向分配

`PUT /admin/menus` 在安装锁事务内对照当前持久化树校验整树替换。停用模块导致目录项缺失时，只允许同 ID 节点保留原类型、路由、surface、权限点、operation 集合及动作父页面绑定；布局字段可编辑，角色授权不因目录缺失自动删除或扩大。新增或修改的失效绑定返回 400；已注册页面的 surface、可委派 operation 与权限点匹配、树结构及导航 version 校验仍执行。显式删除节点继续裁剪孤儿授权，并递增实际变化的角色版本。

以 [ADR-0040](../adr/ADR-0040-explicit-role-grants.md) 为准：页面选择只补浏览接口，且 GET 接口的权限不得超出当前角色与页面路由点（导入模板等 GET 不隐含新增写权限）。角色 realm 不用于过滤可委派 API。高级区由 `GET /admin/api-operations` 提供完整可委派集合，包含无 uiPage 的业务 API；独立目录页面已退役。all 模式选择 API 补齐所需点；any 模式保留显式分支，不派生全部兄弟点。`PermissionDefinition.super_admin` 来自服务端保留策略，前端不再维护另一份名单。

`PUT /admin/menus/{id}/roles` 输入 `{version, expected_role_ids, role_ids}`。role_ids 与 expected_role_ids 不包括 super_admin（弹窗固定勾选且不可修改；默认访问仍受 surface、区域/节点隐藏禁用及祖先约束，并非始终可达）。服务端在安装锁事务内复核超管、roles:write、menus:write，检查导航版本及当前菜单角色集合，冲突返回 409。新增页面合并祖先菜单、路由点与已满足上界的 GET 操作，目录/链接只改当前节点；取消只移除当前菜单，不删除独立 API/动作。内置 user 不能借此取得管理权限。其他角色属性及授权按事务中的最新值保留，实际改变的角色同时递增 Role.version，只撤销发生变动角色成员的会话。菜单行标签只代表显式分配，不代表最终可达；加载中、加载失败和未分配分别呈现，不能把错误当空集提交。内置 user 的 self 范围只读，复制为自定义角色后才可调整。旧整树 `role_assignments` 仍保留兼容，只替换所列角色菜单/动作并保留点/API，新界面不再使用它；它同样仅撤销所列角色成员会话。

会话不从 operation_ids 推导 action_ids，已初始化空数组始终为空。启动可回填当前注册动作节点供编辑器选择，但不向已初始化角色授予按钮；未初始化旧角色的一次性物化保留。已有显式 operation/action 所需的 all 权限点兼容派生继续保留，菜单与 any 操作从不产生兄弟权限点。

个人访问令牌按 [ADR-0044](../adr/ADR-0044-role-bound-personal-tokens.md) 绑定一个已分配角色，每次请求及管理写事务均只使用该角色的权限、operation 与数据范围。本人管理走浏览器 account/tokens、token-roles；全局 `/admin/access-tokens*` 只允许 super_admin，读取要求 tokens:read，签发/续期/作废要求 tokens:write，写请求还要求 CSRF。PAT 不能调用这些凭证管理入口，超级管理员角色令牌也不能调用 superAdmin 保留接口。

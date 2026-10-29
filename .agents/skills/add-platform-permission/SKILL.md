---
name: add-platform-permission
description: 实现 Unicore web-platform 固定管理员/普通用户的菜单、页面与 API 权限，并验证越权边界。
metadata:
  author: yunnuo <ymz@ebox.vip>
---

# add-platform-permission

先读 [当前角色需求](../../../docs/00-product/feature-roles.md)、[权限清单](../../../docs/api/permissions.md) 和 [ADR-0012](../../../docs/adr/ADR-0012-fixed-platform-roles.md)。当前仅管理员 super_admin / 普通用户 user，身份分域，详见 [ADR-0014](../../../docs/adr/ADR-0014-separate-identities-management.md)；旧同表升降与 M2d 自定义角色方案已废弃。

- 管理权限登记 internal/platform/roles.go，OpenAPI 的管理 operation 声明权限与 superAdmin；所有管理业务 API（含只读）独立校验有效 session、真实固定管理员和权限，写请求校验 CSRF/Origin。新增权限不能默认委派；历史 role_permissions 不参与授权。
- 菜单与直达页使用 routes.ts 的统一管理员判定，页面隐藏不能代替 API 校验。账号创建/启停在安装锁事务内重查操作者，保护最后启用管理员和最后有本地密码的管理员。
- 注册/OIDC JIT 固定普通用户，企业 claim 不升管理员；状态变化撤销会话及待用挑战。不要增加自定义角色写接口或恢复 RoleInput/roles:write。
- 全局设置、品牌管理、SMTP/模板/投递、OIDC 配置仅管理员；公共品牌和登录策略只给页面必需投影。本地外观不使用管理 API，不读写全局主题。
- 平台模块只装配 web-platform；写入审计不含敏感值。若需要持久数据变化，新增分方言迁移与恢复说明，不修改历史 checksum。

验证逐个管理 API 的匿名 401、普通用户 403、缺 CSRF 拒绝、管理员正向成功；模拟普通用户残留 grant，验证服务端仍拒绝。页面验收包括隐藏菜单、hash/后台直达、两客户端外观隔离、两域凭据不互通、改密/禁用会话失效及最后管理员保护；非平台无身份路由。更新当前需求/契约/验收，运行 make docs、make test、相关 profile 构建与页面测试。

管理员与普通用户分别使用 administrators/users 及配套 session/token/email_challenges/external_identities/oidc_flows 表；不得经用户角色修改升降身份。新管理员使用独立 CRUD 和弹窗。API 使用固定路径：用户 /api/v1/auth、account、files，管理员 /api/v1/admin/auth、account、files；身份请求头不再生效，独立 Cookie，无凭据回退；注册/JIT 仅普通域，管理员禁止 JIT。新增身份查询需从正确仓库读取；写事务从管理员仓库重查 actor。测试同名/同邮箱两域共存、错误域密码/码/session 拒绝及修改密码不撤销另一域。

当前形态与入口以 [ADR-0016](../../../docs/adr/ADR-0016-separate-client-admin-surfaces.md) 为准：用户 main.tsx 与管理员 admin.tsx 独立入口，管理页只在 admin-app.tsx 装配，共享 Workspace/表单/消息/主题。单机/桌面仅业务和本地外观，不提供站点、品牌、SMTP、对象存储和后台。管理员公开 auth/bootstrap 只返回固定域最小投影；本人 account 需管理员会话，其余管理资源须 permissions/superAdmin，不能宽泛豁免 admin 路由。新增普通用户立即 active 并验证用户入口登录；注册默认关闭，安全页 Switch 控制且须 SMTP 测试。布尔控件用 Switch，上传用自定义拖拽弹窗与 SDK 真实阶段。

公告 announcements:read/write 均为管理员权限，用户仅固定 /api/v1/announcements* 读取已发布到期公告。所有管理变更参考 announcementsql.transaction，在安装锁事务内调用 AuthorizeAdministrator 重查；测试草稿/定时/禁用/删除无泄漏及批量版本冲突全量回滚。

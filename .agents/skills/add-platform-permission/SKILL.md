---
name: add-platform-permission
description: 登记 web-platform 权限点并实现菜单、页面与 API 权限（统一账号、多角色 + superAdmin 保留集 + 菜单/动作/operation 细粒度授权），验证越权边界。
metadata:
  author: yunnuo <ymz@ebox.vip>
---

# add-platform-permission

当前规则以 docs/adr/ADR-0037-unified-user-identity.md、docs/00-product/feature-roles.md 和 docs/api/permissions.md 为准；产品形态边界（非平台形态不装配治理面）以 docs/00-product/product-forms.md 为准。所有账号使用 unicore_users/unicore_user_roles 及统一会话与安全表。用户和管理 surface 只描述工作台，不是独立身份。不得新建管理员账号表或通过路径改变个人资源归属。

权限点登记 internal/platform/roles.go；契约声明权限、superAdmin 与 CSRF，修改后生成。角色可以组合业务与管理权限，菜单/动作/API grant 独立，菜单不授权 API。账号编辑 role_ids 为完整非空集合，变更需超管；普通编辑者不能提升角色或修改超管。事务内重查当前操作者，保护最后启用及最后本地密码超管。注册/JIT 固定 user，企业声明不授权。角色、密码或状态变化撤销共享会话。

新权限测试匿名 401、无授权 403、缺 CSRF 拒绝、授权正向成功；覆盖多角色并集、撤销、非法/重复/空角色集合、账号编辑提权与超管保护。资源归属固定 user，同一账号跨工作台使用相同资源。两端共享会话失效通知，不能复用旧缓存。安全策略按实际管理权限选择严格规则。非平台形态不装配身份体系。

新安装 schema 修改只在用户明确授权的未发布重构中改基线；默认仍遵守 db-migration 的不可改历史约束。运行 make docs、make test 与受影响 profile 构建，数据库和目标平台未实测必须如实说明。

按 ADR-0039/0040：共享树节点 ID 全局唯一且无工作台前缀，surfaces 声明工作台；可委派按钮 API 在 x-unicore.uiPage 登记，按钮使用 canAction，页面守卫检查菜单及祖先。更新角色省略授权/范围字段保留原值。数据范围必须传入资源权限点，仅相关角色参与并集；列表、详情、导出和写入显式接入，写入在事务内重查目标与目的部门。全局目录/实例操作不冒充部门范围。

角色 realm 不过滤 API；页面默认只补权限上界内的浏览接口，不能因 GET 导入模板而增加写权限。高级 API 选择器必须覆盖无 uiPage 的可委派接口；all 自动补必要点，any 需显式分支。保留点使用服务端 PermissionDefinition.super_admin。显式空 action_ids 不得会话派生恢复；启动回填节点不代表授予角色。菜单行反向分配走原子节点补丁（version + expected_role_ids），保留无关角色属性/授权并仅撤销变动角色成员的会话。见 ADR-0040 与权限契约。

按 docs/adr/ADR-0046-credential-delegation-role-concurrency.md：users:credentials:write 独立委派普通业务目标，旧角色不自动授予；密码按新权限范围，实际改邮箱同时按users:update与新权限范围，trim/小写化后未变不触发新增凭据校验。完整目标HasManagementAccess仅超管可改密码/登录邮箱，所有管理端凭据写禁止PAT（含本人/超管绑定）；不能用角色名或令牌裁剪目标替代完整目标判断。测试普通目标委派、管理目标保护、两个范围交集、规范化未变邮箱和PAT拒绝；本人account安全流程不被委派替代。

角色更新强制正整数version，缺失/非法拒绝、过期409，创建无需version。菜单节点补丁仍用导航version+expected_role_ids，但实际改变角色也bump角色版本；导航裁剪/启动物化、整树兼容分配和部门范围清理等聚合入口同样维护，成员数变化不使编辑过期。冲突须显式重读复核，不自动替换版本重试。菜单标签仅显式分配，不代表可达；超管固定勾选禁用且不绕过surface/隐藏禁用祖先，未分配/加载/错误分别呈现。内置user固定self只读，复制自定义后可调。Standalone共享platform迁移表不代表治理装配，禁止按旧隔离措辞擅改catalog。

PAT 按 ADR-0044 绑定单角色。管理事务重读 actor 必须使用 principalUser 保留请求的角色约束，不能用完整账号资源 user 投影重新合并其他角色；目标账号（包含本人）仍读取完整资源，以保护角色分配与超级管理员目标边界。新数据范围入口同时验证 Bearer 单角色和浏览器多角色语义。

部门拥有的资源使用 DepartmentScope/ContainsDepartment，保留空部门；安装锁事务内用 AuthorizeDepartmentMutation，转移用 AuthorizeDepartmentTransfer 同时校验持久化源和目的部门及浏览/写权限交集。创建者变动不代表资产转移；见 ADR-0052。

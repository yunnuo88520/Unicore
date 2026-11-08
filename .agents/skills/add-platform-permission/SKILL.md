---
name: add-platform-permission
description: 登记 web-platform 权限点并实现菜单、页面与 API 权限（统一账号、多角色 + superAdmin 保留集 + 菜单/动作/operation 细粒度授权），验证越权边界。
metadata:
  author: yunnuo <ymz@ebox.vip>
---

# add-platform-permission

当前规则以 docs/adr/ADR-0037-unified-user-identity.md、docs/00-product/feature-roles.md 和 docs/api/permissions.md 为准。所有账号使用 unicore_users/unicore_user_roles 及统一会话与安全表。用户和管理 surface 只描述工作台，不是独立身份。不得新建管理员账号表或通过路径改变个人资源归属。

权限点登记 internal/platform/roles.go；契约声明权限、superAdmin 与 CSRF，修改后生成。角色可以组合业务与管理权限，菜单/动作/API grant 独立，菜单不授权 API。账号编辑 role_ids 为完整非空集合，变更需超管；普通编辑者不能提升角色或修改超管。事务内重查当前操作者，保护最后启用及最后本地密码超管。注册/JIT 固定 user，企业声明不授权。角色、密码或状态变化撤销共享会话。

新权限测试匿名 401、无授权 403、缺 CSRF 拒绝、授权正向成功；覆盖多角色并集、撤销、非法/重复/空角色集合、账号编辑提权与超管保护。资源归属固定 user，同一账号跨工作台使用相同资源。两端共享会话失效通知，不能复用旧缓存。安全策略按实际管理权限选择严格规则。非平台形态不装配身份体系。

新安装 schema 修改只在用户明确授权的未发布重构中改基线；默认仍遵守 db-migration 的不可改历史约束。运行 make docs、make test 与受影响 profile 构建，数据库和目标平台未实测必须如实说明。

按 ADR-0038：导航节点 ID 全局唯一并带工作台前缀；可委派按钮 API 在 x-unicore.uiPage 登记，按钮使用 canAction，页面守卫检查菜单及祖先。更新角色省略授权/范围字段保留原值。数据范围必须传入资源权限点，仅相关角色参与并集；列表、详情、导出和写入显式接入，写入在事务内重查目标与目的部门。全局目录/实例操作不冒充部门范围。

<!-- Author: yunnuo <ymz@ebox.vip> -->
# ADR-0050：首发显式授权基线

## 决策

首发（0.2.0 起）取消运行时权限派生，统一以显式保存、经过校验的授权为唯一依据。本决策修订 [ADR-0039](ADR-0039-unified-grant-namespace.md) 附录与 [ADR-0040](ADR-0040-explicit-role-grants.md) 中的兼容派生条款，并裁决 [D25](../00-product/pending-decisions.md)：

1. **会话投影只读存储点**。`platformsql` 账号投影删除 `deriveGrantedPermissions`：会话权限点 = 角色 `unicore_role_permissions` 存储点（super_admin 仍投影全量目录）。API 权限检查与 `DataScope` 行范围使用同一存储依据，"会话里有、存储里没有"的长期分叉不再存在。
2. **保存期校验保证 grants ⊆ points**。角色创建/更新经 `saveRoleAuthorization` 校验：action 授权要求其当前绑定 `Permission` 在提交的 `permissions` 内且其 operations 全部显式授予；operation 授权要求 `ValidOperationGrant`（真实、可委派、不超出权限点上界）。省略的授权数组即显式空集合，创建不再自动扩写。
3. **内置 user 角色的默认可达在安装期一次性写入**。Seed 写入全部可委派权限点及其解锁的 operation 授权行；首次导航播种写入用户工作台默认菜单与已覆盖的动作行。之后启动不再加宽任何角色：新权限点保持未分配直至操作员授予（`EnsurePermissions` 仅维护目录与 super_admin 集合）。
4. **菜单分配只配置可见性**。`AssignMenuRoles` 仅写 `menu_ids`（含祖先）；目标角色未持有页面权限点时以 `MENU_ROLE_PERMISSION_MISSING`（400）拒绝，权限点与 API/按钮授权只经角色编辑器（roles:write）变更。已授权动作的绑定重绑定仍按授权变更处理（roles:write 守卫，见 ADR-0049 与 #82 守卫回归测试）。
5. **授权与治理分类分离**。`PermissionDefinition.governance` 单独标注系统治理点（含 `admin:access`、roles/settings/monitor 等）；`Assignable` 只表达"是否默认授予新成员"。`HasManagementAccess` 改按 governance 判定：业务权限（含业务管理类）不再隐式赋予框架管理员身份或更严格的会话策略。
6. **兼容自愈退役**。旧 `unicore_menus` 行转换、双树折叠、个人中心/演示页退役、遗留角色物化（`materializeRoleAuthorizations`）与 legacy 角色自愈测试随首发基线移除；基线 DDL 不再包含 `unicore_menus` 与 `unicore_role_authorizations`。处理程序层 `require()` 的权限拒绝并入 `recordDenial` 审计。

## 后果

- 重绑定已授权动作不会改变已保存角色的有效权限：重新保存角色才重新校验并落盘，运行期不可能因菜单或绑定变化悄悄加权。
- 操作员心智模型更简单：界面勾选即存储内容，API 授权、按钮与页面入口的因果清晰；角色编辑器提交前以同一并集预填，正常流程不会触发 400。
- 旧测试实例数据不受支持（ADR-0042）：需要保留时用旧 revision 程序在隔离环境恢复。

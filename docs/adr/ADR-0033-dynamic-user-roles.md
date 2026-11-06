<!-- Author: yunnuo <ymz@ebox.vip> -->
# ADR-0033：用户域动态角色、数据驱动菜单与数据字典

日期：2026-11-07。状态：已实施（dev）。取代 ADR-0012/ADR-0029 时代「固定管理员/普通用户双角色、禁止自定义角色写接口」的运营层限制；双域物理隔离与 fail-closed 契约权限保持不变。

## 背景

下游业务系统需要不同的多角色。原模型权限判定纯硬编码（`Has() = IsSuper && SuperOnly`，全部权限点 super-only），四张 RBAC 表零运行时读取，菜单由代码静态派生，无数据字典。

## 决策

1. **用户域动态角色，管理员域保持固定**。GVA/若依/SmartAdmin 是单域全动态；Unicore 的双域物理隔离（独立 cookie/账号表/session）是安全特色。`super_admin` 保持管理员域唯一角色（最后管理员保护不变）；用户域角色可由管理员 CRUD，角色-权限点存 `unicore_role_permissions`。用户域账号永远不能持有 `super_admin`，管理员域账号永远只能持有 `super_admin`（repository 域护栏）。
2. **权限点目录加 assignable 护栏**。`PermissionCatalog` 每项 `Assignable` 标记：18 个管理权限点（administrators:*/roles:write/menus:write/dictionaries:*/updates:apply/settings:write/storage:write 等）保持仅 super_admin；业务权限点（本轮 `files:access`/`notes:access`）可授予自建角色。角色编辑只允许勾选 assignable 项，repository 写入时二次防御；`SuperOnly(p) = 非 assignable`，未知权限点默认拒绝（fail-closed）。后续业务系统按 add-platform-permission skill 登记新的 assignable 权限点即可接入。
3. **权限判定改为表驱动**。用户域 `user.Permissions` 由 `user_roles JOIN role_permissions` 组装；管理员域恒为目录全量。`EnsurePermissions` 在每次启动恢复时幂等补种目录（升级新增权限点自动到位）。角色权限变更吊销该角色全部用户 session（与 UpdateUser 吊销语义一致）。
4. **菜单数据驱动**。`unicore_menus` 存每页面操作者配置（显示名/分组/排序/可见性），随 bootstrap 下发；前端以 routes.ts（页面事实源）× 菜单配置合成用户端导航，缺失行回落路由默认，升级无需补种。页面集合仍是编译期事实（组件不可运营创建）。管理端（/admin）导航保持代码定义。
5. **数据字典独立表**。`unicore_dict_types`/`unicore_dict_items`（platform@2），管理端 CRUD，用户端按 code 读取 active 条目；settings（单行字符串配置，无 options 元数据）不承载字典。
6. **迁移演进**。platform@2 是 catalog 世界第一个追加版本（core/notes/platform 各自 version 递增的起点），已按规范完成 test-upgrade 演练；冻结自首个 stable release。

## 后果

- 自建角色可组合业务权限（页面可见性 + 按钮 + API 三处同一权限点）；`canAccess` 按 permissions 过滤菜单的机制（前端既有）自动生效。
- 内置 `user` 角色种子绑定全部 assignable 权限点，存量行为不变。
- 旧「residual grant ignored」测试语义废止：role_permissions 表数据参与授权。
- 备份工具世代校验由 MAX(version) 改为 core@1 锚点（追加版本不再影响世代判定）。
- 数据权限（部门/行级范围）仍不在本轮范围。

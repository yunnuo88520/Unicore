<!-- Author: yunnuo <ymz@ebox.vip> -->
# ADR-0034：管理员域受限角色

日期：2026-11-07。状态：已实施（dev）。在 ADR-0033 的基础上放开「管理员域固定 super_admin」的运营层限制；双域物理隔离、fail-closed 契约权限与最后管理员保护保持不变。

## 背景

ADR-0033 恢复了用户域动态角色，但管理员域仍硬编码 `super_admin`：会话权限恒为目录全量（platformsql `user()`），事务授权 `actor()` 强制 `IsSuper`，管理员账号只能以 `super_admin` 创建。结果是无法建立「只能管用户/公告/日志，不能碰角色与系统设置」的运营账号，与 GVA/SmartAdmin/若依等后台的常规能力存在差距。

## 决策

1. **角色表 realm 化，不新建平行表**。`unicore_roles` 增加 `realm`（`user` / `administrator`）；`super_admin` 内置行迁移为 administrator 域，`user` 保持 user 域。自建角色创建时声明 realm；user 域角色仍只能勾选 assignable 权限点，administrator 域角色可勾选目录中除 superAdmin 专属项外的全部权限点，未知权限点依旧拒绝。
2. **管理员账号经 `unicore_administrator_roles` 持有单角色**（保持现有单角色契约语义）。会话权限改为数据驱动：含 `super_admin` 即全量目录，否则为所配 administrator 域角色权限的并集；跨 realm 角色分配被拒绝。
3. **superAdmin 专属操作保持硬天花板（保留集）**：`roles:write`、`administrators:*`、`settings:write`、`updates:apply`、`storage:write` 仍由契约 `superAdmin` 标记强制仅 super_admin，事务层不再重复该判断（`actor()` 改为 active + 权限点校验）；保留集之外的管理操作（用户、公告、日志、任务、菜单、字典、更新查看等）降级为可授权权限点，使受限管理员可以运营菜单展示与业务字典。即使向自建角色授予保留集权限点，会话层仍硬拦截，授予不生效。
4. **最后管理员保护收紧语义**：禁用或改角色导致 active `super_admin` 数量为零时拒绝（`LAST_SUPER_ADMIN`）；受限管理员账号不计入保护，也不具备自我提升的路径（administrators 管理是 superAdmin 专属）。
5. **会话吊销对齐**：管理员角色定义或账号角色变更吊销受影响 administrator 会话，与用户域语义一致。
6. **前端以域 + 权限点判定**：管理端导航对全部 administrator 域会话开放，页面与按钮按会话权限逐点过滤；`roles:write` 等专属操作在界面上禁用并提示仅超级管理员。`isAdministrator`（super_admin 语义）仅保留给确需超管判定的入口。

## 后果

- 运营类管理员账号成为一等能力：可组合用户、公告、日志、任务、菜单、字典等权限；角色、管理员、系统设置、更新与存储配置仍由 super_admin 独占。
- 权限目录的可授权面扩大到 administrator 域；新增业务权限点仍按 add-platform-permission skill 登记。
- 数据权限（部门/行级范围）与独立按钮级授权不在本轮范围，已由 [ADR-0035](ADR-0035-action-permissions-departments.md) 实现，并由 [ADR-0036](ADR-0036-navigation-regions-granular-authorization.md) 扩展为菜单/动作/operation 三类授权与真实区域导航；双域账号表、Cookie 与固定 API 路径不变。
- 存量实例升级后：已有管理员账号行为不变（等效 super_admin 全量）；迁移为 platform@4（仅 roles 两表，core/module.notes 无变更不递增）。PostgreSQL/MySQL 的 0004 执行路径以隔离 fixture 验收为准；MySQL DDL 隐式提交的中断恢复边界见迁移头注与 [迁移规范](../02-standards/database-migrations.md)。
- 已知边界已清零：强制 2FA 的域开关与文件服务 `Admin` 标志自 [ADR-0035](ADR-0035-action-permissions-departments.md) 起按管理员域判定，不再依赖 super_admin 语义；审计目标前缀沿用账号域前缀，不视为缺陷。

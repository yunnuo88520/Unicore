<!-- Author: yunnuo <ymz@ebox.vip> -->
# ADR-0035：按钮级权限、多级菜单外链与部门数据范围

日期：2026-11-07。状态：已实施（dev）；其中「六固定分组根 + 页面/链接树」的菜单模型与列表级数据范围后被 [ADR-0036](ADR-0036-navigation-regions-granular-authorization.md) 修订为真实区域导航、菜单/动作/operation 三类授权与含读取/下载的范围过滤。在 [ADR-0033](ADR-0033-dynamic-user-roles.md)/[ADR-0034](ADR-0034-administrator-restricted-roles.md) 的双域角色模型上，补齐两者明确留待后续的三项能力：独立按钮级授权、任意层级菜单树与外链、部门组织树与角色数据范围。双域物理隔离、fail-closed 契约权限、superAdmin 保留集与最后管理员保护不变。

## 背景

1. ADR-0033 后页面内操作按钮随页面权限一起开放：持有 `notes:access` 即可增删改本人笔记，无法建立「只读记录员」类角色。
2. 菜单只有「固定根分组 + 页面」一层结构，页面只能落在六个根之一，不能表达目录树，也不能加入外部链接。
3. 数据范围（部门/行级）缺失：自建角色只能全有或全无，无组织结构维度。

## 决策

1. **按钮级权限 = 动作权限点，不加新机制层**。目录新增 assignable 动作点 `notes:create/update/delete`、`files:upload/delete`；契约把用户域写 API 改绑到对应动作点（POST /notes、PUT/DELETE /notes/{id}、POST /files/uploads 及 multipart 全流程、DELETE /files/{id}），读取与下载仍由 `notes:access`/`files:access` 门槛。页面可见性仍由 access 点控制，按钮按动作点逐点渲染/隐藏；内置 user 角色的初始授权在安装与显式兼容迁移时建立，常规 `EnsurePermissions` 同步不复活已撤销授权（初始「自动补种全部 assignable 点」的语义已被 [ADR-0036](ADR-0036-navigation-regions-granular-authorization.md) 修正）。动作授权与页面菜单授权在 ADR-0036 中进一步拆分为独立授予面。
2. **菜单树 = 配置行自引用，不建目录实体**。`unicore_menus` 增加 `parent_key`/`type`/`url`（platform@5）：树 = 已注册页面 ∪ 链接行，`parent_key` 指向页面 key 或链接行 key，任意嵌套、深度 ≤5、保存时整树校验（环、父存在、链接约束），非法保存整体拒绝。链接行必须 `link:` 前缀 key 与 http(s) 或站内 `/` 相对 URL，页面行禁止 url；删除链接行 = 保存时不提交。顶层节点在本轮仍按六个固定根（group_key）放置，页面集合仍是编译期事实；该固定根约束已被 [ADR-0036](ADR-0036-navigation-regions-granular-authorization.md) 的真实区域模型取代。前端 `buildNavigation` 派生递归树（悬空/环回落顶层），侧栏与移动抽屉递归渲染，外链 http(s) 新标签打开、相对路径应用内跳转；编辑器用行操作（上移/下移/调整位置/加子页面/加外链）代替跨树拖拽，保存仍一次全量 PUT。两个旧呈现缺陷一并修复：个人域 site/edition 配置进分组强制回落顶层，非 files 页落 files 根回落 primary。
3. **部门与数据范围 = 组织树 + 角色范围枚举**。platform@6 新增 `unicore_departments`（自引用树、同父重名唯一）、`unicore_users.department_id`、`unicore_roles.data_scope`（`all`/`dept_and_below`/`dept`/`custom`/`self`，默认 `self`）与 `unicore_role_departments`（custom 勾选集）。范围解析为平台层端口：多角色取并集、`all` 吞并一切（仍限于用户域数据）；未知范围值 fail-closed 按仅本人，范围解析或数据库错误直接拒绝请求，成员集合分批解析（单批上限 500）保证完整，不静默截断或降级。范围只作用于用户域 notes/files 的列表过滤（经 userID 集合传入模块，不做跨库 join），单条读写/删除仍按属主校验；读取/下载纳入范围、行级 capabilities 与写入规则由 [ADR-0036](ADR-0036-navigation-regions-granular-authorization.md) 统一。管理员域会话与本地/桌面行为不变。administrator 域角色固定 `self`（写非 self 拒绝），内置 user 角色禁止放宽（403）。部门 CRUD 走新权限点 `departments:read/write`（assignable，双域可授），删除被子部门或用户挂靠返回 409 `DEPARTMENT_IN_USE`；用户创建/更新携带 `department_id`（省略保留、空串清除）。

## 后果

- 用户域可组合「只读」「可写不可删」「部门内可见」等颗粒角色；assignable 业务点（notes/files access 与动作、departments 读写，及后续 posts 等）由 add-platform-permission skill 继续扩展。
- 菜单可表达目录树与外部链接；「六固定根 + 行操作编辑器」的呈现与编辑模型已被 [ADR-0036](ADR-0036-navigation-regions-granular-authorization.md) 的真实区域编辑器取代。
- 数据范围为下游业务模块提供范式：接入方按 `NoteVisibility`/`ScopeFilter` 形态接受可选范围过滤；部门/范围不改变双域账号模型，管理员域不参与数据范围。
- 迁移为 platform@5（菜单列）与 platform@6（部门/范围）两次独立追加版本，均按迁移规范完成三方言隔离演练；`Force2FA` 域语义与文件服务 Admin 标志两项 ADR-0034 已知边界在本轮统一（按管理员域判定），审计目标前缀沿用账号域前缀不再视为缺陷。

<!-- Author: yunnuo <ymz@ebox.vip> -->
# ADR-0039：统一授权命名空间与单棵导航树

日期：2026-11-09。状态：已批准。本决策修订 [ADR-0036](ADR-0036-navigation-regions-granular-authorization.md) 与 [ADR-0038](ADR-0038-rbac-enforcement.md) 的「双工作台两棵导航树 + 工作台前缀节点 id」模型；[ADR-0037](ADR-0037-unified-user-identity.md) 的统一账号与两个 Web 入口决策保持不变。

## 背景

ADR-0036/0038 把导航按工作台拆成两棵树：节点 id 携带 `user:`/`administrator:` 前缀，动作节点按身份域复制两份（`{realm}:op:{operationId}`），同一页面在授权模型里是两个独立节点。后果是管理体验与模型复杂度同时受损：个人中心等双端同页需要授权两次；同一个按钮在角色编辑器里出现两份；角色编辑器把一个授权决策拆成「菜单与按钮 / API 授权 / 权限点」三个互不可见的面板，授予"一个页面 + 它的按钮 + 它的 API"需要三次跳转约九到十次点击，且权限点作为 fail-closed 上界藏在第三个面板里，漏勾即静默失效。菜单/按钮/API 三类授权独立、权限点上界、运行时策略 fail-closed 这些内核语义经 ADR-0036/0038 验证是自洽的，问题出在命名空间与交互层，不在鉴权内核。

## 决策

1. **一棵共享导航树**。持久化与默认种子都是单棵树：`NavigationSection` 与 `NavigationNode` 携带 `surfaces` 数组声明该区域/节点在哪些工作台渲染（`user`、`administrator` 至少一个）；节点 id 全局唯一，不再携带工作台前缀。默认区域为 `business`（两端）、`personal`（两端）、`system`（管理端）；个人中心页面只有一个节点，两个工作台渲染同一授权事实。`NavigationFor(surface)` 按 surfaces 声明投影当前工作台，授权与祖先链校验逻辑不变。
2. **单一动作命名空间**。动作节点 id 统一为 `op:{operationId}`（保留 `:altN` 兜底），动作是其页面节点的子节点并继承页面 surfaces：一个按钮授权一次，在页面出现的每个工作台生效。`canAction` 的三重校验（权限点 + operation grant + action_ids + 祖先可见）语义不变。
3. **一次性升级**。存量实例在启动时按存储 payload 形态检测旧格式（section 缺少 surfaces 数组）并转换一次：节点/区域 id 去前缀，双端同 id 节点合并为一个（surfaces 取并集，个人中心页面归入 personal 区域），`unicore_role_menus`/`unicore_role_actions` 授权行重写为无前缀 id 并去重；授权身份变化故撤销全部会话要求重新登录。转换记录 `menus.updated` 审计，不修改任何历史迁移 checksum。
4. **角色编辑器以页面为中心**。授权界面是一棵树：勾选页面即授权可见（自动带上祖先目录），行内展开该页按钮与 API 操作，勾选页面时默认随动、可逐项取消；页面隐含的权限点自动推导展示，高级区保留完整权限点目录（供纯 API 角色直接授权）与数据范围。保存 payload 契约不变（`menu_ids/action_ids/operation_ids/permissions/data_scope/department_ids`），联动是编辑器层计算；省略=保留、空数组=清空、权限点上界、菜单不授 API 等内核规则全部保持。
5. **菜单编辑器单树化**。区域与节点编辑在同一棵树上进行，区域与节点各自声明 surfaces（成员端/管理端/两端，至少一个）；菜单编辑器仍是纯布局工具，角色可见性只在角色编辑器配置，`role_assignments`/`reset` 的超管边界不变。
6. **realm 仅为分类元数据**。角色 `realm` 不再限制可授权节点集合：授权校验只要求节点存在于共享树，角色可组合任意工作台的页面、按钮与 API（对齐 ADR-0037「realm 是工作台分类」的语义）。数据范围仍只作用于用户域资源。

## 后果

- 双端同页（个人中心等）授权一次生效；按钮与 API 操作在授权模型里只出现一次，角色编辑器授予一个完整页面从三次跳转约十次点击收敛为单树内一至三次点击。
- 存量授权在升级时语义等价合并（同 id 去重），不放宽任何角色：旧 `user:X` 与 `administrator:X` 都持有的权限合并后仍持有，仅单端持有的在共享节点上继续单端渲染。
- 前端 `buildNavigation`/`canAccess`/`canAction` 按 surfaces 过滤；菜单编辑器与侧栏、图标栏、移动抽屉继续消费同一模型。
- 单机、桌面和 CLI 不装配平台角色授权；共享树的默认种子在非平台形态下沿用既有裁剪（无个人区、无管理目录，site/edition 留在业务区）。

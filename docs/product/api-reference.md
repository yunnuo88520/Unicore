<!-- Author: yunnuo <ymz@ebox.vip> -->
# 独立 API 开发者文档 / Developer API reference

Web Platform（`web-platform`）和 Standalone Web（`web-standalone`）默认关闭在线接口文档。通过配置 `api_docs: true`、环境变量 `APP_API_DOCS=true` 或命令参数 `--api-docs=true` 启用后，访问实例根地址下的：

- `/api-docs`：独立只读文档页；`/docs/api` 兼容跳转到此地址。
- `/openapi.json`：原始 OpenAPI 契约。

两者均公开可读，无需登录，不受管理员权限保护。它们只公开接口描述，不包含实例配置、用户数据或凭据，也不使业务 API 免鉴权。文档展示完整契约，包含其他运行形态的接口；每个操作仍受形态装配、登录、角色权限、操作授权、PAT 范围和 CSRF 等实际策略限制。默认不开启在线试调用，不保存认证信息，不使用外部文档校验服务。

关闭开关时，以上三个地址返回 404。桌面 Wails 与独立 CLI 不提供这些 HTTP 地址；开发桌面应用时可使用 Web 载体或生成的离线参考 `packages/contracts/reference.gen.html`。不要以 HTTP 服务模拟桌面载体。

文档不是工作台页面：用户工作台、管理工作台和菜单管理均无内置文档菜单，不能通过角色分配。旧的 `/admin/api-docs`（或自定义管理路径下的对应地址）不再是文档入口，使用根 `/api-docs`；原有 Swagger 深链接仍可附加到独立地址。

升级后，安装初始化完成的启动协调阶段只移除旧 JSON 菜单中绑定框架 `api-docs` 页面的节点，以及这些已移除节点自身的菜单授权。其他菜单、角色权限、动作/API 授权及业务数据保留；不重置整棵导航树，不改写冻结 SQL 或 Catalog 账本。同名自定义链接不删除。自定义子菜单移到原父级位置，并继承被移除祖先的隐藏或停用状态，避免升级后意外显示。若自定义操作节点失去合法页面父级，保留其 ID 与授权绑定，放到隐藏的“工作台概览”节点下；该承载节点不新增角色授权、不显示在侧栏，菜单树仍可正常编辑保存。导航版本递增，旧编辑快照必须刷新；重复启动无重复修改。常规停服备份和恢复流程见 [框架升级](framework-upgrade.md)。

菜单管理中的“允许显示”只表达保存的显示配置。当前账号侧栏仍取决于功能是否启用、运行形态、工作台范围、区域/菜单/父级隐藏或停用、角色菜单授权和页面权限；多项条件同时失败会同时提示。提示使用已保存配置和当前账号的真实侧栏结果，未保存草稿不改变侧栏，也不扩大服务端授权；版本不一致时先刷新再确认。

## English

Online API documentation is **disabled by default** on both `web-platform` and `web-standalone`. Enable it with `api_docs: true`, `APP_API_DOCS=true`, or `--api-docs=true`. Open `/api-docs` at the instance root for the independent read-only reference, or `/openapi.json` for the raw contract. `/docs/api` redirects to `/api-docs`. All three addresses return 404 when disabled.

The reference and contract are **public without sign-in**, including on Platform; they are not protected by administrator permissions. They expose interface descriptions, not instance settings, user data or credentials. Publishing them does not disable business API authentication. The document shows the complete contract across profiles: an operation may be unavailable in the current profile or forbidden to the current account. Profile assembly, sessions, permissions, operation grants, PAT scopes and CSRF remain authoritative. Online execution, credential persistence and external validation are disabled.

Wails desktop and the independent CLI do not serve these HTTP endpoints. Developers can use the Web carrier or the generated offline `packages/contracts/reference.gen.html`. Documentation is never a configurable or role-assignable workspace page. Use root `/api-docs` instead of the former administrator workspace deep link; Swagger anchors work on the independent address.

On upgrade, transactional startup navigation reconciliation removes only page nodes bound to the retired framework `api-docs` route and their own obsolete menu grants. It preserves custom links, other menus, permissions, action/API grants and business data without resetting the tree or changing frozen SQL/Catalog history. Custom children are reparented while retaining hidden/disabled ancestor intent. Custom actions retain their IDs and authorization bindings; if needed, a hidden Overview page provides a valid parent without new role grants or sidebar entries, so the tree remains editable. Navigation and affected role versions advance; repeated startup is idempotent. Follow the normal backup/restore procedure before upgrading.

“Allow display” is a saved configuration setting. Sidebar visibility also depends on enabled features, profile, workspace, section/menu/ancestor state, role menu grants and page permissions. The editor lists simultaneous failed conditions against the actual current-account sidebar. Unsaved drafts do not change visibility or authorization; refresh mismatched versions before drawing conclusions.

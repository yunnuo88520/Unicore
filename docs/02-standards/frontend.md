<!-- Author: yunnuo <ymz@ebox.vip> -->
# 页面、会话、状态与表单

Web 与 Wails 共享 packages/web-ui。shell 只创建 AppClient transport；页面不能直接 fetch 或调用 window.go。新增路径在 routes.ts 注册标题、说明、profile 与权限，在 App.tsx 的 PageContent 渲染表登记；编译器要求覆盖全部 Page。使用 hash 导航兼容 Wails；Web 的安装/后台入口仍由服务端处理。未知 hash 显示明确的未找到页面，不能静默落到首页。

SessionBoundary 为每一代会话拥有独立 QueryClient 和组件状态；登录、退出、401、换账号或跨标签页失效会卸载旧状态并取消/清空旧查询。HttpTransport 使用 epoch 拒绝跨会话返回的旧请求，不允许旧账号结果进入新账号缓存。只有已认证请求的 401/AUTH_REQUIRED 触发失效；INVALID_CREDENTIALS 表示登录或本地密码确认失败，保留当前会话和表单错误。标签页只广播随机失效标记，不把用户信息、CSRF 或令牌存入 localStorage；恢复可见时 bootstrap 复核会话。服务端仍是身份和权限的最终来源。

useSession 从 bootstrap 推导 loading/error/unavailable/authenticated/anonymous；渲染守卫使用 routes.ts 的 canAccess，拒绝不适用 profile 或不足权限。所有管理菜单与直达页同时要求 isAdministrator；仅两种固定角色，不能只检查任意权限字符串。普通用户设置页只挂载本地外观，禁止启动全局 settings/branding 管理查询；平台外观保存使用 localStorage，不调用服务器，单机/桌面保留本地默认主题。后端 RBAC/CSRF 不依赖前端隐藏。TanStack Query 管理服务端数据；useState 管理表单/展开等局部状态，主题偏好由统一主题模块持久化。当前无跨组件复杂本地业务状态，不强制引入额外 store。

查询 key 应标识资源与筛选条件。mutation 成功后使用 queries.ts 的 invalidateAfter 刷新受影响资源（例如用户身份变更同时失效 roles、role-options、users、dashboard），不要刷新全部页面或将服务端结果复制成第二个全局 store。会话变化由 SessionBoundary 处理，不在每页重复实现退出清理。

所有提交使用 forms.tsx 的 Form：HTML 原生约束先检查，已提供 schema/value 时运行契约验证；pending 阻止重复提交。SDK 发送前执行相同约束，服务端再次验证。使用 Field 的 name 与契约字段一致，自动生成 label/id、aria-invalid、aria-describedby；服务端 AppError.fields 与本地字段错误进入同一摘要并按控件顺序聚焦。复杂设置和分步流程保留局部编辑状态，业务错误仍由服务端决定。不得记录表单值或凭据。

使用语义 CSS 与 tokens，详见 [设计系统](design-system.md)。每个页面检查 loading/empty/error/success、权限拒绝、键盘、PC/375px 和 light/dark/system。UI 验收须使用真实 Go 服务；桌面复用的改动还需实际 Wails 原生运行。新增流程使用项目内 [add-react-page](../../.agents/skills/add-react-page/SKILL.md)。

<!-- Author: yunnuo <ymz@ebox.vip> -->
# 页面、会话、状态与表单

Web 与 Wails 共享 packages/web-ui。shell 只创建 AppClient transport；页面不能直接 fetch 或调用 window.go。新增路径在 routes.ts 注册标题、说明、profile 与权限，在 App.tsx 的 PageContent 渲染表登记；编译器要求覆盖全部 Page。使用 hash 导航兼容 Wails；Web 的安装/后台入口仍由服务端处理。未知 hash 显示明确的未找到页面，不能静默落到首页。

SessionBoundary 为每一代会话拥有独立 QueryClient 和组件状态；登录、退出、401、换账号或跨标签页失效会卸载旧状态并取消/清空旧查询。HttpTransport 使用 epoch 拒绝跨会话返回的旧请求，不允许旧账号结果进入新账号缓存。只有已认证请求的 401/AUTH_REQUIRED 触发失效；INVALID_CREDENTIALS 表示登录或本地密码确认失败，保留当前会话和表单错误。标签页只广播随机失效标记，不把用户信息、CSRF 或令牌存入 localStorage；恢复可见时 bootstrap 复核会话。服务端仍是身份和权限的最终来源。

useSession 从 bootstrap 推导 loading/error/unavailable/authenticated/anonymous；渲染守卫使用 routes.ts 的 canAccess，拒绝不适用 profile 或不足权限。所有管理菜单与直达页同时要求 isAdministrator；仅两种固定角色，不能只检查任意权限字符串。普通用户设置页只挂载本地外观，禁止启动全局 settings/branding 管理查询；平台外观保存使用 localStorage，不调用服务器，单机/桌面保留本地默认主题。后端 RBAC/CSRF 不依赖前端隐藏。TanStack Query 管理服务端数据；useState 管理表单/展开等局部状态，主题偏好由统一主题模块持久化。当前无跨组件复杂本地业务状态，不强制引入额外 store。

查询 key 应标识资源与筛选条件。mutation 成功后使用 queries.ts 的 invalidateAfter 刷新受影响资源（例如账号状态变更同时失效 roles、role-options、users、administrators），不要刷新全部页面或将服务端结果复制成第二个全局 store。会话变化由 SessionBoundary 处理，不在每页重复实现退出清理。

所有提交使用 forms.tsx 的 Form：HTML 原生约束先检查，已提供 schema/value 时运行契约验证；pending 阻止重复提交。SDK 发送前执行相同约束，服务端再次验证。使用 Field 的 name 与契约字段一致，自动生成 label/id、aria-invalid、aria-describedby；服务端 AppError.fields 与本地字段错误进入同一摘要并按控件顺序聚焦。复杂设置和分步流程保留局部编辑状态，业务错误仍由服务端决定。不得记录表单值或凭据。

使用语义 CSS 与 tokens，详见 [设计系统](design-system.md)。每个页面检查 loading/empty/error/success、权限拒绝、键盘、PC/375px 和 light/dark/system。UI 验收须使用真实 Go 服务；桌面复用的改动还需实际 Wails 原生运行。新增流程使用项目内 [add-react-page](../../.agents/skills/add-react-page/SKILL.md)。

新增实体表单使用 modal.tsx 的原生 dialog，不在列表内展开；使用 Form/Field 的契约校验，验证取消、Escape、焦点返回及 pending 防重。登录/安装和设置编辑保留适合各自流程的页面。导航与邮件/日志页面分工见 ADR-0014；避免重新加入平台仪表盘、模板设置或嵌套标签。头像操作调用统一 SDK；管理员/普通用户必须保留独立入口和身份域。

二级导航在分组内部缩进，使用 Lucide 语义图标；图标与 UI 不使用 Emoji/表情字符（check:design 检查）。仅 web-platform 已登录账号显示头像与账号菜单；web-standalone/desktop 无用户概念，不渲染头像。

短暂反馈统一使用 `message.tsx` / `useMessage()`，由 Workspace 外层 MessageProvider 装配；支持 primary/success/warning/info/error，默认顶部居中、3 秒移除。需要跨模块使用时从 `@unicore/web-ui/message` 导入；`message.success('设置已保存')` 或 `message.open({type:'warning',content:'请先保存',duration:5000})`，同类型简写替换前一条，open 可指定 id 替换/重置计时，destroy 手动关闭。QueryScope 的 MutationCache 统一处理提交失败（忽略 SESSION_CHANGED）；成功由业务 mutation 提供具体文案，不能在保存按钮旁追加占位。原生 dialog 打开时消息挂入其顶层，关闭后移回 body，避免被遮挡且不重置计时。字段校验/聚焦、需要重试的加载错误、安装确认和认证完成页保留上下文状态，不将其替换成会消失的唯一说明。

Web 用户与管理员分别从 main.tsx/admin.tsx 装配；全局管理页仅从 admin-app.tsx 引入，共享 Workspace 接受管理页渲染器。用户/单机页面不得导入全局配置页。所有 boolean 设置使用共享 Switch，上传使用自定义可键盘选择/拖拽弹窗与真实阶段。登录注册左右布局，375px 单列。详见 [ADR-0016](../adr/ADR-0016-separate-client-admin-surfaces.md)。

语言与本地外观统一使用 `preferences.ts` / `i18n.ts`，不得各页另存 localStorage。组件用 `useI18n()` 或 `useLocale()` 订阅，再对界面文案调用 `t()`；新增词条同步英文资源，业务数据保留原文，插值用命名参数。语言切换不能重建表单或清掉草稿。ClientControls / AppearanceDrawer 供所有图形入口复用，主题抽屉本地即时应用，不提交全局设置。扩展与英文长标签、键盘/持久化验收见 [客户端偏好](../03-runbooks/client-preferences.md)。

新增页面先读 [前端基础封装](../03-runbooks/frontend-foundations.md)。WorkspaceLayout 唯一拥有固定导航与内容占位，使用逻辑方向和统一 767px 抽屉断点；业务页不得重设 main-shell 偏移。工作区和主题面板固定 LTR，已移除阅读方向选项。`pnpm check:i18n` 会递归检查共享 UI 和两套 shell 的中文直写、静态词条、设置/权限元数据、契约错误、英文资源及插值；Web/GUI 构建与 make test 必须通过，不以文档约定替代构建检查。

<!-- Author: yunnuo <ymz@ebox.vip> -->
# 页面、会话、状态与表单

Web 与 Wails 共享 packages/web-ui。shell 只创建 AppClient transport；页面不能直接 fetch 或调用 window.go。路由采用 TanStack Router 代码式路由树（router.tsx 的 createWorkspaceRouter）：routes.ts 仍是标题、说明、profile 与权限的登记源，新增路径在 createWorkspaceRouter 挂载对应 page 模块。Web 用户端与管理员端使用 history 导航（服务端已有 SPA fallback），Wails 桌面端使用 hash history；管理员入口按 admin_path 动态 basepath。未注册路径由根路由的 NotFoundPage 明确展示，不能静默落到首页。重大选型见 [ADR-0027](../adr/ADR-0027-frontend-stack-rebuild.md)。

SessionBoundary 为每一代会话拥有独立 QueryClient 和组件状态；登录、退出、401、换账号或跨标签页失效会卸载旧状态并取消/清空旧查询。HttpTransport 使用 epoch 拒绝跨会话返回的旧请求，不允许旧账号结果进入新账号缓存。只有已认证请求的 401/AUTH_REQUIRED 触发失效；INVALID_CREDENTIALS 表示登录或本地密码确认失败，保留当前会话和表单错误。标签页只广播随机失效标记，不把用户信息、CSRF 或令牌存入 localStorage；恢复可见时 bootstrap 复核会话。服务端仍是身份和权限的最终来源。

useSession 从 bootstrap 推导 loading/error/unavailable/authenticated/anonymous；壳层门禁与渲染守卫使用 routes.ts 的 canAccess，拒绝不适用 profile 或不足权限。所有管理菜单与直达页同时要求 isAdministrator；仅两种固定角色，不能只检查任意权限字符串。普通用户设置页只挂载本地外观，禁止启动全局 settings/branding 管理查询；平台外观保存使用 localStorage，不调用服务器，单机/桌面保留本地默认主题。后端 RBAC/CSRF 不依赖前端隐藏。TanStack Query 管理服务端数据；React Hook Form 管理表单状态，主题偏好由统一主题模块持久化。当前无跨组件复杂本地业务状态，不强制引入额外 store。

查询 key 应标识资源与筛选条件。mutation 成功后使用 queries.ts 的 invalidateAfter 刷新受影响资源（例如账号状态变更同时失效 roles、role-options、users、administrators），不要刷新全部页面或将服务端结果复制成第二个全局 store。会话变化由 SessionBoundary 处理，不在每页重复实现退出清理。

所有提交使用 lib/form.tsx 的 useAppForm + AppForm：resolver 由契约约束生成的 Zod schema（packages/contracts/src/zod-schema.ts 的 constraintsToZod）驱动，pending 阻止重复提交。SDK 发送前执行相同约束（validate() 保留为最终防线），服务端再次验证。AppField 的 name 与契约字段一致，自动生成 label/id、aria-invalid、aria-describedby；服务端 AppError.fields 经 applyServerError 与本地字段错误合并进同一摘要并聚焦首个出错控件。非原生控件（Select/Switch/Checkbox）使用 AppControllerField。不得记录表单值或凭据。

样式使用 Tailwind v4 工具类 + 语义令牌色（详见 [设计系统](design-system.md)）：theme.css 通过 `@theme inline` 把 tokens.gen.css 的 CSS 变量映射为 Tailwind 令牌，暗色、强调色、密度、圆角缩放继续由生成链与 data 属性驱动；组件样式不写死十六进制色（check:design 检查）。运行时属性驱动的壳层几何集中在 shell.css。每个页面检查 loading/empty/error/success、权限拒绝、键盘、PC/375px 和 light/dark/system。UI 验收须使用真实 Go 服务；桌面复用的改动还需实际 Wails 原生运行。新增流程使用项目内 [add-react-page](../../.agents/skills/add-react-page/SKILL.md)。

新增实体表单使用 ui/dialog.tsx 的 Modal（Radix Dialog），不在列表内展开；使用契约校验，验证取消、Escape、焦点返回及 pending 防重。危险操作使用 ConfirmDialog 二次确认。登录/安装和设置编辑保留适合各自流程的页面。导航与邮件/日志页面分工见 ADR-0014；避免重新加入平台仪表盘或嵌套标签；邮件模板独立管理页按 ADR-0020 实现。头像操作调用统一 SDK；管理员/普通用户必须保留独立入口和身份域。

二级导航在分组内部缩进，使用 Lucide 语义图标；图标与 UI 不使用 Emoji/表情字符（check:design 检查）。仅 web-platform 已登录账号显示头像与账号菜单；web-standalone/desktop 无用户概念，不渲染头像。

短暂反馈统一使用 `ui/message.tsx` / `useMessage()`，由 Workspace 外层 MessageProvider 装配；支持 primary/success/warning/info/error，默认顶部居中、3 秒移除，固定视口层级（z-[70]）保持在 Radix 弹层之上。需要跨模块使用时从 `@unicore/web-ui/ui` 导入；`message.success('设置已保存')` 或 `message.open({type:'warning',content:'请先保存',duration:5000})`，同类型简写替换前一条，open 可指定 id 替换/重置计时，destroy 手动关闭。QueryScope 的 MutationCache 统一处理提交失败（忽略 SESSION_CHANGED）；成功由业务 mutation 提供具体文案，不能在保存按钮旁追加占位。字段校验/聚焦、需要重试的加载错误、安装确认和认证完成页保留上下文状态，不将其替换成会消失的唯一说明。

Web 用户与管理员分别从 main.tsx/admin.tsx 装配；全局管理页仅从 admin-app.tsx 注入（administratorPage 渲染器，默认实现指向 pages/admin/*），共享 Workspace 接受管理页渲染器。用户/单机页面不得导入全局配置页。所有 boolean 设置使用共享 Switch，上传使用自定义可键盘选择/拖拽弹窗与真实阶段。登录注册 md 起双栏布局，375px 单列。详见 [ADR-0016](../adr/ADR-0016-separate-client-surfaces.md)。

语言与本地外观统一使用 `preferences.ts` / `i18n.ts`，不得各页另存 localStorage。组件用 `useI18n()` 或 `useLocale()` 订阅，再对界面文案调用 `t()`；新增词条同步英文资源，业务数据保留原文，插值用命名参数。语言切换不能重建表单或清掉草稿。ClientControls / AppearanceDrawer 供所有图形入口复用，主题抽屉本地即时应用，不提交全局设置。扩展与英文长标签、键盘/持久化验收见 [客户端偏好](../03-runbooks/client-preferences.md)。

新增页面先读 [前端基础封装](../03-runbooks/frontend-foundations.md)。WorkspaceLayout 唯一拥有固定导航与内容占位，使用逻辑方向和统一 767px 抽屉断点；业务页不得重设 main-shell 偏移。工作区和主题面板固定 LTR，已移除阅读方向选项。`pnpm check:i18n` 会递归检查共享 UI 和两套 shell 的中文直写、静态词条、设置/权限元数据、契约错误、英文资源及插值；Web/GUI 构建与 make test 必须通过，不以文档约定替代构建检查。

公告管理和用户卡片复用 ui 原语、DashboardWidgetRegistry 与安全 RichContent；公告/邮件主题正文是原始业务数据，不经过 t()。默认邮件模板固定中文，UI 的双语约束不能用于翻译用户内容。富文本编辑使用 ui/editor.tsx 的 RichTextEditor（Tiptap，标签白名单与 {{site_url}} 链接校验），服务端仍对入站 HTML 做白名单再校验；渲染侧统一走 rich-content.tsx 的 safeContentHTML。Recharts 图表能力封装在 ui/charts.tsx，接入新统计前不得展示无真实数据支撑的图形。

私有文件上传复用 FileUploadDialog 与 AppClient.files.uploadFile 的持久分片流程：字节进度以确认分片为准，signal 为暂停，deleteFile 为放弃；恢复需重新选择原文件并核对指纹，不在 localStorage 存签名 URL、File 或身份。仅平台装配，见 [存储手册](../03-runbooks/storage.md)。

# 前端技术栈重新封装（一次性全量重写，新分支交付）

## Context

开源框架 Unicore 的前端目前是自研轻量栈（自研 hash 路由、自研组件、手写 CSS、自研富文本），ADR-0002 曾明确排除 Tailwind/shadcn。现在按你的决策用现代栈整体重新封装 UI 层，**以 web-platform（在线多用户，功能最全）作为验证目标**。

已确认的决策：
- **History 路由**（Go 服务端已有 SPA fallback，`internal/adapter/http/router.go:291`；桌面端用 hash history 规避 Wails 风险）
- **契约约束→Zod 适配层**（运行时把 `constraints.gen.ts` 转成 Zod schema，SDK 层 `validate()` 保留为最终防线）
- **Recharts 仅引入能力**（依赖 + 主题化组件层，不落页面、不加统计 API）
- **一次性全量重写**，不做新旧并存
- **在新分支上完成**（从 `dev` 切出 `feat/web-ui-stack-rebuild`，英文提交信息）

不变项（重写必须保持）：契约链（openapi.json → contracts/sdk/`validate()`）、SessionBoundary 会话代际模型、`tokens.json → tokens.gen.css` 白牌设计令牌链、自研 i18n 微内核与 `check:i18n` 门禁、WorkspaceLayout 唯一结构壳、双 transport（HTTP/Wails）装配边界、界面中英双语、禁假统计。

## 现状关键事实

- 共享 UI 全在 `packages/web-ui/src`（扁平目录，约 38 个生产 tsx + 7 个 ts + 12 个 css），`apps/web`（main.tsx 用户端 + admin.tsx 管理端双入口）与 `apps/desktop`（Wails）只是装配壳
- 路由：`routes.ts` 16 个页面 key（defineMessages 中文元数据 + permission/authenticated）+ `pageFromHash()` + `App.tsx` switch-case
- 表单：`forms.tsx` 的 `<Form schema value error pending>`（28 处使用），校验来自契约 `validate()`，服务端 `AppError.fields` 合并，首错聚焦
- 表格：5 个文件手写 `<table>`（logs ×2、web-flows、announcements、roles、files）；图表：无；富文本：`rich-text-editor.tsx`（contentEditable + 白名单消毒，用于邮件模板；`rich-content.tsx` 渲染公告 HTML）
- 已在用：React 19.2、Vite 7、TanStack Query v5、lucide-react
- 服务端构造 hash 地址仅两处：`internal/adapter/http/oidc.go:182-184`（OIDC 回跳 `/#oidc=` / `/#account?oidc=`）和 `internal/platform/accounts.go:65`（邮件链接 `/#verify-email?token=` / `/#reset-password?token=`）

## 实施步骤

### 1. 分支与 ADR
- 从 `dev` 创建 `feat/web-ui-stack-rebuild`
- 新增 `docs/adr/ADR-0027-frontend-stack-rebuild.md`：声明取代 ADR-0002 中对 Tailwind/shadcn 的排除；记录全部选型与理由（TanStack Router/Table、Tailwind v4、Radix shadcn 风格、RHF+Zod、Tiptap、Recharts 能力层）、history 路由、constraintsToZod 单源校验决策

### 2. 依赖安装（root devDeps + packages/web-ui deps）
- root devDeps：`tailwindcss@^4`、`@tailwindcss/vite`
- web-ui deps：`@tanstack/react-router`、`@tanstack/react-table`、`react-hook-form`、`@hookform/resolvers`、`zod`、`class-variance-authority`、`clsx`、`tailwind-merge`、Radix 按需原语（dialog、alert-dialog、dropdown-menu、tabs、switch、tooltip、select、label、popover、checkbox、avatar、separator、progress、toast）、`@tiptap/react`、`@tiptap/pm`、`@tiptap/starter-kit`、`@tiptap/extension-link`、`recharts`
- 两个 vite.config（apps/web、apps/desktop）挂 `tailwindcss()` 插件

### 3. Tailwind v4 + 令牌桥接
- 新增 `packages/web-ui/src/theme.css`：`@import "tailwindcss"`；`@theme inline` 把现有 CSS 变量映射为 Tailwind 令牌（`--color-*` 引用 `tokens.gen.css` 变量）；`@custom-variant dark` 绑定 `[data-theme=dark]`
- `tokens.gen.css`、`preferences.css`、`scripts/generate-theme.mjs` 生成链**原样保留**（白牌/暗色/5 强调色/density 继续生效）；其余组件级 CSS 后续全部删除
- 新增 `src/lib/cn.ts`（clsx + tailwind-merge）

### 4. shadcn 风格 UI 原语层 `packages/web-ui/src/ui/`
- 组件清单：button、input、textarea、label、select、checkbox、switch、dialog、alert-dialog、dropdown-menu、tabs、tooltip、badge、card、separator、skeleton、table、avatar、progress、form（RHF 包装）、charts（Recharts 主题化能力层）
- message toast 用 Radix toast 重实现但**保留 `useMessage` API**（调用面稳定）；cva 变体全部取色于令牌变量；可见文案经 `t()` 双语、无 Emoji
- Recharts 图表颜色用 `var(--ui-*)` 直填 SVG，天然随主题/强调色切换；仅导出能力，不接页面

### 5. constraintsToZod 适配层 + RHF 表单层
- `src/lib/contract-schema.ts`：`constraintsToZod(schemaName)` 惰性缓存生成 Zod schema，覆盖 validate.ts 支持的子集：object（required / additionalProperties:false → strict）、string（minLength/maxLength 按 **Unicode 码点**自校验，与现有实现一致，规避 zod 的 UTF-16 计数差异；`x-max-utf8-bytes` refine；pattern；format email/uri/date-time）、integer（safe integer + min/max）、boolean、array（minItems/maxItems/uniqueItems/items）、enum、`$ref` 递归（z.lazy + 深度 32 上限）
- 错误消息与 validate.ts 中文文案逐条对齐（渲染时照旧 `t()`），保证前后端提示一致
- RHF 表单层：`zodResolver(constraintsToZod(...))`；服务端 `AppError.fields` → `setError`（键路径与契约字段对齐）；保留 pending 防重与首错聚焦

### 6. TanStack Router（代码式路由树，`src/router/`）
- 采用**代码式**（非文件式）：路由树放 web-ui 共享，两个入口 × 两种 history 复用同一棵树
- 用户树：`/`（overview）、`/lab`、`/notes`、`/files`、`/account`、`/site`、`/install`、`/verify-email`、`/reset-password`、`/?oidc=<result>`、404 notFoundComponent；`/settings` 作为 legacy 重定向到 `/site`
- 管理树：同结构，`basepath = admin_path`（bootstrap 元数据先于 createRouter 获取，dev/prod 一致）；桌面入口用 `createHashHistory`，web 两入口用 `createBrowserHistory`
- 搜索参数用 zod 校验（token、oidc、provider、tab），替代现在散落的 `location.hash.split('?')` 解析
- 守卫：router context 携带 client；根 loader `ensureQueryData(['bootstrap'])` 后用现有 `canAccess()/isAdministrator()` 做重定向；SessionBoundary/QueryScope 原样保留在 RouterProvider 之上
- 侧栏导航继续由 `routes.ts` 元数据 + `canAccess` 派生（元数据文件保留）
- **Go 侧两处 URL 构造同步改**（不改 API 行为）：`oidc.go:182-184` 改为 `/?oidc=` 与 `/account?oidc=`（admin 前缀逻辑随之调整）；`accounts.go:65` 邮件链接改为 `BaseURL + entry + path + "?token="`；对应 Go 测试断言更新
- `apps/web/vite.config.ts` administratorEntry 插件增加 admin_path 前缀深链改写到 admin.html，保证 dev 下 basepath 行为与生产一致

### 7. 页面全量重建（`src/pages/`，一次性替换）
映射（旧 → 新，均在 packages/web-ui/src 内重构）：
- `App.tsx` → router 装配 + `pages/overview`（含 RuntimeCards、widget registry、EnterpriseLogin 区块）
- `install-page.tsx` → `pages/install`（向导，RHF 化）
- `account-flows.tsx` + `legacy-account-flows.tsx` + `oidc-page.tsx` → `pages/auth/*`（登录/注册/找回/验证/重置/OIDC 结果，路由化 + search params）
- `notes-page.tsx` → `pages/notes`（卡片网格 + RHF）
- `files-page.tsx` → `pages/files`（**TanStack Table** + 分页、上传弹窗重建）
- `web-flows.tsx` → `pages/admin/users`（users/administrators 复用，**TanStack Table**）
- `roles-page.tsx`、`announcements-page.tsx`、`logs-page.tsx` → `pages/admin/*`（**TanStack Table**，logs 两张表）
- `settings-page.tsx`、`storage-page.tsx`、`mail-templates-page.tsx`、`update-panel.tsx`、`edition-panel.tsx` → `pages/*`（RHF 化；邮件模板正文换 **Tiptap**）
- `appearance.tsx`、`branding-panel.tsx`、`announcements-card.tsx`、`site-footer`、`client-controls`、`shell-tools` → Tailwind 重建，保持 profile 条件渲染逻辑
- `rich-text-editor.tsx` → Tiptap 重实现：扩展白名单对齐现有消毒标签集，保留 `{{site_url}}` href 处理与源码模式；`rich-content.tsx` 保留白名单消毒渲染
- `workspace-layout.tsx` → Tailwind 重建，**插槽 API 不变**（navigation/header/children/overlays），页面仍不设侧栏偏移
- i18n：新文案全部登记 `locales/en.json` 词条，清理失效词条；`defineMessages` 用法保持
- Tiptap/Recharts 经 router lazy route 切分进异步 chunk，控制首包体积

### 8. 删除与测试更新
- 删除：`styles.css` + 11 个功能 css、`forms.tsx`、`modal.tsx`、`tabs.tsx`、`switch.tsx`、`tooltip.tsx`、`rich-text-editor.tsx`、`pageFromHash` 及全部 hash 解析代码
- 更新 7 个 web-ui 测试文件适配新结构（routes.test → router 守卫测试；i18n catalog 测试保留）；`layout.spec.ts` 等电 2e 选择器若依赖旧 class 名则同步修正

### 9. 文档与索引同步
- 更新 `docs/02-standards/frontend.md`、`docs/03-runbooks/frontend-foundations.md`、`docs/01-architecture/architecture.md`（数据流不变，路由/双入口/表单/图表描述更新）
- `framework.manifest.json` sources 指向新入口；`.agents/skills/add-react-page/SKILL.md` 改为「router 树登记 + RHF/Zod + ui 原语」流程
- `make docs` 重新生成 `context.gen.md`

## 验证（web-platform 为主）

1. **静态门禁**：`pnpm typecheck`、`pnpm check:i18n`、`pnpm test`、`pnpm check:contracts`（契约不动应零漂移）、`pnpm check:design`，最终 `make test` 汇总（含 check:authors/version/docs/residuals/boundaries）
2. **构建**：`pnpm --filter @unicore/web build`、`pnpm --filter @unicore/desktop build`、`make docs`
3. **Go 侧**：`go test ./internal/adapter/http/... ./internal/platform/...`（OIDC/邮件链接断言）
4. **web-platform 运行验证**（`make dev-server` + `make dev-web` 真实后端）：全新安装向导 → 登录/注册/找回（真实邮件链接直达 history 路由）→ overview/lab → notes（database 能力）→ files 上传下载 → account → 管理端全页（users/administrators/roles/mail/mail-templates 的 Tiptap 保存回读/announcements/storage/logs/edition）→ OIDC 三种回跳结果 → 暗色 + 5 强调色 + density → 中英切换 → 375px 响应式 → history 深链刷新（SPA fallback）
5. **e2e**：`make test-e2e`（chromium + mobile 双 project）
6. **桌面冒烟**：`make dev-desktop` 真实 Wails 窗口（hash history、notes/外观设置）
7. **web-standalone 抽查**：无平台身份时导航裁剪与 bootstrap 能力门控正常

## 风险与说明

- 一次性重写回归集中：以 web-platform 全页走查 + e2e 兜底；desktop/standalone 做冒烟级验证
- zod 码点计数、Tiptap 输出过服务端 HTML 白名单、admin basepath dev/prod 对齐，是三个已知需在实现中重点核对的点
- 不新增统计 API、不动契约契约链、不换 i18n 内核、不改设计令牌链；工作区保持 LTR；交付前所有提交英文书写
- 桌面原生依赖与交叉编译限制如实报告，不宣称未验证的平台支持
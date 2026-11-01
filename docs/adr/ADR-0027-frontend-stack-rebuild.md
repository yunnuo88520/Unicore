<!-- Author: yunnuo <ymz@ebox.vip> -->
# ADR-0027：前端技术栈重封装

状态：接受 · 日期：2026-10-31 · 作者：yunnuo / ymz@ebox.vip

决定：共享 UI 层（packages/web-ui）整体重封装为现代前端栈，并取代 ADR-0002 中对 Tailwind/shadcn 的排除条款。新栈为：路由 TanStack Router（代码式路由树，Web 用户端/管理端使用 history 导航并依赖服务端既有 SPA fallback，Wails 桌面端沿用 hash 导航）、数据 TanStack Query（不变）、表格 TanStack Table、样式 Tailwind v4（`@theme inline` 映射既有 tokens.gen.css 设计令牌，白牌生成链、暗色与强调色机制不变）、组件 Radix 原语按 shadcn 风格自持于 `src/ui/`、图标 Lucide（不变）、表单 React Hook Form + Zod、富文本 Tiptap、图表 Recharts（仅建立主题化能力层，页面无真实统计 API 前不落图）。

校验采用契约约束到 Zod 的运行时适配层 `constraintsToZod`：由 constraints.gen.ts 子集生成 Zod schema 供 RHF 表单使用，字符串长度按 Unicode 码点计数与 `validate()` 对齐，错误消息文案逐条一致；SDK 调用前的契约 `validate()` 保留为最终防线，不改造契约生成器。路由元数据 routes.ts 与 `canAccess`/`isAdministrator` 权限裁剪逻辑保留，侧栏导航仍由其派生；服务端授权始终权威。

原因：页面与表单规模增长后，自研路由/组件/富文本的维护成本与一致性风险超过引入成熟栈的成本；TanStack 系与既有 Query/Lucide 组合可复用会话代际与双 transport 架构；Tailwind v4 的 CSS-first 令牌映射避免重做白牌设计链；一次性重写避免新旧组件长期并存。

后果：contract `validate()` 与 `constraintsToZod` 双轨并存，新增契约约束类型时两处需同步扩展；Tiptap 输出仍须满足服务端 HTML 白名单再校验；history 导航使 OIDC 回跳与邮件链接的 URL 构造同步调整；Recharts 在无统计端点前仅为能力储备；i18n 微内核与 check:i18n 门禁、禁假统计、WorkspaceLayout 唯一结构壳等既有约束继续生效。

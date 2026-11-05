<!-- Author: yunnuo <ymz@ebox.vip> -->
# web-ui 域内约定

业务壳层包。完整规范见 [前端基础](../../docs/03-runbooks/frontend-foundations.md)，根 [AGENTS](../../AGENTS.md) 优先。

- 布局只复用 WorkspaceLayout，业务页不设置侧栏偏移；几何变化走 shell.css。
- `routes.ts` 是页面唯一事实来源（label/permission/icon/group）；服务端权限才是边界，前端隐藏仅是呈现。
- 用户可见文案必须中英双语：组件用 useI18n 的 `t`，静态路由/选项用 `defineMessages` 并在渲染时翻译；禁止中文直写后再补。词条改动跑 `pnpm check:i18n`。
- 数据请求一律经 `@unicore/sdk` 的 AppClient（GET 并发去重与会话代际失效内置），页面不直接 fetch。
- 服务端状态用 TanStack Query，mutation 失效映射集中在 `queries.ts`；偏好走 `@unicore/theme/preferences`。

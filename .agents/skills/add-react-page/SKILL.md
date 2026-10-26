---
name: add-react-page
description: 新增 Unicore Web/Wails 共用响应式页面、导航或仪表盘 widget。
metadata:
  author: yunnuo <ymz@ebox.vip>
---

# add-react-page

## trigger

新增共享业务页面或 widget 时使用。

## inputs

页面目标、AppClient 方法、适用 profile、权限及空态。

## steps

1. 阅读 PRD、架构和 ADR-0002；页面放 packages/web-ui，shell 只创建 transport。
2. 通过 AppClient 请求，用 TanStack Query 管理服务端状态；新 DTO 先改 OpenAPI 并生成。
3. 首页扩展走 DashboardWidgetRegistry，以唯一 id 注册真实数据卡片。
4. 实现 loading/empty/error/success 和适用的 permission-denied；表单有 label，图形有文字说明。
5. 使用现有 CSS tokens，验证三态主题、375px、键盘和桌面复用。

## output

共享页面、必要 SDK、行为测试、作者头及运行说明。

## forbidden

页面直接 fetch/window.go；假统计；为未实现能力显示可成功执行的按钮。

## validation

pnpm typecheck、pnpm test、pnpm build；交互变更运行 make build-web test-e2e，桥接变更做原生构建。

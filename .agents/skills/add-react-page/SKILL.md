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

1. 阅读 PRD、架构、ADR-0002 和 docs/02-standards/frontend.md；页面放 packages/web-ui，shell 只创建 transport。
   路径/权限登记 routes.ts，PageContent 登记渲染；管理菜单/直达页统一用 isAdministrator，普通用户的设置页仅本地外观，不请求全局设置/品牌管理接口；未知路由不回退业务页。
2. 通过 AppClient 请求，用 TanStack Query 管理服务端状态；新 DTO 先改 OpenAPI 并生成。沿用 SessionBoundary，不能另存用户令牌或绕过统一失效处理。表单复用公共 Form 的契约校验、字段错误和聚焦。
3. 首页扩展走 DashboardWidgetRegistry，以唯一 id 注册真实数据卡片。
4. 实现 loading/empty/error/success 和适用的 permission-denied；表单有 label，图形有文字说明。
5. 使用现有 CSS tokens，验证三态主题、375px、键盘和桌面复用。

## output

共享页面、必要 SDK、行为测试、作者头及运行说明。

## forbidden

页面直接 fetch/window.go；假统计；为未实现能力显示可成功执行的按钮。

## validation

pnpm typecheck、pnpm test、pnpm build；交互变更运行 make build-web test-e2e，桥接变更做原生构建。

新增实体表单使用 modal.tsx，不在列表下方展开。验证初始焦点、Escape/取消、焦点返回及 pending；安装/认证页面和设置编辑按自身流程呈现。导航沿用用户管理/系统管理的独立折叠组，默认工作台概览；不恢复重复平台仪表盘。系统日志承载审计/邮件投递，模板不做设置页面；见 ADR-0014。共享 sidebar 固定视口，导航区独立滚动，验证 720px 高和 375px 宽。

二级导航向内缩进并配套 Lucide/SVG 图标，全局 UI 禁止 Emoji；单机/桌面不显示用户头像。短暂操作反馈复用 message.tsx 的 useMessage（五态，默认顶部 3 秒），提交失败由 QueryScope MutationCache 统一处理，成功回调给明确文案；不在保存按钮旁插入提示。保留字段校验、可重试加载错误与完成页状态；验证消息不挤动布局、自动消失及原生 dialog 内可见。

当前形态与入口以 [ADR-0016](../../../docs/adr/ADR-0016-separate-client-admin-surfaces.md) 为准：用户 main.tsx 与管理员 admin.tsx 独立入口，管理页只在 admin-app.tsx 装配，共享 Workspace/表单/消息/主题。单机/桌面仅业务和本地外观，不提供站点、品牌、SMTP、对象存储和后台。管理员公开 auth/bootstrap 只返回固定域最小投影；本人 account 需管理员会话，其余管理资源须 permissions/superAdmin，不能宽泛豁免 admin 路由。新增普通用户立即 active 并验证用户入口登录；注册默认关闭，安全页 Switch 控制且须 SMTP 测试。布尔控件用 Switch，上传用自定义拖拽弹窗与 SDK 真实阶段。

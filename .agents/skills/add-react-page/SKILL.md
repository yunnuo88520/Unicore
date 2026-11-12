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

1. 阅读 PRD、架构、ADR-0002 和 docs/02-standards/frontend.md；页面放 packages/web-ui，shell 只创建 transport。页面归属先查 docs/00-product/product-forms.md（产品形态为 Platform / Standalone（web 与桌面两载体等效）/ CLI），呈现与访问规则见 docs/00-product/feature-presentation.md。
   路径/权限登记 routes.ts，在 router.tsx 的 createWorkspaceRouter 挂载 page 模块（TanStack Router 代码式路由树）；管理菜单/直达页按管理员域会话 + routes.ts 权限点判定（保留集操作另按 superAdmin 语义，见 ADR-0034/0036），普通用户无设置页面，通过右上角调整设备外观，不请求全局设置/品牌管理接口；未知路由由 NotFoundPage 明确展示，无权已登记页面为独立 403。新页面进入导航时同步默认区域定义与菜单节点，编辑器/侧栏/图标栏/移动抽屉消费同一导航模型，不添加 KeepAlive、CloseTab 等无运行效果的假开关。
2. 通过 AppClient 请求，用 TanStack Query 管理服务端状态；新 DTO 先改 OpenAPI 并生成。沿用 SessionBoundary，不能另存用户令牌或绕过统一失效处理。表单复用公共 Form 的契约校验、字段错误和聚焦。
3. 首页扩展走 DashboardWidgetRegistry，以唯一 id 注册真实数据卡片。
4. 实现 loading/empty/error/success 和适用的 permission-denied；表单有 label，图形有文字说明。
5. 使用现有 CSS tokens，验证三态主题、375px、键盘和桌面复用。

## output

共享页面、必要 SDK、行为测试、作者头及运行说明；同步 docs/00-product/feature-inventory.md 与 docs/00-product/feature-presentation.md 的对应行。

## forbidden

页面直接 fetch/window.go；假统计；为未实现能力显示可成功执行的按钮；无运行效果的假开关（KeepAlive/CloseTab 等）。

## validation

pnpm typecheck、pnpm test、pnpm build；交互变更运行 make build-web test-e2e，桥接变更做原生构建。

新增实体表单使用 ui 的 Modal/ConfirmDialog，不在列表下方展开。验证初始焦点、Escape/取消、焦点返回及 pending；安装/认证页面和设置编辑按自身流程呈现。导航默认区域与顺序由代码显式定义（业务区固定序列，系统设置组仅放全局设置类页面），操作员经菜单管理调整；不恢复重复平台仪表盘。系统日志承载可筛选/排序/分页/导出的审计与邮件投递；邮件模板是系统管理独立页，复用 ui/editor.tsx 的 Tiptap 编辑器，单层场景 Tabs；见 ADR-0020 和 docs/03-runbooks/admin-tools.md。共享 sidebar 固定视口，导航区独立滚动，验证 720px 高和 375px 宽。

二级导航向内缩进并配套 Lucide/SVG 图标，全局 UI 禁止 Emoji；单机/桌面不显示用户头像。短暂操作反馈复用 message.tsx 的 useMessage（五态，默认顶部 3 秒），提交失败由 QueryScope MutationCache 统一处理，成功回调给明确文案；不在保存按钮旁插入提示。保留字段校验、可重试加载错误与完成页状态；验证消息不挤动布局、自动消失及原生 dialog 内可见。

当前形态以 [产品形态规范](../../../docs/00-product/product-forms.md) 为准；账号与会话以 [ADR-0037](../../../docs/adr/ADR-0037-unified-user-identity.md) 为准，ADR-0016 只约定分工作台入口：用户 main.tsx 与管理员 admin.tsx 独立入口，管理页只在 admin-app.tsx 装配，共享 Workspace/表单/消息/主题。单机/桌面仅业务和本地外观，不提供站点、品牌、SMTP、对象存储和后台。管理员公开 auth/bootstrap 只返回固定域最小投影；本人 account 使用统一账号会话并校验当前工作台上下文，其余管理资源须 permissions/superAdmin，不能宽泛豁免 admin 路由。新增普通用户立即 active 并验证用户入口登录；注册默认关闭，在注册设置用独立 Switch 控制开放注册与邮箱验证；仅邮箱验证、邮件登录和找回密码需要 SMTP 测试。布尔控件用 Switch，上传用自定义拖拽弹窗与 SDK 真实阶段。

本地偏好与双语遵循 [ADR-0019](../../../docs/adr/ADR-0019-local-preferences-i18n.md)：用 preferences.ts / i18n.ts 统一入口，组件订阅 useI18n 或 useLocale；新文案补英文 catalog，插值保留业务数据，不用 DOM 翻译。不要按 locale 重建表单或会话。右上 ClientControls 和 AppearanceDrawer 全入口共享，resetAppearance 保留语言；不得用实例 settings API 保存设备偏好。验证英文长标签、跨标签通知、刷新持久化、375px、全宽导航与旧 RTL 偏好恢复 LTR、Escape/回焦与原生 Wails；详见 [扩展指南](../../../docs/03-runbooks/client-preferences.md)。

新增页面必须遵循 [前端基础封装](../../../docs/03-runbooks/frontend-foundations.md)：WorkspaceLayout 提供插槽，禁止页内计算侧栏 margin/宽度或复制 shell。组件用 useI18n，常量用 defineMessages，渲染时 t；中英文与实现同一变更提交。`pnpm check:i18n` 是 Web/GUI 构建和 CI 的必过项，会递归发现新目录中的中文直写与缺失英文，不得忽略或关闭。新页/标签加入英文真实页面巡检；测试 loading/empty/error/success、表单错误与消息。布局改动跑 layout.spec.ts 的组合矩阵，检查实际导航/正文矩形不重叠；工作区和主题控制面板固定 LTR；阅读方向选项已移除，旧 RTL 字段由偏好白名单忽略。

邮件默认主题正文固定中文，公告/邮件编辑内容和预览均是原始业务数据，不调用 t()；UI 标签/提示仍同步双语。公告管理与顶部铃铛参考 pages/admin/announcements 和 announcement-center，安全内容渲染复用 rich-content；禁用后铃铛列表为空且不弹窗，本地形态不请求公告。

文件上传复用 FileUploadDialog 和 AppClient.files.uploadFile（hashing/uploading/confirming、确认字节进度、signal 暂停、resumeId 恢复），不要在业务页重复上传或自行拼云 URL。恢复重选原文件，身份/签名/File 不写 localStorage；放弃调用 deleteFile。覆盖 PC/375px、中英文、明暗、刷新/服务重启、错误文件及只补传缺片，见 ADR-0022。

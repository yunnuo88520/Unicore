<!-- Author: yunnuo <ymz@ebox.vip> -->
# 前端基础封装与新增功能

共享组件位于 packages/web-ui，Web 用户/管理员和 Wails 只负责装配 transport、允许的页面与全局样式。新增业务先组合下面的公共入口，不复制布局、请求、主题、翻译或表单实现。

| 职责 | 入口 | 新功能约定 |
| --- | --- | --- |
| 页面骨架 | `@unicore/web-ui/layout` / WorkspaceLayout | navigation/header/children/overlays 插槽；布局宽度、固定侧栏、滚动与移动断点由 shell 管理，页面不设主区域偏移 |
| 身份与请求 | Workspace / SessionBoundary / AppClient / queries.ts | 会话代际隔离、统一错误与失效；Query 管服务端状态，不绕过 SDK |
| 路由与权限 | routes.ts / PageContent / admin-app.tsx | 注册路由/标题/说明；管理员入口独立，API 再授权 |
| 界面语言 | `@unicore/web-ui/i18n` | 组件 `useI18n()`，正文/属性/提示 `t()`；静态配置 `defineMessages()` 登记后在渲染处翻译 |
| 本地偏好 | `@unicore/web-ui/preferences` / ClientControls | 唯一设备状态入口；不得用业务设置 API 或独立 localStorage |
| 主题与布局控件 | AppearanceDrawer / AppearanceControls | 选项来自 preferenceOptions，标签满足完整类型映射；控件固定 LTR，工作区统一 LTR |
| 表单与校验 | forms.tsx / Form、Field | 原生与契约约束、服务端字段错误、pending 防重；新实体用 Modal |
| 反馈与控件 | useMessage / Modal / Tabs / Switch / Tooltip | 使用统一消息、焦点/关闭和键盘行为，避免自写重复弹层 |
| 富文本 | rich-text-editor.tsx | 受限标签、选择范围、变量插入、源码净化、纯文本粘贴；服务端再次校验，场景页复用组件 |
| 视觉基础 | styles.css / tokens.json | 引入一个共享样式入口；颜色/尺度使用 tokens，不写页面专属主题常量 |

## 新页面的最小双语写法

```tsx
const {t}=useI18n();
return <button aria-label={t('保存')}>{t('保存')}</button>;
```

同时在 `packages/web-ui/src/locales/en.json` 增加 `"保存": "Save"`。动态数据使用 `t('下载 {{v0}}',{v0:file.original_name})`，不要构造动态 key。路由/选项等模块级常量可 `defineMessages({save:'保存'})`，实际渲染仍调用 `t(labels.save)`；不能在模块加载时调用 t 固化语言。license/updater 专用词条放对应资源，保持编译裁剪。

界面默认中文、英文同步交付。用户输入、实例名称、文件名、第三方日志保留作者原文；不把业务内容传给 t。业务样本文本放 data，仅用于示例，禁止将界面文案搬过去绕过检查。

## 构建与验收

`pnpm check:i18n` 递归扫描共享 UI 和 Web/GUI 入口的 TS/TSX（排除测试/生成代码），拒绝未包装的中文文本、属性和元数据；检查英文缺失/空值、功能资源重复 key、插值、设置/权限标签及契约错误。Web 与 GUI 的 build、make test 和 CI 均执行；新增嵌套目录同样受检。检查有反向用例证明中文直写、缺词条、动态 key 与插值丢失确实失败。

静态检查不能证明动态数据与任意新流程的全部状态。新增界面仍必须实际切换中英文，验证 loading/empty/error/success、表单错误、消息、弹窗与英文长标签；在 preferences.spec.ts 的英文巡检加入新的管理页/标签。布局改动运行 layout.spec.ts，覆盖 375/767/768/850/900/1280px、三种布局/侧栏、两种内容宽度，含旧 RTL 数据恢复 LTR，并断言正文未被导航覆盖，而非只检查 scrollWidth。桌面共享改动还需真实 Wails 窗口，不能用 HTTP 替代。

基础组织参考 [New API 的布局组件](https://github.com/QuantumNous/new-api/tree/main/web/src/components/layout) 与 [语言资源同步](https://github.com/QuantumNous/new-api/blob/main/web/scripts/sync-i18n.mjs) 的职责分离与资源检查思路；这里沿用 Unicore 的 tokens、AppClient 和 profile 边界独立实现，不引入其业务组件或源码。

管理端操作日志与邮件模板复用这些入口，详见 [管理工具](admin-tools.md)。模板正文/主题属于业务内容，语言巡检仅排除输入及 `.rich-surface`，不跳过整个页面。

可配置公告与邮件正文不调用 t()；共用安全富内容展示 rich-content.tsx，编辑与服务端预览分离。用户公告通过 DashboardWidgetRegistry 注入，仅平台用户身份启用，管理页独立入口。见 [公告手册](announcements.md)。

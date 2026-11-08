<!-- Author: yunnuo <ymz@ebox.vip> -->
# 前端基础封装与新增功能

共享层按包拆分：组件原语 `@unicore/ui`（packages/ui）、表单层 `@unicore/form`（packages/form）、令牌与偏好 `@unicore/theme`（packages/theme），业务 Workspace 仍在 packages/web-ui，Web 用户/管理员和 Wails 只负责装配 transport、允许的页面与全局样式。新增业务先组合下面的公共入口，不复制布局、请求、主题、翻译或表单实现。工作区由顶栏显示当前页面名称并承载一级标题；正文直接呈现业务内容，不再重复品牌、页面大标题、说明与核心就绪状态横幅。

| 职责 | 入口 | 新功能约定 |
| --- | --- | --- |
| 页面骨架 | `@unicore/web-ui/layout` / WorkspaceLayout | navigation/header/children/overlays 插槽；布局宽度、固定侧栏、滚动与移动断点由 shell 管理（几何属性变体在 shell.css），页面不设主区域偏移 |
| 身份与请求 | Workspace / SessionBoundary / AppClient / queries.ts | 会话代际隔离、统一错误与失效；Query 管服务端状态，不绕过 SDK |
| 路由与权限 | routes.ts / router.tsx / admin-app.tsx | routes.ts 是页面事实的唯一登记源（标题/说明/权限/图标）；导航由服务端真实区域配置（区域 + directory/page/link/action 节点树）与 navigation.ts 派生合成，区域编辑器、侧栏、图标栏与移动抽屉消费同一模型；createWorkspaceRouter 挂载 page 模块（history 导航，桌面 hash，管理端动态 basepath）；管理员入口独立，API 再授权 |
| 界面语言 | `@unicore/web-ui/i18n` | 组件 `useI18n()`，正文/属性/提示 `t()`；静态配置 `defineMessages()` 登记后在渲染处翻译；共享组件经 `@unicore/ui/i18n` 翻译桩渲染 key，宿主在 i18n.ts 注入 setTranslator |
| 本地偏好 | `@unicore/theme/preferences` / ClientControls | 唯一设备状态入口；不得用业务设置 API 或独立 localStorage |
| 主题与布局控件 | AppearanceDrawer / AppearanceControls | 选项来自 preferenceOptions，标签满足完整类型映射；控件固定 LTR，工作区统一 LTR |
| 表单与校验 | `@unicore/form` / useAppForm、AppForm、AppField | 契约约束经 constraintsToZod 生成 Zod schema 驱动 RHF；label/hint 收已翻译 ReactNode；服务端 AppError.fields 用 applyServerError 合并（聚焦限本表单）、pending 防重；新实体用 Modal/ConfirmDialog |
| 反馈与控件 | `@unicore/ui`（useMessage / Modal / Tabs / Switch / Tooltip / Table 等） | 使用统一消息、焦点/关闭和键盘行为，避免自写重复弹层；TanStack Table 渲染列表用 ui/table |
| 富文本 | `@unicore/ui/editor` / RichTextEditor | Tiptap 受限标签、选择范围、变量插入、源码净化、纯文本粘贴；服务端再次校验，场景页复用组件 |
| 图表与列设置 | widgets/activity.tsx / column-visibility.ts | Recharts 读取真实管理员统计；useColumnVisibility 按表 key 保存设备偏好，列隐藏不影响授权或导出 |
| 视觉基础 | `@unicore/theme/styles.css` / tokens.json | Tailwind v4 经 `@theme inline` 映射生成令牌；颜色/尺度使用语义令牌类，不写页面专属主题常量 |

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

管理端操作日志与邮件模板复用这些入口，详见 [管理工具](admin-tools.md)。模板正文/主题属于业务内容，语言巡检仅排除输入及 `.rich-content`/`.tiptap` 排版层，不跳过整个页面。

可配置公告与邮件正文不调用 t()；共用安全富内容展示 rich-content.tsx，编辑与服务端预览分离。用户公告与站内信通过全局顶部铃铛查看，仅平台用户身份启用；SSE 通知后重新查询服务端，管理页独立入口。见 [公告手册](announcements.md)。

已登记但身份无权访问的页面使用独立 ForbiddenPage（403），未知地址使用 NotFoundPage（404）；不要把无权访问静默重定向到另一个业务页面。Swagger API 参考页采用延迟加载，并遵循实例 API 文档开关；头像复用文件上传和本人 profile API。行为及扩展方式见 [UI 组件参考](../product/ui-components.md) 与 [个人中心](personal-center.md)。

移动端（375px）验收必须覆盖**带数据的状态**：所有宽表格（输入行、多列矩阵）必须收在 `overflow-x-auto` 容器内滚动，双列栅格窄屏需显式 `grid-cols-1` 约束轨道，防止 min-content 撑开文档；E2E 对整页断言无横向溢出时必须让页面处于含数据的真实状态，仅验空态视为未覆盖。侧栏默认区域、成员与顺序由代码显式定义（业务区固定序列，系统设置组仅放全局设置类页面），不存在字母序兜底；调整默认结构必须随实现显式变更，操作员经菜单管理编辑区域树并持久化（[ADR-0036](../adr/ADR-0036-navigation-regions-granular-authorization.md)）。

持久分片上传统一使用 file-upload-dialog.tsx / AppClient.files.uploadFile；支持暂停/刷新续传、指纹核对和确认字节进度。平台专用安全投影 uploadPolicy，配置页不得向用户端暴露。详见 [存储手册](storage.md)。

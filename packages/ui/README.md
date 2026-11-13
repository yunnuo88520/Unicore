<!-- Author: yunnuo <ymz@ebox.vip> -->
# @unicore/ui

Unicore 共享 UI 层：基于 Radix UI、原生控件与 Tailwind v4 设计令牌，包含原语、独立控件、图表、日历、组合组件与可编辑网格。主题通过 CSS 变量（`@unicore/theme`）驱动，组件不调用业务接口。组件 family 的显式登记见 `packages/web-ui/src/pages/ui-preview/catalog.ts`；变体、辅助原语与导出数量不等同于独立 family，也不代表视觉验收结论。

## 组成

| 模块 | 导入路径 | 说明 |
| --- | --- | --- |
| 组件 barrel | `@unicore/ui` | Alert/Breadcrumb/Button/Card/Drawer/EmptyState/Kbd/PageHeader/Popover/RadioGroup/StatCard/Input/Checkbox/Switch/Select/Tabs/Dialog/Modal/ConfirmDialog/DropdownMenu/Table/Tooltip/Message 等 |
| `cn` | `@unicore/ui/cn` | clsx + tailwind-merge |
| i18n 桩 | `@unicore/ui/i18n` | `t`/`useLocale`/`useI18n`/`defineMessages`/`setTranslator` |
| 消息 | `@unicore/ui/message` | MessageProvider/useMessage（五态、自动消失） |
| 富文本 | `@unicore/ui/editor` | Tiptap 封装（较重，刻意不入 barrel 以保持代码分割） |
| 独立控件 | `@unicore/ui/controls` | Accordion、Combobox、CommandPalette、ContextMenu、Carousel、TreeView、InputOTP、Pagination、FileUploadDropzone，以及操作、输入、选择与反馈组件 |
| 图表卡片 | `@unicore/ui/charts` | Area/Line/Combo、比较、条形、径向、雷达、矩阵、散点与 Sankey；数据与交互回调由宿主持有 |
| 日期与日历 | `@unicore/ui/calendar` | DateCalendar、DatePicker、EventCalendar、MeetingScheduler 与日期工具 |
| UI 组合件 | `@unicore/ui/composites` | AgentCreator、Composer、AuthCard、SettingsDialog、Sidebar、NotificationCenter、TaskList、Questionnaire 等；无对应后端服务 |
| 可编辑网格 | `@unicore/ui/data-grid` | DataGrid、列契约、纯数据变换与本地编辑历史；不同于业务列表 DataTable |

## 主题接线

组件类名全部走令牌（`bg-button`、`text-ink`、`ring-focus`…）。消费方必须：

1. 引入样式入口 `@unicore/theme/styles.css`（Tailwind v4 入口，内含 `@source` 声明）；
2. 挂载 `@unicore/theme` 的运行时（`useTheme`）以写入 `data-theme`/`data-accent` 与缩放变量。

未接入令牌时组件仍可渲染，但配色会退化为浏览器默认值。

## 组件预览

开发环境（`pnpm dev-web`）访问 `/ui-preview`，按显式 family 登记浏览组件与状态，用于主题、双语、键盘及窄屏自检。预览是开发工具，不是业务菜单或接口授权，也不表示所有状态均已视觉验收；生产构建与测试环境不注册该路由。公开 API 与当前限制见 [UI 组件参考](../../docs/product/ui-components.md)。

构建当前 Web/Go 产物后运行 `pnpm test:ui-system`，会启动隔离的真实 Standalone 后端及 Vite 开发前端，覆盖桌面/375px、中英文与亮暗主题。设置 `UNICORE_UI_SYSTEM_PRODUCTION=1` 同时检查生产产物不暴露目录。截图与 trace 是测试证据，不是已经批准的视觉基准；输出保存在 `build/ui-system` 与 `test-results`。

## i18n 接线

组件文案以中文原文为 key。宿主应用在入口处注入目录，未注入时原样渲染 key：

```tsx
import { setTranslator } from '@unicore/ui/i18n';
import { t } from './i18n'; // 你的目录实现（如 @unicore/web-ui/i18n）
setTranslator(t);
```

## 组件速览

```tsx
import { Button, Switch, SimpleSelect, Modal, ConfirmDialog, useMessage } from '@unicore/ui';

// 按钮：pending 自动禁用并显示 spinner；默认 type=button，表单需显式 type="submit"
<Button variant="danger" size="sm" pending={saving} onClick={remove}>删除</Button>

// 开关：受控布尔 API；label 由调用方翻译
<Switch checked={enabled} onChange={setEnabled} />

// 下拉：label/placeholder/option.label 由调用方翻译
<SimpleSelect label={t('存储类型')} value={kind} onChange={setKind}
  options={[{ value: 'local', label: t('本地磁盘') }]} />

// 模态框：mounted 即打开；pending 时抑制 Esc 与遮罩关闭
<Modal title={t('编辑资料')} pending={saving} onClose={close}>…</Modal>

// 确认框
<ConfirmDialog title={t('删除确认')} confirmLabel={t('删除')} cancelLabel={t('取消')}
  danger onConfirm={remove} onCancel={close} />
```

反馈消息通过 Provider 注入（应用根组件需挂 `MessageProvider`）：

```tsx
const message = useMessage();
message.success(t('已保存')); // success/info/warning/error/loading
```

## 构建与发布

- 工作区内开发直接消费 TypeScript 源码（exports 指向 `src/`）；
- `pnpm --filter @unicore/ui build` 产出 `dist/`（ESM + d.ts），供未来 npm 发布使用；发布前还需：peerDependencies 已声明（react/react-dom）、目录 i18n 化与独立版本策略。

## 已知边界

- `editor.tsx` 仍带少量业务残留（`{{site_url}}` 链接模板、邮件场景默认 aria 文案）；
- 图表为独立 SVG/HTML 卡片，支持可关闭的入场/径向弧线动效及减少动态效果；没有通用数值插值能力。不自动请求统计、聚合数据或生成业务样本。现有业务 Recharts widget 不会因新增入口而自动迁移。
- DataGrid 是客户端固定行高窗口化网格，不提供服务端分页/查询或持久化；删除只发出 `onDeleteRows` 请求，不进入编辑撤销栈。宿主替换数据会使旧编辑历史失效。
- 日历不提供重复事件引擎或预约服务；Agent/Composer/Search 等组合件不提供模型调用、检索、认证、配额或上传服务。
- 工作区固定 LTR，只由 WorkspaceLayout 负责壳层占位；Sidebar 组合件不能成为第二套工作区布局。正文页首使用 PageHeader（默认 h1），顶栏标题/面包屑不能替代正文标题。
- 组件不负责权限与数据获取，页面层（`@unicore/web-ui`）负责；Platform 与 Standalone 两载体共享 UI，不向 CLI 引入图形依赖。

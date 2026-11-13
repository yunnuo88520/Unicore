<!-- Author: yunnuo <ymz@ebox.vip> -->
# UI 组件参考

`@unicore/ui` 提供共享界面原语：Radix UI 行为 + 设计令牌配色，不含业务接口与硬编码色值。本文面向在你的应用中组合这些组件的开发者；规范约束见 [应用开发](development.md)。

## 接入前置

```tsx
// 1. 样式入口：Tailwind v4 + 设计令牌（在应用最外层引入一次）
import '@unicore/theme/styles.css';
// 2. 运行时主题：写入 data-theme/data-accent 与缩放变量，并持久化偏好
import { useTheme } from '@unicore/theme';
// 3. 翻译注入：共享组件经翻译桩渲染文案 key，宿主注入目录后即生效
import { setTranslator } from '@unicore/ui/i18n';
import { t } from '../i18n'; // 你自己的目录实现
setTranslator(t);
```

未注入翻译时组件按 key 原样显示；未接入设计令牌时配色退化为浏览器默认。

## 组件速览

| 组件 | 导入 | 用途 |
| --- | --- | --- |
| Button | `@unicore/ui` | 六种语义变体 × 四种尺寸；`pending` 自动禁用并显示 spinner |
| Alert | `@unicore/ui` | 语义横幅（danger/warning/info/success），带可选操作；danger 为 alert 角色 |
| Drawer | `@unicore/ui` | 侧滑面板（start/end），替代 Dialog 手改侧栏 |
| Popover | `@unicore/ui` | 锚定浮层，宽度 288px 起步可覆盖 |
| RadioGroup | `@unicore/ui` | 胶囊单选组（少量互斥项） |
| Breadcrumb | `@unicore/ui` | 顶栏面包屑（current 项强调） |
| Kbd | `@unicore/ui` | 快捷键键帽 |
| Card | `@unicore/ui` | 面板表面与 Header/Title/Description/Content/Footer 组合；`asChild` 可渲染为链接瓦片 |
| PageHeader | `@unicore/ui` | 节标题 + 可选描述 + 操作槽；无外壳，放 CardContent 或裸用 |
| StatCard | `@unicore/ui` | 仪表盘指标卡；图标默认降噪，`tone="success"` 只用于承载语义的状态 |
| EmptyState | `@unicore/ui` | 空/加载/错误三态；`icon/title/description/action`，原生 role 透传，外壳由调用方决定 |
| Input / Textarea / NativeSelect | `@unicore/ui` | 共享控制面样式，`aria-invalid` 自动切换警示色 |
| Switch / Checkbox | `@unicore/ui` | 受控布尔 API，内建 label 关联 |
| SimpleSelect / Select* | `@unicore/ui` | 下拉选择；SimpleSelect 接字符串选项 |
| Tabs | `@unicore/ui` | 统一边框分段标签栏；长标签单行滚动，支持键盘；面板由页面持有 |
| Modal / ConfirmDialog | `@unicore/ui` | 模态与确认框；`pending` 抑制 Esc 与遮罩关闭 |
| DropdownMenu / Tooltip / Table | `@unicore/ui` | 弹出菜单、悬停提示、表格 |
| MessageProvider / useMessage | `@unicore/ui` | 全局消息（五态、自动消失、树外静态代理） |
| AppField / AppForm | `@unicore/form` | 契约驱动表单层，见 [应用开发](development.md) |
| RichTextEditor | `@unicore/ui/editor` | 受限富文本（独立入口，较重） |

## 最小示例

```tsx
import { Button, SimpleSelect, Modal, useMessage } from '@unicore/ui';

// 按钮：默认 type=button，表单内显式传 type="submit"
<Button variant="danger" size="sm" pending={saving} onClick={remove}>
  {t('删除')}
</Button>

// 下拉：选项 label 为目录 key，由组件翻译
<SimpleSelect label={t('存储类型')} value={kind} onChange={setKind}
  options={[{ value: 'local', label: '本地磁盘' }]} />

// 消息：在应用根部挂 <MessageProvider> 后
const message = useMessage();
message.success(t('已保存'));
```

## 行为约定

- 显示文案由调用方翻译后传入（或传目录 key 由翻译桩处理）；业务数据（文件名、用户内容）不经过翻译。
- 消息 `content` 渲染调用方传入的原文，组件不做目录查找。
- 组件不负责权限与数据获取；键盘与焦点行为（焦点圈、焦点返回、Esc 抑制）内建。
- 工作区固定 LTR，忽略旧阅读方向偏好；WorkspaceLayout 独占导航与内容占位。正文页首使用 PageHeader（默认 `as="h1"`），需要分节时用 h2/h3；顶栏面包屑或标题不能替代正文标题，业务页不自行增加侧栏偏移。
- 独立图表从 `@unicore/ui/charts` 导入；已有业务 Recharts widget 仍由业务层装配，管理员近七天活动继续读取真实统计 API，不向单机/桌面注入平台请求。

## 独立 family 与子入口

family 的稳定登记源为 `packages/web-ui/src/pages/ui-preview/catalog.ts` 的 `baseIds/chartIds/compositeIds`；同一 family 的样式变体、辅助组件或演示状态不额外计数。登记描述组件范围，不等于全量功能对齐、跨环境可用或视觉验收通过。新增入口不要求加载编辑器或把全部组件放进根 barrel。

| 子入口 | 独立组件与用途 | API 与限制 |
| --- | --- | --- |
| `@unicore/ui/controls` | Accordion、Carousel、ContextMenu、CommandPalette | 各自持有展开/轮播/菜单交互；命令面板以 `open/onOpenChange/items` 接入，不自动注册全局快捷键或执行应用路由 |
| `@unicore/ui/controls` | Combobox、SegmentedControl、TagGroup、TreeView | Combobox 为单值搜索选择；TreeView 分别以 `selectedIds/onSelectionChange`、`expandedIds/onExpandedChange` 控制选择与展开；标签移除只调用 `onRemove` |
| `@unicore/ui/controls` | SearchField、NumberField、TimeField、Slider、ColorPicker、InputOTP | 字符串/数值控件使用 `onValueChange`，不是原生 change event；NumberField 空值为 `''`，TimeField 为原生 `HH:mm[:ss]`，ColorPicker 为宿主受控六位不透明 hex；InputOTP 的 `onComplete` 不负责验证码校验 |
| `@unicore/ui/controls` | ButtonGroup、IconButton、CloseButton、LinkButton、SocialButton、Counter、Spinner、Meter、Announcement、Notification | 操作、布局及反馈表面；图标按钮必须提供可访问 label，SocialButton 不实现第三方登录 |
| `@unicore/ui/controls` | Pagination、FileUploadDropzone | Pagination 的 `current` 从 1 起，`total` 是页数；Dropzone 通过 `onFiles/onReject` 返回本次选择结果，按 accept/maxSize/maxFiles 本地筛选，不含上传、累积附件限额或服务端安全校验 |
| `@unicore/ui/calendar` | DateCalendar、DatePicker、EventCalendar、MeetingScheduler | 日期选择、事务式日期弹层、事件月历与可用时段展示，见下文 |
| `@unicore/ui/charts` | 独立图表卡片与数据工具 | 受控业务数据 + 语义配色 + 数据表替代视图，见下文 |
| `@unicore/ui/composites` | Agent、Composer、认证/设置表面、通知、任务、问卷与检索活动 | 独立可组合 UI，无对应业务服务，见下文 |
| `@unicore/ui/data-grid` | DataGrid 与纯变换/历史工具 | 本地可编辑数据矩阵；不同于下文业务列表 DataTable |

控件 API 按各自 Props 接线，不把所有控件统一当作 `value/onChange`。静态文案登记双语 key，渲染时翻译；业务标签与用户内容按组件的数据契约传入，不把样本当作真实业务。

### 图表卡片

- 时序：`AreaChartCard`（stacked/overlap/percent）、`LineChartCard`、`ComboChartCard`（`barKeys`），以及 `EarningsChartCard/OrdersComparisonChartCard/RevenueComparisonChartCard`。输入为 `points: ChartPoint[]` 与 `series: ChartSeries[]`；系列可声明 left/right 轴，金额、订单等名称仅表示呈现，不附带统计语义或 API。
- 条形与分数：`BarListChartCard/StageBarsChartCard/HorizontalFunnelChartCard/MostActiveDatesChartCard/StepsChartCard/SegmentedScoreChartCard` 使用 `ChartDatum[]`；日期排行可传 `limit`，漏斗可选 soft/sharp，分数可传 target。
- 径向与雷达：`ActivityRingsChartCard/RadialChartCard/RadarChartCard`；Radial 的 rings/labels/grid/gauge/solid/stacked 属于变体，Radar 的 filled/dots/lines/score 同样不是额外 family。不同单位的活动目标不应相加成业务总量。
- 矩阵与关系：`ContributionsCalendarChartCard` 接 date-only 数据及 start/end；`HeatmapChartCard` 接 rows/columns/cells；`ScatterChartCard` 接 x/y（bubble 还需 size）；`SankeyChartCard` 接 nodes/links，仅处理无环、有效节点与非负流量，拒绝循环、重复节点和未知节点。
- 公共 `ChartCardProps` 提供 title/description、height、locale、messages、formatValue、range、tiles、footer；`range` 仅发 `onChange`，查询/聚合由宿主执行。`visibleSeries/onVisibleSeriesChange` 为受控图例；hover/focus 经 `onHoverChange`，选取经 `onSelect`，不自动导航。
- 数值使用有限 number，缺失值可为 null/undefined；缺失/非有限值显示提示，不默认冒充零。百分比、进度、径向和流量另有非负值/有效 target 要求。图表提供键盘检查与可展开数据表，保留空态/无效值说明。
- SVG/HTML 呈现提供作用域内的入场与径向弧线动效；`animate={false}` 可关闭，减少动态效果偏好自动关闭。`headline/delta` 提供主值与变化量；不承诺通用数值插值或每种图的路径过渡。颜色使用图表语义令牌，业务自定义 color 也应传主题变量而非独立色值。触屏及全部视觉状态仍需按使用场景验收。

### 日期与事件

`DateOnly` 为严格公历 `YYYY-MM-DD`（0001–9999），日期运算不依赖浏览器时区。DateCalendar 支持 single 或 range、min/max/disabledDate、受控 month、周起始日与单/双月；range 的第一次选择只返回 start，完整区间包含两端，并校验中间禁用日。

DatePicker 使用 `value/onChange`，单值或完整 range；手输、快捷区间和日历选择先保留为草稿，仅 Apply 提交，Cancel/Esc/外部关闭均丢弃未提交值。快捷区间由宿主提供，不自动计算业务报表时间范围。

EventCalendar 使用 `month/onMonthChange/events/timeZone`：全天事件的 end 为排他结束日期，省略代表一天；定时事件必须有 Z 或显式 offset，并在指定 timeZone 显示。溢出事件通过议程弹窗查看，详情操作由 `renderEventActions` 提供。当前为月视图，窄屏表格允许局部横向滚动；不提供拖动改期、重复规则或事件持久化。

MeetingScheduler 的 date、timeZone、hourCycle 和 selectedSlotId 均由宿主管理；slots 必须携带真实 offset-bearing start/end 与可用性，组件仅筛选当前显示日并回调 `onSlotSelect`。无可用性计算、预约提交、冲突检测或通知后端；不要把本地展示当成服务端预约成功。

### 组合件与业务边界

| 组件 | 宿主负责的数据/回调 | 不包含的服务 |
| --- | --- | --- |
| AgentCreator / AgentAvatarPreview / AgentLimitsCard / AgentProgress / AgentThinking | profile、头像参数、usage/limit、progress 与 pending；Creator 的 onChange/onSubmit | Agent 创建 API、配额计费、任务执行或推理；thinking 的 wave/spin/stars/infinity 仅为状态视觉 |
| Composer / ComposerPanel | value/onChange/onSubmit，宿主模型/effort/permission 目录与选择回调 | 模型发现、请求发送、权限校验；permission 下拉不构成授权 |
| ComposerAttachmentTile / ComposerAttachmentStrip / ComposerLoader | queued/uploading/success/error、真实 progress、remove/retry 与 busy | 文件上传/续传/删除、假定时进度；Enter 提交需避开 IME 组合，Shift+Enter 换行 |
| AuthCard / AuthMediaCarousel / SettingsDialog / Sidebar / StatCards | children/media、activeId、sections、items 与宿主选择操作 | 身份认证、设置保存、路由或权限投影；Sidebar 不替代 WorkspaceLayout |
| NotificationCenter / TaskList / SearchActivity | tabs/read/actions、任务状态与 revealedIds、查询/源状态/结果数及回调 | 站内信投递、任务调度、Web 检索或抓取 |
| Questionnaire | 单选/多选/文本题，answers/step 或各自 default 值，onSubmit | 分支逻辑、调查服务或持久化；只做线性导航和必填检查 |

AgentCreator 默认紧凑宽度并在字段上方显示资料预览；仅 `layout="split"` 显式选择较宽分栏。头像提供八种造型与六种表情，`localeSlot/voiceSlot/preferencesSlot` 只承载宿主控件，不提供对应服务。AgentProgress 可传真实 `steps/revealedIds/onRevealChange`，不会从步骤伪造百分比；非有限进度为未知态。TaskList 与 SearchActivity 支持受控详情展开，禁用状态不调用动作；来源链接拒绝可执行协议。AuthCard 无媒体时限制表单宽度，SettingsDialog 不呈现禁用分区的内容。

缺少动作回调的组合件按自身契约禁用对应操作；呈现状态必须来自宿主的真实结果。问卷拒绝答案中的失效或禁用选项，实际步骤变化后才移动标题焦点；可选快捷键在编辑输入内不拦截数字选择。Platform 的认证、通知、设置仍复用原业务层；Standalone 不因可导入这些表面而获得平台身份或治理能力。

## 图表、列设置与访问状态

`packages/web-ui/src/widgets/activity.tsx` 组合 Recharts 的 ResponsiveContainer、BarChart 和 Tooltip，并通过管理员统计接口读取数据。新图表仍由 `DashboardWidgetRegistry` 在适用身份下注册，查询使用统一 SDK/Query；颜色使用主题令牌，标题、提示和空/错误状态同时提供中英文。不要以随机样本冒充业务统计，日期与统计口径以服务端为准。

列表复用 `packages/web-ui/src/column-visibility.ts` 的 `useColumnVisibility(tableKey, columns)`。每张表使用稳定且唯一的 key，列 ID 与表格定义一致；返回的可见性接入 TanStack Table，菜单标签在渲染时翻译。隐藏列存入 `@unicore/theme/preferences` 的设备偏好，当前用户与管理员列表已接入。列隐藏只是展示选择，不构成字段权限，也不改变 XLSX 导出内容。

路由守卫将已登记但当前身份无权访问的页面呈现为独立 403，未知路径仍为 404。业务页复用对应状态页与返回入口；管理员 API 始终再次授权。Swagger API 参考页独立加载较重组件，从开启文档开关的实例 `/openapi.json` 读取契约，见 [应用开发的 API 说明](development.md#api权限与前端)。

## 数据表格套件

列表页统一使用 `packages/web-ui/src/components/data-table` 的共享套件（DataTable / DataTableToolbar / DataTablePagination / DataTableSortHeader / DataTableRowActions / DataTableEmpty），渲染面仍由 `@unicore/ui` 的 Table 原语承担；页面负责取数、权限与列定义，不再手写表头循环、加载、错误与分页脚手架。

```tsx
import { DataTable, DataTablePagination, DataTableToolbar } from '../../components/data-table';
import { createColumnHelper, tableFeatures, useTable } from '@tanstack/react-table';

const features = tableFeatures({ rowPaginationFeature, columnVisibilityFeature, paginatedRowModel: createPaginatedRowModel() });

const table = useTable({ features, columns, data: list.data?.items ?? [], meta, manualPagination: true, pageCount, state: { pagination, columnVisibility } });

<DataTableToolbar search={{ label: t('搜索'), placeholder: t('搜索名称或备注…'), value: search, onChange: setSearch }}
  columnMenu={{ entries: menu, onToggle: toggle }} />
<DataTable table={table} pending={list.isPending} busy={list.isFetching} error={list.error} onRetry={() => void list.refetch()}
  empty={{ icon: KeyRound, title: t('暂无数据'), hint: t('创建后开始使用。') }} />
<DataTablePagination table={table} />
```

约定：

- 服务端分页传 `page/pageSize/total/onPageChange`，客户端分页直接传 `table` 实例；两种模式共享同一分页外观。
- 列设置菜单接 `useColumnVisibility(tableKey, columns)`（见上文），列隐藏只影响呈现。
- 骨架加载、错误重试（role=alert）、图标空态由 `DataTable` 内建；`empty` 的图标/标题/提示由调用方提供中英文。
- 业务数据（名称、备注、时间）不过翻译；套件自带的按钮与提示文案已含中英文词条。
- 特殊表格（树形编辑、行内编辑矩阵、选择器）可继续直接组合 `@unicore/ui` Table 原语，不必强行套用套件。

### 可编辑 DataGrid

从 `@unicore/ui/data-grid` 导入 `DataGrid` 与 `DataGridColumn<T>`。必填 `label/data/columns/getRowId/onDataChange/pending/readOnly`；行 ID 必须稳定、非空且唯一，不能用当前数组下标；列 ID 同样非空且唯一。text/number/options 列提供 getValue，可编辑列还需 setValue，后者返回不可变行副本；validate/getValue 必须纯函数。format 负责 React 展示，toText 负责搜索/筛选/CSV 的纯文本表示，不替代业务校验。

- 本地支持搜索、列筛选、排序、列显示/宽度、行选择、矩形单元格选择、键盘导航和固定行高窗口化；`height/rowHeight/overscan` 控制视窗，不支持可变行高或服务端分页。传入 data 是当前客户端数据集，不会自动查询全部服务器记录。
- Enter/F2 开始编辑，提交按列类型转换并校验；矩阵 TSV 粘贴按当前可见行列定位，遇到无效值、只读目标或边界错误整批拒绝，不部分写入。pending/readOnly 阻止编辑、粘贴、撤销与删除请求。
- `onDataChange(next, { reason, cells })` 的 reason 为 edit/paste/undo/redo，宿主必须回传 next；本地历史只覆盖成功编辑/粘贴。宿主替换了行对象/数据后旧快照失效，不能撤销覆盖较新的服务器结果。
- `onDeleteRows(ids)` 仅请求删除选中行：宿主负责确认、权限检查、实际删除与失败反馈。删除不在当前撤销栈中，不能宣称可 Undo 恢复。
- `onRowSelectionChange/onCellSelectionChange/onValidationError` 是通知回调，不是外部受控选择 Props；查询、列宽、列隐藏与选择等视图状态保留于组件内存，不自动写设备偏好。
- Copy 输出所选单元格的 TSV 值；CSV 导出当前筛选/排序后的行与可见列，处理转义及公式前缀风险，不等同业务 XLSX 导出或字段授权。默认浏览器下载，可用 `onExport(csv)` 接原生保存；导出权限由宿主裁决。

该组件与 `packages/web-ui/src/components/data-table` 的业务列表套件并存，后者仍负责统一列表加载/错误/空态与分页脚手架；不要为了引入编辑矩阵而替换已有服务端列表或授权逻辑。

## 已知边界

- `RichTextEditor` 的链接契约默认仅接受绝对 URL；需要 `{{site_url}}` 模板变量的场景传 `siteTemplate`（与后端邮件校验镜像一致，仅支持裸变量）。
- 主题偏好（明暗、accent 预设、密度、圆角）由 `@unicore/theme` 持久化；实例级主色覆盖属于部署配置，不在组件层。

<!-- Author: yunnuo <ymz@ebox.vip> -->
# UI 组件约定

> 目标：任何人（或 AI）在本框架里生成任何功能界面，产出都长一个样。**组件要先用，规矩要先读。**
> 本文是生成 UI 前的必读清单；组件 API 见 [UI 组件参考](ui-components.md)，令牌见 `@unicore/theme`。

## 铁律（违反即 review 不通过）

1. **先找组件，再写界面。** 下面场景一律用对应原语，禁止手搓：

| 场景 | 用 | 禁止 |
| --- | --- | --- |
| 错误/警告/结果横幅 | `Alert` | 手写 `border-danger-line bg-danger-soft` 组合 |
| 侧滑面板 | `Drawer` | 拿 Dialog 改侧栏、手写 translate 定位 |
| 锚定浮层 | `Popover` | absolute 定位 + 手动开关 |
| 少量互斥选择 | `RadioGroup` | 手搓 radiogroup / Checkbox 冒充单选 |
| 面包屑 | `Breadcrumb` | 手写 ChevronRight 串 |
| 快捷键展示 | `Kbd` | 裸文本 |
| 页面/节标题 | `PageHeader`（页面默认 h1，节标题显式 `as="h2"`） | 重复页面标题、以卡片标题冒充页面标题 |
| 列表页（搜索+表格+分页） | `DataTableToolbar / DataTable / DataTablePagination` | 每页自拼表格壳 |
| 表单字段 | `AppField / AppControllerField / AppSelectField…` | 直接 `register()` + 手写错误展示 |
| 新建/编辑实体 | `FormDrawer` + `AppFormBody` / `AppFormFooter` | 逐页拼 Drawer、正文滚动区或 sticky 操作栏 |
| 空状态/加载/错误占位 | `EmptyState` | 手写居中图标文案 |
| 指标卡 | `StatCard` | 手搓 stat 卡片 |
| 面板 | `Card` 系 | 手写 `rounded-xl border border-line bg-surface` |
| 轻提示 | `useMessage` | `alert()`、自制 toast |

2. **颜色只用语义 token**（`bg-surface`、`text-ink`、`text-danger`…），禁止字面量（`bg-blue-500`、`#hex`）及页面内自建主题常量。正文层级使用 `text-ink` / `text-muted` / `text-subtle`；链接、选中态与状态反馈使用对应强调/状态 token，不以颜色单独传达含义。边框与低对比表面为默认层次，阴影仅用于真实浮层或需要区分的叠层。
3. **图标只用 lucide**，尺寸 16 或 18，颜色跟随文本角色，禁止给图标单独配色。
4. **间距只用 4px 刻度**：组内 16（gap-4/p-4 起）、分组间 24（gap-6）、卡片内边距 20 起（p-5）、页面 gutter 由 WorkspaceLayout 负责。禁止 `mt-[13px]` 这类任意值。
5. **动效只此一套**：过渡只写 `transition-colors`（或显式列出属性），时长 150（反馈）/200（浮层）/300（进入），缓动统一 `ease-[var(--ease-out-soft)]`。禁止 `transition-all`、`hover:scale` 大位移、装饰性脉冲和动画 top/left。功能性例外限定为 pending spinner、骨架加载、进度/图表数值更新、折叠区和抽屉展开；沿用共享组件实现，不逐页添加动画。需要动画尺寸时仅作用于有界组件内部，不改变页面/导航几何；尊重 `prefers-reduced-motion`，减少动态时仍保留文字状态与最终值。
6. **文案**：界面文字无感叹号、无句号结尾、按钮用动词、占位符用名词短词（"搜索"而非"搜索xxx…"）；所有文案必须经 `t()` 并同步 en.json。
7. **表单**：字段一律包 `AppField` 系（自带 label/aria-invalid/错误展示）；错误信息来自契约校验，不手写。新建/编辑实体默认用 FormDrawer，固定标题和 footer、正文独立滚动；Modal 留给确认、查看和短临时任务。字段默认单列，成对短字段才在 `sm` 起双列，375px 单列。业务页不得自行设置滚动区、sticky footer 或 Drawer 尺寸。

## 组合模式

- 列表页骨架：正文 `PageHeader`（唯一 h1 + 必要描述 + 主操作）→ `Card > DataTableToolbar + DataTable + DataTablePagination`。页面标题与主操作不藏在列表卡片内；搜索、筛选、选择批量操作与列菜单留在工具栏，行操作留在行内。卡片只为真正独立的业务分区提供 h2，不重复页面标题。
- 顶栏只承载导航面包屑和全局工具，不含 h1，不随滚动隐藏当前路径。页面自带 PageHeader 时由页面拥有标题；其余注册页由 Workspace 依据路由 label 提供共享 PageHeader。标题归属采用显式路由元数据，不通过 DOM 查询或 CSS `:has` 猜测；加载与错误态同样保留标题，独立认证/安装/状态页各自拥有唯一 h1。
- WorkspaceLayout 唯一管理正文 gutter、导航占位与断点，固定 LTR。页面只组合内容和响应式栅格，窄屏主操作可换行，宽表格在自身容器内滚动。
- 普通数据列表由工具栏、单层细边框表格和分页直接组成，不再套 Card/CardContent 形成多层底色与内边距；表头保持透明或同 surface，行分隔线承担阅读分组。
- 反馈分层：行内校验用 AppField 错误、操作结果用 `useMessage`、阻断性错误用 `Alert`、确认用 `ConfirmDialog`。不要混用。
- 实体表单：`FormDrawer` → `AppForm layout="panel"` → `AppFormBody` + `AppFormFooter`；抽屉头部、滚动正文和固定操作区由共享组件负责。短确认/查看/少量字段临时编辑仍可用 `Modal`。
- 实体字段：固定上置标签，白色或暗色主题 surface 底色、细边框；普通输入高 36px、字段间距 16px、标签与控件间距 6px。默认单列，不以额外卡片、分组横线或浮动标签预留区增加层次。
- 双主题不写分支：一切颜色来自 token，`[data-theme]` 自动切换；新增视觉先问"亮暗两个 token 各是什么"。

## 新增组件的流程

1. 放 `packages/ui`，无业务调用、无业务文案（i18n 桩只用于 aria 等内置文案）。
2. 带测试；加入 barrel；在 `/ui-preview` 登记常用状态（双主题自检）。
3. 更新 `ui-components.md` 组件表与本页（如有新约定）。
4. README 组件计数同步。

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
| 页面/节标题 | `PageHeader` | 手写 h2 + 描述组合 |
| 列表页（搜索+表格+分页） | `DataTableToolbar / DataTable / DataTablePagination` | 每页自拼表格壳 |
| 表单字段 | `AppField / AppControllerField / AppSelectField…` | 直接 `register()` + 手写错误展示 |
| 空状态/加载/错误占位 | `EmptyState` | 手写居中图标文案 |
| 指标卡 | `StatCard` | 手搓 stat 卡片 |
| 面板 | `Card` 系 | 手写 `rounded-xl border border-line bg-surface` |
| 轻提示 | `useMessage` | `alert()`、自制 toast |

2. **颜色只用语义 token**（`bg-surface`、`text-ink`、`text-danger`…），禁止字面量（`bg-blue-500`、`#hex`）。文本角色只有三档：`text-ink` / `text-muted` / `text-subtle`。
3. **图标只用 lucide**，尺寸 16 或 18，颜色跟随文本角色，禁止给图标单独配色。
4. **间距只用 4px 刻度**：组内 16（gap-4/p-4 起）、分组间 24（gap-6）、卡片内边距 20 起（p-5）、页面 gutter 由 WorkspaceLayout 负责。禁止 `mt-[13px]` 这类任意值。
5. **动效只此一套**：过渡只写 `transition-colors`（或显式列出属性），时长 150（反馈）/200（浮层）/300（进入），缓动统一 `ease-[var(--ease-out-soft)]`。禁止 `transition-all`、`hover:scale` 大位移、无意义的 `animate-pulse`/`animate-ping`、动画 width/height/top/left。
6. **文案**：界面文字无感叹号、无句号结尾、按钮用动词、占位符用名词短词（"搜索"而非"搜索xxx…"）；所有文案必须经 `t()` 并同步 en.json。
7. **表单**：字段一律包 `AppField` 系（自带 label/aria-invalid/错误展示）；错误信息来自契约校验，不手写。

## 组合模式

- 列表页骨架：`PageHeader`（标题+描述+主操作）→ `Card > DataTableToolbar + DataTable + DataTablePagination`。标题不进顶栏（顶栏标题会自动淡入淡出）。
- 反馈分层：行内校验用 AppField 错误、操作结果用 `useMessage`、阻断性错误用 `Alert`、确认用 `ConfirmDialog`。不要混用。
- 双主题不写分支：一切颜色来自 token，`[data-theme]` 自动切换；新增视觉先问"亮暗两个 token 各是什么"。

## 新增组件的流程

1. 放 `packages/ui`，无业务调用、无业务文案（i18n 桩只用于 aria 等内置文案）。
2. 带测试；加入 barrel；在 `/ui-preview` 登记常用状态（双主题自检）。
3. 更新 `ui-components.md` 组件表与本页（如有新约定）。
4. README 组件计数同步。

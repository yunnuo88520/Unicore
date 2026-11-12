<!-- Author: yunnuo <ymz@ebox.vip> -->
# @unicore/ui

Unicore 共享 UI 原语层：基于 Radix UI + Tailwind v4 设计令牌的 26 个无业务组件，主题通过 CSS 变量（`@unicore/theme`）驱动，组件本身不含颜色字面量、不调用业务接口。

## 组成

| 模块 | 导入路径 | 说明 |
| --- | --- | --- |
| 组件 barrel | `@unicore/ui` | Alert/Breadcrumb/Button/Card/Drawer/EmptyState/Kbd/PageHeader/Popover/RadioGroup/StatCard/Input/Checkbox/Switch/Select/Tabs/Dialog/Modal/ConfirmDialog/DropdownMenu/Table/Tooltip/Message 等 |
| `cn` | `@unicore/ui/cn` | clsx + tailwind-merge |
| i18n 桩 | `@unicore/ui/i18n` | `t`/`useLocale`/`useI18n`/`defineMessages`/`setTranslator` |
| 消息 | `@unicore/ui/message` | MessageProvider/useMessage（五态、自动消失） |
| 富文本 | `@unicore/ui/editor` | Tiptap 封装（较重，刻意不入 barrel 以保持代码分割） |

## 主题接线

组件类名全部走令牌（`bg-button`、`text-ink`、`ring-focus`…）。消费方必须：

1. 引入样式入口 `@unicore/theme/styles.css`（Tailwind v4 入口，内含 `@source` 声明）；
2. 挂载 `@unicore/theme` 的运行时（`useTheme`）以写入 `data-theme`/`data-accent` 与缩放变量。

未接入令牌时组件仍可渲染，但配色会退化为浏览器默认值。

## 组件预览

开发环境（`pnpm dev-web`）访问 `/ui-preview`：一页枚举全部组件的常用状态，用于双主题与双语自检。生产构建与测试环境不注册该路由。

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
- 图表封装已从包中移除（此前无消费者）；待真实统计 API 落地时再按需求重新设计引入（历史实现可从 git 找回）；
- 组件不负责权限与数据获取，页面层（`@unicore/web-ui`）负责。

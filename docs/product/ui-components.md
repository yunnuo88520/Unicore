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
| Input / Textarea / NativeSelect | `@unicore/ui` | 共享控制面样式，`aria-invalid` 自动切换警示色 |
| Switch / Checkbox | `@unicore/ui` | 受控布尔 API，内建 label 关联 |
| SimpleSelect / Select* | `@unicore/ui` | 下拉选择；SimpleSelect 接字符串选项 |
| Tabs | `@unicore/ui` | 受控标签栏；面板由页面持有 |
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
- 图表能力暂未提供；接入真实统计 API 时再重新设计引入。

## 已知边界

- `RichTextEditor` 的链接契约默认仅接受绝对 URL；需要 `{{site_url}}` 模板变量的场景传 `siteTemplate`（与后端邮件校验镜像一致，仅支持裸变量）。
- 主题偏好（明暗、accent 预设、密度、圆角）由 `@unicore/theme` 持久化；实例级主色覆盖属于部署配置，不在组件层。

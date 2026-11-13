<!-- Author: yunnuo <ymz@ebox.vip> -->
# @unicore/form

契约驱动的表单层：`react-hook-form` + zod，校验规则从 OpenAPI 契约（经 `@unicore/sdk` 的 `constraintsToZod`）动态生成，前后端校验单一来源，服务端字段错误自动回填并聚焦。

## 快速上手

```tsx
import { useAppForm, AppForm, AppField } from '@unicore/form';
import { Input, Button } from '@unicore/ui';

const form = useAppForm({
  schema: 'UserCreate',            // OpenAPI schema 名；字符串即得完整 zod 校验
  defaultValues: { username: '', email: '', password: '' },
  onSubmit: async values => { await api.createUser(values); },
  // 服务端错误：catch 里调 applyServerError(error)，字段级错误自动回填
});

<AppForm form={form}>
  <AppField name="username" label={t('账号')}><Input minLength={3} maxLength={64} /></AppField>
  <AppField name="email" label={t('邮箱')}><Input type="email" /></AppField>
  <Button type="submit" pending={form.formState.isSubmitting}>{t('保存')}</Button>
</AppForm>;
```

行为约定：

- `AppForm` 使用 `noValidate` + `aria-busy`；字段错误就地显示，不再汇总为重复的字段列表。`FormSummary` 用于表单级/root 错误，无字段目标的服务端失败也保留在表单内；不要只靠会消失的消息说明失败；
- `AppField` 注入 `register()`、`aria-invalid`、`aria-describedby` 与 `role="alert"` 错误行；`label`/`hint` 收 `ReactNode`，翻译由调用方完成；
- 错误消息（契约校验与服务端 `AppError.fields`）作为目录 key 走宿主 i18n，组件内经翻译桩渲染；
- 服务端错误聚焦只作用于本表单：`AppForm` 将自身元素登记为聚焦作用域，多表单页面不会误焦到别的表单（即使 `applyServerError` 在 submit 之外调用）。

## 非原生控件

`AppControllerField` 用 render-prop 接 Radix 控件：

```tsx
<AppControllerField name="tls" label={t('加密方式')}>
  {field => <SimpleSelect {...field} value={String(field.value ?? '')} options={options} />}
</AppControllerField>
```

## 非原生控件的声明式字段

```tsx
import { AppSelectField, AppSwitchField, AppCheckboxField } from '@unicore/form/fields';

<AppSelectField name="notify_mode" label={t('通知方式')} options={[{ value: 'silent', label: notifyModes.silent }]} />
<AppSwitchField name="path_style" label={t('S3 路径式寻址')} />
<AppCheckboxField name="reset_database" label={t('我已备份，确认清空目标数据库并初始化')} />
```

三者都经 `AppControllerField` 接 Radix 原语，并将 `id/name/ref/onBlur/disabled/aria-invalid/aria-describedby` 传到实际可聚焦控件；布尔字段将 `value` 映射为 `checked`，不把未知值直接传给原语。自定义 render-prop 同样须保留这些属性，不能只接 `value/onChange`，否则标签、错误关联、touched 状态与首错聚焦会断开。`aria-describedby` 关联 hint 与当前错误行；字段错误就地显示，不复制到全局摘要。选项 label 是目录 key（`SimpleSelect` 内部翻译），模块级常量用 `defineMessages` 登记。

## 构建

`pnpm --filter @unicore/form build` 产出 `dist/`（ESM + d.ts）。`react-hook-form`/`zod` 为 peerDependencies。

## 交互基线

`useAppForm` 默认 `mode/reValidateMode=onBlur`；提交仍验证全部字段。`AppField` 为 Input/Textarea 注入浮动标签，常驻 hint 和当前错误共同关联 `aria-describedby`；没有显式 hint 时可从契约和原生长度要求生成填写提示。`AppForm requiredMode="optional"` 适合大部分字段必填的流程，否则标记必填星号。`AppOTPField` 提供六格验证码与原生粘贴/系统自动填充。非原生选择使用 `AppSelectField`，少于 5 项平铺单选。完整语义与限制见[表单交互规范](../../docs/product/form-interaction.md)。

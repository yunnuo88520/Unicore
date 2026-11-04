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

- `AppForm` 自动内嵌 `FormSummary` 错误摘要盒，`noValidate` + `aria-busy`；
- `AppField` 注入 `register()`、`aria-invalid`、`aria-describedby` 与 `role="alert"` 错误行；`label`/`hint` 收 `ReactNode`，翻译由调用方完成；
- 错误消息（契约校验与服务端 `AppError.fields`）作为目录 key 走宿主 i18n，组件内经翻译桩渲染；
- 服务端错误聚焦只作用于本表单：`AppForm` 将自身元素登记为聚焦作用域，多表单页面不会误焦到别的表单（即使 `applyServerError` 在 submit 之外调用）。

## 非原生控件

`AppControllerField` 用 render-prop 接 Radix 控件：

```tsx
<AppControllerField name="tls" label={t('加密方式')}>
  {field => <SimpleSelect value={String(field.value)} onChange={field.onChange} options={…} />}
</AppControllerField>
```

## 构建

`pnpm --filter @unicore/form build` 产出 `dist/`（ESM + d.ts）。`react-hook-form`/`zod` 为 peerDependencies。

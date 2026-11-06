// Author: yunnuo <ymz@ebox.vip>
// Description: React Hook Form layer bound to contract schemas: pending, server field errors, first-error focus.
import { t, useLocale } from '@unicore/ui/i18n';
import { cloneElement, isValidElement, useId, useMemo, useState, type ReactElement, type ReactNode, type InputHTMLAttributes } from 'react';
import { useForm, FormProvider, useFormContext, Controller, type DefaultValues, type FieldValues, type RegisterOptions, type Resolver, type UseFormReturn, type Path } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { AppError, constraintsToZod, type SchemaName } from '@unicore/sdk';
import { cn } from '@unicore/ui/cn';

type AppFormOptions<T extends FieldValues> = {
  schema?: SchemaName;
  defaultValues: T;
  onSubmit: (values: T) => void | Promise<void>;
};
export type AppForm<T extends FieldValues> = UseFormReturn<T> & {
  /** Submit handler; focuses the first invalid field automatically. */
  submit: (event?: React.BaseSyntheticEvent) => Promise<void>;
  /** Merge server-side AppError field errors and focus the first offending control. */
  applyServerError: (error: unknown) => void;
  serverError: AppError | null;
  /** @internal Rendered form element; AppForm registers it so focus never escapes this form. */
  focusScope: { current: HTMLFormElement | null };
};

export function useAppForm<T extends FieldValues>({ schema, defaultValues, onSubmit }: AppFormOptions<T>): AppForm<T> {
  const [serverError, setServerError] = useState<AppError | null>(null);
  // Error focus stays inside this form; a document-wide query would hit sibling forms.
  const scope = { current: null as HTMLFormElement | null };
  const resolver = useMemo(() => (schema ? (zodResolver(constraintsToZod(schema) as never) as Resolver<T>) : undefined), [schema]);
  const form = useForm<T, never, T>({ resolver, defaultValues: defaultValues as DefaultValues<T>, mode: 'onSubmit' });
  const submit: AppForm<T>['submit'] = event => form.handleSubmit(async values => { setServerError(null); await onSubmit(values); })(event);
  function applyServerError(error: unknown) {
    if (!(error instanceof AppError)) return;
    setServerError(error);
    const fields = error.fields ?? {};
    for (const [name, message] of Object.entries(fields)) {
      if (name === '$form' || name === '') continue;
      form.setError(name as Path<T>, { type: 'server', message });
    }
    if (fields.$form || fields['']) form.setError('root', { type: 'server', message: fields.$form ?? fields[''] });
    queueMicrotask(() => {
      const controls = Array.from((scope.current ?? document).querySelectorAll<HTMLElement>('[name]'));
      const target = controls.find(element => Object.hasOwn(fields, element.getAttribute('name') ?? ''));
      target?.focus();
    });
  }
  return Object.assign(form, { submit, applyServerError, serverError, focusScope: scope }) as AppForm<T>;
}

export function AppForm<T extends FieldValues>({ form, className, children, ...props }: { form: AppForm<T>; className?: string; children: ReactNode } & Omit<React.FormHTMLAttributes<HTMLFormElement>, 'onSubmit' | 'children'>) {
  useLocale();
  return <FormProvider {...form}>
    <form {...props} ref={element => { form.focusScope.current = element; }} className={className} noValidate aria-busy={form.formState.isSubmitting} onSubmit={event => { event.preventDefault(); void form.submit(event); }}>
      <FormSummary />
      {children}
    </form>
  </FormProvider>;
}

/** Contract-style field wrapper: label, injected registration, aria-invalid and localized error message. */
export function AppField<T extends FieldValues>({ name, label, hint, rules, onFieldChange, children, className }: {
  name: Path<T>;
  label: ReactNode;
  hint?: ReactNode;
  /** Extra react-hook-form registration options (valueAsNumber, validate, blur rules...). */
  rules?: RegisterOptions<T, Path<T>>;
  /** Side effect alongside registration, for pages that reset wizard state on field edits. */
  onFieldChange?: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => void;
  children: ReactElement<InputHTMLAttributes<HTMLInputElement>>;
  className?: string;
}) {
  useLocale();
  const { register, formState } = useFormContext<T>();
  const id = useId();
  const message = formState.errors[name]?.message as string | undefined;
  const registration = register(name, rules);
  return <div className={cn('flex flex-col gap-1.5', className)}>
    <label htmlFor={id} className="text-sm font-medium text-ink">{label}</label>
    {hint && <p className="text-xs text-muted">{hint}</p>}
    {isValidElement(children) ? cloneElement(children, {
      id,
      name: registration.name,
      onChange: event => { registration.onChange(event); onFieldChange?.(event); },
      onBlur: registration.onBlur,
      ref: registration.ref,
      'aria-invalid': !!message,
      'aria-describedby': message ? `${id}-error` : children.props['aria-describedby'],
    } as InputHTMLAttributes<HTMLInputElement>) : children}
    {message && <p id={`${id}-error`} role="alert" className="text-xs text-danger">{t(message)}</p>}
  </div>;
}

/** Controller-based field for non-native controls (Radix Select, Switch, Checkbox...). */
export function AppControllerField<T extends FieldValues>({ name, label, hint, children, className }: { name: Path<T>; label?: ReactNode; hint?: ReactNode; children: (field: { value: unknown; onChange: (value: unknown) => void; onBlur: () => void; disabled?: boolean }) => ReactNode; className?: string }) {
  useLocale();
  const { control, formState } = useFormContext<T>();
  const message = formState.errors[name]?.message as string | undefined;
  return <Controller
    control={control}
    name={name}
    render={({ field, fieldState }) => <div className={cn('flex flex-col gap-1.5', className)}>
      {label && <span className="text-sm font-medium text-ink">{label}</span>}
      {hint && <p className="text-xs text-muted">{hint}</p>}
      {children({ value: field.value, onChange: field.onChange, onBlur: field.onBlur, disabled: field.disabled })}
      {(message ?? fieldState.error?.message) && <p role="alert" className="text-xs text-danger">{t((message ?? fieldState.error?.message) as string)}</p>}
    </div>}
  />;
}

/** Shared error summary listing every field message, mirroring the legacy form error box. */
export function FormSummary() {
  useLocale();
  const { formState } = useFormContext();
  const messages: string[] = [];
  if (formState.errors.root?.message) messages.push(formState.errors.root.message as string);
  for (const [name, error] of Object.entries(formState.errors)) {
    if (name === 'root' || !error || typeof error !== 'object' || !('message' in error)) continue;
    messages.push(String(error.message));
  }
  if (!messages.length) return null;
  return <div role="alert" aria-label={t('表单校验')} tabIndex={-1} className="mb-3 rounded-md border border-danger-line bg-danger-soft px-3 py-2 text-sm text-danger">
    <strong className="block font-medium">{t('请检查表单输入')}</strong>
    <p>{messages.map(message => t(message)).join('; ')}</p>
  </div>;
}

/** Readonly display row for detail panels. */
export function StaticField({ label, children }: { label: ReactNode; children: ReactNode }) {
  useLocale();
  return <div className="flex flex-col gap-1">
    <span className="text-xs text-muted">{label}</span>
    <span className="text-sm text-ink">{children}</span>
  </div>;
}

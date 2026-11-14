// Author: yunnuo <ymz@ebox.vip>
// Description: React Hook Form layer bound to contract schemas: pending, server field errors, first-error focus.
import { t, useLocale } from '@unicore/ui/i18n';
import { cloneElement, createContext, isValidElement, useContext, useId, useMemo, useRef, useState, type ReactElement, type ReactNode, type InputHTMLAttributes } from 'react';
import { useForm, FormProvider, useFormContext, Controller, type DefaultValues, type FieldValues, type RegisterOptions, type Resolver, type UseFormReturn, type Path } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { AppError, constraints, constraintsToZod, type SchemaName } from '@unicore/sdk';
import { cn } from '@unicore/ui/cn';
import { Input, Textarea } from '@unicore/ui';

type Constraint = { $ref?: string; type?: string; properties?: Record<string, Constraint>; required?: readonly string[]; minLength?: number; maxLength?: number; minimum?: number; maximum?: number; format?: string };
type FieldDesign = { schema?: SchemaName; requiredMode: 'required' | 'optional' };
const FieldDesignContext = createContext<FieldDesign>({ requiredMode: 'required' });
function fieldConstraint(schema: SchemaName | undefined, name: string) {
  let node: Constraint | undefined = schema ? (constraints as Record<string, Constraint>)[schema] : undefined;
  let required = false;
  for (const part of name.split('.')) {
    if (node?.$ref) node = (constraints as Record<string, Constraint>)[node.$ref.split('/').at(-1)!];
    required = node?.required?.includes(part) ?? false;
    node = node?.properties?.[part];
  }
  return { ...node, required };
}
function FieldMark({ required, mode }: { required: boolean; mode: FieldDesign['requiredMode'] }) {
  return mode === 'optional' ? !required && <span className="ms-1 text-xs font-normal text-muted">{t('（选填）')}</span> : required && <span aria-hidden="true" className="ms-1 text-danger">*</span>;
}

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
  fieldDesign: FieldDesign;
};

export function useAppForm<T extends FieldValues>({ schema, defaultValues, onSubmit }: AppFormOptions<T>): AppForm<T> {
  const [serverError, setServerError] = useState<AppError | null>(null);
  // Error focus stays inside this form; a document-wide query would hit sibling forms.
  const scope = useRef<HTMLFormElement | null>(null);
  const resolver = useMemo(() => (schema ? (zodResolver(constraintsToZod(schema) as never) as Resolver<T>) : undefined), [schema]);
  const form = useForm<T, never, T>({ resolver, defaultValues: defaultValues as DefaultValues<T>, mode: 'onBlur', reValidateMode: 'onBlur' });
  const requiredCount = Object.keys(defaultValues).filter(name => fieldConstraint(schema, name).required).length;
  const fieldDesign: FieldDesign = { schema, requiredMode: requiredCount > Object.keys(defaultValues).length / 2 ? 'optional' : 'required' };
  const submit: AppForm<T>['submit'] = event => form.handleSubmit(async values => { setServerError(null); await onSubmit(values); })(event);
  function applyServerError(error: unknown) {
    if (!(error instanceof AppError)) return;
    setServerError(error);
    const fields = error.fields ?? {};
    // Field-level messages render inline next to their controls; messages without field targets
    // surface through the global mutation toast, so the form never repeats them.
    for (const [name, message] of Object.entries(fields)) {
      if (name === '$form' || name === '') continue;
      form.setError(name as Path<T>, { type: 'server', message });
    }
    if (fields.$form || fields['']) form.setError('root', { type: 'server', message: fields.$form ?? fields[''] });
    queueMicrotask(() => {
      const controls = Array.from(scope.current?.querySelectorAll<HTMLElement>('[name]') ?? []);
      const target = controls.find(element => Object.hasOwn(fields, element.getAttribute('name') ?? ''));
      target?.focus();
    });
  }
  return Object.assign(form, { submit, applyServerError, serverError, focusScope: scope, fieldDesign }) as AppForm<T>;
}

export function AppForm<T extends FieldValues>({ form, className, children, requiredMode, ...props }: { form: AppForm<T>; className?: string; children: ReactNode; requiredMode?: FieldDesign['requiredMode'] } & Omit<React.FormHTMLAttributes<HTMLFormElement>, 'onSubmit' | 'children'>) {
  useLocale();
  const rootMessage = form.formState.errors.root?.message as string | undefined;
  // Banner only for errors WITHOUT field targets: field-carrying errors render
  // inline next to their controls (applyServerError maps them), and rendering
  // the message twice breaks strict-mode queries.
  const nonField = form.serverError != null && Object.keys(form.serverError.fields ?? {}).length === 0;
  const serverMessage = rootMessage ?? (nonField ? form.serverError?.message ?? null : null);
  return <FormProvider {...form}><FieldDesignContext.Provider value={{ ...form.fieldDesign, requiredMode: requiredMode ?? form.fieldDesign.requiredMode }}>
    <form {...props} ref={element => { form.focusScope.current = element; }} className={className} noValidate aria-busy={form.formState.isSubmitting} onSubmit={event => {
      event.preventDefault();
      // Nested editors render their own <form>s (link dialogs and similar);
      // their submit events bubble through the React tree — only submit when
      // this form is the event's own target.
      if (event.target !== event.currentTarget) return;
      void form.submit(event);
    }}>
      <FormSummary />
      {/* Non-field server errors arrive through the `form` prop (re-attached every render);
          RHF's FormProvider context does not carry custom properties, so read it here. */}
      {serverMessage && <p role="alert" className="mb-3 rounded-md border border-danger-line bg-danger-soft px-3 py-2 text-sm text-danger">{t(serverMessage)}</p>}
      {children}
    </form>
  </FieldDesignContext.Provider></FormProvider>;
}

/** Contract-style field wrapper: label, injected registration, aria-invalid and localized error message. */
export function AppField<T extends FieldValues>({ name, label, hint, rules, onFieldChange, children, className, required: requiredProp }: {
  name: Path<T>;
  label: ReactNode;
  hint?: ReactNode;
  /** Extra react-hook-form registration options (valueAsNumber, validate, blur rules...). */
  rules?: RegisterOptions<T, Path<T>>;
  /** Side effect alongside registration, for pages that reset wizard state on field edits. */
  onFieldChange?: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => void;
  children: ReactElement<InputHTMLAttributes<HTMLInputElement>>;
  className?: string;
  required?: boolean;
}) {
  useLocale();
  const { register, getFieldState, getValues, setValue, clearErrors, formState } = useFormContext<T>();
  const id = useId();
  const message = getFieldState(name, formState).error?.message;
  const registration = register(name, rules);
  const design = useContext(FieldDesignContext);
  const constraint = fieldConstraint(design.schema, name);
  const required = requiredProp ?? (!!rules?.required || children.props.required || constraint.required);
  const floating = children.type === Input || children.type === Textarea;
  const mark = <FieldMark required={required} mode={design.requiredMode} />;
  const min = children.props.minLength ?? constraint.minLength;
  const max = children.props.maxLength ?? constraint.maxLength;
  const help = hint ?? (children.props.type === 'email' || constraint.format === 'email' ? t('填写完整邮箱地址，例如 name@example.com') : min && max ? t('填写 {{min}} 至 {{max}} 个字符', { min, max }) : min ? t('至少填写 {{count}} 个字符', { count: min }) : max ? t('最多填写 {{count}} 个字符', { count: max }) : undefined);
  return <div data-invalid={!!message || undefined} className={cn('flex min-w-0 flex-col gap-2', className)}>
    {!floating && <label htmlFor={id} className="text-sm font-medium text-ink">{label}{mark}</label>}
    {isValidElement(children) ? cloneElement(children, {
      id,
      ...(floating ? { label, labelSuffix: mark } : {}),
      name: registration.name,
      'aria-required': required || undefined,
      'aria-label': children.props['aria-label'] ?? (typeof label === 'string' ? label : undefined),
      onChange: event => { if (getFieldState(name).error?.type === 'server') clearErrors(name); registration.onChange(event); children.props.onChange?.(event); onFieldChange?.(event); },
      onBlur: event => {
        // A client blur cannot resolve a server rejection of an unchanged value.
        // Retaining it also prevents links below the error moving during a click.
        if (getFieldState(name).error?.type === 'server') setValue(name, getValues(name), { shouldTouch: true });
        else registration.onBlur(event);
        children.props.onBlur?.(event);
      },
      ref: registration.ref,
      'aria-invalid': !!message,
      'aria-describedby': [help ? `${id}-hint` : '', message ? `${id}-error` : '', children.props['aria-describedby']].filter(Boolean).join(' ') || undefined,
    } as InputHTMLAttributes<HTMLInputElement>) : children}
    {message && <p id={`${id}-error`} role="alert" className="text-xs text-danger">{t(message)}</p>}
    {help && <p id={`${id}-hint`} className="text-xs leading-5 text-muted">{help}</p>}
  </div>;
}

/** Controller-based field for non-native controls (Radix Select, Switch, Checkbox...). */
export type ControlledField = {
  value: unknown;
  onChange: (value: unknown) => void;
  onBlur: () => void;
  disabled?: boolean;
  name: string;
  id: string;
  ref: (element: unknown) => void;
  'aria-invalid': boolean;
  'aria-describedby'?: string;
  'aria-labelledby'?: string;
};

export function AppControllerField<T extends FieldValues>({ name, label, hint, children, className, required: requiredProp, floating = false }: { name: Path<T>; label?: ReactNode; hint?: ReactNode; children: (field: ControlledField) => ReactNode; className?: string; required?: boolean; floating?: boolean }) {
  useLocale();
  const { control, getFieldState, getValues, setValue, clearErrors } = useFormContext<T>();
  const id = useId();
  const design = useContext(FieldDesignContext);
  const required = requiredProp ?? fieldConstraint(design.schema, name).required;
  return <Controller
    control={control}
    name={name}
    render={({ field, fieldState }) => <div data-invalid={fieldState.invalid || undefined} className={cn('flex min-w-0 flex-col gap-2', className)}>
      {label && <label htmlFor={id} className={cn('text-sm font-medium text-ink', floating && 'sr-only')}><span id={`${id}-label`}>{label}</span><FieldMark required={required} mode={design.requiredMode} /></label>}
      {children({ ...field, id,
        onChange: value => { if (getFieldState(name).error?.type === 'server') clearErrors(name); field.onChange(value); },
        onBlur: () => { if (getFieldState(name).error?.type === 'server') setValue(name, getValues(name), { shouldTouch: true }); else field.onBlur(); },
        'aria-labelledby': label ? `${id}-label` : undefined, 'aria-invalid': fieldState.invalid, 'aria-describedby': [hint ? `${id}-hint` : '', fieldState.error ? `${id}-error` : ''].filter(Boolean).join(' ') || undefined })}
      {fieldState.error?.message && <p id={`${id}-error`} role="alert" className="text-xs text-danger">{t(fieldState.error.message)}</p>}
      {hint && <p id={`${id}-hint`} className="text-xs leading-5 text-muted">{hint}</p>}
    </div>}
  />;
}

/** Form-wide error banner: root/server messages only. Field errors render inline in their AppField,
 *  so the banner never duplicates them and never follows the user across wizard steps. */
export function FormSummary() {
  useLocale();
  const form = useFormContext();
  const root = form.formState.errors.root?.message as string | undefined;
  // Non-field server errors (no `fields` targets) would otherwise render nowhere:
  // the form defers them to the global toast, which skips mutations that carry a
  // page-level onError. useAppForm re-attaches the current serverError on every
  // render, so surface it here and keep every failed submit visible.
  const server = (form as unknown as { serverError?: AppError | null }).serverError ?? null;
  const message = root ?? server?.message;
  if (!message) return null;
  return <div role="alert" aria-label={t('表单校验')} tabIndex={-1} className="mb-3 rounded-md border border-danger-line bg-danger-soft px-3 py-2 text-sm text-danger">
    <strong className="block font-medium">{t('请检查表单输入')}</strong>
    <p>{t(message)}</p>
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

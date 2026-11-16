// Author: yunnuo <ymz@ebox.vip>
// Description: Declarative contract fields for non-native controls; pages stop hand-wiring RHF Controllers.
import type { ReactNode } from 'react';
import type { FieldValues, Path } from 'react-hook-form';
import { AppControllerField } from './form';

export { AppControllerField };
import { Checkbox, SimpleSelect, Switch } from '@unicore/ui';
import { InputOTP, type InputOTPProps } from '@unicore/ui/controls';

type FieldShell<T extends FieldValues> = {
  name: Path<T>;
  label?: ReactNode;
  hint?: ReactNode;
  disabled?: boolean;
  className?: string;
  required?: boolean;
};

/** One native input supplies six visual slots, paste and browser SMS autofill without six competing tab stops. */
export function AppOTPField<T extends FieldValues>({ name, label, hint, disabled, className, required = true, ...props }: FieldShell<T> & Omit<InputOTPProps, 'value' | 'onValueChange' | 'label' | 'name' | 'ref'>) {
  return <AppControllerField name={name} label={label} hint={hint} required={required} className={className}>
    {({ value, onChange, ...field }) => <InputOTP {...props} {...field} label={typeof label === 'string' ? label : ''} value={String(value ?? '')} onValueChange={onChange} disabled={field.disabled || disabled} aria-required={required} />}
  </AppControllerField>;
}

/** Select field over SimpleSelect; option labels are catalog keys translated by the shared primitive. */
export function AppSelectField<T extends FieldValues>({ name, label, hint, options, placeholder, disabled, className, required }: FieldShell<T> & {
  options: readonly { value: string; label: string }[];
  placeholder?: string;
}) {
  return <AppControllerField name={name} label={label} hint={hint} className={className} required={required}>
    {field => <SimpleSelect {...field} value={String(field.value ?? '')} disabled={field.disabled || disabled} options={options} placeholder={placeholder} />}
  </AppControllerField>;
}

/** Boolean field over Switch. */
export function AppSwitchField<T extends FieldValues>({ name, label, hint, disabled, className }: FieldShell<T>) {
  return <AppControllerField name={name} label={label} hint={hint} className={className}>
    {({ value, ...field }) => <Switch {...field} checked={value === true} disabled={field.disabled || disabled} />}
  </AppControllerField>;
}

/** Boolean field over Checkbox; the label becomes the Checkbox child so the control is label-associated. */
export function AppCheckboxField<T extends FieldValues>({ name, label, hint, disabled, className }: FieldShell<T>) {
  return <AppControllerField name={name} hint={hint} className={className}>
    {({ value, ...field }) => <Checkbox {...field} checked={value === true} disabled={field.disabled || disabled}>{label}</Checkbox>}
  </AppControllerField>;
}

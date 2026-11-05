// Author: yunnuo <ymz@ebox.vip>
// Description: Declarative contract fields for non-native controls; pages stop hand-wiring RHF Controllers.
import type { ReactNode } from 'react';
import type { FieldValues, Path } from 'react-hook-form';
import { AppControllerField } from './form';
import { Checkbox, SimpleSelect, Switch } from '@unicore/ui';

type FieldShell<T extends FieldValues> = {
  name: Path<T>;
  label?: ReactNode;
  hint?: ReactNode;
  disabled?: boolean;
  className?: string;
};

/** Select field over SimpleSelect; option labels are catalog keys translated by the shared primitive. */
export function AppSelectField<T extends FieldValues>({ name, label, hint, options, placeholder, disabled, className }: FieldShell<T> & {
  options: readonly { value: string; label: string }[];
  placeholder?: string;
}) {
  return <AppControllerField name={name} label={label} hint={hint} className={className}>
    {field => <SimpleSelect value={String(field.value ?? '')} onChange={value => field.onChange(value)} disabled={field.disabled || disabled} options={options} placeholder={placeholder} />}
  </AppControllerField>;
}

/** Boolean field over Switch. */
export function AppSwitchField<T extends FieldValues>({ name, label, hint, disabled, className }: FieldShell<T>) {
  return <AppControllerField name={name} label={label} hint={hint} className={className}>
    {field => <Switch checked={field.value === true} disabled={field.disabled || disabled} onChange={value => field.onChange(value)} />}
  </AppControllerField>;
}

/** Boolean field over Checkbox. */
export function AppCheckboxField<T extends FieldValues>({ name, label, hint, disabled, className }: FieldShell<T>) {
  return <AppControllerField name={name} label={label} hint={hint} className={className}>
    {field => <Checkbox checked={field.value === true} disabled={field.disabled || disabled} onChange={value => field.onChange(value)} />}
  </AppControllerField>;
}

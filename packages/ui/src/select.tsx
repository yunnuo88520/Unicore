// Author: yunnuo <ymz@ebox.vip>
// Description: Radix select primitives plus a compact SimpleSelect for plain string options.
import { Children, forwardRef, isValidElement, useId, type ReactNode } from 'react';
import * as SelectPrimitive from '@radix-ui/react-select';
import { Check, ChevronDown } from 'lucide-react';
import { cva } from 'class-variance-authority';
import { t, useLocale } from './i18n';
import { cn } from './cn';

import { Combobox } from './controls/combobox';
import { assignRef } from './controls/utils';

export const Select = SelectPrimitive.Root;
export const SelectValue = SelectPrimitive.Value;

// The aria-invalid:* selector reacts to the DOM attribute, mirroring the input control surface.
export const selectTriggerVariants = cva('flex h-9 w-full items-center justify-between gap-2 rounded-lg border border-transparent bg-field px-3 text-base text-ink transition-colors outline-none hover:border-line-strong focus-visible:border-focus focus-visible:ring-2 focus-visible:ring-focus disabled:cursor-not-allowed disabled:opacity-55 aria-invalid:border-danger data-[placeholder]:text-subtle');

export const SelectTrigger = forwardRef<HTMLButtonElement, React.ComponentPropsWithoutRef<typeof SelectPrimitive.Trigger>>(function SelectTrigger({ className, children, ...props }, ref) {
  return <SelectPrimitive.Trigger ref={ref}
    className={cn(selectTriggerVariants(), className)}
    {...props}>
    {children}
    <SelectPrimitive.Icon asChild><ChevronDown size={15} className="opacity-60" aria-hidden="true" /></SelectPrimitive.Icon>
  </SelectPrimitive.Trigger>;
});

export const SelectContent = forwardRef<HTMLDivElement, React.ComponentPropsWithoutRef<typeof SelectPrimitive.Content>>(function SelectContent({ className, children, position = 'popper', ...props }, ref) {
  return <SelectPrimitive.Portal>
    <SelectPrimitive.Content ref={ref} position={position} sideOffset={4}
      className={cn('z-50 max-h-[min(18rem,var(--radix-select-content-available-height))] min-w-[var(--radix-select-trigger-width)] overflow-hidden rounded-2xl border border-line bg-surface p-2 text-base shadow-floating', className)} {...props}>
      <SelectPrimitive.Viewport className="max-h-[min(18rem,var(--radix-select-content-available-height))] overscroll-contain">{children}</SelectPrimitive.Viewport>
    </SelectPrimitive.Content>
  </SelectPrimitive.Portal>;
});

export const SelectItem = forwardRef<HTMLDivElement, React.ComponentPropsWithoutRef<typeof SelectPrimitive.Item>>(function SelectItem({ className, children, ...props }, ref) {
  return <SelectPrimitive.Item ref={ref} className={cn('relative flex min-h-9 cursor-pointer select-none items-center rounded-lg py-2 ps-8 pe-3 text-ink outline-none data-[highlighted]:bg-surface-hover data-[disabled]:pointer-events-none data-[disabled]:opacity-50', className)} {...props}>
    <span className="absolute start-2 flex size-4 items-center justify-center"><SelectPrimitive.ItemIndicator><Check size={13} /></SelectPrimitive.ItemIndicator></span>
    <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
  </SelectPrimitive.Item>;
});

type SimpleSelectProps = Omit<React.ComponentPropsWithoutRef<typeof SelectPrimitive.Trigger>, 'value' | 'onChange' | 'onBlur'> & {
  label?: string; value: string; onChange: (value: string) => void; options: readonly { value: string; label: string; disabled?: boolean }[]; placeholder?: string; name?: string;
  /** Compact filters may explicitly retain a dropdown; form choices default to count-based presentation. */
  presentation?: 'auto' | 'dropdown' | 'combobox';
  onBlur?: React.FocusEventHandler<HTMLElement>;
};

/** Converts existing declarative option data while the rendered control follows the choice-count rule. */
export function selectOptions(children: ReactNode): { value: string; label: string; disabled?: boolean }[] {
  const result: { value: string; label: string; disabled?: boolean }[] = [];
  const text = (node: ReactNode): string => Children.toArray(node).map(child => isValidElement<{ children?: ReactNode }>(child) ? text(child.props.children) : String(child)).join('');
  Children.forEach(children, child => {
    if (!isValidElement<{ value?: unknown; disabled?: boolean; children?: ReactNode }>(child)) return;
    if (child.type === 'option') result.push({ value: String(child.props.value ?? text(child.props.children)), label: text(child.props.children), disabled: child.props.disabled });
    else result.push(...selectOptions(child.props.children));
  });
  return result;
}

export const SimpleSelect = forwardRef<HTMLElement, SimpleSelectProps>(function SimpleSelect({ label, value, onChange, options, placeholder, disabled, className, id, name, presentation = 'auto', ...props }, ref) {
  useLocale();
  const emptyValue = useId();
  const dropdownValue = value === '' && options.some(option => option.value === '') ? emptyValue : value;
  const accessibleLabel = props['aria-label'] ?? (label ? t(label) : undefined);
  // Form choices stay dropdowns regardless of the option count; a handful of
  // exclusive toggles belongs in an explicit RadioGroup, not a select surprise.
  if (presentation === 'combobox' || presentation === 'auto' && options.length > 20) return <Combobox ref={node => assignRef(ref, node)} id={id} name={name} label={accessibleLabel ?? ''} value={value} onValueChange={onChange} options={options} disabled={disabled} className={className} aria-invalid={props['aria-invalid']} aria-describedby={props['aria-describedby']} onBlur={props.onBlur} />;
  return <Select value={dropdownValue} onValueChange={next => onChange(next === emptyValue ? '' : next)} disabled={disabled} name={name}>
    <SelectTrigger {...props} ref={node => assignRef(ref, node)} name={name} id={id} aria-label={accessibleLabel} className={className}>
      <SelectValue placeholder={placeholder ? t(placeholder) : undefined} />
    </SelectTrigger>
    <SelectContent>
      {options.map(option => <SelectItem key={option.value} value={option.value === '' ? emptyValue : option.value} disabled={option.disabled}>{t(option.label)}</SelectItem>)}
    </SelectContent>
  </Select>;
});

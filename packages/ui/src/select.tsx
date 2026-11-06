// Author: yunnuo <ymz@ebox.vip>
// Description: Radix select primitives plus a compact SimpleSelect for plain string options.
import { forwardRef } from 'react';
import * as SelectPrimitive from '@radix-ui/react-select';
import { Check, ChevronDown } from 'lucide-react';
import { cva } from 'class-variance-authority';
import { t, useLocale } from './i18n';
import { cn } from './cn';

export const Select = SelectPrimitive.Root;
export const SelectValue = SelectPrimitive.Value;

// The aria-invalid:* selector reacts to the DOM attribute, mirroring the input control surface.
export const selectTriggerVariants = cva('flex h-9 w-full items-center justify-between gap-2 rounded-md border border-line bg-surface px-3 text-base text-ink shadow-tint outline-none focus-visible:border-focus focus-visible:ring-2 focus-visible:ring-focus disabled:cursor-not-allowed disabled:opacity-55 aria-invalid:border-danger data-[placeholder]:text-subtle');

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
      className={cn('z-50 max-h-72 min-w-[var(--radix-select-trigger-width)] overflow-y-auto rounded-lg border border-line bg-surface p-1 text-base shadow-modal', className)} {...props}>
      <SelectPrimitive.Viewport>{children}</SelectPrimitive.Viewport>
    </SelectPrimitive.Content>
  </SelectPrimitive.Portal>;
});

export const SelectItem = forwardRef<HTMLDivElement, React.ComponentPropsWithoutRef<typeof SelectPrimitive.Item>>(function SelectItem({ className, children, ...props }, ref) {
  return <SelectPrimitive.Item ref={ref} className={cn('relative flex cursor-pointer select-none items-center rounded-sm py-1.5 ps-8 pe-3 text-ink outline-none data-[highlighted]:bg-surface-alt data-[disabled]:pointer-events-none data-[disabled]:opacity-50', className)} {...props}>
    <span className="absolute start-2 flex size-4 items-center justify-center"><SelectPrimitive.ItemIndicator><Check size={13} /></SelectPrimitive.ItemIndicator></span>
    <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
  </SelectPrimitive.Item>;
});

export function SimpleSelect({ label, value, onChange, options, placeholder, disabled, className, id }: {
  label?: string; value: string; onChange: (value: string) => void; options: readonly { value: string; label: string }[]; placeholder?: string; disabled?: boolean; className?: string; id?: string;
}) {
  useLocale();
  return <Select value={value} onValueChange={onChange} disabled={disabled}>
    <SelectTrigger id={id} aria-label={label ? t(label) : undefined} className={className}>
      <SelectValue placeholder={placeholder ? t(placeholder) : undefined} />
    </SelectTrigger>
    <SelectContent>
      {options.map(option => <SelectItem key={option.value} value={option.value}>{t(option.label)}</SelectItem>)}
    </SelectContent>
  </Select>;
}

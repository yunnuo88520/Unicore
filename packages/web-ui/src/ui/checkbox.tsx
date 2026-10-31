// Author: yunnuo <ymz@ebox.vip>
// Description: Radix checkbox with an optional inline label.
import { forwardRef, useId, type ReactNode } from 'react';
import * as CheckboxPrimitive from '@radix-ui/react-checkbox';
import { Check } from 'lucide-react';
import { cn } from '../lib/cn';

export const Checkbox = forwardRef<HTMLButtonElement, { id?: string; checked: boolean | 'indeterminate'; onChange: (value: boolean) => void; disabled?: boolean; children?: ReactNode; className?: string }>(function Checkbox({ id, checked, onChange, disabled, children, className }, ref) {
  const generated = useId();
  const boxId = id ?? generated;
  return <span className={cn('inline-flex items-center gap-2', className)}>
    <CheckboxPrimitive.Root ref={ref} id={boxId} checked={checked} disabled={disabled} onCheckedChange={value => onChange(value === true)}
      className="peer flex size-4 shrink-0 items-center justify-center rounded-xs border border-line bg-surface outline-none transition-colors focus-visible:ring-2 focus-visible:ring-focus disabled:cursor-not-allowed disabled:opacity-55 data-[state=checked]:border-button data-[state=checked]:bg-button data-[state=indeterminate]:border-button data-[state=indeterminate]:bg-button">
      <CheckboxPrimitive.Indicator className="text-on-primary">
        {checked === 'indeterminate'
          ? <span aria-hidden="true" className="block h-0.5 w-2 rounded-full bg-on-primary" />
          : <Check size={12} strokeWidth={2.5} aria-hidden="true" />}
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
    {children && <label htmlFor={boxId} className="text-sm text-ink select-none">{children}</label>}
  </span>;
});

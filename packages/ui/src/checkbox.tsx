// Author: yunnuo <ymz@ebox.vip>
// Description: Radix checkbox with an optional inline label.
import { forwardRef, useId, type ReactNode } from 'react';
import * as CheckboxPrimitive from '@radix-ui/react-checkbox';
import { Check } from 'lucide-react';
import { cn } from './cn';

type CheckboxProps = Omit<React.ComponentPropsWithoutRef<typeof CheckboxPrimitive.Root>, 'checked' | 'onChange' | 'onCheckedChange' | 'children'> & { checked: boolean | 'indeterminate'; onChange: (value: boolean) => void; children?: ReactNode };

export const Checkbox = forwardRef<HTMLButtonElement, CheckboxProps>(function Checkbox({ id, checked, onChange, disabled, children, className, ...props }, ref) {
  const generated = useId();
  const boxId = id ?? generated;
  return <span className={cn('inline-flex items-center gap-2', className)}>
    <CheckboxPrimitive.Root {...props} ref={ref} id={boxId} checked={checked} disabled={disabled} onCheckedChange={value => onChange(value === true)}
      className="peer flex size-4 shrink-0 items-center justify-center rounded-sm border border-line-strong bg-field outline-none transition-colors hover:border-muted focus-visible:ring-2 focus-visible:ring-focus aria-invalid:border-danger disabled:cursor-not-allowed disabled:opacity-55 data-[state=checked]:border-button data-[state=checked]:bg-button data-[state=indeterminate]:border-button data-[state=indeterminate]:bg-button">
      <CheckboxPrimitive.Indicator className="text-on-primary">
        {checked === 'indeterminate'
          ? <span aria-hidden="true" className="block h-0.5 w-2 rounded-full bg-on-primary" />
          : <Check size={12} strokeWidth={2.5} aria-hidden="true" />}
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
    {children && <label htmlFor={boxId} className="text-sm text-ink select-none">{children}</label>}
  </span>;
});

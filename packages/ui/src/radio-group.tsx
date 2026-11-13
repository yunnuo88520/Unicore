// Author: yunnuo <ymz@ebox.vip>
// Description: Radio group over the Radix primitive: one required choice out of few, inline pills.
// Use for small exclusive choices in forms; many options belong in Select, booleans in Switch.
import { forwardRef, type ComponentPropsWithoutRef } from 'react';
import * as RadioGroupPrimitive from '@radix-ui/react-radio-group';
import { cn } from './cn';

export const RadioGroup = forwardRef<HTMLDivElement, ComponentPropsWithoutRef<typeof RadioGroupPrimitive.Root> & { label?: string }>(function RadioGroup({ className, label, ...props }, ref) {
  return <RadioGroupPrimitive.Root ref={ref} aria-label={label} className={cn('flex flex-wrap items-center gap-2', className)} {...props} />;
});

export const RadioGroupItem = forwardRef<HTMLButtonElement, ComponentPropsWithoutRef<typeof RadioGroupPrimitive.Item> & { itemLabel: string; name?: string }>(function RadioGroupItem({ className, itemLabel, children, ...props }, ref) {
  return <RadioGroupPrimitive.Item ref={ref} aria-label={itemLabel}
    className={cn('relative flex min-h-9 items-center gap-2 rounded-lg border border-line bg-surface px-3 text-sm text-ink shadow-tint outline-none transition-colors focus-visible:ring-2 focus-visible:ring-focus hover:border-[var(--primary-border)] data-[state=checked]:border-primary-line data-[state=checked]:bg-primary-soft data-[state=checked]:text-accent disabled:cursor-not-allowed disabled:opacity-55', className)} {...props}>
    <span className="relative flex size-3.5 shrink-0 items-center justify-center" aria-hidden="true">
      <span className="absolute size-3.5 rounded-full border border-line" />
      <RadioGroupPrimitive.Indicator className="size-2 rounded-full bg-accent" />
    </span>
    {children}
  </RadioGroupPrimitive.Item>;
});

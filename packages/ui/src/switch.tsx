// Author: yunnuo <ymz@ebox.vip>
// Description: Radix switch with the legacy boolean API and an audible on/off state text.
import { forwardRef, useId, type ReactNode } from 'react';
import * as SwitchPrimitive from '@radix-ui/react-switch';
import { t, useLocale } from './i18n';
import { cn } from './cn';

type SwitchProps = Omit<React.ComponentPropsWithoutRef<typeof SwitchPrimitive.Root>, 'checked' | 'onChange' | 'onCheckedChange' | 'children'> & { checked: boolean; onChange: (value: boolean) => void; children?: ReactNode };

export const Switch = forwardRef<HTMLButtonElement, SwitchProps>(function Switch({ id, checked, onChange, disabled = false, children, className, ...props }, ref) {
  useLocale();
  const generated = useId();
  const switchId = id ?? generated;
  return <span className={cn('inline-flex items-center gap-2', className)}>
    <SwitchPrimitive.Root {...props} ref={ref} id={switchId} checked={checked} disabled={disabled} onCheckedChange={onChange} aria-label={props['aria-label'] ?? (typeof children === 'string' ? children : undefined)}
      className="peer inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border border-line bg-surface-alt transition-colors outline-none focus-visible:ring-2 focus-visible:ring-focus disabled:cursor-not-allowed disabled:opacity-55 data-[state=checked]:bg-button">
      <SwitchPrimitive.Thumb className="pointer-events-none block size-3.5 translate-x-0.5 rounded-full bg-surface shadow transition-transform data-[state=checked]:translate-x-[18px]" />
    </SwitchPrimitive.Root>
    <span aria-hidden="true" className="text-xs text-muted">{checked ? t('已开启') : t('已关闭')}</span>
  </span>;
});

export { SwitchPrimitive };

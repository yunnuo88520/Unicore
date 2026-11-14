// Author: yunnuo <ymz@ebox.vip>
// Description: Shared row chrome for the account settings modal, ported from the eboxui settings modal recipe:
// every group is a card whose rows divide themselves with bottom borders that stop short of the card's left padding.
import { useRef, useState, type ComponentProps, type ComponentType, type ReactNode } from 'react';
import { Input } from '@unicore/ui';
import { cn } from '@unicore/ui/cn';

/** Grouped card — rows divide themselves with borders that respect the 12px card padding. */
export function SettingsCard({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn('flex w-full flex-col rounded-2xl bg-surface-soft ps-3', className)}>{children}</div>;
}

/** Muted small section heading above a card. */
export function SettingsSectionLabel({ className, children }: { className?: string; children: ReactNode }) {
  return <p className={cn('w-full px-3 text-xs font-medium text-muted', className)}>{children}</p>;
}

/** One label + control row. Rows separate themselves; the last has no border. */
export function SettingsRow({ label, description, children, className }: {
  label: ReactNode; description?: ReactNode; children?: ReactNode; className?: string;
}) {
  return <div className={cn('flex min-h-[52px] w-full items-center justify-between gap-4 py-2.5 pe-2.5 border-b border-line last:border-b-0', className)}>
    <div className="flex min-w-0 flex-col">
      <div className="text-sm text-ink">{label}</div>
      {description && <div className="text-xs text-muted">{description}</div>}
    </div>
    {children}
  </div>;
}

type FieldIcon = ComponentType<{ className?: string; 'aria-hidden'?: boolean | 'true' | 'false' }>;

/** The grey read-only value field — it presents the stored value instead of taking input. */
export function SettingsValueField({ icon: Icon, children, muted = false, className }: {
  icon?: FieldIcon; children: ReactNode; muted?: boolean; className?: string;
}) {
  return <div className={cn('flex h-8 w-[202px] shrink-0 items-center gap-0.5 rounded-xl bg-surface-alt px-1.5', className)}>
    {Icon && <Icon className="size-5 shrink-0 text-muted" aria-hidden="true" />}
    <span className={cn('min-w-0 flex-1 truncate ps-1 text-sm', muted ? 'text-muted' : 'text-ink')}>{children}</span>
  </div>;
}

/**
 * Design-system Input that commits on Enter / blur: Enter just blurs the
 * field, and blur fires `onSaved` only when the value actually changed since
 * the last commit — so clicking in and out without typing stays silent.
 */
export function SavableInput({ initialValue, onSaved, ...inputProps }: { initialValue: string; onSaved?: (value: string) => void } & Omit<ComponentProps<typeof Input>, 'value' | 'onChange' | 'defaultValue' | 'onBlur'>) {
  const [value, setValue] = useState(initialValue);
  const committed = useRef(initialValue);
  return <Input
    {...inputProps}
    value={value}
    onChange={event => setValue(event.target.value)}
    onKeyDown={event => { if (event.key === 'Enter') (event.target as HTMLElement).blur(); }}
    onBlur={() => {
      const next = value.trim();
      if (next && next !== committed.current) {
        committed.current = next;
        onSaved?.(next);
      } else setValue(committed.current);
    }}
    className={cn('w-[202px] shrink-0', inputProps.className)}
  />;
}

// Author: yunnuo <ymz@ebox.vip>
// Description: Compact metric card for dashboards: label, value, optional detail and one icon tile.
// Icons stay quiet by default; `success` is reserved for statuses that genuinely carry meaning.
import { forwardRef, type HTMLAttributes } from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from './cn';

export type StatCardProps = HTMLAttributes<HTMLElement> & {
  label: React.ReactNode;
  value: React.ReactNode;
  detail?: React.ReactNode;
  icon?: LucideIcon;
  tone?: 'neutral' | 'success';
};

export const StatCard = forwardRef<HTMLElement, StatCardProps>(function StatCard({ label, value, detail, icon: Icon, tone = 'neutral', className, ...props }, ref) {
  return <article ref={ref} className={cn('flex items-start justify-between gap-3 rounded-xl border border-line bg-surface p-4 shadow-card', className)} {...props}>
    <div className="min-w-0">
      <p className="text-xs text-muted">{label}</p>
      <strong className="mt-1 block truncate text-md font-semibold text-ink">{value}</strong>
      {detail && <small className="mt-0.5 block truncate text-2xs text-subtle">{detail}</small>}
    </div>
    {Icon && <span className={cn('flex size-9 shrink-0 items-center justify-center rounded-lg', tone === 'success' ? 'bg-success-soft text-success' : 'bg-surface-alt text-muted')}>
      <Icon size={19} aria-hidden="true" />
    </span>}
  </article>;
});

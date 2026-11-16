// Author: yunnuo <ymz@ebox.vip>
// Description: Compact metric card for dashboards: label, value, optional detail and one icon tile.
// Icons stay quiet by default; `success` is reserved for statuses that genuinely carry meaning.
import { forwardRef, type HTMLAttributes } from 'react';
import type { LucideIcon } from 'lucide-react';
import { cardVariants, type CardProps } from './card';
import { cn } from './cn';

export type StatCardProps = HTMLAttributes<HTMLElement> & {
  label: React.ReactNode;
  value: React.ReactNode;
  detail?: React.ReactNode;
  icon?: LucideIcon;
  tone?: 'neutral' | 'success';
  variant?: CardProps['variant'];
};

export const StatCard = forwardRef<HTMLElement, StatCardProps>(function StatCard({ label, value, detail, icon: Icon, tone = 'neutral', variant, className, ...props }, ref) {
  const soft = variant === 'soft';
  return <article ref={ref} className={cn(cardVariants({ variant }), 'flex items-start justify-between gap-3', soft ? 'min-h-32 flex-col-reverse p-4' : 'p-5', className)} {...props}>
    <div className="min-w-0">
      <p className={cn('text-muted', soft ? 'text-base' : 'text-xs')}>{label}</p>
      <strong className={cn('mt-1 block truncate text-ink', soft ? 'text-xl font-medium tabular-nums' : 'text-md font-semibold')}>{value}</strong>
      {detail && <small className="mt-1 block truncate text-xs text-subtle">{detail}</small>}
    </div>
    {Icon && <span className={cn('flex size-8 shrink-0 items-center justify-center rounded-md', tone === 'success' ? 'bg-success-soft text-success' : soft ? 'bg-workspace text-muted' : 'bg-surface-alt text-muted')}>
      <Icon size={18} aria-hidden="true" />
    </span>}
  </article>;
});

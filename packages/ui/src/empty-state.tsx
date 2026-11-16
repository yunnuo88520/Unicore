// Author: yunnuo <ymz@ebox.vip>
// Description: Centered empty, loading or error state: optional icon, title, description and action.
// Chrome-free on purpose: wrap it in a Card when the surrounding page wants a surface, or use it bare.
import type { HTMLAttributes, ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from './cn';

export type EmptyStateProps = HTMLAttributes<HTMLDivElement> & {
  icon?: LucideIcon;
  title?: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
};

export function EmptyState({ icon: Icon, title, description, action, className, ...props }: EmptyStateProps) {
  return <div className={cn('flex flex-col items-center gap-1.5 px-6 py-12 text-center', className)} {...props}>
    {Icon && <Icon size={32} aria-hidden="true" className="text-subtle" />}
    {title && <strong className="text-md font-semibold text-ink">{title}</strong>}
    {description && <p className="text-sm text-muted">{description}</p>}
    {action && <div className="mt-2">{action}</div>}
  </div>;
}

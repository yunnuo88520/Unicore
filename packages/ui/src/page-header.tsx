// Author: yunnuo <ymz@ebox.vip>
// Description: Page or panel section header: heading with optional description on one side, actions on the other.
// Chrome-free: drop it into a CardContent (or any container) and let the caller own the surface.
import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from './cn';

export type PageHeaderProps = HTMLAttributes<HTMLDivElement> & {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  as?: 'h1' | 'h2' | 'h3';
};

export function PageHeader({ title, description, actions, className, as: Heading = 'h1', ...props }: PageHeaderProps) {
  return <div className={cn('flex flex-wrap items-start justify-between gap-3', className)} data-page-header {...props}>
    <div className="min-w-0">
      <Heading className={cn('font-semibold tracking-tight text-ink', Heading === 'h1' ? 'text-3xl' : 'text-xl')}>{title}</Heading>
      {description && <p className="mt-1.5 max-w-3xl text-sm text-muted">{description}</p>}
    </div>
    {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
  </div>;
}

// Author: yunnuo <ymz@ebox.vip>
// Description: Breadcrumb trail for the topbar: quiet context, current page untruncated.
import { forwardRef, type ComponentPropsWithoutRef } from 'react';
import { ChevronRight } from 'lucide-react';
import { cn } from './cn';

export function Breadcrumb({ className, ...props }: ComponentPropsWithoutRef<'nav'>) {
  return <nav aria-label="Breadcrumb" className={cn('flex min-w-0 items-center gap-1.5 text-xs text-muted', className)} {...props} />;
}

export function BreadcrumbItem({ className, current = false, ...props }: ComponentPropsWithoutRef<'span'> & { current?: boolean }) {
  return <span aria-current={current ? 'page' : undefined} className={cn('min-w-0 truncate', current && 'font-medium text-ink', className)} {...props} />;
}

export function BreadcrumbSeparator({ className }: { className?: string }) {
  return <ChevronRight size={14} aria-hidden="true" className={cn('shrink-0 text-subtle', className)} />;
}

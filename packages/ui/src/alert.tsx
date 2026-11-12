// Author: yunnuo <ymz@ebox.vip>
// Description: Semantic banner for inline feedback — errors, warnings, results and neutral notes.
// Replaces hand-rolled danger banners; the icon and copy tone follow the variant.
import { forwardRef, type HTMLAttributes, type ReactNode } from 'react';
import { CircleAlert, CircleCheck, CircleX, Info } from 'lucide-react';
import { cn } from './cn';

const VARIANTS = {
  danger: { surface: 'border-danger-line bg-danger-soft text-danger', icon: CircleX },
  warning: { surface: 'border-warning-line bg-warning-soft text-warning', icon: CircleAlert },
  info: { surface: 'border-info-line bg-info-soft text-info', icon: Info },
  success: { surface: 'border-success-line bg-success-soft text-success', icon: CircleCheck },
} as const;

export type AlertProps = HTMLAttributes<HTMLDivElement> & {
  variant?: keyof typeof VARIANTS;
  title?: ReactNode;
  action?: ReactNode;
};

export const Alert = forwardRef<HTMLDivElement, AlertProps>(function Alert({ variant = 'info', title, action, className, children, ...props }, ref) {
  const { surface, icon: Icon } = VARIANTS[variant];
  return <div ref={ref} role={variant === 'danger' ? 'alert' : 'status'} className={cn('flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm', surface, className)} {...props}>
    <span className="flex min-w-0 items-center gap-2">
      <Icon size={15} aria-hidden="true" className="shrink-0" />
      <span className="min-w-0 break-words text-ink">
        {title && <strong className="font-medium">{title}</strong>}
        {title && children ? ' ' : null}
        {children}
      </span>
    </span>
    {action && <span className="flex shrink-0 items-center gap-2">{action}</span>}
  </div>;
});

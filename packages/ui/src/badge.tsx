// Author: yunnuo <ymz@ebox.vip>
// Description: Compact status badges using semantic token colors.
import type { HTMLAttributes } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from './cn';

const badgeVariants = cva('inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-2xs font-medium whitespace-nowrap', {
  variants: {
    variant: {
      subtle: 'border-line bg-surface-alt text-muted',
      primary: 'border-primary-line bg-primary-soft text-accent',
      success: 'border-transparent bg-success-soft text-success',
      danger: 'border-danger-line bg-danger-soft text-danger',
      warning: 'border-transparent bg-warning-soft text-warning',
      info: 'border-transparent bg-info-soft text-info',
    },
  },
  defaultVariants: { variant: 'subtle' },
});

export type BadgeProps = HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>;

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { badgeVariants };

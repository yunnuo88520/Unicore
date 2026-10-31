// Author: yunnuo <ymz@ebox.vip>
// Description: Small structural primitives: separator, skeleton, avatar and progress.
import { forwardRef, type HTMLAttributes } from 'react';
import * as SeparatorPrimitive from '@radix-ui/react-separator';
import * as AvatarPrimitive from '@radix-ui/react-avatar';
import * as ProgressPrimitive from '@radix-ui/react-progress';
import { cn } from '../lib/cn';

export const Separator = forwardRef<HTMLDivElement, React.ComponentPropsWithoutRef<typeof SeparatorPrimitive.Root>>(function Separator({ className, orientation = 'horizontal', decorative = true, ...props }, ref) {
  return <SeparatorPrimitive.Root ref={ref} decorative={decorative} orientation={orientation}
    className={cn('shrink-0 bg-line', orientation === 'horizontal' ? 'h-px w-full' : 'w-px', className)} {...props} />;
});

export function Skeleton({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div aria-hidden="true" className={cn('animate-pulse rounded-md bg-surface-alt', className)} {...props} />;
}

export const Avatar = forwardRef<HTMLSpanElement, React.ComponentPropsWithoutRef<typeof AvatarPrimitive.Root> & { initials?: string }>(function Avatar({ className, initials, ...props }, ref) {
  return <AvatarPrimitive.Root ref={ref} className={cn('relative flex size-8 shrink-0 overflow-hidden rounded-full bg-avatar', className)} {...props}>
    <AvatarPrimitive.Fallback className="flex size-full items-center justify-center bg-avatar text-xs font-medium text-avatar-ink uppercase">
      {initials}
    </AvatarPrimitive.Fallback>
  </AvatarPrimitive.Root>;
});

export const Progress = forwardRef<HTMLDivElement, React.ComponentPropsWithoutRef<typeof ProgressPrimitive.Root> & { value?: number }>(function Progress({ className, value, ...props }, ref) {
  return <ProgressPrimitive.Root ref={ref} value={value} className={cn('relative h-2 w-full overflow-hidden rounded-full bg-surface-alt', className)} {...props}>
    <ProgressPrimitive.Indicator className="size-full flex-1 rounded-full bg-primary transition-transform duration-300" style={{ transform: `translateX(-${100 - (value ?? 0)}%)` }} />
  </ProgressPrimitive.Root>;
});

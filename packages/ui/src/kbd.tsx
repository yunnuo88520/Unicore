// Author: yunnuo <ymz@ebox.vip>
// Description: Keycap for keyboard shortcuts; mono, bordered, sits inline with text.
import type { HTMLAttributes } from 'react';
import { cn } from './cn';

export function Kbd({ className, ...props }: HTMLAttributes<HTMLElement>) {
  return <kbd className={cn('inline-flex h-5 min-w-5 items-center justify-center rounded-sm border border-line bg-surface-alt px-1 font-mono text-[10px] font-medium text-muted', className)} {...props} />;
}

// Author: yunnuo <ymz@ebox.vip>
// Description: Radix dropdown menu surface used by navigation and row actions.
import { forwardRef } from 'react';
import * as DropdownPrimitive from '@radix-ui/react-dropdown-menu';
import { cn } from '../lib/cn';

export const DropdownMenu = DropdownPrimitive.Root;
export const DropdownMenuTrigger = DropdownPrimitive.Trigger;

export const DropdownMenuContent = forwardRef<HTMLDivElement, React.ComponentPropsWithoutRef<typeof DropdownPrimitive.Content>>(function DropdownMenuContent({ className, sideOffset = 6, ...props }, ref) {
  return <DropdownPrimitive.Portal>
    <DropdownPrimitive.Content ref={ref} sideOffset={sideOffset}
      className={cn('z-50 max-h-[var(--radix-dropdown-menu-content-available-height)] min-w-44 overflow-y-auto rounded-lg border border-line bg-surface p-1 text-base shadow-modal', className)} {...props} />
  </DropdownPrimitive.Portal>;
});

export const DropdownMenuItem = forwardRef<HTMLDivElement, React.ComponentPropsWithoutRef<typeof DropdownPrimitive.Item>>(function DropdownMenuItem({ className, ...props }, ref) {
  return <DropdownPrimitive.Item ref={ref}
    className={cn('relative flex cursor-pointer select-none items-center gap-2 rounded-sm px-2.5 py-1.5 text-ink outline-none data-[highlighted]:bg-surface-alt data-[disabled]:pointer-events-none data-[disabled]:opacity-50', className)} {...props} />;
});

export const DropdownMenuLabel = forwardRef<HTMLDivElement, React.ComponentPropsWithoutRef<typeof DropdownPrimitive.Label>>(function DropdownMenuLabel({ className, ...props }, ref) {
  return <DropdownPrimitive.Label ref={ref} className={cn('px-2.5 py-1.5 text-xs font-medium text-muted', className)} {...props} />;
});

export const DropdownMenuSeparator = forwardRef<HTMLDivElement, React.ComponentPropsWithoutRef<typeof DropdownPrimitive.Separator>>(function DropdownMenuSeparator({ className, ...props }, ref) {
  return <DropdownPrimitive.Separator ref={ref} className={cn('-mx-1 my-1 h-px bg-line', className)} {...props} />;
});

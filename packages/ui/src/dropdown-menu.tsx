// Author: yunnuo <ymz@ebox.vip>
// Description: Radix dropdown menu surface used by navigation and row actions.
import { forwardRef } from 'react';
import * as DropdownPrimitive from '@radix-ui/react-dropdown-menu';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from './cn';

export const DropdownMenu = DropdownPrimitive.Root;
export const DropdownMenuTrigger = DropdownPrimitive.Trigger;
export const DropdownMenuGroup = DropdownPrimitive.Group;

export const DropdownMenuContent = forwardRef<HTMLDivElement, React.ComponentPropsWithoutRef<typeof DropdownPrimitive.Content>>(function DropdownMenuContent({ className, sideOffset = 6, ...props }, ref) {
  return <DropdownPrimitive.Portal>
    <DropdownPrimitive.Content ref={ref} sideOffset={sideOffset}
      className={cn('z-50 max-h-[var(--radix-dropdown-menu-content-available-height)] min-w-44 overflow-y-auto rounded-2xl border border-line bg-surface p-2 text-base shadow-floating outline-none', className)} {...props} />
  </DropdownPrimitive.Portal>;
});

const menuItemVariants = cva('relative flex min-h-9 cursor-pointer select-none items-center gap-2 rounded-lg px-2.5 py-2 outline-none transition-colors data-[disabled]:pointer-events-none data-[disabled]:opacity-50', {
  variants: { tone: { default: 'text-ink data-[highlighted]:bg-surface-alt', danger: 'text-danger data-[highlighted]:bg-danger-soft' } },
  defaultVariants: { tone: 'default' },
});
type MenuItemProps = React.ComponentPropsWithoutRef<typeof DropdownPrimitive.Item> & VariantProps<typeof menuItemVariants>;
export const DropdownMenuItem = forwardRef<HTMLDivElement, MenuItemProps>(function DropdownMenuItem({ className, tone, ...props }, ref) {
  return <DropdownPrimitive.Item ref={ref}
    className={cn(menuItemVariants({ tone }), className)} {...props} />;
});

export const DropdownMenuLabel = forwardRef<HTMLDivElement, React.ComponentPropsWithoutRef<typeof DropdownPrimitive.Label>>(function DropdownMenuLabel({ className, ...props }, ref) {
  return <DropdownPrimitive.Label ref={ref} className={cn('px-2.5 py-1.5 text-xs font-medium text-muted', className)} {...props} />;
});

export const DropdownMenuSeparator = forwardRef<HTMLDivElement, React.ComponentPropsWithoutRef<typeof DropdownPrimitive.Separator>>(function DropdownMenuSeparator({ className, ...props }, ref) {
  return <DropdownPrimitive.Separator ref={ref} className={cn('mx-1 my-1.5 h-px bg-line', className)} {...props} />;
});

// Author: yunnuo <ymz@ebox.vip>
// Description: Floating panel anchored to a trigger, over the Radix popover primitive.
import { forwardRef, type ComponentPropsWithoutRef } from 'react';
import * as PopoverPrimitive from '@radix-ui/react-popover';
import { cn } from './cn';

export const Popover = PopoverPrimitive.Root;
export const PopoverTrigger = PopoverPrimitive.Trigger;
export const PopoverAnchor = PopoverPrimitive.Anchor;
export const PopoverClose = PopoverPrimitive.Close;

export const PopoverContent = forwardRef<HTMLDivElement, ComponentPropsWithoutRef<typeof PopoverPrimitive.Content>>(function PopoverContent({ className, align = 'start', sideOffset = 6, ...props }, ref) {
  return <PopoverPrimitive.Portal>
    <PopoverPrimitive.Content ref={ref} align={align} sideOffset={sideOffset} collisionPadding={8}
      className={cn('z-50 w-72 rounded-lg border border-line bg-surface p-3 shadow-modal outline-none data-[state=open]:animate-in data-[state=closed]:animate-out', className)} {...props} />
  </PopoverPrimitive.Portal>;
});

// Author: yunnuo <ymz@ebox.vip>
// Description: Radix tooltip with the legacy single-child label API; viewport collision is handled by Radix.
import type { ReactElement, HTMLAttributes } from 'react';
import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import { t, useLocale } from './i18n';

export function Tooltip({ label, side, children }: { label: string; side?: 'top' | 'right' | 'bottom' | 'left'; children: ReactElement<HTMLAttributes<HTMLElement>> }) {
  useLocale();
  return <TooltipPrimitive.Provider delayDuration={200} skipDelayDuration={100}>
    <TooltipPrimitive.Root>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content side={side} sideOffset={6} collisionPadding={8}
          className="z-[60] max-w-64 rounded-md bg-ink px-2 py-1 text-xs text-background shadow-modal data-[state=delayed-open]:animate-in">
          {t(label)}
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  </TooltipPrimitive.Provider>;
}

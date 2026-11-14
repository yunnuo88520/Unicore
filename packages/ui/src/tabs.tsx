// Author: yunnuo <ymz@ebox.vip>
// Description: Shared segmented tabs with Radix keyboard navigation; panels stay owned by the page.
import type { ComponentProps } from 'react';
import { useLocale } from './i18n';
import * as RadixTabs from '@radix-ui/react-tabs';
import { cn } from './cn';

function TabList({ className, ...props }: ComponentProps<typeof RadixTabs.List>) {
  return <RadixTabs.List {...props} className={cn('flex w-fit max-w-full items-center gap-1 overflow-x-auto rounded-xl border border-line bg-surface p-1 [scrollbar-width:thin]', className)} />;
}

function TabTrigger({ className, ...props }: ComponentProps<typeof RadixTabs.Trigger>) {
  return <RadixTabs.Trigger {...props} className={cn('inline-flex min-h-9 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium text-muted outline-none transition-colors hover:bg-surface-hover hover:text-ink focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus data-[state=active]:bg-primary-soft data-[state=active]:text-accent disabled:pointer-events-none disabled:opacity-50', className)} />;
}

export const TabsPrimitive: Omit<typeof RadixTabs, 'List' | 'Trigger'> & { List: typeof TabList; Trigger: typeof TabTrigger } = { ...RadixTabs, List: TabList, Trigger: TabTrigger };

export function Tabs({ id, label, items, value, onChange, className }: {
  id: string; label: string; items: readonly { id: string; label: string; dirty?: boolean }[]; value: string; onChange: (id: string) => void; className?: string;
}) {
  useLocale();
  return <TabsPrimitive.Root value={value} onValueChange={onChange} className={cn('min-w-0 max-w-full', className)}>
    <TabsPrimitive.List aria-label={label}>
      {items.map(item => (
        <TabsPrimitive.Trigger key={item.id} value={item.id} id={`${id}-tab-${item.id}`} aria-controls={`${id}-panel-${item.id}`}>
          {item.label}
          {item.dirty && <span aria-hidden="true" className="text-accent">•</span>}
        </TabsPrimitive.Trigger>
      ))}
    </TabsPrimitive.List>
  </TabsPrimitive.Root>;
}

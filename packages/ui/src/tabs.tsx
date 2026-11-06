// Author: yunnuo <ymz@ebox.vip>
// Description: Radix tab bar with the legacy controlled items API; panels stay owned by the page.
import { useLocale } from './i18n';
import * as TabsPrimitive from '@radix-ui/react-tabs';
import { cn } from './cn';

export function Tabs({ id, label, items, value, onChange, className }: {
  id: string; label: string; items: readonly { id: string; label: string; dirty?: boolean }[]; value: string; onChange: (id: string) => void; className?: string;
}) {
  useLocale();
  return <TabsPrimitive.Root value={value} onValueChange={onChange} className={className}>
    <TabsPrimitive.List aria-label={label} className="flex flex-wrap items-center gap-1 rounded-lg bg-surface-alt p-1">
      {items.map(item => (
        <TabsPrimitive.Trigger key={item.id} value={item.id} id={`${id}-tab-${item.id}`} aria-controls={`${id}-panel-${item.id}`}
          className={cn('inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm text-muted transition-colors outline-none focus-visible:ring-2 focus-visible:ring-focus aria-selected:bg-surface aria-selected:text-ink aria-selected:shadow-tint', className)}>
          {item.label}
          {item.dirty && <span aria-hidden="true" className="text-accent">•</span>}
        </TabsPrimitive.Trigger>
      ))}
    </TabsPrimitive.List>
  </TabsPrimitive.Root>;
}

export { TabsPrimitive };

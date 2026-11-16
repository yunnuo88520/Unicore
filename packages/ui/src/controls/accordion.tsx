// Author: yunnuo <ymz@ebox.vip>
// Description: Single or multiple disclosure list with linked headings and keyboard navigation.
import { forwardRef, useId, useRef, type HTMLAttributes, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '../cn';
import { useControlI18n } from './messages';
import { useControllable } from './utils';

export interface AccordionItem { id: string; title: string; content: ReactNode; disabled?: boolean }
export type AccordionProps = Omit<HTMLAttributes<HTMLDivElement>, 'onChange'> & {
  items: readonly AccordionItem[]; multiple?: boolean; value?: string[]; defaultValue?: string[]; onValueChange?: (value: string[]) => void; disabled?: boolean;
};
export const Accordion = forwardRef<HTMLDivElement, AccordionProps>(function Accordion({ items, multiple = false, value, defaultValue = [], onValueChange, disabled, className, ...props }, ref) {
  const { t } = useControlI18n();
  const base = useId();
  const [expanded, setExpanded] = useControllable(value, defaultValue, onValueChange);
  const triggers = useRef(new Map<string, HTMLButtonElement>());
  return <div ref={ref} className={cn('divide-y divide-line rounded-lg border border-line', className)} {...props}>{items.map(item => {
    const open = expanded.includes(item.id);
    const triggerId = `${base}-${encodeURIComponent(item.id)}-trigger`;
    const panelId = `${base}-${encodeURIComponent(item.id)}-panel`;
    return <div key={item.id}>
      <h3><button ref={node => { if (node) triggers.current.set(item.id, node); else triggers.current.delete(item.id); }} id={triggerId} type="button" disabled={disabled || item.disabled} aria-expanded={open} aria-controls={panelId}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-sm font-medium text-ink outline-none focus-visible:ring-2 focus-visible:ring-focus disabled:opacity-55"
        onClick={() => setExpanded(open ? expanded.filter(id => id !== item.id) : multiple ? [...expanded, item.id] : [item.id])}
        onKeyDown={event => {
          const enabled = items.filter(entry => !disabled && !entry.disabled);
          const index = enabled.findIndex(entry => entry.id === item.id);
          const next = event.key === 'Home' ? 0 : event.key === 'End' ? enabled.length - 1 : event.key === 'ArrowDown' ? (index + 1) % enabled.length : event.key === 'ArrowUp' ? (index - 1 + enabled.length) % enabled.length : -1;
          if (next >= 0) { event.preventDefault(); triggers.current.get(enabled[next].id)?.focus(); }
        }}>{t(item.title)}<ChevronDown size={16} aria-hidden="true" className={cn('shrink-0 transition-transform motion-reduce:transition-none', open && 'rotate-180')} /></button></h3>
      <div id={panelId} role="region" aria-labelledby={triggerId} hidden={!open} className="px-4 pb-4 text-sm text-muted">{item.content}</div>
    </div>;
  })}</div>;
});

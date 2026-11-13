// Author: yunnuo <ymz@ebox.vip>
// Description: Controlled command dialog with local filtering and explicit caller-owned actions.
import { useEffect, useId, useRef, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { Input } from '../input';
import { cn } from '../cn';
import { useControlI18n } from './messages';
import { CloseButton } from './actions';

export interface CommandItem { id: string; label: string; keywords?: readonly string[]; disabled?: boolean; onSelect: () => void }
export interface CommandPaletteProps { open: boolean; onOpenChange: (open: boolean) => void; items: readonly CommandItem[]; title?: string; searchLabel?: string; emptyLabel?: string; className?: string }
export function CommandPalette({ open, onOpenChange, items, title = 'Commands', searchLabel = 'Search commands', emptyLabel = 'No results', className }: CommandPaletteProps) {
  const { t, locale } = useControlI18n();
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState<string>();
  const filtered = items.filter(item => [t(item.label), ...item.keywords ?? []].some(text => text.toLocaleLowerCase(locale).includes(query.toLocaleLowerCase(locale))));
  const enabled = filtered.filter(item => !item.disabled);
  const current = enabled.find(item => item.id === active) ?? enabled[0];
  useEffect(() => {
    if (open && current) document.getElementById(`${id}-${encodeURIComponent(current.id)}`)?.scrollIntoView({ block: 'nearest' });
  }, [open, current?.id, id]);
  const choose = (item: CommandItem) => { if (!item.disabled) { onOpenChange(false); item.onSelect(); } };
  return <Dialog.Root open={open} onOpenChange={onOpenChange}><Dialog.Portal><Dialog.Overlay className="fixed inset-0 z-50 bg-scrim/70" />
    <Dialog.Content className={cn('fixed start-1/2 top-1/4 z-50 flex max-h-[65dvh] w-[calc(100%-32px)] max-w-dialog -translate-x-1/2 flex-col gap-3 rounded-3xl border border-line bg-workspace p-6 shadow-floating', className)} aria-describedby={undefined}
      onOpenAutoFocus={event => { event.preventDefault(); opener.current = document.activeElement as HTMLElement; setQuery(''); setActive(undefined); input.current?.focus(); }}
      onCloseAutoFocus={event => { event.preventDefault(); if (opener.current?.isConnected) opener.current.focus(); }}>
      <div className="flex items-center justify-between gap-2"><Dialog.Title className="text-base font-semibold text-ink">{t(title)}</Dialog.Title><Dialog.Close asChild><CloseButton /></Dialog.Close></div>
      <Input ref={input} role="combobox" aria-label={t(searchLabel)} aria-autocomplete="list" aria-expanded="true" aria-controls={`${id}-list`} aria-activedescendant={current ? `${id}-${encodeURIComponent(current.id)}` : undefined} value={query}
        onChange={event => { setQuery(event.target.value); setActive(undefined); }} onKeyDown={event => {
          if (event.nativeEvent.isComposing || event.keyCode === 229) return;
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault(); const index = enabled.findIndex(item => item.id === current?.id);
            setActive(enabled[(index + (event.key === 'ArrowDown' ? 1 : -1) + enabled.length) % enabled.length]?.id);
          } else if (event.key === 'Home' || event.key === 'End') { event.preventDefault(); setActive((event.key === 'Home' ? enabled[0] : enabled.at(-1))?.id); }
          else if (event.key === 'Enter' && current) { event.preventDefault(); choose(current); }
        }} />
      <div id={`${id}-list`} role="listbox" aria-label={t(title)} className="min-h-0 overflow-y-auto">{filtered.length ? filtered.map(item => <div key={item.id} id={`${id}-${encodeURIComponent(item.id)}`} role="option" aria-selected={item.id === current?.id} aria-disabled={item.disabled || undefined}
        className={cn('cursor-pointer rounded-md px-3 py-2 text-sm text-ink', item.id === current?.id && 'bg-surface-alt', item.disabled && 'opacity-55')}
        onPointerDown={event => event.preventDefault()} onPointerMove={() => { if (!item.disabled) setActive(item.id); }} onClick={() => choose(item)}>{t(item.label)}</div>) : <p className="p-3 text-sm text-muted">{t(emptyLabel)}</p>}</div>
    </Dialog.Content></Dialog.Portal></Dialog.Root>;
}

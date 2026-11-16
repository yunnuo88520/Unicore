// Author: yunnuo <ymz@ebox.vip>
// Description: Filtered single-choice combobox with input focus retained across a portalled popover.
import { forwardRef, useEffect, useId, useRef, useState, type InputHTMLAttributes, type ReactNode } from 'react';
import { Check, LoaderCircle, X } from 'lucide-react';
import { Input } from '../input';
import { Button } from '../button';
import { Popover, PopoverAnchor, PopoverContent } from '../popover';
import { cn } from '../cn';
import { useControlI18n } from './messages';
import { assignRef, useControllable } from './utils';

export interface ComboboxOption { value: string; label: string; description?: string; disabled?: boolean }
export type ComboboxProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'defaultValue' | 'onChange' | 'onSelect' | 'role'> & {
  label: string; options: readonly ComboboxOption[]; value?: string; defaultValue?: string; onValueChange?: (value: string) => void;
  open?: boolean; defaultOpen?: boolean; onOpenChange?: (open: boolean) => void; emptyLabel?: string;
  /** Supplying query/onQueryChange delegates filtering to the host, including asynchronous search. */
  query?: string; onQueryChange?: (query: string) => void; minQueryLength?: number;
  loading?: boolean; error?: string; onRetry?: () => void; footer?: ReactNode; translateOptions?: boolean; clearable?: boolean;
};
export const Combobox = forwardRef<HTMLInputElement, ComboboxProps>(function Combobox({ label, options, value, defaultValue = '', onValueChange, open, defaultOpen = false, onOpenChange, emptyLabel = 'No results', query: remoteQuery, onQueryChange, minQueryLength = 0, loading, error, onRetry, footer, translateOptions = true, clearable = true, disabled, readOnly, onKeyDown, onFocus, onBlur, className, id, ...props }, ref) {
  const { t, locale } = useControlI18n();
  const generated = useId();
  const base = id ?? generated;
  const input = useRef<HTMLInputElement>(null);
  const [selected, setSelected] = useControllable(value, defaultValue, onValueChange);
  const [isOpen, setOpen] = useControllable(open, defaultOpen, onOpenChange);
  const text = (value: string) => translateOptions ? t(value) : value;
  const selectedLabel = text(options.find(option => option.value === selected)?.label ?? '');
  const [localQuery, setLocalQuery] = useState(selectedLabel);
  const query = remoteQuery ?? localQuery;
  const setQuery = (next: string) => { setLocalQuery(next); onQueryChange?.(next); };
  const [filtering, setFiltering] = useState(false);
  const [active, setActive] = useState<string | undefined>();
  // Selection is authoritative, including a controlled update while the user is searching.
  useEffect(() => { if (selected || !filtering) { setFiltering(false); setLocalQuery(selectedLabel); } setActive(undefined); }, [selected, selectedLabel]);
  const expanded = isOpen && !disabled && !readOnly && (!minQueryLength || filtering && query.trim().length >= minQueryLength);
  useEffect(() => { if (!expanded) { setFiltering(false); setActive(undefined); } }, [expanded]);
  useEffect(() => {
    if (expanded && active) document.getElementById(`${base}-option-${encodeURIComponent(active)}`)?.scrollIntoView({ block: 'nearest' });
  }, [expanded, active, base]);
  const shown = options.filter(option => remoteQuery !== undefined || !filtering || text(option.label).toLocaleLowerCase(locale).includes(query.toLocaleLowerCase(locale)));
  const enabled = loading || error ? [] : shown.filter(option => !option.disabled);
  const activeOption = enabled.find(option => option.value === active);
  const optionId = (key: string) => `${base}-option-${encodeURIComponent(key)}`;
  const choose = (option: ComboboxOption) => {
    if (disabled || readOnly || option.disabled) return;
    setSelected(option.value); setQuery(text(option.label)); setFiltering(false); setOpen(false); setActive(undefined); input.current?.focus();
  };
  const dismiss = () => { setOpen(false); setFiltering(false); if (remoteQuery === undefined || selected) setQuery(selectedLabel); setActive(undefined); };
  return <Popover open={expanded} onOpenChange={next => { if (!next) dismiss(); else if (!disabled && !readOnly) setOpen(true); }}>
    <PopoverAnchor asChild><div className="relative min-w-0 pt-2"><Input ref={node => { input.current = node; assignRef(ref, node); }} id={base} role="combobox" aria-label={t(label)} aria-autocomplete="list" aria-expanded={expanded} aria-controls={expanded ? `${base}-list` : undefined} aria-activedescendant={expanded && activeOption ? optionId(activeOption.value) : undefined} value={filtering || remoteQuery !== undefined && !selected ? query : selectedLabel} disabled={disabled} readOnly={readOnly} className={cn('pe-10', className)} {...props}
      onFocus={event => { onFocus?.(event); if (!event.defaultPrevented && !disabled && !readOnly) setOpen(true); }}
      onBlur={event => { onBlur?.(event); if (!event.defaultPrevented) dismiss(); }}
      onChange={event => { setQuery(event.target.value); setFiltering(true); setOpen(true); setActive(undefined); if (selected && remoteQuery !== undefined) setSelected(''); }}
      onKeyDown={event => {
        onKeyDown?.(event); if (event.defaultPrevented || disabled || readOnly || event.nativeEvent.isComposing || event.keyCode === 229) return;
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
          event.preventDefault(); setOpen(true);
          const index = enabled.findIndex(option => option.value === active);
          const next = event.key === 'ArrowDown' ? (index + 1) % enabled.length : (index < 0 ? enabled.length - 1 : (index - 1 + enabled.length) % enabled.length);
          setActive(enabled[next]?.value);
        } else if (expanded && (event.key === 'Home' || event.key === 'End')) { event.preventDefault(); setActive((event.key === 'Home' ? enabled[0] : enabled.at(-1))?.value); }
        else if (event.key === 'Enter' && expanded && activeOption) { event.preventDefault(); choose(activeOption); }
        else if (event.key === 'Escape' && expanded) { event.preventDefault(); event.stopPropagation(); dismiss(); }
        else if (event.key === 'Tab') dismiss();
      }} />{clearable && !readOnly && (query || selected) && <button type="button" tabIndex={-1} disabled={disabled} aria-label={t('Clear selection')} className="absolute end-1 top-3 flex size-9 items-center justify-center rounded-md text-muted outline-none hover:bg-surface-hover focus-visible:ring-2 focus-visible:ring-focus" onPointerDown={event => event.preventDefault()} onClick={() => { setSelected(''); setQuery(''); setFiltering(true); setOpen(false); input.current?.focus(); }}><X size={16} aria-hidden="true" /></button>}</div></PopoverAnchor>
    <PopoverContent className="w-[var(--radix-popover-trigger-width)] min-w-48 p-2"
      onPointerDown={event => { if ((event.target as HTMLElement).closest('button')) event.preventDefault(); }}
      onOpenAutoFocus={event => event.preventDefault()} onCloseAutoFocus={event => event.preventDefault()}
      onInteractOutside={event => { if (event.target === input.current) event.preventDefault(); }}>
      <div role="listbox" id={`${base}-list`} aria-label={t(label)} aria-busy={loading || undefined} className="max-h-56 overflow-y-auto overscroll-contain">
        {!loading && !error && shown.map(option => <div key={option.value} id={optionId(option.value)} role="option" aria-selected={selected === option.value} aria-disabled={option.disabled || undefined}
          className={cn('flex min-h-9 cursor-pointer items-center justify-between gap-3 rounded-lg px-3 py-2 text-base text-ink hover:bg-surface-hover', active === option.value && 'bg-surface-hover', option.disabled && 'cursor-not-allowed opacity-55')}
          onPointerMove={() => { if (!option.disabled) setActive(option.value); }} onPointerDown={event => event.preventDefault()} onClick={() => choose(option)}><span className="min-w-0"><span className="block break-words"><MatchText text={text(option.label)} query={filtering ? query : ''} /></span>{option.description && <span className="mt-1 block break-all text-xs text-muted"><MatchText text={text(option.description)} query={filtering ? query : ''} /></span>}</span>{selected === option.value && <Check size={16} className="shrink-0 text-accent" aria-hidden="true" />}</div>)}
      </div>
      {loading ? <div role="status" className="flex items-center gap-2 p-3 text-sm text-muted"><LoaderCircle size={16} className="animate-spin motion-reduce:animate-none" aria-hidden="true" />{t('Searching…')}</div> : error ? <div role="alert" className="p-3 text-sm text-danger">{error}{onRetry && <Button variant="link" size="sm" onClick={onRetry}>{t('Retry')}</Button>}</div> : !shown.length && <div role="status" className="p-3 text-sm text-muted">{t(emptyLabel)}</div>}
      {!loading && !error && footer}
    </PopoverContent>
  </Popover>;
});

/** Plain text highlighting keeps user-provided names out of HTML interpolation. */
export function MatchText({ text, query }: { text: string; query: string }) {
  const search = query.trim().toLocaleLowerCase();
  if (!search) return <>{text}</>;
  const start = text.toLocaleLowerCase().indexOf(search);
  return start < 0 ? <>{text}</> : <>{text.slice(0, start)}<mark className="rounded-sm bg-primary-soft font-medium text-accent">{text.slice(start, start + search.length)}</mark>{text.slice(start + search.length)}</>;
}

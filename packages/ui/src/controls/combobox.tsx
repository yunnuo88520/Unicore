// Author: yunnuo <ymz@ebox.vip>
// Description: Filtered single-choice combobox with input focus retained across a portalled popover.
import { forwardRef, useEffect, useId, useRef, useState, type InputHTMLAttributes } from 'react';
import { Input } from '../input';
import { Popover, PopoverAnchor, PopoverContent } from '../popover';
import { cn } from '../cn';
import { useControlI18n } from './messages';
import { assignRef, useControllable } from './utils';

export interface ComboboxOption { value: string; label: string; disabled?: boolean }
export type ComboboxProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'defaultValue' | 'onChange' | 'onSelect' | 'role'> & {
  label: string; options: readonly ComboboxOption[]; value?: string; defaultValue?: string; onValueChange?: (value: string) => void;
  open?: boolean; defaultOpen?: boolean; onOpenChange?: (open: boolean) => void; emptyLabel?: string;
};
export const Combobox = forwardRef<HTMLInputElement, ComboboxProps>(function Combobox({ label, options, value, defaultValue = '', onValueChange, open, defaultOpen = false, onOpenChange, emptyLabel = 'No results', disabled, readOnly, onKeyDown, onFocus, onBlur, className, id, ...props }, ref) {
  const { t, locale } = useControlI18n();
  const generated = useId();
  const base = id ?? generated;
  const input = useRef<HTMLInputElement>(null);
  const [selected, setSelected] = useControllable(value, defaultValue, onValueChange);
  const [isOpen, setOpen] = useControllable(open, defaultOpen, onOpenChange);
  const selectedLabel = t(options.find(option => option.value === selected)?.label ?? '');
  const [query, setQuery] = useState(selectedLabel);
  const [filtering, setFiltering] = useState(false);
  const [active, setActive] = useState<string | undefined>();
  // Selection is authoritative, including a controlled update while the user is searching.
  useEffect(() => { setFiltering(false); setQuery(selectedLabel); setActive(undefined); }, [selected, selectedLabel]);
  const expanded = isOpen && !disabled && !readOnly;
  useEffect(() => { if (!expanded) { setFiltering(false); setActive(undefined); } }, [expanded]);
  useEffect(() => {
    if (expanded && active) document.getElementById(`${base}-option-${encodeURIComponent(active)}`)?.scrollIntoView({ block: 'nearest' });
  }, [expanded, active, base]);
  const shown = options.filter(option => !filtering || t(option.label).toLocaleLowerCase(locale).includes(query.toLocaleLowerCase(locale)));
  const enabled = shown.filter(option => !option.disabled);
  const activeOption = enabled.find(option => option.value === active);
  const optionId = (key: string) => `${base}-option-${encodeURIComponent(key)}`;
  const choose = (option: ComboboxOption) => {
    if (disabled || readOnly || option.disabled) return;
    setSelected(option.value); setQuery(t(option.label)); setFiltering(false); setOpen(false); setActive(undefined);
  };
  const dismiss = () => { setOpen(false); setFiltering(false); setQuery(selectedLabel); setActive(undefined); };
  return <Popover open={expanded} onOpenChange={next => { if (!next) dismiss(); else if (!disabled && !readOnly) setOpen(true); }}>
    <PopoverAnchor asChild><Input ref={node => { input.current = node; assignRef(ref, node); }} id={base} role="combobox" aria-label={t(label)} aria-autocomplete="list" aria-expanded={expanded} aria-controls={expanded ? `${base}-list` : undefined} aria-activedescendant={expanded && activeOption ? optionId(activeOption.value) : undefined} value={filtering && expanded ? query : selectedLabel} disabled={disabled} readOnly={readOnly} className={className} {...props}
      onFocus={event => { onFocus?.(event); if (!event.defaultPrevented && !disabled && !readOnly) setOpen(true); }}
      onBlur={event => { onBlur?.(event); if (!event.defaultPrevented) dismiss(); }}
      onChange={event => { setQuery(event.target.value); setFiltering(true); setOpen(true); setActive(undefined); }}
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
      }} /></PopoverAnchor>
    <PopoverContent role="listbox" id={`${base}-list`} aria-label={t(label)} className="max-h-64 w-[var(--radix-popover-trigger-width)] min-w-48 overflow-y-auto p-1"
      onOpenAutoFocus={event => event.preventDefault()} onCloseAutoFocus={event => event.preventDefault()}
      onInteractOutside={event => { if (event.target === input.current) event.preventDefault(); }}>
      {shown.length ? shown.map(option => <div key={option.value} id={optionId(option.value)} role="option" aria-selected={selected === option.value} aria-disabled={option.disabled || undefined}
        className={cn('cursor-pointer rounded-md px-3 py-2 text-sm text-ink', active === option.value && 'bg-surface-alt', option.disabled && 'cursor-not-allowed opacity-55')}
        onPointerMove={() => { if (!option.disabled) setActive(option.value); }} onPointerDown={event => event.preventDefault()} onClick={() => choose(option)}>{t(option.label)}</div>) : <div className="p-3 text-sm text-muted">{t(emptyLabel)}</div>}
    </PopoverContent>
  </Popover>;
});

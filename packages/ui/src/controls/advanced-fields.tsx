// Author: yunnuo <ymz@ebox.vip>
// Description: Range filters, editable tags and adjacent-column hierarchical selection without business services.
import { forwardRef, useId, useRef, useState, type KeyboardEvent } from 'react';
import { Check, ChevronDown, ChevronRight, X } from 'lucide-react';
import { cva } from 'class-variance-authority';
import { Button } from '../button';
import { Input, controlVariants } from '../input';
import { Popover, PopoverContent, PopoverTrigger } from '../popover';
import { cn } from '../cn';
import { useControlI18n } from './messages';
import { useControllable } from './utils';

export type RangeSliderProps = { label: string; value?: readonly [number, number]; defaultValue?: readonly [number, number]; onValueChange?: (value: [number, number]) => void; min?: number; max?: number; step?: number; disabled?: boolean; showInputs?: boolean; formatValue?: (value: number) => string; className?: string };
const rangeThumb = cva('pointer-events-none absolute inset-x-0 top-0 h-6 w-full appearance-none bg-transparent outline-none [&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:size-5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-accent [&::-webkit-slider-thumb]:bg-surface [&::-webkit-slider-thumb]:shadow-tint focus-visible:[&::-webkit-slider-thumb]:ring-2 focus-visible:[&::-webkit-slider-thumb]:ring-focus [&::-moz-range-thumb]:pointer-events-auto [&::-moz-range-thumb]:size-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-accent [&::-moz-range-thumb]:bg-surface disabled:opacity-55');
export function RangeSlider({ label, value, defaultValue, onValueChange, min = 0, max = 100, step = 1, disabled, showInputs = true, formatValue = String, className }: RangeSliderProps) {
  const { t } = useControlI18n();
  const lower = Number.isFinite(min) ? min : 0;
  const upper = Number.isFinite(max) ? Math.max(lower, max) : Math.max(lower, 100);
  const increment = Number.isFinite(step) && step > 0 ? step : 1;
  const [range, setRange] = useControllable<readonly [number, number]>(value, defaultValue ?? [lower, upper], next => onValueChange?.([...next]));
  const start = Math.max(lower, Math.min(upper, Number.isFinite(range[0]) ? range[0] : lower));
  const end = Math.max(start, Math.min(upper, Number.isFinite(range[1]) ? range[1] : upper));
  function change(index: number, number: number) {
    if (disabled || !Number.isFinite(number)) return;
    const bound = Math.max(lower, Math.min(upper, lower + Math.round((number - lower) / increment) * increment));
    setRange(index === 0 ? [Math.min(bound, end), end] : [start, Math.max(bound, start)]);
  }
  const offset = (number: number) => upper === lower ? 0 : (number - lower) / (upper - lower) * 100;
  return <fieldset disabled={disabled} className={cn('flex min-w-0 flex-col gap-4', className)}><legend className="mb-4 text-sm font-medium text-ink">{t(label)}</legend>
    <div className="relative h-6"><div className="absolute inset-x-0 top-2.5 h-1 rounded-full bg-line"><span className="absolute h-full rounded-full bg-accent" style={{ insetInlineStart: `${offset(start)}%`, width: `${offset(end) - offset(start)}%` }} /></div>
      {[start, end].map((number, index) => <input key={index} type="range" className={rangeThumb()} aria-label={t(index ? 'Maximum {{label}}' : 'Minimum {{label}}', { label: t(label) })} aria-valuetext={formatValue(number)} aria-valuemin={index ? start : lower} aria-valuemax={index ? upper : end} min={lower} max={upper} step={increment} value={number} disabled={disabled} onChange={event => change(index, event.target.valueAsNumber)} style={{ zIndex: index === 0 && start === upper ? 2 : index + 1 }} />)}
    </div>
    {showInputs ? <div className="grid grid-cols-2 gap-3 pt-2">{[start, end].map((number, index) => <Input key={index} type="number" label={t(index ? 'Maximum' : 'Minimum')} value={number} min={index ? start : lower} max={index ? upper : end} step={increment} disabled={disabled} onChange={event => change(index, event.target.valueAsNumber)} />)}</div> : <p className="flex justify-between text-xs tabular-nums text-muted"><span>{formatValue(start)}</span><span>{formatValue(end)}</span></p>}
  </fieldset>;
}

export type TagInputProps = { label: string; value?: readonly string[]; defaultValue?: readonly string[]; onValueChange?: (value: string[]) => void; maxTags?: number; maxTagLength?: number; disabled?: boolean; readOnly?: boolean; id?: string; name?: string; hint?: string; className?: string; 'aria-describedby'?: string; 'aria-invalid'?: boolean };
export const TagInput = forwardRef<HTMLInputElement, TagInputProps>(function TagInput({ label, value, defaultValue = [], onValueChange, maxTags, maxTagLength = 64, disabled, readOnly, id, name, hint, className, ...props }, ref) {
  const { t } = useControlI18n();
  const generated = useId(); const base = id ?? generated;
  const [tags, setTags] = useControllable<readonly string[]>(value, defaultValue, next => onValueChange?.([...next]));
  const [draft, setDraft] = useState(''); const [focused, setFocused] = useState(false); const [error, setError] = useState('');
  const removals = useRef<(HTMLButtonElement | null)[]>([]);
  const float = focused || !!draft || tags.length > 0;
  function add() {
    const text = draft.trim(); if (!text || disabled || readOnly) return;
    if (tags.some(tag => tag.toLocaleLowerCase() === text.toLocaleLowerCase())) { setError(t('This tag already exists')); return; }
    if (maxTags !== undefined && tags.length >= maxTags) { setError(t('Use at most {{count}} tags', { count: maxTags })); return; }
    setTags([...tags, text]); setDraft(''); setError('');
  }
  return <div className={cn('flex min-w-0 flex-col gap-2 pt-2', className)}><div className={cn(controlVariants(), 'relative flex min-h-11 flex-wrap items-center gap-2 px-3 py-2 focus-within:border-focus focus-within:ring-2 focus-within:ring-focus', disabled && 'opacity-55')}>
    <label htmlFor={base} className={cn('pointer-events-none absolute start-3 bg-field px-1 text-xs text-muted', !float && 'top-3 bg-transparent text-sm', float && '-top-2.5')}>{t(label)}</label>
    {tags.map((tag, index) => <span key={tag} className="inline-flex max-w-full items-center gap-1 rounded-md bg-surface-alt px-2 py-1 text-sm text-ink"><span className="truncate">{tag}</span>{!readOnly && <button ref={node => { removals.current[index] = node; }} type="button" aria-label={t('Remove {{label}}', { label: tag })} disabled={disabled} className="rounded-sm text-muted outline-none hover:text-ink focus-visible:ring-2 focus-visible:ring-focus" onClick={() => setTags(tags.filter((_, position) => index !== position))}><X size={14} aria-hidden="true" /></button>}</span>)}
    <input ref={ref} id={base} name={name} aria-label={t(label)} aria-invalid={props['aria-invalid'] || !!error} aria-describedby={[props['aria-describedby'], `${base}-hint`, error ? `${base}-error` : ''].filter(Boolean).join(' ') || undefined} disabled={disabled} readOnly={readOnly} maxLength={maxTagLength} value={draft} className="min-w-16 flex-1 bg-transparent text-base text-ink outline-none" onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} onChange={event => setDraft(event.target.value)} onKeyDown={event => {
      if (event.nativeEvent.isComposing || event.keyCode === 229) return;
      if (event.key === 'Enter') { event.preventDefault(); add(); }
      if (event.key === 'Backspace' && !draft && !readOnly) { event.preventDefault(); removals.current.at(-1)?.focus(); }
    }} />
  </div>{error && <p id={`${base}-error`} role="alert" className="text-xs text-danger">{error}</p>}<p id={`${base}-hint`} className="text-xs text-muted">{hint ?? t('Press Enter to add a tag')}</p></div>;
});

export interface CascaderOption { value: string; label: string; disabled?: boolean; children?: readonly CascaderOption[] }
export type CascaderProps = { label: string; options: readonly CascaderOption[]; value?: readonly string[]; onValueChange: (path: string[]) => void; disabled?: boolean; className?: string };
export function Cascader({ label, options, value = [], onValueChange, disabled, className }: CascaderProps) {
  const { t } = useControlI18n(); const [open, setOpen] = useState(false); const [path, setPath] = useState<readonly string[]>(value);
  const columns: (readonly CascaderOption[])[] = [options]; const labels: string[] = [];
  let current = options;
  for (const key of path) { const node = current.find(option => option.value === key); if (!node) break; if (node.children?.length) columns.push(node.children); current = node.children ?? []; }
  current = options;
  for (const key of value) { const node = current.find(option => option.value === key); if (!node) break; labels.push(t(node.label)); current = node.children ?? []; }
  function navigate(event: KeyboardEvent<HTMLButtonElement>, column: number) {
    const siblings = Array.from(event.currentTarget.parentElement!.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'));
    const index = siblings.indexOf(event.currentTarget);
    if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) { event.preventDefault(); const next = event.key === 'Home' ? 0 : event.key === 'End' ? siblings.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : siblings.length - 1)) % siblings.length; siblings[next]?.focus(); }
    if (event.key === 'ArrowRight') { event.preventDefault(); const target = event.currentTarget; target.click(); requestAnimationFrame(() => target.closest('[data-cascader]')?.querySelector<HTMLButtonElement>(`[data-column="${column + 1}"] button:not(:disabled)`)?.focus()); }
    if (event.key === 'ArrowLeft') { event.preventDefault(); event.currentTarget.closest('[data-cascader]')?.querySelector<HTMLButtonElement>(`[data-column="${column - 1}"] [aria-selected="true"]`)?.focus(); }
  }
  return <Popover open={open && !disabled} onOpenChange={next => { if (next) setPath(value); setOpen(next); }}><PopoverTrigger asChild><Button variant="secondary" disabled={disabled} aria-label={t(label)} className={className}>{labels.length ? labels.join(' / ') : t(label)}<ChevronDown size={16} aria-hidden="true" /></Button></PopoverTrigger>
    <PopoverContent data-cascader="" aria-label={t(label)} className="flex w-auto max-w-[calc(100vw-2rem)] overflow-x-auto p-1">{columns.map((column, level) => <div key={level} data-column={level} role="listbox" aria-label={t('Level {{level}}', { level: level + 1 })} className="max-h-56 min-w-36 overflow-y-auto border-e border-line p-1 last:border-0">{column.map(option => <button key={option.value} type="button" role="option" aria-selected={path[level] === option.value} aria-expanded={option.children?.length ? path[level] === option.value : undefined} disabled={option.disabled} className={cn('flex w-full items-center justify-between gap-3 rounded-md px-3 py-2 text-start text-sm text-ink outline-none hover:bg-surface-hover focus-visible:ring-2 focus-visible:ring-focus disabled:opacity-55', path[level] === option.value && 'bg-primary-soft text-accent')} onKeyDown={event => navigate(event, level)} onClick={() => { const next = [...path.slice(0, level), option.value]; setPath(next); if (!option.children?.length) { onValueChange(next); setOpen(false); } }}>{t(option.label)}{option.children?.length ? <ChevronRight size={14} aria-hidden="true" /> : path[level] === option.value ? <Check size={14} aria-hidden="true" /> : null}</button>)}</div>)}</PopoverContent>
  </Popover>;
}

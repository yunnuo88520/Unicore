// Author: yunnuo <ymz@ebox.vip>
// Description: Native-backed search, numeric, time, range, and color fields with explicit labels.
import { forwardRef, useEffect, useId, useRef, useState, type InputHTMLAttributes } from 'react';
import { Search, Minus, Plus } from 'lucide-react';
import { Input } from '../input';
import { cn } from '../cn';
import { useControlI18n } from './messages';
import { IconButton, CloseButton } from './actions';
import { assignRef, clamp, useControllable } from './utils';

type TextFieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'defaultValue' | 'onChange' | 'type'> & { label: string; value?: string; defaultValue?: string; onValueChange?: (value: string) => void };
export const SearchField = forwardRef<HTMLInputElement, TextFieldProps>(function SearchField({ label, value, defaultValue = '', onValueChange, disabled, readOnly, className, ...props }, ref) {
  const { t } = useControlI18n();
  const [text, setText] = useControllable(value, defaultValue, onValueChange);
  const input = useRef<HTMLInputElement>(null);
  return <div className={cn('relative flex min-w-0 items-center', className)}><Input ref={node => { input.current = node; assignRef(ref, node); }} type="search" aria-label={t(label)} placeholder={t(label)} value={text} disabled={disabled} readOnly={readOnly} leadingIcon={<Search size={15} />} className="rounded-full bg-surface-hover pe-10 [&::-webkit-search-cancel-button]:hidden" {...props} onChange={event => setText(event.target.value)} />{text && !readOnly && <CloseButton label="Clear search" disabled={disabled} className="absolute end-2 top-1/2 -translate-y-1/2" onClick={() => { setText(''); input.current?.focus(); }} />}</div>;
});
export type SliderProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'value' | 'defaultValue' | 'onChange'> & { label: string; value?: number; defaultValue?: number; onValueChange?: (value: number) => void; valueText?: string };
export const Slider = forwardRef<HTMLInputElement, SliderProps>(function Slider({ label, value, defaultValue = 0, onValueChange, valueText, className, ...props }, ref) {
  const { t } = useControlI18n();
  const [number, setNumber] = useControllable(value, defaultValue, onValueChange);
  return <input ref={ref} type="range" aria-label={t(label)} aria-valuetext={valueText} value={number} {...props} onChange={event => setNumber(event.target.valueAsNumber)} className={cn('h-6 w-full cursor-pointer accent-accent outline-none focus-visible:ring-2 focus-visible:ring-focus disabled:cursor-not-allowed disabled:opacity-55', className)} />;
});
export type NumberFieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'value' | 'defaultValue' | 'onChange' | 'min' | 'max' | 'step'> & {
  label: string; value?: number | ''; defaultValue?: number | ''; onValueChange?: (value: number | '') => void; min?: number; max?: number; step?: number; showSteppers?: boolean;
};
export const NumberField = forwardRef<HTMLInputElement, NumberFieldProps>(function NumberField({ label, value, defaultValue = '', onValueChange, min = -Infinity, max = Infinity, step = 1, showSteppers = true, disabled, readOnly, className, onBlur, ...props }, ref) {
  const { t } = useControlI18n();
  const [number, setNumber] = useControllable(value, defaultValue, onValueChange);
  const increment = Number.isFinite(step) && step > 0 ? step : 1;
  const lower = Number.isFinite(min) ? min : -Infinity;
  const upper = Math.max(lower, Number.isFinite(max) ? max : Infinity);
  const bound = (next: number) => clamp(next, lower, upper);
  const move = (direction: number) => {
    if (disabled || readOnly) return;
    const base = number === '' || !Number.isFinite(number) ? bound(0) : number;
    const origin = Number.isFinite(lower) ? lower : 0;
    const position = (base - origin) / increment;
    const aligned = direction > 0 ? Math.floor(position + 1e-10) + 1 : Math.ceil(position - 1e-10) - 1;
    const next = number === '' ? base : origin + aligned * increment;
    setNumber(bound(Number(next.toPrecision(12))));
  };
  return <div className="flex items-center gap-1">{showSteppers && <IconButton variant="secondary" label="Decrease value" disabled={disabled || readOnly || (number !== '' && number <= lower)} onClick={() => move(-1)}><Minus size={16} /></IconButton>}
    <Input ref={ref} type="number" aria-label={t(label)} value={number} min={Number.isFinite(lower) ? lower : undefined} max={Number.isFinite(upper) ? upper : undefined} step={increment} disabled={disabled} readOnly={readOnly} className={className} {...props}
      onBlur={event => { onBlur?.(event); if (!event.defaultPrevented && !disabled && !readOnly && number !== '' && Number.isFinite(number)) setNumber(bound(number)); }}
      onChange={event => { if (disabled || readOnly) return; const next = event.target.valueAsNumber; setNumber(Number.isFinite(next) ? next : ''); }} />
    {showSteppers && <IconButton variant="secondary" label="Increase value" disabled={disabled || readOnly || (number !== '' && number >= upper)} onClick={() => move(1)}><Plus size={16} /></IconButton>}</div>;
});
/** Native time input retains browser-local editing and validity; values are HH:mm[:ss]. */
export const TimeField = forwardRef<HTMLInputElement, TextFieldProps>(function TimeField({ label, value, defaultValue = '', onValueChange, disabled, readOnly, ...props }, ref) {
  const { t } = useControlI18n();
  const [time, setTime] = useControllable(value, defaultValue, onValueChange);
  return <Input ref={ref} type="time" aria-label={t(label)} value={time} disabled={disabled} readOnly={readOnly} {...props} onChange={event => { if (!disabled && !readOnly) setTime(event.target.value); }} />;
});
/** Opaque six-digit hex entry with native spectrum dialog and optional caller-owned palette. */
export type ColorPickerProps = Omit<TextFieldProps, 'value' | 'defaultValue' | 'onValueChange'> & {
  value: string;
  onValueChange: (value: string) => void;
  palette?: readonly string[];
};
export const ColorPicker = forwardRef<HTMLInputElement, ColorPickerProps>(function ColorPicker({ label, value, onValueChange, palette = [], className, id, disabled, readOnly, ...props }, ref) {
  const { t } = useControlI18n();
  const generated = useId();
  const base = id ?? generated;
  const valid = (text: string) => /^#[0-9a-f]{6}$/i.test(text);
  const [draft, setDraft] = useState<string | null>(null);
  const composing = useRef(false);
  useEffect(() => setDraft(null), [value]);
  const text = draft ?? value;
  const invalid = !valid(text);
  const choose = (next: string) => { if (!disabled && !readOnly && valid(next)) { setDraft(null); if (next.toLowerCase() !== value.toLowerCase()) onValueChange(next.toLowerCase()); } };
  return <div className="flex min-w-0 max-w-full flex-col gap-2">
    <div className="flex min-w-0 flex-wrap items-center gap-2">
      <Input ref={ref} id={base} type="color" aria-label={t(label)} value={valid(value) ? value : ''} disabled={disabled || readOnly} className={cn('w-14 cursor-pointer p-1', className)} {...props} onChange={event => choose(event.target.value)} />
      <Input type="text" aria-label={t('Hex color for {{label}}', { label: t(label) })} aria-invalid={invalid || undefined} aria-describedby={invalid ? `${base}-error` : undefined} value={text} disabled={disabled} readOnly={readOnly} spellCheck={false} autoComplete="off" className="min-w-0 max-w-44 flex-1 font-mono" placeholder="#RRGGBB"
        onCompositionStart={() => { composing.current = true; }} onCompositionEnd={event => { composing.current = false; if (valid(event.currentTarget.value)) choose(event.currentTarget.value); }}
        onChange={event => { if (disabled || readOnly) return; const next = event.target.value; setDraft(next); if (!composing.current && valid(next)) choose(next); }}
        onKeyDown={event => { if (event.key === 'Escape' && !composing.current) { event.preventDefault(); setDraft(null); } }} />
    </div>
    {invalid && <p id={`${base}-error`} role="status" className="text-sm text-danger">{t('Enter a six-digit hex color in #RRGGBB format.')}</p>}
    {palette.length > 0 && <div role="group" aria-label={t('Color palette for {{label}}', { label: t(label) })} className="flex flex-wrap gap-2">{[...new Set(palette.filter(valid).map(color => color.toLowerCase()))].map(color => <button key={color} type="button" aria-label={t('Choose color {{color}}', { color })} aria-pressed={color === value.toLowerCase()} disabled={disabled || readOnly} onClick={() => choose(color)} className="inline-flex size-8 items-center justify-center rounded-md border border-line bg-surface outline-none focus-visible:ring-2 focus-visible:ring-focus disabled:opacity-55 aria-pressed:ring-2 aria-pressed:ring-focus"><span className="size-5 rounded-sm border border-line" style={{ backgroundColor: color }} /></button>)}</div>}
  </div>;
});

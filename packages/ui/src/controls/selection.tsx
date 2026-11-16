// Author: yunnuo <ymz@ebox.vip>
// Description: Radio-backed segmented choice and removable selectable tags.
import { forwardRef, type HTMLAttributes, type ReactNode } from 'react';
import * as Radio from '@radix-ui/react-radio-group';
import { cn } from '../cn';
import { useControlI18n } from './messages';
import { CloseButton } from './actions';
import { useControllable } from './utils';

export interface SegmentOption { value: string; label: string; disabled?: boolean; icon?: ReactNode }
export type SegmentedControlProps = Omit<Radio.RadioGroupProps, 'children'> & { label: string; options: readonly SegmentOption[] };
export const SegmentedControl = forwardRef<HTMLDivElement, SegmentedControlProps>(function SegmentedControl({ label, options, className, ...props }, ref) {
  const { t } = useControlI18n();
  return <Radio.Root ref={ref} aria-label={t(label)} className={cn('inline-flex flex-wrap gap-1 rounded-lg bg-surface-alt p-1', className)} {...props}>{options.map(option => <Radio.Item key={option.value} value={option.value} disabled={props.disabled || option.disabled} className="inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm text-muted outline-none focus-visible:ring-2 focus-visible:ring-focus disabled:opacity-55 data-[state=checked]:bg-surface data-[state=checked]:text-ink data-[state=checked]:shadow-tint">{option.icon && <span aria-hidden="true">{option.icon}</span>}{t(option.label)}</Radio.Item>)}</Radio.Root>;
});
export interface TagItem { id: string; label: string; disabled?: boolean; removable?: boolean }
export type TagGroupProps = Omit<HTMLAttributes<HTMLUListElement>, 'onChange'> & { label: string; items: readonly TagItem[]; selectionMode?: 'none' | 'single' | 'multiple'; value?: string[]; defaultValue?: string[]; onValueChange?: (value: string[]) => void; onRemove?: (id: string) => void; disabled?: boolean };
export const TagGroup = forwardRef<HTMLUListElement, TagGroupProps>(function TagGroup({ label, items, selectionMode = 'none', value, defaultValue = [], onValueChange, onRemove, disabled, className, ...props }, ref) {
  const { t } = useControlI18n();
  const [selected, setSelected] = useControllable(value, defaultValue, onValueChange);
  return <ul ref={ref} aria-label={t(label)} className={cn('flex flex-wrap gap-2', className)} {...props}>{items.map(item => <li key={item.id} className="inline-flex items-center gap-1 rounded-md border border-line bg-surface-alt px-2 py-1 text-sm text-ink">
    {selectionMode === 'none' ? <span>{t(item.label)}</span> : <button type="button" disabled={disabled || item.disabled} aria-pressed={selected.includes(item.id)} className="rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-focus disabled:opacity-55 aria-pressed:font-semibold" onClick={() => setSelected(selected.includes(item.id) ? selected.filter(id => id !== item.id) : selectionMode === 'single' ? [item.id] : [...selected, item.id])}>{t(item.label)}</button>}
    {onRemove && item.removable !== false && <CloseButton className="size-6" label={t('Remove {{label}}', { label: t(item.label) })} disabled={disabled || item.disabled} onClick={() => onRemove(item.id)} />}
  </li>)}</ul>;
});

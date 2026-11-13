// Author: yunnuo <ymz@ebox.vip>
// Description: Keyboard-accessible year/month/day scroll columns for a date of birth, with leap-year and boundary checks.
import { useEffect, useId, useState } from 'react';
import { cn } from '../cn';
import { useCalendarI18n } from './messages';
import { daysInMonth, parseDate, todayDate, type DateOnly } from './date-utils';

export type BirthDatePickerProps = { label: string; value?: DateOnly | null; onChange: (date: DateOnly) => void; min?: DateOnly; max?: DateOnly; disabled?: boolean; className?: string };
export function BirthDatePicker({ label, value, onChange, min = '1900-01-01', max = todayDate(), disabled, className }: BirthDatePickerProps) {
  const { t } = useCalendarI18n(); const id = useId();
  const [draft, setDraft] = useState(() => parseDate(value ?? '') ?? { year: 0, month: 0, day: 0 });
  useEffect(() => { setDraft(parseDate(value ?? '') ?? { year: 0, month: 0, day: 0 }); }, [value]);
  const lower = parseDate(min) ?? { year: 1900, month: 1, day: 1 };
  const upper = parseDate(max) ?? parseDate(todayDate())!;
  const serialize = (date: typeof draft) => `${String(date.year).padStart(4, '0')}-${String(date.month).padStart(2, '0')}-${String(date.day).padStart(2, '0')}`;
  function change(part: keyof typeof draft, number: number) {
    const next = { ...draft, [part]: number };
    if (next.year && next.month && next.day) next.day = Math.min(next.day, daysInMonth(next.year, next.month));
    setDraft(next);
    const date = serialize(next);
    if (next.year && next.month && next.day && date >= min && date <= max) onChange(date);
  }
  const parts = [
    { key: 'year' as const, label: t('Year'), values: Array.from({ length: Math.max(0, upper.year - lower.year + 1) }, (_, index) => upper.year - index) },
    { key: 'month' as const, label: t('Month'), values: Array.from({ length: 12 }, (_, index) => index + 1) },
    { key: 'day' as const, label: t('Day'), values: Array.from({ length: draft.month ? daysInMonth(draft.year || 2000, draft.month) : 31 }, (_, index) => index + 1) },
  ];
  return <fieldset disabled={disabled} className={cn('min-w-0', className)}><legend className="mb-3 text-sm font-medium text-ink">{label}</legend><div className="grid grid-cols-3 gap-3">{parts.map(part => <div key={part.key} className="flex min-w-0 flex-col gap-2"><label htmlFor={`${id}-${part.key}`} className="text-xs text-muted">{part.label}</label><select id={`${id}-${part.key}`} size={5} aria-label={part.label} value={draft[part.key] || ''} onChange={event => change(part.key, Number(event.target.value))} className="h-44 w-full snap-y overflow-y-auto rounded-lg border border-transparent bg-field p-1 text-center text-base tabular-nums text-ink outline-none transition-colors hover:border-line-strong focus-visible:ring-2 focus-visible:ring-focus disabled:opacity-55">
    <option value="" disabled>{part.label}</option>{part.values.map(number => {
      const year = part.key === 'year' ? number : draft.year;
      const month = part.key === 'month' ? number : draft.month;
      const unavailable = part.key === 'month' && !!year && (`${year}-${String(number).padStart(2, '0')}` < min.slice(0, 7) || `${year}-${String(number).padStart(2, '0')}` > max.slice(0, 7)) || part.key === 'day' && !!year && !!month && (serialize({ year, month, day: number }) < min || serialize({ year, month, day: number }) > max);
      return <option key={number} value={number} disabled={unavailable} className="snap-center rounded-md py-2 checked:bg-primary-soft checked:text-accent">{number}</option>;
    })}</select></div>)}</div></fieldset>;
}

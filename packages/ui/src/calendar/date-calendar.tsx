// Author: yunnuo <ymz@ebox.vip>
// Description: Controlled date-only monthly calendar with roving keyboard focus and inclusive ranges.
import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '../button';
import { cn } from '../cn';
import { useCalendarI18n } from './messages';
import { addDays, addMonths, formatDate, isDateDisabled, isRangeAllowed, monthDays, monthStart, orderedRange, parseDate, todayDate, weekday, type DateConstraints, type DateOnly, type DateRange } from './date-utils';

type Selection = { mode?: 'single'; value?: DateOnly | null; onChange: (value: DateOnly) => void } | { mode: 'range'; value?: Partial<DateRange> | null; onChange: (value: Partial<DateRange>) => void };
export type DateCalendarProps = Selection & DateConstraints & {
  month?: DateOnly; defaultMonth?: DateOnly; onMonthChange?: (month: DateOnly) => void;
  locale?: string; weekStartsOn?: 0 | 1 | 2 | 3 | 4 | 5 | 6; numberOfMonths?: 1 | 2; className?: string; 'aria-label'?: string;
};
export function DateCalendar(props: DateCalendarProps) {
  const { locale, t } = useCalendarI18n(props.locale);
  const weekStartsOn = props.weekStartsOn ?? 0;
  const chosen = typeof props.value === 'string' ? props.value : props.value?.start;
  const initial = chosen && parseDate(chosen) ? chosen : props.min ?? todayDate();
  const [internalMonth, setInternalMonth] = useState(() => monthStart(props.defaultMonth ?? initial));
  // A two-month window cannot start after November of the final supported year.
  const requestedMonth = monthStart(props.month ?? internalMonth);
  const month = props.numberOfMonths === 2 && requestedMonth === '9999-12-01' ? '9999-11-01' : requestedMonth;
  const [focused, setFocused] = useState(initial);
  const root = useRef<HTMLDivElement>(null);
  const focusRequested = useRef(false);
  const id = useId();
  const count = props.numberOfMonths ?? 1;
  function changeMonth(next: DateOnly) { setInternalMonth(monthStart(next)); props.onMonthChange?.(monthStart(next)); }
  useEffect(() => {
    if (!focusRequested.current) return;
    const target = root.current?.querySelector<HTMLButtonElement>(`button[data-date="${focused}"]`);
    if (target) { target.focus(); focusRequested.current = false; }
  }, [focused, month]);
  function move(event: KeyboardEvent, date: DateOnly) {
    let next: DateOnly;
    try {
      switch (event.key) {
        case 'ArrowLeft': next = addDays(date, -1); break;
        case 'ArrowRight': next = addDays(date, 1); break;
        case 'ArrowUp': next = addDays(date, -7); break;
        case 'ArrowDown': next = addDays(date, 7); break;
        case 'Home': next = addDays(date, -((weekday(date) - weekStartsOn + 7) % 7)); break;
        case 'End': next = addDays(date, 6 - ((weekday(date) - weekStartsOn + 7) % 7)); break;
        case 'PageUp': next = addMonths(date, event.shiftKey ? -12 : -1); break;
        case 'PageDown': next = addMonths(date, event.shiftKey ? 12 : 1); break;
        default: return;
      }
    } catch { event.preventDefault(); return; }
    event.preventDefault();
    focusRequested.current = true;
    setFocused(next);
    if (next < month || monthStart(next) > addMonths(month, count - 1)) changeMonth(next);
  }
  function select(date: DateOnly) {
    if (isDateDisabled(date, props)) return;
    if (props.mode !== 'range') { props.onChange(date); return; }
    if (!props.value?.start || props.value.end) props.onChange({ start: date });
    else {
      const next = orderedRange(props.value.start, date);
      if (isRangeAllowed(next, props)) props.onChange(next);
    }
  }
  let previous: DateOnly | undefined;
  let next: DateOnly | undefined;
  try { previous = addMonths(month, -1); } catch { /* Gregorian lower boundary. */ }
  try { next = addMonths(month, 1); addMonths(next, count - 1); } catch { next = undefined; }
  const visibleFocus = monthStart(focused) >= month && monthStart(focused) <= addMonths(month, count - 1) ? focused : month;
  return <div ref={root} className={cn('min-w-0 space-y-3 text-ink', props.className)} aria-label={props['aria-label'] ?? t('Date calendar')}>
    <div className="flex items-center justify-between gap-2">
      <Button variant="ghost" size="icon" aria-label={t('Previous month')} disabled={props.disabled || !previous || !!(props.min && addMonths(month, 0) <= monthStart(props.min))} onClick={() => previous && changeMonth(previous)}><ChevronLeft size={16} /></Button>
      <span className="text-sm font-medium" aria-live="polite">{formatDate(month, locale, { month: 'long', year: 'numeric' })}{count === 2 && ` – ${formatDate(addMonths(month, 1), locale, { month: 'long', year: 'numeric' })}`}</span>
      <Button variant="ghost" size="icon" aria-label={t('Next month')} disabled={props.disabled || !next || !!(props.max && addMonths(month, count - 1) >= monthStart(props.max))} onClick={() => next && changeMonth(next)}><ChevronRight size={16} /></Button>
    </div>
    <div className={cn('grid gap-5', count === 2 && 'sm:grid-cols-2')}>
      {Array.from({ length: count }, (_, monthIndex) => {
        const visibleMonth = addMonths(month, monthIndex);
        const titleId = `${id}-${monthIndex}`;
        const days = monthDays(visibleMonth, weekStartsOn);
        return <div key={visibleMonth} className="min-w-0">
          <h3 id={titleId} className="mb-2 text-center text-sm font-medium">{formatDate(visibleMonth, locale, { month: 'long', year: 'numeric' })}</h3>
          <table role="grid" aria-labelledby={titleId} aria-multiselectable={props.mode === 'range' || undefined} className="w-full table-fixed border-collapse text-center text-sm">
            <thead><tr>{Array.from({ length: 7 }, (_, i) => <th key={i} scope="col" className="h-8 text-xs font-normal text-muted" abbr={formatDate(addDays('2024-01-07', (weekStartsOn + i) % 7), locale, { weekday: 'long' })}>{formatDate(addDays('2024-01-07', (weekStartsOn + i) % 7), locale, { weekday: 'short' })}</th>)}</tr></thead>
            <tbody>{Array.from({ length: 6 }, (_, row) => <tr key={row}>{days.slice(row * 7, row * 7 + 7).map((date, column) => {
              if (!date || monthStart(date) !== visibleMonth) return <td key={column} />;
              const disabled = isDateDisabled(date, props);
              const range = props.mode === 'range' ? props.value : null;
              const selected = props.mode === 'range' ? !!(range?.start && (date === range.start || (range.end && date >= range.start && date <= range.end))) : props.value === date;
              const edge = props.mode === 'range' ? date === range?.start || date === range?.end : selected;
              return <td key={column} role="gridcell" aria-selected={selected} className="p-0.5"><Button variant="ghost" size="icon" data-date={date} tabIndex={!props.disabled && date === visibleFocus ? 0 : -1} aria-label={formatDate(date, locale)} aria-current={date === todayDate() ? 'date' : undefined} aria-disabled={disabled} disabled={props.disabled} onFocus={() => setFocused(date)} onKeyDown={event => move(event, date)} onClick={() => select(date)} className={cn('h-9 w-full min-w-7 motion-reduce:transition-none', selected && 'bg-accent-soft text-accent', edge && 'bg-button text-on-primary hover:bg-button-hover', disabled && 'opacity-40')}>{Number(date.slice(8))}</Button></td>;
            })}</tr>)}</tbody>
          </table>
        </div>;
      })}
    </div>
  </div>;
}

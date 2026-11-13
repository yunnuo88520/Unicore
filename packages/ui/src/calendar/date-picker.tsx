// Author: yunnuo <ymz@ebox.vip>
// Description: Transactional date picker; all dismiss paths discard uncommitted editable dates.
import { useId, useState } from 'react';
import { CalendarDays } from 'lucide-react';
import { Button } from '../button';
import { Input, Label } from '../input';
import { Popover, PopoverContent, PopoverTrigger } from '../popover';
import { useCalendarI18n } from './messages';
import { DateCalendar } from './date-calendar';
import { formatDate, isDateDisabled, isRangeAllowed, parseDate, type DateConstraints, type DateOnly, type DateRange } from './date-utils';

export interface DateQuickRange { label: string; value: DateRange }
type PickerSelection = { mode?: 'single'; value?: DateOnly | null; onChange: (value: DateOnly) => void } | { mode: 'range'; value?: DateRange | null; onChange: (value: DateRange) => void };
export type DatePickerProps = PickerSelection & DateConstraints & { label?: string; locale?: string; quickRanges?: readonly DateQuickRange[]; className?: string; weekStartsOn?: 0 | 1 | 2 | 3 | 4 | 5 | 6 };
export function DatePicker(props: DatePickerProps) {
  const { locale, t } = useCalendarI18n(props.locale);
  const [open, setOpen] = useState(false);
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const id = useId();
  function reset() {
    setStart(typeof props.value === 'string' ? props.value : props.value?.start ?? '');
    setEnd(typeof props.value === 'object' ? props.value?.end ?? '' : '');
  }
  const valid = props.mode === 'range' ? isRangeAllowed({ start, end }, props) : !!parseDate(start) && !isDateDisabled(start, props);
  const display = typeof props.value === 'string' ? formatDate(props.value, locale, { dateStyle: 'medium' }) : props.value ? `${formatDate(props.value.start, locale, { dateStyle: 'medium' })} – ${formatDate(props.value.end, locale, { dateStyle: 'medium' })}` : t('Choose date');
  return <Popover open={open && !props.disabled} onOpenChange={next => { if (next) reset(); setOpen(next); }}>
    <PopoverTrigger asChild><Button variant="secondary" disabled={props.disabled} className={props.className} aria-label={props.label ?? (props.mode === 'range' ? t('Choose date range') : t('Choose date'))}><CalendarDays size={16} />{display}</Button></PopoverTrigger>
    <PopoverContent aria-label={props.label ?? t('Choose date')} className={`max-h-[85dvh] w-[min(22rem,calc(100vw-2rem))] overflow-y-auto motion-reduce:animate-none ${props.mode === 'range' ? 'sm:w-[min(42rem,calc(100vw-2rem))]' : ''}`}>
      <div className="mb-3 grid gap-3 sm:grid-cols-2">
        <div><Label htmlFor={`${id}-start`}>{props.mode === 'range' ? t('Start date') : t('Date')}</Label><Input id={`${id}-start`} type="text" inputMode="numeric" placeholder="YYYY-MM-DD" value={start} aria-invalid={!!start && (!parseDate(start) || isDateDisabled(start, props))} onChange={event => setStart(event.target.value)} /></div>
        {props.mode === 'range' && <div><Label htmlFor={`${id}-end`}>{t('End date')}</Label><Input id={`${id}-end`} type="text" inputMode="numeric" placeholder="YYYY-MM-DD" value={end} aria-invalid={!!end && !valid} onChange={event => setEnd(event.target.value)} /></div>}
      </div>
      {props.mode === 'range' && props.quickRanges && <div className="mb-3 flex flex-wrap gap-1" aria-label={t('Quick ranges')}>{props.quickRanges.map((range, index) => <Button key={index} size="sm" variant="secondary" disabled={!isRangeAllowed(range.value, props)} onClick={() => { setStart(range.value.start); setEnd(range.value.end); }}>{range.label}</Button>)}</div>}
      {props.mode === 'range' ? <DateCalendar mode="range" value={{ start: parseDate(start) ? start : undefined, end: parseDate(end) ? end : undefined }} onChange={value => { setStart(value.start ?? ''); setEnd(value.end ?? ''); }} min={props.min} max={props.max} disabledDate={props.disabledDate} numberOfMonths={2} locale={locale} weekStartsOn={props.weekStartsOn} /> : <DateCalendar value={parseDate(start) ? start : null} onChange={setStart} min={props.min} max={props.max} disabledDate={props.disabledDate} locale={locale} weekStartsOn={props.weekStartsOn} />}
      {(start || end) && !valid && <p role="status" className="mt-2 text-sm text-danger">{t('Enter an available date or complete date range in YYYY-MM-DD format.')}</p>}
      <div className="mt-4 flex justify-end gap-2"><Button variant="secondary" onClick={() => setOpen(false)}>{t('Cancel')}</Button><Button disabled={!valid || props.disabled} onClick={() => { if (!valid) return; if (props.mode === 'range') props.onChange({ start, end }); else props.onChange(start); setOpen(false); }}>{t('Apply')}</Button></div>
    </PopoverContent>
  </Popover>;
}

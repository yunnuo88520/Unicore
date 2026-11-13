// Author: yunnuo <ymz@ebox.vip>
// Description: Controlled meeting-slot presentation; callers supply actual offset-bearing instants and availability.
import { useId } from 'react';
import { Button } from '../button';
import { Label, NativeSelect } from '../input';
import { useCalendarI18n } from './messages';
import { DateCalendar } from './date-calendar';
import { dateInTimeZone, instantDate, isDateDisabled, type DateConstraints, type DateOnly } from './date-utils';

export interface MeetingSlot { id: string; start: string; end: string; disabled?: boolean; label?: string }
export interface MeetingSchedulerProps extends DateConstraints {
  date: DateOnly; onDateChange: (date: DateOnly) => void;
  timeZone: string; timeZones: readonly string[]; onTimeZoneChange: (zone: string) => void;
  hourCycle: 'h12' | 'h23'; onHourCycleChange: (cycle: 'h12' | 'h23') => void;
  slots: readonly MeetingSlot[]; selectedSlotId?: string | null; onSlotSelect: (slot: MeetingSlot) => void;
  locale?: string; className?: string;
}
export function MeetingScheduler(props: MeetingSchedulerProps) {
  const { locale, t } = useCalendarI18n(props.locale);
  const id = useId();
  // Validate the explicit zone even when no slots are provided; never silently fall back to the machine zone.
  const formatter = new Intl.DateTimeFormat(locale, { timeZone: props.timeZone, hour: 'numeric', minute: '2-digit', hourCycle: props.hourCycle, timeZoneName: 'short' });
  const visible = props.slots.filter(slot => {
    const start = instantDate(slot.start);
    const end = instantDate(slot.end);
    if (end <= start) throw new RangeError('Meeting slots must end after they start');
    return dateInTimeZone(slot.start, props.timeZone) === props.date;
  });
  return <section className={props.className} aria-label={t('Meeting scheduler')}>
    <div className="mb-4 grid gap-3 sm:grid-cols-2">
      <div><Label htmlFor={`${id}-zone`}>{t('Time zone')}</Label><NativeSelect id={`${id}-zone`} value={props.timeZone} disabled={props.disabled} onChange={event => props.onTimeZoneChange(event.target.value)}>{Array.from(new Set([props.timeZone, ...props.timeZones])).map(zone => <option key={zone} value={zone}>{zone}</option>)}</NativeSelect></div>
      <div><Label htmlFor={`${id}-cycle`}>{t('Time format')}</Label><NativeSelect id={`${id}-cycle`} value={props.hourCycle} disabled={props.disabled} onChange={event => props.onHourCycleChange(event.target.value as 'h12' | 'h23')}><option value="h12">{t('12-hour')}</option><option value="h23">{t('24-hour')}</option></NativeSelect></div>
    </div>
    <div className="grid gap-5 sm:grid-cols-2">
      <DateCalendar value={props.date} onChange={props.onDateChange} min={props.min} max={props.max} disabledDate={props.disabledDate} disabled={props.disabled} locale={locale} />
      <div><h3 className="mb-3 text-sm font-medium text-ink">{t('Available times')}</h3><div className="grid grid-cols-1 gap-2">{visible.map(slot => <Button key={slot.id} variant={props.selectedSlotId === slot.id ? 'primary' : 'secondary'} aria-pressed={props.selectedSlotId === slot.id} disabled={isDateDisabled(props.date, props) || slot.disabled} className="h-auto min-h-9 whitespace-normal motion-reduce:transition-none" onClick={() => props.onSlotSelect(slot)}>{slot.label ?? `${formatter.format(instantDate(slot.start))} – ${formatter.format(instantDate(slot.end))}`}</Button>)}</div>{!visible.length && <p role="status" className="text-sm text-muted">{t('No available times for this date.')}</p>}</div>
    </div>
  </section>;
}

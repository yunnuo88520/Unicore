// Author: yunnuo <ymz@ebox.vip>
// Description: Monthly caller-owned event data, overflow agenda and anchored detail actions; no recurrence engine.
import { useId, useState, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '../button';
import { Modal } from '../dialog';
import { Popover, PopoverContent, PopoverTrigger } from '../popover';
import { useCalendarI18n } from './messages';
import { cn } from '../cn';
import { addDays, addMonths, dateInTimeZone, formatDate, instantDate, monthDays, monthStart, parseDate, type DateOnly } from './date-utils';

type EventDates = { allDay: true; start: DateOnly; /** Exclusive end date, as in iCalendar; omission means one day. */ end?: DateOnly } | { allDay?: false; /** ISO instants with explicit offset. */ start: string; end: string };
export type CalendarEvent = EventDates & { id: string; title: string; description?: string; location?: string; tone?: 'default' | 'accent' | 'success' | 'warning' | 'danger' };
export interface EventCalendarProps {
  month: DateOnly; onMonthChange: (month: DateOnly) => void; events: readonly CalendarEvent[];
  /** Required display zone for timed events; all-day dates are zone-independent. */
  timeZone: string; locale?: string; weekStartsOn?: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  maxEventsPerDay?: number; renderEventActions?: (event: CalendarEvent) => ReactNode; className?: string;
}
const tones = { default: 'bg-surface-alt text-ink', accent: 'bg-primary-soft text-accent', success: 'bg-success-soft text-success', warning: 'bg-warning-soft text-warning', danger: 'bg-danger-soft text-danger' };
export function EventCalendar(props: EventCalendarProps) {
  const { locale, t } = useCalendarI18n(props.locale);
  const month = monthStart(props.month);
  const weekStartsOn = props.weekStartsOn ?? 0;
  const [agendaDate, setAgendaDate] = useState<DateOnly | null>(null);
  const heading = useId();
  const timedFormat = new Intl.DateTimeFormat(locale, { timeZone: props.timeZone, dateStyle: 'medium', timeStyle: 'short' });
  const spans = props.events.map(event => {
    if (event.allDay) {
      if (!parseDate(event.start) || (event.end && (!parseDate(event.end) || event.end <= event.start))) throw new RangeError('Invalid all-day event dates');
      return { event, start: event.start, last: event.end ? addDays(event.end, -1) : event.start };
    }
    const end = instantDate(event.end);
    if (end <= instantDate(event.start)) throw new RangeError('Events must end after they start');
    return { event, start: dateInTimeZone(event.start, props.timeZone), last: dateInTimeZone(new Date(end.getTime() - 1).toISOString(), props.timeZone) };
  });
  function eventsFor(date: DateOnly) { return spans.filter(span => span.start <= date && span.last >= date).map(span => span.event); }
  function eventTime(event: CalendarEvent) { return event.allDay ? t('All day') : `${timedFormat.format(instantDate(event.start))} – ${timedFormat.format(instantDate(event.end))} (${props.timeZone})`; }
  function eventTag(event: CalendarEvent) {
    return <Popover key={event.id}><PopoverTrigger asChild><Button variant="ghost" size="sm" className={cn('h-auto min-h-7 w-full justify-start overflow-hidden px-1 text-xs motion-reduce:transition-none', tones[event.tone ?? 'default'])}><span className="truncate">{event.title}</span></Button></PopoverTrigger><PopoverContent aria-label={event.title} className="max-h-[70dvh] max-w-[calc(100vw-2rem)] overflow-auto motion-reduce:animate-none"><h4 className="font-medium text-ink">{event.title}</h4><p className="mt-1 text-xs text-muted">{eventTime(event)}</p>{event.allDay && <p className="mt-1 text-xs text-muted">{formatDate(event.start, locale, { dateStyle: 'medium' })}{event.end && ` – ${formatDate(addDays(event.end, -1), locale, { dateStyle: 'medium' })}`}</p>}{event.location && <p className="mt-2 break-words text-sm text-ink">{event.location}</p>}{event.description && <p className="mt-2 whitespace-pre-wrap break-words text-sm text-muted">{event.description}</p>}{props.renderEventActions && <div className="mt-3 flex flex-wrap gap-2">{props.renderEventActions(event)}</div>}</PopoverContent></Popover>;
  }
  let previous: DateOnly | undefined;
  let next: DateOnly | undefined;
  try { previous = addMonths(month, -1); } catch { /* Supported date boundary. */ }
  try { next = addMonths(month, 1); } catch { /* Supported date boundary. */ }
  const days = monthDays(month, weekStartsOn);
  const max = Math.max(1, Math.floor(props.maxEventsPerDay ?? 2));
  return <section className={cn('min-w-0 text-ink', props.className)} aria-labelledby={heading}>
    <div className="mb-3 flex items-center justify-between gap-2"><Button variant="ghost" size="icon" disabled={!previous} aria-label={t('Previous month')} onClick={() => previous && props.onMonthChange(previous)}><ChevronLeft size={16} /></Button><h2 id={heading} aria-live="polite" className="text-sm font-medium">{formatDate(month, locale, { month: 'long', year: 'numeric' })}</h2><Button variant="ghost" size="icon" disabled={!next} aria-label={t('Next month')} onClick={() => next && props.onMonthChange(next)}><ChevronRight size={16} /></Button></div>
    <div className="overflow-x-auto"><table className="w-full min-w-[35rem] table-fixed border-collapse" aria-labelledby={heading}><thead><tr>{Array.from({ length: 7 }, (_, i) => <th key={i} scope="col" className="py-2 text-xs font-normal text-muted">{formatDate(addDays('2024-01-07', (weekStartsOn + i) % 7), locale, { weekday: 'short' })}</th>)}</tr></thead><tbody>{Array.from({ length: 6 }, (_, row) => <tr key={row}>{days.slice(row * 7, row * 7 + 7).map((date, col) => {
      if (!date || monthStart(date) !== month) return <td key={col} className="border border-line bg-surface-alt" />;
      const events = eventsFor(date);
      return <td key={col} className="h-28 align-top border border-line p-1"><time dateTime={date} aria-label={formatDate(date, locale)} className="mb-1 block text-xs tabular-nums text-muted">{Number(date.slice(8))}</time><div className="space-y-1">{events.slice(0, max).map(eventTag)}{events.length > max && <Button variant="ghost" size="sm" aria-label={t('{{count}} more events on {{date}}', { count: events.length - max, date: formatDate(date, locale) })} className="h-auto w-full justify-start px-1 text-xs" onClick={() => setAgendaDate(date)}>{t('+{{count}} more', { count: events.length - max })}</Button>}</div></td>;
    })}</tr>)}</tbody></table></div>
    {agendaDate && <Modal title={t('Events on {{date}}', { date: formatDate(agendaDate, locale) })} onClose={() => setAgendaDate(null)} contentClassName="motion-reduce:animate-none"><ul className="space-y-3">{eventsFor(agendaDate).map(event => <li key={event.id}>{eventTag(event)}<p className="mt-1 text-xs text-muted">{eventTime(event)}</p></li>)}</ul></Modal>}
  </section>;
}

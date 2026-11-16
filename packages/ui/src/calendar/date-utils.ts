// Author: yunnuo <ymz@ebox.vip>
// Description: Strict Gregorian date-only arithmetic; never parse dates in the host time zone.
export type DateOnly = string;
export interface DateRange { start: DateOnly; end: DateOnly }
export function parseDate(value: string): { year: number; month: number; day: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const [year, month, day] = match.slice(1).map(Number);
  if (year < 1 || month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) return null;
  return { year, month, day };
}
export function daysInMonth(year: number, month: number): number {
  return month === 2 ? (year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 29 : 28) : ([4, 6, 9, 11].includes(month) ? 30 : 31);
}
function civilDate(value: DateOnly): Date {
  const parts = parseDate(value);
  if (!parts) throw new RangeError(`Invalid date-only value: ${value}`);
  const date = new Date(0);
  date.setUTCFullYear(parts.year, parts.month - 1, parts.day);
  date.setUTCHours(12, 0, 0, 0);
  return date;
}
function serialize(date: Date): DateOnly {
  const year = date.getUTCFullYear();
  if (year < 1 || year > 9999) throw new RangeError('Date outside supported years 0001–9999');
  return `${String(year).padStart(4, '0')}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}
export function addDays(value: DateOnly, count: number): DateOnly {
  const date = civilDate(value);
  date.setUTCDate(date.getUTCDate() + count);
  return serialize(date);
}
export function addMonths(value: DateOnly, count: number): DateOnly {
  const parts = parseDate(value);
  if (!parts) throw new RangeError(`Invalid date-only value: ${value}`);
  const date = civilDate(value);
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() + count);
  date.setUTCDate(Math.min(parts.day, daysInMonth(date.getUTCFullYear(), date.getUTCMonth() + 1)));
  return serialize(date);
}
export function monthStart(value: DateOnly): DateOnly { civilDate(value); return `${value.slice(0, 7)}-01`; }
export function weekday(value: DateOnly): number { return civilDate(value).getUTCDay(); }
export function formatDate(value: DateOnly, locale: string, options: Intl.DateTimeFormatOptions = { dateStyle: 'full' }): string {
  return new Intl.DateTimeFormat(locale, { ...options, timeZone: 'UTC' }).format(civilDate(value));
}
export function todayDate(): DateOnly {
  const now = new Date();
  return `${String(now.getFullYear()).padStart(4, '0')}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}
export function orderedRange(a: DateOnly, b: DateOnly): DateRange { return a <= b ? { start: a, end: b } : { start: b, end: a }; }
export interface DateConstraints { min?: DateOnly; max?: DateOnly; disabledDate?: (date: DateOnly) => boolean; disabled?: boolean }
export function isDateDisabled(date: DateOnly, constraints: DateConstraints): boolean {
  return !!(constraints.disabled || !parseDate(date) || (constraints.min && date < constraints.min) || (constraints.max && date > constraints.max) || constraints.disabledDate?.(date));
}
export function isRangeAllowed(range: DateRange, constraints: DateConstraints): boolean {
  if (!parseDate(range.start) || !parseDate(range.end) || range.start > range.end) return false;
  if (isDateDisabled(range.start, constraints) || isDateDisabled(range.end, constraints)) return false;
  if (!constraints.disabledDate) return true;
  for (let day = range.start; ; day = addDays(day, 1)) {
    if (isDateDisabled(day, constraints)) return false;
    if (day === range.end) return true;
  }
}
/** Six stable rows, with null padding at the supported Gregorian year boundaries. */
export function monthDays(month: DateOnly, weekStartsOn = 0): (DateOnly | null)[] {
  const first = monthStart(month);
  const offset = (weekday(first) - weekStartsOn + 7) % 7;
  return Array.from({ length: 42 }, (_, index) => {
    try { return addDays(first, index - offset); } catch { return null; }
  });
}
/** Timed events MUST include Z or an explicit numeric offset; wall-clock strings are rejected. */
export function instantDate(value: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/.test(value) || !parseDate(value.slice(0, 10))) throw new RangeError('Expected an ISO datetime with explicit offset');
  const clock = value.slice(11).match(/^(\d{2}):(\d{2})(?::(\d{2}))?/)!;
  const offset = /([+-])(\d{2}):(\d{2})$/.exec(value);
  if (Number(clock[1]) > 23 || Number(clock[2]) > 59 || Number(clock[3] ?? 0) > 59 || (offset && (Number(offset[2]) > 23 || Number(offset[3]) > 59))) throw new RangeError('Invalid datetime clock or offset');
  const result = new Date(value);
  if (!Number.isFinite(result.getTime())) throw new RangeError('Invalid datetime');
  return result;
}
export function dateInTimeZone(instant: string, timeZone: string): DateOnly {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(instantDate(instant));
  return `${parts.find(p => p.type === 'year')!.value.padStart(4, '0')}-${parts.find(p => p.type === 'month')!.value}-${parts.find(p => p.type === 'day')!.value}`;
}

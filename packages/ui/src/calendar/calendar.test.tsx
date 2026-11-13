// Author: yunnuo <ymz@ebox.vip>
// Description: Calendar arithmetic and public selection, keyboard, draft and event semantics.
import { useState } from 'react';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { currentLocale, setLocale } from '../i18n';
import { describe, expect, it, vi } from 'vitest';
import { DateCalendar, DatePicker, EventCalendar, MeetingScheduler, addDays, addMonths, dateInTimeZone, formatDate, instantDate, isRangeAllowed, monthDays, parseDate, type DateRange } from './index';

describe('date-only arithmetic', () => {
  it('validates Gregorian leap years and clamps months without rollover', () => {
    expect(parseDate('2000-02-29')).not.toBeNull();
    expect(parseDate('1900-02-29')).toBeNull();
    expect(parseDate('2024-02-30')).toBeNull();
    expect(addMonths('2024-01-31', 1)).toBe('2024-02-29');
    expect(addMonths('2024-02-29', 12)).toBe('2025-02-28');
    expect(addDays('2024-12-31', 1)).toBe('2025-01-01');
    expect(addDays('2024-03-10', 1)).toBe('2024-03-11');
    expect(formatDate('0001-01-01', 'en-US', { year: 'numeric' })).toBe('1');
    expect(monthDays('0001-01-01')).toHaveLength(42);
    expect(() => addDays('9999-12-31', 1)).toThrow(RangeError);
  });
  it('rejects ranges crossing unavailable interior days', () => {
    expect(isRangeAllowed({ start: '2024-02-28', end: '2024-03-01' }, { disabledDate: date => date === '2024-02-29' })).toBe(false);
    expect(isRangeAllowed({ start: '2024-03-01', end: '2024-02-28' }, {})).toBe(false);
  });
  it('requires offset-bearing instants and projects into an explicit timezone', () => {
    expect(() => instantDate('2024-03-10T02:30:00')).toThrow();
    expect(dateInTimeZone('2024-03-10T01:00:00Z', 'America/Los_Angeles')).toBe('2024-03-09');
  });
});
it('uses Chinese host labels and switches an open draft to English without losing edits', () => {
  const original = currentLocale();
  try {
    act(() => setLocale('zh-CN'));
    render(<DatePicker value="2024-02-29" onChange={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: '选择日期' }));
    expect(screen.getByRole('button', { name: '上个月' })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('日期'), { target: { value: '2024-03-01' } });
    expect(screen.getByRole('button', { name: '应用' })).toBeEnabled();
    act(() => setLocale('en'));
    expect(screen.getByRole('button', { name: 'Apply' })).toBeEnabled();
    expect(screen.getByLabelText('Date')).toHaveValue('2024-03-01');
  } finally { act(() => setLocale(original)); }
});
it('localizes scheduler labels and event overflow in Chinese while retaining caller data', () => {
  render(<><MeetingScheduler locale="zh-CN" date="2024-02-29" onDateChange={vi.fn()} timeZone="UTC" timeZones={['UTC']} onTimeZoneChange={vi.fn()} hourCycle="h23" onHourCycleChange={vi.fn()} slots={[]} onSlotSelect={vi.fn()} /><EventCalendar locale="zh-CN" month="2024-02-01" onMonthChange={vi.fn()} timeZone="UTC" maxEventsPerDay={1} events={[{ id: 'one', title: 'Caller title', allDay: true, start: '2024-02-29' }, { id: 'two', title: 'Second title', allDay: true, start: '2024-02-29' }]} /></>);
  expect(screen.getByLabelText('时区')).toHaveValue('UTC');
  expect(screen.getByRole('option', { name: '24 小时制' })).toBeInTheDocument();
  expect(screen.getByText('此日期没有可选时间。')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /还有 1 个日程/ }));
  expect(screen.getByRole('dialog')).toHaveAccessibleName(/的日程/);
  expect(within(screen.getByRole('dialog')).getByRole('button', { name: 'Second title' })).toBeInTheDocument();
  expect(within(screen.getByRole('dialog')).getAllByText('全天')).toHaveLength(2);
});
function SingleCalendar() {
  const [value, setValue] = useState('2024-02-29');
  return <DateCalendar value={value} onChange={setValue} locale="en-US" />;
}
it('supports roving arrows, week endpoints and page month/year navigation', () => {
  render(<SingleCalendar />);
  const leap = screen.getByRole('button', { name: 'Thursday, February 29, 2024' });
  leap.focus();
  fireEvent.keyDown(leap, { key: 'ArrowRight' });
  expect(screen.getByRole('button', { name: 'Friday, March 1, 2024' })).toHaveFocus();
  fireEvent.keyDown(document.activeElement!, { key: 'Home' });
  expect(screen.getByRole('button', { name: 'Sunday, February 25, 2024' })).toHaveFocus();
  fireEvent.keyDown(document.activeElement!, { key: 'End' });
  expect(screen.getByRole('button', { name: 'Saturday, March 2, 2024' })).toHaveFocus();
  fireEvent.keyDown(document.activeElement!, { key: 'PageUp' });
  expect(screen.getByRole('button', { name: 'Friday, February 2, 2024' })).toHaveFocus();
  fireEvent.keyDown(document.activeElement!, { key: 'PageDown', shiftKey: true });
  expect(screen.getByRole('button', { name: 'Sunday, February 2, 2025' })).toHaveFocus();
});
it('does not select unavailable days and orders backward ranges', () => {
  const change = vi.fn();
  const { rerender } = render(<DateCalendar mode="range" value={{ start: '2024-02-29' }} onChange={change} locale="en-US" min="2024-02-20" />);
  fireEvent.click(screen.getByRole('button', { name: 'Monday, February 19, 2024' }));
  expect(change).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Wednesday, February 28, 2024' }));
  expect(change).toHaveBeenCalledWith({ start: '2024-02-28', end: '2024-02-29' });
  change.mockClear();
  rerender(<DateCalendar mode="range" value={{ start: '2024-02-27' }} onChange={change} locale="en-US" disabledDate={date => date === '2024-02-28'} />);
  fireEvent.click(screen.getByRole('button', { name: 'Thursday, February 29, 2024' }));
  expect(change).not.toHaveBeenCalled();
});
it('edits drafts, cancels without committing, and applies a single date', () => {
  const change = vi.fn();
  render(<DatePicker value="2024-02-29" onChange={change} locale="en-US" />);
  fireEvent.click(screen.getByRole('button', { name: 'Choose date' }));
  fireEvent.change(screen.getByLabelText('Date'), { target: { value: '2024-03-10' } });
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(change).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Choose date' }));
  expect(screen.getByLabelText('Date')).toHaveValue('2024-02-29');
  fireEvent.change(screen.getByLabelText('Date'), { target: { value: '2024-02-30' } });
  expect(screen.getByRole('button', { name: 'Apply' })).toBeDisabled();
  fireEvent.change(screen.getByLabelText('Date'), { target: { value: '2024-03-10' } });
  fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
  expect(change).toHaveBeenCalledExactlyOnceWith('2024-03-10');
});
it('offers two responsive range months and quick ranges as drafts only', () => {
  const change = vi.fn();
  const range: DateRange = { start: '2024-12-30', end: '2025-01-02' };
  render(<DatePicker mode="range" value={range} onChange={change} quickRanges={[{ label: 'Holiday', value: { start: '2024-12-31', end: '2025-01-01' } }]} locale="en-US" />);
  fireEvent.click(screen.getByRole('button', { name: 'Choose date range' }));
  expect(screen.getAllByRole('grid')).toHaveLength(2);
  fireEvent.click(screen.getByRole('button', { name: 'Holiday' }));
  expect(change).not.toHaveBeenCalled();
  expect(screen.getByLabelText('Start date')).toHaveValue('2024-12-31');
  fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
  expect(change).toHaveBeenCalledWith({ start: '2024-12-31', end: '2025-01-01' });
});
it('discards escaped drafts and disables the trigger without callbacks', () => {
  const change = vi.fn();
  const { rerender } = render(<DatePicker value="2024-02-29" onChange={change} locale="en" />);
  fireEvent.click(screen.getByRole('button', { name: 'Choose date' }));
  fireEvent.change(screen.getByLabelText('Date'), { target: { value: '2025-01-01' } });
  fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Choose date' }));
  expect(screen.getByLabelText('Date')).toHaveValue('2024-02-29');
  rerender(<DatePicker value="2024-02-29" onChange={change} locale="en" disabled />);
  expect(screen.getByRole('button', { name: 'Choose date' })).toBeDisabled();
  expect(change).not.toHaveBeenCalled();
});
it('renders localized labels and the final Gregorian two-month window safely', () => {
  render(<DateCalendar mode="range" value={{ start: '9999-12-31' }} onChange={vi.fn()} numberOfMonths={2} locale="de-DE" />);
  expect(screen.getAllByRole('grid')).toHaveLength(2);
  expect(screen.getByRole('button', { name: 'Freitag, 31. Dezember 9999' })).toHaveAttribute('tabindex', '0');
  expect(screen.getByRole('button', { name: 'Next month' })).toBeDisabled();
});
it('renders distinct DST-fold slots from caller instants and stays controlled', () => {
  const select = vi.fn();
  const zone = vi.fn();
  const slot = { id: 'first', start: '2024-11-03T01:30:00-07:00', end: '2024-11-03T01:45:00-07:00' };
  render(<MeetingScheduler date="2024-11-03" onDateChange={vi.fn()} timeZone="America/Los_Angeles" timeZones={['UTC']} onTimeZoneChange={zone} hourCycle="h12" onHourCycleChange={vi.fn()} slots={[slot, { id: 'second', start: '2024-11-03T01:30:00-08:00', end: '2024-11-03T01:45:00-08:00', disabled: true }]} onSlotSelect={select} locale="en-US" />);
  fireEvent.click(screen.getByRole('button', { name: /PDT/ }));
  expect(select).toHaveBeenCalledWith(slot);
  expect(screen.getByRole('button', { name: /PST/ })).toBeDisabled();
  fireEvent.change(screen.getByLabelText('Time zone'), { target: { value: 'UTC' } });
  expect(zone).toHaveBeenCalledWith('UTC');
});
it('renders caller events with overflow, anchored details and exclusive all-day ends', () => {
  render(<EventCalendar month="2024-02-01" onMonthChange={vi.fn()} timeZone="UTC" locale="en-US" maxEventsPerDay={1} events={[{ id: 'a', title: 'Planning', allDay: true, start: '2024-02-29', end: '2024-03-01', description: 'Caller description' }, { id: 'b', title: 'Review', start: '2024-02-29T15:00:00Z', end: '2024-02-29T16:00:00Z' }]} renderEventActions={() => <button>Caller action</button>} />);
  fireEvent.click(screen.getByRole('button', { name: 'Planning' }));
  expect(screen.getByText('Caller description')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Caller action' })).toBeInTheDocument();
  fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
  fireEvent.click(screen.getByRole('button', { name: /1 more events on/ }));
  expect(within(screen.getByRole('dialog')).getByRole('button', { name: 'Review' })).toBeInTheDocument();
});

// Author: yunnuo <ymz@ebox.vip>
// Description: Scroll-column dates retain Gregorian validity and reject dates outside the requested window.
import { act, fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { setLocale } from '../i18n';
import { BirthDatePicker } from './birth-date-picker';

it('clamps leap day after a year change and excludes future dates', () => {
  act(() => setLocale('en')); const change = vi.fn();
  render(<BirthDatePicker label="Birthday" value="2000-02-29" onChange={change} max="2026-11-13" />);
  fireEvent.change(screen.getByRole('listbox', { name: 'Year' }), { target: { value: '2001' } });
  expect(screen.getByRole('listbox', { name: 'Day' })).toHaveValue('28'); expect(change).toHaveBeenCalledWith('2001-02-28');
  fireEvent.change(screen.getByRole('listbox', { name: 'Year' }), { target: { value: '2026' } });
  fireEvent.change(screen.getByRole('listbox', { name: 'Month' }), { target: { value: '11' } });
  expect(screen.getByRole('option', { name: '30' })).toBeDisabled();
});

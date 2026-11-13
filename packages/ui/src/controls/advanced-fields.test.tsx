// Author: yunnuo <ymz@ebox.vip>
// Description: User-visible range synchronization, tag editing and cascading selection boundaries.
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it, vi } from 'vitest';
import { setLocale } from '../i18n';
import { Cascader, RangeSlider, TagInput } from './advanced-fields';

beforeEach(() => act(() => setLocale('en')));
it('keeps range thumbs and exact numeric inputs synchronized without crossing', () => {
  const change = vi.fn(); render(<RangeSlider label="Price" defaultValue={[20, 80]} onValueChange={change} step={5} />);
  fireEvent.change(screen.getByRole('slider', { name: 'Minimum Price' }), { target: { value: '95' } });
  expect(screen.getByRole('spinbutton', { name: 'Minimum' })).toHaveValue(80);
  expect(change).toHaveBeenLastCalledWith([80, 80]);
  fireEvent.change(screen.getByRole('spinbutton', { name: 'Maximum' }), { target: { value: '100' } });
  expect(screen.getByRole('slider', { name: 'Maximum Price' })).toHaveValue('100');
});
it('adds tags with Enter, keeps IME confirmation separate and removes explicitly', async () => {
  const user = userEvent.setup(); render(<TagInput label="Skills" maxTags={2} />);
  const input = screen.getByRole('textbox', { name: 'Skills' });
  await user.type(input, 'React'); fireEvent.keyDown(input, { key: 'Enter', isComposing: true });
  expect(screen.queryByRole('button', { name: 'Remove React' })).not.toBeInTheDocument();
  await user.keyboard('{Enter}'); expect(input).toHaveValue('');
  await user.type(input, 'React{Enter}'); expect(screen.getByRole('alert')).toHaveTextContent('This tag already exists');
  await user.click(screen.getByRole('button', { name: 'Remove React' })); expect(screen.queryByRole('button', { name: 'Remove React' })).not.toBeInTheDocument();
});
it('opens the next hierarchy beside its parent and discards stale descendants', async () => {
  const user = userEvent.setup(), change = vi.fn();
  render(<Cascader label="Region" onValueChange={change} options={[{ value: 'a', label: 'North', children: [{ value: 'aa', label: 'River', children: [{ value: 'aaa', label: 'Old town' }] }] }, { value: 'b', label: 'South', children: [{ value: 'bb', label: 'Lake' }] }]} />);
  await user.click(screen.getByRole('button', { name: 'Region' }));
  await user.click(screen.getByRole('option', { name: 'North' })); await user.click(screen.getByRole('option', { name: 'River' }));
  expect(screen.getAllByRole('listbox')).toHaveLength(3);
  await user.click(screen.getByRole('option', { name: 'South' })); expect(screen.queryByRole('option', { name: 'Old town' })).not.toBeInTheDocument();
  await user.click(within(screen.getByRole('listbox', { name: 'Level 2' })).getByRole('option', { name: 'Lake' }));
  expect(change).toHaveBeenCalledExactlyOnceWith(['b', 'bb']);
});

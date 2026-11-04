// Author: yunnuo <ymz@ebox.vip>
// Description: Switch and Checkbox controlled semantics with the boolean API.
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import { Checkbox } from './checkbox';
import { Switch } from './switch';

it('switch toggles through onChange and reflects the checked state', async () => {
  const onChange = vi.fn();
  const { rerender } = render(<Switch checked={false} onChange={onChange} />);
  await userEvent.click(screen.getByRole('switch'));
  expect(onChange).toHaveBeenCalledWith(true);
  rerender(<Switch checked onChange={onChange} />);
  expect(screen.getByRole('switch')).toHaveAttribute('data-state', 'checked');
});

it('disabled switch ignores interaction', async () => {
  const onChange = vi.fn();
  render(<Switch checked={false} disabled onChange={onChange} />);
  await userEvent.click(screen.getByRole('switch'));
  expect(onChange).not.toHaveBeenCalled();
});

it('checkbox reports plain booleans and supports the inline label', async () => {
  const onChange = vi.fn();
  render(<Checkbox checked={false} onChange={onChange}>同意</Checkbox>);
  await userEvent.click(screen.getByRole('checkbox'));
  expect(onChange).toHaveBeenCalledWith(true);
  expect(screen.getByText('同意')).toHaveAttribute('for');
});

it('indeterminate checkbox renders neither checked nor unchecked mark', () => {
  render(<Checkbox checked="indeterminate" onChange={() => {}} aria-label="部分" />);
  expect(screen.getByRole('checkbox')).toHaveAttribute('data-state', 'indeterminate');
});

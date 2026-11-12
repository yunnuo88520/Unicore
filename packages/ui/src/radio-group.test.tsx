// Author: yunnuo <ymz@ebox.vip>
// Description: RadioGroup selection semantics and pill items.
import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import { RadioGroup, RadioGroupItem } from './radio-group';

it('renders a labelled group with selectable pill items', () => {
  render(<RadioGroup label="运行形态" value="standalone">
    <RadioGroupItem value="standalone" itemLabel="单机模式">单机模式</RadioGroupItem>
    <RadioGroupItem value="platform" itemLabel="多用户平台">多用户平台</RadioGroupItem>
  </RadioGroup>);
  const group = screen.getByRole('radiogroup', { name: '运行形态' });
  expect(group).toBeInTheDocument();
  expect(screen.getByRole('radio', { name: '单机模式' })).toHaveAttribute('data-state', 'checked');
  expect(screen.getByRole('radio', { name: '多用户平台' })).toHaveAttribute('data-state', 'unchecked');
});

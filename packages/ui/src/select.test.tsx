// Author: yunnuo <ymz@ebox.vip>
// Description: SimpleSelect exposes the label and placeholder through aria semantics.
import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import { SimpleSelect } from './select';

it('renders the trigger with localized label and current selection', () => {
  render(<SimpleSelect label="存储类型" placeholder="请选择" value="local" onChange={() => {}} options={[{ value: 'local', label: '本地磁盘' }]} />);
  const trigger = screen.getByRole('combobox');
  expect(trigger).toHaveAttribute('aria-label', '存储类型');
  expect(trigger).toHaveTextContent('本地磁盘');
});

it('disabled trigger cannot be opened', () => {
  render(<SimpleSelect label="状态" value="on" disabled onChange={() => {}} options={[{ value: 'on', label: '开启' }]} />);
  expect(screen.getByRole('combobox')).toBeDisabled();
});

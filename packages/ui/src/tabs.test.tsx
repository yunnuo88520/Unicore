// Author: yunnuo <ymz@ebox.vip>
// Description: Tabs controlled items API with dirty markers and stable panel ids.
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import { Tabs } from './tabs';

const items = [
  { id: 'general', label: '通用' },
  { id: 'advanced', label: '高级', dirty: true },
];

it('marks the active tab, exposes panel ids and reports changes', async () => {
  const onChange = vi.fn();
  render(<Tabs id="settings" label="设置" items={items} value="general" onChange={onChange} />);
  const active = screen.getByRole('tab', { name: '通用' });
  expect(active).toHaveAttribute('aria-selected', 'true');
  expect(active).toHaveAttribute('aria-controls', 'settings-panel-general');
  expect(screen.getByRole('tab', { name: /高级/ })).toHaveAttribute('aria-selected', 'false');
  await userEvent.click(screen.getByRole('tab', { name: /高级/ }));
  expect(onChange).toHaveBeenCalledWith('advanced');
});

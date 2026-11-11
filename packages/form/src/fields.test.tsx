// Author: yunnuo <ymz@ebox.vip>
// Description: Declarative non-native fields wire Controller semantics through the shared primitives.
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import { AppCheckboxField, AppSelectField, AppSwitchField } from './fields';
import { AppForm, useAppForm } from './form';

type Values = { provider: string; enabled: boolean; accepted: boolean };

function Harness({ onSubmit, defaults }: { onSubmit: (values: Values) => void; defaults?: Partial<Values> }) {
  const form = useAppForm<Values>({
    defaultValues: { provider: '', enabled: false, accepted: false, ...defaults },
    onSubmit,
  });
  return <AppForm form={form}>
    <AppSelectField name="provider" label="存储类型" options={[{ value: 'local', label: '本地磁盘' }, { value: 's3', label: '对象存储' }]} />
    <AppSwitchField name="enabled" label="启用策略" />
    <AppCheckboxField name="accepted" label="我已备份" />
    <button type="submit">提交</button>
  </AppForm>;
}

it('switch and checkbox toggle boolean values through the controller', async () => {
  const user = userEvent.setup();
  const onSubmit = vi.fn();
  render(<Harness onSubmit={onSubmit} defaults={{ enabled: true }} />);
  expect((screen.getByRole('switch')).getAttribute('data-state')).toBe('checked');
  await user.click(screen.getByRole('switch'));
  expect(screen.getByRole('switch').getAttribute('data-state')).toBe('unchecked');
  await user.click(screen.getByRole('checkbox'));
  expect(screen.getByRole('checkbox').getAttribute('data-state')).toBe('checked');
});

it('selects are driven by the controller value and submit collected values', async () => {
  const user = userEvent.setup();
  const onSubmit = vi.fn();
  render(<Harness onSubmit={onSubmit} />);
  const trigger = screen.getByRole('combobox');
  await user.click(trigger);
  await user.click(await screen.findByRole('option', { name: '本地磁盘' }));
  expect(trigger).toHaveTextContent('本地磁盘');
  await user.click(screen.getByRole('button', { name: '提交' }));
  expect(onSubmit).toHaveBeenCalledWith({ provider: 'local', enabled: false, accepted: false });
});

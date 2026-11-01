// Author: yunnuo <ymz@ebox.vip>
// Description: Contract validation stops transport calls, announces fields and focuses the first invalid control.
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import { AppError } from '@unicore/sdk';
import { AppForm, AppField, useAppForm } from './lib/form';

function Harness({ onSubmit, serverError }: { onSubmit: (values: { recipient: string }) => void; serverError?: AppError | null }) {
  const form = useAppForm({ schema: 'MailTestInput', defaultValues: { recipient: '' }, onSubmit });
  return <AppForm form={form}>
    <AppField name="recipient" label="测试邮箱"><input /></AppField>
    {serverError && <button type="button" onClick={() => form.applyServerError(serverError)}>应用服务端错误</button>}
    <button type="submit">保存</button>
  </AppForm>;
}

it('blocks invalid contracts and focuses/announces the field', async () => {
  const submit = vi.fn();
  render(<Harness onSubmit={submit} />);
  await userEvent.click(screen.getByRole('button', { name: '保存' }));
  expect(submit).not.toHaveBeenCalled();
  expect(screen.getByLabelText('测试邮箱')).toHaveFocus();
  expect(screen.getByLabelText('测试邮箱')).toHaveAttribute('aria-invalid', 'true');
  expect(screen.getByRole('alert', { name: '表单校验' })).toHaveTextContent('至少 3 个字符');
});

it('shows server field errors and submits valid values once resolved', async () => {
  const submit = vi.fn();
  render(<Harness onSubmit={submit} serverError={new AppError('INVALID_INPUT', '请检查输入', 'request', { recipient: '邮箱格式不正确' })} />);
  await userEvent.click(screen.getByRole('button', { name: '应用服务端错误' }));
  expect(screen.getByLabelText('测试邮箱')).toHaveFocus();
  expect(screen.getByRole('alert', { name: '表单校验' })).toHaveTextContent('邮箱格式不正确');
  await userEvent.type(screen.getByLabelText('测试邮箱'), 'user@example.test');
  await userEvent.click(screen.getByRole('button', { name: '保存' }));
  expect(submit).toHaveBeenCalledWith({ recipient: 'user@example.test' });
});

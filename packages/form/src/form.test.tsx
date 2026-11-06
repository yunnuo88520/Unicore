// Author: yunnuo <ymz@ebox.vip>
// Description: Contract validation stops transport calls, announces fields and focuses the first invalid control.
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import { AppError } from '@unicore/sdk';
import { AppForm, AppField, useAppForm } from './form';

function Harness({ onSubmit, serverError }: { onSubmit: (values: { recipient: string }) => void; serverError?: AppError | null }) {
  const form = useAppForm({ schema: 'MailTestInput', defaultValues: { recipient: '' }, onSubmit });
  return <AppForm form={form}>
    <AppField name="recipient" label="测试邮箱"><input /></AppField>
    {serverError && <button type="button" onClick={() => form.applyServerError(serverError)}>应用服务端错误</button>}
    <button type="submit">保存</button>
  </AppForm>;
}

it('blocks invalid contracts and focuses/announces the field without a duplicate banner', async () => {
  const submit = vi.fn();
  render(<Harness onSubmit={submit} />);
  await userEvent.click(screen.getByRole('button', { name: '保存' }));
  expect(submit).not.toHaveBeenCalled();
  expect(screen.getByLabelText('测试邮箱')).toHaveFocus();
  expect(screen.getByLabelText('测试邮箱')).toHaveAttribute('aria-invalid', 'true');
  // Field errors render inline only; the form-wide banner must not repeat them.
  expect(screen.queryByRole('alert', { name: '表单校验' })).toBeNull();
  expect(screen.getByRole('alert')).toHaveTextContent('至少 3 个字符');
});

it('shows server field errors inline and submits valid values once resolved', async () => {
  const submit = vi.fn();
  render(<Harness onSubmit={submit} serverError={new AppError('INVALID_INPUT', '请检查输入', 'request', { recipient: '邮箱格式不正确' })} />);
  await userEvent.click(screen.getByRole('button', { name: '应用服务端错误' }));
  expect(screen.getByLabelText('测试邮箱')).toHaveFocus();
  expect(screen.queryByRole('alert', { name: '表单校验' })).toBeNull();
  expect(screen.getByRole('alert')).toHaveTextContent('邮箱格式不正确');
  await userEvent.type(screen.getByLabelText('测试邮箱'), 'user@example.test');
  await userEvent.click(screen.getByRole('button', { name: '保存' }));
  expect(submit).toHaveBeenCalledWith({ recipient: 'user@example.test' });
});

it('keeps the form-wide banner only for $form-level server errors', async () => {
  const submit = vi.fn();
  render(<Harness onSubmit={submit} serverError={new AppError('INVALID_INPUT', '请求无效', 'request', { $form: '请先保存 SMTP 配置并成功发送测试邮件' })} />);
  await userEvent.click(screen.getByRole('button', { name: '应用服务端错误' }));
  expect(screen.getByRole('alert', { name: '表单校验' })).toHaveTextContent('请先保存 SMTP 配置并成功发送测试邮件');
});

function TwinForms({ serverError }: { serverError: AppError }) {
  const first = useAppForm({ schema: 'MailTestInput', defaultValues: { recipient: '' }, onSubmit: () => {} });
  const second = useAppForm({ schema: 'MailTestInput', defaultValues: { recipient: '' }, onSubmit: () => {} });
  return <>
    <AppForm form={first} aria-label="甲表单"><AppField name="recipient" label="甲字段"><input /></AppField></AppForm>
    <AppForm form={second} aria-label="乙表单">
      <AppField name="recipient" label="乙字段"><input /></AppField>
      <button type="button" onClick={() => second.applyServerError(serverError)}>触发乙表单错误</button>
    </AppForm>
  </>;
}

it('scopes server error focus to the form that submitted, not the first match on the page', async () => {
  render(<TwinForms serverError={new AppError('INVALID_INPUT', '请求无效', 'request', { recipient: '邮箱格式不正确' })} />);
  await userEvent.click(screen.getByRole('button', { name: '触发乙表单错误' }));
  expect(screen.getByLabelText('乙字段')).toHaveFocus();
  expect(screen.getByLabelText('甲字段')).not.toHaveFocus();
});

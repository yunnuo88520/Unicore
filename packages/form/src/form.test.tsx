// Author: yunnuo <ymz@ebox.vip>
// Description: Contract validation stops transport calls, announces fields and focuses the first invalid control.
import { render, screen } from '@testing-library/react';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import { AppError } from '@unicore/sdk';
import { AppForm, AppField, AppControllerField, useAppForm } from './form';

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

it.each(['registered', 'controlled'])('keeps %s server errors on blur until the value is edited', async kind => {
  function ServerForm() {
    const form = useAppForm({ defaultValues: { recipient: 'existing@example.test' }, onSubmit: () => {} });
    return <AppForm form={form}>
      {kind === 'registered' ? <AppField name="recipient" label="邮箱"><input /></AppField>
        : <AppControllerField name="recipient" label="邮箱">{field => <input {...field} value={String(field.value)} onChange={event => field.onChange(event.target.value)} />}</AppControllerField>}
      <button type="button" onClick={() => form.applyServerError(new AppError('CONFLICT', '重复邮箱', '', { recipient: '邮箱已注册' }))}>应用错误</button>
      <a href="/login">返回登录</a>
    </AppForm>;
  }
  render(<ServerForm />);
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: '应用错误' }));
  expect(screen.getByLabelText('邮箱')).toHaveFocus();
  await user.tab();
  expect(screen.getByRole('alert')).toHaveTextContent('邮箱已注册');
  await user.type(screen.getByLabelText('邮箱'), '2');
  expect(screen.queryByRole('alert')).toBeNull();
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

function NestedHarness({ onSubmit }: { onSubmit: (values: { recipient: string }) => void }) {
  const form = useAppForm({ schema: 'MailTestInput', defaultValues: { recipient: '' }, onSubmit });
  // Mirror the real editor dialogs: Radix portals their <form> to document.body
  // while the React tree still nests it under the page form.
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  return <AppForm form={form}>
    <AppField name="recipient" label="测试邮箱"><input /></AppField>
    <button type="submit">外层提交</button>
    {mounted && createPortal(<form onSubmit={event => event.preventDefault()}>
      <button type="submit">内层提交</button>
    </form>, document.body)}
  </AppForm>;
}

it('ignores submit events bubbling from nested forms (editor dialogs)', async () => {
  const onSubmit = vi.fn().mockResolvedValue(undefined);
  const user = userEvent.setup();
  render(<NestedHarness onSubmit={onSubmit} />);
  await user.click(screen.getByRole('button', { name: '内层提交' }));
  expect(onSubmit).not.toHaveBeenCalled();
  await user.type(screen.getByLabelText('测试邮箱'), 'recipient@example.test');
  await user.click(screen.getByRole('button', { name: '外层提交' }));
  expect(onSubmit).toHaveBeenCalledTimes(1);
});


it('validates on blur and keeps field help associated before and after correction', async () => {
  const { Input } = await import('@unicore/ui');
  function BlurForm() {
    const form = useAppForm({ schema: 'MailTestInput', defaultValues: { recipient: '' }, onSubmit: () => {} });
    return <AppForm form={form}><AppField name="recipient" label="收件邮箱" hint="请填写完整邮箱"><Input type="email" /></AppField><button type="button">离开</button></AppForm>;
  }
  render(<BlurForm />);
  const user = userEvent.setup();
  const input = screen.getByLabelText('收件邮箱');
  await user.type(input, 'bad');
  expect(screen.queryByRole('alert')).toBeNull();
  await user.tab();
  expect(await screen.findByRole('alert')).toBeVisible();
  expect(input).toHaveAccessibleDescription(/请填写完整邮箱/);
  await user.clear(input);
  await user.type(input, 'good@example.test');
  expect(screen.getByRole('alert')).toBeVisible();
  await user.tab();
  expect(screen.queryByRole('alert')).toBeNull();
  expect(input).toHaveAccessibleDescription('请填写完整邮箱');
});

// Author: yunnuo <ymz@ebox.vip>
// Description: Input family renders native semantics with shared control styling.
import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import { controlVariants, Input, Label, NativeSelect, Textarea } from './input';

it('input forwards value and type to the native element', () => {
  render(<Input value="文本" type="email" onChange={() => {}} aria-label="邮箱" />);
  const input = screen.getByLabelText('邮箱');
  expect(input).toHaveAttribute('type', 'email');
  expect(input).toHaveValue('文本');
});

it('textarea and native select stay controllable', () => {
  render(<>
    <Textarea value="多行" onChange={() => {}} aria-label="备注" />
    <NativeSelect value="b" onChange={() => {}} aria-label="选项">
      <option value="a">A</option>
      <option value="b">B</option>
    </NativeSelect>
  </>);
  expect(screen.getByLabelText('备注')).toHaveValue('多行');
  expect(screen.getByLabelText('选项')).toHaveValue('b');
});

it('label associates through htmlFor', () => {
  render(<><Label htmlFor="name">名称</Label><Input id="name" /></>);
  expect(screen.getByLabelText('名称')).toBeInTheDocument();
});

it('keeps required marks out of floating field names', () => {
  render(<><Input label="名称" required /><Textarea label="说明" required /></>);
  expect(screen.getByLabelText('名称')).toHaveAccessibleName('名称');
  expect(screen.getByLabelText('说明')).toHaveAccessibleName('说明');
  expect(screen.getByRole('textbox', { name: '名称' })).toBeRequired();
  expect(screen.getByRole('textbox', { name: '说明' })).toBeRequired();
});

it('preserves a host label without duplicating its identifier', () => {
  render(<><span id="host-label">外部名称</span><Input id="host" label="框内名称" aria-labelledby="host-label" /></>);
  expect(screen.getByRole('textbox')).toHaveAccessibleName('外部名称');
  expect(document.querySelectorAll('[id="host-label"]')).toHaveLength(1);
});

it('exports the control surface through cva for composition', () => {
  expect(controlVariants()).toContain('focus-visible:ring-focus');
  expect(controlVariants()).toContain('aria-invalid:border-danger');
});

it('keeps a real label and preserves a new password while toggling visibility', async () => {
  const { default: userEvent } = await import('@testing-library/user-event');
  const user = userEvent.setup();
  render(<Input label="新密码" type="password" autoComplete="new-password" />);
  const input = screen.getByLabelText('新密码');
  await user.type(input, 'A-strong-password-2048');
  expect(screen.getByRole('meter')).toHaveAttribute('aria-valuenow', '4');
  await user.click(screen.getByRole('button', { name: '显示新密码' }));
  expect(input).toHaveAttribute('type', 'text');
  expect(input).toHaveValue('A-strong-password-2048');
  expect(input).toHaveFocus();
  expect(document.querySelector(`label[for="${input.id}"]`)).toHaveTextContent('新密码');
  await user.click(screen.getByRole('button', { name: '隐藏新密码' }));
  expect(input).toHaveAttribute('type', 'password');
  expect(input).toHaveFocus();
});

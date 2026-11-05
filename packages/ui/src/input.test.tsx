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

it('exports the control surface through cva for composition', () => {
  expect(controlVariants()).toContain('focus-visible:ring-focus');
  expect(controlVariants()).toContain('aria-invalid:border-danger');
});

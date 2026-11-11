// Author: yunnuo <ymz@ebox.vip>
// Description: Button variants, pending semantics and default submit suppression.
import { render, screen } from '@testing-library/react';
import { createRef } from 'react';
import { expect, it } from 'vitest';
import { Button } from './button';

it('renders variants with merged classes and defaults to type=button', () => {
  render(<Button variant="danger" size="sm" className="extra">删除</Button>);
  const button = screen.getByRole('button', { name: '删除' });
  expect(button).toHaveAttribute('type', 'button');
  expect(button.className).toContain('extra');
  expect(button.className).toContain('bg-danger');
});

it('type=submit is preserved for forms', () => {
  render(<Button type="submit">保存</Button>);
  expect(screen.getByRole('button')).toHaveAttribute('type', 'submit');
});

it('pending disables the button, sets aria-busy and shows a spinner', () => {
  render(<Button pending>提交</Button>);
  const button = screen.getByRole('button');
  expect(button).toBeDisabled();
  expect(button).toHaveAttribute('aria-busy', 'true');
  expect(button.querySelector('svg')).not.toBeNull();
});

it('forwards refs to the native button element', () => {
  const ref = createRef<HTMLButtonElement>();
  render(<Button ref={ref}>引用</Button>);
  expect(ref.current).toBeInstanceOf(HTMLButtonElement);
});

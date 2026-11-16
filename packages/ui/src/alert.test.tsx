// Author: yunnuo <ymz@ebox.vip>
// Description: Alert variants, roles and the action slot.
import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import { Alert } from './alert';

it('renders danger as an alert role with title and body', () => {
  render(<Alert variant="danger" title="保存失败">网络超时，请重试。</Alert>);
  expect(screen.getByRole('alert')).toHaveTextContent('保存失败');
  expect(screen.getByRole('alert')).toHaveTextContent('网络超时，请重试。');
  expect(screen.getByRole('alert').className).toContain('bg-danger-soft');
});

it('renders non-danger variants as status roles', () => {
  render(<Alert variant="success">已完成</Alert>);
  expect(screen.getByRole('status').className).toContain('bg-success-soft');
});

it('renders the action slot', () => {
  render(<Alert action={<button type="button">重试</button>}>加载失败</Alert>);
  expect(screen.getByRole('button', { name: '重试' })).toBeInTheDocument();
});

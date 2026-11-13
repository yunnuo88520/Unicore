// Author: yunnuo <ymz@ebox.vip>
// Description: PageHeader layout, optional description and the actions slot.
import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import { PageHeader } from './page-header';

it('renders title, optional description and the actions slot', () => {
  render(<PageHeader title="用户列表" description="统一账号与角色" actions={<button type="button">新增用户</button>} />);
  expect(screen.getByRole('heading', { name: '用户列表' })).toBeInTheDocument();
  expect(screen.getByText('统一账号与角色')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '新增用户' }).parentElement?.className).toContain('gap-2');
});

it('supports section headings without introducing a second page heading', () => {
  render(<PageHeader as="h2" title="Details" />);
  expect(screen.getByRole('heading', { name: 'Details', level: 2 })).toBeInTheDocument();
  expect(screen.queryByRole('heading', { level: 1 })).not.toBeInTheDocument();
});

it('omits the description and actions container when not provided', () => {
  render(<PageHeader title="角色权限" data-testid="header" />);
  expect(screen.getByTestId('header').querySelector('p')).toBeNull();
  expect(screen.getByTestId('header').querySelector('.gap-2')).toBeNull();
  expect(screen.getByRole('heading', { name: '角色权限', level: 1 })).toBeInTheDocument();
});

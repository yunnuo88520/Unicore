// Author: yunnuo <ymz@ebox.vip>
// Description: Breadcrumb trail semantics.
import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import { Breadcrumb, BreadcrumbItem, BreadcrumbSeparator } from './breadcrumb';

it('marks the current item and exposes the navigation landmark', () => {
  render(<Breadcrumb>
    <BreadcrumbItem>工作空间</BreadcrumbItem>
    <BreadcrumbSeparator />
    <BreadcrumbItem current>用户列表</BreadcrumbItem>
  </Breadcrumb>);
  expect(screen.getByRole('navigation')).toBeInTheDocument();
  expect(screen.getByText('用户列表')).toHaveAttribute('aria-current', 'page');
  expect(screen.getByText('工作空间')).not.toHaveAttribute('aria-current');
});

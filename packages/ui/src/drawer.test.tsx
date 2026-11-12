// Author: yunnuo <ymz@ebox.vip>
// Description: Drawer side rendering and labelled title row.
import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import { Drawer, DrawerContent } from './drawer';

it('renders the titled side sheet with a labelled close button', () => {
  render(<Drawer open><DrawerContent title="主题设置"><p>内容</p></DrawerContent></Drawer>);
  expect(screen.getByText('主题设置')).toBeInTheDocument();
  expect(screen.getByRole('dialog', { name: '主题设置' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '关闭面板' })).toBeInTheDocument();
});

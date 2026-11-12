// Author: yunnuo <ymz@ebox.vip>
// Description: EmptyState parts, live-region roles and action slot.
import { render, screen } from '@testing-library/react';
import { NotebookPen } from 'lucide-react';
import { expect, it } from 'vitest';
import { EmptyState } from './empty-state';

it('renders icon, title, description and action', () => {
  render(<EmptyState icon={NotebookPen} title="让第一条想法落在这里" description="新建一条笔记" action={<button type="button">新建</button>} />);
  expect(screen.getByText('让第一条想法落在这里')).toBeInTheDocument();
  expect(screen.getByText('新建一条笔记')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '新建' })).toBeInTheDocument();
  expect(screen.getByText('让第一条想法落在这里').closest('div')?.querySelector('svg')).not.toBeNull();
});

it('supports status and alert roles for loading and error states without a title', () => {
  render(<EmptyState role="status" description="正在读取笔记…" />);
  expect(screen.getByRole('status')).toHaveTextContent('正在读取笔记…');
  render(<EmptyState role="alert" description="加载失败" />);
  expect(screen.getByRole('alert')).toHaveTextContent('加载失败');
});

it('keeps extra className for callers that shrink the padding', () => {
  render(<EmptyState description="暂无公告" className="py-6" />);
  expect(screen.getByText('暂无公告').closest('div')?.className).toContain('py-6');
});

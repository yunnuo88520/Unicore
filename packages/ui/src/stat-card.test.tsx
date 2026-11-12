// Author: yunnuo <ymz@ebox.vip>
// Description: StatCard tone semantics and truncation surface.
import { render, screen } from '@testing-library/react';
import { Boxes, Activity } from 'lucide-react';
import { expect, it } from 'vitest';
import { StatCard } from './stat-card';

it('renders label, value and detail with the neutral icon tile by default', () => {
  render(<StatCard label="连接方式" value="HTTP API" detail="/api/v1" icon={Boxes} />);
  expect(screen.getByText('连接方式')).toBeInTheDocument();
  expect(screen.getByText('HTTP API')).toBeInTheDocument();
  expect(screen.getByText('/api/v1')).toBeInTheDocument();
  const tile = screen.getByText('HTTP API').closest('article')?.querySelector('span');
  expect(tile?.className).toContain('bg-surface-alt');
  expect(tile?.className).not.toContain('bg-success-soft');
});

it('tone=success marks the icon tile as a semantic status', () => {
  render(<StatCard label="核心服务" value="运行正常" icon={Activity} tone="success" />);
  const tile = screen.getByText('运行正常').closest('article')?.querySelector('span');
  expect(tile?.className).toContain('bg-success-soft');
});

it('omits the tile and detail when not provided and forwards the ref', () => {
  render(<StatCard label="标签" value="值" data-testid="stat" />);
  expect(screen.getByTestId('stat').querySelector('span')).toBeNull();
  expect(screen.queryByText('/api/v1')).toBeNull();
});

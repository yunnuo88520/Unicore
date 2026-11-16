// Author: yunnuo <ymz@ebox.vip>
// Description: Badge defaults and semantic tones remain token-based and allow caller overrides.
import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import { Badge } from './badge';

it('uses the subtle tone by default and forwards span attributes and children', () => {
  render(<Badge id="record-status" title="Current status" data-testid="badge"><strong>Draft</strong></Badge>);
  const badge = screen.getByTestId('badge');
  expect(badge.tagName).toBe('SPAN');
  expect(badge).toHaveAttribute('id', 'record-status');
  expect(badge).toHaveAttribute('title', 'Current status');
  expect(badge).toHaveTextContent('Draft');
  expect(badge).toHaveClass('border-line', 'bg-surface-alt', 'text-muted');
});

it.each([
  ['subtle', 'border-line', 'bg-surface-alt', 'text-muted'],
  ['primary', 'border-primary-line', 'bg-primary-soft', 'text-accent'],
  ['success', 'border-transparent', 'bg-success-soft', 'text-success'],
  ['danger', 'border-danger-line', 'bg-danger-soft', 'text-danger'],
  ['warning', 'border-transparent', 'bg-warning-soft', 'text-warning'],
  ['info', 'border-transparent', 'bg-info-soft', 'text-info'],
] as const)('renders the %s semantic token family', (variant, border, background, foreground) => {
  render(<Badge variant={variant}>{variant}</Badge>);
  expect(screen.getByText(variant)).toHaveClass(border, background, foreground);
});

it('allows className to override conflicting defaults without losing structural styles', () => {
  render(<Badge variant="danger" className="px-4 rounded-sm bg-surface">Failed</Badge>);
  const badge = screen.getByText('Failed');
  expect(badge).toHaveClass('inline-flex', 'border', 'text-danger', 'px-4', 'rounded-sm', 'bg-surface');
  expect(badge).not.toHaveClass('px-2', 'rounded-full', 'bg-danger-soft');
});

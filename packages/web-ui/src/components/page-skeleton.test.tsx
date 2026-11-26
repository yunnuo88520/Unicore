/** Author: yunnuo <ymz@ebox.vip> */
import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import { PageLoader, pageSkeletonForPage, pageSkeletonForPath } from './page-loader';
import { pageOwnsHeading } from '../routes';

it.each([
  ['/', 'dashboard'],
  ['/users', 'list'],
  ['/note-management', 'list'],
  ['/notes', 'cards'],
  ['/site', 'form'],
  ['/monitor-resources', 'monitor'],
  ['/monitor-services', 'cards'],
  ['/monitor-events', 'feed'],
  ['/menus', 'editor'],
  ['/files', 'catalog'],
  ['/api-docs', 'content'],
] as const)('registers %s with the %s skeleton', (path, variant) => {
  expect(pageSkeletonForPath(path)).toBe(variant);
});

it('normalizes page keys for the administrator entry', () => {
  expect(pageSkeletonForPage('users')).toBe('list');
  expect(pageSkeletonForPage('unknown')).toBe('content');
});

it('shares page heading ownership with the shell', () => {
  expect(pageOwnsHeading('roles')).toBe(true);
  expect(pageOwnsHeading('api-docs')).toBe(true);
  expect(pageOwnsHeading('site')).toBe(false);
  expect(pageOwnsHeading('notes')).toBe(false);
  expect(pageOwnsHeading('note-management')).toBe(false);
});

it('omits a duplicate title when the workspace shell already owns the page heading', () => {
  const { container } = render(<PageLoader variant="form" showHeading={false} />);
  expect(container.querySelector('[data-skeleton-region="page-heading"]')).not.toBeInTheDocument();
});

it.each([
  ['dashboard', 'dashboard-metrics'],
  ['list', 'list-table'],
  ['cards', 'card-grid'],
  ['feed', 'event-feed'],
  ['form', 'form-fields'],
  ['monitor', 'monitor-charts'],
  ['editor', 'editor-navigation'],
  ['catalog', 'catalog-directories'],
  ['content', 'content-body'],
] as const)('renders a distinct %s page outline', (variant, region) => {
  const { container } = render(<PageLoader variant={variant} />);
  expect(screen.getByRole('status')).toHaveAttribute('data-page-skeleton', variant);
  expect(container.querySelector(`[data-skeleton-region="${region}"]`)).toBeInTheDocument();
});

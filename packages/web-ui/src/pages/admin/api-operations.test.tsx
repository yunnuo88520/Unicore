/** Author: yunnuo <ymz@ebox.vip>
 * Description: Advanced API selector includes unattached and management operations while preserving reserved and any-mode boundaries.
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { expect, it, vi } from 'vitest';
import type { WebClient } from '@unicore/sdk';
import { OperationCatalogue, filterOperations } from './api-operations';

const operations = () => ({ items: [
  { operation_id: 'listFiles', method: 'GET', path: '/api/v1/files', summary: 'listFiles', tags: ['Files'], realm: 'user', permissions: ['files:access'], permission_mode: 'all', csrf: false, super_admin: false, grantable: true },
  { operation_id: 'listUsers', method: 'GET', path: '/api/v1/admin/users', summary: 'listUsers', tags: ['Users'], realm: 'administrator', permissions: ['users:read'], permission_mode: 'all', csrf: false, super_admin: false, grantable: true },
  { operation_id: 'reserved', method: 'POST', path: '/api/v1/admin/roles', summary: 'reserved', tags: ['Roles'], realm: 'administrator', permissions: ['roles:write'], permission_mode: 'all', csrf: true, super_admin: true, grantable: false },
  { operation_id: 'publicPolicy', method: 'GET', path: '/api/v1/auth/policy', summary: 'publicPolicy', tags: ['Auth'], realm: 'user', permissions: [], permission_mode: 'all', csrf: false, super_admin: false, grantable: false },
  { operation_id: 'fileAccess', method: 'GET', path: '/api/v1/files/{id}', summary: 'fileAccess', tags: ['Files'], realm: 'user', permissions: ['files:access', 'notes:access'], permission_mode: 'any', csrf: false, super_admin: false, grantable: true },
] });

function mount(permissions: string[] = [], error?: Error) {
  const onChange = vi.fn();
  const web = { apiOperations: error ? vi.fn().mockRejectedValue(error) : vi.fn().mockResolvedValue(operations()) } as unknown as WebClient;
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <OperationCatalogue web={web} selected={[]} onChange={onChange} permissions={permissions} />
  </QueryClientProvider>);
  return onChange;
}

it('includes unattached and management APIs without requiring a menu grant', async () => {
  const onChange = mount();
  await userEvent.click(await screen.findByRole('checkbox', { name: 'listFiles' }));
  expect(onChange).toHaveBeenCalledWith(['listFiles']);
  expect(screen.getByRole('checkbox', { name: 'listUsers' })).toBeEnabled();
  expect(screen.queryByRole('checkbox', { name: 'reserved' })).toBeNull();
  expect(screen.queryByRole('checkbox', { name: 'publicPolicy' })).toBeNull();
  expect(screen.getByRole('checkbox', { name: 'fileAccess' })).toBeDisabled();
});

it('requires only one explicit permission branch for any-mode APIs', async () => {
  mount(['files:access']);
  expect(await screen.findByRole('checkbox', { name: 'fileAccess' })).toBeEnabled();
});

it('reports catalogue failures with a retry', async () => {
  mount([], new Error('网络错误'));
  expect(await screen.findByRole('alert')).toBeVisible();
  expect(screen.getByRole('button', { name: '重试' })).toBeVisible();
});

it('filters the complete catalogue by contract metadata', () => {
  const items = operations().items;
  expect(filterOperations(items, { module: 'Files', method: 'get' }).map(op => op.operation_id)).toEqual(['listFiles', 'fileAccess']);
  expect(filterOperations(items, { path: '/admin/users', permission: 'users:read' })).toEqual([items[1]]);
  expect(filterOperations(items, { name: 'publicPolicy' })).toEqual([items[3]]);
});

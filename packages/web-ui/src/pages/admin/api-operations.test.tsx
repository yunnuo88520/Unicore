/** Author: yunnuo <ymz@ebox.vip>
 * Description: The API operation catalogue is a read-only OpenAPI projection with filterable rows and security boundaries; no fake handler creation exists.
 */
import { render, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { expect, it, vi } from 'vitest';
import { MessageProvider } from '@unicore/ui';
import type { AppClient, Bootstrap, WebClient } from '@unicore/sdk';
import { AdminApiOperationsPage, filterOperations } from './api-operations';
import type { PageProps } from '../../router';

const operations = () => ({
  items: [
    { operation_id: 'listNotes', method: 'GET', path: '/api/v1/notes', summary: '列出笔记', tags: ['笔记'], realm: 'user', permissions: ['notes:access'], permission_mode: 'all', csrf: false, super_admin: false, grantable: true },
    { operation_id: 'createRole', method: 'POST', path: '/api/v1/admin/roles', summary: '创建角色', tags: ['角色'], realm: 'administrator', permissions: ['roles:write'], permission_mode: 'all', csrf: true, super_admin: true, grantable: true },
    { operation_id: 'publicPolicy', method: 'GET', path: '/api/v1/auth/policy', summary: '登录策略', tags: ['认证'], realm: 'both', permissions: [], permission_mode: 'public', csrf: false, super_admin: false, grantable: false },
  ],
});

function metadata(permissions: string[]) {
  return { profile: 'web-platform', identity_realm: 'administrator', capabilities: {}, current_user: { id: 'admin-1', roles: ['super_admin'], permissions } } as unknown as Bootstrap;
}

function mount(meta: Bootstrap, web: Record<string, unknown>) {
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MessageProvider>
        <AdminApiOperationsPage {...({ client: { transport: 'http', web } as unknown as AppClient, metadata: meta, registry: {}, theme: 'light', setTheme: () => {}, refresh: () => {} } as unknown as PageProps)} />
      </MessageProvider>
    </QueryClientProvider>,
  );
}

it('keeps the catalogue read-only with boundary projections and a role entry for writers', async () => {
  mount(metadata(['roles:read', 'roles:write']), { apiOperations: vi.fn().mockImplementation(operations) });
  expect(await screen.findByRole('heading', { name: 'API 操作目录' })).toBeVisible();
  const row = await screen.findByRole('row', { name: /listNotes/ });
  expect(within(row).getByText('GET')).toBeVisible();
  expect(within(row).getByText('/api/v1/notes')).toBeVisible();
  expect(within(row).getByText('notes:access')).toBeVisible();
  // Boundaries render per operation: realm, CSRF, superAdmin and grantable flag.
  expect(within(row).getByText('身份域 user')).toBeVisible();
  const guarded = await screen.findByRole('row', { name: /createRole/ });
  expect(within(guarded).getByText('CSRF: 是')).toBeVisible();
  expect(within(guarded).getByText('superAdmin: 是')).toBeVisible();
  // Catalogue rows carry no grant checkboxes; authorization happens in roles.
  expect(screen.queryByRole('checkbox')).toBeNull();
  // No fake create/execute entry exists.
  expect(screen.queryByRole('button', { name: '新增 API' })).toBeNull();
  expect(screen.getByRole('link', { name: '前往角色授权' })).toBeVisible();
});

it('hides the role entry from operators without roles:write and reports load failures', async () => {
  mount(metadata(['roles:read']), { apiOperations: vi.fn().mockRejectedValue(new Error('网络错误')) });
  expect(await screen.findByRole('alert')).toBeVisible();
  expect(screen.queryByRole('link', { name: '前往角色授权' })).toBeNull();
});

it('filters operations by module, method, path, name and permission', () => {
  const items = operations().items;
  expect(filterOperations(items, { module: '笔记' })).toEqual([items[0]]);
  expect(filterOperations(items, { method: 'post' })).toEqual([items[1]]);
  expect(filterOperations(items, { path: '/admin/roles' })).toEqual([items[1]]);
  expect(filterOperations(items, { name: '策略' })).toEqual([items[2]]);
  expect(filterOperations(items, { permission: 'roles:write' })).toEqual([items[1]]);
  expect(filterOperations(items, { module: '不存在' })).toEqual([]);
});

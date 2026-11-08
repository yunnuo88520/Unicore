/** Author: yunnuo <ymz@ebox.vip>
 * Description: Regression guard: the administrator shell dispatches every registered console (including posts and api-operations) instead of rendering a blank page.
 */
import { render, screen } from '@testing-library/react';
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { expect, it, vi } from 'vitest';
import type { ReactElement } from 'react';
import { MessageProvider } from '@unicore/ui';
import type { AppClient } from '@unicore/sdk';
import { AdministrationPage } from './admin-app';
import { routes } from './routes';
import type { PageProps } from './router';

function adminProps(page: PageProps['page'], web: Record<string, unknown>): PageProps {
  return {
    page,
    client: { transport: 'http', web } as unknown as AppClient,
    metadata: {
      profile: 'web-platform', identity_realm: 'administrator', capabilities: {},
      current_user: { id: 'admin-1', roles: ['super_admin'], permissions: ['users:read', 'roles:read', 'roles:write', 'departments:read', 'menus:write', 'dictionaries:read', 'posts:read', 'posts:write'] },
    }, registry: {}, theme: 'light', setTheme: () => {}, refresh: () => {},
  } as unknown as PageProps;
}

function mount(ui: ReactElement) {
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MessageProvider>{ui}</MessageProvider>
    </QueryClientProvider>,
  );
}

it('dispatches the menu console listing the default registered pages', async () => {
  const web = {
    menuConfig: vi.fn().mockResolvedValue({ items: [], version: 1, sections: [], nodes: [], pages: [] }),
    roles: vi.fn().mockResolvedValue({ items: [], permissions: [] }),
  };
  mount(<AdministrationPage {...adminProps('menus', web)} />);
  expect(await screen.findByRole('heading', { name: '菜单配置' })).toBeVisible();
  expect(screen.getByRole('button', { name: '保存菜单配置' })).toBeEnabled();
  expect(web.menuConfig).toHaveBeenCalledTimes(1);
});

it('dispatches the dictionary console with its empty state and create entry', async () => {
  const web = { dictionaries: vi.fn().mockResolvedValue({ items: [] }) };
  mount(<AdministrationPage {...adminProps('dictionaries', web)} />);
  expect(await screen.findByRole('heading', { name: '字典类型' })).toBeVisible();
  expect(await screen.findByText('暂无字典类型，先新建一个。')).toBeVisible();
  expect(screen.getByRole('button', { name: '新建' })).toBeEnabled();
  expect(screen.getByText('尚未选择字典类型')).toBeVisible();
  expect(web.dictionaries).toHaveBeenCalledTimes(1);
});

it('dispatches the post console with its empty state and create entry', async () => {
  const web = { listPosts: vi.fn().mockResolvedValue({ items: [], total: 0 }) };
  mount(<AdministrationPage {...adminProps('posts', web)} />);
  expect(await screen.findByRole('heading', { name: '岗位管理' })).toBeVisible();
  expect(await screen.findByText('暂无岗位')).toBeVisible();
  expect(screen.getByRole('button', { name: '新建岗位' })).toBeEnabled();
  expect(web.listPosts).toHaveBeenCalledTimes(1);
});

it('dispatches the API operation catalogue from the OpenAPI projection', async () => {
  const web = {
    apiOperations: vi.fn().mockResolvedValue({
      items: [
        { operation_id: 'listNotes', method: 'GET', path: '/api/v1/notes', summary: '列出笔记', tags: ['笔记'], realm: 'user', permissions: ['notes:access'], permission_mode: 'all', csrf: false, super_admin: false, grantable: true },
        { operation_id: 'applyUpdate', method: 'POST', path: '/api/v1/admin/updates/apply', summary: '安装更新', tags: ['系统'], realm: 'administrator', permissions: ['updates:apply'], permission_mode: 'all', csrf: true, super_admin: true, grantable: true },
      ],
    }),
  };
  mount(<AdministrationPage {...adminProps('api-operations', web)} />);
  expect(await screen.findByRole('heading', { name: 'API 操作目录' })).toBeVisible();
  expect(await screen.findByText('/api/v1/notes')).toBeVisible();
  // The boundary columns render for every operation; no fake create handler exists.
  expect(screen.getByText('applyUpdate')).toBeVisible();
  expect(screen.getByText('/api/v1/admin/updates/apply')).toBeVisible();
  expect(screen.queryByRole('button', { name: '新增 API' })).toBeNull();
});

// Generic registration guard: every administration/system console (plus the
// flat announcements page) must dispatch to real content. A missing switch
// case would render an empty page; notes/files render through the shared
// user router instead of this dispatcher and stay out of the list.
it('renders a non-blank console for every permission-gated page', async () => {
  const pending = () => new Promise(() => {});
  const pendingWeb = new Proxy({}, { get: () => pending }) as unknown as Record<string, unknown>;
  // Some consoles gate on optional API groups being present (settings, storage,
  // notes, files); callables stay plain pending promises, the rest proxy out.
  const client = { transport: 'http', web: pendingWeb, settings: pending, patchSettings: pending, storage: pendingWeb, notes: pendingWeb, files: pendingWeb } as unknown as AppClient;
  const gatedPages = (Object.keys(routes) as (keyof typeof routes)[])
    // Edition is genuinely empty when neither update nor license feature flag
    // compiles in; that state is covered by feature builds, not this guard.
    .filter(page => 'permission' in routes[page] && page !== 'edition' && ('group' in routes[page] || page === 'announcements'));
  expect(gatedPages).toContain('posts');
  expect(gatedPages).toContain('api-operations');
  for (const page of gatedPages) {
    // Settings/storage pages read route search params, so the console mounts as
    // the component of a minimal memory-history root route.
    const router = createRouter({
      routeTree: createRootRoute({ component: () => <AdministrationPage {...{ ...adminProps(page, pendingWeb), client } as unknown as PageProps} /> }),
      history: createMemoryHistory(),
    });
    const { container, unmount } = render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <MessageProvider>
          <RouterProvider router={router} />
        </MessageProvider>
      </QueryClientProvider>,
    );
    try {
      // RouterProvider commits its match asynchronously; one macrotask keeps
      // the blank-page assertion sharp without masking real emptiness.
      await new Promise(resolve => setTimeout(resolve, 0));
      expect(container.textContent, `${page} rendered a blank administrator page`).not.toBe('');
    } finally {
      unmount();
    }
  }
});

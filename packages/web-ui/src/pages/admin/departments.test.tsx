import { grantUI } from '../../test-authorization';
/** Author: yunnuo <ymz@ebox.vip>
 * Description: Department tree renders hierarchies; create targets the parent, delete reports DEPARTMENT_IN_USE and moves renumber siblings.
 */
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { expect, it, vi } from 'vitest';
import { MessageProvider } from '@unicore/ui';
import { AppError } from '@unicore/sdk';
import type { AppClient, Bootstrap } from '@unicore/sdk';
import { AdminDepartmentsPage } from './departments';
import type { PageProps } from '../../router';

const departments = () => [
  { id: 'd1', name: '研发部', sort: 0, created_at: 1, updated_at: 1 },
  { id: 'd2', name: '产品部', sort: 1, created_at: 2, updated_at: 2 },
  { id: 'd3', name: '前端组', parent_id: 'd1', sort: 0, created_at: 3, updated_at: 3 },
];

function metadata(permissions: string[]) {
  return { profile: 'web-platform', identity_realm: 'administrator', capabilities: {}, current_user: { id: 'admin-1', roles: ['super_admin'], permissions } } as unknown as Bootstrap;
}

function mount(metadata: Bootstrap, web: Record<string, unknown>) {
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MessageProvider>
        <AdminDepartmentsPage {...({ client: { transport: 'http', web } as unknown as AppClient, metadata: grantUI(metadata), registry: {}, theme: 'light', setTheme: () => {}, refresh: () => {} } as unknown as PageProps)} />
      </MessageProvider>
    </QueryClientProvider>,
  );
}

it('renders the department tree with hierarchy lines and expand/collapse toggles', async () => {
  mount(metadata(['departments:read', 'departments:write']), { listDepartments: vi.fn().mockResolvedValue({ items: departments(), total: 3 }) });
  expect(await screen.findByText('研发部')).toBeVisible();
  expect(screen.getByText('产品部')).toBeVisible();
  const child = screen.getByText('前端组');
  expect(child).toBeVisible();
  // The child branch sits under a guided wrapper the parent row does not use.
  expect(child.closest('.border-s')).toBeVisible();
  const parentRow = screen.getByText('研发部').closest('div')!;
  const caret = within(parentRow).getByRole('button', { name: '收起 研发部' });
  await userEvent.click(caret);
  expect(screen.queryByText('前端组')).toBeNull();
  await userEvent.click(within(parentRow).getByRole('button', { name: '展开 研发部' }));
  expect(await screen.findByText('前端组')).toBeVisible();
});

it('creates a child department under the chosen parent and roots on demand', async () => {
  const createDepartment = vi.fn().mockResolvedValue({ id: 'd4', name: '测试组', parent_id: 'd1', sort: 1, created_at: 4, updated_at: 4 });
  mount(metadata(['departments:read', 'departments:write']), { listDepartments: vi.fn().mockResolvedValue({ items: departments(), total: 3 }), createDepartment });
  await screen.findByText('研发部');
  await userEvent.click(screen.getByRole('button', { name: '在 研发部 下新建子部门' }));
  const dialog = screen.getByRole('dialog', { name: '新建子部门' });
  expect(within(dialog).getByText('上级部门：研发部')).toBeVisible();
  await userEvent.type(within(dialog).getByLabelText('部门名称'), '测试组');
  await userEvent.click(within(dialog).getByRole('button', { name: '创建' }));
  await vi.waitFor(() => expect(createDepartment).toHaveBeenCalledWith({ name: '测试组', parent_id: 'd1' }));
  // Root creation sends no parent_id at all.
  await userEvent.click(await screen.findByRole('button', { name: '新建根部门' }));
  const rootDialog = screen.getByRole('dialog', { name: '新建根部门' });
  await userEvent.type(within(rootDialog).getByLabelText('部门名称'), '市场部');
  await userEvent.click(within(rootDialog).getByRole('button', { name: '创建' }));
  await vi.waitFor(() => expect(createDepartment).toHaveBeenCalledWith({ name: '市场部' }));
});

it('renames a department while preserving parent and sort', async () => {
  const updateDepartment = vi.fn().mockResolvedValue({ id: 'd3', name: '客户端组', parent_id: 'd1', sort: 0, created_at: 3, updated_at: 9 });
  mount(metadata(['departments:read', 'departments:write']), { listDepartments: vi.fn().mockResolvedValue({ items: departments(), total: 3 }), updateDepartment });
  await screen.findByText('前端组');
  await userEvent.click(screen.getByRole('button', { name: '重命名 前端组' }));
  const dialog = screen.getByRole('dialog', { name: '重命名部门' });
  const name = within(dialog).getByLabelText('部门名称') as HTMLInputElement;
  expect(name.value).toBe('前端组');
  // The parent select echoes the persisted parent.
  expect(within(dialog).getByRole('radio', { name: '研发部' })).toBeChecked();
  await userEvent.clear(name);
  await userEvent.type(name, '客户端组');
  await userEvent.click(within(dialog).getByRole('button', { name: '保存' }));
  await vi.waitFor(() => expect(updateDepartment).toHaveBeenCalledWith('d3', { name: '客户端组', parent_id: 'd1', sort: 0 }));
});

it('moves a department under another parent from the rename dialog', async () => {
  const updateDepartment = vi.fn().mockResolvedValue({ id: 'd3', name: '前端组', parent_id: 'd2', sort: 0, created_at: 3, updated_at: 9 });
  mount(metadata(['departments:read', 'departments:write']), { listDepartments: vi.fn().mockResolvedValue({ items: departments(), total: 3 }), updateDepartment });
  await screen.findByText('前端组');
  await userEvent.click(screen.getByRole('button', { name: '重命名 前端组' }));
  const dialog = screen.getByRole('dialog', { name: '重命名部门' });
  const parent = within(dialog).getByLabelText('上级部门');
  const options = within(parent).getAllByRole('radio').map(option => option.textContent);
  // The root escape hatch and every department outside the moved branch are offered.
  expect(options).toEqual(['作为根部门', '研发部', '产品部']);
  await userEvent.click(within(parent).getByRole('radio', { name: '产品部' }));
  await userEvent.click(within(dialog).getByRole('button', { name: '保存' }));
  await vi.waitFor(() => expect(updateDepartment).toHaveBeenCalledWith('d3', { name: '前端组', parent_id: 'd2', sort: 0 }));
});

it('reparents back to a root department and never offers the moved branch itself', async () => {
  const updateDepartment = vi.fn().mockResolvedValue({ id: 'd3', name: '前端组', sort: 0, created_at: 3, updated_at: 9 });
  mount(metadata(['departments:read', 'departments:write']), { listDepartments: vi.fn().mockResolvedValue({ items: departments(), total: 3 }), updateDepartment });
  await screen.findByText('前端组');
  await userEvent.click(screen.getByRole('button', { name: '重命名 研发部' }));
  const dialog = screen.getByRole('dialog', { name: '重命名部门' });
  const parent = within(dialog).getByLabelText('上级部门');
  // 研发部 itself and its descendant 前端组 stay out of the options.
  const options = within(parent).getAllByRole('radio').map(option => option.textContent);
  expect(options).toEqual(['作为根部门', '产品部']);
  await userEvent.click(within(parent).getByRole('radio', { name: '作为根部门' }));
  await userEvent.click(within(dialog).getByRole('button', { name: '保存' }));
  await vi.waitFor(() => expect(updateDepartment).toHaveBeenCalledWith('d1', { name: '研发部', parent_id: undefined, sort: 0 }));
});

it('moves a sibling up by renumbering the whole row', async () => {
  const updateDepartment = vi.fn().mockResolvedValue({ id: 'd1', name: '研发部', sort: 0, created_at: 1, updated_at: 1 });
  mount(metadata(['departments:read', 'departments:write']), { listDepartments: vi.fn().mockResolvedValue({ items: departments(), total: 3 }), updateDepartment });
  await screen.findByText('产品部');
  // 研发部 is already first, so its up button stays disabled.
  expect(screen.getByRole('button', { name: '上移 研发部' })).toBeDisabled();
  await userEvent.click(screen.getByRole('button', { name: '上移 产品部' }));
  await vi.waitFor(() => {
    expect(updateDepartment).toHaveBeenCalledWith('d2', { name: '产品部', parent_id: undefined, sort: 0 });
    expect(updateDepartment).toHaveBeenCalledWith('d1', { name: '研发部', parent_id: undefined, sort: 1 });
  });
});

it('reports the DEPARTMENT_IN_USE constraint when deletion is rejected', async () => {
  const deleteDepartment = vi.fn().mockRejectedValue(new AppError('DEPARTMENT_IN_USE', '部门下仍有子部门或挂靠用户，请先迁移后再删除'));
  mount(metadata(['departments:read', 'departments:write']), { listDepartments: vi.fn().mockResolvedValue({ items: departments(), total: 3 }), deleteDepartment });
  await screen.findByText('研发部');
  await userEvent.click(screen.getByRole('button', { name: '删除 产品部' }));
  const dialog = screen.getByRole('alertdialog', { name: '删除部门' });
  expect(within(dialog).getByText('确定删除部门「产品部」？删除后不可恢复。')).toBeVisible();
  await userEvent.click(within(dialog).getByRole('button', { name: '确认删除' }));
  expect(await screen.findByText('部门下仍有子部门或挂靠用户')).toBeVisible();
  expect(screen.getByText('产品部')).toBeVisible();
});

it('guides empty workspaces toward the first root department', async () => {
  const createDepartment = vi.fn().mockResolvedValue({ id: 'd9', name: '市场部', sort: 0, created_at: 9, updated_at: 9 });
  mount(metadata(['departments:read', 'departments:write']), { listDepartments: vi.fn().mockResolvedValue({ items: [], total: 0 }), createDepartment });
  expect(await screen.findByText('还没有部门')).toBeVisible();
  await userEvent.click(screen.getAllByRole('button', { name: '新建根部门' })[0]);
  const dialog = screen.getByRole('dialog', { name: '新建根部门' });
  await userEvent.type(within(dialog).getByLabelText('部门名称'), '市场部');
  await userEvent.click(within(dialog).getByRole('button', { name: '创建' }));
  await vi.waitFor(() => expect(createDepartment).toHaveBeenCalledWith({ name: '市场部' }));
});

it('hides write actions without departments:write while the tree stays readable', async () => {
  mount(metadata(['departments:read']), { listDepartments: vi.fn().mockResolvedValue({ items: departments(), total: 3 }) });
  expect(await screen.findByText('研发部')).toBeVisible();
  expect(screen.queryByRole('button', { name: '新建根部门' })).toBeNull();
  expect(screen.queryByRole('button', { name: '删除 产品部' })).toBeNull();
});

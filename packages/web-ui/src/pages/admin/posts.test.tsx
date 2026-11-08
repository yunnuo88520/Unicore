/** Author: yunnuo <ymz@ebox.vip>
 * Description: Post console CRUD with normalized codes, member lookup through the paginated users query and guarded deletion; membership never touches roles.
 */
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { expect, it, vi } from 'vitest';
import { MessageProvider } from '@unicore/ui';
import { AppError } from '@unicore/sdk';
import type { AppClient, Bootstrap } from '@unicore/sdk';
import { AdminPostsPage } from './posts';
import type { PageProps } from '../../router';

const posts = () => ({
  items: [
    { id: 'p1', code: 'engineer', name: '工程师', sort: 0, enabled: true, description: '负责交付', created_at: 1, updated_at: 1 },
    { id: 'p2', code: 'reviewer', name: '评审员', sort: 1, enabled: false, description: '', created_at: 2, updated_at: 2 },
  ],
  total: 2,
});

function metadata(permissions: string[]) {
  return { profile: 'web-platform', identity_realm: 'administrator', capabilities: {}, current_user: { id: 'admin-1', roles: ['super_admin'], permissions } } as unknown as Bootstrap;
}

function mount(meta: Bootstrap, web: Record<string, unknown>) {
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MessageProvider>
        <AdminPostsPage {...({ client: { transport: 'http', web } as unknown as AppClient, metadata: meta, registry: {}, theme: 'light', setTheme: () => {}, refresh: () => {} } as unknown as PageProps)} />
      </MessageProvider>
    </QueryClientProvider>,
  );
}

const baseWeb = (extra: Record<string, unknown> = {}) => ({ listPosts: vi.fn().mockResolvedValue(posts()), ...extra });

it('renders the post directory with codes, sort and enabled state', async () => {
  mount(metadata(['posts:read', 'posts:write', 'users:read']), baseWeb());
  const row = await screen.findByRole('row', { name: /工程师/ });
  expect(within(row).getByText('engineer')).toBeVisible();
  expect(within(row).getByText('负责交付')).toBeVisible();
  expect(within(row).getByText('已启用')).toBeVisible();
  const disabled = screen.getByRole('row', { name: /评审员/ });
  expect(within(disabled).getByText('已禁用')).toBeVisible();
  expect(within(disabled).getByText('—')).toBeVisible();
});

it('creates a post with a trimmed lowercase code and defaults', async () => {
  const createPost = vi.fn().mockResolvedValue({ id: 'p3', code: 'ops', name: '运营', sort: 0, enabled: true, description: '', created_at: 3, updated_at: 3 });
  mount(metadata(['posts:read', 'posts:write']), baseWeb({ createPost }));
  await screen.findByRole('row', { name: /工程师/ });
  await userEvent.click(screen.getByRole('button', { name: '新建岗位' }));
  const dialog = screen.getByRole('dialog', { name: '新建岗位' });
  await userEvent.type(within(dialog).getByLabelText('岗位编码'), '  Ops ');
  await userEvent.type(within(dialog).getByLabelText('岗位名称'), '运营');
  await userEvent.type(within(dialog).getByLabelText('排序'), '2');
  await userEvent.click(within(dialog).getByRole('button', { name: '保存' }));
  await vi.waitFor(() => expect(createPost).toHaveBeenCalledWith(expect.objectContaining({ code: 'ops', name: '运营', sort: 2, enabled: true, description: '' })));
});

it('echoes a post when editing and keeps the enabled switch explicit', async () => {
  const updatePost = vi.fn().mockResolvedValue({ id: 'p2', code: 'reviewer', name: '评审员', sort: 1, enabled: true, description: '', created_at: 2, updated_at: 9 });
  mount(metadata(['posts:read', 'posts:write']), baseWeb({ updatePost }));
  await screen.findByRole('row', { name: /评审员/ });
  await userEvent.click(screen.getByRole('button', { name: '编辑岗位 评审员' }));
  const dialog = screen.getByRole('dialog', { name: '编辑岗位' });
  expect(within(dialog).getByLabelText('岗位编码')).toHaveValue('reviewer');
  const toggle = within(dialog).getByRole('switch');
  expect(toggle).not.toBeChecked();
  await userEvent.click(toggle);
  await userEvent.click(within(dialog).getByRole('button', { name: '保存' }));
  await vi.waitFor(() => expect(updatePost).toHaveBeenCalledWith('p2', expect.objectContaining({ code: 'reviewer', name: '评审员', enabled: true })));
});

it('lists post members through the paginated users query filtered by post', async () => {
  const users = vi.fn().mockResolvedValue({ items: [{ id: 'u1', username: 'member', email: 'member@example.test', status: 'active', roles: ['user'], permissions: [], created_at: 1, last_login_at: 0, totp_enabled: false, post_ids: ['p1'] }], total: 1, page: 1, page_size: 20 });
  mount(metadata(['posts:read', 'users:read']), baseWeb({ users }));
  await screen.findByRole('row', { name: /工程师/ });
  await userEvent.click(within(screen.getByRole('row', { name: /工程师/ })).getByRole('button', { name: '成员' }));
  const dialog = screen.getByRole('dialog', { name: '岗位成员：工程师' });
  expect((await within(dialog).findAllByRole('listitem')).map(item => item.textContent)).toEqual(['member · member@example.test']);
  // Membership reads go through the real users projection with the post filter.
  expect(users).toHaveBeenCalledWith('', 1, 'p1');
});

it('surfaces a duplicate code conflict inline and as a toast without closing the dialog', async () => {
  const createPost = vi.fn().mockRejectedValue(new AppError('POST_CONFLICT', '岗位编码已被使用，请改用其他编码'));
  mount(metadata(['posts:read', 'posts:write']), baseWeb({ createPost }));
  await screen.findByRole('row', { name: /工程师/ });
  await userEvent.click(screen.getByRole('button', { name: '新建岗位' }));
  const dialog = screen.getByRole('dialog', { name: '新建岗位' });
  await userEvent.type(within(dialog).getByLabelText('岗位编码'), 'engineer');
  await userEvent.type(within(dialog).getByLabelText('岗位名称'), '重复编码');
  await userEvent.click(within(dialog).getByRole('button', { name: '保存' }));
  // The guarded reason renders twice: inline inside the dialog and as a toast.
  expect(await within(dialog).findByRole('alert')).toHaveTextContent('岗位编码已被使用，请改用其他编码');
  expect(await screen.findAllByText('岗位编码已被使用，请改用其他编码').then(items => items.length)).toBeGreaterThan(1);
  // The dialog stays open so the operator can correct the code.
  expect(within(dialog).getByLabelText('岗位编码')).toBeEnabled();
});

it('surfaces any guarded save error inline even when the code differs from the catalogue', async () => {
  // Regression guard: a server that mis-codes the conflict must still produce
  // visible feedback instead of a silently unchanged dialog.
  const createPost = vi.fn().mockRejectedValue(new AppError('ACCOUNT_EXISTS', '账号或邮箱已存在'));
  mount(metadata(['posts:read', 'posts:write']), baseWeb({ createPost }));
  await screen.findByRole('row', { name: /工程师/ });
  await userEvent.click(screen.getByRole('button', { name: '新建岗位' }));
  const dialog = screen.getByRole('dialog', { name: '新建岗位' });
  await userEvent.type(within(dialog).getByLabelText('岗位编码'), 'engineer');
  await userEvent.type(within(dialog).getByLabelText('岗位名称'), '重复编码');
  await userEvent.click(within(dialog).getByRole('button', { name: '保存' }));
  expect(await within(dialog).findByRole('alert')).toHaveTextContent('账号或邮箱已存在');
  expect(await screen.findAllByText('账号或邮箱已存在').then(items => items.length)).toBeGreaterThan(1);
});

it('reports the in-use guard when deletion is rejected', async () => {
  const deletePost = vi.fn().mockRejectedValue(new AppError('POST_IN_USE', '岗位仍有成员引用，请先调整成员归属'));
  mount(metadata(['posts:read', 'posts:write']), baseWeb({ deletePost }));
  await screen.findByRole('row', { name: /工程师/ });
  await userEvent.click(screen.getByRole('button', { name: '删除岗位 工程师' }));
  const confirm = screen.getByRole('alertdialog', { name: '删除岗位' });
  await userEvent.click(within(confirm).getByRole('button', { name: '确认删除' }));
  expect(await screen.findByText('岗位仍有成员引用，请先调整成员归属')).toBeVisible();
  // The confirm dialog remains open (the guarded row stays behind it, hidden
  // from the accessibility tree by the open dialog) and nothing was deleted.
  expect(screen.getByRole('row', { name: /工程师/, hidden: true })).toBeVisible();
});

it('confirms deletion and reports the guarded result', async () => {
  const deletePost = vi.fn().mockResolvedValue({});
  mount(metadata(['posts:read', 'posts:write']), baseWeb({ deletePost }));
  await screen.findByRole('row', { name: /工程师/ });
  await userEvent.click(screen.getByRole('button', { name: '删除岗位 工程师' }));
  const confirm = screen.getByRole('alertdialog', { name: '删除岗位' });
  await userEvent.click(within(confirm).getByRole('button', { name: '确认删除' }));
  await vi.waitFor(() => expect(deletePost).toHaveBeenCalledWith('p1'));
  expect(await screen.findByText('岗位已删除')).toBeVisible();
});

it('keeps the directory readable without posts:write and hides membership without users:read', async () => {
  mount(metadata(['posts:read']), baseWeb());
  expect(await screen.findByRole('row', { name: /工程师/ })).toBeVisible();
  expect(screen.queryByRole('button', { name: '新建岗位' })).toBeNull();
  expect(screen.queryByRole('button', { name: '编辑岗位 工程师' })).toBeNull();
  expect(screen.queryByRole('button', { name: '删除岗位 工程师' })).toBeNull();
  expect(screen.queryByRole('button', { name: '成员' })).toBeNull();
});

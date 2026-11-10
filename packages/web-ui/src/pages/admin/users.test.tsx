import { grantUI } from '../../test-authorization';
/** Author: yunnuo <ymz@ebox.vip>
 * Description: User dialogs pick departments and posts (create, echo and clear), the list resolves both names, and every mutating button gates on its own point.
 */
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { expect, it, vi } from 'vitest';
import { MessageProvider } from '@unicore/ui';
import type { AppClient, Bootstrap } from '@unicore/sdk';
import { AdminAdministratorsPage, AdminUsersPage } from './users';
import type { PageProps } from '../../router';

const departments = () => ({
  items: [
    { id: 'd1', name: '研发部', sort: 0, created_at: 1, updated_at: 1 },
    { id: 'd2', name: '前端组', parent_id: 'd1', sort: 0, created_at: 2, updated_at: 2 },
  ],
  total: 2,
});

const users = (departmentId?: string) => ({
  items: [
    { id: 'u1', username: 'member', email: 'member@example.test', status: 'active', roles: ['user'], permissions: ['notes:access'], created_at: 1, last_login_at: 0, totp_enabled: false, ...(departmentId ? { department_id: departmentId } : {}) },
  ],
  total: 1,
  page: 1,
  page_size: 20,
});

const roleOptions = () => ({ items: [{ id: 'user', name: '用户', assignable: true }] });

const posts = () => ({
  items: [
    { id: 'p1', code: 'engineer', name: '工程师', sort: 0, enabled: true, description: '', created_at: 1, updated_at: 1 },
    { id: 'p2', code: 'reviewer', name: '评审员', sort: 1, enabled: true, description: '', created_at: 2, updated_at: 2 },
    { id: 'p3', code: 'archived', name: '停用岗', sort: 2, enabled: false, description: '', created_at: 3, updated_at: 3 },
  ],
  total: 3,
});

function metadata(permissions: string[]) {
  return { profile: 'web-platform', identity_realm: 'administrator', capabilities: {}, current_user: { id: 'admin-1', roles: ['super_admin'], permissions } } as unknown as Bootstrap;
}

function mount(metadata: Bootstrap, web: Record<string, unknown>) {
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MessageProvider>
        <AdminUsersPage {...({ client: { transport: 'http', web } as unknown as AppClient, metadata: grantUI(metadata), registry: {}, theme: 'light', setTheme: () => {}, refresh: () => {} } as unknown as PageProps)} />
      </MessageProvider>
    </QueryClientProvider>,
  );
}

it('resolves department names in the list column next to the role column', async () => {
  mount(metadata(['users:read']), { users: vi.fn().mockResolvedValue(users('d2')), roleOptions, listDepartments: vi.fn().mockResolvedValue(departments()) });
  const row = await screen.findByRole('row', { name: /member/ });
  expect(within(row).getByText('前端组')).toBeVisible();
  // The department column sits right after the identity column in the header.
  const headers = within(row.closest('table')!).getAllByRole('columnheader').map(header => header.textContent);
  expect(headers.indexOf('部门')).toBe(headers.indexOf('身份') + 1);
});

it('renders catalogue role names in the identity column instead of raw ids', async () => {
  // A member holding a custom role and the builtin user role: the session
  // payload carries role_names parallel to the role ids.
  const payload = {
    items: [
      { id: 'u1', username: 'operator', email: 'o@example.test', status: 'active', roles: ['role-uuid-1', 'user'], role_names: ['运营', 'user'], permissions: ['notes:access'], created_at: 1, last_login_at: 0, totp_enabled: false },
      { id: 'u2', username: 'owner', email: 'owner@example.test', status: 'active', roles: ['super_admin'], role_names: ['super_admin'], permissions: [], created_at: 1, last_login_at: 0, totp_enabled: false },
      { id: 'u3', username: 'legacy', email: 'l@example.test', status: 'active', roles: ['gone-role'], permissions: [], created_at: 1, last_login_at: 0, totp_enabled: false },
    ],
    total: 3,
    page: 1,
    page_size: 20,
  };
  mount(metadata(['users:read']), { users: vi.fn().mockResolvedValue(payload), roleOptions, listDepartments: vi.fn().mockResolvedValue(departments()) });
  const operator = await screen.findByRole('row', { name: /operator/ });
  // The custom role renders its catalogue name and the builtin localizes.
  expect(within(operator).getByText('运营, 用户')).toBeVisible();
  // super_admin keeps its established raw marker.
  const owner = screen.getByRole('row', { name: /owner/ });
  expect(within(owner).getByText('super_admin')).toBeVisible();
  // A row without the parallel names degrades to the raw id, never empty.
  const legacy = screen.getByRole('row', { name: /legacy/ });
  expect(within(legacy).getByText('gone-role')).toBeVisible();
});

it('creates users with an optional department left unassigned by default', async () => {
  const createUser = vi.fn().mockResolvedValue({ id: 'u2', username: 'newcomer', email: 'n@example.test', status: 'active', roles: ['user'], permissions: [], created_at: 2, last_login_at: 0, totp_enabled: false });
  mount(metadata(['users:read', 'users:create']), { users: vi.fn().mockResolvedValue(users()), roleOptions, listDepartments: vi.fn().mockResolvedValue(departments()), createUser });
  await screen.findByRole('row', { name: /member/ });
  await userEvent.click(screen.getByRole('button', { name: '新增用户' }));
  const dialog = screen.getByRole('dialog', { name: '新增用户' });
  const department = within(dialog).getByLabelText('部门');
  expect(department).toHaveValue('');
  expect(within(department).getByText('未分配')).toBeVisible();
  // The select mirrors the hierarchy: the child option stays indented under its root.
  const options = within(department).getAllByRole('option').map(option => option.textContent);
  expect(options).toEqual(['未分配', '研发部', '\u3000前端组']);
  await userEvent.type(within(dialog).getByLabelText('账号'), 'newcomer');
  await userEvent.type(within(dialog).getByLabelText('邮箱'), 'n@example.test');
  await userEvent.type(within(dialog).getByLabelText('初始密码'), 'test-password-strong');
  await userEvent.selectOptions(department, 'd1');
  await userEvent.click(within(dialog).getByRole('button', { name: '创建用户' }));
  await vi.waitFor(() => expect(createUser).toHaveBeenCalledWith(expect.objectContaining({ username: 'newcomer', department_id: 'd1' })));
});

it('renders the role selection as a spaced, wrap-friendly chip group', async () => {
  mount(metadata(['users:read', 'users:create']), {
    users: vi.fn().mockResolvedValue(users()),
    roleOptions: () => ({ items: [{ id: 'user', name: '用户', assignable: true }, { id: 'auditor', name: '只读审计', assignable: false }] }),
    listDepartments: vi.fn().mockResolvedValue(departments()),
  });
  await screen.findByRole('row', { name: /member/ });
  await userEvent.click(screen.getByRole('button', { name: '新增用户' }));
  const dialog = screen.getByRole('dialog', { name: '新增用户' });
  const group = dialog.querySelector('legend')!.nextElementSibling as HTMLElement;
  // The group wraps with spacing instead of gluing the checkboxes into one line.
  expect(group.className).toContain('flex-wrap');
  expect(group.className).toContain('gap-2');
  const chips = [...group.querySelectorAll<HTMLElement>('label[data-role-chip]')];
  expect(chips.map(chip => chip.dataset.roleChip)).toEqual(['user', 'auditor']);
  for (const [name, chip] of [['用户', chips[0]], ['只读审计', chips[1]]] as const) {
    // Every chip is a bordered label holding exactly one checkbox and its name.
    expect(chip.className).toContain('border');
    expect(chip.querySelectorAll('[role="checkbox"]')).toHaveLength(1);
    expect(chip.textContent).toContain(name);
  }
  // The default selection highlights its chip; the non-assignable role stays disabled and dimmed.
  expect(chips[0].className).toContain('bg-primary-soft');
  expect(chips[0].querySelector('[role="checkbox"]')).toBeChecked();
  expect(chips[1].className).not.toContain('bg-primary-soft');
  expect(chips[1].querySelector('[role="checkbox"]')).toBeDisabled();
  // Toggling through the chip still flips the underlying selection.
  await userEvent.click(within(dialog).getByRole('checkbox', { name: '用户' }));
  expect(within(dialog).getByRole('checkbox', { name: '用户' })).not.toBeChecked();
  expect(chips[0].className).not.toContain('bg-primary-soft');
});

it('echoes the persisted department when editing and clears it via the unassigned option', async () => {
  const updateUser = vi.fn().mockResolvedValue({ id: 'u1', username: 'member', email: 'member@example.test', status: 'active', roles: ['user'], permissions: [], created_at: 1, last_login_at: 0, totp_enabled: false });
  mount(metadata(['users:read', 'users:update']), { users: vi.fn().mockResolvedValue(users('d2')), roleOptions, listDepartments: vi.fn().mockResolvedValue(departments()), updateUser });
  const row = await screen.findByRole('row', { name: /member/ });
  await userEvent.click(within(row).getByRole('button', { name: '编辑' }));
  const dialog = screen.getByRole('dialog', { name: '编辑member' });
  // The select echoes the saved child department.
  expect(within(dialog).getByLabelText('部门')).toHaveValue('d2');
  await userEvent.selectOptions(within(dialog).getByLabelText('部门'), '');
  await userEvent.click(within(dialog).getByRole('button', { name: '保存' }));
  // The empty string keeps the clear semantics of the update contract; the
  // full editor always submits the echoed email and the trimmed nickname.
  await vi.waitFor(() => expect(updateUser).toHaveBeenCalledWith('u1', { status: 'active', role_ids: ['user'], email: 'member@example.test', display_name: '', department_id: '' }));
});

it('edits the nickname and email of an existing account and prefers the nickname in the list', async () => {
  const updateUser = vi.fn().mockResolvedValue({ id: 'u1', username: 'member', display_name: '小陈', email: 'chen@example.test', status: 'active', roles: ['user'], permissions: [], created_at: 1, last_login_at: 0, totp_enabled: false });
  mount(metadata(['users:read', 'users:update']), { users: vi.fn().mockResolvedValue(users()), roleOptions, listDepartments: vi.fn().mockResolvedValue(departments()), updateUser });
  const row = await screen.findByRole('row', { name: /member/ });
  expect(within(row).getByText('member')).toBeVisible();
  await userEvent.click(within(row).getByRole('button', { name: '编辑' }));
  const dialog = screen.getByRole('dialog', { name: '编辑member' });
  // The username is the login identity and renders read-only.
  expect(within(dialog).getByLabelText('账号')).toHaveValue('member');
  expect(within(dialog).getByLabelText('账号')).toHaveAttribute('readonly');
  await userEvent.type(within(dialog).getByLabelText('昵称'), '小陈');
  await userEvent.clear(within(dialog).getByLabelText('邮箱'));
  await userEvent.type(within(dialog).getByLabelText('邮箱'), 'chen@example.test');
  await userEvent.click(within(dialog).getByRole('button', { name: '保存' }));
  await vi.waitFor(() => expect(updateUser).toHaveBeenCalledWith('u1', expect.objectContaining({ display_name: '小陈', email: 'chen@example.test', status: 'active', role_ids: ['user'] })));
});

it('resets a member password with a typed replacement and revokes sessions', async () => {
  const resetUserPassword = vi.fn().mockResolvedValue({ password: 'typed-password-123' });
  mount(metadata(['users:read', 'users:update']), { users: vi.fn().mockResolvedValue(users()), roleOptions, listDepartments: vi.fn().mockResolvedValue(departments()), resetUserPassword });
  const row = await screen.findByRole('row', { name: /member/ });
  await userEvent.click(within(row).getByRole('button', { name: '重置密码' }));
  const dialog = screen.getByRole('dialog', { name: '重置密码' });
  const submit = within(dialog).getByRole('button', { name: '重置密码' });
  // The typed path stays disabled until the 12-character minimum is met.
  expect(submit).toBeDisabled();
  await userEvent.type(within(dialog).getByLabelText('新密码'), 'typed-password-123');
  expect(submit).toBeEnabled();
  await userEvent.click(submit);
  await vi.waitFor(() => expect(resetUserPassword).toHaveBeenCalledWith('u1', { password: 'typed-password-123' }));
});

it('asks the server to generate a temporary password when the operator picks the generated mode', async () => {
  const resetUserPassword = vi.fn().mockResolvedValue({ password: 'TempGeneratedPassword42' });
  mount(metadata(['users:read', 'users:update']), { users: vi.fn().mockResolvedValue(users()), roleOptions, listDepartments: vi.fn().mockResolvedValue(departments()), resetUserPassword });
  const row = await screen.findByRole('row', { name: /member/ });
  await userEvent.click(within(row).getByRole('button', { name: '重置密码' }));
  const dialog = screen.getByRole('dialog', { name: '重置密码' });
  await userEvent.click(within(dialog).getByRole('radio', { name: '生成临时密码' }));
  await userEvent.click(within(dialog).getByRole('button', { name: '重置密码' }));
  await vi.waitFor(() => expect(resetUserPassword).toHaveBeenCalledWith('u1', {}));
});

it('keeps administrators without department controls', async () => {
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MessageProvider>
        <AdminAdministratorsPage {...({ client: { transport: 'http', web: { administrators: vi.fn().mockResolvedValue(users()), adminRoleOptions: roleOptions } } as unknown as AppClient, metadata: grantUI(metadata(['administrators:read', 'administrators:create'])), registry: {}, theme: 'light', setTheme: () => {}, refresh: () => {} } as unknown as PageProps)} />
      </MessageProvider>
    </QueryClientProvider>,
  );
  await screen.findByRole('row', { name: /member/ });
  await userEvent.click(screen.getByRole('button', { name: '新增管理员' }));
  const dialog = screen.getByRole('dialog', { name: '新增管理员' });
  expect(within(dialog).queryByLabelText('部门')).toBeNull();
  expect(within(dialog).queryByText('未分配')).toBeNull();
});

const usersWithPosts = (postIds: string[]) => ({
  items: [
    { id: 'u1', username: 'member', email: 'member@example.test', status: 'active', roles: ['user'], permissions: ['notes:access'], created_at: 1, last_login_at: 0, totp_enabled: false, department_id: 'd2', post_ids: postIds },
  ],
  total: 1,
  page: 1,
  page_size: 20,
});

it('creates users with the selected enabled posts', async () => {
  const createUser = vi.fn().mockResolvedValue({ id: 'u2', username: 'newcomer', email: 'n@example.test', status: 'active', roles: ['user'], permissions: [], created_at: 2, last_login_at: 0, totp_enabled: false });
  mount(metadata(['users:read', 'users:create', 'posts:read']), { users: vi.fn().mockResolvedValue(users()), roleOptions, listDepartments: vi.fn().mockResolvedValue(departments()), listPosts: vi.fn().mockResolvedValue(posts()), createUser });
  await screen.findByRole('row', { name: /member/ });
  await userEvent.click(screen.getByRole('button', { name: '新增用户' }));
  const dialog = screen.getByRole('dialog', { name: '新增用户' });
  const group = within(dialog).getByRole('group', { name: '岗位' });
  // Disabled posts never enter the create pool.
  expect(within(group).queryByRole('checkbox', { name: '停用岗' })).toBeNull();
  await userEvent.click(within(group).getByRole('checkbox', { name: '工程师' }));
  await userEvent.click(within(group).getByRole('checkbox', { name: '评审员' }));
  await userEvent.type(within(dialog).getByLabelText('账号'), 'newcomer');
  await userEvent.type(within(dialog).getByLabelText('邮箱'), 'n@example.test');
  await userEvent.type(within(dialog).getByLabelText('初始密码'), 'test-password-strong');
  await userEvent.click(within(dialog).getByRole('button', { name: '创建用户' }));
  await vi.waitFor(() => expect(createUser).toHaveBeenCalledWith(expect.objectContaining({ username: 'newcomer', post_ids: ['p1', 'p2'] })));
});

it('echoes saved posts when editing and clears them through unchecked boxes', async () => {
  const updateUser = vi.fn().mockResolvedValue({ id: 'u1', username: 'member', email: 'member@example.test', status: 'active', roles: ['user'], permissions: [], created_at: 1, last_login_at: 0, totp_enabled: false });
  mount(metadata(['users:read', 'users:update', 'posts:read']), { users: vi.fn().mockResolvedValue(usersWithPosts(['p1', 'p3'])), roleOptions, listDepartments: vi.fn().mockResolvedValue(departments()), listPosts: vi.fn().mockResolvedValue(posts()), updateUser });
  const row = await screen.findByRole('row', { name: /member/ });
  // The 岗位 column resolves names for enabled and disabled assignments alike.
  expect(within(row).getByText('工程师、停用岗')).toBeVisible();
  await userEvent.click(within(row).getByRole('button', { name: '编辑' }));
  const dialog = screen.getByRole('dialog', { name: '编辑member' });
  const group = within(dialog).getByRole('group', { name: '岗位' });
  expect(within(group).getByRole('checkbox', { name: '工程师' })).toBeChecked();
  // Disabled posts keep their existing membership visible and removable,
  // but cannot gain a new member.
  expect(within(group).getByRole('checkbox', { name: '停用岗' })).toBeChecked();
  expect(within(group).getByRole('checkbox', { name: '停用岗' })).toBeEnabled();
  await userEvent.click(within(group).getByRole('checkbox', { name: '工程师' }));
  await userEvent.click(within(group).getByRole('checkbox', { name: '停用岗' }));
  await userEvent.click(within(dialog).getByRole('button', { name: '保存' }));
  // An empty selection sends [] which the contract maps to "clear all posts".
  await vi.waitFor(() => expect(updateUser).toHaveBeenCalledWith('u1', expect.objectContaining({ post_ids: [] })));
});

it('cannot assign a disabled post that the user does not already hold', async () => {
  const updateUser = vi.fn().mockResolvedValue({ id: 'u1', username: 'member', email: 'member@example.test', status: 'active', roles: ['user'], permissions: [], created_at: 1, last_login_at: 0, totp_enabled: false });
  mount(metadata(['users:read', 'users:update', 'posts:read']), { users: vi.fn().mockResolvedValue(usersWithPosts(['p1'])), roleOptions, listDepartments: vi.fn().mockResolvedValue(departments()), listPosts: vi.fn().mockResolvedValue(posts()), updateUser });
  const row = await screen.findByRole('row', { name: /member/ });
  await userEvent.click(within(row).getByRole('button', { name: '编辑' }));
  const dialog = screen.getByRole('dialog', { name: '编辑member' });
  expect(within(dialog).getByRole('checkbox', { name: '停用岗' })).toBeDisabled();
  expect(within(dialog).getByRole('checkbox', { name: '停用岗' })).not.toBeChecked();
});

it('gates create and import on users:create and row actions on users:update', async () => {
  mount(metadata(['users:read']), { users: vi.fn().mockResolvedValue(users()), roleOptions, listDepartments: vi.fn().mockResolvedValue(departments()) });
  const row = await screen.findByRole('row', { name: /member/ });
  // Readers keep the list; every mutating button hides without its own point.
  expect(screen.queryByRole('button', { name: '新增用户' })).toBeNull();
  expect(screen.queryByRole('button', { name: '导入用户' })).toBeNull();
  expect(within(row).queryByRole('button', { name: '禁用' })).toBeNull();
  expect(within(row).queryByRole('button', { name: '编辑' })).toBeNull();
  // The catalogue stays exported for readers.
  expect(screen.getByRole('button', { name: '导出用户' })).toBeEnabled();
});

it('gates the administrator edit entry on administrators:update', async () => {
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MessageProvider>
        <AdminAdministratorsPage {...({ client: { transport: 'http', web: { administrators: vi.fn().mockResolvedValue(users()), adminRoleOptions: roleOptions } } as unknown as AppClient, metadata: grantUI(metadata(['administrators:read'])), registry: {}, theme: 'light', setTheme: () => {}, refresh: () => {} } as unknown as PageProps)} />
      </MessageProvider>
    </QueryClientProvider>,
  );
  const row = await screen.findByRole('row', { name: /member/ });
  expect(within(row).queryByRole('button', { name: '编辑' })).toBeNull();
  expect(within(row).queryByRole('button', { name: '禁用' })).toBeNull();
});


it('echoes multiple assigned roles and submits the complete selected set', async () => {
  const response = users();
  response.items[0].roles = ['user', 'ops'];
  const updateUser = vi.fn().mockResolvedValue(response.items[0]);
  mount(metadata(['users:read', 'users:update']), { users: vi.fn().mockResolvedValue(response), roleOptions: () => ({ items: [{ id: 'user', name: '用户', assignable: true }, { id: 'ops', name: '运营', assignable: true }] }), listDepartments: vi.fn().mockResolvedValue(departments()), updateUser });
  const row = await screen.findByRole('row', { name: /member/ });
  await userEvent.click(within(row).getByRole('button', { name: '编辑' }));
  const dialog = screen.getByRole('dialog', { name: '编辑member' });
  expect(await within(dialog).findByRole('checkbox', { name: '用户' })).toBeChecked();
  const operator = within(dialog).getByRole('checkbox', { name: '运营' });
  expect(operator).toBeChecked();
  await userEvent.click(operator);
  await userEvent.click(within(dialog).getByRole('button', { name: '保存' }));
  await vi.waitFor(() => expect(updateUser).toHaveBeenCalledWith('u1', expect.objectContaining({ role_ids: ['user'] })));
});

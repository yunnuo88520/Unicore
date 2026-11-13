/** Author: yunnuo <ymz@ebox.vip>
 * Description: The single-tree role editor saves four authorization faces (menus, actions, operations, permission points+data scope) where empty means empty; checking a page cascades its menu subtree and safe read APIs, the grant tree searches and shows three states, and copies prefill the create editor.
 */
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { expect, it, vi } from 'vitest';
import { MessageProvider } from '@unicore/ui';
import type { AppClient, Bootstrap } from '@unicore/sdk';
import { AdminRolesPage } from './roles';
import type { PageProps } from '../../router';

const permissions = [
 { id: 'notes:access', name: '访问笔记', description: '读取笔记', group: '业务权限', assignable: true },
 { id: 'notes:create', name: '创建笔记', description: '新建个人笔记', group: '业务权限', assignable: true },
 { id: 'notes:update', name: '编辑笔记', description: '修改个人笔记内容与状态', group: '业务权限', assignable: true },
 { id: 'notes:delete', name: '删除笔记', description: '删除笔记', group: '业务权限', assignable: true },
  { id: 'users:read', name: '查看用户', description: '搜索和查看用户账号、角色与状态', group: '用户管理', assignable: false },
  { id: 'roles:write', name: '管理角色', description: '创建、编辑与删除角色并分配权限', group: '角色权限', assignable: false, super_admin: true },
  { id: 'settings:write', name: '修改基础设置', description: '修改品牌、安全与账号策略', group: '系统管理', assignable: false, super_admin: true },
  { id: 'monitor:read', name: '查看运行监控', description: '查看实例监控', group: '系统管理', assignable: false, super_admin: true },
  { id: 'menus:write', name: '管理菜单', description: '调整工作空间菜单的顺序、分组与可见性', group: '角色权限', assignable: false },
  { id: 'files:access', name: '使用文件管理', description: '访问文件管理页面并上传、下载文件', group: '业务权限', assignable: true },
];

const rolesPayload = () => ({
  items: [
    { id: 'super_admin', name: '超级管理员', builtin: true, permissions: ['roles:write'], user_count: 1, realm: 'administrator', data_scope: 'all', menu_ids: [], action_ids: [], operation_ids: [], authorization_initialized: true },
    { id: 'ops-admin', name: '内容运营', builtin: false, permissions: ['users:read'], user_count: 2, realm: 'administrator', data_scope: 'self', menu_ids: ['n-users'], action_ids: [], operation_ids: ['listUsers'], authorization_initialized: true },
    { id: 'user', name: '用户', builtin: true, permissions: ['files:access'], user_count: 5, realm: 'user', data_scope: 'self', menu_ids: [], action_ids: [], operation_ids: [], authorization_initialized: true },
    { id: 'recorder', name: '记录员', builtin: false, permissions: ['notes:access'], user_count: 3, realm: 'user', data_scope: 'custom', department_ids: ['d1'], menu_ids: ['n-notes'], action_ids: ['n-act-notes'], operation_ids: ['listNotes'], authorization_initialized: true },
  ],
  permissions,
});

const menuConfig = () => ({
  version: 3,
  items: [],
  pages: [],
  sections: [
    { id: 'sec-user', surfaces: ['user'], name: '业务', sort: 0, visible: true, show_title: true },
    { id: 'sec-admin', surfaces: ['administrator'], name: '后台', sort: 0, visible: true, show_title: true },
  ],
  nodes: [
    { id: 'n-notes', section_id: 'sec-user', type: 'page', label: '我的笔记', route_id: 'notes', icon: 'NotebookPen', sort: 0, visible: true, open_mode: 'same_tab', badge_text: '', badge_color: '', badge_dot: false, operation_ids: [], disabled: false, permission: 'notes:access', surfaces: ['user', 'administrator'] },
    // The real tree carries one action per grantable operation of the page,
    // including the administrator-realm variants of the shared notes page.
    { id: 'op:listNotes', section_id: 'sec-user', parent_id: 'n-notes', type: 'action', label: '浏览笔记', icon: '', sort: 0, visible: true, open_mode: 'same_tab', badge_text: '', badge_color: '', badge_dot: false, operation_ids: ['listNotes'], disabled: false, permission: 'notes:access', surfaces: ['user', 'administrator'] },
    { id: 'op:createNote', section_id: 'sec-user', parent_id: 'n-notes', type: 'action', label: '创建笔记', icon: '', sort: 1, visible: true, open_mode: 'same_tab', badge_text: '', badge_color: '', badge_dot: false, operation_ids: ['createNote'], disabled: false, permission: 'notes:create', surfaces: ['user', 'administrator'] },
    { id: 'op:adminCreateNote', section_id: 'sec-user', parent_id: 'n-notes', type: 'action', label: '创建笔记', icon: '', sort: 2, visible: true, open_mode: 'same_tab', badge_text: '', badge_color: '', badge_dot: false, operation_ids: ['adminCreateNote'], disabled: false, permission: 'notes:create', surfaces: ['user', 'administrator'] },
    { id: 'op:updateNote', section_id: 'sec-user', parent_id: 'n-notes', type: 'action', label: '编辑笔记', icon: '', sort: 3, visible: true, open_mode: 'same_tab', badge_text: '', badge_color: '', badge_dot: false, operation_ids: ['updateNote'], disabled: false, permission: 'notes:update', surfaces: ['user', 'administrator'] },
    { id: 'op:deleteNote', section_id: 'sec-user', parent_id: 'n-notes', type: 'action', label: '删除笔记', icon: '', sort: 4, visible: true, open_mode: 'same_tab', badge_text: '', badge_color: '', badge_dot: false, operation_ids: ['deleteNote'], disabled: false, permission: 'notes:delete', surfaces: ['user', 'administrator'] },
    { id: 'n-act-notes', section_id: 'sec-user', parent_id: 'n-notes', type: 'action', label: '导出笔记动作', icon: '', sort: 0, visible: true, open_mode: 'same_tab', badge_text: '', badge_color: '', badge_dot: false, operation_ids: ['listNotes'], disabled: false, permission: 'notes:delete', surfaces: ['user'] },
    { id: 'n-act-notes-2', section_id: 'sec-user', parent_id: 'n-notes', type: 'action', label: '导出笔记动作', icon: '', sort: 1, visible: true, open_mode: 'same_tab', badge_text: '', badge_color: '', badge_dot: false, operation_ids: ['listNotes'], disabled: false, permission: 'notes:delete', surfaces: ['user'] },
    { id: 'n-dir', section_id: 'sec-user', type: 'directory', label: '组织目录', icon: 'Network', sort: 1, visible: true, open_mode: 'same_tab', badge_text: '', badge_color: '', badge_dot: false, operation_ids: [], disabled: false, surfaces: ['user'] },
    { id: 'n-child', section_id: 'sec-user', parent_id: 'n-dir', type: 'page', label: '子页面', icon: 'FileText', sort: 0, visible: true, open_mode: 'same_tab', badge_text: '', badge_color: '', badge_dot: false, operation_ids: [], disabled: false, permission: 'files:access', surfaces: ['user'] },
    { id: 'n-users', section_id: 'sec-admin', type: 'page', route_id: 'users', label: '用户列表', icon: 'UserRound', sort: 0, visible: true, open_mode: 'same_tab', badge_text: '', badge_color: '', badge_dot: false, operation_ids: [], disabled: false, permission: 'users:read', surfaces: ['administrator'] },
    { id: 'administration', section_id: 'sec-admin', type: 'directory', label: '', icon: 'Users', sort: 1, visible: true, open_mode: 'same_tab', badge_text: '', badge_color: '', badge_dot: false, operation_ids: [], disabled: false, surfaces: ['administrator'] },
    { id: 'n-unnamed-files', section_id: 'sec-user', type: 'page', label: '', route_id: 'overview', icon: 'FolderOpen', sort: 2, visible: true, open_mode: 'same_tab', badge_text: '', badge_color: '', badge_dot: false, operation_ids: [], disabled: false, permission: 'files:access', surfaces: ['user'] },
    { id: 'n-raw', section_id: 'sec-user', type: 'page', label: '', icon: 'Circle', sort: 3, visible: true, open_mode: 'same_tab', badge_text: '', badge_color: '', badge_dot: false, operation_ids: [], disabled: false, surfaces: ['user'] },
  ],
});

function metadata(permissions: string[]) {
  return { profile: 'web-platform', identity_realm: 'administrator', capabilities: {}, current_user: { id: 'admin-1', roles: ['super_admin'], permissions } } as unknown as Bootstrap;
}

function mount(metadata: Bootstrap, web: Record<string, unknown>) {
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MessageProvider>
        <AdminRolesPage {...({ client: { transport: 'http', web } as unknown as AppClient, metadata, registry: {}, theme: 'light', setTheme: () => {}, refresh: () => {} } as unknown as PageProps)} />
      </MessageProvider>
    </QueryClientProvider>,
  );
}

const baseWeb = (extra: Record<string, unknown> = {}) => ({ apiOperations: vi.fn().mockResolvedValue({ items: [] }), roles: vi.fn().mockResolvedValue(rolesPayload()), menuConfig: vi.fn().mockImplementation(menuConfig), ...extra });

async function openEditor(action: string) {
  await userEvent.click(await screen.findByRole('button', { name: action }));
  // Copies open the create editor: only edits reuse the source role object.
  return screen.getByRole('dialog', { name: action === '编辑角色 记录员' ? '编辑角色' : '新建角色' });
}

// The advanced permission-point catalogue stays collapsed below the tree.
async function openAdvanced(dialog: HTMLElement) {
  await userEvent.click(within(dialog).getByRole('button', { name: /高级/ }));
  return within(dialog).getByRole('group', { name: '权限点' });
}

it('lists all roles together and shows member counts per role', async () => {
  mount(metadata(['roles:read', 'roles:write']), baseWeb());
  expect(await screen.findByText('记录员')).toBeVisible();
  expect(screen.getByText('内容运营')).toBeVisible();
  expect(screen.getByText('超级管理员')).toBeVisible();
  expect(screen.getByText('全部')).toBeVisible();
  expect(screen.getByText('自定义 · 1 个部门')).toBeVisible();
  expect(screen.getByRole('row', { name: /内容运营/ })).toHaveTextContent('2');
});

it('keeps menu and dictionary grants selectable while super-only points stay locked in the advanced catalogue', async () => {
  const createRole = vi.fn().mockResolvedValue({ id: 'ops-admin', name: '内容运营', builtin: false, permissions: ['menus:write'], user_count: 0, realm: 'administrator', menu_ids: [], action_ids: [], operation_ids: [], authorization_initialized: true });
  mount(metadata(['roles:read', 'roles:write']), baseWeb({ createRole }));
  await screen.findByText('记录员');
  const dialog = await openEditor('新建角色');
  expect(within(dialog).queryByLabelText('角色域')).toBeNull();
  await userEvent.type(within(dialog).getByLabelText('角色名称'), '内容运营');
  const points = await openAdvanced(dialog);
  await userEvent.click(within(points).getByRole('checkbox', { name: '管理菜单' }));
  expect(within(points).getByRole('checkbox', { name: '查看用户' })).toBeEnabled();
  expect(within(points).queryByRole('checkbox', { name: '管理角色' })).toBeNull();
  expect(within(points).queryByRole('checkbox', { name: '修改基础设置' })).toBeNull();
  expect(within(points).getAllByText('仅超级管理员', { exact: true })).toHaveLength(3);
  await userEvent.click(within(dialog).getByRole('button', { name: '保存' }));
  await vi.waitFor(() => expect(createRole).toHaveBeenCalledWith(expect.objectContaining({ name: '内容运营', permissions: ['menus:write'], realm: 'user' })));
});

it('allows business and management permissions in the same role', async () => {
  mount(metadata(['roles:read', 'roles:write']), baseWeb());
  await screen.findByText('记录员');
  const dialog = await openEditor('新建角色');
  const points = await openAdvanced(dialog);
  expect(within(points).getByRole('checkbox', { name: '使用文件管理' })).toBeEnabled();
  expect(within(points).getByRole('checkbox', { name: '管理菜单' })).toBeEnabled();
  expect(within(points).getByRole('checkbox', { name: '查看用户' })).toBeEnabled();
  expect(within(points).getAllByText('仅超级管理员', { exact: true })).toHaveLength(3);
});

it('renders the matrix grouped by catalogue group with action-point descriptions', async () => {
  mount(metadata(['roles:read', 'roles:write']), baseWeb());
  await screen.findByText('记录员');
  const dialog = await openEditor('新建角色');
  const points = await openAdvanced(dialog);
  // Group headings come from the catalogue projection and translate both ways.
  expect(within(points).getByText('业务权限')).toBeVisible();
  expect(within(points).getByText('用户管理')).toBeVisible();
  // Newly added assignable action points stay selectable and keep descriptions.
  expect(within(points).getByRole('checkbox', { name: '创建笔记' })).toBeEnabled();
  expect(within(points).getByText('新建个人笔记')).toBeVisible();
  expect(within(points).getByText('搜索和查看用户账号、角色与状态')).toBeVisible();
});

it('saves an untouched editor with empty authorization arrays instead of an all-access backdoor', async () => {
  const createRole = vi.fn().mockResolvedValue({ id: 'empty', name: '空授权', builtin: false, permissions: [], user_count: 0, realm: 'user', menu_ids: [], action_ids: [], operation_ids: [], authorization_initialized: true });
  mount(metadata(['roles:read', 'roles:write']), baseWeb({ createRole }));
  await screen.findByText('记录员');
  const dialog = await openEditor('新建角色');
  await userEvent.type(within(dialog).getByLabelText('角色名称'), '空授权');
  await userEvent.click(within(dialog).getByRole('button', { name: '保存' }));
  await vi.waitFor(() => expect(createRole).toHaveBeenCalledWith(expect.objectContaining({
    name: '空授权', permissions: [], realm: 'user', menu_ids: [], action_ids: [], operation_ids: [],
  })));
});

it('authorizes menu trees per realm surface where directories aggregate their descendants', async () => {
  const createRole = vi.fn().mockResolvedValue({ id: 'menu-role', name: '菜单角色', builtin: false, permissions: [], user_count: 0, realm: 'user', menu_ids: ['n-dir', 'n-child'], action_ids: [], operation_ids: [], authorization_initialized: true });
  mount(metadata(['roles:read', 'roles:write']), baseWeb({ createRole }));
  await screen.findByText('记录员');
  const dialog = await openEditor('新建角色');
  // Each region keeps its title and the selected menu count; rows carry no
  // surface badges — the tree is plain, like the menu editor.
  expect(within(dialog).getByRole('region', { name: '业务' })).toBeVisible();
  expect(within(dialog).getByRole('region', { name: '后台' })).toBeVisible();
  expect(within(dialog).queryByText('两端')).toBeNull();
  expect(within(dialog).getByRole('checkbox', { name: '我的笔记' })).not.toBeChecked();
  await userEvent.click(within(dialog).getByRole('checkbox', { name: '组织目录' }));
  // Checking a directory selects the whole branch: the child page comes along.
  expect(within(dialog).getByRole('checkbox', { name: '子页面' })).toBeChecked();
  await userEvent.type(within(dialog).getByLabelText('角色名称'), '菜单角色');
  await userEvent.click(within(dialog).getByRole('button', { name: '保存' }));
  await vi.waitFor(() => expect(createRole).toHaveBeenCalledWith(expect.objectContaining({ name: '菜单角色', menu_ids: ['n-dir', 'n-child'] })));
});

it('completes the ancestor chain and shows the indeterminate state on partially granted directories', async () => {
  const createRole = vi.fn().mockResolvedValue({ id: 'child-role', name: '子页角色', builtin: false, permissions: [], user_count: 0, realm: 'user', menu_ids: ['n-dir', 'n-child'], action_ids: [], operation_ids: [], authorization_initialized: true });
  mount(metadata(['roles:read', 'roles:write']), baseWeb({ createRole }));
  await screen.findByText('记录员');
  const dialog = await openEditor('新建角色');
  const directory = within(dialog).getByRole('checkbox', { name: '组织目录' });
  // The navigation projection only renders pages whose ancestors are granted,
  // so checking the child completes the chain upward.
  await userEvent.click(within(dialog).getByRole('checkbox', { name: '子页面' }));
  expect(directory).toBeChecked();
  // Unchecking the child keeps the shared ancestor: the directory turns
  // partially granted until the branch is completed again.
  await userEvent.click(within(dialog).getByRole('checkbox', { name: '子页面' }));
  expect(directory).toBePartiallyChecked();
  await userEvent.click(within(dialog).getByRole('checkbox', { name: '子页面' }));
  await userEvent.type(within(dialog).getByLabelText('角色名称'), '子页角色');
  await userEvent.click(within(dialog).getByRole('button', { name: '保存' }));
  await vi.waitFor(() => expect(createRole).toHaveBeenCalledWith(expect.objectContaining({ name: '子页角色', menu_ids: ['n-dir', 'n-child'] })));
});

it('collapses branches and locates nodes through search', async () => {
  mount(metadata(['roles:read', 'roles:write']), baseWeb());
  await screen.findByText('记录员');
  const dialog = await openEditor('新建角色');
  // Collapsing the directory hides its subtree until expanded again.
  await userEvent.click(within(dialog).getByRole('button', { name: '展开或收起 组织目录' }));
  expect(within(dialog).queryByRole('checkbox', { name: '子页面' })).toBeNull();
  await userEvent.click(within(dialog).getByRole('button', { name: '展开或收起 组织目录' }));
  expect(within(dialog).getByRole('checkbox', { name: '子页面' })).toBeVisible();
  // Searching keeps matching nodes plus their ancestors and re-expands them.
  await userEvent.type(within(dialog).getByLabelText('搜索菜单或按钮'), '笔记');
  expect(within(dialog).getByRole('checkbox', { name: '我的笔记' })).toBeVisible();
  expect(within(dialog).queryByRole('checkbox', { name: '组织目录' })).toBeNull();
  await userEvent.clear(within(dialog).getByLabelText('搜索菜单或按钮'));
  expect(within(dialog).getByRole('checkbox', { name: '组织目录' })).toBeVisible();
});

it('locates unnamed menu nodes through the navigation display fallback', async () => {
  const createRole = vi.fn().mockResolvedValue({ id: 'fallback', name: '回退角色', builtin: false, permissions: [], user_count: 0, realm: 'user', menu_ids: ['n-unnamed-files', 'n-raw'], action_ids: [], operation_ids: [], authorization_initialized: true });
  mount(metadata(['roles:read', 'roles:write']), baseWeb({ createRole }));
  await screen.findByText('记录员');
  const dialog = await openEditor('新建角色');
  // An unnamed page node resolves its label from the registered route...
  const unnamed = within(dialog).getByRole('checkbox', { name: '工作台概览' });
  // ...a seeded directory resolves its localized title instead of leaking the raw id...
  expect(within(dialog).getByRole('checkbox', { name: '超级管理员' })).toBeVisible();
  // ...and a page without any route falls back to its raw id.
  const raw = within(dialog).getByRole('checkbox', { name: 'n-raw' });
  await userEvent.click(unnamed);
  await userEvent.click(raw);
  await userEvent.type(within(dialog).getByLabelText('角色名称'), '回退角色');
  await userEvent.click(within(dialog).getByRole('button', { name: '保存' }));
  await vi.waitFor(() => expect(createRole).toHaveBeenCalledWith(expect.objectContaining({ name: '回退角色', menu_ids: ['n-unnamed-files', 'n-raw'] })));
});

it('echoes saved menu authorization through the same tree when editing', async () => {
  const updateRole = vi.fn().mockResolvedValue({ id: 'recorder', name: '记录员', builtin: false, permissions: [], user_count: 0, realm: 'user', menu_ids: ['n-dir', 'n-child'], action_ids: [], operation_ids: [], authorization_initialized: true });
  mount(metadata(['roles:read', 'roles:write']), baseWeb({ updateRole }));
  await screen.findByText('记录员');
  const editDialog = await openEditor('编辑角色 记录员');
  // The recorder fixture carries the notes page (not the directory branch).
  expect(within(editDialog).getByRole('checkbox', { name: '我的笔记' })).toBeChecked();
  expect(within(editDialog).getByRole('checkbox', { name: '组织目录' })).not.toBeChecked();
});

it('copies a role into a prefilled create editor with its grants', async () => {
  const createRole = vi.fn().mockResolvedValue({ id: 'copy', name: '记录员 副本', builtin: false, permissions: ['notes:access'], user_count: 0, realm: 'user', menu_ids: ['n-notes'], action_ids: [], operation_ids: ['listNotes'], authorization_initialized: true });
  mount(metadata(['roles:read', 'roles:write']), baseWeb({ createRole }));
  await screen.findByText('记录员');
  const dialog = await openEditor('复制角色 记录员');
  expect(within(dialog).getByLabelText('角色名称')).toHaveValue('记录员 副本');
  // The copied grants ride along: the notes menu echo and the API grant, which
  // now lives in the page's expandable detail instead of a separate tab.
  expect(within(dialog).getByRole('checkbox', { name: '我的笔记' })).toBeChecked();
  await userEvent.click(within(dialog).getByRole('button', { name: '展开或收起 我的笔记' }));
  expect(within(dialog).getByRole('checkbox', { name: 'listNotes' })).toBeChecked();
  await userEvent.click(within(dialog).getByRole('button', { name: '保存' }));
  // The saved union legitimizes the copied action grant: its notes:delete
  // requirement merges into the permission set instead of being dropped.
  await vi.waitFor(() => expect(createRole).toHaveBeenCalledWith(expect.objectContaining({
    name: '记录员 副本', permissions: ['notes:access', 'notes:delete'], menu_ids: ['n-notes'], action_ids: ['n-act-notes'], operation_ids: ['listNotes'], realm: 'user',
  })));
});

it('authorizes page actions grouped by label with their permission point and linked operations', async () => {
  const createRole = vi.fn().mockResolvedValue({ id: 'act-role', name: '动作角色', builtin: false, permissions: [], user_count: 0, realm: 'user', menu_ids: [], action_ids: ['n-act-notes', 'n-act-notes-2'], operation_ids: ['listNotes'], authorization_initialized: true });
  mount(metadata(['roles:read', 'roles:write']), baseWeb({ createRole }));
  await screen.findByText('记录员');
  const dialog = await openEditor('新建角色');
  // Button groups stay behind their page's disclosure until asked for.
  expect(within(dialog).queryByRole('checkbox', { name: '导出笔记动作' })).toBeNull();
  await userEvent.click(within(dialog).getByRole('button', { name: '展开或收起 我的笔记' }));
  const action = within(dialog).getByRole('checkbox', { name: '导出笔记动作' });
  // Same-label derived buttons collapse into one grouped row; the owning
  // point and linked operations ride the tooltip instead of a second line.
  expect(within(dialog).getByTitle(/notes:delete · listNotes/)).toBeVisible();
  // Same-label derived buttons collapse into one grouped row; the ×2 badge
  // lives inside the group's own label, which also carries the hint tooltip.
  expect(within(within(dialog).getByTitle(/notes:delete · listNotes/)).getByText('×2')).toBeVisible();
  expect(action).toBeEnabled();
  await userEvent.click(action);
  // The implied points of the selection render as badges next to the page.
  expect(within(dialog).getByTitle('notes:delete')).toBeVisible();
  await userEvent.type(within(dialog).getByLabelText('角色名称'), '动作角色');
  await userEvent.click(within(dialog).getByRole('button', { name: '保存' }));
  await vi.waitFor(() => expect(createRole).toHaveBeenCalledWith(expect.objectContaining({
    name: '动作角色', action_ids: ['n-act-notes', 'n-act-notes-2'], operation_ids: ['listNotes'],
    permissions: expect.arrayContaining(['notes:access', 'notes:delete']),
  })));
});

it('grants APIs from the page surfaces regardless of role category', async () => {
  const createRole = vi.fn().mockResolvedValue({ id: 'api-role', name: '接口角色', builtin: false, permissions: [], user_count: 0, realm: 'user', menu_ids: [], action_ids: [], operation_ids: ['listNotes'], authorization_initialized: true });
  mount(metadata(['roles:read', 'roles:write']), baseWeb({ createRole }));
  await screen.findByText('记录员');
  const dialog = await openEditor('新建角色');
  await userEvent.click(within(dialog).getByRole('button', { name: '展开或收起 我的笔记' }));
  // Administrator-realm operations never surface for a user-realm role, while
  // the page's own operations stay selectable; super-admin catalogue entries
  // are filtered out entirely.
  expect(within(dialog).queryByRole('checkbox', { name: 'adminFileAccess' })).toBeNull();
  const listFiles = within(dialog).getByRole('checkbox', { name: 'listNotes' });
  expect(listFiles).toBeEnabled();
  await userEvent.click(listFiles);
  await userEvent.type(within(dialog).getByLabelText('角色名称'), '接口角色');
  await userEvent.click(within(dialog).getByRole('button', { name: '保存' }));
  // The operation's own permission point merges into the saved union.
  await vi.waitFor(() => expect(createRole).toHaveBeenCalledWith(expect.objectContaining({ name: '接口角色', operation_ids: ['listNotes'], permissions: ['notes:access'] })));
});

it('selects read APIs for a page and preserves independent API grants when its menu is unchecked', async () => {
  const createRole = vi.fn().mockResolvedValue({});
  mount(metadata(['roles:read', 'roles:write']), baseWeb({ createRole }));
  await screen.findByText('记录员');
  const dialog = await openEditor('新建角色');
  await userEvent.click(within(dialog).getByRole('button', { name: '展开或收起 我的笔记' }));
  await userEvent.click(within(dialog).getByRole('checkbox', { name: '我的笔记' }));
  expect(within(dialog).getByRole('checkbox', { name: '创建笔记' })).not.toBeChecked();
  expect(within(dialog).getByRole('checkbox', { name: 'listNotes' })).toBeChecked();
  expect(within(dialog).getByRole('checkbox', { name: 'adminListNotes' })).not.toBeChecked();
  expect(within(dialog).getByRole('checkbox', { name: 'createNote' })).not.toBeChecked();
  await userEvent.click(within(dialog).getByRole('checkbox', { name: '我的笔记' }));
  await userEvent.type(within(dialog).getByLabelText('角色名称'), '页面角色');
  await userEvent.click(within(dialog).getByRole('button', { name: '保存' }));
  await vi.waitFor(() => expect(createRole).toHaveBeenCalledWith(expect.objectContaining({ menu_ids: [], action_ids: [], operation_ids: ['listNotes', 'notesListFiles', 'notesFileUploadPolicy', 'notesMultipartUpload'] })));
});

it('grants management read APIs when a user-category role selects the users page', async () => {
  const createRole = vi.fn().mockResolvedValue({});
  mount(metadata(['roles:read', 'roles:write']), baseWeb({ createRole }));
  await screen.findByText('记录员');
  const dialog = await openEditor('新建角色');
  await userEvent.click(within(dialog).getByRole('checkbox', { name: '用户列表' }));
  await userEvent.type(within(dialog).getByLabelText('角色名称'), '管理角色');
  await userEvent.click(within(dialog).getByRole('button', { name: '保存' }));
  await vi.waitFor(() => expect(createRole).toHaveBeenCalledWith(expect.objectContaining({ realm: 'user', permissions: expect.arrayContaining(['users:read']), operation_ids: expect.arrayContaining(['listUsers']) })));
});

it('hides write actions from operators without roles:write while the editor stays readable', async () => {
  mount(metadata(['roles:read']), baseWeb());
  expect(await screen.findByText('记录员')).toBeVisible();
  expect(screen.queryByRole('button', { name: '新建角色' })).toBeNull();
  expect(screen.queryByRole('button', { name: '删除角色 记录员' })).toBeNull();
  expect(await screen.findByText('内容运营')).toBeVisible();
  expect(screen.queryByRole('button', { name: '编辑角色 内容运营' })).toBeNull();
});

const departmentsPayload = () => ({
  items: [
    { id: 'd1', name: '研发部', sort: 0, created_at: 1, updated_at: 1 },
    { id: 'd3', name: '前端组', parent_id: 'd1', sort: 0, created_at: 3, updated_at: 3 },
  ],
  total: 2,
});

it('exposes the five user data scopes with a department tree for the custom scope', async () => {
  const createRole = vi.fn().mockResolvedValue({ id: 'scoped', name: '区域角色', builtin: false, permissions: [], user_count: 0, realm: 'user', data_scope: 'custom', department_ids: ['d3'], menu_ids: [], action_ids: [], operation_ids: [], authorization_initialized: true });
  mount(metadata(['roles:read', 'roles:write']), baseWeb({ createRole, listDepartments: vi.fn().mockResolvedValue(departmentsPayload()) }));
  await screen.findByText('记录员');
  const dialog = await openEditor('新建角色');
  const scope = within(dialog).getByLabelText('数据范围');
  expect(scope).toHaveTextContent('仅本人');
  await userEvent.click(scope);
  expect(screen.getAllByRole('option').map(option => option.textContent)).toEqual(['仅本人', '本部门', '本部门及以下', '自定义', '全部']);
  // The department tree only opens for the custom scope.
  expect(within(dialog).queryByRole('group', { name: '自定义部门范围' })).toBeNull();
  await userEvent.click(screen.getByRole('option', { name: '自定义' }));
  const tree = within(dialog).getByRole('group', { name: '自定义部门范围' });
  await userEvent.click(within(tree).getByRole('checkbox', { name: '前端组' }));
  expect(within(tree).getByRole('checkbox', { name: '研发部' })).not.toBeChecked();
  await userEvent.type(within(dialog).getByLabelText('角色名称'), '区域角色');
  await userEvent.click(within(dialog).getByRole('button', { name: '保存' }));
  await vi.waitFor(() => expect(createRole).toHaveBeenCalledWith(expect.objectContaining({ name: '区域角色', data_scope: 'custom', department_ids: ['d3'] })));
});

it('allows management roles to configure their data scope', async () => {
  const createRole = vi.fn().mockResolvedValue({ id: 'ops2', name: '内容运营二', builtin: false, permissions: ['users:read'], user_count: 0, realm: 'administrator', data_scope: 'self', department_ids: [], menu_ids: [], action_ids: [], operation_ids: [], authorization_initialized: true });
  mount(metadata(['roles:read', 'roles:write']), baseWeb({ createRole, listDepartments: vi.fn() }));
  await screen.findByText('记录员');
  const dialog = await openEditor('新建角色');
  expect(within(dialog).getByLabelText('数据范围')).toHaveTextContent('仅本人');
  expect(within(dialog).queryByRole('group', { name: '自定义部门范围' })).toBeNull();
  await userEvent.type(within(dialog).getByLabelText('角色名称'), '内容运营二');
  const points = await openAdvanced(dialog);
  await userEvent.click(within(points).getByRole('checkbox', { name: '查看用户' }));
  await userEvent.click(within(dialog).getByRole('button', { name: '保存' }));
  await vi.waitFor(() => expect(createRole).toHaveBeenCalledWith(expect.objectContaining({ name: '内容运营二', permissions: ['users:read'], realm: 'user' })));
});

it('echoes a saved custom scope with its department selection when editing', async () => {
  const payload = rolesPayload();
  const recorder = payload.items.find(item => item.id === 'recorder')!;
  (recorder as Record<string, unknown>).data_scope = 'custom';
  (recorder as Record<string, unknown>).department_ids = ['d3'];
  const roles = vi.fn().mockResolvedValue(payload);
  const updateRole = vi.fn().mockResolvedValue({ ...recorder, data_scope: 'self', department_ids: [] });
  mount(metadata(['roles:read', 'roles:write']), { roles, updateRole, listDepartments: vi.fn().mockResolvedValue(departmentsPayload()), menuConfig: vi.fn().mockImplementation(menuConfig) });
  await screen.findByText('记录员');
  const dialog = await openEditor('编辑角色 记录员');
  expect(within(dialog).getByLabelText('数据范围')).toHaveTextContent('自定义');
  expect(within(dialog).getByRole('checkbox', { name: '前端组' })).toBeChecked();
  // Switching away from custom empties the department selection in the payload.
  await userEvent.click(within(dialog).getByLabelText('数据范围'));
  await userEvent.click(screen.getByRole('option', { name: '仅本人' }));
  await userEvent.click(within(dialog).getByRole('button', { name: '保存' }));
  await vi.waitFor(() => expect(updateRole).toHaveBeenCalledWith('recorder', expect.objectContaining({ data_scope: 'self', department_ids: [] })));
});

it('drops dependent buttons when an API operation is unchecked instead of failing silently at save', async () => {
  // Unchecking createNote used to leave the 新建 button checked in the tree
  // while the submit filters dropped it (and its implied point) silently.
  const createRole = vi.fn().mockResolvedValue({ id: 'x', name: '运营', builtin: false, permissions: [], user_count: 0, realm: 'user', menu_ids: [], action_ids: [], operation_ids: [], authorization_initialized: true });
  mount(metadata(['roles:read', 'roles:write']), baseWeb({ createRole }));
  await screen.findByText('记录员');
  const dialog = await openEditor('新建角色');
  await userEvent.type(within(dialog).getByLabelText('角色名称'), '运营');
  await userEvent.click(within(dialog).getByRole('checkbox', { name: '我的笔记' }));
  await userEvent.click(within(dialog).getByRole('button', { name: '展开或收起 我的笔记' }));
  await userEvent.click(within(dialog).getByRole('checkbox', { name: '创建笔记' }));
  await userEvent.click(within(dialog).getByRole('checkbox', { name: 'createNote' }));
  // The dependent button group unchecks itself in the tree with the operation.
  expect(within(dialog).getByRole('checkbox', { name: '创建笔记' })).not.toBeChecked();
  await userEvent.click(within(dialog).getByRole('button', { name: '保存' }));
  await vi.waitFor(() => expect(createRole).toHaveBeenCalled());
  const input = createRole.mock.calls[0][0] as Record<string, string[]>;
  expect(input.operation_ids).not.toContain('createNote');
  expect(input.action_ids).not.toContain('op:createNote');
  // The administrator API remains separately selected; its button is independent.
  expect(input.action_ids).not.toContain('op:adminCreateNote');
  // Explicit permission points remain independent of API grants.
  expect(input.permissions).toContain('notes:create');
  // The untouched grants survive the prune.
  expect(input.operation_ids).toContain('listNotes');
  expect(input.permissions).toContain('notes:access');
});

it('revokes a derived permission and its API while preserving an unrelated API-only grant', async () => {
  const createRole = vi.fn().mockResolvedValue({});
  const apiOperations = vi.fn().mockResolvedValue({ items: [
    { operation_id: 'listFiles', method: 'GET', path: '/api/v1/files', summary: 'listFiles', tags: [], realm: 'user', permissions: ['files:access'], permission_mode: 'all', csrf: false, super_admin: false, grantable: true },
    { operation_id: 'listUsers', method: 'GET', path: '/api/v1/admin/users', summary: 'listUsers', tags: [], realm: 'administrator', permissions: ['users:read'], permission_mode: 'all', csrf: false, super_admin: false, grantable: true },
  ] });
  mount(metadata(['roles:read', 'roles:write']), baseWeb({ createRole, apiOperations }));
  await screen.findByText('记录员');
  const dialog = await openEditor('新建角色');
  const points = await openAdvanced(dialog);
  await userEvent.click(await within(dialog).findByRole('checkbox', { name: 'listFiles' }));
  await userEvent.click(within(dialog).getByRole('checkbox', { name: 'listUsers' }));
  expect(within(points).getByRole('checkbox', { name: '查看用户' })).toBeChecked();
  await userEvent.click(within(points).getByRole('checkbox', { name: '查看用户' }));
  expect(within(dialog).getByRole('checkbox', { name: 'listUsers' })).not.toBeChecked();
  expect(within(dialog).getByRole('checkbox', { name: 'listFiles' })).toBeChecked();
  await userEvent.type(within(dialog).getByLabelText('角色名称'), 'API-only');
  await userEvent.click(within(dialog).getByRole('button', { name: '保存' }));
  await vi.waitFor(() => expect(createRole).toHaveBeenCalledWith(expect.objectContaining({ permissions: ['files:access'], operation_ids: ['listFiles'], menu_ids: [], action_ids: [] })));
});

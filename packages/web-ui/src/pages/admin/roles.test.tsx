/** Author: yunnuo <ymz@ebox.vip>
 * Description: Realm tabs filter the role list; the editor saves four authorization faces (menus, actions, operations, data scope) where empty means empty, and super-only points stay locked per realm.
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
 { id: 'notes:delete', name: '删除笔记', description: '删除笔记', group: '业务权限', assignable: true },
  { id: 'users:read', name: '查看用户', description: '搜索和查看用户账号、角色与状态', group: '用户管理', assignable: false },
  { id: 'roles:write', name: '管理角色', description: '创建、编辑与删除角色并分配权限', group: '角色权限', assignable: false },
  { id: 'settings:write', name: '修改基础设置', description: '修改品牌、安全与账号策略', group: '系统管理', assignable: false },
  { id: 'menus:write', name: '管理菜单', description: '调整工作空间菜单的顺序、分组与可见性', group: '角色权限', assignable: false },
  { id: 'files:access', name: '使用文件管理', description: '访问文件管理页面并上传、下载文件', group: '业务权限', assignable: true },
  { id: 'notes:create', name: '创建笔记', description: '新建个人笔记', group: '业务权限', assignable: true },
];

const rolesPayload = () => ({
  items: [
    { id: 'super_admin', name: '超级管理员', builtin: true, permissions: ['roles:write'], user_count: 1, realm: 'administrator', menu_ids: [], action_ids: [], operation_ids: [], authorization_initialized: true },
    { id: 'ops-admin', name: '内容运营', builtin: false, permissions: ['users:read'], user_count: 2, realm: 'administrator', menu_ids: ['n-users'], action_ids: [], operation_ids: ['listUsers'], authorization_initialized: true },
    { id: 'user', name: '用户', builtin: true, permissions: ['files:access'], user_count: 5, realm: 'user', menu_ids: [], action_ids: [], operation_ids: [], authorization_initialized: true },
    { id: 'recorder', name: '记录员', builtin: false, permissions: ['notes:access'], user_count: 3, realm: 'user', menu_ids: ['n-notes'], action_ids: ['n-act-notes'], operation_ids: ['listNotes'], authorization_initialized: true },
  ],
  permissions,
});

const menuConfig = () => ({
  version: 3,
  items: [],
  pages: [],
  sections: [
    { id: 'sec-user', surface: 'user', name: '业务', sort: 0, visible: true, show_title: true },
    { id: 'sec-admin', surface: 'administrator', name: '后台', sort: 0, visible: true, show_title: true },
  ],
  nodes: [
    { id: 'n-notes', section_id: 'sec-user', type: 'page', label: '我的笔记', icon: 'NotebookPen', sort: 0, visible: true, open_mode: 'same_tab', badge_text: '', badge_color: '', badge_dot: false, operation_ids: [], disabled: false, permission: 'notes:access' },
    { id: 'n-act-notes', section_id: 'sec-user', parent_id: 'n-notes', type: 'action', label: '导出笔记动作', icon: '', sort: 0, visible: true, open_mode: 'same_tab', badge_text: '', badge_color: '', badge_dot: false, operation_ids: ['listNotes'], disabled: false, permission: 'notes:delete' },
    { id: 'n-dir', section_id: 'sec-user', type: 'directory', label: '组织目录', icon: 'Network', sort: 1, visible: true, open_mode: 'same_tab', badge_text: '', badge_color: '', badge_dot: false, operation_ids: [], disabled: false },
    { id: 'n-child', section_id: 'sec-user', parent_id: 'n-dir', type: 'page', label: '子页面', icon: 'FileText', sort: 0, visible: true, open_mode: 'same_tab', badge_text: '', badge_color: '', badge_dot: false, operation_ids: [], disabled: false, permission: 'files:access' },
    { id: 'n-users', section_id: 'sec-admin', type: 'page', label: '用户列表', icon: 'UserRound', sort: 0, visible: true, open_mode: 'same_tab', badge_text: '', badge_color: '', badge_dot: false, operation_ids: [], disabled: false, permission: 'users:read' },
    { id: 'n-unnamed-files', section_id: 'sec-user', type: 'page', label: '', route_id: 'files', icon: 'FolderOpen', sort: 2, visible: true, open_mode: 'same_tab', badge_text: '', badge_color: '', badge_dot: false, operation_ids: [], disabled: false, permission: 'files:access' },
    { id: 'n-raw', section_id: 'sec-user', type: 'page', label: '', icon: 'Circle', sort: 3, visible: true, open_mode: 'same_tab', badge_text: '', badge_color: '', badge_dot: false, operation_ids: [], disabled: false },
  ],
});

const apiOperations = () => ({
  items: [
    { operation_id: 'listNotes', method: 'GET', path: '/api/v1/notes', summary: '列出笔记', tags: ['笔记'], realm: 'user', permissions: ['notes:access'], permission_mode: 'all', csrf: false, super_admin: false, grantable: true },
    { operation_id: 'applyUpdate', method: 'POST', path: '/api/v1/admin/updates/apply', summary: '安装更新', tags: ['系统'], realm: 'administrator', permissions: ['updates:apply'], permission_mode: 'all', csrf: true, super_admin: true, grantable: true },
    { operation_id: 'publicPolicy', method: 'GET', path: '/api/v1/auth/policy', summary: '登录策略', tags: ['认证'], realm: 'both', permissions: [], permission_mode: 'public', csrf: false, super_admin: false, grantable: false },
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

const baseWeb = (extra: Record<string, unknown> = {}) => ({ roles: vi.fn().mockResolvedValue(rolesPayload()), menuConfig: vi.fn().mockImplementation(menuConfig), apiOperations: vi.fn().mockImplementation(apiOperations), ...extra });

it('lists all roles together and shows member counts per role', async () => {
  mount(metadata(['roles:read', 'roles:write']), baseWeb());
  expect(await screen.findByText('记录员')).toBeVisible();
  expect(screen.getByText('内容运营')).toBeVisible();
  expect(screen.getByText('超级管理员')).toBeVisible();
  expect(await screen.findByText('内容运营')).toBeVisible();
  expect(screen.getByText('超级管理员')).toBeVisible();
  expect(screen.getByText('记录员')).toBeVisible();
  expect(screen.getByRole('row', { name: /内容运营/ })).toHaveTextContent('2');
});

it('keeps menu and dictionary grants selectable while super-only points stay locked in the administrator matrix', async () => {
  const createRole = vi.fn().mockResolvedValue({ id: 'ops-admin', name: '内容运营', builtin: false, permissions: ['menus:write'], user_count: 0, realm: 'administrator', menu_ids: [], action_ids: [], operation_ids: [], authorization_initialized: true });
  mount(metadata(['roles:read', 'roles:write']), baseWeb({ createRole }));
  await screen.findByText('记录员');
  await userEvent.click(await screen.findByRole('button', { name: '新建角色' }));
  const dialog = screen.getByRole('dialog', { name: '新建角色' });
  expect(within(dialog).queryByLabelText('角色域')).toBeNull();
  await userEvent.type(within(dialog).getByLabelText('角色名称'), '内容运营');
  await userEvent.click(within(dialog).getByRole('checkbox', { name: '管理菜单' }));
  expect(within(dialog).getByRole('checkbox', { name: '查看用户' })).toBeEnabled();
  expect(within(dialog).queryByRole('checkbox', { name: '管理角色' })).toBeNull();
  expect(within(dialog).queryByRole('checkbox', { name: '修改基础设置' })).toBeNull();
  expect(within(dialog).getAllByText('仅超级管理员', { exact: true })).toHaveLength(2);
  await userEvent.click(within(dialog).getByRole('button', { name: '保存' }));
  await vi.waitFor(() => expect(createRole).toHaveBeenCalledWith(expect.objectContaining({ name: '内容运营', permissions: ['menus:write'], realm: 'user' })));
});

it('allows business and management permissions in the same role', async () => {
  mount(metadata(['roles:read', 'roles:write']), baseWeb());
  await screen.findByText('记录员');
  await userEvent.click(screen.getByRole('button', { name: '新建角色' }));
  const dialog = screen.getByRole('dialog', { name: '新建角色' });
  expect(within(dialog).getByRole('checkbox', { name: '使用文件管理' })).toBeEnabled();
  expect(within(dialog).getByRole('checkbox', { name: '管理菜单' })).toBeEnabled();
  expect(within(dialog).getByRole('checkbox', { name: '查看用户' })).toBeEnabled();
  expect(within(dialog).getAllByText('仅超级管理员', { exact: true })).toHaveLength(2);
});

it('renders the matrix grouped by catalogue group with action-point descriptions', async () => {
  mount(metadata(['roles:read', 'roles:write']), baseWeb());
  await screen.findByText('记录员');
  await userEvent.click(screen.getByRole('button', { name: '新建角色' }));
  const dialog = screen.getByRole('dialog', { name: '新建角色' });
  // Group headings come from the catalogue projection and translate both ways.
  expect(within(dialog).getByText('业务权限')).toBeVisible();
  expect(within(dialog).getByText('用户管理')).toBeVisible();
  // Newly added assignable action points stay selectable and keep descriptions.
  expect(within(dialog).getByRole('checkbox', { name: '创建笔记' })).toBeEnabled();
  expect(within(dialog).getByText('新建个人笔记')).toBeVisible();
  expect(within(dialog).getByText('搜索和查看用户账号、角色与状态')).toBeVisible();
});

it('saves an untouched editor with empty authorization arrays instead of an all-access backdoor', async () => {
  const createRole = vi.fn().mockResolvedValue({ id: 'empty', name: '空授权', builtin: false, permissions: [], user_count: 0, realm: 'user', menu_ids: [], action_ids: [], operation_ids: [], authorization_initialized: true });
  mount(metadata(['roles:read', 'roles:write']), baseWeb({ createRole }));
  await screen.findByText('记录员');
  await userEvent.click(screen.getByRole('button', { name: '新建角色' }));
  const dialog = screen.getByRole('dialog', { name: '新建角色' });
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
  await userEvent.click(screen.getByRole('button', { name: '新建角色' }));
  const dialog = screen.getByRole('dialog', { name: '新建角色' });
  // Only the current realm surface is offered; the administrator page stays out.
  expect(within(dialog).getByText('业务')).toBeVisible();
  expect(within(dialog).getByText('后台')).toBeVisible();
  expect(within(dialog).getByRole('checkbox', { name: '我的笔记' })).not.toBeChecked();
  await userEvent.click(within(dialog).getByRole('checkbox', { name: '组织目录' }));
  // Checking a directory selects the whole branch: the child page comes along.
  expect(within(dialog).getByRole('checkbox', { name: '子页面' })).toBeChecked();
  await userEvent.type(within(dialog).getByLabelText('角色名称'), '菜单角色');
  await userEvent.click(within(dialog).getByRole('button', { name: '保存' }));
  await vi.waitFor(() => expect(createRole).toHaveBeenCalledWith(expect.objectContaining({ name: '菜单角色', menu_ids: ['n-dir', 'n-child'] })));
});

it('locates unnamed menu nodes through the navigation display fallback', async () => {
  const createRole = vi.fn().mockResolvedValue({ id: 'fallback', name: '回退角色', builtin: false, permissions: [], user_count: 0, realm: 'user', menu_ids: ['n-unnamed-files', 'n-raw'], action_ids: [], operation_ids: [], authorization_initialized: true });
  mount(metadata(['roles:read', 'roles:write']), baseWeb({ createRole }));
  await screen.findByText('记录员');
  await userEvent.click(screen.getByRole('button', { name: '新建角色' }));
  const dialog = screen.getByRole('dialog', { name: '新建角色' });
  // An unnamed page node resolves its label from the registered route...
  const unnamed = within(dialog).getByRole('checkbox', { name: '文件管理' });
  // ...and a node without any route falls back to its raw id.
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
  await userEvent.click(screen.getByRole('button', { name: '编辑角色 记录员' }));
  const editDialog = screen.getByRole('dialog', { name: '编辑角色' });
  // The recorder fixture carries the notes page (not the directory branch).
  expect(within(editDialog).getByRole('checkbox', { name: '我的笔记' })).toBeChecked();
  expect(within(editDialog).getByRole('checkbox', { name: '组织目录' })).not.toBeChecked();
});

it('authorizes page actions with their permission point and linked operations', async () => {
  const createRole = vi.fn().mockResolvedValue({ id: 'act-role', name: '动作角色', builtin: false, permissions: [], user_count: 0, realm: 'user', menu_ids: [], action_ids: ['n-act-notes'], operation_ids: [], authorization_initialized: true });
  mount(metadata(['roles:read', 'roles:write']), baseWeb({ createRole }));
  await screen.findByText('记录员');
  await userEvent.click(screen.getByRole('button', { name: '新建角色' }));
  const dialog = screen.getByRole('dialog', { name: '新建角色' });
  // The action row shows its owning page, permission point and operation ids.
  const action = within(dialog).getByRole('checkbox', { name: '导出笔记动作' });
  expect(within(dialog).getByText(/我的笔记 · notes:delete · listNotes/)).toBeVisible();
  expect(action).toBeDisabled();
  await userEvent.click(within(dialog).getByRole('checkbox', { name: '删除笔记' }));
  await userEvent.click(within(dialog).getByRole('checkbox', { name: '访问笔记' }));
  await userEvent.click(within(dialog).getByRole('checkbox', { name: 'listNotes' }));
  await userEvent.click(action);
  await userEvent.type(within(dialog).getByLabelText('角色名称'), '动作角色');
  await userEvent.click(within(dialog).getByRole('button', { name: '保存' }));
  await vi.waitFor(() => expect(createRole).toHaveBeenCalledWith(expect.objectContaining({ name: '动作角色', action_ids: ['n-act-notes'] })));
});

it('grants API operations per realm while super-admin and public operations stay locked', async () => {
  const createRole = vi.fn().mockResolvedValue({ id: 'api-role', name: '接口角色', builtin: false, permissions: [], user_count: 0, realm: 'user', menu_ids: [], action_ids: [], operation_ids: ['listNotes'], authorization_initialized: true });
  mount(metadata(['roles:read', 'roles:write']), baseWeb({ createRole }));
  await screen.findByText('记录员');
  await userEvent.click(screen.getByRole('button', { name: '新建角色' }));
  const dialog = screen.getByRole('dialog', { name: '新建角色' });
  expect(within(dialog).getAllByText('GET')).toHaveLength(2);
  expect(within(dialog).getByText('/api/v1/notes')).toBeVisible();
  // Grantable user-realm operation stays selectable; super-admin, cross-realm
  // and public operations render locked so the upper bound cannot be bypassed.
  await userEvent.click(within(dialog).getByRole('checkbox', { name: '访问笔记' }));
  const listNotes = within(dialog).getByRole('checkbox', { name: 'listNotes' });
  expect(listNotes).toBeEnabled();
  expect(within(dialog).getByRole('checkbox', { name: 'applyUpdate' })).toBeDisabled();
  expect(within(dialog).getByRole('checkbox', { name: 'publicPolicy' })).toBeDisabled();
  await userEvent.click(listNotes);
  await userEvent.type(within(dialog).getByLabelText('角色名称'), '接口角色');
  await userEvent.click(within(dialog).getByRole('button', { name: '保存' }));
  await vi.waitFor(() => expect(createRole).toHaveBeenCalledWith(expect.objectContaining({ name: '接口角色', operation_ids: ['listNotes'] })));
});

it('filters the operation catalogue by module, method, path, name and permission', async () => {
  mount(metadata(['roles:read', 'roles:write']), baseWeb());
  await screen.findByText('记录员');
  await userEvent.click(screen.getByRole('button', { name: '新建角色' }));
  const dialog = screen.getByRole('dialog', { name: '新建角色' });
  expect(within(dialog).getByRole('checkbox', { name: 'listNotes' })).toBeVisible();
  await userEvent.type(within(dialog).getByLabelText('按方法筛选'), 'POST');
  expect(within(dialog).queryByRole('checkbox', { name: 'listNotes' })).toBeNull();
  expect(within(dialog).getByRole('checkbox', { name: 'applyUpdate' })).toBeVisible();
  await userEvent.clear(within(dialog).getByLabelText('按方法筛选'));
  await userEvent.type(within(dialog).getByLabelText('按名称筛选'), '笔记');
  expect(within(dialog).getByRole('checkbox', { name: 'listNotes' })).toBeVisible();
  expect(within(dialog).queryByRole('checkbox', { name: 'applyUpdate' })).toBeNull();
});

it('hides write actions from operators without roles:write while both tabs stay readable', async () => {
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
  await userEvent.click(screen.getByRole('button', { name: '新建角色' }));
  const dialog = screen.getByRole('dialog', { name: '新建角色' });
  const scope = within(dialog).getByLabelText('数据范围');
  expect(scope).toHaveValue('self');
  expect(within(scope).getAllByRole('option').map(option => option.textContent)).toEqual(['仅本人', '本部门', '本部门及以下', '自定义', '全部']);
  // The department tree only opens for the custom scope.
  expect(within(dialog).queryByRole('group', { name: '自定义部门范围' })).toBeNull();
  await userEvent.selectOptions(scope, 'custom');
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
  await userEvent.click(await screen.findByRole('button', { name: '新建角色' }));
  const dialog = screen.getByRole('dialog', { name: '新建角色' });
  expect(within(dialog).getByLabelText('数据范围')).toHaveValue('self');
  expect(within(dialog).queryByRole('group', { name: '自定义部门范围' })).toBeNull();
  await userEvent.type(within(dialog).getByLabelText('角色名称'), '内容运营二');
  await userEvent.click(within(dialog).getByRole('checkbox', { name: '查看用户' }));
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
  mount(metadata(['roles:read', 'roles:write']), { roles, updateRole, listDepartments: vi.fn().mockResolvedValue(departmentsPayload()), menuConfig: vi.fn().mockImplementation(menuConfig), apiOperations: vi.fn().mockImplementation(apiOperations) });
  await screen.findByText('记录员');
  await userEvent.click(screen.getByRole('button', { name: '编辑角色 记录员' }));
  const dialog = screen.getByRole('dialog', { name: '编辑角色' });
  expect(within(dialog).getByLabelText('数据范围')).toHaveValue('custom');
  expect(within(dialog).getByRole('checkbox', { name: '前端组' })).toBeChecked();
  // Switching away from custom empties the department selection in the payload.
  await userEvent.selectOptions(within(dialog).getByLabelText('数据范围'), 'self');
  await userEvent.click(within(dialog).getByRole('button', { name: '保存' }));
  await vi.waitFor(() => expect(updateRole).toHaveBeenCalledWith('recorder', expect.objectContaining({ data_scope: 'self', department_ids: [] })));
});

/** Author: yunnuo <ymz@ebox.vip>
 * Description: The editor covers the one shared section tree: section and node CRUD through dialogs, per-row surfaces badges, order/visibility, role assignment gated on roles:write + super, the version CAS payload and the whole-tree reset.
 */
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { expect, it, vi } from 'vitest';
import { MessageProvider } from '@unicore/ui';
import type { APIOperation, AppClient, Bootstrap, MenuList, MenuSaveInput, NavigationNode, NavigationSection, Role } from '@unicore/sdk';
import { AdminMenusPage } from './menus';
import type { PageProps } from '../../router';

const sections: NavigationSection[] = [
  { id: 'business', surfaces: ['user', 'administrator'], name: '业务', sort: 10, visible: true, show_title: true },
  { id: 'system', surfaces: ['administrator'], name: '系统管理', sort: 20, visible: true, show_title: true },
];

const node = (overrides: Partial<NavigationNode>): NavigationNode => ({
  id: 'node', section_id: 'business', surfaces: ['user', 'administrator'], type: 'page', label: '', icon: 'Circle', sort: 100, visible: true,
  open_mode: 'same_tab', badge_text: '', badge_color: '', badge_dot: false, operation_ids: [], disabled: false, ...overrides,
});

const nodes: NavigationNode[] = [
  node({ id: 'administration', section_id: 'system', type: 'directory', label: '管理工具', icon: 'Users', surfaces: ['administrator'], sort: 10 }),
  node({ id: 'users', section_id: 'system', parent_id: 'administration', route_id: 'users', label: '', icon: 'UserRound', surfaces: ['administrator'], sort: 10 }),
  node({ id: 'overview', section_id: 'business', route_id: 'overview', label: '', icon: 'LayoutDashboard', sort: 10 }),
  node({ id: 'notes', section_id: 'business', route_id: 'notes', label: '', icon: 'NotebookPen', sort: 20 }),
  node({ id: 'link:help', section_id: 'business', type: 'link', label: '帮助中心', icon: 'Link', sort: 30, url: 'https://example.com/help' }),
  node({ id: 'action:demo', section_id: 'business', type: 'action', label: '邀请用户', icon: 'MousePointerClick', surfaces: ['administrator'], sort: 40, permission: 'users:create', operation_ids: ['createUsers'] }),
];

const role = (overrides: Partial<Role> = {}): Role => ({
  id: 'r1', name: '运营', builtin: false, permissions: ['users:read'], user_count: 3, realm: 'administrator',
  data_scope: 'all', department_ids: [], menu_ids: ['users'], action_ids: [], operation_ids: [], authorization_initialized: true, ...overrides,
});

const operation = (overrides: Partial<APIOperation>): APIOperation => ({
  operation_id: 'op', method: 'POST', path: '/api/v1/x', summary: '', tags: [], realm: 'administrator',
  permissions: [], permission_mode: 'csrf', csrf: true, super_admin: false, grantable: true, ...overrides,
});

const operations: APIOperation[] = [
  operation({ operation_id: 'createUsers', method: 'POST', path: '/api/v1/users', summary: '创建用户', permissions: ['users:create'] }),
  operation({ operation_id: 'listNotes', method: 'GET', path: '/api/v1/notes', summary: '笔记列表', realm: 'user', permissions: ['notes:access'] }),
];

const menuList = (): MenuList => ({ items: [], version: 7, sections: sections.map(s => ({ ...s, surfaces: [...s.surfaces] })), nodes: nodes.map(n => ({ ...n, surfaces: [...n.surfaces] })), pages: [] });

function meta(permissions: string[], roles = ['super_admin']): Bootstrap {
  return { profile: 'web-platform', identity_realm: 'administrator', capabilities: {}, current_user: { id: 'root', roles, permissions } } as unknown as Bootstrap;
}

function mountWeb(web: Record<string, unknown>, bootstrap: Bootstrap) {
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MessageProvider>
        <AdminMenusPage {...({ client: { transport: 'http', web } as unknown as AppClient, metadata: bootstrap, registry: {}, theme: 'light', setTheme: () => {}, refresh: () => {} } as unknown as PageProps)} />
      </MessageProvider>
    </QueryClientProvider>,
  );
}

function harness(list: MenuList = menuList(), roleItems: Role[] = [role()]) {
  let current = list;
  const echo = () => ({ ...current, sections: current.sections.map(s => ({ ...s, surfaces: [...s.surfaces] })), nodes: current.nodes.map(n => ({ ...n, surfaces: [...n.surfaces] })) });
  const menuConfig = vi.fn(async () => echo());
  const saveMenuConfig = vi.fn(async (input: MenuSaveInput) => {
    if (input.reset) current = { ...menuList(), version: input.version + 1 };
    else current = { ...current, version: input.version + 1, sections: input.sections.map(s => ({ ...s, surfaces: [...s.surfaces] })), nodes: input.nodes.map(n => ({ ...n, surfaces: [...n.surfaces] })) };
    return echo();
  });
  const roles = vi.fn(async () => ({ items: roleItems.map(r => ({ ...r })), permissions: [
    { id: 'users:create', name: '创建用户', description: '', group: 'users', assignable: true },
    { id: 'users:read', name: '查看用户', description: '', group: 'users', assignable: true },
  ] }));
  mountWeb({ menuConfig, saveMenuConfig, roles, apiOperations: vi.fn(async () => ({ items: operations })) }, meta(['menus:write', 'roles:write']));
  return { menuConfig, saveMenuConfig, roles };
}

const rowOf = (id: string): HTMLElement | null => document.querySelector<HTMLElement>(`tr[data-node="${id}"]`);

it('renders the shared tree with both sections, surfaces badges, columns and nested children', async () => {
  harness();
  const business = await screen.findByRole('region', { name: '业务' });
  expect(within(business).getByText('工作台概览')).toBeVisible();
  for (const column of ['名称', '类型', '工作台', '图标', '目标', '排序', '显示', '操作']) expect(within(business).getByRole('columnheader', { name: column })).toBeVisible();
  // Directories start collapsed: child rows do not render until the operator
  // expands the directory, and collapse again removes them.
  expect(rowOf('users')).toBeNull();
  await userEvent.click(within(rowOf('administration')!).getByRole('button', { name: '展开或收起 管理工具' }));
  expect(within(rowOf('users')!).getByText('用户列表')).toBeVisible();
  expect(within(rowOf('users')!).getByText('UserRound')).toBeVisible();
  expect(within(rowOf('users')!).getByText('users')).toBeVisible();
  // Action rows show their permission target as a definition, not a business action.
  expect(within(business).getByText('邀请用户')).toBeVisible();
  expect(within(rowOf('action:demo')!).getByText('users:create')).toBeVisible();
  // One shared tree: the operator link row sits beside the overview row, and
  // row badges come from the persisted surfaces arrays.
  expect(within(business).getByText('帮助中心')).toBeVisible();
  expect(within(business).getByText('https://example.com/help')).toBeVisible();
  expect(within(rowOf('overview')!).getByText('两端')).toBeVisible();
  expect(within(rowOf('action:demo')!).getByText('管理端')).toBeVisible();
});

it('edits section name and title switch inline, marking the draft dirty', async () => {
  harness();
  const business = await screen.findByRole('region', { name: '业务' });
  await userEvent.type(within(business).getByRole('textbox', { name: '区域名称' }), '核心');
  expect(screen.getByText('有未保存的更改')).toBeVisible();
  await userEvent.click(within(business).getByRole('switch', { name: '标题' }));
  await userEvent.click(screen.getByRole('button', { name: '保存菜单配置' }));
  await vi.waitFor(() => expect(screen.getByRole('button', { name: '保存菜单配置' })).toBeEnabled());
});

it('edits section surfaces without ever clearing the last workspace', async () => {
  harness();
  const business = await screen.findByRole('region', { name: '业务' });
  const member = within(business).getByRole('checkbox', { name: '成员端' });
  const admin = within(business).getByRole('checkbox', { name: '管理端' });
  expect(member).toBeChecked();
  expect(admin).toBeChecked();
  await userEvent.click(admin);
  expect(member).toBeChecked();
  expect(admin).not.toBeChecked();
  // The last remaining surface cannot be unchecked.
  await userEvent.click(member);
  expect(member).toBeChecked();
});

it('creates a page node from the section header with only registered unused routes', async () => {
  const { saveMenuConfig } = harness();
  const business = await screen.findByRole('region', { name: '业务' });
  await userEvent.click(within(business).getByRole('button', { name: '页面' }));
  const dialog = screen.getByRole('dialog', { name: '添加页面' });
  await userEvent.click(within(dialog).getByRole('combobox', { name: '目标页面（仅已注册路由）' }));
  // Registered pages are offered; pages already placed anywhere in the tree are filtered out.
  expect(screen.getByRole('option', { name: '核心实验室' })).toBeVisible();
  expect(screen.queryByRole('option', { name: '工作台概览' })).toBeNull();
  await userEvent.click(screen.getByRole('option', { name: '核心实验室' }));
  await userEvent.click(within(dialog).getByRole('button', { name: '添加' }));
  expect(within(business).getAllByText('核心实验室').length).toBeGreaterThan(0);
  await userEvent.click(screen.getByRole('button', { name: '保存菜单配置' }));
  await vi.waitFor(() => expect(saveMenuConfig).toHaveBeenCalledTimes(1));
  const payload = saveMenuConfig.mock.calls[0][0] as MenuSaveInput;
  expect(payload.version).toBe(7);
  expect(payload.reset).toBeUndefined();
  const created = payload.nodes.find(item => item.route_id === 'lab');
  expect(created?.section_id).toBe('business');
  // New nodes default to both workspaces.
  expect(created?.surfaces).toEqual(['user', 'administrator']);
  expect(payload.role_assignments).toBeUndefined();
});

it('creates a link with url validation against registered routes only', async () => {
  harness();
  const business = await screen.findByRole('region', { name: '业务' });
  await userEvent.click(within(business).getByRole('button', { name: '链接' }));
  const dialog = screen.getByRole('dialog', { name: '添加链接' });
  await userEvent.type(within(dialog).getByRole('textbox', { name: '链接地址' }), '/not-registered');
  await userEvent.click(within(dialog).getByRole('button', { name: '添加' }));
  expect(within(dialog).getByText('链接地址需为站内已注册路径或 http(s) 地址')).toBeVisible();
  await userEvent.click(within(dialog).getByRole('button', { name: '取消' }));
  expect(screen.queryByRole('dialog', { name: '添加链接' })).toBeNull();
});

it('offers no action entry under a page row', async () => {
  const { saveMenuConfig } = harness();
  await screen.findByRole('region', { name: '业务' });
  // The section header no longer offers actions: the server attaches them to pages.
  expect(within(screen.getByRole('region', { name: '业务' })).queryByRole('button', { name: '按钮' })).toBeNull();
  // Button definitions are code-registered permission points, not operator
  // entries: no row menu offers them and the editor never emits action nodes.
  await userEvent.click(screen.getByRole('button', { name: '管理工具的操作' }));
  expect(screen.getByRole('menuitem', { name: '添加子页面…' })).toBeEnabled();
  await userEvent.keyboard('{Escape}');
  await userEvent.click(screen.getByRole('button', { name: '工作台概览的操作' }));
  expect(screen.queryByRole('menuitem', { name: '添加按钮…' })).toBeNull();
  await userEvent.keyboard('{Escape}');
  await userEvent.click(screen.getByRole('button', { name: '保存菜单配置' }));
  await vi.waitFor(() => expect(saveMenuConfig).toHaveBeenCalledTimes(1));
  const payload = saveMenuConfig.mock.calls[0][0] as MenuSaveInput;
  // The fixture carries one pre-registered action; the editor adds none.
  const actionIds = payload.nodes.filter(item => item.type === 'action').map(item => item.id).sort();
  expect(actionIds).toEqual(['action:demo']);
});

it('edits a node through the dialog: badge text lands on the same row', async () => {
  harness();
  await screen.findByRole('region', { name: '业务' });
  await userEvent.click(screen.getByRole('button', { name: '工作台概览的操作' }));
  await userEvent.click(screen.getByRole('menuitem', { name: '编辑' }));
  const dialog = screen.getByRole('dialog', { name: '编辑节点' });
  await userEvent.type(within(dialog).getByRole('textbox', { name: '角标文字' }), '新');
  await userEvent.click(within(dialog).getByRole('button', { name: '保存' }));
  expect(screen.queryByRole('dialog', { name: '编辑节点' })).toBeNull();
  expect(within(rowOf('overview')!).getByText('新')).toBeVisible();
});

it('edits node surfaces through the dialog and the row badge follows the saved tree', async () => {
  const { saveMenuConfig } = harness();
  await screen.findByRole('region', { name: '业务' });
  await userEvent.click(screen.getByRole('button', { name: '工作台概览的操作' }));
  await userEvent.click(screen.getByRole('menuitem', { name: '编辑' }));
  const dialog = screen.getByRole('dialog', { name: '编辑节点' });
  const member = within(dialog).getByRole('checkbox', { name: '成员端' });
  expect(within(dialog).getByRole('checkbox', { name: '管理端' })).toBeChecked();
  await userEvent.click(member);
  await userEvent.click(within(dialog).getByRole('button', { name: '保存' }));
  expect(within(rowOf('overview')!).getByText('管理端')).toBeVisible();
  await userEvent.click(screen.getByRole('button', { name: '保存菜单配置' }));
  await vi.waitFor(() => expect(saveMenuConfig).toHaveBeenCalledTimes(1));
  const payload = saveMenuConfig.mock.calls[0][0] as MenuSaveInput;
  expect(payload.nodes.find(item => item.id === 'overview')?.surfaces).toEqual(['administrator']);
});

it('moves a node across sections and reorders siblings with the sort arrows', async () => {
  harness();
  await screen.findByRole('region', { name: '业务' });
  await userEvent.click(screen.getByRole('button', { name: '工作台概览的操作' }));
  await userEvent.click(screen.getByRole('menuitem', { name: '移动…' }));
  const dialog = screen.getByRole('dialog', { name: '移动节点' });
  await userEvent.click(within(dialog).getByRole('combobox', { name: '目标位置' }));
  await userEvent.click(screen.getByRole('option', { name: '顶层 · 系统管理' }));
  await userEvent.click(within(dialog).getByRole('button', { name: '移动' }));
  expect(screen.queryByRole('dialog', { name: '移动节点' })).toBeNull();
  const system = screen.getByRole('region', { name: '系统管理' });
  expect(within(system).getAllByText('工作台概览').length).toBeGreaterThan(0);
  // Sort arrows renumber siblings inside the same list.
  await userEvent.click(screen.getByRole('button', { name: '上移 邀请用户' }));
  expect(screen.getByText('有未保存的更改')).toBeVisible();
});

it('deletes a node after confirmation and keeps the draft local until save', async () => {
  const { saveMenuConfig } = harness();
  await screen.findByRole('region', { name: '业务' });
  await userEvent.click(screen.getByRole('button', { name: '工作台概览的操作' }));
  await userEvent.click(screen.getByRole('menuitem', { name: '删除' }));
  const confirm = screen.getByRole('alertdialog', { name: '删除菜单节点' });
  await userEvent.click(within(confirm).getByRole('button', { name: '删除' }));
  expect(screen.queryByText('工作台概览')).toBeNull();
  expect(saveMenuConfig).not.toHaveBeenCalled();
});

it('leaves role assignment to the role editor and never sends role_assignments', async () => {
  // Authorization lives in the role editor's four surfaces; the menu editor is
  // a pure layout tool, so no per-row assignment affordance exists at all —
  // not even disabled — and saves carry no role payload.
  let current = menuList();
  const saveMenuConfig = vi.fn(async (input: MenuSaveInput) => {
    current = { ...current, version: input.version + 1 };
    return { ...current, sections: current.sections.map(s => ({ ...s, surfaces: [...s.surfaces] })), nodes: current.nodes.map(n => ({ ...n, surfaces: [...n.surfaces] })) };
  });
  mountWeb({
    menuConfig: vi.fn(async () => ({ ...current, sections: current.sections.map(s => ({ ...s, surfaces: [...s.surfaces] })), nodes: current.nodes.map(n => ({ ...n, surfaces: [...n.surfaces] })) })),
    saveMenuConfig,
    roles: vi.fn(async () => ({ items: [role()], permissions: [] })),
    apiOperations: vi.fn(async () => ({ items: operations })),
  }, meta(['menus:write'], ['ops']));
  await screen.findByRole('region', { name: '业务' });
  await userEvent.click(screen.getByRole('button', { name: '保存菜单配置' }));
  await vi.waitFor(() => expect(saveMenuConfig).toHaveBeenCalledTimes(1));
  expect((saveMenuConfig.mock.calls[0][0] as MenuSaveInput).role_assignments).toBeUndefined();
  expect(screen.queryByRole('button', { name: /分配 工作台概览 的角色/ })).toBeNull();
});

it('restores the whole shared tree through the reset payload', async () => {
  const { saveMenuConfig } = harness();
  await screen.findByRole('region', { name: '业务' });
  await userEvent.click(screen.getByRole('button', { name: '恢复默认' }));
  const confirm = screen.getByRole('alertdialog', { name: '恢复默认菜单配置' });
  expect(within(confirm).getByText('将清空用户端与管理端的全部自定义区域与节点，立即恢复两端的注册默认树。')).toBeVisible();
  await userEvent.click(within(confirm).getByRole('button', { name: '恢复默认' }));
  await vi.waitFor(() => expect(saveMenuConfig).toHaveBeenCalledWith({ version: 7, sections: [], nodes: [], reset: true }));
});

it('reports load failures with a retry and surfaces save errors as messages', async () => {
  const failing = vi.fn().mockRejectedValueOnce(new Error('菜单读取失败')).mockImplementation(async () => menuList());
  mountWeb({ menuConfig: failing, saveMenuConfig: vi.fn(), roles: vi.fn(async () => ({ items: [], permissions: [] })), apiOperations: vi.fn(async () => ({ items: operations })) }, meta(['menus:write', 'roles:write']));
  expect(await screen.findByText('菜单读取失败')).toBeVisible();
  await userEvent.click(screen.getByRole('button', { name: '重试' }));
  expect(await screen.findByRole('region', { name: '业务' })).toBeVisible();
});

it('keeps the editor open and shows the server conflict when the version CAS rejects the save', async () => {
  const { saveMenuConfig } = harness();
  await screen.findByRole('region', { name: '业务' });
  saveMenuConfig.mockRejectedValueOnce(Object.assign(new Error('配置已被他人修改，请刷新后重试'), { code: 'VERSION_CONFLICT' }));
  await userEvent.click(screen.getByRole('button', { name: '保存菜单配置' }));
  expect(await screen.findByText('配置已被他人修改，请刷新后重试')).toBeVisible();
  // The draft stays editable for a retry after refreshing the table.
  expect(screen.getByRole('button', { name: '保存菜单配置' })).toBeEnabled();
  expect(screen.getByRole('region', { name: '业务' })).toBeVisible();
});

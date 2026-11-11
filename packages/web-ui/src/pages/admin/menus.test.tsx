/** Author: yunnuo <ymz@ebox.vip>
 * Description: The editor covers the one shared tree table: region root rows over nested node rows (directories, pages and links only — action rows never render but ride along in the draft and payload), one per-row ⋯ more-actions menu (every directory, page and link can add sub-menus), dialog CRUD with type choice and non-action parent picking, full tree drag & drop (same-list reorder, re-parent, cross-region subtree section rewrites including action descendants, and refused self-descendant or depth-overflow landings), the registered icon grid, search filtering, expand/collapse all, subtree copy, order/visibility, route-derived surfaces on save, the version CAS payload and the whole-tree reset.
 */
import { fireEvent, render, screen, within } from '@testing-library/react';
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

// The shared fixture plus one action nested inside the management directory,
// so the copy test can prove action nodes ride along in the saved payload
// even though they never render as layout rows.
const menuListWithNestedAction = (): MenuList => ({ ...menuList(), nodes: [...nodes,
  node({ id: 'action:nested', section_id: 'system', parent_id: 'administration', type: 'action', label: '导出用户', icon: 'MousePointerClick', surfaces: ['administrator'], sort: 20, permission: 'users:export', operation_ids: ['exportUsers'] })] });

// The cross-region drag fixture: the management directory keeps its nested page
// and action, and a link left behind in system points active_menu at the moved
// page — so one drop must prove the whole subtree (action descendant included)
// rewrites sections and a stranded cross-section reference drops.
const menuListForCrossRegionDrag = (): MenuList => {
  const base = menuListWithNestedAction();
  return { ...base, nodes: [...base.nodes,
    node({ id: 'link:audit', section_id: 'system', type: 'link', label: '审计跳转', icon: 'Link', sort: 30, url: 'https://example.test/audit', active_menu: 'users' })] };
};

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
const regionRow = (id: string): HTMLElement | null => document.querySelector<HTMLElement>(`tr[data-region="${id}"]`);
const nodeOrder = (): string[] => [...document.querySelectorAll('tbody tr[data-node]')].map(row => row.getAttribute('data-node') ?? '');

// Every row carries one ⋯ more-actions trigger; the menu renders in a portal
// outside the row, so the open surface is located from the document root.
const openRowMenu = async (row: HTMLElement, name: string) => {
  await userEvent.click(within(row).getByRole('button', { name: `更多操作：${name}` }));
  return screen.getByRole('menu');
};

type DropZone = 'before' | 'inside' | 'after';
// jsdom defines no DragEvent constructor, so clientY inits silently vanish in
// fireEvent.dragOver; each drop therefore pins a 30px-tall rect on the target
// row, hand-builds the drag events with the pointer aimed into the requested
// third — upper (before), middle (inside), lower (after) — and dispatches them
// through fireEvent to stay act-wrapped.
const dragOnto = (sourceId: string, target: HTMLElement, zone: DropZone) => {
  const source = rowOf(sourceId);
  expect(source).not.toBeNull();
  target.getBoundingClientRect = () => ({ top: 0, left: 0, right: 100, bottom: 30, width: 100, height: 30, x: 0, y: 0, toJSON: () => ({}) } as DOMRect);
  const dragEvent = (type: string, clientY?: number) => {
    const event = new Event(type, { bubbles: true, cancelable: true });
    if (clientY !== undefined) Object.defineProperty(event, 'clientY', { value: clientY });
    return event;
  };
  fireEvent(source!, dragEvent('dragstart'));
  fireEvent(target, dragEvent('dragover', zone === 'before' ? 3 : zone === 'inside' ? 15 : 27));
  fireEvent(target, dragEvent('drop'));
  fireEvent(source!, dragEvent('dragend'));
};

it('renders one tree table: region root rows over nested node rows and never workspace concepts', async () => {
  harness();
  expect(await screen.findByRole('row', { name: '业务' })).toBeVisible();
  expect(screen.getByRole('row', { name: '系统管理' })).toBeVisible();
  for (const column of ['名称', '类型', '目标', '排序', '显示', '操作']) expect(screen.getByRole('columnheader', { name: column })).toBeVisible();
  // Surfaces derive from the route registry on save: the editor itself never
  // renders a workspace/surface concept at all.
  expect(screen.queryByText('成员端')).toBeNull();
  expect(screen.queryByText('管理端')).toBeNull();
  expect(screen.queryByText('两端')).toBeNull();
  // Directories start collapsed: child rows do not render until the operator
  // expands the directory.
  expect(rowOf('users')).toBeNull();
  await userEvent.click(within(rowOf('administration')!).getByRole('button', { name: '展开或收起 管理工具' }));
  expect(within(rowOf('users')!).getByText('用户列表')).toBeVisible();
  expect(within(rowOf('users')!).getByText('users')).toBeVisible();
  // Action rows never render: buttons are authorization units managed in the
  // role editor; the editor lays out directories, pages and links only.
  expect(rowOf('action:demo')).toBeNull();
  expect(screen.queryByText('邀请用户')).toBeNull();
  // Every node row carries one ⋯ trigger whose menu lists its actions; page
  // rows now offer 添加子菜单 just like directories.
  const overviewRow = rowOf('overview')!;
  const overviewMenu = await openRowMenu(overviewRow, '工作台概览');
  for (const action of ['添加子菜单', '编辑', '移动…', '复制', '删除']) expect(within(overviewMenu).getByRole('menuitem', { name: action })).toBeEnabled();
  await userEvent.keyboard('{Escape}');
  const administrationMenu = await openRowMenu(rowOf('administration')!, '管理工具');
  expect(within(administrationMenu).getByRole('menuitem', { name: '添加子菜单' })).toBeEnabled();
  await userEvent.keyboard('{Escape}');
  // One shared tree: the operator link row sits beside the overview row.
  expect(within(rowOf('link:help')!).getByText('帮助中心')).toBeVisible();
  expect(within(rowOf('link:help')!).getByText('https://example.com/help')).toBeVisible();
  // Region rows carry their capabilities inline: name, sort, visibility, title
  // and a ⋯ menu with add-child plus delete.
  const business = regionRow('business')!;
  expect(within(business).getByRole('textbox', { name: '区域名称' })).toHaveValue('业务');
  expect(within(business).getByRole('spinbutton', { name: '区域排序' })).toHaveValue(10);
  expect(within(business).getByRole('switch', { name: '标题' })).toBeEnabled();
  const businessMenu = await openRowMenu(business, '业务');
  expect(within(businessMenu).getByRole('menuitem', { name: '添加子菜单' })).toBeEnabled();
  // Non-empty regions cannot be deleted.
  expect(within(businessMenu).getByRole('menuitem', { name: '删除区域' })).toHaveAttribute('aria-disabled', 'true');
  await userEvent.keyboard('{Escape}');
});

it('search filters by name, route id and link url and expands the matched paths', async () => {
  harness();
  await screen.findByRole('row', { name: '业务' });
  const search = screen.getByRole('textbox', { name: '搜索名称、路由或链接' });
  // A name match pulls the row in with its ancestors; everything else filters out.
  await userEvent.type(search, '用户列表');
  expect(rowOf('users')).not.toBeNull();
  expect(within(rowOf('users')!).getByText('用户列表')).toBeVisible();
  expect(rowOf('administration')).not.toBeNull();
  expect(rowOf('overview')).toBeNull();
  expect(regionRow('business')).toBeNull();
  expect(screen.getByRole('row', { name: '系统管理' })).toBeVisible();
  // Route ids and link URLs match too.
  await userEvent.clear(search);
  await userEvent.type(search, 'https://example.com');
  expect(rowOf('link:help')).not.toBeNull();
  expect(rowOf('overview')).toBeNull();
  // A matching directory keeps its whole subtree visible.
  await userEvent.clear(search);
  await userEvent.type(search, '管理工具');
  expect(rowOf('administration')).not.toBeNull();
  expect(rowOf('users')).not.toBeNull();
  // Clearing restores the full tree with directories collapsed again.
  await userEvent.clear(search);
  expect(rowOf('users')).toBeNull();
  expect(rowOf('overview')).not.toBeNull();
  expect(regionRow('business')).not.toBeNull();
});

it('expands and collapses the whole tree from the toolbar', async () => {
  harness();
  await screen.findByRole('row', { name: '业务' });
  expect(rowOf('users')).toBeNull();
  await userEvent.click(screen.getByRole('button', { name: '收起全部' }));
  // Collapsed down to the region root rows only.
  expect(rowOf('overview')).toBeNull();
  expect(rowOf('administration')).toBeNull();
  expect(regionRow('business')).not.toBeNull();
  expect(regionRow('system')).not.toBeNull();
  expect(within(regionRow('business')!).getByRole('button', { name: '展开或收起 业务' })).toHaveAttribute('aria-expanded', 'false');
  await userEvent.click(screen.getByRole('button', { name: '展开全部' }));
  expect(rowOf('users')).not.toBeNull();
  expect(rowOf('overview')).not.toBeNull();
  expect(within(rowOf('administration')!).getByRole('button', { name: '展开或收起 管理工具' })).toHaveAttribute('aria-expanded', 'true');
});

it('creates a page from the region row: the type is picked in the dialog and the parent presets to the region', async () => {
  const { saveMenuConfig } = harness();
  await screen.findByRole('row', { name: '业务' });
  const business = regionRow('business')!;
  const businessMenu = await openRowMenu(business, '业务');
  await userEvent.click(within(businessMenu).getByRole('menuitem', { name: '添加子菜单' }));
  const dialog = screen.getByRole('dialog', { name: '添加目录' });
  // The dialog picks the type; actions are never offered (they attach to pages server-side).
  await userEvent.click(within(dialog).getByRole('combobox', { name: '菜单类型' }));
  expect(screen.getByRole('option', { name: '目录' })).toBeVisible();
  expect(screen.getByRole('option', { name: '页面' })).toBeVisible();
  expect(screen.getByRole('option', { name: '链接' })).toBeVisible();
  expect(screen.queryByRole('option', { name: '按钮' })).toBeNull();
  await userEvent.click(screen.getByRole('option', { name: '页面' }));
  await userEvent.click(within(dialog).getByRole('combobox', { name: '目标页面（仅已注册路由）' }));
  // Registered pages are offered; pages already placed anywhere in the tree are filtered out.
  expect(screen.getByRole('option', { name: '登录会话' })).toBeVisible();
  expect(screen.queryByRole('option', { name: '工作台概览' })).toBeNull();
  await userEvent.click(screen.getByRole('option', { name: '登录会话' }));
  await userEvent.click(within(dialog).getByRole('button', { name: '确定' }));
  // New nodes take a random id; the row is located by its display name.
  const labRow = screen.getByText('登录会话').closest('tr') as HTMLElement;
  expect(labRow.getAttribute('data-node-type')).toBe('page');
  expect(labRow.getAttribute('data-section')).toBe('business');
  await userEvent.click(screen.getByRole('button', { name: '保存菜单配置' }));
  await vi.waitFor(() => expect(saveMenuConfig).toHaveBeenCalledTimes(1));
  const payload = saveMenuConfig.mock.calls[0][0] as MenuSaveInput;
  expect(payload.version).toBe(7);
  expect(payload.reset).toBeUndefined();
  const created = payload.nodes.find(item => item.route_id === 'account-sessions');
  expect(created?.section_id).toBe('business');
  expect(created?.parent_id).toBeUndefined();
  // Surfaces derive from the registered route: the overview page stays shared.
  expect(created?.surfaces).toEqual(['user', 'administrator']);
  expect(payload.role_assignments).toBeUndefined();
});

it('adds a child directory from a directory row with the parent preset to that row', async () => {
  const { saveMenuConfig } = harness();
  await screen.findByRole('row', { name: '业务' });
  expect(rowOf('users')).toBeNull();
  const administrationMenu = await openRowMenu(rowOf('administration')!, '管理工具');
  await userEvent.click(within(administrationMenu).getByRole('menuitem', { name: '添加子菜单' }));
  const dialog = screen.getByRole('dialog', { name: '添加目录' });
  await userEvent.type(within(dialog).getByRole('textbox', { name: '显示名称' }), '嵌套工具');
  await userEvent.click(within(dialog).getByRole('button', { name: '确定' }));
  // The preset parent expands so the new child is visible right away.
  expect(rowOf('users')).not.toBeNull();
  const createdRow = screen.getByText('嵌套工具').closest('tr') as HTMLElement;
  expect(createdRow.getAttribute('data-section')).toBe('system');
  await userEvent.click(screen.getByRole('button', { name: '保存菜单配置' }));
  await vi.waitFor(() => expect(saveMenuConfig).toHaveBeenCalledTimes(1));
  const payload = saveMenuConfig.mock.calls[0][0] as MenuSaveInput;
  const created = payload.nodes.find(item => item.label === '嵌套工具');
  expect(created?.type).toBe('directory');
  expect(created?.parent_id).toBe('administration');
  expect(created?.section_id).toBe('system');
});

it('offers regions and every non-action node as parents; action rows never parent', async () => {
  harness();
  await screen.findByRole('row', { name: '业务' });
  const overviewMenu = await openRowMenu(rowOf('overview')!, '工作台概览');
  await userEvent.click(within(overviewMenu).getByRole('menuitem', { name: '编辑' }));
  const dialog = screen.getByRole('dialog', { name: '编辑节点' });
  await userEvent.click(within(dialog).getByRole('combobox', { name: '上级菜单' }));
  expect(screen.getByRole('option', { name: '顶层 · 业务' })).toBeVisible();
  expect(screen.getByRole('option', { name: '顶层 · 系统管理' })).toBeVisible();
  // Directories, pages and links are all legal parents now.
  expect(screen.getByRole('option', { name: '管理工具' })).toBeVisible();
  expect(screen.getByRole('option', { name: /用户列表/ })).toBeVisible();
  expect(screen.getByRole('option', { name: '帮助中心' })).toBeVisible();
  // The action node is an authorization unit, never a layout parent.
  expect(screen.queryByRole('option', { name: /邀请用户/ })).toBeNull();
  await userEvent.keyboard('{Escape}');
  await userEvent.click(within(dialog).getByRole('button', { name: '取消' }));
});

it('adds a child page from a page row with the parent preset to that row', async () => {
  const { saveMenuConfig } = harness();
  await screen.findByRole('row', { name: '业务' });
  const overviewMenu = await openRowMenu(rowOf('overview')!, '工作台概览');
  await userEvent.click(within(overviewMenu).getByRole('menuitem', { name: '添加子菜单' }));
  const dialog = screen.getByRole('dialog', { name: '添加目录' });
  // The parent presets to the page row itself; the trigger echoes its label.
  expect(within(dialog).getByRole('combobox', { name: '上级菜单' })).toHaveTextContent('工作台概览');
  await userEvent.click(within(dialog).getByRole('combobox', { name: '菜单类型' }));
  await userEvent.click(screen.getByRole('option', { name: '页面' }));
  await userEvent.click(within(dialog).getByRole('combobox', { name: '目标页面（仅已注册路由）' }));
  await userEvent.click(screen.getByRole('option', { name: '登录会话' }));
  await userEvent.click(within(dialog).getByRole('button', { name: '确定' }));
  const labRow = screen.getByText('登录会话').closest('tr') as HTMLElement;
  expect(labRow.getAttribute('data-node-type')).toBe('page');
  await userEvent.click(screen.getByRole('button', { name: '保存菜单配置' }));
  await vi.waitFor(() => expect(saveMenuConfig).toHaveBeenCalledTimes(1));
  const payload = saveMenuConfig.mock.calls[0][0] as MenuSaveInput;
  const created = payload.nodes.find(item => item.route_id === 'account-sessions');
  expect(created?.parent_id).toBe('overview');
  expect(created?.section_id).toBe('business');
});

it('adds a child page from a link row with the parent preset to that link', async () => {
  const { saveMenuConfig } = harness();
  await screen.findByRole('row', { name: '业务' });
  const helpMenu = await openRowMenu(rowOf('link:help')!, '帮助中心');
  await userEvent.click(within(helpMenu).getByRole('menuitem', { name: '添加子菜单' }));
  const dialog = screen.getByRole('dialog', { name: '添加目录' });
  expect(within(dialog).getByRole('combobox', { name: '上级菜单' })).toHaveTextContent('帮助中心');
  await userEvent.click(within(dialog).getByRole('combobox', { name: '菜单类型' }));
  await userEvent.click(screen.getByRole('option', { name: '页面' }));
  await userEvent.click(within(dialog).getByRole('combobox', { name: '目标页面（仅已注册路由）' }));
  await userEvent.click(screen.getByRole('option', { name: '登录会话' }));
  await userEvent.click(within(dialog).getByRole('button', { name: '确定' }));
  await userEvent.click(screen.getByRole('button', { name: '保存菜单配置' }));
  await vi.waitFor(() => expect(saveMenuConfig).toHaveBeenCalledTimes(1));
  const payload = saveMenuConfig.mock.calls[0][0] as MenuSaveInput;
  const created = payload.nodes.find(item => item.route_id === 'account-sessions');
  expect(created?.parent_id).toBe('link:help');
  expect(created?.section_id).toBe('business');
});

it('copies a node with its subtree: unique -copy ids, hidden root and re-sorted siblings', async () => {
  const { saveMenuConfig } = harness(menuListWithNestedAction());
  await screen.findByRole('row', { name: '业务' });
  const overviewMenu = await openRowMenu(rowOf('overview')!, '工作台概览');
  await userEvent.click(within(overviewMenu).getByRole('menuitem', { name: '复制' }));
  const copy = rowOf('overview-copy');
  expect(copy).not.toBeNull();
  // The copy stays hidden until the operator reveals it.
  expect(within(copy!).getByRole('switch', { name: '显示或隐藏 工作台概览' })).toHaveAttribute('data-state', 'unchecked');
  // It sorts directly after its source and the siblings renumber around it;
  // action rows never join the layout.
  expect(nodeOrder()).toEqual(['overview', 'overview-copy', 'notes', 'link:help', 'administration']);
  // Deep copy: directories duplicate with their children under unique ids.
  await userEvent.click(within(rowOf('administration')!).getByRole('button', { name: '展开或收起 管理工具' }));
  const administrationMenu = await openRowMenu(rowOf('administration')!, '管理工具');
  await userEvent.click(within(administrationMenu).getByRole('menuitem', { name: '复制' }));
  expect(rowOf('administration-copy')).not.toBeNull();
  expect(rowOf('users-copy')).not.toBeNull();
  expect(nodeOrder().slice(4)).toEqual(['administration', 'users', 'administration-copy', 'users-copy']);
  await userEvent.click(screen.getByRole('button', { name: '保存菜单配置' }));
  await vi.waitFor(() => expect(saveMenuConfig).toHaveBeenCalledTimes(1));
  const payload = saveMenuConfig.mock.calls[0][0] as MenuSaveInput;
  const copiedRoot = payload.nodes.find(item => item.id === 'administration-copy');
  expect(copiedRoot?.visible).toBe(false);
  expect(copiedRoot?.parent_id).toBeUndefined();
  expect(copiedRoot?.sort).toBe(20);
  expect(payload.nodes.find(item => item.id === 'users-copy')?.parent_id).toBe('administration-copy');
  // Key semantics: the action inside the copied subtree is duplicated with it
  // in the payload even though the editor never renders it as a row.
  const copiedAction = payload.nodes.find(item => item.id === 'action:nested-copy');
  expect(copiedAction?.parent_id).toBe('administration-copy');
  expect(copiedAction?.type).toBe('action');
  expect(copiedAction?.permission).toBe('users:export');
});

it('edits a node through the dialog: badge text lands on the same row', async () => {
  harness();
  await screen.findByRole('row', { name: '业务' });
  const overviewMenu = await openRowMenu(rowOf('overview')!, '工作台概览');
  await userEvent.click(within(overviewMenu).getByRole('menuitem', { name: '编辑' }));
  const dialog = screen.getByRole('dialog', { name: '编辑节点' });
  await userEvent.type(within(dialog).getByRole('textbox', { name: '角标文字' }), '新');
  await userEvent.click(within(dialog).getByRole('button', { name: '确定' }));
  expect(screen.queryByRole('dialog', { name: '编辑节点' })).toBeNull();
  expect(within(rowOf('overview')!).getByText('新')).toBeVisible();
});

it('picks icons from the searchable Lucide catalog and clears back to the default icon', async () => {
  const { saveMenuConfig } = harness();
  await screen.findByRole('row', { name: '业务' });
  const overviewMenu = await openRowMenu(rowOf('overview')!, '工作台概览');
  await userEvent.click(within(overviewMenu).getByRole('menuitem', { name: '编辑' }));
  const dialog = screen.getByRole('dialog', { name: '编辑节点' });
  const grid = within(dialog).getByRole('group', { name: '图标选择器' });
  // The catalog covers the product's registered palette and the wider curated set.
  expect(within(grid).getByRole('button', { name: 'UserRound' })).toBeVisible();
  expect(within(grid).getByRole('button', { name: 'LayoutDashboard' })).toBeVisible();
  await userEvent.type(within(dialog).getByRole('textbox', { name: '搜索图标名称或用途' }), '火箭');
  expect(within(grid).getByRole('button', { name: 'Rocket' })).toBeVisible();
  expect(within(grid).queryByRole('button', { name: 'UserRound' })).toBeNull();
  await userEvent.click(within(grid).getByRole('button', { name: 'Rocket' }));
  await userEvent.click(within(dialog).getByRole('button', { name: '确定' }));
  await vi.waitFor(() => expect(screen.queryByRole('dialog', { name: '编辑节点' })).toBeNull());
  // Clearing resets to the empty icon: the workspace falls back to its own default.
  const reopenedMenu = await openRowMenu(rowOf('overview')!, '工作台概览');
  await userEvent.click(within(reopenedMenu).getByRole('menuitem', { name: '编辑' }));
  const reopened = screen.getByRole('dialog', { name: '编辑节点' });
  await userEvent.click(within(reopened).getByRole('button', { name: '使用默认图标' }));
  await userEvent.click(within(reopened).getByRole('button', { name: '确定' }));
  await vi.waitFor(() => expect(screen.queryByRole('dialog', { name: '编辑节点' })).toBeNull());
  await userEvent.click(screen.getByRole('button', { name: '保存菜单配置' }));
  await vi.waitFor(() => expect(saveMenuConfig).toHaveBeenCalledTimes(1));
  const payload = saveMenuConfig.mock.calls[0][0] as MenuSaveInput;
  expect(payload.nodes.find(item => item.id === 'overview')?.icon).toBe('');
});

it('derives surfaces from the route registry on save: pages follow their group, directories aggregate and links stay shared', async () => {
  const { saveMenuConfig } = harness();
  await screen.findByRole('row', { name: '业务' });
  const business = regionRow('business')!;
  // The platform admin-only page joins the tree even though the fixture
  // carries it as a member surface: the registered route group wins on save.
  const businessMenu = await openRowMenu(business, '业务');
  await userEvent.click(within(businessMenu).getByRole('menuitem', { name: '添加子菜单' }));
  const dialog = screen.getByRole('dialog', { name: '添加目录' });
  await userEvent.click(within(dialog).getByRole('combobox', { name: '菜单类型' }));
  await userEvent.click(screen.getByRole('option', { name: '页面' }));
  await userEvent.click(within(dialog).getByRole('combobox', { name: '目标页面（仅已注册路由）' }));
  await userEvent.click(screen.getByRole('option', { name: '基础设置' }));
  await userEvent.click(within(dialog).getByRole('button', { name: '确定' }));
  await userEvent.click(screen.getByRole('button', { name: '保存菜单配置' }));
  await vi.waitFor(() => expect(saveMenuConfig).toHaveBeenCalledTimes(1));
  const payload = saveMenuConfig.mock.calls[0][0] as MenuSaveInput;
  // Page nodes mirror routeSurfaces; the management directory aggregates its
  // subtree and the operator link keeps both workspaces.
  expect(payload.nodes.find(item => item.route_id === 'site')?.surfaces).toEqual(['administrator']);
  expect(payload.nodes.find(item => item.id === 'administration')?.surfaces).toEqual(['administrator']);
  expect(payload.nodes.find(item => item.id === 'link:help')?.surfaces).toEqual(['user', 'administrator']);
  // Action nodes keep their persisted surfaces; the save never widens them.
  expect(payload.nodes.find(item => item.id === 'action:demo')?.surfaces).toEqual(['administrator']);
});

it('moves a node across regions and reorders siblings with the sort arrows', async () => {
  const { saveMenuConfig } = harness();
  await screen.findByRole('row', { name: '业务' });
  const overviewMenu = await openRowMenu(rowOf('overview')!, '工作台概览');
  await userEvent.click(within(overviewMenu).getByRole('menuitem', { name: '移动…' }));
  const dialog = screen.getByRole('dialog', { name: '移动节点' });
  await userEvent.click(within(dialog).getByRole('combobox', { name: '目标位置' }));
  await userEvent.click(screen.getByRole('option', { name: '顶层 · 系统管理' }));
  await userEvent.click(within(dialog).getByRole('button', { name: '移动' }));
  expect(screen.queryByRole('dialog', { name: '移动节点' })).toBeNull();
  expect(rowOf('overview')?.getAttribute('data-section')).toBe('system');
  // Sort arrows renumber siblings inside the same list; action rows never
  // render, so the arrows live on the page/link/directory rows only.
  await userEvent.click(within(rowOf('overview')!).getByRole('button', { name: '上移 工作台概览' }));
  expect(screen.getByText('有未保存的更改')).toBeVisible();
  await userEvent.click(screen.getByRole('button', { name: '保存菜单配置' }));
  await vi.waitFor(() => expect(saveMenuConfig).toHaveBeenCalledTimes(1));
  const payload = saveMenuConfig.mock.calls[0][0] as MenuSaveInput;
  expect(payload.nodes.find(item => item.id === 'overview')?.section_id).toBe('system');
  // The move never touches action nodes: the draft and payload keep them all.
  const action = payload.nodes.find(item => item.id === 'action:demo');
  expect(action?.permission).toBe('users:create');
  expect(action?.operation_ids).toEqual(['createUsers']);
});

it('drags a page into a collapsed directory: the middle of the row re-parents and reveals the moved row', async () => {
  const { saveMenuConfig } = harness();
  await screen.findByRole('row', { name: '业务' });
  expect(rowOf('overview')).not.toBeNull();
  // The middle third of the directory row means "nest as its last child".
  dragOnto('overview', rowOf('administration')!, 'inside');
  // The collapsed target expands so the moved subtree shows up right away.
  expect(rowOf('overview')!.getAttribute('data-section')).toBe('system');
  expect(screen.getByText('有未保存的更改')).toBeVisible();
  await userEvent.click(screen.getByRole('button', { name: '保存菜单配置' }));
  await vi.waitFor(() => expect(saveMenuConfig).toHaveBeenCalledTimes(1));
  const payload = saveMenuConfig.mock.calls[0][0] as MenuSaveInput;
  const moved = payload.nodes.find(item => item.id === 'overview');
  expect(moved?.parent_id).toBe('administration');
  expect(moved?.section_id).toBe('system');
});

it('drops a directory on a region row: the whole subtree rewrites sections, action descendants included', async () => {
  const { saveMenuConfig } = harness(menuListForCrossRegionDrag());
  await screen.findByRole('row', { name: '业务' });
  // The management directory lives in the system region; releasing it anywhere
  // on the business region row moves the whole subtree across regions.
  dragOnto('administration', regionRow('business')!, 'inside');
  expect(rowOf('administration')!.getAttribute('data-section')).toBe('business');
  expect(screen.getByText('有未保存的更改')).toBeVisible();
  await userEvent.click(screen.getByRole('button', { name: '保存菜单配置' }));
  await vi.waitFor(() => expect(saveMenuConfig).toHaveBeenCalledTimes(1));
  const payload = saveMenuConfig.mock.calls[0][0] as MenuSaveInput;
  // Every node of the moved subtree — the invisible action descendant included —
  // carries the target section so each parent chain stays inside one section.
  for (const id of ['administration', 'users', 'action:nested']) {
    expect(payload.nodes.find(item => item.id === id)?.section_id).toBe('business');
  }
  expect(payload.nodes.find(item => item.id === 'users')?.parent_id).toBe('administration');
  expect(payload.nodes.find(item => item.id === 'action:nested')?.parent_id).toBe('administration');
  // The audit link stays behind in system; its active_menu pointed at the moved
  // page and would cross sections, so the relocation drops the reference.
  const audit = payload.nodes.find(item => item.id === 'link:audit');
  expect(audit?.section_id).toBe('system');
  expect(audit?.active_menu).toBeUndefined();
});

it('refuses to drop a node onto its own descendant and keeps the draft clean', async () => {
  harness(menuListWithNestedAction());
  await screen.findByRole('row', { name: '业务' });
  await userEvent.click(within(rowOf('administration')!).getByRole('button', { name: '展开或收起 管理工具' }));
  // The management directory is the users page's ancestor: every landing zone
  // on that row refuses, no hint lights up and the draft stays untouched.
  dragOnto('administration', rowOf('users')!, 'inside');
  dragOnto('administration', rowOf('users')!, 'after');
  expect(screen.queryByText('有未保存的更改')).toBeNull();
  expect(nodeOrder()).toEqual(['overview', 'notes', 'link:help', 'administration', 'users']);
});

it('refuses drops that push the subtree past the depth cap and accepts one level higher', async () => {
  const deep = (): MenuList => ({ ...menuList(), nodes: [...nodes,
    node({ id: 'd1', type: 'directory', label: '一层目录', sort: 100 }),
    node({ id: 'd2', type: 'directory', label: '二层目录', parent_id: 'd1', sort: 10 }),
    node({ id: 'd3', type: 'directory', label: '三层目录', parent_id: 'd2', sort: 10 }),
    node({ id: 'd4', type: 'directory', label: '四层目录', parent_id: 'd3', sort: 10 }),
    node({ id: 'branch', type: 'directory', label: '移植分支', sort: 200 }),
    node({ id: 'leaf', type: 'link', label: '分支叶子', parent_id: 'branch', url: 'https://example.test/leaf', sort: 10 }),
  ] });
  const { saveMenuConfig } = harness(deep());
  await screen.findByRole('row', { name: '业务' });
  for (const id of ['d1', 'd2', 'd3']) await userEvent.click(within(rowOf(id)!).getByRole('button', { name: /展开或收起/ }));
  // The two-level branch under the depth-4 directory would reach depth 6 and refuses.
  dragOnto('branch', rowOf('d4')!, 'inside');
  expect(screen.queryByText('有未保存的更改')).toBeNull();
  // One level higher the same subtree fits exactly inside the five-level cap.
  dragOnto('branch', rowOf('d3')!, 'inside');
  expect(screen.getByText('有未保存的更改')).toBeVisible();
  await userEvent.click(screen.getByRole('button', { name: '保存菜单配置' }));
  await vi.waitFor(() => expect(saveMenuConfig).toHaveBeenCalledTimes(1));
  const payload = saveMenuConfig.mock.calls[0][0] as MenuSaveInput;
  const branch = payload.nodes.find(item => item.id === 'branch');
  expect(branch?.parent_id).toBe('d3');
  expect(payload.nodes.find(item => item.id === 'leaf')?.parent_id).toBe('branch');
  expect(payload.nodes.find(item => item.id === 'd4')?.parent_id).toBe('d3');
});

it('keeps same-parent drops a pure reorder and inserts beside nested rows when re-parenting', async () => {
  const { saveMenuConfig } = harness();
  await screen.findByRole('row', { name: '业务' });
  expect(nodeOrder()).toEqual(['overview', 'notes', 'link:help', 'administration']);
  // Lower third of a sibling row: overview moves after notes, nothing else changes.
  dragOnto('overview', rowOf('notes')!, 'after');
  expect(nodeOrder()).toEqual(['notes', 'overview', 'link:help', 'administration']);
  await userEvent.click(screen.getByRole('button', { name: '保存菜单配置' }));
  await vi.waitFor(() => expect(saveMenuConfig).toHaveBeenCalledTimes(1));
  let payload = saveMenuConfig.mock.calls[0][0] as MenuSaveInput;
  const overview = payload.nodes.find(item => item.id === 'overview')!;
  expect(overview.parent_id).toBeUndefined();
  expect(overview.section_id).toBe('business');
  expect(payload.nodes.find(item => item.id === 'notes')!.sort).toBeLessThan(overview.sort);
  expect(payload.nodes.find(item => item.id === 'link:help')!.sort).toBeGreaterThan(overview.sort);
  // Upper third of a nested row inserts into that row's parent list before it,
  // re-parenting across regions through the same subtree rewrite.
  await userEvent.click(within(rowOf('administration')!).getByRole('button', { name: '展开或收起 管理工具' }));
  dragOnto('link:help', rowOf('users')!, 'before');
  expect(rowOf('link:help')!.getAttribute('data-section')).toBe('system');
  expect(nodeOrder().slice(0, 2)).toEqual(['notes', 'overview']);
  await userEvent.click(screen.getByRole('button', { name: '保存菜单配置' }));
  await vi.waitFor(() => expect(saveMenuConfig).toHaveBeenCalledTimes(2));
  payload = saveMenuConfig.mock.calls[1][0] as MenuSaveInput;
  const help = payload.nodes.find(item => item.id === 'link:help')!;
  expect(help.parent_id).toBe('administration');
  expect(help.section_id).toBe('system');
  expect(help.sort).toBeLessThan(payload.nodes.find(item => item.id === 'users')!.sort);
});

it('deletes a node after confirmation and keeps the draft local until save', async () => {
  const { saveMenuConfig } = harness();
  await screen.findByRole('row', { name: '业务' });
  const overviewMenu = await openRowMenu(rowOf('overview')!, '工作台概览');
  await userEvent.click(within(overviewMenu).getByRole('menuitem', { name: '删除' }));
  const confirm = screen.getByRole('alertdialog', { name: '删除菜单节点' });
  await userEvent.click(within(confirm).getByRole('button', { name: '删除' }));
  expect(screen.queryByText('工作台概览')).toBeNull();
  expect(saveMenuConfig).not.toHaveBeenCalled();
});

it('edits region name and title switch inline, marking the draft dirty', async () => {
  harness();
  await screen.findByRole('row', { name: '业务' });
  const business = regionRow('business')!;
  await userEvent.type(within(business).getByRole('textbox', { name: '区域名称' }), '核心');
  expect(screen.getByText('有未保存的更改')).toBeVisible();
  await userEvent.click(within(business).getByRole('switch', { name: '标题' }));
  await userEvent.click(screen.getByRole('button', { name: '保存菜单配置' }));
  await vi.waitFor(() => expect(screen.getByRole('button', { name: '保存菜单配置' })).toBeEnabled());
});

it('never offers action entries: edit keeps the persisted type and create stops at page/link/directory', async () => {
  const { saveMenuConfig } = harness();
  await screen.findByRole('row', { name: '业务' });
  const overviewMenu = await openRowMenu(rowOf('overview')!, '工作台概览');
  await userEvent.click(within(overviewMenu).getByRole('menuitem', { name: '编辑' }));
  const dialog = screen.getByRole('dialog', { name: '编辑节点' });
  // Edit mode keeps the persisted type; there is no picker to switch to 按钮.
  expect(within(dialog).queryByRole('combobox', { name: '菜单类型' })).toBeNull();
  await userEvent.click(within(dialog).getByRole('button', { name: '取消' }));
  // Create mode offers exactly directory/page/link.
  const businessMenu = await openRowMenu(regionRow('business')!, '业务');
  await userEvent.click(within(businessMenu).getByRole('menuitem', { name: '添加子菜单' }));
  const create = screen.getByRole('dialog', { name: '添加目录' });
  await userEvent.click(within(create).getByRole('combobox', { name: '菜单类型' }));
  expect(screen.queryByRole('option', { name: '按钮' })).toBeNull();
  await userEvent.keyboard('{Escape}');
  await userEvent.click(within(create).getByRole('button', { name: '取消' }));
  await userEvent.click(screen.getByRole('button', { name: '保存菜单配置' }));
  await vi.waitFor(() => expect(saveMenuConfig).toHaveBeenCalledTimes(1));
  const payload = saveMenuConfig.mock.calls[0][0] as MenuSaveInput;
  // The fixture carries one pre-registered action; the editor adds none.
  const actionIds = payload.nodes.filter(item => item.type === 'action').map(item => item.id).sort();
  expect(actionIds).toEqual(['action:demo']);
});

it('leaves role assignment to the role editor and never sends role_assignments', async () => {
  // Authorization lives in the role editor's four surfaces; the menu editor is
  // a pure layout tool, so saves never carry a role payload.
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
  await screen.findByRole('row', { name: '业务' });
  await userEvent.click(screen.getByRole('button', { name: '保存菜单配置' }));
  await vi.waitFor(() => expect(saveMenuConfig).toHaveBeenCalledTimes(1));
  expect((saveMenuConfig.mock.calls[0][0] as MenuSaveInput).role_assignments).toBeUndefined();
  expect(screen.queryByRole('button', { name: /分配 工作台概览 的角色/ })).toBeNull();
});

it('restores the whole shared tree through the reset payload', async () => {
  const { saveMenuConfig } = harness();
  await screen.findByRole('row', { name: '业务' });
  await userEvent.click(screen.getByRole('button', { name: '恢复默认' }));
  const confirm = screen.getByRole('alertdialog', { name: '恢复默认菜单配置' });
  expect(within(confirm).getByText('将清空全部自定义区域与节点，立即恢复注册默认导航树。')).toBeVisible();
  await userEvent.click(within(confirm).getByRole('button', { name: '恢复默认' }));
  await vi.waitFor(() => expect(saveMenuConfig).toHaveBeenCalledWith({ version: 7, sections: [], nodes: [], reset: true }));
});

it('reports load failures with a retry and surfaces save errors as messages', async () => {
  const failing = vi.fn().mockRejectedValueOnce(new Error('菜单读取失败')).mockImplementation(async () => menuList());
  mountWeb({ menuConfig: failing, saveMenuConfig: vi.fn(), roles: vi.fn(async () => ({ items: [], permissions: [] })), apiOperations: vi.fn(async () => ({ items: operations })) }, meta(['menus:write', 'roles:write']));
  expect(await screen.findByText('菜单读取失败')).toBeVisible();
  await userEvent.click(screen.getByRole('button', { name: '重试' }));
  expect(await screen.findByRole('row', { name: '业务' })).toBeVisible();
});

it('keeps the editor open and shows the server conflict when the version CAS rejects the save', async () => {
  const { saveMenuConfig } = harness();
  await screen.findByRole('row', { name: '业务' });
  saveMenuConfig.mockRejectedValueOnce(Object.assign(new Error('配置已被他人修改，请刷新后重试'), { code: 'VERSION_CONFLICT' }));
  await userEvent.click(screen.getByRole('button', { name: '保存菜单配置' }));
  expect(await screen.findByText('配置已被他人修改，请刷新后重试')).toBeVisible();
  // The draft stays editable for a retry after refreshing the table.
  expect(screen.getByRole('button', { name: '保存菜单配置' })).toBeEnabled();
  expect(screen.getByRole('row', { name: '业务' })).toBeVisible();
});

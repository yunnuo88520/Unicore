// Author: yunnuo <ymz@ebox.vip>
// Description: One shared navigation tree drives every workspace: ordered sections with surfaces, unprefixed globally unique node ids, op:* actions parented on pages, menu-grant filtering and the super-admin recovery path.
import { expect, it } from 'vitest';
import { buildMenuTree, buildNavigation, defaultNavigation, defaultPageOrder, flattenMenuTree, isLinkEntry, newNavigationNode, registeredPath, validNavigationUrl } from './navigation';
import { grantUI } from './test-authorization';
import { canAccess, routes } from './routes';
import type { Bootstrap, NavigationNode, NavigationSection } from '@unicore/sdk';

const bothSurfaces: NavigationSection['surfaces'] = ['user', 'administrator'];
const adminOnly: NavigationSection['surfaces'] = ['administrator'];

const superAdmin = {
  profile: 'web-platform', identity_realm: 'administrator',
  capabilities: { settings: true, updater: true, database: true, api_docs: true, features: { notes: true } },
  current_user: { id: 'root', roles: ['super_admin'], permissions: ['users:read', 'administrators:read', 'roles:read', 'departments:read', 'posts:read', 'tasks:read', 'menus:write', 'dictionaries:read', 'announcements:read', 'files:access', 'notes:access', 'storage:read', 'settings:read', 'logs:read'] },
} as unknown as Bootstrap;

const member = (permissions: string[], menuIds?: string[]) => ({
  profile: 'web-platform', identity_realm: 'user', capabilities: { database: true, settings: true },
  current_user: { id: 'u1', roles: ['user'], permissions, ...(menuIds ? { menu_ids: menuIds } : {}) },
} as unknown as Bootstrap);

function entriesOf(navigation: ReturnType<typeof buildNavigation>, sectionId: string) {
  const section = navigation.sections.find(item => item.id === sectionId);
  return section?.entries.map(entry => entry.id) ?? [];
}
function walkAll(navigation: ReturnType<typeof buildNavigation>): string[] {
  return navigation.sections.flatMap(section => section.entries.flatMap(function walk(entry): string[] {
    return [entry.id, ...entry.children.flatMap(walk)];
  }));
}
/** Component fixtures grant menus through the shared helpers; explicit menu_ids win. */
function render(metadata: Bootstrap) { return buildNavigation(grantUI(metadata)); }
function baseNode(id: string, sectionId: string, type: NavigationNode['type']): NavigationNode {
  return newNavigationNode(id, sectionId, type, bothSurfaces);
}

it('seeds one shared default tree with ordered sections, registry-mirrored surfaces and op:* actions', () => {
  const config = defaultNavigation(['administrator']);
  // Both workspaces consume the same tree; the surfaces argument no longer forks it.
  expect(defaultNavigation(['user'])).toEqual(config);
  expect(config.sections.map(section => [section.id, section.sort, [...section.surfaces]])).toEqual([
    ['business', 10, bothSurfaces], ['system', 30, adminOnly],
  ]);
  // Node identities are global, unique and unprefixed.
  const ids = config.nodes.map(node => node.id);
  expect(new Set(ids).size).toBe(ids.length);
  for (const id of ids) expect(id).not.toMatch(/^(user|administrator):/);
  // Page nodes cover exactly the default page order.
  const pages = config.nodes.filter(node => node.type === 'page');
  expect(pages.map(node => node.route_id!).slice().sort()).toEqual([...defaultPageOrder].sort());
  // Page surfaces mirror the route registry: management and system groups plus
  // the platform admin-only pages (including the API reference) stay off the
  // user surface.
  const platformAdminOnly = new Set(['files', 'announcements', 'site', 'api-docs']);
  const registry = routes as unknown as Record<string, { group?: string }>;
  for (const node of pages) {
    const group = registry[node.route_id!]?.group;
    expect([...node.surfaces]).toEqual(group === 'system' || group === 'administration' || group === 'monitor' || platformAdminOnly.has(node.route_id!) ? adminOnly : bothSurfaces);
    // Two regions: system, administration and monitor pages ride their
    // directories in the system region — API 文档 stays a top-level tail
    // there — everything else, including personal pages under 个人中心,
    // stays in business.
    const systemTopLevel = node.route_id === 'api-docs';
    expect(node.section_id).toBe(systemTopLevel || group === 'system' || group === 'administration' || group === 'monitor' ? 'system' : 'business');
    expect(node.parent_id).toBe(systemTopLevel ? undefined : group === 'system' ? 'settings' : group === 'personal' ? 'personal' : group === 'administration' ? 'administration' : group === 'monitor' ? 'monitor-center' : undefined);
  }
  // Directory surfaces aggregate the same route-derived page surfaces.
  for (const directory of config.nodes.filter(node => node.type === 'directory')) {
    expect([...directory.surfaces]).toEqual(directory.id === 'personal' ? bothSurfaces : adminOnly);
    expect(directory.section_id).toBe(directory.id === 'personal' ? 'business' : 'system');
    expect(directory.sort).toBe(directory.id === 'personal' ? 2700 : directory.id === 'administration' ? 20 : directory.id === 'monitor-center' ? 25 : 10);
  }
  // Actions hang off page nodes with op:* identities and inherit their surfaces.
  const actions = config.nodes.filter(node => node.type === 'action');
  expect(actions.length).toBeGreaterThan(0);
  for (const action of actions) {
    expect(action.id).toMatch(/^op:/);
    const parent = pages.find(page => page.id === action.parent_id);
    expect(parent).toBeTruthy();
    expect([...action.surfaces]).toEqual([...parent!.surfaces]);
  }
  expect(actions.find(action => action.id === 'op:createNote')).toMatchObject({ parent_id: 'notes', permission: 'notes:create', operation_ids: ['createNote'] });
});

it('renders the shared administrator tree: three seeded directories over two regions', () => {
  const navigation = render(superAdmin);
  expect(navigation.sections.map(section => section.id)).toEqual(['business', 'system']);
  const business = navigation.sections.find(section => section.id === 'business')!;
  // The business region keeps the shared workspace entries plus the real seeded
  // 个人中心 directory at its tail instead of a separate personal region; both
  // workspaces share it.
  expect(entriesOf(navigation, 'business')).toEqual(['overview', 'announcements', 'notes', 'personal']);
  const personal = business.entries.find(entry => entry.id === 'personal')!;
  expect(personal.type).toBe('directory');
  expect(personal.label).toBe('个人中心');
  expect(personal.children.map(entry => entry.id)).toEqual(['account', 'account-security', 'account-sessions']);
  // The administrator-only system region keeps 系统设置 first, the 超级管理员
  // directory behind it and the API reference as the top-level tail.
  const system = navigation.sections.find(section => section.id === 'system')!;
  expect(entriesOf(navigation, 'system')).toEqual(['settings', 'administration', 'api-docs']);
  expect(system.entries[0].type).toBe('directory');
  expect(system.entries[0].children.map(entry => entry.id)).toEqual(['site', 'storage', 'account-policy', 'mail', 'mail-templates', 'notification-channels', 'notification-templates', 'system-notifications', 'logs', 'edition']);
  const administration = system.entries[1];
  expect(administration.type).toBe('directory');
  expect(!!administration.label).toBe(true);
  expect(administration.children.map(entry => entry.id)).toEqual(['users', 'roles', 'departments', 'posts', 'api-operations', 'menus', 'dictionaries', 'tasks']);
  // With menus reachable there is no recovery section.
  expect(navigation.sections.some(section => section.id === 'recovery')).toBe(false);
});

it('keeps the user workspace on the same tree: the shared personal directory, administrator surfaces gone', () => {
  const navigation = render({ ...superAdmin, identity_realm: 'user' });
  expect(navigation.sections.map(section => section.id)).toEqual(['business']);
  // The system region, the super-admin directory and the administrator-only
  // pages (files/announcements/site plus management pages) never reach the
  // user workspace; canAccess also hard-denies api-docs there, even for a
  // super admin, while the personal pages live inside the real 个人中心
  // directory at the tail of the single business region.
  expect(walkAll(navigation)).toEqual(['overview', 'notes', 'personal', 'account', 'account-security', 'account-sessions']);
  const personal = navigation.sections.find(section => section.id === 'business')!.entries.find(entry => entry.id === 'personal')!;
  expect(personal.type).toBe('directory');
  expect(personal.label).toBe('个人中心');
  expect(personal.children.map(entry => entry.id)).toEqual(['account', 'account-security', 'account-sessions']);
});

it('renders only menu-granted pages for a member while canAccess still caps direct URLs', () => {
  const navigation = render(member(['notes:access'], ['notes', 'personal', 'account']));
  expect(navigation.sections.map(section => section.id)).toEqual(['business']);
  expect(walkAll(navigation)).toEqual(['notes', 'personal', 'account']);
  // Directory grants never imply their subtree: without the child pages the
  // directory stays empty and drops out of the sidebar entirely.
  expect(walkAll(render(member(['notes:access'], ['notes', 'personal'])))).toEqual(['notes']);
  // A menu grant cannot conjure a page canAccess denies on the user realm.
  expect(walkAll(render(member(['notes:access'], ['notes', 'personal', 'account', 'api-docs'])))).toEqual(['notes', 'personal', 'account']);
  expect(canAccess('api-docs', member(['notes:access'], ['api-docs']))).toBe(false);
});

it('keeps normal, rail and mobile presentations on one ordered model', () => {
  const navigation = render(superAdmin);
  const normal = walkAll(navigation);
  // The rail flattens the same tree; mobile renders the same section entries.
  const flattened = navigation.sections.flatMap(section => section.entries.flatMap(function walk(entry): string[] {
    return [entry.id, ...entry.children.flatMap(walk)];
  }));
  expect(flattened).toEqual(normal);
  expect(normal.filter(id => id === 'menus')).toHaveLength(1);
  // Action nodes exist in the model but never leak into the sidebar.
  expect(normal.some(id => id.startsWith('op:'))).toBe(false);
});

it('hides entries the operator marked invisible and drops empty directories', () => {
  const config = defaultNavigation(['administrator']);
  const nodes = config.nodes.map(node => node.id === 'users' ? { ...node, visible: false } : node);
  const navigation = render({ ...superAdmin, navigation: { version: 1, sections: config.sections, nodes } } as Bootstrap);
  const administration = navigation.sections.find(section => section.id === 'system')?.entries.find(entry => entry.id === 'administration');
  // Users is hidden; the remaining children keep the directory alive.
  expect(administration?.children.map(entry => entry.id)).toEqual(['roles', 'departments', 'posts', 'api-operations', 'menus', 'dictionaries', 'tasks']);
  const collapsed = config.nodes.map(node => node.id === 'administration' || node.parent_id === 'administration' ? { ...node, visible: false } : node);
  const dropped = render({ ...superAdmin, navigation: { version: 1, sections: config.sections, nodes: collapsed } } as Bootstrap);
  // An administrator directory without visible children disappears entirely.
  expect(dropped.sections.find(section => section.id === 'system')?.entries.some(entry => entry.id === 'administration')).toBe(false);
});

it('keeps the whole subtree reachable only through granted parents', () => {
  const config = defaultNavigation(['administrator']);
  const nodes: NavigationNode[] = config.nodes.map(node => node.id === 'menus'
    ? { ...node, id: 'menus:nested', parent_id: 'users' }
    : node);
  const restricted = { ...superAdmin, current_user: { id: 'ops', roles: ['ops'], permissions: ['users:read', 'menus:write'] } } as unknown as Bootstrap;
  const navigation = render({ ...restricted, navigation: { version: 1, sections: config.sections, nodes } } as Bootstrap);
  const users = navigation.sections.find(section => section.id === 'system')?.entries
    .find(entry => entry.id === 'administration')?.children.find(entry => entry.id === 'users');
  // 菜单管理 nested under 用户列表 renders there only when both grants exist.
  expect(users?.children.map(entry => entry.id)).toEqual(['menus:nested']);
  const withoutUsers = { ...restricted, current_user: { id: 'ops', roles: ['ops'], permissions: ['menus:write'] } } as unknown as Bootstrap;
  // Losing the parent grant drops the parent and the nested page beneath it.
  const collapsed = walkAll(render({ ...withoutUsers, navigation: { version: 1, sections: config.sections, nodes } } as Bootstrap));
  expect(collapsed).not.toContain('menus:nested');
  expect(collapsed).not.toContain('users');
});

it('renders operator links gated by visibility and registered in-site targets', () => {
  const config = defaultNavigation(['user']);
  const nodes: NavigationNode[] = [...config.nodes,
    { ...baseNode('link:help', 'business', 'link'), label: '帮助中心', url: 'https://example.com/help', sort: 5 },
    { ...baseNode('link:hidden', 'business', 'link'), label: '隐藏', url: '/notes', sort: 6, visible: false },
    { ...baseNode('link:inside', 'business', 'link'), label: '站内', url: '/', sort: 7 },
    { ...baseNode('link:bad', 'business', 'link'), label: '任意路径', url: '/../../etc/passwd', sort: 8 },
  ];
  const navigation = render({ ...member(['notes:access', 'files:access']), navigation: { version: 2, sections: config.sections, nodes } } as Bootstrap);
  const business = navigation.sections.find(section => section.id === 'business')!;
  const help = business.entries.find(entry => entry.id === 'link:help');
  expect(help && isLinkEntry(help)).toBe(true);
  expect(help?.url).toBe('https://example.com/help');
  // Invisible links disappear; unregistered in-site paths never render.
  expect(walkAll(navigation)).not.toContain('link:hidden');
  expect(walkAll(navigation)).not.toContain('link:bad');
  expect(walkAll(navigation)).toContain('link:inside');
});

it('keeps action nodes and disabled nodes out of the sidebar', () => {
  const config = defaultNavigation(['administrator']);
  const nodes: NavigationNode[] = [...config.nodes,
    { ...baseNode('action:invite', 'business', 'action'), label: '邀请用户', permission: 'users:create', visible: true },
    { ...baseNode('page:overview-alias', 'business', 'page'), label: '概览入口', route_id: 'overview', disabled: true },
  ];
  const navigation = render({ ...superAdmin, navigation: { version: 3, sections: config.sections, nodes } } as Bootstrap);
  const all = walkAll(navigation);
  expect(all).not.toContain('action:invite');
  expect(all).not.toContain('page:overview-alias');
  expect(all).toContain('overview');
});

it('always leaves the super administrator a reachable menu management entry', () => {
  const config = defaultNavigation(['administrator']);
  const stripped = {
    version: 1,
    sections: config.sections.filter(section => section.id !== 'business'),
    nodes: config.nodes.map(node => node.id === 'menus' ? { ...node, visible: false, disabled: true } : node),
  };
  const navigation = render({ ...superAdmin, navigation: stripped } as Bootstrap);
  // Even with the business region deleted and the editor node hidden, the
  // recovery section keeps the synthetic menus:recovery identity.
  const recovery = navigation.sections.find(section => section.id === 'recovery');
  expect(recovery?.entries.map(entry => entry.id)).toEqual(['menus:recovery']);
  expect(recovery?.entries.map(entry => entry.routeId)).toEqual(['menus']);
  // Restricted operators never see the forced entry.
  const restricted = { ...superAdmin, current_user: { id: 'ops', roles: ['ops'], permissions: ['users:read'] }, navigation: stripped } as unknown as Bootstrap;
  expect(render(restricted).sections.some(section => section.id === 'recovery')).toBe(false);
});

it('falls back to static defaults for standalone profiles and unknown parents', () => {
  const standalone = {
    profile: 'web-standalone', identity_realm: 'user', capabilities: { database: true, settings: true, updater: true, features: { notes: true } }, current_user: null,
    navigation: { version: 1, sections: [], nodes: [{ ...baseNode('overview', 'gone', 'page'), route_id: 'overview', parent_id: 'missing' }] },
  } as unknown as Bootstrap;
  const navigation = render(standalone);
  // The stored tree references a missing section, so the local defaults take over;
  // standalone keeps one business region without a personal section.
  expect(navigation.sections.map(section => section.id)).toEqual(['business']);
  const all = walkAll(navigation);
  expect(all).toContain('overview');
  expect(all).not.toContain('site');
  expect(all).not.toContain('account');
});

it('cuts cyclic parents instead of losing rows', () => {
  const config = defaultNavigation(['user']);
  const nodes: NavigationNode[] = config.nodes.map(node => node.id === 'overview' ? { ...node, parent_id: 'notes' } : node)
    .concat([{ ...baseNode('notes', 'business', 'page'), route_id: 'notes', parent_id: 'overview' }]);
  const tree = buildMenuTree({ sections: config.sections, nodes });
  const flat = flattenMenuTree(tree.flatMap(section => section.children));
  // Both rows survive; the cycle is cut at one point.
  expect(flat.map(({ node }) => node.id)).toEqual(expect.arrayContaining(['overview', 'notes']));
});

it('validates link targets against the registered route table only', () => {
  expect(registeredPath('/notes')).toBe('notes');
  expect(registeredPath('/')).toBe('overview');
  expect(registeredPath('/not-registered')).toBeUndefined();
  expect(registeredPath('//evil.example.com')).toBeUndefined();
  expect(validNavigationUrl('https://example.com/help')).toBe(true);
  expect(validNavigationUrl('/users')).toBe(true);
  expect(validNavigationUrl('/not-registered')).toBe(false);
  expect(validNavigationUrl('javascript:alert(1)')).toBe(false);
  expect(validNavigationUrl('/notes extra')).toBe(false);
});

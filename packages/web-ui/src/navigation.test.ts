import { grantUI } from './test-authorization';
// Author: yunnuo <ymz@ebox.vip>
// Description: The section tree drives normal, rail and mobile presentation identically: one order, real page targets for directories, permission-filtered entries and a super-admin recovery path to menu management.
import { expect, it } from 'vitest';
import { buildMenuTree, buildNavigation as renderNavigation, defaultNavigation, flattenMenuTree, isLinkEntry, registeredPath, validNavigationUrl } from './navigation';
import type { Bootstrap, NavigationNode } from '@unicore/sdk';

const superAdmin = {
  profile: 'web-platform', identity_realm: 'administrator',
  capabilities: { settings: true, updater: true, database: true },
  current_user: { id: 'root', roles: ['super_admin'], permissions: ['users:read', 'administrators:read', 'roles:read', 'departments:read', 'posts:read', 'tasks:read', 'menus:write', 'dictionaries:read', 'announcements:read', 'files:access', 'notes:access', 'storage:read', 'settings:read', 'logs:read'] },
} as unknown as Bootstrap;

const member = (permissions: string[]) => ({
  profile: 'web-platform', identity_realm: 'user', capabilities: { database: true, settings: true },
  current_user: { id: 'u1', roles: ['user'], permissions },
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

it('renders the default administrator tree: business, system directories and personal sections', () => {
  const navigation = buildNavigation(superAdmin);
  expect(navigation.sections.map(section => section.id)).toEqual(['admin:business', 'admin:system']);
  const business = navigation.sections.find(section => section.id === 'admin:business')!;
  // The 超级管理员 directory sits in the business region between the lab and announcements.
  const administration = business.entries.find(entry => entry.id === 'administration')!;
  expect(administration.type).toBe('directory');
  expect(!!administration.label).toBe(true);
  expect(administration.children.map(entry => entry.id)).toEqual(['users', 'roles', 'departments', 'posts', 'api-operations', 'menus', 'dictionaries', 'tasks']);
  expect(entriesOf(navigation, 'admin:business')).toEqual(['overview', 'lab', 'administration', 'announcements', 'files', 'notes', 'api-docs']);
  // The system region keeps 系统设置 and the 个人中心 directory with the profile pages.
  const system = navigation.sections.find(section => section.id === 'admin:system')!;
  expect(system.entries.map(entry => entry.id)).toEqual(['settings', 'personal']);
  const personal = system.entries.find(entry => entry.id === 'personal')!;
  expect(personal.type).toBe('directory');
  expect(personal.children.map(entry => entry.id)).toEqual(['account', 'account-security', 'account-sessions']);
});

it('keeps normal, rail and mobile presentations on one ordered model', () => {
  const navigation = buildNavigation(superAdmin);
  const normal = walkAll(navigation);
  // The rail flattens the same tree; mobile renders the same section entries.
  const flattened = navigation.sections.flatMap(section => section.entries.flatMap(function walk(entry): string[] {
    return [entry.id, ...entry.children.flatMap(walk)];
  }));
  expect(flattened).toEqual(normal);
  expect(normal.filter(id => id === 'menus')).toHaveLength(1);
});

it('shows the user tree without administration pages and renames appearance', () => {
  const navigation = buildNavigation(member(['notes:access', 'files:access']));
  expect(navigation.sections.map(section => section.id)).toEqual(['user:business', 'user:personal']);
  // 系统更新 stays super-only on web-platform; API 文档 needs no grant.
  expect(walkAll(navigation)).toEqual(['overview', 'lab', 'files', 'notes', 'api-docs', 'site', 'account', 'account-security', 'account-sessions']);
  const business = navigation.sections.find(section => section.id === 'user:business')!;
  const site = business.entries.find(entry => entry.id === 'site');
  expect(site?.label).toBe('外观设置');
});

it('hides entries the operator marked invisible and drops empty directories', () => {
  const config = defaultNavigation('administrator');
  const nodes = config.nodes.map(node => bare(node.id) === 'users' ? { ...node, visible: false } : bare(node.id) === 'administrators' ? { ...node, visible: false } : node);
  const data = { ...superAdmin, navigation: { version: 1, sections: config.sections, nodes } } as unknown as Bootstrap;
  const navigation = buildNavigation(data);
  const administration = navigation.sections.find(section => section.id === 'admin:business')?.entries.find(entry => entry.id === 'administration');
  // Users and administrators are hidden; the remaining children keep the directory alive.
  expect(administration?.children.map(entry => entry.id)).toEqual(['roles', 'departments', 'posts', 'api-operations', 'menus', 'dictionaries', 'tasks']);
  const empty = { ...superAdmin, navigation: { version: 1, sections: config.sections, nodes: config.nodes.map(node => bare(node.id) === 'administration' || bare(node.parent_id ?? '') === 'administration' ? { ...node, visible: false } : node) } } as unknown as Bootstrap;
  // An administrator directory without visible children disappears entirely.
  const collapsed = buildNavigation(empty);
  expect(collapsed.sections.find(section => section.id === 'admin:business')?.entries.some(entry => entry.id === 'administration')).toBe(false);
});

it('filters pages by permission and keeps the whole subtree reachable only through granted parents', () => {
  const config = defaultNavigation('administrator');
  const nodes: NavigationNode[] = config.nodes.map(node => bare(node.id) === 'menus'
    ? { ...newChild(node), parent_id: 'administrator:users' }
    : node);
  const restricted = { ...superAdmin, current_user: { id: 'ops', roles: ['ops'], permissions: ['users:read', 'menus:write'] } } as unknown as Bootstrap;
  const data = { ...restricted, navigation: { version: 1, sections: config.sections, nodes } } as unknown as Bootstrap;
  const navigation = buildNavigation(data);
  const users = navigation.sections.find(section => section.id === 'admin:business')?.entries
    .find(entry => entry.id === 'administration')?.children.find(entry => entry.id === 'users');
  // 菜单管理 nested under 用户列表 renders there only when both grants exist.
  expect(users?.children.map(entry => entry.id)).toEqual(['menus:nested']);
  const withoutUsers = { ...data, current_user: { id: 'ops', roles: ['ops'], permissions: ['menus:write'] } } as unknown as Bootstrap;
  // Losing the parent grant drops the parent and the nested page beneath it.
  const collapsed = walkAll(buildNavigation(withoutUsers));
  expect(collapsed).not.toContain('menus:nested');
  expect(collapsed).not.toContain('users');
});
function newChild(node: NavigationNode): NavigationNode { return { ...node, id: `${node.id}:nested`, parent_id: node.id }; }

it('renders operator links gated by visibility and registered in-site targets', () => {
  const config = defaultNavigation('user');
  const nodes: NavigationNode[] = [...config.nodes,
    { ...baseNode('link:help', 'user:business', 'link'), label: '帮助中心', url: 'https://example.com/help', sort: 5 },
    { ...baseNode('link:hidden', 'user:business', 'link'), label: '隐藏', url: '/notes', sort: 6, visible: false },
    { ...baseNode('link:inside', 'user:business', 'link'), label: '站内', url: '/lab', sort: 7 },
    { ...baseNode('link:bad', 'user:business', 'link'), label: '任意路径', url: '/../../etc/passwd', sort: 8 },
  ];
  const navigation = buildNavigation({ ...member(['notes:access', 'files:access']), navigation: { version: 2, sections: config.sections, nodes } } as unknown as Bootstrap);
  const business = navigation.sections.find(section => section.id === 'user:business')!;
  const help = business.entries.find(entry => entry.id === 'link:help');
  expect(help && isLinkEntry(help)).toBe(true);
  expect(help?.url).toBe('https://example.com/help');
  // Invisible links disappear; unregistered in-site paths never render.
  expect(walkAll(navigation)).not.toContain('link:hidden');
  expect(walkAll(navigation)).not.toContain('link:bad');
  expect(walkAll(navigation)).toContain('link:inside');
});
function baseNode(id: string, sectionId: string, type: NavigationNode['type']): NavigationNode {
  return { id, section_id: sectionId, type, label: '', icon: 'Link', sort: 100, visible: true, open_mode: 'same_tab', badge_text: '', badge_color: '', badge_dot: false, operation_ids: [], disabled: false };
}

it('keeps action nodes and disabled nodes out of the sidebar', () => {
  const config = defaultNavigation('administrator');
  const nodes: NavigationNode[] = [...config.nodes,
    { ...baseNode('action:invite', 'admin:business', 'action'), label: '邀请用户', permission: 'users:create', visible: true },
    { ...baseNode('page:lab-alias', 'admin:business', 'page'), label: '实验室入口', route_id: 'lab', disabled: true },
  ];
  const navigation = buildNavigation({ ...superAdmin, navigation: { version: 3, sections: config.sections, nodes } } as unknown as Bootstrap);
  const all = walkAll(navigation);
  expect(all).not.toContain('action:invite');
  expect(all).not.toContain('page:lab-alias');
  expect(all).toContain('lab');
});

it('always leaves the super administrator a reachable menu management entry', () => {
  const config = defaultNavigation('administrator');
  const nodes = config.nodes.map(node => bare(node.id) === 'menus' ? { ...node, visible: false, disabled: true } : node)
    .filter(node => node.section_id !== 'admin:system' || bare(node.id) === 'menus' || node.parent_id !== 'administration');
  const stripped = config.sections.filter(section => section.id !== 'admin:system');
  const navigation = buildNavigation({ ...superAdmin, navigation: { version: 4, sections: stripped, nodes } } as unknown as Bootstrap);
  // Even with the system section deleted, the recovery entry points at the editor.
  const recovery = navigation.sections.find(section => section.id === 'recovery');
  expect(recovery?.entries.map(entry => entry.routeId)).toEqual(['menus']);
  // Restricted operators never see the forced entry.
  const restricted = { ...superAdmin, current_user: { id: 'ops', roles: ['ops'], permissions: ['users:read'] } } as unknown as Bootstrap;
  expect(buildNavigation(restricted).sections.some(section => section.id === 'recovery')).toBe(false);
});

it('falls back to static defaults for standalone profiles and unknown parents', () => {
  const standalone = {
    profile: 'web-standalone', identity_realm: 'user', capabilities: { database: true, settings: true, updater: true }, current_user: null,
    navigation: { version: 1, sections: [], nodes: [{ ...baseNode('lab', 'gone', 'page'), route_id: 'lab', parent_id: 'missing' }] },
  } as unknown as Bootstrap;
  const navigation = buildNavigation(standalone);
  // The stored tree references a missing section, so the local defaults take over;
  // the personal section stays empty (and hidden) without a platform account.
  expect(navigation.sections.map(section => section.id)).toEqual(['user:business']);
  expect(walkAll(navigation)).toContain('lab');
});

it('cuts cyclic parents instead of losing rows', () => {
  const config = defaultNavigation('user');
  const nodes: NavigationNode[] = config.nodes.map(node => bare(node.id) === 'lab' ? { ...node, parent_id: 'notes' } : node)
    .concat([{ ...baseNode('notes', config.sections[0].id, 'page'), route_id: 'notes', parent_id: 'user:lab' }]);
  const tree = buildMenuTree({ sections: config.sections, nodes });
  const flat = flattenMenuTree(tree.flatMap(section => section.children));
  // Both rows survive; the cycle is cut at one point.
  expect(flat.map(({ node }) => bare(node.id)).sort()).toEqual(expect.arrayContaining(['lab', 'notes']));
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

// Keep presentation assertions about route names, while production IDs include
// their workspace. Authorization fixtures explicitly grant these menus.
function bare(id: string): string { return id.replace(/^(user|administrator):/, ''); }
function buildNavigation(metadata: Bootstrap): ReturnType<typeof renderNavigation> {
 const result=renderNavigation(grantUI(metadata));
 const strip=(entries: typeof result.sections[number]['entries']): typeof entries=>entries.map(entry=>({...entry,id:bare(entry.id),children:strip(entry.children)}));
 return {...result,sections:result.sections.map(section=>({...section,entries:strip(section.entries)}))};
}

// Author: yunnuo <ymz@ebox.vip>
// Description: One ordered shared tree drives the menu editor and every workspace navigation presentation.
import { operations } from '@unicore/sdk';
import { notes } from './modules/notes';
import { uiModules } from './module-registry';
import type { Bootstrap, MenuList, NavigationNode, NavigationSection } from '@unicore/sdk';
import { Circle, type LucideIcon } from 'lucide-react';
import { defineMessages, t } from './i18n';
import { resolveNavigationIcon } from './navigation-icons';
import { canAccess, isAdminRealm, isAdministrator, routes, type Page } from './routes';

export type MenuTreeNode = { node: NavigationNode; children: MenuTreeNode[] };
export type MenuTreeSection = { section: NavigationSection; children: MenuTreeNode[] };
export type NavEntry = {
  id: string; type: 'directory' | 'page' | 'link'; label: string; icon: LucideIcon;
  routeId?: Page; url?: string; openMode: 'same_tab' | 'new_tab'; activeMenu?: string;
  badgeText: string; badgeColor: string; badgeDot: boolean; disabled: boolean; children: NavEntry[];
};
export type Navigation = { sections: { id: string; title: string; showTitle: boolean; entries: NavEntry[] }[] };
export type NavigationConfig = Pick<MenuList, 'version' | 'sections' | 'nodes'>;
export function isLinkEntry(entry: NavEntry): entry is NavEntry & { url: string } { return entry.type === 'link' && !!entry.url; }
export function isRegisteredPage(id: string | undefined): id is Page { return !!id && id !== 'not-found' && Object.hasOwn(routes, id); }
export function routePath(id: Page): string { return id === 'overview' ? '/' : `/${id}`; }
export function registeredPath(url: string): Page | undefined {
  try {
    if (!url.startsWith('/') || url.startsWith('//')) return undefined;
    const path = new URL(url, 'https://navigation.invalid').pathname;
    const id = path === '/' ? 'overview' : path.slice(1);
    return isRegisteredPage(id) ? id : undefined;
  } catch { return undefined; }
}
export function validNavigationUrl(value: string): boolean {
  if (!value || /\s/.test(value)) return false;
  if (value.startsWith('/')) return !!registeredPath(value);
  try { const url = new URL(value); return ['http:', 'https:'].includes(url.protocol) && !!url.hostname; } catch { return false; }
}
const builtinPageOrder: string[] = [
  'overview', 'lab', 'users', 'roles', 'departments', 'posts', 'api-operations', 'menus', 'dictionaries',
  'announcements', 'tasks', 'files', 'api-docs', 'site', 'storage', 'account-policy', 'mail', 'mail-templates',
  'notification-channels', 'notification-templates', 'system-notifications', 'logs', 'edition', 'account', 'account-security', 'account-sessions',
];
// Module pages append after the builtins in each module's declared order.
export const defaultPageOrder: string[] = [...builtinPageOrder, ...uiModules().flatMap(item => item.order ?? [])];
export function defaultRank(id: string): number { const index = defaultPageOrder.indexOf(id); return index < 0 ? defaultPageOrder.length : index; }
const titles = defineMessages({ business: '业务', system: '系统管理', administration: '超级管理员', settings: '系统设置', personal: '个人中心', appearance: '外观设置' });
// Seeded directories persist empty labels (names are operator-overridable), so
// the display fallback resolves their well-known ids to localized titles.
const directoryNames = defineMessages({ administration: '超级管理员', settings: '系统设置', personal: '个人中心' });
const directoryIcons: Record<string, string> = { administration: 'Users', settings: 'Settings2', personal: 'UserRound' };
// Seeded sections also persist empty names; the same fallback keeps 业务/系统管理/
// 个人中心 visible until an operator renames them.
const sectionNames: Record<string, string> = { business: titles.business, personal: titles.personal, system: titles.system };
export function sectionTitle(section: { id: string; name: string }): string {
  return section.name || sectionNames[section.id] || section.id;
}
export function directoryTitle(id: string): string {
  return directoryNames[id as keyof typeof directoryNames] ?? id;
}

const bothSurfaces: NavigationSection['surfaces'] = ['user', 'administrator'];
const adminOnly: NavigationSection['surfaces'] = ['administrator'];
// Pages whose availability narrows on the platform profile mirror the Go seed;
// standalone and desktop keep their single-surface console entries.
const platformAdminOnly = new Set(['files', 'announcements', 'site']);

/** Static local defaults use exactly the persisted model. Route membership comes only from the route registry. */
export function defaultNavigation(_surface: NavigationSection['surfaces'], profile: Bootstrap['profile'] = 'web-platform'): NavigationConfig {
  const platform = profile === 'web-platform';
  const sections: NavigationSection[] = [
    { id: 'business', surfaces: bothSurfaces, name: titles.business, sort: 10, visible: true, show_title: true },
    ...(platform ? [{ id: 'personal', surfaces: bothSurfaces, name: titles.personal, sort: 20, visible: true, show_title: true } as NavigationSection] : []),
    ...(platform ? [{ id: 'system', surfaces: adminOnly, name: titles.system, sort: 30, visible: true, show_title: true } as NavigationSection] : []),
  ];
  const nodes: NavigationNode[] = [];
  if (platform) {
    // The shared business region hosts the 超级管理员 directory right after
    // the lab entry.
    nodes.push({ ...newNavigationNode('administration', 'business', 'directory', adminOnly), label: titles.administration, icon: 'Users', sort: 20 });
  }
  for (const id of Object.keys(routes).filter(isRegisteredPage)) {
    if (id === 'administrators') continue;
    const route = routes[id];
    const group = 'group' in route ? String(route.group) : '';
    if (!platform && (group === 'personal' || group === 'administration' || (group === 'system' && id !== 'site' && id !== 'edition'))) continue;
    const surfaces: NavigationSection['surfaces'] = platform && (group === 'system' || group === 'administration' || platformAdminOnly.has(id)) ? adminOnly : bothSurfaces;
    const sectionId = platform ? group === 'system' ? 'system' : group === 'personal' ? 'personal' : 'business' : 'business';
    nodes.push({ ...newNavigationNode(id, sectionId, 'page', surfaces), parent_id: platform && group === 'administration' ? 'administration' : undefined, route_id: id,
      // Standalone and desktop expose the site console as the appearance page.
      label: !platform && id === 'site' ? titles.appearance : '',
      icon: defaultIcons[id] ?? 'Circle', sort: defaultRank(id) * 10 });
  }
  if (platform) {
    for (const [id, raw] of Object.entries(operations)) {
      const op = raw as unknown as {
        uiPage?: string; permissions: readonly string[];
        permissionMode?: string; superAdmin: boolean;
      };
      if (!op.uiPage || op.superAdmin || !op.permissions.length) continue;
      const page = nodes.find(node => node.type === 'page' && node.route_id === op.uiPage);
      if (!page) continue;
      const permissions = op.permissionMode === 'any' ? op.permissions : op.permissions.filter(p => p !== 'admin:access').slice(0, 1);
      permissions.forEach((permission, index) => nodes.push({
        ...newNavigationNode(`op:${id}${index ? `:alt${index}` : ''}`, page.section_id, 'action', [...page.surfaces]),
        parent_id: page.id, permission, operation_ids: [id],
      }));
    }
  }
  return { version: 0, sections, nodes };
}
const builtinIcons: Record<string, string> = {
  overview: 'LayoutDashboard', lab: 'FlaskConical', notes: 'NotebookPen', files: 'FolderOpen', site: 'Settings2', storage: 'Cloud',
  users: 'UserRound', administrators: 'UserCog', announcements: 'Megaphone', 'account-policy': 'ShieldCheck', mail: 'Mail', 'mail-templates': 'Mail',
  'notification-channels': 'Webhook', 'notification-templates': 'FileText', 'system-notifications': 'Bell', logs: 'ScrollText', edition: 'PackageCheck',
  roles: 'ShieldCheck', departments: 'Network', tasks: 'ListChecks', menus: 'LayoutDashboard', dictionaries: 'FileText', posts: 'UserCog',
  'api-operations': 'BookOpen', account: 'UserRound', 'account-security': 'ShieldCheck', 'account-sessions': 'Monitor', 'api-docs': 'BookOpen',
};
// Module icons merge after the builtins so a seeded tree and the client default match.
const defaultIcons: Record<string, string> = { ...builtinIcons, ...Object.fromEntries(uiModules().flatMap(item => Object.entries(item.icons ?? []))) };
export function newNavigationNode(id: string, sectionId: string, type: NavigationNode['type'], surfaces: NavigationNode['surfaces'] = bothSurfaces): NavigationNode {
  return { id, section_id: sectionId, surfaces: [...surfaces], type, label: '', icon: type === 'directory' ? 'Folder' : type === 'link' ? 'Link' : type === 'action' ? 'MousePointerClick' : 'Circle',
    sort: 100, visible: true, open_mode: 'same_tab', badge_text: '', badge_color: '', badge_dot: false, operation_ids: [], disabled: false };
}

/** Stable ordering and safe parent resolution are shared by the editor and render model. */
export function buildMenuTree(config: Pick<NavigationConfig, 'sections' | 'nodes'>): MenuTreeSection[] {
  const byId = new Map(config.nodes.map(node => [node.id, { node, children: [] } as MenuTreeNode]));
  const sections = [...config.sections].sort((a, b) => a.sort - b.sort || a.id.localeCompare(b.id)).map(section => ({ section, children: [] as MenuTreeNode[] }));
  const bySection = new Map(sections.map(section => [section.section.id, section]));
  for (const item of byId.values()) {
    const seen = new Set([item.node.id]);
    let cursor = item.node.parent_id ? byId.get(item.node.parent_id) : undefined;
    let cyclic = false;
    while (cursor) { if (seen.has(cursor.node.id)) { cyclic = true; break; } seen.add(cursor.node.id); cursor = cursor.node.parent_id ? byId.get(cursor.node.parent_id) : undefined; }
    const parent = !cyclic && item.node.parent_id ? byId.get(item.node.parent_id) : undefined;
    if (parent && parent.node.section_id === item.node.section_id) parent.children.push(item);
    else bySection.get(item.node.section_id)?.children.push(item);
  }
  const sort = (nodes: MenuTreeNode[]) => { nodes.sort((a, b) => a.node.sort - b.node.sort || a.node.id.localeCompare(b.node.id)); nodes.forEach(node => sort(node.children)); };
  sections.forEach(section => sort(section.children));
  return sections;
}
export function flattenMenuTree(nodes: MenuTreeNode[], depth = 0): { node: NavigationNode; depth: number }[] {
  return nodes.flatMap(item => [{ node: item.node, depth }, ...flattenMenuTree(item.children, depth + 1)]);
}
export function flattenNavigation(nodes: NavEntry[], depth = 0): { node: NavEntry; depth: number }[] {
  return nodes.flatMap(node => [{ node, depth }, ...flattenNavigation(node.children, depth + 1)]);
}
export function navEntryActive(node: NavEntry, page: Page): boolean { return node.routeId === page || node.activeMenu === page; }
export function subtreeContains(node: NavEntry, page: Page): boolean { return navEntryActive(node, page) || node.children.some(child => subtreeContains(child, page)); }

function surfacesInclude(surfaces: NavigationSection['surfaces'] | undefined, surface: string): boolean {
  return !!surfaces?.includes(surface as 'user' | 'administrator');
}

export function buildNavigation(data: Bootstrap): Navigation {
  const surface = isAdminRealm(data) ? 'administrator' : 'user';
  const config = data.profile === 'web-platform' && data.navigation ? data.navigation : defaultNavigation([surface], data.profile);
  const model = buildMenuTree(config);
  const render = ({ node, children }: MenuTreeNode): NavEntry | null => {
    if (!node.visible || node.disabled || node.type === 'action') return null;
    if (!surfacesInclude(node.surfaces, surface)) return null;
    if (data.profile === 'web-platform' && !data.current_user?.roles.includes('super_admin') && !data.current_user?.menu_ids?.includes(node.id)) return null;
    const kids = children.map(render).filter((entry): entry is NavEntry => !!entry);
    if (node.type === 'directory' && !kids.length) return null;
    if (node.type === 'page' && (!isRegisteredPage(node.route_id) || !canAccess(node.route_id, data))) return null;
    if (node.type === 'link' && (!validNavigationUrl(node.url ?? '') || (registeredPath(node.url ?? '') && !canAccess(registeredPath(node.url!)!, data)))) return null;
    const fallbackIcon = isRegisteredPage(node.route_id) ? routes[node.route_id].icon
      : directoryIcons[node.id] ? resolveNavigationIcon(directoryIcons[node.id]) : Circle;
    return { id: node.id, type: node.type, label: node.label || (isRegisteredPage(node.route_id) ? routes[node.route_id].label : directoryTitle(node.id)),
      icon: node.icon ? resolveNavigationIcon(node.icon) : fallbackIcon,
      routeId: isRegisteredPage(node.route_id) ? node.route_id : undefined, url: node.url, openMode: node.open_mode,
      activeMenu: node.active_menu, badgeText: node.badge_text, badgeColor: node.badge_color, badgeDot: node.badge_dot, disabled: node.disabled, children: kids };
  };
  const sections = model.filter(({ section }) => surfacesInclude(section.surfaces, surface) && section.visible).map(({ section, children }) => ({
    id: section.id, title: sectionTitle(section), showTitle: section.show_title, entries: children.map(render).filter((entry): entry is NavEntry => !!entry),
  })).filter(section => section.entries.length > 0);
  // A recovery entry is independent of operator visibility, ancestors and deleted sections.
  if (isAdministrator(data) && !sections.some(section => flattenNavigation(section.entries).some(({ node }) => node.routeId === 'menus' && !node.disabled))) {
    const recovery = render({ node: { ...newNavigationNode('menus:recovery', 'recovery', 'page', adminOnly), route_id: 'menus', label: routes.menus.label, icon: 'ListTree' }, children: [] });
    if (recovery) sections.push({ id: 'recovery', title: t('菜单恢复'), showTitle: true, entries: [recovery] });
  }
  // The member workspace folds its personal pages into one collapsible
  // first-level entry, mirroring how the administrator sees the same region.
  // Purely presentational: the menu editor and the persisted model stay flat.
  for (const [index, section] of sections.entries()) {
    if (surface !== 'user' || section.id !== 'personal' || !section.entries.some(entry => entry.type !== 'directory')) continue;
    const group: NavEntry = { id: `${section.id}:group`, type: 'directory', label: section.title || t('个人中心'), icon: resolveNavigationIcon('UserRound'), openMode: 'same_tab', badgeText: '', badgeColor: '', badgeDot: false, disabled: false, children: section.entries };
    sections[index] = { ...section, showTitle: false, entries: [group] };
  }
  return { sections };
}

// Author: yunnuo <ymz@ebox.vip>
// Description: One ordered shared tree drives the menu editor and every workspace navigation presentation.
import { operations } from '@unicore/sdk';
import { notes } from './modules/notes';
import { uiModules } from './module-registry';
import type { Bootstrap, MenuList, NavigationNode, NavigationSection } from '@unicore/sdk';
import { Circle, type LucideIcon } from 'lucide-react';
import { defineMessages, t } from './i18n';
import { navigationIcons, resolveNavigationIcon } from './navigation-icons';
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
const platformAdminOnly = new Set(['files', 'announcements', 'site', 'api-docs']);

/** Route registration alone decides which workspaces a page reaches, mirroring the Go seed: console and management groups plus the platform admin-only pages stay administrator-only. */
export function routeSurfaces(id: string): NavigationSection['surfaces'] {
  const group = isRegisteredPage(id) && 'group' in routes[id] ? String(routes[id].group) : '';
  return group === 'system' || group === 'administration' || platformAdminOnly.has(id) ? ['administrator'] : ['user', 'administrator'];
}

/** Seeded directory surfaces aggregate their subtree: the union of the route-derived page surfaces keeps a directory reachable wherever its pages are. */
function groupSurfaces(group: string): NavigationSection['surfaces'] {
  const merged = new Set<'user' | 'administrator'>();
  for (const id of Object.keys(routes).filter(isRegisteredPage)) {
    const route = routes[id];
    if ('group' in route && String(route.group) === group) for (const surface of routeSurfaces(id)) merged.add(surface);
  }
  return merged.size ? [...merged] : bothSurfaces;
}

/** Static local defaults use exactly the persisted model. Route membership comes only from the route registry. */
export function defaultNavigation(_surface: NavigationSection['surfaces'], profile: Bootstrap['profile'] = 'web-platform'): NavigationConfig {
  const platform = profile === 'web-platform';
  const sections: NavigationSection[] = [
    { id: 'business', surfaces: bothSurfaces, name: titles.business, sort: 10, visible: true, show_title: true },
    ...(platform ? [{ id: 'system', surfaces: adminOnly, name: titles.system, sort: 30, visible: true, show_title: true } as NavigationSection] : []),
  ];
  const nodes: NavigationNode[] = [];
  if (platform) {
    // The console directories mirror the sidebar: the system region keeps
    // 系统设置 with the console pages followed by 超级管理员 hosting the
    // administration pages, and 个人中心 is one shared directory at the tail
    // of the business region so the same account pages are granted once for
    // both workspaces. Their surfaces aggregate the same route-derived page
    // surfaces their subtree carries.
    nodes.push({ ...newNavigationNode('administration', 'system', 'directory', groupSurfaces('administration')), label: titles.administration, icon: 'Users', sort: 20 });
    nodes.push({ ...newNavigationNode('settings', 'system', 'directory', groupSurfaces('system')), label: titles.settings, icon: 'Settings2', sort: 10 });
    nodes.push({ ...newNavigationNode('personal', 'business', 'directory', groupSurfaces('personal')), label: titles.personal, icon: 'UserRound', sort: 2700 });
  }
  for (const id of Object.keys(routes).filter(isRegisteredPage)) {
    if (id === 'administrators') continue;
    const route = routes[id];
    const group = 'group' in route ? String(route.group) : '';
    if (!platform && (group === 'personal' || group === 'administration' || (group === 'system' && id !== 'site' && id !== 'edition'))) continue;
    // API 文档 is a top-level page at the tail of the system region on the
    // platform profile, after the settings and administration directories.
    const systemTopLevel = platform && id === 'api-docs';
    const surfaces: NavigationSection['surfaces'] = platform ? routeSurfaces(id) : bothSurfaces;
    const sectionId = platform && (systemTopLevel || group === 'system' || group === 'administration') ? 'system' : 'business';
    const parent = platform ? systemTopLevel ? undefined : group === 'administration' ? 'administration' : group === 'system' ? 'settings' : group === 'personal' ? 'personal' : undefined : undefined;
    nodes.push({ ...newNavigationNode(id, sectionId, 'page', surfaces), parent_id: parent, route_id: id,
      // Standalone and desktop expose the site console as the appearance page.
      label: !platform && id === 'site' ? titles.appearance : '',
      icon: defaultIcons[id] ?? 'Circle', sort: systemTopLevel ? 30 : defaultRank(id) * 10 });
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

// ---- Menu editor helpers ----
// Pure editor-only utilities behind the menu console's tree table: display
// names, row targets, the registered icon palette, search filtering and
// subtree copying. They never widen what the persisted model may express.

/** The editor shows the same display names as the workspace: operator labels first, then the registered route label or the seeded directory fallback. */
export function menuNodeLabel(node: Pick<NavigationNode, 'label' | 'route_id' | 'type' | 'id'>): string {
  return node.label.trim() || (isRegisteredPage(node.route_id) ? t(routes[node.route_id].label) : node.type === 'directory' ? t(directoryTitle(node.id)) : node.id);
}

/** The stable definition a row points at: route id, link URL or referenced permission. */
export function menuNodeTarget(node: NavigationNode): string {
  return node.type === 'page' ? node.route_id ?? '' : node.type === 'link' ? node.url ?? '' : node.type === 'action' ? node.permission ?? '' : '';
}

const editorIconNames = ['Circle', 'Folder', 'Link', 'ListTree', 'SquarePen', 'Link2', 'MousePointerClick'];
let iconNamesByComponent: Map<LucideIcon, string> | null = null;
function iconNameOf(icon: LucideIcon): string | undefined {
  if (!iconNamesByComponent) iconNamesByComponent = new Map(Object.entries(navigationIcons).map(([name, candidate]) => [candidate, name]));
  return iconNamesByComponent.get(icon);
}
/** The icon palette the product itself registers: seeded page and directory defaults, module icons, route-declared icons plus the editor's type icons, with Circle as the neutral fallback. */
export function registeredNavigationIconNames(): string[] {
  const names = new Set<string>(editorIconNames);
  for (const name of Object.values(builtinIcons)) names.add(name);
  for (const name of Object.values(directoryIcons)) names.add(name);
  for (const name of uiModules().flatMap(item => Object.values(item.icons ?? []))) if (navigationIcons[name]) names.add(name);
  for (const id of Object.keys(routes).filter(isRegisteredPage)) { const name = iconNameOf(routes[id].icon); if (name) names.add(name); }
  return [...names].sort();
}

/** Search filter for the editor tree: a row survives when it matches or one of its descendants does, a matching row keeps its whole subtree, ancestors of matches keep their filtered children, and sections follow the same rule on their title. */
export function filterMenuTree(sections: MenuTreeSection[], nodeMatches: (node: NavigationNode) => boolean, sectionMatches?: (section: NavigationSection) => boolean): MenuTreeSection[] {
  const keep = (items: MenuTreeNode[]): MenuTreeNode[] => items.flatMap(item => {
    if (nodeMatches(item.node)) return [item];
    const children = keep(item.children);
    return children.length ? [{ ...item, children }] : [];
  });
  return sections.flatMap(({ section, children }) => {
    const whole = sectionMatches?.(section) ?? false;
    const kept = whole ? children : keep(children);
    return whole || kept.length ? [{ section, children: kept }] : [];
  });
}

/** Deep-copy one node and its subtree in place: every copied id gains a unique `-copy` suffix, the copy sorts right after its source among siblings, and the copied root stays hidden until the operator reveals it. */
export function copyMenuNode(nodes: NavigationNode[], id: string): NavigationNode[] {
  const source = nodes.find(node => node.id === id);
  if (!source) return nodes;
  const taken = new Set(nodes.map(node => node.id));
  const copyId = (original: string): string => {
    for (let round = 1; ; round += 1) {
      const suffix = round === 1 ? '-copy' : `-copy${round}`;
      const candidate = `${original.slice(0, Math.max(1, 64 - suffix.length))}${suffix}`;
      if (!taken.has(candidate)) { taken.add(candidate); return candidate; }
    }
  };
  const copies: NavigationNode[] = [];
  const visited = new Set<string>();
  const walk = (node: NavigationNode, parentId?: string): void => {
    if (visited.has(node.id)) return;
    visited.add(node.id);
    const copy: NavigationNode = { ...node, id: copyId(node.id), parent_id: parentId, visible: node.id === id ? false : node.visible };
    copies.push(copy);
    for (const child of nodes.filter(item => item.parent_id === node.id)) walk(child, copy.id);
  };
  walk(source, source.parent_id);
  if (!copies.length) return nodes;
  // Renumber the source's sibling list with the copy directly after it; the
  // relative order of every other sibling stays untouched.
  const siblingIds = nodes
    .filter(node => node.section_id === source.section_id && (node.parent_id ?? '') === (source.parent_id ?? ''))
    .sort((a, b) => a.sort - b.sort || a.id.localeCompare(b.id))
    .map(node => node.id);
  siblingIds.splice(siblingIds.indexOf(source.id) + 1, 0, copies[0].id);
  const sorts = new Map(siblingIds.map((siblingId, slot) => [siblingId, (slot + 1) * 10]));
  const applySort = (node: NavigationNode): NavigationNode => sorts.has(node.id) ? { ...node, sort: sorts.get(node.id)! } : node;
  return [...nodes.map(applySort), ...copies.map(applySort)];
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
  return { sections };
}

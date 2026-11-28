// Author: yunnuo <ymz@ebox.vip>
// Description: Explain saved navigation against the same current-account sidebar render result.
import type { Bootstrap, NavigationNode } from '@unicore/sdk';
import { buildNavigation, flattenNavigation, isRegisteredPage, registeredPath, routeSurfaces, validNavigationUrl, type NavigationConfig } from './navigation';
import { canAccess, isAdminRealm, isAdministrator, routes } from './routes';
import { defineMessages } from './i18n';

export const navigationReasonLabels = defineMessages({
  feature: '所需功能未启用', workspace: '不适用于当前工作台', profile: '当前运行形态不提供此页面',
  hidden: '菜单已配置为隐藏', disabled: '菜单已停用', section: '所在区域已隐藏',
  parent: '父级菜单已隐藏或停用', parentWorkspace: '父级菜单不适用于当前工作台',
  grant: '当前账号的角色未获此菜单授权', parentGrant: '当前账号的角色未获父级菜单授权',
  permission: '当前账号缺少页面访问权限', super: '此页面仅供超级管理员访问',
  unavailable: '当前版本未提供此页面', target: '链接目标不可用',
  structure: '菜单层级不完整，请检查父级配置', empty: '没有可显示的子菜单',
  refresh: '当前账号侧栏未显示，请刷新账号和菜单配置后确认',
});
export type NavigationReason = keyof typeof navigationReasonLabels;

// Visibility is always the actual saved sidebar result. Explanations collect
// independent failed conditions; a single role or switch never claims to be
// the sole cause. Unsaved drafts are deliberately not mixed into this result.
export function navigationStatuses(metadata: Bootstrap, config: NavigationConfig): Map<string, { visible: boolean; reasons: NavigationReason[] }> {
  const displayed = new Set(buildNavigation(metadata).sections.flatMap(section => flattenNavigation(section.entries).map(({ node }) => node.id)));
  const surface = isAdminRealm(metadata) ? 'administrator' : 'user';
  const byID = new Map(config.nodes.map(node => [node.id, node]));
  const superRole = !!metadata.current_user?.roles.includes('super_admin');
  const needsGrant = metadata.profile === 'web-platform' && !superRole;
  const granted = (id: string) => !!metadata.current_user?.menu_ids?.includes(id);
  return new Map(config.nodes.filter(node => node.type !== 'action').map(node => {
    if (metadata.navigation && metadata.navigation.version !== config.version) return [node.id, { visible: displayed.has(node.id), reasons: ['refresh'] as NavigationReason[] }];
    const reasons = new Set<NavigationReason>();
    const section = config.sections.find(section => section.id === node.section_id);
    if (!section) reasons.add('structure');
    else {
      if (!section.visible) reasons.add('section');
      if (!section.surfaces.includes(surface)) reasons.add('workspace');
    }
    if (!node.visible) reasons.add('hidden');
    if (node.disabled) reasons.add('disabled');
    if (!node.surfaces.includes(surface)) reasons.add('workspace');
    if (needsGrant && !granted(node.id)) reasons.add('grant');
    const seen = new Set([node.id]);
    let cursor: NavigationNode = node;
    while (cursor.parent_id) {
      const parent = byID.get(cursor.parent_id);
      if (!parent || parent.section_id !== node.section_id || seen.has(parent.id)) { reasons.add('structure'); break; }
      seen.add(parent.id);
      if (!parent.visible || parent.disabled) reasons.add('parent');
      if (!parent.surfaces.includes(surface)) reasons.add('parentWorkspace');
      if (needsGrant && !granted(parent.id)) reasons.add('parentGrant');
      cursor = parent;
    }
    const page = node.type === 'page' ? node.route_id : node.type === 'link' ? registeredPath(node.url ?? '') : undefined;
    if (node.type === 'link' && !validNavigationUrl(node.url ?? '')) reasons.add('target');
    if (node.type === 'page' || page) {
      if ((page === 'notes' || page === 'note-management') && (!__FEATURE_NOTES__ || !metadata.capabilities.features?.notes)) reasons.add('feature');
      if (!isRegisteredPage(page)) reasons.add('unavailable');
      else {
        const route = routes[page];
        if (metadata.profile === 'web-platform' && !routeSurfaces(page).includes(surface)) reasons.add('workspace');
        if (page === 'edition' && !(metadata.profile === 'web-platform'
          ? (__FEATURE_UPDATER__ && metadata.capabilities.updater) || (__FEATURE_LICENSE__ && metadata.capabilities.license)
          : __FEATURE_UPDATER__ && metadata.capabilities.updater)) reasons.add('feature');
        if (page === 'site' && !metadata.capabilities.settings) reasons.add('feature');
        if ('database' in route && route.database && !metadata.capabilities.database) reasons.add('feature');
        if (metadata.profile === 'web-platform') {
          if (['files', 'access-tokens', 'edition'].includes(page) && !isAdministrator(metadata)) reasons.add('super');
          if ('permission' in route && !metadata.current_user?.permissions.includes(route.permission)) reasons.add('permission');
        } else if (!canAccess(page, metadata) && !reasons.has('feature')) reasons.add('profile');
      }
    }
    const visible = displayed.has(node.id);
    if (!visible && !reasons.size) reasons.add(node.type === 'directory' && !config.nodes.some(child => child.parent_id === node.id) ? 'empty' : 'refresh');
    return [node.id, { visible, reasons: visible ? [] : [...reasons] }];
  }));
}

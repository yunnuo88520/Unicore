// Author: yunnuo <ymz@ebox.vip>
// Description: Derive the navigation model from routes.ts plus operator menu overrides; placement exceptions stay here, not in JSX.
import type { Bootstrap, MenuEntry } from '@unicore/sdk';
import { Settings2, UserRound, Users, type LucideIcon } from 'lucide-react';
import { defineMessages, t } from './i18n';
import { canAccess, isAdministrator, routes, type Page } from './routes';

export type NavEntry = { id: Page; icon: LucideIcon; label: string };
export type NavGroupModel = { id: 'administration' | 'system' | 'personal'; title: string; icon: LucideIcon; entries: NavEntry[] };
export type Navigation = {
  primary: NavEntry[];
  files: NavEntry | null;
  /** Realm-dependent top-level entries: 外观设置 and 系统更新 for non-administrator realms. */
  standalone: NavEntry[];
  groups: NavGroupModel[];
};

const groupTitles = defineMessages({ administration: '用户管理', system: '系统设置', personal: '个人中心' });
const groupIcons: Record<keyof typeof groupTitles, LucideIcon> = { administration: Users, system: Settings2, personal: UserRound };

// Workspace destinations a menu entry can be moved to by the operator. Keys
// mirror the Navigation buckets; '' keeps the route's own default placement.
export const menuDestinations = defineMessages({ primary: '一级导航', files: '文件入口', standalone: '独立入口', system: '系统设置', personal: '个人中心', administration: '用户管理' });

type Override = { label?: string; group?: string; sort: number; visible: boolean };

function overrides(data: Bootstrap): Record<string, Override> {
  const result: Record<string, Override> = {};
  for (const entry of (data.menus ?? []) as MenuEntry[]) {
    result[entry.menu_key] = { label: entry.label || undefined, group: entry.group_key || undefined, sort: entry.sort, visible: entry.visible };
  }
  return result;
}

function ordered(entries: Page[], byId: Record<string, Override>, label?: (id: Page) => string | undefined): NavEntry[] {
  return [...entries].sort((a, b) => (byId[a]?.sort ?? 100) - (byId[b]?.sort ?? 100) || a.localeCompare(b)).map(id => ({ id, icon: routes[id].icon, label: label?.(id) ?? routes[id].label }));
}

export function buildNavigation(data: Bootstrap): Navigation {
  const administration = isAdministrator(data);
  const access = (id: Page) => canAccess(id, data);
  const byId = overrides(data);
  // Operators tune the user-realm workspace; the administrator console keeps
  // its code-defined layout so the configuration entry stays reachable.
  const apply = administration
    ? (id: Page) => ({ visible: true, label: undefined as string | undefined })
    : (id: Page) => ({ visible: byId[id]?.visible ?? true, label: byId[id]?.label });
  const entry = (id: Page, label?: string): NavEntry => ({ id, icon: routes[id].icon, label: label ?? apply(id).label ?? routes[id].label });
  const shown = (id: Page) => access(id) && apply(id).visible;
  const bucket = (id: Page): 'primary' | 'files' | 'standalone' | 'system' | 'personal' | 'administration' => {
    if (administration) {
      // Administrators get platform announcements as a first-level entry — it is site content, not user administration.
      if (id === 'announcements') return 'standalone';
      if ('group' in routes[id]) return routes[id].group as 'system' | 'administration' | 'personal';
      return 'primary';
    }
    // Personal realms keep appearance and updates top-level instead of inside the system group.
    const fallback = (id === 'site' || id === 'edition') ? 'standalone' : ('group' in routes[id] ? (routes[id].group as string) : 'primary');
    return ((byId[id]?.group as string | undefined) ?? fallback) as 'primary' | 'files' | 'standalone' | 'system' | 'personal' | 'administration';
  };

  const userPages = (Object.keys(routes) as Page[]).filter(id => id !== 'not-found' && shown(id));
  const primary = ordered(userPages.filter(id => bucket(id) === 'primary'), byId);
  const filesEntry = userPages.includes('files') ? entry('files', administration ? t('文件管理') : t('我的文件')) : null;
  const standalonePool = userPages.filter(id => bucket(id) === 'standalone');
  const standalone: NavEntry[] = ordered(standalonePool, byId, id => (!administration && id === 'site' ? t('外观设置') : undefined));
  const groups = (Object.keys(groupTitles) as (keyof typeof groupTitles)[])
    .map(id => ({
      id,
      title: t(groupTitles[id]),
      icon: groupIcons[id],
      entries: ordered(userPages.filter(id2 => bucket(id2) === id && (id2 !== 'site' || administration) && (id2 !== 'edition' || administration)), byId),
    }))
    .filter(group => group.entries.length > 0);
  
  return { primary, files: filesEntry, standalone, groups };
}

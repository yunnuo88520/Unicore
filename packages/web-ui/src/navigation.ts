// Author: yunnuo <ymz@ebox.vip>
// Description: Derive the navigation model from routes.ts in one place; placement exceptions stay here, not in JSX.
import type { Bootstrap } from '@unicore/sdk';
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

export function buildNavigation(data: Bootstrap): Navigation {
  const administration = isAdministrator(data);
  const access = (id: Page) => canAccess(id, data);
  const entry = (id: Page, label?: string): NavEntry => ({ id, icon: routes[id].icon, label: label ?? routes[id].label });
  const primary = (['overview', 'lab', 'notes'] as const).filter(access).map(id => entry(id));
  const files = access('files') ? entry('files', administration ? t('文件管理') : t('我的文件')) : null;
  const standalone: NavEntry[] = [];
  const site = access('site') ? entry('site') : null;
  const edition = access('edition') ? entry('edition') : null;
  // Context exceptions: personal realms keep appearance and updates top-level instead of inside the system group.
  if (!administration && site) standalone.push(entry('site', t('外观设置')));
  if (!administration && edition) standalone.push(edition);
  const groups = (Object.keys(groupTitles) as (keyof typeof groupTitles)[]).map(id => ({
    id,
    title: t(groupTitles[id]),
    icon: groupIcons[id],
    entries: (Object.keys(routes) as Page[])
      .filter(id2 => 'group' in routes[id2] && routes[id2].group === id && access(id2) && (id2 !== 'site' || administration) && (id2 !== 'edition' || administration))
      .map(id2 => entry(id2)),
  })).filter(group => group.entries.length > 0);
  return { primary, files, standalone, groups };
}

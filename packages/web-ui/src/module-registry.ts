/** Author: yunnuo <ymz@ebox.vip>
 * Description: Frontend module registry: modules contribute routes, mounts, order and icons without touching the core registries.
 */
import type { LucideIcon } from 'lucide-react';
import type { PageProps } from './router';

export type PageComponent = (props: PageProps) => React.ReactNode;

export interface UiRoute {
  label: string;
  title: string;
  description: string;
  permission?: string;
  icon?: LucideIcon;
  group?: string;
  /** The page needs the database capability; local profiles keep it usable. */
  database?: boolean;
  /** The page is available to signed-in local profiles without a platform grant. */
  local?: boolean;
  /**
   * Workspace reach for a business page. Business pages default to the user
   * workspace only; declare `['user', 'administrator']` when the requirement
   * explicitly places a business page in the administrator console too, and keep
   * the declaration identical to the module's backend `NavigationPage.Surfaces` —
   * the backend refuses menu payloads that exceed the registration.
   */
  surfaces?: ('user' | 'administrator')[];
}

/** Shared by the navigation seed and direct-route guard; role grants cannot widen workspace reach. */
export function pageSurfaces(id: string, route?: Partial<UiRoute>): ('user' | 'administrator')[] {
  if (id === 'overview') return ['user', 'administrator'];
  if (['system', 'administration', 'monitor', 'ai'].includes(route?.group ?? '') ||
      ['announcements', 'site', 'api-docs'].includes(id)) return ['administrator'];
  return route?.surfaces?.length ? [...route.surfaces] : ['user'];
}

export type MountFn = (path: string, loader: () => Promise<{ default: PageComponent }>) => void;

export interface UiModule<R extends Record<string, UiRoute> = Record<string, UiRoute>> {
  slug: string;
  routes: R;
  /** Lazy route loaders appended to the workspace router. */
  mounts?: ((mount: MountFn) => void)[];
  /** Page ids in the module's preferred default order. */
  order?: string[];
  /** Default lucide icon names keyed by page id (mirrors navigation.go). */
  icons?: Record<string, string>;
}

const modules: UiModule[] = [];

export function registerUiModule(...items: UiModule<any>[]): void {
  for (const item of items) {
    if (modules.some(existing => existing.slug === item.slug)) throw new Error(`Duplicate ui module: ${item.slug}`);
    modules.push(item);
  }
}

export function uiModules(): readonly UiModule[] {
  return modules;
}

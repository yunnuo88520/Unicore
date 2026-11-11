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

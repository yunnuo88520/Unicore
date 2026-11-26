// Author: yunnuo <ymz@ebox.vip>
import type { ComponentType, ReactNode } from 'react';
import type { AppClient, Bootstrap } from '@unicore/sdk';
import { useI18n } from './i18n';
import { CacheScope } from './session';

export type ConsolePageProps = { client: AppClient; metadata: Bootstrap; path: readonly string[] };
type ConsolePage = {
  id: string;
  label: string;
  permission?: string;
  component: ComponentType<ConsolePageProps>;
};
export type ConsoleShellProps = ConsolePageProps & {
  title: string;
  navigation: readonly { label: string; href: string; active: boolean }[];
  workspaces?: readonly WorkspaceDestination[];
  children: ReactNode;
};
export type WorkspaceDestination = {
  id: string;
  title: string;
  href: string;
  active: boolean;
  kind: 'user' | 'administrator' | 'console';
};
export type ConsoleDefinition = {
  id: string;
  title: string;
  permission: string;
  pages: readonly [ConsolePage, ...ConsolePage[]];
  shell: ComponentType<ConsoleShellProps>;
};

const prefix = '/workspaces/';
const slug = /^[a-z][a-z0-9-]{0,47}$/;

// Compose at the Web entry, not from operator-supplied URLs or scripts.
export function defineConsoles(...items: ConsoleDefinition[]): readonly ConsoleDefinition[] {
  const ids = new Set<string>();
  return Object.freeze(items.map(item => {
    if (!slug.test(item.id) || ids.has(item.id) || !item.permission) throw new Error(`Invalid console: ${item.id}`);
    ids.add(item.id);
    const pages = new Set<string>();
    for (const page of item.pages) {
      if (!slug.test(page.id) || pages.has(page.id)) throw new Error(`Invalid console page: ${item.id}/${page.id}`);
      pages.add(page.id);
    }
    if (!pages.size) throw new Error(`Empty console: ${item.id}`);
    return Object.freeze({ ...item, pages: Object.freeze(item.pages.map(page => Object.freeze({ ...page }))) }) as ConsoleDefinition;
  }));
}

export function consoleRoute(items: readonly ConsoleDefinition[], path: string) {
  if (!path.startsWith(prefix)) return null;
  const encodedSegments = path.slice(prefix.length).split('/');
  if (encodedSegments.at(-1) === '') encodedSegments.pop();
  if (encodedSegments.some(segment => !segment)) return null;
  let segments: string[];
  try {
    segments = encodedSegments.map(segment => decodeURIComponent(segment));
  } catch {
    return null;
  }
  if (segments.some(segment => segment === '.' || segment === '..' || /[\\/]/.test(segment) || /%[\da-f]{2}/i.test(segment))) return null;
  const [id, pageID, ...rest] = segments;
  const console = items.find(item => item.id === id);
  if (!console || (pageID && !console.pages.some(page => page.id === pageID))) return null;
  return { console, pageID, rest };
}

type Selection = NonNullable<ReturnType<typeof consoleRoute>>;
export function consoleHref(id: string) { return `${prefix}${id}`; }
/** Deep-link target for a console page plus its sub-route segments. */
export function consolePageHref(consoleId: string, pageID: string, ...rest: string[]) {
  const encodeSegment = (segment: string) => {
    if (!segment || segment === '.' || segment === '..' || /[\\/]/.test(segment) || /%[\da-f]{2}/i.test(segment)) {
      throw new Error(`Invalid console route segment: ${segment}`);
    }
    return encodeURIComponent(segment);
  };
  return [consoleHref(consoleId), encodeSegment(pageID), ...rest.map(encodeSegment)].join('/');
}
function has(metadata: Bootstrap, permission?: string) {
  return !!metadata.current_user && (!permission || metadata.current_user.permissions.includes(permission));
}

export function consoleAccess({ console, pageID, rest }: Selection, metadata: Bootstrap) {
  if (metadata.profile !== 'web-platform' || metadata.identity_realm === 'administrator' ||
      metadata.mfa_enrollment_required || !has(metadata, console.permission)) return null;
  const pages = console.pages.filter(page => has(metadata, page.permission));
  const active = pageID ? pages.find(page => page.id === pageID) : pages[0];
  return active ? { pages, active, rest } : null;
}

export function ConsoleView({ selection, access, client, metadata, consoles }: { selection: Selection; access: NonNullable<ReturnType<typeof consoleAccess>>; client: AppClient; metadata: Bootstrap; consoles: readonly ConsoleDefinition[] }) {
  const { t } = useI18n();
  const { console } = selection;
  const { shell: Shell } = console;
  const { active, pages, rest } = access;
  const Page = active.component;
  const navigation = pages.map(page => ({ label: t(page.label), href: consolePageHref(console.id, page.id), active: page.id === active.id }));
  const workspaces: WorkspaceDestination[] = [
    { id: 'user', title: t('工作空间'), href: '/', active: false, kind: 'user' },
    ...(metadata.admin_path ? [{ id: 'administrator', title: t('管理工作台'), href: metadata.admin_path, active: false, kind: 'administrator' as const }] : []),
    ...consoles.filter(item => consoleAccess({ console: item, pageID: '', rest: [] }, metadata)).map(item => ({
      id: `console:${item.id}`, title: t(item.title), href: consoleHref(item.id), active: item.id === console.id, kind: 'console' as const,
    })),
  ];
  // The cache scope is keyed by console id: switching workspaces tears the
  // previous console's queries and page state down instead of reusing them.
  return <CacheScope key={console.id} client={client}>
    <Shell title={t(console.title)} navigation={navigation} workspaces={workspaces} client={client} metadata={metadata} path={rest}>
      <Page key={active.id} client={client} metadata={metadata} path={rest} />
    </Shell>
  </CacheScope>;
}

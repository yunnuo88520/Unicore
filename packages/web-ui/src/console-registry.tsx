// Author: yunnuo <ymz@ebox.vip>
import type { ComponentType, ReactNode } from 'react';
import type { AppClient, Bootstrap } from '@unicore/sdk';
import { useI18n } from './i18n';

export type ConsolePageProps = { client: AppClient; metadata: Bootstrap };
type ConsolePage = {
  id: string;
  label: string;
  permission?: string;
  component: ComponentType<ConsolePageProps>;
};
export type ConsoleShellProps = ConsolePageProps & {
  title: string;
  navigation: readonly { label: string; href: string; active: boolean }[];
  children: ReactNode;
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
  const [id, pageID, ...rest] = path.slice(prefix.length).replace(/\/$/, '').split('/');
  if (rest.length) return null;
  const console = items.find(item => item.id === id);
  if (!console || (pageID && !console.pages.some(page => page.id === pageID))) return null;
  return { console, pageID };
}

type Selection = NonNullable<ReturnType<typeof consoleRoute>>;
export function consoleHref(id: string) { return `${prefix}${id}`; }
function has(metadata: Bootstrap, permission?: string) {
  return !!metadata.current_user && (!permission || metadata.current_user.permissions.includes(permission));
}

export function consoleAccess({ console, pageID }: Selection, metadata: Bootstrap) {
  if (metadata.profile !== 'web-platform' || metadata.identity_realm === 'administrator' ||
      metadata.mfa_enrollment_required || !has(metadata, console.permission)) return null;
  const pages = console.pages.filter(page => has(metadata, page.permission));
  const active = pageID ? pages.find(page => page.id === pageID) : pages[0];
  return active ? { pages, active } : null;
}

export function ConsoleView({ selection, access, client, metadata }: ConsolePageProps & { selection: Selection; access: NonNullable<ReturnType<typeof consoleAccess>> }) {
  const { t } = useI18n();
  const { console } = selection;
  const { shell: Shell } = console;
  const { active, pages } = access;
  const Page = active.component;
  const navigation = pages.map(page => ({ label: t(page.label), href: `${consoleHref(console.id)}/${page.id}`, active: page.id === active.id }));
  return <Shell title={t(console.title)} navigation={navigation} client={client} metadata={metadata}>
    <Page key={active.id} client={client} metadata={metadata} />
  </Shell>;
}

import { grantUI } from './test-authorization';
// Author: yunnuo <ymz@ebox.vip>
import { expect, it } from 'vitest';
import { canAccess as routeAccess, isAdminRealm, isAdministrator, pageFromHash } from './routes';
import { buildNavigation as navigation } from './navigation';
import type { Bootstrap } from '@unicore/sdk';

it('resolves explicit unknown routes without silently executing the overview', () => {
  expect(pageFromHash('#missing?ignored=true')).toBe('not-found');
  expect(pageFromHash('#roles')).toBe('roles');
  expect(pageFromHash('#settings')).toBe('site');
  expect(pageFromHash('#__proto__')).toBe('not-found');
  expect(pageFromHash('#reset-password?token=private')).toBe('overview');
});
it('guards platform pages by profile and permission while excluding local instance settings', () => {
  const metadata = { profile: 'web-standalone', capabilities: { settings: true }, current_user: { roles: ['user'], permissions: ['roles:read'] } } as Bootstrap;
  expect(canAccess('roles', metadata)).toBe(false);
  expect(canAccess('site', metadata)).toBe(false);
  metadata.profile = 'web-platform';
  expect(canAccess('roles', metadata)).toBe(false);
  metadata.current_user!.roles=['super_admin'];
  expect(canAccess('roles', metadata)).toBe(false);
  metadata.identity_realm='administrator';
  expect(canAccess('roles', metadata)).toBe(true);
  expect(canAccess('users', metadata)).toBe(false);
});

it('keeps notes visible on standalone and desktop while gating by the role grant on web-platform',()=>{
  const standalone = { profile: 'web-standalone', capabilities: { database: true, features: { notes: true } }, current_user: null } as unknown as Bootstrap;
  expect(canAccess('notes', standalone)).toBe(true);
  expect(pageFromHash('#files')).toBe('not-found');
  expect(pageFromHash('#lab')).toBe('not-found');
  const platform = { profile: 'web-platform', identity_realm: 'user', capabilities: { database: true, features: { notes: true } }, current_user: { roles: ['user'], permissions: [] } } as unknown as Bootstrap;
  expect(canAccess('notes', platform)).toBe(false);
  platform.current_user!.permissions = ['notes:access'];
  expect(canAccess('notes', platform)).toBe(true);
});

it('lands unconfigured administrator pages in the super-administrator group without changing realm access', () => {
  const metadata = { profile: 'web-platform', identity_realm: 'administrator', capabilities: { api_docs: true }, current_user: { roles: ['super_admin'], permissions: ['users:read', 'administrators:read', 'roles:read', 'tasks:read', 'menus:write', 'dictionaries:read', 'settings:read'] } } as unknown as Bootstrap;
  const navigation = buildNavigation(metadata);
  // The unconfigured administrator pages default into the 超级管理员 directory of the 系统管理 section.
  const administration = navigation.sections.find(section => section.id === 'system')?.entries.find(entry => entry.id === 'administration');
  expect(administration?.children.map(entry => entry.id).filter(id => ['users', 'administrators', 'menus', 'dictionaries', 'tasks'].includes(id)).sort()).toEqual(['dictionaries', 'menus', 'tasks', 'users']);
  // API 文档 needs no permission point but the api_docs capability: with it
  // published the page renders as the top-level tail of the system region.
  const system = navigation.sections.find(section => section.id === 'system')!;
  expect(system.entries.map(entry => entry.id)).toEqual(['settings', 'administration', 'api-docs']);
  expect(system.entries[2].type).toBe('page');
  const member = { ...metadata, identity_realm: 'user' } as Bootstrap;
  for (const page of ['tasks', 'menus', 'dictionaries'] as const) {
    expect(canAccess(page, member)).toBe(false);
    expect(canAccess(page, { ...metadata, profile: 'web-standalone' } as Bootstrap)).toBe(false);
  }
});

it('hides the API reference wherever the instance does not publish the contract', () => {
  // Members never reach api-docs regardless of the capability (realm deny).
  const member = { profile: 'web-platform', identity_realm: 'user', capabilities: { api_docs: true }, current_user: { roles: ['super_admin'], permissions: [] } } as unknown as Bootstrap;
  expect(canAccess('api-docs', member)).toBe(false);
  // Administrators need the published contract: without the capability the
  // seeded entry drops out of the system region entirely.
  const adminWithout = { profile: 'web-platform', identity_realm: 'administrator', capabilities: {}, current_user: { roles: ['super_admin'], permissions: [] } } as unknown as Bootstrap;
  expect(canAccess('api-docs', adminWithout)).toBe(false);
  expect(buildNavigation(adminWithout).sections.find(section => section.id === 'system')?.entries.some(entry => entry.id === 'api-docs') ?? false).toBe(false);
  const adminWith = { ...adminWithout, capabilities: { api_docs: true } } as unknown as Bootstrap;
  expect(canAccess('api-docs', adminWith)).toBe(true);
  expect(buildNavigation(adminWith).sections.find(section => section.id === 'system')?.entries.some(entry => entry.id === 'api-docs')).toBe(true);
  // Standalone keeps the same capability gate; desktop never gains the page.
  const standalone = { profile: 'web-standalone', capabilities: { api_docs: true }, current_user: null } as unknown as Bootstrap;
  expect(canAccess('api-docs', standalone)).toBe(true);
  expect(canAccess('api-docs', { ...standalone, capabilities: {} } as unknown as Bootstrap)).toBe(false);
  const desktop = { profile: 'desktop', capabilities: { api_docs: true }, current_user: null } as unknown as Bootstrap;
  expect(canAccess('api-docs', desktop)).toBe(false);
});

it('recognizes OIDC callback status without treating unknown hashes as overview',()=>{expect(pageFromHash('#oidc=success')).toBe('overview');expect(pageFromHash('#account?oidc=success')).toBe('not-found');expect(pageFromHash('#oidc=unknown')).toBe('not-found');});

it('gates the departments page on the departments:read grant inside the administration group', () => {
  const superAdmin = { profile: 'web-platform', identity_realm: 'administrator', capabilities: {}, current_user: { roles: ['super_admin'], permissions: ['users:read', 'administrators:read', 'roles:read', 'departments:read', 'menus:write', 'dictionaries:read'] } } as unknown as Bootstrap;
  expect(canAccess('departments', superAdmin)).toBe(true);
  const navigation = buildNavigation(superAdmin);
  const administration = navigation.sections.find(section => section.id === 'system')?.entries.find(entry => entry.id === 'administration');
  expect(administration?.children.map(entry => entry.id).filter(id => ['users', 'administrators', 'roles', 'departments', 'menus', 'dictionaries'].includes(id)).sort()).toEqual(['departments', 'dictionaries', 'menus', 'roles', 'users']);
  // A restricted operator without the grant loses both the route and the entry.
  const restricted = { ...superAdmin, current_user: { roles: ['ops'], permissions: ['users:read'] } } as unknown as Bootstrap;
  expect(canAccess('departments', restricted)).toBe(false);
  const restrictedTree = buildNavigation(restricted).sections.find(section => section.id === 'system')?.entries.find(entry => entry.id === 'administration');
  expect(restrictedTree?.children.map(entry => entry.id)).toEqual(['users']);
  // User realms and non-platform profiles never reach the administration group.
  const member = { ...superAdmin, identity_realm: 'user' } as Bootstrap;
  expect(canAccess('departments', member)).toBe(false);
  expect(canAccess('departments', { ...superAdmin, profile: 'web-standalone' } as unknown as Bootstrap)).toBe(false);
});

it('admits every administrator-realm operator while keeping super_admin semantics separate', () => {
  const restricted = { profile: 'web-platform', identity_realm: 'administrator', capabilities: {}, current_user: { roles: ['content-ops'], permissions: ['users:read', 'users:create', 'announcements:read'] } } as unknown as Bootstrap;
  expect(isAdminRealm(restricted)).toBe(true);
  expect(isAdministrator(restricted)).toBe(false);
  expect(canAccess('users', restricted)).toBe(true);
  expect(canAccess('announcements', restricted)).toBe(true);
  expect(canAccess('roles', restricted)).toBe(false);
  expect(canAccess('administrators', restricted)).toBe(false);
  expect(canAccess('edition', restricted)).toBe(false);
  // Multi-role accounts keep the super grant when super_admin is among the roles.
  const promoted = { ...restricted, current_user: { roles: ['content-ops', 'super_admin'], permissions: ['roles:read'] } } as unknown as Bootstrap;
  expect(isAdministrator(promoted)).toBe(true);
  expect(canAccess('roles', promoted)).toBe(true);
  expect(isAdminRealm({ ...restricted, identity_realm: 'user' } as Bootstrap)).toBe(false);
});

it('keeps restricted administrators in the administration layout while filtering entries by grant', () => {
  const restricted = { profile: 'web-platform', identity_realm: 'administrator', capabilities: {}, current_user: { roles: ['content-ops'], permissions: ['users:read', 'announcements:read'] } } as unknown as Bootstrap;
  const navigation = buildNavigation(restricted);
  // The granted 用户列表 keeps the 超级管理员 directory alive inside the
  // system region.
  const administration = navigation.sections.find(section => section.id === 'system')?.entries.find(entry => entry.id === 'administration');
  expect(administration?.children.map(entry => entry.id)).toEqual(['users']);
  expect(navigation.sections.find(section => section.id === 'business')?.entries.filter(entry => entry.type !== 'directory').map(entry => entry.id)).toEqual(['overview', 'announcements']);
  // 系统设置 pages need settings:read, so the settings directory drops out of
  // the system region; the personal center keeps no navigation presence — it
  // opens from the account menus' settings modal.
  expect(navigation.sections.find(section => section.id === 'system')?.entries.map(entry => entry.id)).toEqual(['administration']);
  expect(navigation.sections.find(section => section.id === 'business')?.entries.find(entry => entry.id === 'personal')).toBeUndefined();
});

it('gates posts and retires the separate API operation page', () => {
  const superAdmin = { profile: 'web-platform', identity_realm: 'administrator', capabilities: {}, current_user: { roles: ['super_admin'], permissions: ['posts:read', 'roles:read'] } } as unknown as Bootstrap;
  expect(canAccess('posts', superAdmin)).toBe(true);
  expect(pageFromHash('api-operations')).toBe('not-found');
  // Each page keeps its own point: posts readers do not reach the catalogue.
  const postsReader = { ...superAdmin, current_user: { roles: ['ops'], permissions: ['posts:read'] } } as unknown as Bootstrap;
  expect(canAccess('posts', postsReader)).toBe(true);
  const member = { ...superAdmin, identity_realm: 'user' } as Bootstrap;
  expect(canAccess('posts', member)).toBe(false);
  expect(canAccess('posts', { ...superAdmin, profile: 'web-standalone' } as unknown as Bootstrap)).toBe(false);
});

function canAccess(page: Parameters<typeof routeAccess>[0], metadata?: Bootstrap) { return routeAccess(page,metadata?grantUI(metadata):metadata); }
function buildNavigation(metadata: Bootstrap) {
 const result=navigation(grantUI(metadata));
 const strip=(entries: typeof result.sections[number]['entries']): typeof entries=>entries.map(entry=>({...entry,id:entry.id.replace(/^(user|administrator):/,''),children:strip(entry.children)}));
 return {...result,sections:result.sections.map(section=>({...section,entries:strip(section.entries)}))};
}

it('restricts global tokens to super administrators', () => {
 const base={profile:'web-platform',identity_realm:'administrator',capabilities:{},current_user:{roles:['super_admin'],permissions:['tokens:read']}} as unknown as Bootstrap;
 expect(canAccess('access-tokens',base)).toBe(true);
 expect(canAccess('access-tokens',{...base,current_user:{...base.current_user!,roles:['operator']}})).toBe(false);
 expect(canAccess('access-tokens',{...base,identity_realm:'user'})).toBe(false);
});

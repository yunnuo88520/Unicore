// Author: yunnuo <ymz@ebox.vip>
import { expect, it } from 'vitest';
import { canAccess, pageFromHash } from './routes';
import type { Bootstrap } from '@unicore/sdk';

it('resolves explicit unknown routes without silently executing the overview', () => {
  expect(pageFromHash('#missing?ignored=true')).toBe('not-found');
  expect(pageFromHash('#roles')).toBe('roles');
  expect(pageFromHash('#settings')).toBe('site');
  expect(pageFromHash('#__proto__')).toBe('not-found');
  expect(pageFromHash('#reset-password?token=private')).toBe('overview');
});
it('guards platform pages by profile and permission while allowing local settings', () => {
  const metadata = { profile: 'web-standalone', capabilities: { settings: true }, current_user: { roles: ['user'], permissions: ['roles:read'] } } as Bootstrap;
  expect(canAccess('roles', metadata)).toBe(false);
  expect(canAccess('site', metadata)).toBe(true);
  expect(canAccess('account', metadata)).toBe(false);
  metadata.profile = 'web-platform';
  expect(canAccess('roles', metadata)).toBe(false);
  metadata.current_user!.roles=['super_admin'];
  expect(canAccess('roles', metadata)).toBe(false);
  metadata.identity_realm='administrator';
  expect(canAccess('roles', metadata)).toBe(true);
  expect(canAccess('users', metadata)).toBe(false);
});

it('keeps notes visible on standalone and desktop while gating by the role grant on web-platform',()=>{
  const standalone = { profile: 'web-standalone', capabilities: { database: true }, current_user: null } as unknown as Bootstrap;
  expect(canAccess('notes', standalone)).toBe(true);
  expect(canAccess('files', standalone)).toBe(false);
  const platform = { profile: 'web-platform', identity_realm: 'user', capabilities: { database: true }, current_user: { roles: ['user'], permissions: [] } } as unknown as Bootstrap;
  expect(canAccess('notes', platform)).toBe(false);
  platform.current_user!.permissions = ['notes:access'];
  expect(canAccess('notes', platform)).toBe(true);
});

it('recognizes OIDC callback status without treating unknown hashes as overview',()=>{expect(pageFromHash('#oidc=success')).toBe('overview');expect(pageFromHash('#account?oidc=success')).toBe('account');expect(pageFromHash('#oidc=unknown')).toBe('not-found');});

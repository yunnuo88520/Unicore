/** Author: yunnuo <ymz@ebox.vip>
 * Description: Single-point gating mirrors routes.canAccess: platform sessions check the resolved grant list, local profiles keep every action.
 */
import { expect, it } from 'vitest';
import { hasPermissionPoint } from './permissions';
import type { Bootstrap } from '@unicore/sdk';

const platform = (permissions: string[], roles = ['user']) => ({
  profile: 'web-platform', identity_realm: 'user', capabilities: {}, current_user: { id: 'u1', roles, permissions },
} as unknown as Bootstrap);

it('decides single points from the resolved session grant list on web-platform', () => {
  expect(hasPermissionPoint(undefined, 'notes:create')).toBe(false);
  // Anonymous platform sessions carry no grants.
  const anonymous = { profile: 'web-platform', capabilities: {} } as unknown as Bootstrap;
  expect(hasPermissionPoint(anonymous, 'notes:create')).toBe(false);
  expect(hasPermissionPoint(platform([]), 'notes:create')).toBe(false);
  expect(hasPermissionPoint(platform(['notes:access']), 'notes:create')).toBe(false);
  expect(hasPermissionPoint(platform(['notes:access', 'notes:create']), 'notes:create')).toBe(true);
  expect(hasPermissionPoint(platform(['notes:access']), 'notes:access')).toBe(true);
  expect(hasPermissionPoint(platform(['files:access', 'files:upload']), 'files:upload')).toBe(true);
});

it('keeps super_admin full-catalogue semantics through the server-resolved list', () => {
  // The backend expands super_admin into the full catalogue before projecting
  // the session, so the frontend only re-checks the projected list.
  expect(hasPermissionPoint(platform(['files:delete'], ['super_admin']), 'files:delete')).toBe(true);
  // Restricted administrator roles keep only their assigned union.
  const restricted = { ...platform(['notes:access'], ['content-ops']), identity_realm: 'administrator' } as Bootstrap;
  expect(hasPermissionPoint(restricted, 'notes:access')).toBe(true);
  expect(hasPermissionPoint(restricted, 'files:delete')).toBe(false);
});

it('keeps every page action available on standalone and desktop profiles', () => {
  const standalone = { profile: 'web-standalone', capabilities: { database: true }, current_user: null } as unknown as Bootstrap;
  const desktop = { profile: 'desktop', capabilities: { database: true }, current_user: null } as unknown as Bootstrap;
  for (const metadata of [standalone, desktop]) {
    expect(hasPermissionPoint(metadata, 'notes:create')).toBe(true);
    expect(hasPermissionPoint(metadata, 'notes:update')).toBe(true);
    expect(hasPermissionPoint(metadata, 'notes:delete')).toBe(true);
    expect(hasPermissionPoint(metadata, 'files:upload')).toBe(true);
  }
});

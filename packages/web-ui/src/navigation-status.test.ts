// Author: yunnuo <ymz@ebox.vip>
// Description: Saved sidebar explanations preserve simultaneous gates and never grant routes.
import { expect, it } from 'vitest';
import type { Bootstrap } from '@unicore/sdk';
import { defaultNavigation, newNavigationNode } from './navigation';
import { navigationStatuses } from './navigation-status';
import { canAccess } from './routes';

it('collects feature, workspace, hidden ancestor and missing role conditions together', () => {
  const config = defaultNavigation(['administrator']);
  const notes = config.nodes.find(node => node.route_id === 'notes')!;
  notes.parent_id = 'custom-parent';
  notes.visible = false;
  config.nodes.push({ ...newNavigationNode('custom-parent', notes.section_id, 'directory', ['user']), visible: false });
  const metadata = { profile: 'web-platform', identity_realm: 'administrator', navigation: config, capabilities: { features: { notes: false } }, current_user: { roles: ['operator'], permissions: [], menu_ids: [] } } as unknown as Bootstrap;
  const result = navigationStatuses(metadata, config).get(notes.id)!;
  expect(result.visible).toBe(false);
  expect(result.reasons).toEqual(expect.arrayContaining(['feature', 'workspace', 'hidden', 'parent', 'parentWorkspace', 'grant', 'parentGrant', 'permission']));
  expect(canAccess('notes', metadata)).toBe(false);
});

it('does not blame roles for super administrators or imply configured means visible', () => {
  const config = defaultNavigation(['administrator']);
  const metadata = { profile: 'web-platform', identity_realm: 'administrator', navigation: config, capabilities: { settings: true, database: true }, current_user: { roles: ['super_admin'], permissions: ['users:read'] } } as unknown as Bootstrap;
  expect(navigationStatuses(metadata, config).get('users')).toEqual({ visible: true, reasons: [] });
  config.nodes.find(node => node.id === 'administration')!.visible = false;
  const hidden = navigationStatuses(metadata, config).get('users')!;
  expect(hidden.visible).toBe(false);
  expect(hidden.reasons).toEqual(['parent']);
});

it('reports only a missing role grant after capability, surface and permission pass', () => {
  const config = defaultNavigation(['administrator']);
  const metadata = { profile: 'web-platform', identity_realm: 'administrator', navigation: config, capabilities: { database: true }, current_user: { roles: ['operator'], permissions: ['users:read'], menu_ids: ['administration'] } } as unknown as Bootstrap;
  expect(navigationStatuses(metadata, config).get('users')).toEqual({ visible: false, reasons: ['grant'] });
  metadata.current_user!.menu_ids!.push('users');
  expect(navigationStatuses(metadata, config).get('users')).toEqual({ visible: true, reasons: [] });
  expect(canAccess('users', metadata)).toBe(true);
});

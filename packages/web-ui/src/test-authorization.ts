// Author: yunnuo <ymz@ebox.vip>
// Description: Explicit positive authorization fixtures for component tests.
import type { Bootstrap } from '@unicore/sdk';
import { defaultNavigation } from './navigation';
import { operations } from '@unicore/sdk';

export function grantUI(metadata: Bootstrap): Bootstrap {
  if (metadata.profile !== 'web-platform' || !metadata.current_user) return metadata;
  const user = metadata.current_user;
  const navigation = metadata.navigation ?? defaultNavigation(metadata.identity_realm === 'administrator' ? 'administrator' : 'user');
  const points = user.permissions;
  const operationIds = user.operation_ids ?? Object.entries(operations).filter(([, op]) =>
    !op.superAdmin && (op.permissionMode === 'any' ? op.permissions.some(p => points.includes(p)) : op.permissions.every(p => points.includes(p)))) .map(([id]) => id);
  const actionIds = user.action_ids ?? navigation.nodes.filter(node => node.type === 'action' && node.permission && points.includes(node.permission) && node.operation_ids.every(id => operationIds.includes(id))).map(node => node.id);
  return { ...metadata, navigation, current_user: { ...user, operation_ids: operationIds, action_ids: actionIds,
    menu_ids: user.menu_ids ?? navigation.nodes.filter(node => node.type !== 'action').map(node => node.id) } };
}

// Author: yunnuo <ymz@ebox.vip>
// Description: Contract-bound UI authorization; backend API policy remains authoritative.
import { useQuery } from '@tanstack/react-query';
import type { Bootstrap } from '@unicore/sdk';
import { useMemo } from 'react';
import { operations, type OperationId } from '@unicore/sdk';

type UIPolicy = {
  path: string; method: string; permissions: readonly string[];
  permissionMode?: string; superAdmin: boolean; identityRealm?: string; uiPage?: string;
};
const catalogue = operations as unknown as Record<string, UIPolicy>;

export function operationPermissionsAllow(permissions: readonly string[], operation: string): boolean {
  const op = catalogue[operation];
  if (!op || op.superAdmin) return false;
  const holds = (point: string) => permissions.includes(point);
  return op.permissionMode === 'any' ? op.permissions.some(holds) : op.permissions.every(holds);
}

export function resolveUIOperation(id: string, metadata: Bootstrap): string {
  const op = catalogue[id];
  if (!op || metadata.identity_realm !== 'administrator' || op.path.includes('/admin/')) return id;
  return Object.keys(catalogue).find(key => catalogue[key].method === op.method &&
    catalogue[key].path === op.path.replace('/api/v1/', '/api/v1/admin/')) ?? id;
}

// Points, API grants and effective action nodes are independent prerequisites.
// Menus control page access; reusable actions do not require another page's menu.
export function canAction(metadata: Bootstrap | undefined, operation: OperationId): boolean {
  if (!metadata) return false;
  if (metadata.profile !== 'web-platform') return true;
  const user = metadata.current_user;
  // The grant binds the contract operation the button represents; the
  // administrator realm may invoke a mirrored admin endpoint for it.
  const resolved = resolveUIOperation(operation, metadata);
  const op = catalogue[operation];
  const runtime = catalogue[resolved];
  if (!user || !op || !runtime) return false;
  const holds = (point: string) => user.permissions.includes(point);
  if (!(op.permissionMode === 'any' ? op.permissions.some(holds) : op.permissions.every(holds))) return false;
  if (user.roles.includes('super_admin')) return true;
  // Management-console-only endpoints stay super-gated even for point holders.
  if (runtime.superAdmin || !op.uiPage) return false;
  if (!(user.operation_ids?.includes(resolved) || user.operation_ids?.includes(operation))) return false;
  const navigation = metadata.navigation;
  const realm = metadata.identity_realm ?? 'user';
  const sections = new Set(navigation?.sections.filter(section => section.visible &&
    !!section.surfaces?.includes(realm as 'user' | 'administrator')).map(section => section.id));
  const nodes = (navigation?.nodes ?? []).filter(node => sections.has(node.section_id) &&
    !!node.surfaces?.includes(realm as 'user' | 'administrator'));
  return nodes.some(node => {
    if (node.type !== 'action' || !sections.has(node.section_id) || !node.permission ||
      !holds(node.permission) || !user.action_ids?.includes(node.id) ||
      (!node.operation_ids.includes(resolved) && !node.operation_ids.includes(operation)) ||
      !node.operation_ids.every(op => user.operation_ids?.includes(op))) return false;
    const seen = new Set<string>();
    let current: typeof node | undefined = node;
    while (current) {
      if (!current.visible || current.disabled || seen.has(current.id)) return false;
      seen.add(current.id);
      if (!current.parent_id) return true;
      current = nodes.find(parent => parent.id === current!.parent_id && parent.section_id === node.section_id);
    }
    return false;
  });
}

export function usePermissions(data?: Bootstrap): {
  has: (permission: string) => boolean; can: (operation: OperationId) => boolean; permissions: string[];
} {
  return useMemo(() => {
    const permissions = data?.current_user?.permissions ?? [];
    return { permissions, can: operation => canAction(data, operation), has: permission => {
      if (!permissions.includes(permission)) return false;
      if (!/:(create|update|delete|write|upload|apply)$/.test(permission)) return true;
      if (data?.current_user?.roles.includes('super_admin')) return true;
      return Object.entries(catalogue).some(([id, op]) => op.uiPage &&
        op.identityRealm === (data?.identity_realm ?? 'user') && op.method !== 'GET' &&
        op.permissions.includes(permission) && canAction(data, id as OperationId));
    } };
  }, [data]);
}

// hasPermissionPoint gates single page actions (buttons) with the same
// semantics as routes.canAccess: web-platform sessions carry the resolved
// grant union (super_admin and role unions are expanded server-side), while
// standalone and desktop profiles have no platform permission model and keep
// every page action. The API policy layer stays the enforcement point.
export function hasPermissionPoint(metadata: Bootstrap | undefined, permission: string): boolean {
  if (!metadata) return false;
  if (metadata.profile !== 'web-platform') return true;
  return !!metadata.current_user?.permissions.includes(permission);
}

// useDictionary loads one business dictionary (active items) for form selects.
export function useDictionary(client: { dictionaryByCode(code: string): Promise<unknown> }, code: string | undefined, enabled = true) {
  return useQuery({
    queryKey: ['dictionary', code],
    enabled: enabled && !!code,
    queryFn: () => client.dictionaryByCode(code!),
    staleTime: 5 * 60 * 1000,
  });
}

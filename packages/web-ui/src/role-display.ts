// Author: yunnuo <ymz@ebox.vip>
// Description: Role display resolution shared by user listings and the account menus: builtin labels localize, custom roles show the catalogue name, unknown ids fall back to themselves.
import { defineMessages, t } from './i18n';

const builtinRoleLabels = defineMessages({ user: '用户', superAdmin: '超级管理员' });

// Builtin ids map to localized labels; custom roles keep catalogue names.
export function roleDisplayName(roleId: string, roleNames?: readonly string[] | null, index?: number): string {
  if (roleId === 'super_admin') return t(builtinRoleLabels.superAdmin);
  if (roleId === 'user') return t(builtinRoleLabels.user);
  const fromCatalogue = index !== undefined ? roleNames?.[index] : undefined;
  return fromCatalogue && fromCatalogue !== roleId ? fromCatalogue : roleId;
}

// Catalogue rows and option chips share the same builtin/custom name rules.
export function roleDisplayLabel(role: { id: string; name: string }): string {
  return roleDisplayName(role.id, [role.name], 0);
}

// One label per role id in payload order; ids map through the parallel name
// list so deleted catalogue rows degrade to the raw id instead of vanishing.
export function roleDisplayLabels(roles: readonly string[], roleNames?: readonly string[] | null): string[] {
  return roles.map((roleId, index) => roleDisplayName(roleId, roleNames, index));
}

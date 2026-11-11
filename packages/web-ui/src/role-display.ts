// Author: yunnuo <ymz@ebox.vip>
// Description: Role display resolution shared by user listings and the account menus: builtin labels localize, custom roles show the catalogue name, unknown ids fall back to themselves.
import { defineMessages, t } from './i18n';

const builtinRoleLabels = defineMessages({ user: '用户' });

// super_admin keeps its raw product id everywhere (the established super
// administrator marker), the builtin user role localizes, and custom roles
// render the catalogue name carried by the session payload.
export function roleDisplayName(roleId: string, roleNames?: readonly string[] | null, index?: number): string {
  if (roleId === 'super_admin') return 'super_admin';
  if (roleId === 'user') return t(builtinRoleLabels.user);
  const fromCatalogue = index !== undefined ? roleNames?.[index] : undefined;
  return fromCatalogue && fromCatalogue !== roleId ? fromCatalogue : roleId;
}

// One label per role id in payload order; ids map through the parallel name
// list so deleted catalogue rows degrade to the raw id instead of vanishing.
export function roleDisplayLabels(roles: readonly string[], roleNames?: readonly string[] | null): string[] {
  return roles.map((roleId, index) => roleDisplayName(roleId, roleNames, index));
}

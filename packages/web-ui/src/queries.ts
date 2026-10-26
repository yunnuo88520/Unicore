// Author: yunnuo <ymz@ebox.vip>
// Description: Central mutation-to-resource invalidation; identity changes belong to SessionBoundary.
import type { QueryClient } from '@tanstack/react-query';
const affected = {
 branding: ['branding', 'bootstrap', 'mail-templates'],
  users: ['users', 'roles', 'user-role-options', 'admin-dashboard', 'bootstrap'],
  roles: ['roles', 'user-role-options', 'users', 'admin-dashboard', 'bootstrap'],
  settings: ['persistent-settings', 'bootstrap', 'auth-policy', 'oidc-public', 'oidc-account', 'oidc-settings', 'mail-policy', 'mail-templates'],
} as const;
export function invalidateAfter(client: QueryClient, mutation: keyof typeof affected) {
  return Promise.all(affected[mutation].map(key => client.invalidateQueries({ queryKey: [key] })));
}

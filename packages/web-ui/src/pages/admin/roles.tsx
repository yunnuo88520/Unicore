// Author: yunnuo <ymz@ebox.vip>
// Description: Administrator role boundaries. Transitional adapter; rebuilt with TanStack Table next.
import { RoleManagement } from '../../roles-page';
import type { PageProps } from '../../router';

export function AdminRolesPage({ client }: PageProps) {
  if (!client.web) return null;
  return <RoleManagement web={client.web} />;
}

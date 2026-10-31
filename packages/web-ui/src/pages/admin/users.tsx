// Author: yunnuo <ymz@ebox.vip>
// Description: Administrator user and administrator list management. Transitional adapter; rebuilt with TanStack Table next.
import { UserManagement } from '../../web-flows';
import type { PageProps } from '../../router';

export function AdminUsersPage({ client, metadata }: PageProps) {
  if (!client.web) return null;
  return <UserManagement web={client.web} metadata={metadata} administrators={false} />;
}

export function AdminAdministratorsPage({ client, metadata }: PageProps) {
  if (!client.web) return null;
  return <UserManagement web={client.web} metadata={metadata} administrators />;
}

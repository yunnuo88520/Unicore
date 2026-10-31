// Author: yunnuo <ymz@ebox.vip>
// Description: Account security and enterprise login binding. Transitional adapter.
import { AccountSecurity } from '../oidc-page';
import type { PageProps } from '../router';

export function AccountPage({ client, metadata, refresh }: PageProps) {
  if (!client.web || !metadata.current_user) return null;
  return <AccountSecurity web={client.web} userID={metadata.current_user.id} onChanged={refresh} />;
}

// Author: yunnuo <ymz@ebox.vip>
// Description: Super-administrator composition of global role-bound token management.
import type { PageProps } from '../../router';
import { TokenManager } from '../personal-tokens';
export function AdminAccessTokensPage({ client, metadata }: PageProps) {
  return <TokenManager web={client.web!} userID={metadata.current_user!.id} manage />;
}

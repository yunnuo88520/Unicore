// Author: yunnuo <ymz@ebox.vip>
// Description: Administrator object storage settings. Transitional adapter.
import { StorageSettings } from '../../storage-page';
import type { PageProps } from '../../router';

export function AdminStoragePage({ client }: PageProps) {
  if (!client.storage) return null;
  return <StorageSettings client={client} />;
}

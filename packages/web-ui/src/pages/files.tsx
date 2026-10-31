// Author: yunnuo <ymz@ebox.vip>
// Description: File management workspace. Transitional adapter; rebuilt with TanStack Table next.
import { FileManagement } from '../files-page';
import type { PageProps } from '../router';

export function FilesPage({ client, metadata }: PageProps) {
  return <FileManagement client={client} administrator={metadata.identity_realm === 'administrator'} />;
}

// Author: yunnuo <ymz@ebox.vip>
// Description: System updates: standalone update panel and the administrator edition panel.
import { UpdatePanel } from '../update-panel';
import { EditionPanel } from '../edition-panel';
import type { PageProps } from '../router';

export function UserEditionPage({ client, metadata }: PageProps) {
  return <UpdatePanel client={client} metadata={metadata} />;
}

export function AdminEditionPage({ client, metadata }: PageProps) {
  return <EditionPanel client={client} metadata={metadata} />;
}

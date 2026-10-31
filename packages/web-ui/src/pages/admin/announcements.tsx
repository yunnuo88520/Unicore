// Author: yunnuo <ymz@ebox.vip>
// Description: Administrator announcement management. Transitional adapter; rebuilt with TanStack Table next.
import { AnnouncementManagement } from '../../announcements-page';
import type { PageProps } from '../../router';

export function AdminAnnouncementsPage({ client }: PageProps) {
  if (!client.web) return null;
  return <AnnouncementManagement web={client.web} />;
}

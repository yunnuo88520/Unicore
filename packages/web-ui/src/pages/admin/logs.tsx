// Author: yunnuo <ymz@ebox.vip>
// Description: Administrator audit and mail delivery logs. Transitional adapter; rebuilt with TanStack Table next.
import { SystemLogs } from '../../logs-page';
import type { PageProps } from '../../router';

export function AdminLogsPage({ client }: PageProps) {
  if (!client.web) return null;
  return <SystemLogs web={client.web} />;
}

// Author: yunnuo <ymz@ebox.vip>
// Description: Administrator mail template editing with the restricted rich text editor. Transitional adapter; rebuilt onto Tiptap next.
import { MailTemplates } from '../../mail-templates-page';
import type { PageProps } from '../../router';

export function AdminMailTemplatesPage({ client }: PageProps) {
  if (!client.web) return null;
  return <MailTemplates web={client.web} />;
}

// Author: yunnuo <ymz@ebox.vip>
// Description: First-run installation flow. Transitional adapter; the wizard is rebuilt onto the new primitives next.
import { useNavigate } from '@tanstack/react-router';
import { InstallWizard } from '../install-page';
import type { PageProps } from '../router';

export function InstallPage({ client, metadata, refresh }: PageProps) {
  const navigate = useNavigate();
  if (!client.web) return null;
  return <InstallWizard
    web={client.web}
    initialProfile={metadata.profile}
    onDone={result => {
      if (result.profile === 'web-platform') { window.location.assign(result.admin_url); return; }
      window.history.replaceState({}, '', '/');
      void navigate({ to: '/' });
      refresh();
    }}
  />;
}

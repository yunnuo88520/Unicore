// Author: yunnuo <ymz@ebox.vip>
// Description: Authentication flows: code login/registration, email verification and password reset.
// Transitional adapter; flows are rebuilt onto the new form layer next.
import { LoginPage as CodeLoginPage, } from '../account-flows';
import { LegacyLoginPage } from '../legacy-account-flows';
import { useSessionNotice, type PageProps } from '../router';

export function LoginPage({ client, metadata, refresh }: PageProps) {
  const notice = useSessionNotice();
  if (!client.web) return null;
  return <CodeLoginPage
    administrator={metadata.identity_realm === 'administrator'}
    adminPath={metadata.admin_path}
    web={client.web}
    siteName={metadata.site_name}
    onDone={refresh}
    notice={notice}
  />;
}

export function VerifyEmailPage({ client, metadata, refresh }: PageProps) {
  if (!client.web) return null;
  return <LegacyLoginPage web={client.web} siteName={metadata.site_name} onDone={refresh} />;
}

export function ResetPasswordPage({ client, metadata, refresh }: PageProps) {
  if (!client.web) return null;
  return <LegacyLoginPage web={client.web} siteName={metadata.site_name} onDone={refresh} />;
}

/** Author: yunnuo <ymz@ebox.vip>
 * Description: Administrator-only entry composition; the router basepath follows the configured admin path.
 * Products can override any administration page through the administratorPage injection point.
 */
import { useEffect, useState } from 'react';
import { t, useLocale } from './i18n';
import { Workspace, type PageProps } from './App';
import type { AppClient } from '@unicore/sdk';
import { AdminStoragePage } from './pages/admin/storage';
import { AdminUsersPage, AdminAdministratorsPage } from './pages/admin/users';
import { AdminMailSettingsPage } from './pages/appearance';
import { AdminEditionPage } from './pages/edition';
import { AdminMailTemplatesPage } from './pages/admin/mail-templates';
import { AdminAnnouncementsPage } from './pages/admin/announcements';
import { AdminLogsPage } from './pages/admin/logs';
import { AdminRolesPage } from './pages/admin/roles';

function AdministrationPage(props: PageProps) {
  useLocale();
  if (!props.client.web) return null;
  switch (props.page) {
    case 'site': case 'mail': case 'account-policy': return <AdminMailSettingsPage {...props} />;
    case 'storage': return props.client.storage && <AdminStoragePage {...props} />;
    case 'users': case 'administrators': return props.page === 'administrators' ? <AdminAdministratorsPage {...props} /> : <AdminUsersPage {...props} />;
    case 'roles': return <AdminRolesPage {...props} />;
    case 'mail-templates': return <AdminMailTemplatesPage {...props} />;
    case 'announcements': return <AdminAnnouncementsPage {...props} />;
    case 'logs': return <AdminLogsPage {...props} />;
    case 'edition': return <AdminEditionPage {...props} />;
    default: return null;
  }
}

export function AdminWorkspace({ client }: { client: AppClient }) {
  useLocale();
  const [adminPath, setAdminPath] = useState('');
  useEffect(() => {
    let alive = true;
    client.bootstrap().then(data => { if (alive) setAdminPath(data.admin_path || '/admin'); }, () => { if (alive) setAdminPath('/admin'); });
    return () => { alive = false; };
  }, [client]);
  if (!adminPath) return <div className="flex min-h-dvh items-center justify-center bg-background text-sm text-muted" role="status">{t('正在连接 Go 核心')}</div>;
  return <Workspace client={client} administratorPage={AdministrationPage} basepath={adminPath} />;
}

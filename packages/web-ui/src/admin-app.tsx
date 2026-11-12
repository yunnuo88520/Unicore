/** Author: yunnuo <ymz@ebox.vip>
 * Description: Administrator-only entry composition; the router basepath follows the configured admin path.
 * Products can override any administration page through the administratorPage injection point.
 */
import { useEffect, useState } from 'react';
import { t, useLocale } from './i18n';
import { Workspace, type PageProps } from './App';
import { DashboardWidgetRegistry } from './registry';
import type { AppClient } from '@unicore/sdk';
import { AdminStoragePage } from './pages/admin/storage';
import { AdminUsersPage, AdminAdministratorsPage } from './pages/admin/users';
import { AdminMailSettingsPage } from './pages/appearance';
import { AdminEditionPage } from './pages/edition';
import { AdminNotificationsPage } from './pages/admin/notifications';
import { AdminMailTemplatesPage } from './pages/admin/mail-templates';
import { AdminAnnouncementsPage } from './pages/admin/announcements';
import { AdminLogsPage } from './pages/admin/logs';
import { AdminRolesPage } from './pages/admin/roles';
import { AdminDepartmentsPage } from './pages/admin/departments';
import { AdminTasksPage } from './pages/admin/tasks';
import { AdminMenusPage } from './pages/admin/menus';
import { AdminAccessTokensPage } from './pages/admin/access-tokens';
import { AdminPostsPage } from './pages/admin/posts';
import { AdminDictionariesPage } from './pages/admin/dictionaries';
import { AdminMonitorEventsPage, AdminMonitorPage, AdminMonitorResourcesPage, AdminMonitorServicesPage } from './pages/monitor';

export function AdministrationPage(props: PageProps) {
  useLocale();
  if (!props.client.web) return null;
  switch (props.page) {
    case 'site': case 'mail': case 'account-policy': return <AdminMailSettingsPage {...props} />;
    case 'storage': return props.client.storage && <AdminStoragePage {...props} />;
    case 'users': case 'administrators': return props.page === 'administrators' ? <AdminAdministratorsPage {...props} /> : <AdminUsersPage {...props} />;
    case 'roles': return <AdminRolesPage {...props} />;
    case 'departments': return <AdminDepartmentsPage {...props} />;
    case 'access-tokens': return <AdminAccessTokensPage {...props} />;
    case 'posts': return <AdminPostsPage {...props} />;
    case 'menus': return <AdminMenusPage {...props} />;
    case 'dictionaries': return <AdminDictionariesPage {...props} />;
    case 'notification-channels': case 'notification-templates': case 'system-notifications': return <AdminNotificationsPage {...props} />;
    case 'mail-templates': return <AdminMailTemplatesPage {...props} />;
    case 'announcements': return <AdminAnnouncementsPage {...props} />;
    case 'logs': return <AdminLogsPage {...props} />;
    case 'tasks': return <AdminTasksPage {...props} />;
    case 'edition': return <AdminEditionPage {...props} />;
    case 'monitor': return <AdminMonitorPage {...props} />;
    case 'monitor-services': return <AdminMonitorServicesPage {...props} />;
    case 'monitor-resources': return <AdminMonitorResourcesPage {...props} />;
    case 'monitor-events': return <AdminMonitorEventsPage {...props} />;
    default: return null;
  }
}

export function AdminWorkspace({ client, registry }: { client: AppClient; registry?: DashboardWidgetRegistry }) {
  useLocale();
  const [adminPath, setAdminPath] = useState('');
  useEffect(() => {
    let alive = true;
    client.bootstrap().then(data => { if (alive) setAdminPath(data.admin_path || '/admin'); }, () => { if (alive) setAdminPath('/admin'); });
    return () => { alive = false; };
  }, [client]);
  if (!adminPath) return <div className="flex min-h-dvh items-center justify-center bg-background text-sm text-muted" role="status">{t('正在连接 Go 核心')}</div>;
  return <Workspace client={client} registry={registry} administratorPage={AdministrationPage} basepath={adminPath} />;
}

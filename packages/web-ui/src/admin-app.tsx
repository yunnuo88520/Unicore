/** Author: yunnuo <ymz@ebox.vip>
 * Description: Administrator-only entry composition; the router basepath follows the configured admin path.
 * Products can override any administration page through the administratorPage injection point.
 */
import { Suspense, lazy, useEffect, useState } from 'react';
import { t, useLocale } from './i18n';
import { Workspace, type PageProps } from './App';
import { DashboardWidgetRegistry } from './registry';
import type { AppClient } from '@unicore/sdk';
import type { PageComponent } from './router';
import { PageLoader } from './components/page-loader';

// Administration pages load on demand: the admin entry must not pull the
// whole console before the first screen renders.
const lazyPage = (loader: () => Promise<{ default: PageComponent }>) => lazy(loader);
const AdminStoragePage = lazyPage(() => import('./pages/admin/storage').then(m => ({ default: m.AdminStoragePage })));
const AdminUsersPage = lazyPage(() => import('./pages/admin/users').then(m => ({ default: m.AdminUsersPage })));
const AdminAdministratorsPage = lazyPage(() => import('./pages/admin/users').then(m => ({ default: m.AdminAdministratorsPage })));
const AdminMailSettingsPage = lazyPage(() => import('./pages/appearance').then(m => ({ default: m.AdminMailSettingsPage })));
const AdminEditionPage = lazyPage(() => import('./pages/edition').then(m => ({ default: m.AdminEditionPage })));
const AdminNotificationsPage = lazyPage(() => import('./pages/admin/notifications').then(m => ({ default: m.AdminNotificationsPage })));
const AdminMailTemplatesPage = lazyPage(() => import('./pages/admin/mail-templates').then(m => ({ default: m.AdminMailTemplatesPage })));
const AdminAnnouncementsPage = lazyPage(() => import('./pages/admin/announcements').then(m => ({ default: m.AdminAnnouncementsPage })));
const AdminLogsPage = lazyPage(() => import('./pages/admin/logs').then(m => ({ default: m.AdminLogsPage })));
const AdminRolesPage = lazyPage(() => import('./pages/admin/roles').then(m => ({ default: m.AdminRolesPage })));
const AdminDepartmentsPage = lazyPage(() => import('./pages/admin/departments').then(m => ({ default: m.AdminDepartmentsPage })));
const AdminTasksPage = lazyPage(() => import('./pages/admin/tasks').then(m => ({ default: m.AdminTasksPage })));
const AdminMenusPage = lazyPage(() => import('./pages/admin/menus').then(m => ({ default: m.AdminMenusPage })));
const AdminAccessTokensPage = lazyPage(() => import('./pages/admin/access-tokens').then(m => ({ default: m.AdminAccessTokensPage })));
const AdminPostsPage = lazyPage(() => import('./pages/admin/posts').then(m => ({ default: m.AdminPostsPage })));
const AdminDictionariesPage = lazyPage(() => import('./pages/admin/dictionaries').then(m => ({ default: m.AdminDictionariesPage })));
const AdminMonitorPage = lazyPage(() => import('./pages/monitor').then(m => ({ default: m.AdminMonitorPage })));
const AdminMonitorServicesPage = lazyPage(() => import('./pages/monitor').then(m => ({ default: m.AdminMonitorServicesPage })));
const AdminMonitorResourcesPage = lazyPage(() => import('./pages/monitor').then(m => ({ default: m.AdminMonitorResourcesPage })));
const AdminMonitorEventsPage = lazyPage(() => import('./pages/monitor').then(m => ({ default: m.AdminMonitorEventsPage })));
const AdminAiAccessPage = lazyPage(() => import('./pages/admin/ai/access').then(m => ({ default: m.AdminAiAccessPage })));
const AdminAiCallsPage = lazyPage(() => import('./pages/admin/ai/calls').then(m => ({ default: m.AdminAiCallsPage })));
const AdminAiOauthPage = lazyPage(() => import('./pages/admin/ai/oauth').then(m => ({ default: m.AdminAiOauthPage })));
const AdminAiToolsPage = lazyPage(() => import('./pages/admin/ai/tools').then(m => ({ default: m.AdminAiToolsPage })));

export function AdministrationPage(props: PageProps) {
  useLocale();
  if (!props.client.web) return null;
  return <Suspense fallback={<PageLoader />}>{renderAdminPage(props)}</Suspense>;
}

function renderAdminPage(props: PageProps) {
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
    case 'ai-access': return <AdminAiAccessPage {...props} />;
    case 'ai-tools': return <AdminAiToolsPage {...props} />;
    case 'ai-calls': return <AdminAiCallsPage {...props} />;
    case 'ai-oauth': return <AdminAiOauthPage {...props} />;
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

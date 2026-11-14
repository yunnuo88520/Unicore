// Author: yunnuo <ymz@ebox.vip>
// Description: Code-based TanStack Router tree shared by the user and administrator entries.
// Access gating stays in the shell (bootstrap-driven); the router owns URL semantics and history.
import { Suspense, Component, createContext, lazy, useContext, useMemo, type ReactNode } from 'react';
import { createRootRoute, createRoute, createRouter, redirect, useRouterState, useSearch, Outlet, createBrowserHistory, createHashHistory, type AnyRoute, type RouterHistory } from '@tanstack/react-router';
import type { AppClient, Bootstrap } from '@unicore/sdk';
import { routes, type Page } from './routes';
import type { DashboardWidgetRegistry } from './registry';
import type { Theme } from '@unicore/theme';
import { NotFoundPage } from './pages/not-found';
import { ServerErrorPage } from './pages/error';

export type PageProps = { page: Page; client: AppClient; metadata: Bootstrap; registry: DashboardWidgetRegistry; theme: Theme; setTheme: (theme: Theme) => void; refresh: () => void };
export type PageComponent = (props: PageProps) => ReactNode;

type ShellOptions = { client: AppClient; registry: DashboardWidgetRegistry; administratorPage?: PageComponent };
const ShellOptionsContext = createContext<ShellOptions | null>(null);
const NoticeContext = createContext<string>('');
const PagePropsContext = createContext<PageProps | null>(null);

export function ShellOptionsProvider({ value, children }: { value: ShellOptions; children: ReactNode }) {
  return <ShellOptionsContext.Provider value={value}>{children}</ShellOptionsContext.Provider>;
}
export function NoticeProvider({ value, children }: { value: string; children: ReactNode }) {
  return <NoticeContext.Provider value={value}>{children}</NoticeContext.Provider>;
}
export function PagePropsProvider({ value, children }: { value: PageProps; children: ReactNode }) {
  return <PagePropsContext.Provider value={value}>{children}</PagePropsContext.Provider>;
}
export function useShellOptions(): ShellOptions {
  const options = useContext(ShellOptionsContext);
  if (!options) throw new Error('workspace shell is missing its client options');
  return options;
}
export function useSessionNotice(): string {
  return useContext(NoticeContext);
}
export function usePageProps(): PageProps {
  const props = useContext(PagePropsContext);
  if (!props) throw new Error('workspace pages require the shell provider');
  return props;
}

/** Search params of the nearest matched route, validated by the route definitions. */
export function useRouteSearch<T extends Record<string, string>>(): Partial<T> {
  return useSearch({ strict: false }) as Partial<T>;
}

const lazyCache = new Map<() => Promise<{ default: PageComponent }>, React.ComponentType<PageProps>>();
function pageComponent(loader: () => Promise<{ default: PageComponent }>): React.ComponentType<PageProps> {
  const cached = lazyCache.get(loader);
  if (cached) return cached;
  const component = lazy(loader);
  lazyCache.set(loader, component);
  return component;
}

function PageFallback() {
  return <div className="flex items-center justify-center py-16 text-sm text-muted" role="status">Loading…</div>;
}

/** Page render failures surface the standalone 500 status page instead of a broken route. */
class PageErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  render() { return this.state.error ? <ServerErrorPage /> : this.props.children; }
}

/** A route body that swaps in the administrator implementation for matching realms. */
function frame(userLoader: () => Promise<{ default: PageComponent }>, adminEligible = false) {
  function Frame() {
    const props = usePageProps();
    const { administratorPage } = useShellOptions();
    const administration = props.metadata.identity_realm === 'administrator';
    if (administration && adminEligible && administratorPage) return <PageErrorBoundary>{administratorPage(props)}</PageErrorBoundary>;
    const Component = pageComponent(userLoader);
    return <Suspense fallback={<PageFallback />}><PageErrorBoundary><Component {...props} /></PageErrorBoundary></Suspense>;
  }
  return Frame;
}

export function createWorkspaceRouter(options: { history: () => RouterHistory; basepath?: string; shell: () => ReactNode }): RouterLike {
  const rootRoute = createRootRoute({ component: options.shell, notFoundComponent: NotFoundPage });
  // Route helpers erase per-route generics; the tree is assembled dynamically so runtime wiring stays authoritative.
  function pageRoute(path: string, loader: () => Promise<{ default: PageComponent }>, routeOptions?: { adminEligible?: boolean; search?: Record<string, unknown> }): AnyRoute {
    return createRoute({
      getParentRoute: () => rootRoute,
      path,
      validateSearch: routeOptions?.search as never,
      component: frame(loader, routeOptions?.adminEligible),
    }) as unknown as AnyRoute;
  }
  const tree = rootRoute.addChildren([
    pageRoute('/', () => import('./pages/overview').then(module => ({ default: module.OverviewPage })), { search: { oidc: '' } }),
    pageRoute('/home', () => import('./pages/home').then(module => ({ default: module.HomePage }))),
    pageRoute('/install', () => import('./pages/install').then(module => ({ default: module.InstallPage }))),
    pageRoute('/login', () => import('./pages/auth').then(module => ({ default: module.LoginPage })), { search: { oidc: '', state: '' } }),
    pageRoute('/register', () => import('./pages/auth').then(module => ({ default: module.LoginPage }))),
    pageRoute('/forgot-password', () => import('./pages/auth').then(module => ({ default: module.LoginPage }))),
    pageRoute('/email-login', () => import('./pages/auth').then(module => ({ default: module.LoginPage }))),
    pageRoute('/resend-verification', () => import('./pages/auth').then(module => ({ default: module.LoginPage }))),
    pageRoute('/registration-success', () => import('./pages/auth').then(module => ({ default: module.LoginPage }))),
    pageRoute('/verify-email', () => import('./pages/auth').then(module => ({ default: module.VerifyEmailPage })), { search: { token: '' } }),
    pageRoute('/reset-password', () => import('./pages/auth').then(module => ({ default: module.ResetPasswordPage })), { search: { token: '' } }),
    pageRoute('/notes', () => import('./modules/notes/notes').then(module => ({ default: module.NotesPage }))),
    pageRoute('/access-tokens', () => import('./pages/admin/access-tokens').then(module => ({ default: module.AdminAccessTokensPage })), { adminEligible: true }),
    pageRoute('/site', () => import('./pages/appearance').then(module => ({ default: module.AdminMailSettingsPage })), { adminEligible: true, search: { tab: '' } }),
    pageRoute('/account-policy', () => import('./pages/appearance').then(module => ({ default: module.AdminMailSettingsPage })), { adminEligible: true }),
    pageRoute('/mail', () => import('./pages/appearance').then(module => ({ default: module.AdminMailSettingsPage })), { adminEligible: true }),
    pageRoute('/users', () => import('./pages/admin/users').then(module => ({ default: module.AdminUsersPage })), { adminEligible: true }),
    pageRoute('/administrators', () => import('./pages/admin/users').then(module => ({ default: module.AdminAdministratorsPage })), { adminEligible: true }),
    pageRoute('/roles', () => import('./pages/admin/roles').then(module => ({ default: module.AdminRolesPage })), { adminEligible: true }),
    pageRoute('/posts', () => import('./pages/admin/posts').then(module => ({ default: module.AdminPostsPage })), { adminEligible: true }),
    pageRoute('/departments', () => import('./pages/admin/departments').then(module => ({ default: module.AdminDepartmentsPage })), { adminEligible: true }),
    pageRoute('/menus', () => import('./pages/admin/menus').then(module => ({ default: module.AdminMenusPage })), { adminEligible: true }),
    pageRoute('/dictionaries', () => import('./pages/admin/dictionaries').then(module => ({ default: module.AdminDictionariesPage })), { adminEligible: true }),
    pageRoute('/notification-channels', () => import('./pages/admin/notifications').then(module => ({ default: module.AdminNotificationsPage })), { adminEligible: true }),
    pageRoute('/notification-templates', () => import('./pages/admin/notifications').then(module => ({ default: module.AdminNotificationsPage })), { adminEligible: true }),
    pageRoute('/system-notifications', () => import('./pages/admin/notifications').then(module => ({ default: module.AdminNotificationsPage })), { adminEligible: true }),
    pageRoute('/mail-templates', () => import('./pages/admin/mail-templates').then(module => ({ default: module.AdminMailTemplatesPage })), { adminEligible: true }),
    pageRoute('/announcements', () => import('./pages/admin/announcements').then(module => ({ default: module.AdminAnnouncementsPage })), { adminEligible: true }),
    pageRoute('/storage', () => import('./pages/admin/storage').then(module => ({ default: module.AdminStoragePage })), { adminEligible: true, search: { provider: '', tab: 'config' } }),
    pageRoute('/logs', () => import('./pages/admin/logs').then(module => ({ default: module.AdminLogsPage })), { adminEligible: true }),
    pageRoute('/tasks', () => import('./pages/admin/tasks').then(module => ({ default: module.AdminTasksPage })), { adminEligible: true }),
    pageRoute('/monitor', () => import('./pages/monitor').then(module => ({ default: module.MonitorPage })), { adminEligible: true }),
    pageRoute('/monitor-services', () => import('./pages/monitor').then(module => ({ default: module.AdminMonitorServicesPage })), { adminEligible: true }),
    pageRoute('/monitor-resources', () => import('./pages/monitor').then(module => ({ default: module.AdminMonitorResourcesPage })), { adminEligible: true }),
    pageRoute('/monitor-events', () => import('./pages/monitor').then(module => ({ default: module.AdminMonitorEventsPage })), { adminEligible: true }),
    pageRoute('/api-docs', () => import('./pages/api-docs').then(module => ({ default: module.ApiDocsPage }))),
    ...(import.meta.env.DEV && !import.meta.env.VITEST ? [pageRoute('/ui-preview', () => import('./pages/ui-preview').then(module => ({ default: module.UiPreviewPage })))] : []),
    pageRoute('/edition', () => import('./pages/edition').then(module => ({ default: module.UserEditionPage })), { adminEligible: true }),
    createRoute({ getParentRoute: () => rootRoute, path: '/settings', beforeLoad: () => { throw redirect({ to: '/site', replace: true }); } }) as unknown as AnyRoute,
  ] as [AnyRoute, ...AnyRoute[]]);
  return createRouter({ routeTree: tree, history: options.history(), basepath: options.basepath || '/', defaultPreload: false, defaultErrorComponent: ServerErrorPage });
}

type RouterLike = ReturnType<typeof createRouter>;

/** Map a router pathname back to the page key used by navigation and permission checks.
 *  location.pathname is already basepath-stripped by the router; do not strip a prefix again here
 *  (an admin entry at /admin would otherwise corrupt the /administrators page key). */
export function pageFromPath(pathname: string): Page {
  const rest = pathname;
  const path = rest.replace(/^\//, '').split('?')[0];
  if (!path || path === 'install' || path === 'login' || path === 'verify-email' || path === 'reset-password') return 'overview';
  if (path === 'settings') return 'site';
  return (Object.hasOwn(routes, path) ? path : 'not-found') as Page;
}

/** Current page key derived from router state. */
export function useCurrentPage(): Page {
  const pathname = useRouterState({ select: state => state.location.pathname });
  return useMemo(() => pageFromPath(pathname), [pathname]);
}

export { useRouterState, Outlet, createBrowserHistory, createHashHistory };

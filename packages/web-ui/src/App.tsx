/** Author: yunnuo <ymz@ebox.vip>
 * Description: Shared responsive workspace shell on TanStack Router. All business calls use AppClient.
 */
import { useQuery } from '@tanstack/react-query';
import { AnnouncementCenter } from './announcement-center';
import { ClientControls } from './client-controls';
import { VersionBadge, workspaceLinks } from './shell-tools';
import { useLocale, t } from './i18n';
import { productName } from './product.gen';
import { WorkspaceLayout } from './workspace-layout';
import { Breadcrumb, BreadcrumbItem, BreadcrumbSeparator, MessageProvider, PageHeader } from '@unicore/ui';
import { SiteFooter } from './site-footer';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { RouterProvider, Outlet, Navigate, createBrowserHistory, useRouter, useRouterState, type RouterHistory } from '@tanstack/react-router';
import { ChevronRight, ChevronsUpDown, ExternalLink, FlaskConical, Menu, PanelLeftClose, PanelLeftOpen, Radio, RotateCcw, Settings2, ShieldCheck, UserRound } from 'lucide-react';
import { buildNavigation, isLinkEntry, routePath, type NavEntry } from './navigation';
import { NavigationTree } from './navigation-view';
import { BrandProvider, BrandMark } from './brand';
import type { AppClient, Bootstrap } from '@unicore/sdk';
import { AppError } from '@unicore/sdk';
import { setCustomAccent, useTheme, type Theme } from '@unicore/theme';
import { DashboardWidgetRegistry } from './registry';
import { PasswordDialog } from './password-dialog';
import { roleDisplayLabels } from './role-display';
import { UserAvatar, displayLabel } from './user-avatar';
import { SessionBoundary, useSession } from './session';
import { routes, canAccess, isAdminRealm, isAdministrator, type Page } from './routes';
import { LiveLogsButton } from './live-logs';
import { Modal, Button, DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, Tooltip } from '@unicore/ui';
import { setPreferences, usePreferences } from '@unicore/theme/preferences';
import {
  createWorkspaceRouter, pageFromPath, PagePropsProvider, ShellOptionsProvider, NoticeProvider,
  useShellOptions, useSessionNotice, usePageProps, type PageProps, type PageComponent,
} from './router';
import { ErrorPage } from './pages/error';
import { InstallPage } from './pages/install';
import { HomePage } from './pages/home';
import { LoginPage, VerifyEmailPage, ResetPasswordPage } from './pages/auth';
import { NotFoundPage } from './pages/not-found';
import { ForbiddenPage } from './pages/forbidden';

export { DashboardWidgetRegistry } from './registry';
export type { PageProps, PageComponent } from './router';

export type WorkspaceProps = {
  client: AppClient;
  registry?: DashboardWidgetRegistry;
  administratorPage?: PageComponent;
  history?: () => RouterHistory;
  basepath?: string;
};

export function Workspace({ client, registry, administratorPage, history, basepath }: WorkspaceProps) {
  useLocale();
  const dashboard = useMemo(() => {
    const widgets = new DashboardWidgetRegistry();
    for (const widget of registry?.entries() ?? []) widgets.register(widget);
    return widgets;
  }, [client, registry]);
  return <MessageProvider>
    <SessionBoundary client={client}>
      {notice => <BrandedApp client={client} registry={dashboard} notice={t(notice)} administratorPage={administratorPage} history={history} basepath={basepath} />}
    </SessionBoundary>
  </MessageProvider>;
}

function BrandedApp({ client, registry, notice, administratorPage, history, basepath }: Omit<WorkspaceProps, 'registry'> & { registry: DashboardWidgetRegistry; notice: string }) {
  useLocale();
  const { metadata } = useSession(client);
  const accent = metadata.data?.branding?.accent;
  useEffect(() => { setCustomAccent(accent ?? ''); }, [accent]);
  const [router] = useState(() => createWorkspaceRouter({ history: history ?? createBrowserHistory, basepath, shell: WorkspaceShell }));
  return <ShellOptionsProvider value={{ client, registry, administratorPage }}>
    <NoticeProvider value={notice}>
      <BrandProvider branding={metadata.data?.branding} name={metadata.data?.site_name}>
        <RouterProvider router={router} />
      </BrandProvider>
    </NoticeProvider>
  </ShellOptionsProvider>;
}

// These routes compose their own PageHeader with primary actions. All others
// receive the route label here, including module pages and loading/error states.
// Explicit ownership avoids querying rendered DOM and keeps navigation stable.
const pageHeadingOwners = new Set<string>([
  'users', 'administrators', 'roles', 'departments', 'announcements', 'posts',
  'tasks', 'menus', 'account-tokens', 'access-tokens', 'account', 'account-sessions',
  'monitor', 'monitor-services', 'monitor-resources', 'monitor-events', 'ui-preview', 'not-found',
]);

/** The root route component: gates, chrome and the page outlet. Server authorization remains authoritative. */
function WorkspaceShell() {
  useLocale();
  const router = useRouter();
  const { client, registry } = useShellOptions();
  const notice = useSessionNotice();
  const { metadata } = useSession(client);
  const [theme, setTheme] = useTheme();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [about, setAbout] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const { navCollapsed, layout } = usePreferences();
  const pathname = useRouterState({ select: state => state.location.pathname });
  // location.pathname is already basepath-stripped by the router.
  const page = pageFromPath(pathname);
  const data = metadata.data;
  const basename = pathname.replace(/^\//, '').split('?')[0];

  const locale = useLocale();
  useEffect(() => { if (data) document.title = t('{{v0}} · 工作空间', { v0: data.site_name }); }, [data?.site_name, locale]);
  useEffect(()=>{if(data?.mfa_enrollment_required && page!=='account-security') void router.navigate({to:'/account-security',replace:true});},[data?.mfa_enrollment_required,page,router]);

  if (!data) {
    // Boot failures share the status-page family; the code mirrors the real HTTP status whenever the transport captured one.
    if (metadata.isError) {
      const status = metadata.error instanceof AppError && metadata.error.code === 'HTTP_ERROR'
        ? metadata.error.message.match(/\((\d{3})\)/)?.[1] ?? '503'
        : '503';
      return <ErrorPage standalone code={status} title={t('暂时无法连接核心')} detail={t(metadata.error.message)}>
        <Button onClick={() => void metadata.refetch()}><RotateCcw size={15} aria-hidden="true" />{t('重新连接')}</Button>
      </ErrorPage>;
    }
    return <div className="flex min-h-dvh items-center justify-center bg-background p-6">
      <div className="flex items-center gap-2 text-sm text-muted" role="status">{t('正在连接 Go 核心')}</div>
    </div>;
  }

  if (data.capabilities.installation && !data.installed && client.web) {
    const props: PageProps = { page: 'overview', client, metadata: data, registry, theme, setTheme, refresh: () => void metadata.refetch() };
    return <PagePropsProvider value={props}>
      <div className="flex min-h-dvh flex-col bg-background">
        <div className="fixed top-[15px] end-[20px] z-[45] rounded-lg border border-line bg-surface px-2 py-[5px] shadow-tint"><ClientControls /></div>
        <InstallPage {...props} />
        <SiteFooter metadata={data} compact />
      </div>
    </PagePropsProvider>;
  }
  if (data.maintenance_enabled && data.identity_realm !== 'administrator') {
    return <main className="min-h-dvh bg-background">
      <div className="fixed top-[15px] end-[20px] z-[45] rounded-lg border border-line bg-surface px-2 py-[5px] shadow-tint"><ClientControls /></div>
      <ErrorPage standalone code="503" title={t('站点维护中')} detail={<>{t('站点暂时不可用，我们会尽快恢复。')}{data.maintenance_message ? <span className="block whitespace-pre-wrap break-words">{data.maintenance_message}</span> : null}</>}>
        <Button variant="secondary" onClick={() => void metadata.refetch()}><RotateCcw size={15} aria-hidden="true" />{t('重新检查')}</Button>
      </ErrorPage>
    </main>;
  }
  // Unknown paths render as a standalone 404 for every visitor, before any auth gating.
  // /home and the auth flows are not registered page keys either, so only truly unknown paths qualify.
  const knownPath = !basename || basename === 'home' || Object.hasOwn(routes, basename)
    || ['login', 'register', 'forgot-password', 'email-login', 'resend-verification', 'registration-success'].includes(basename);
  if (page === 'not-found' && !knownPath) {
    return <main className="min-h-dvh bg-background"><NotFoundPage /></main>;
  }
  // A local workspace exposes only its own pages, including direct URLs.
  // Absent capabilities are unknown pages rather than platform permission prompts.
  if (data.profile !== 'web-platform' && (
    (Object.hasOwn(routes, basename) && !canAccess(page, data)) ||
    ['home', 'login', 'register', 'forgot-password', 'email-login', 'resend-verification', 'registration-success', 'verify-email', 'reset-password'].includes(basename)
  )) return <main className="min-h-dvh bg-background"><NotFoundPage /></main>;
  if (page === 'api-docs') {
    const props: PageProps = { page, client, metadata: data, registry, theme, setTheme, refresh: () => void metadata.refetch() };
    return <PagePropsProvider value={props}><main className="min-h-dvh bg-background p-4 sm:p-6"><div className="mb-4 flex justify-end"><ClientControls /></div><Outlet /></main></PagePropsProvider>;
  }
  // The public homepage owns /home; the console stays at /. Members skip the homepage, admin realm keeps its own login.
  const publicHome = data.identity_realm !== 'administrator';
  if (data.capabilities.authentication && data.current_user && basename === 'home') {
    return <Navigate to="/" replace />;
  }
  if (data.capabilities.authentication && (!data.current_user || /^(verify-email|reset-password)$/.test(basename)) && client.web) {
    const props: PageProps = { page: 'overview', client, metadata: data, registry, theme, setTheme, refresh: () => void metadata.refetch() };
    // Optional public homepage: guests land on it at /home instead of the login flow when site.home_enabled is on.
    if (!data.current_user && publicHome && data.home_enabled && (basename === 'home' || !basename)) {
      if (!basename) return <Navigate to="/home" replace />;
      return <PagePropsProvider value={props}>
        <div className="flex min-h-dvh flex-col bg-background">
          <HomePage {...props} />
        </div>
      </PagePropsProvider>;
    }
    // Guests get the real 404 page for unregistered paths instead of a misleading login form;
    // registered pages (workspace and auth ones) keep the login wall. knownPath is shared with the standalone 404 gate above.
    const Flow = basename === 'verify-email' ? VerifyEmailPage : basename === 'reset-password' ? ResetPasswordPage : !data.current_user && !knownPath ? NotFoundPage : LoginPage;
    return <PagePropsProvider value={props}>
      <div className="flex min-h-dvh flex-col bg-background">
        <div className="flex flex-1 items-center justify-center px-4 py-8 sm:px-6 lg:py-12">
          <div className="relative w-full max-w-[1200px] overflow-hidden rounded-3xl border border-line bg-surface shadow-card">
            <div className="absolute end-4 top-4 z-[45]"><ClientControls /></div>
            <Flow {...props} />
          </div>
        </div>
        <SiteFooter metadata={data} compact />
      </div>
    </PagePropsProvider>;
  }

  const administration = data.identity_realm === 'administrator';
  const settingsLabel = t('基础设置');
  const enrollment = !!data.mfa_enrollment_required;
  const permitted = canAccess(page, data);
  const refresh = () => { void metadata.refetch(); void router.invalidate(); };
  // Permission denials render as a standalone status page without shell chrome, like the shared error routes.
  if (!permitted) {
    return <main className="min-h-dvh bg-background">{data.profile === 'web-platform' ? <ForbiddenPage /> : <NotFoundPage />}</main>;
  }
  const props: PageProps = { page, client, metadata: data, registry, theme, setTheme, refresh };
  return <PagePropsProvider value={props}>
    <WorkspaceLayout
      navigationOpen={mobileOpen}
      onNavigationClose={() => setMobileOpen(false)}
      contentClassName={page === 'site' ? 'settings-content' : ''}
      navigationCollapsed={navCollapsed}
      navigation={<SideNavigation page={page} data={data} client={client} onNavigate={() => setMobileOpen(false)} onAbout={() => { setMobileOpen(false); setAbout(true); }} administration={administration} onOpenPassword={() => setPasswordOpen(true)} refresh={refresh} />}
      header={<TopBar page={page} data={data} client={client} settingsLabel={settingsLabel} connection={metadata.isSuccess ? 'connected' : metadata.isPending ? 'pending' : 'error'} mobileOpen={mobileOpen} onOpenMobile={() => setMobileOpen(true)} onOpenPassword={() => setPasswordOpen(true)} refresh={refresh} navCollapsed={navCollapsed} navToggleVisible={layout !== 'full'} />}
      overlays={<>
        {passwordOpen && client.web && <PasswordDialog web={client.web} onClose={() => setPasswordOpen(false)} />}
        {about && <About onClose={() => setAbout(false)} />}
      </>}
    >
      {enrollment && <p role="alert" className="mb-4 rounded-lg border border-line bg-primary-soft p-4 text-sm text-ink">{t('实例要求启用双重验证，请先完成安全设置。')}</p>}
      {metadata.isPending
        ? <StateCard tone="pending" icon={<Radio size={24} className="animate-pulse text-accent" />} title={t('正在连接 Go 核心')} detail={t('正在获取当前运行形态与能力信息…')} />
        : metadata.isError
          ? <StateCard tone="error" icon={<Radio size={26} className="text-danger" />} title={t('暂时无法连接核心')} detail={t(metadata.error.message)}
              action={<Button onClick={() => void metadata.refetch()}><RotateCcw size={15} />{t('重新连接')}</Button>} />
          : enrollment && page!=='account-security' ? <StateCard tone="pending" icon={<ShieldCheck size={24}/>} title={t('正在打开安全设置')} detail={t('实例要求启用双重验证，请先完成安全设置。')}/>
          : <div className="flex min-w-0 flex-col gap-6">
              {!pageHeadingOwners.has(page) && <PageHeader title={t(routes[page].label)} />}
              <Outlet />
            </div>}
      <SiteFooter metadata={data} />
    </WorkspaceLayout>
  </PagePropsProvider>;
}

function SideNavigation({ page, data, client, onNavigate, onAbout, administration, onOpenPassword, refresh }: {
  page: Page; data: Bootstrap; client: AppClient; onNavigate: () => void; onAbout: () => void;
  administration: boolean; onOpenPassword: () => void; refresh: () => void;
}) {
  useLocale();
  const router = useRouter();
  const { navCollapsed, layout } = usePreferences();
  const desktop = useMinWidth(768);
  const rail = navCollapsed && desktop && layout !== 'full';
  function goPage(next: Page) { onNavigate(); void router.navigate({ to: routePath(next) }); }
  function activate(node: NavEntry) {
    if (node.disabled || node.type === 'directory') return;
    onNavigate();
    if (isLinkEntry(node)) {
      if (node.openMode === 'new_tab') window.open(node.url.startsWith('/') ? router.buildLocation({ to: node.url }).href : node.url, '_blank', 'noopener,noreferrer');
      else if (node.url.startsWith('/')) void router.navigate({ to: node.url });
      else window.location.assign(node.url);
    } else if (node.routeId) {
      if (node.openMode === 'new_tab') window.open(router.buildLocation({ to: routePath(node.routeId) }).href, '_blank', 'noopener,noreferrer');
      else goPage(node.routeId);
    }
  }
  return <>
    {rail ? <div className="flex flex-col items-center pb-2">
      <a href="/" aria-label={data.site_name} className="flex size-8 items-center justify-center" onClick={event => { event.preventDefault(); goPage('overview'); }}>
        <BrandMark size={24} />
      </a>
    </div> : <div className="pb-2">
      {/* Brand header: mark on the left, site name and version capsule stacked on the right. */}
      <div className="flex items-center gap-2.5 pt-1">
        <span className="brand contents"><BrandMark size={36} /></span>
        <div className="min-w-0 flex-1">
          <a href="/" aria-label={data.site_name} className="block truncate text-xl font-bold text-ink" onClick={event => { event.preventDefault(); goPage('overview'); }}>{data.site_name}<span className="brand-dot">.</span></a>
          {data.version && <div className="mt-0.5"><VersionBadge client={client} metadata={data} onOpen={() => goPage('edition')} /></div>}
        </div>
      </div>
    </div>}
    <NavigationTree navigation={buildNavigation(data)} page={page} rail={rail} onNavigate={activate} />
    {data.current_user && <div className="sidebar-utilities shrink-0 px-1 pb-3 pt-2">
      <SidebarFooter data={data} client={client} administration={administration} rail={rail} onOpenPassword={onOpenPassword} refresh={refresh} onAbout={onAbout} />
    </div>}
  </>;
}

/** Sidebar footer for signed-in platform accounts. */
function SidebarFooter({ data, client, administration, rail, onOpenPassword, refresh, onAbout }: {
  data: Bootstrap; client: AppClient; administration: boolean; rail: boolean; onOpenPassword: () => void; refresh: () => void; onAbout: () => void;
}) {
  useLocale();
  const router = useRouter();
  const user = data.current_user;
  const profile = useQuery({ queryKey: ['account-profile'], queryFn: () => client.web!.accountProfile(), enabled: data.profile === 'web-platform' && !!user && !!client.web && !data.mfa_enrollment_required, staleTime: 60_000 });
  if (!user) return null;
  const trigger = rail
    ? <button type="button" className="mx-auto flex size-8 items-center justify-center rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-focus" aria-label={t('侧栏账号菜单')}>
        <UserAvatar name={displayLabel(user.display_name, user.username)} url={profile.data?.avatar_url} />
      </button>
    : <button type="button" className="flex w-full items-center gap-2.5 rounded-lg p-2 text-start outline-none hover:bg-surface-alt focus-visible:ring-2 focus-visible:ring-focus" aria-label={t('侧栏账号菜单')}>
        <UserAvatar name={displayLabel(user.display_name, user.username)} url={profile.data?.avatar_url} />
        <span className="min-w-0 flex-1">
          <strong className="block truncate text-sm font-semibold leading-tight text-ink">{displayLabel(user.display_name, user.username) || data.site_name}</strong>
          <small className="block truncate text-xs leading-tight text-muted">{user.email || roleDisplayLabels(user.roles, user.role_names).join(', ')}</small>
        </span>
        <ChevronsUpDown size={16} className="ms-auto shrink-0 text-subtle" aria-hidden="true" />
      </button>;
  return <DropdownMenu>
    <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
    <DropdownMenuContent side="right" align={rail ? 'start' : 'end'} aria-label={t('侧栏账号菜单')} className="min-w-56">
      <DropdownMenuLabel>
        <strong className="block text-sm text-ink">{displayLabel(user.display_name, user.username) || data.site_name}</strong>
        <small className="block truncate text-xs text-muted">{user.email || roleDisplayLabels(user.roles, user.role_names).join(', ')}</small>
      </DropdownMenuLabel>
      {client.web && <>
        {data.admin_path && !administration && <DropdownMenuItem onSelect={() => window.location.assign(data.admin_path!)}>{t('管理工作台')}</DropdownMenuItem>}
        {administration && <DropdownMenuItem onSelect={() => window.location.assign('/')}>{t('工作空间')}</DropdownMenuItem>}
        <DropdownMenuItem onSelect={onOpenPassword}>{t('修改密码')}</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => void router.navigate({ to: '/account' })}>{t('个人中心')}</DropdownMenuItem>
        <DropdownMenuItem onSelect={onAbout}>{t('关于 {{name}}', { name: productName })}</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => { void client.web!.logout().then(() => { void router.navigate({ to: '/' }); refresh(); }, refresh); }}>{t('退出登录')}</DropdownMenuItem>
      </>}
    </DropdownMenuContent>
  </DropdownMenu>;
}

function useMinWidth(px: number) {
  const [match, setMatch] = useState(() => window.matchMedia(`(min-width: ${px}px)`).matches);
  useEffect(() => {
    const media = window.matchMedia(`(min-width: ${px}px)`);
    const update = () => setMatch(media.matches);
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, [px]);
  return match;
}

function TopBar({ page, data, client, settingsLabel, connection, mobileOpen, onOpenMobile, onOpenPassword, refresh, navCollapsed, navToggleVisible }: {
  page: Page; data: Bootstrap; client: AppClient; settingsLabel: string; connection: 'connected' | 'pending' | 'error';
  mobileOpen: boolean; onOpenMobile: () => void; onOpenPassword: () => void; refresh: () => void; navCollapsed: boolean; navToggleVisible: boolean;
}) {
  useLocale();
  const router = useRouter();
  const desktop = useMinWidth(768);
  // The account menu labels the identity realm, not the super_admin grant.
  const administration = isAdminRealm(data);
  const user = data.current_user;
  const profile = useQuery({ queryKey: ['account-profile'], queryFn: () => client.web!.accountProfile(), enabled: data.profile === 'web-platform' && !!user && !!client.web && !data.mfa_enrollment_required, staleTime: 60_000 });
  return <>
    <div className="flex min-w-0 items-center gap-2 text-[length:var(--font-11)] text-muted max-md:gap-1.5">
      {desktop && navToggleVisible
        ? <>
            <Tooltip label={navCollapsed ? t('展开导航') : t('收起导航')}>
              <button className="flex size-7 items-center justify-center rounded-md border border-line bg-surface text-muted transition-colors hover:bg-primary-soft hover:text-accent" aria-label={navCollapsed ? t('展开导航') : t('收起导航')} aria-expanded={!navCollapsed} aria-controls="workspace-navigation" onClick={() => setPreferences({ navCollapsed: !navCollapsed })}>
                {navCollapsed ? <PanelLeftOpen size={16} aria-hidden="true" /> : <PanelLeftClose size={16} aria-hidden="true" />}
              </button>
            </Tooltip>
            <span className="hidden h-6 w-px bg-line sm:block" aria-hidden="true" />
          </>
        : <button className="mobile-menu size-7 items-center justify-center rounded-md text-muted hover:bg-primary-soft hover:text-accent max-md:-ms-1" aria-label={t('打开导航')} aria-expanded={mobileOpen} aria-controls="workspace-navigation" onClick={onOpenMobile}><Menu size={18} /></button>}
      <Breadcrumb>
        <BreadcrumbItem className="hidden max-lg:inline">{t('工作空间')}</BreadcrumbItem>
        <BreadcrumbSeparator className="hidden max-md:block max-lg:hidden" />
        <BreadcrumbItem aria-current="page" className="min-w-0 truncate font-medium text-ink">{page === 'site' ? settingsLabel : t(routes[page].label)}</BreadcrumbItem>
      </Breadcrumb>
    </div>
    <div className="flex shrink-0 items-center gap-2 max-md:gap-1.5">
      <span className="flex items-center gap-1.5 text-[length:var(--font-10)] text-muted max-sm:hidden">
        <span className={`size-[5px] rounded-full ${connection === 'connected' ? 'bg-success shadow-[0_0_0_3px_var(--success-soft)]' : connection === 'pending' ? 'animate-pulse bg-muted' : 'bg-danger'}`} />
        {connection === 'connected' ? t('核心已连接') : connection === 'pending' ? t('连接中') : t('连接失败')}
      </span>
      <span className="mx-1 h-4 w-px bg-line max-sm:hidden" aria-hidden="true" />
      {data.profile === 'web-platform' && data.identity_realm === 'user' && user && client.web && !data.mfa_enrollment_required && <AnnouncementCenter web={client.web} />}
      {isAdministrator(data) && user && client.web && !data.mfa_enrollment_required && <LiveLogsButton web={client.web} />}
      <ClientControls />
      {data.profile === 'web-platform' && user && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex size-7 items-center justify-center overflow-hidden rounded-full" aria-label={t('账号菜单')}>
              <UserAvatar name={displayLabel(user.display_name, user.username)} url={profile.data?.avatar_url} className="size-7 text-[length:var(--font-11)]" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>
              <strong className="block text-sm text-ink">{displayLabel(user.display_name, user.username) || data.site_name}</strong>
              <small className="text-2xs">{roleDisplayLabels(user.roles, user.role_names).join(', ')}</small>
            </DropdownMenuLabel>
            {client.web && <>
              {data.admin_path && !administration && <DropdownMenuItem onSelect={() => window.location.assign(data.admin_path)}>{t('管理工作台')}</DropdownMenuItem>}
              {administration && <DropdownMenuItem onSelect={() => window.location.assign('/')}>{t('工作空间')}</DropdownMenuItem>}
              <DropdownMenuItem onSelect={() => onOpenPassword()}>{t('修改密码')}</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => void router.navigate({ to: '/account' })}>{t('个人中心')}</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => { void client.web!.logout().then(() => { void router.navigate({ to: '/' }); refresh(); }, refresh); }}>{t('退出登录')}</DropdownMenuItem>
            </>}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  </>;
}

function StateCard({ tone, icon, title, detail, action }: { tone: 'pending' | 'error'; icon: ReactNode; title: string; detail: string; action?: ReactNode }) {
  useLocale();
  return <div role={tone === 'error' ? 'alert' : 'status'} className={`state-card flex flex-col items-center gap-2 rounded-xl border bg-surface px-6 py-10 text-center shadow-card ${tone === 'error' ? 'border-danger-line' : 'border-line'}`}>
    {icon}
    <h1 className="text-xl font-semibold tracking-tight text-ink">{t(title)}</h1>
    <p className="max-w-md text-sm text-muted">{t(detail)}</p>
    {action}
  </div>;
}

function About({ onClose }: { onClose: () => void }) {
  useLocale();
  return <Modal title={productName} onClose={onClose} className="flex flex-col items-center gap-3 text-center">
    <BrandMark size={44} />
    <h2 className="text-lg font-semibold text-ink">{productName}</h2>
    <p className="text-sm text-muted">{t('一套 Go Core，一套 React UI。')}<br />{t('为 Web、桌面与命令行构建可复用的应用基座。')}</p>
    <div className="flex flex-wrap justify-center gap-1.5">
      {['Go', 'React', 'TanStack', 'Tailwind', 'Wails v2', 'Cobra'].map(item => <span key={item} className="rounded-full border border-line bg-surface-alt px-2 py-0.5 font-mono text-2xs text-muted">{item}</span>)}
    </div>
    <p className="text-2xs text-subtle">{t('可扩展的业务基座、共享界面与原生桥接。')}<br />{t('完整范围与开发指南请阅读项目文档。')}</p>
    <a className="inline-flex items-center gap-1 text-sm text-accent hover:underline" href={workspaceLinks.documentation} target="_blank" rel="noopener noreferrer">
      {t('开发文档')}<ExternalLink size={13} aria-hidden="true" />
    </a>
  </Modal>;
}

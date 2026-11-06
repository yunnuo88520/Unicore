/** Author: yunnuo <ymz@ebox.vip>
 * Description: Shared responsive workspace shell on TanStack Router. All business calls use AppClient.
 */
import { AnnouncementCenter } from './announcement-center';
import { ClientControls } from './client-controls';
import { SidebarTools, VersionBadge, workspaceLinks } from './shell-tools';
import { useLocale, t } from './i18n';
import { productName } from './product.gen';
import { WorkspaceLayout } from './workspace-layout';
import { MessageProvider } from '@unicore/ui';
import { SiteFooter } from './site-footer';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { RouterProvider, Outlet, Navigate, createBrowserHistory, useRouter, useRouterState, type RouterHistory } from '@tanstack/react-router';
import { Braces, ChevronRight, ExternalLink, FlaskConical, Info, Menu, PanelLeftClose, PanelLeftOpen, Radio, RotateCcw, Settings2, ShieldCheck, UserRound, Users, type LucideIcon } from 'lucide-react';
import { buildNavigation } from './navigation';
import { BrandProvider, BrandMark, BrandLockup } from './brand';
import type { AppClient, Bootstrap } from '@unicore/sdk';
import { setCustomAccent, useTheme, type Theme } from '@unicore/theme';
import { DashboardWidgetRegistry } from './registry';
import { PasswordDialog } from './password-dialog';
import { SessionBoundary, useSession } from './session';
import { routes, canAccess, isAdministrator, type Page } from './routes';
import { Modal, Button, DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, Tooltip } from '@unicore/ui';
import { setPreferences, usePreferences } from '@unicore/theme/preferences';
import {
  createWorkspaceRouter, pageFromPath, PagePropsProvider, ShellOptionsProvider, NoticeProvider,
  useShellOptions, useSessionNotice, usePageProps, type PageProps, type PageComponent,
} from './router';
import { InstallPage } from './pages/install';
import { HomePage } from './pages/home';
import { LoginPage, VerifyEmailPage, ResetPasswordPage } from './pages/auth';
import { NotFoundPage } from './pages/not-found';

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
    return <div className="flex min-h-dvh items-center justify-center bg-background p-6">
      {metadata.isError
        ? <div role="alert" className="flex max-w-md flex-col items-center gap-2 rounded-xl border border-line bg-surface px-6 py-10 text-center shadow-card">
            <Radio size={26} className="text-danger" aria-hidden="true" />
            <strong className="text-md font-semibold text-ink">{t('暂时无法连接核心')}</strong>
            <p className="text-sm text-muted">{t(metadata.error.message)}</p>
            <Button className="mt-2" onClick={() => void metadata.refetch()}><RotateCcw size={15} />{t('重新连接')}</Button>
          </div>
        : <div className="flex items-center gap-2 text-sm text-muted" role="status">{t('正在连接 Go 核心')}</div>}
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
    return <main className="flex min-h-dvh flex-col items-center justify-center gap-5 bg-background px-6 text-center">
      <div className="fixed top-[15px] end-[20px] z-[45] rounded-lg border border-line bg-surface px-2 py-[5px] shadow-tint"><ClientControls /></div>
      <BrandLockup name={data.site_name} />
      <h1 className="text-2xl font-semibold text-ink">{t('站点维护中')}</h1>
      <p className="max-w-xl whitespace-pre-wrap break-words text-sm text-muted">{data.maintenance_message || t('站点维护中，请稍后再试')}</p>
      <Button onClick={() => void metadata.refetch()}>{t('重新检查')}</Button>
      <SiteFooter metadata={data} compact />
    </main>;
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
    // registered pages (workspace and auth ones) keep the login wall.
    const knownPath = !basename || basename === 'home' || Object.hasOwn(routes, basename)
      || ['login', 'register', 'forgot-password', 'email-login', 'resend-verification', 'registration-success'].includes(basename);
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
  const personalSettings = !administration;
  const settingsLabel = personalSettings ? t('外观设置') : t('基础设置');
  const enrollment = !!data.mfa_enrollment_required;
  const permitted = canAccess(page, data);
  const refresh = () => { void metadata.refetch(); void router.invalidate(); };
  const props: PageProps = { page, client, metadata: data, registry, theme, setTheme, refresh };
  return <PagePropsProvider value={props}>
    <WorkspaceLayout
      navigationOpen={mobileOpen}
      onNavigationClose={() => setMobileOpen(false)}
      contentClassName={page === 'site' ? 'settings-content' : ''}
      navigationCollapsed={navCollapsed}
      navigation={<SideNavigation page={page} data={data} client={client} onNavigate={() => setMobileOpen(false)} onAbout={() => { setMobileOpen(false); setAbout(true); }} />}
      header={<TopBar page={page} data={data} client={client} settingsLabel={settingsLabel} connection={metadata.isSuccess ? 'connected' : metadata.isPending ? 'pending' : 'error'} mobileOpen={mobileOpen} onOpenMobile={() => setMobileOpen(true)} onOpenPassword={() => setPasswordOpen(true)} refresh={refresh} navCollapsed={navCollapsed} navToggleVisible={layout !== 'full'} />}
      overlays={<>
        {passwordOpen && client.web && <PasswordDialog web={client.web} onClose={() => setPasswordOpen(false)} />}
        {about && <About onClose={() => setAbout(false)} />}
      </>}
    >
      {enrollment && <p role="alert" className="mb-4 rounded-lg border border-line bg-primary-soft p-4 text-sm text-ink">{t('实例要求启用双重验证，请先完成安全设置。')}</p>}
      <PageHeading page={enrollment ? 'account-security' : page} data={data} personalSettings={personalSettings} settingsLabel={settingsLabel} administration={administration} />
      {metadata.isPending
        ? <StateCard tone="pending" icon={<Radio size={24} className="animate-pulse text-accent" />} title={t('正在连接 Go 核心')} detail={t('正在获取当前运行形态与能力信息…')} />
        : metadata.isError
          ? <StateCard tone="error" icon={<Radio size={26} className="text-danger" />} title={t('暂时无法连接核心')} detail={t(metadata.error.message)}
              action={<Button onClick={() => void metadata.refetch()}><RotateCcw size={15} />{t('重新连接')}</Button>} />
          : enrollment && page!=='account-security' ? <StateCard tone="pending" icon={<ShieldCheck size={24}/>} title={t('正在打开安全设置')} detail={t('实例要求启用双重验证，请先完成安全设置。')}/>
          : !permitted
            ? <StateCard tone="error" icon={<ShieldCheck size={26} className="text-danger" />} title={t('没有访问权限')} detail={t('请联系实例管理员授予相关权限。')} />
            : page === 'not-found' ? <NotFoundPage /> : <Outlet />}
      <SiteFooter metadata={data} />
    </WorkspaceLayout>
  </PagePropsProvider>;
}

function SideNavigation({ page, data, client, onNavigate, onAbout }: {
  page: Page; data: Bootstrap; client: AppClient; onNavigate: () => void; onAbout: () => void;
}) {
  useLocale();
  const router = useRouter();
  const { navCollapsed, layout } = usePreferences();
  const desktop = useMinWidth(768);
  const administration = isAdministrator(data);
  const personalSettings = data.identity_realm !== 'administrator';
  const ROUTE_PATHS: Partial<Record<Page, string>> = { overview: '/' };
  function go(next: Page) { onNavigate(); void router.navigate({ to: ROUTE_PATHS[next] ?? `/${next === 'not-found' ? '' : next}` }); }
  // The navigation model comes from navigation.ts; rail shows top-level entries, groups stay inside their menus.
  const navigation = buildNavigation(data);
  const entries = [...navigation.primary, ...(navigation.files ? [navigation.files] : []), ...navigation.standalone];
  const groupEntries = (id: 'administration' | 'system' | 'personal') => navigation.groups.find(group => group.id === id)?.entries ?? [];
  const userPages = groupEntries('administration').map(item => item.id);
  const personalPages = groupEntries('personal').map(item => item.id);
  const systemPages = groupEntries('system').map(item => item.id);

  if (navCollapsed && desktop && layout !== 'full') return <>
    <div className="flex flex-col items-center pb-2">
      <a className="flex size-10 items-center justify-center" href="/" onClick={event => { event.preventDefault(); go('overview'); }} aria-label={data.site_name}>
        <BrandMark size={30} />
      </a>
    </div>
    <nav aria-label={t('主导航')} className="mt-3 flex min-h-0 flex-1 flex-col items-center gap-1 overflow-y-auto pb-2">
      {entries.map(({ id, icon: Icon, label }) => <Tooltip key={id} label={label}>
        <button className={`nav-rail-item flex size-10 shrink-0 items-center justify-center rounded-lg transition-colors ${page === id ? 'bg-primary-soft text-accent' : 'text-muted hover:bg-surface-alt hover:text-ink'}`} aria-current={page === id ? 'page' : undefined} aria-label={t(label)} onClick={() => go(id)}>
          <Icon size={19} aria-hidden="true" />
        </button>
      </Tooltip>)}
      {administration && userPages.length > 0 && <RailGroup title={t('用户管理')} icon={Users} pages={userPages} page={page} onNavigate={go} />}
      {administration && systemPages.length > 0 && <RailGroup title={t('系统设置')} icon={Settings2} pages={systemPages} page={page} onNavigate={go} />}
      {personalPages.length>0 && <RailGroup title={t('个人中心')} icon={UserRound} pages={personalPages} page={page} onNavigate={go} />}
    </nav>
    <div className="shrink-0 border-t border-line pt-2">
      <Tooltip label={t('关于 {{name}}', { name: productName })}>
        <button className="nav-rail-item mx-auto flex size-10 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-alt hover:text-ink" aria-label={t('关于 {{name}}', { name: productName })} onClick={onAbout}><Info size={17} aria-hidden="true" /></button>
      </Tooltip>
    </div>
  </>;

  return <>
    <div className="px-[7px]">
      <a className={`brand flex gap-[10px] font-extrabold tracking-[-1.1px] text-ink ${data.version
        ? 'items-start [&>:first-child]:mt-1 [&_.brand-name]:min-w-0 [&_.brand-name]:truncate [&_.brand-name]:text-[length:var(--font-25)] [&_.brand-name]:leading-[1.15]'
        : 'items-center text-[length:var(--font-27)]'}`} href="/" onClick={event => { event.preventDefault(); go('overview'); }}>
        <BrandLockup name={data.site_name} />
      </a>
      {!data.version
        ? <span className="mt-1.5 block text-[length:var(--font-8)] font-semibold tracking-[2.5px] text-muted">FRAMEWORK</span>
        : <div className="brand-version mt-1.5 ms-[45px]"><VersionBadge client={client} metadata={data} onOpen={() => go('edition')} /></div>}
    </div>
    <button className="mt-4 mb-5 flex w-full items-center gap-[10px] rounded-[10px] border border-line bg-surface p-[12px] text-start shadow-card transition-colors hover:bg-surface-alt" onClick={onAbout}>
      <span className="flex h-[34px] w-[31px] shrink-0 items-center justify-center rounded-md border border-line bg-surface-alt text-accent"><Braces size={19} aria-hidden="true" /></span>
      <span className="min-w-0"><strong className="block truncate text-[length:var(--font-12)] font-semibold text-ink">{data.site_name ?? productName}</strong><small className="mt-[5px] block text-[length:var(--font-10)] text-muted">{t('应用工作空间')}</small></span>
    </button>
    <div className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto pb-2">
      <nav aria-label={t('工作台')} className="flex flex-col gap-0.5">
        {navigation.primary.map(({ id, icon: Icon, label }) => <NavItem key={id} icon={Icon} active={page === id} label={label} onClick={() => go(id)} />)}
      </nav>
      {navigation.files && <NavItem icon={navigation.files.icon} active={page === 'files'} label={navigation.files.label} onClick={() => go('files')} />}
      {groupEntries('administration').length > 0 && <NavGroup title={t('用户管理')} icon={<Users size={19} />} active={userPages.some(id => id === page)}>
        {groupEntries('administration').map(item => <NavEntry key={item.id} id={item.id} page={page} onNavigate={go} />)}
      </NavGroup>}
      {personalPages.length>0 && <p className="mt-5 mb-1 px-[11px] text-2xs font-semibold tracking-wider text-subtle">{t('系统管理')}</p>}
      {(administration ? groupEntries('system').length > 0 : navigation.standalone.some(item => item.id === 'site')) && (administration
        ? <NavGroup title={t('系统设置')} icon={<Settings2 size={19} />} active={systemPages.some(id => id === page)}>
            {groupEntries('system').map(item => <NavEntry key={item.id} id={item.id} page={page} onNavigate={go} />)}
          </NavGroup>
        : navigation.standalone.filter(item => item.id === 'site').map(item => <NavItem key={item.id} icon={item.icon} active={page === item.id} label={item.label} onClick={() => go(item.id)} />))}
      {personalPages.length>0 && <NavGroup title={t('个人中心')} icon={<UserRound size={19} />} active={personalPages.some(id=>id===page)}>{personalPages.map(id=><NavEntry key={id} id={id} page={page} onNavigate={go}/>)}</NavGroup>}
      {navigation.standalone.filter(item => item.id === 'edition').map(item => <NavItem key={item.id} icon={item.icon} active={page === item.id} label={item.label} onClick={() => go(item.id)} />)}
    </div>
    <div className="shrink-0 pt-[14px]"><SidebarTools onAbout={onAbout} /></div>
  </>;
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

function NavItem({ icon: Icon, label, active, onClick }: { icon: LucideIcon; label: string; active: boolean; onClick: () => void }) {
  useLocale();
  return <button className={`flex min-h-11 w-full items-center gap-[12px] rounded-lg px-[11px] text-start text-sm font-medium transition-colors ${active ? 'bg-primary-soft text-accent' : 'text-muted hover:bg-surface-alt hover:text-ink'}`} aria-current={active ? 'page' : undefined} onClick={onClick}>
    <Icon size={19} aria-hidden="true" /><span className="truncate">{t(label)}</span>{active && <span className="ms-auto size-1.5 shrink-0 rounded-full bg-accent" />}
  </button>;
}

function RailGroup({ title, icon: Icon, pages, page, onNavigate }: { title: string; icon: LucideIcon; pages: readonly Page[]; page: Page; onNavigate: (page: Page) => void }) {
  useLocale();
  const active = pages.includes(page);
  return <DropdownMenu>
    <DropdownMenuTrigger asChild>
      <button className={`nav-rail-item flex size-10 shrink-0 items-center justify-center rounded-lg transition-colors ${active ? 'bg-primary-soft text-accent' : 'text-muted hover:bg-surface-alt hover:text-ink'}`} aria-label={t(title)}>
        <Icon size={19} aria-hidden="true" />
      </button>
    </DropdownMenuTrigger>
    <DropdownMenuContent side="right" align="start" aria-label={t(title)} className="min-w-48">
      <DropdownMenuLabel>{t(title)}</DropdownMenuLabel>
      {pages.map(id => {
        const ChildIcon = routes[id].icon;
        return <DropdownMenuItem key={id} aria-current={page === id ? 'page' : undefined} onSelect={() => onNavigate(id)}>
          <ChildIcon size={16} aria-hidden="true" /><span>{t(routes[id].label)}</span>
        </DropdownMenuItem>;
      })}
    </DropdownMenuContent>
  </DropdownMenu>;
}

function NavGroup({ title, icon, children, active = false }: { title: string; icon: ReactNode; children: ReactNode; active?: boolean }) {
  useLocale();
  const [open, setOpen] = useState(active);
  useEffect(()=>{if(active)setOpen(true);},[active]);
  return <section>
    <button className={`flex min-h-11 w-full items-center gap-[12px] rounded-lg px-[11px] text-start text-sm font-medium transition-colors ${active ? 'text-accent' : open ? 'text-ink' : 'text-muted hover:bg-surface-alt hover:text-ink'}`} aria-expanded={open} onClick={() => setOpen(value => !value)}>
      {icon}<span className="truncate">{t(title)}</span><ChevronRight size={15} className={`ms-auto transition-transform ${open ? 'rotate-90' : ''}`} aria-hidden="true" />
    </button>
    <nav aria-label={t(title)} hidden={!open} className="ms-[18px] flex flex-col gap-0.5 border-s border-line ps-[9px]">{children}</nav>
  </section>;
}

function NavEntry({ id, page, onNavigate }: { id: Page; page: Page; onNavigate: (page: Page) => void }) {
  useLocale();
  const Icon = routes[id].icon;
  return <button className={`flex min-h-10 w-full items-center gap-[10px] rounded-lg px-[10px] text-start text-[length:var(--font-12)] font-medium transition-colors ${page === id ? 'bg-primary-soft text-accent' : 'text-muted hover:bg-surface-alt hover:text-ink'}`} aria-current={page === id ? 'page' : undefined} onClick={() => onNavigate(id)}>
    <Icon size={16} aria-hidden="true" /><span className="truncate">{t(routes[id].label)}</span>{page === id && <span className="ms-auto size-1.5 shrink-0 rounded-full bg-accent" />}
  </button>;
}

function TopBar({ page, data, client, settingsLabel, connection, mobileOpen, onOpenMobile, onOpenPassword, refresh, navCollapsed, navToggleVisible }: {
  page: Page; data: Bootstrap; client: AppClient; settingsLabel: string; connection: 'connected' | 'pending' | 'error';
  mobileOpen: boolean; onOpenMobile: () => void; onOpenPassword: () => void; refresh: () => void; navCollapsed: boolean; navToggleVisible: boolean;
}) {
  useLocale();
  const router = useRouter();
  const desktop = useMinWidth(768);
  const administration = isAdministrator(data);
  const user = data.current_user;
  return <>
    <div className="flex min-w-0 items-center gap-4 text-[length:var(--font-11)] text-muted max-md:gap-1.5">
      {desktop && navToggleVisible
        ? <>
            <Tooltip label={navCollapsed ? t('展开导航') : t('收起导航')}>
              <button className="flex size-8 items-center justify-center rounded-md text-muted transition-colors hover:bg-primary-soft hover:text-accent" aria-label={navCollapsed ? t('展开导航') : t('收起导航')} aria-expanded={!navCollapsed} aria-controls="workspace-navigation" onClick={() => setPreferences({ navCollapsed: !navCollapsed })}>
                {navCollapsed ? <PanelLeftOpen size={19} aria-hidden="true" /> : <PanelLeftClose size={19} aria-hidden="true" />}
              </button>
            </Tooltip>
            <span className="hidden h-[18px] w-px bg-line sm:block" aria-hidden="true" />
          </>
        : <button className="mobile-menu size-8 items-center justify-center rounded-md text-muted hover:bg-primary-soft hover:text-accent max-md:-ms-1" aria-label={t('打开导航')} aria-expanded={mobileOpen} aria-controls="workspace-navigation" onClick={onOpenMobile}><Menu size={20} /></button>}
      <span className="hidden max-lg:inline">{t('工作空间')}</span>
      <ChevronRight size={14} className="hidden max-md:block max-lg:hidden text-subtle" aria-hidden="true" />
      <strong className="truncate font-medium text-ink">{page === 'site' ? settingsLabel : t(routes[page].label)}</strong>
    </div>
    <div className="flex shrink-0 items-center gap-[15px] max-md:gap-[9px]">
      <span className="flex items-center gap-1.5 text-[length:var(--font-10)] text-muted max-sm:hidden">
        <span className={`size-[5px] rounded-full ${connection === 'connected' ? 'bg-success shadow-[0_0_0_3px_var(--success-soft)]' : connection === 'pending' ? 'animate-pulse bg-muted' : 'bg-danger'}`} />
        {connection === 'connected' ? t('核心已连接') : connection === 'pending' ? t('连接中') : t('连接失败')}
      </span>
      <span className="mx-1 h-[18px] w-px bg-line max-sm:hidden" aria-hidden="true" />
      {data.profile === 'web-platform' && data.identity_realm === 'user' && user && client.web && !data.mfa_enrollment_required && <AnnouncementCenter web={client.web} />}
      <ClientControls />
      {data.profile === 'web-platform' && user && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex size-[29px] items-center justify-center rounded-full bg-avatar text-[length:var(--font-11)] font-semibold text-avatar-ink" aria-label={t('账号菜单')}>{(user.username ?? 'Y').slice(0, 1).toUpperCase()}</button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>
              <strong className="block text-sm text-ink">{user.username ?? data.site_name}</strong>
              <small className="text-2xs">{administration ? t('管理员') : t('普通用户')}</small>
            </DropdownMenuLabel>
            {client.web && <>
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

function PageHeading({ page, data, personalSettings, settingsLabel, administration }: {
  page: Page; data: Bootstrap; personalSettings: boolean; settingsLabel: string; administration: boolean;
}) {
  useLocale();
  const route = routes[page];
  return <div className="page-heading mb-[27px] flex items-center justify-between gap-[20px] max-md:mb-[22px] max-md:gap-3">
    <div className="min-w-0">
      <div className="mb-3 flex items-center gap-[7px] text-[length:var(--font-9)] font-semibold tracking-[1.6px] text-muted">
        <span className="size-[5px] rounded-full bg-primary" aria-hidden="true" /> {productName} · {t(administration ? '管理员' : '工作空间')}
      </div>
      <h1 className="text-[length:var(--font-24)] font-semibold text-ink max-md:text-[length:var(--font-23)]">{t(page === 'site' && personalSettings ? '外观设置' : route.title)}<span className="ms-1 text-primary">.</span></h1>
      <p className="mt-[7px] text-[length:var(--font-11)] leading-[1.8] text-muted max-md:max-w-[290px] max-md:text-[length:var(--font-10)] max-md:leading-[1.9]">{t(page === 'site' && personalSettings ? '只影响当前客户端，不修改全局配置。' : route.description)}</p>
    </div>
    <span className="mt-5 flex items-center gap-1.5 whitespace-nowrap rounded-full border border-line bg-surface px-[11px] py-[7px] text-[length:var(--font-9)] text-muted max-sm:hidden">
      <span className="size-[5px] rounded-full bg-success" aria-hidden="true" /> {t('核心已就绪')}
    </span>
  </div>;
}

function StateCard({ tone, icon, title, detail, action }: { tone: 'pending' | 'error'; icon: ReactNode; title: string; detail: string; action?: ReactNode }) {
  useLocale();
  return <div role={tone === 'error' ? 'alert' : 'status'} className={`state-card flex flex-col items-center gap-2 rounded-xl border bg-surface px-6 py-10 text-center shadow-card ${tone === 'error' ? 'border-danger-line' : 'border-line'}`}>
    {icon}
    <strong className="text-md font-semibold text-ink">{t(title)}</strong>
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

/** Author: yunnuo <ymz@ebox.vip>
 * Description: Shared responsive workspace shell on TanStack Router. All business calls use AppClient.
 */
import { AnnouncementCard } from './announcements-card';
import { ClientControls } from './client-controls';
import { SidebarTools, VersionBadge } from './shell-tools';
import { useLocale, t } from './i18n';
import { productName } from './product.gen';
import { WorkspaceLayout } from './workspace-layout';
import { MessageProvider } from './ui';
import { SiteFooter } from './site-footer';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { RouterProvider, Outlet, createBrowserHistory, useRouter, useRouterState, type RouterHistory } from '@tanstack/react-router';
import { Braces, ChevronRight, ExternalLink, FlaskConical, LayoutDashboard, Mail, Megaphone, Menu, Monitor, NotebookPen, PackageCheck, Radio, RotateCcw, ScrollText, Settings2, ShieldCheck, UserCog, UserRound, Users, Cloud, FolderOpen, Circle, type LucideIcon } from 'lucide-react';
import { BrandProvider, BrandMark, BrandLockup } from './brand';
import type { AppClient, Bootstrap } from '@unicore/sdk';
import { useTheme, type Theme } from './theme';
import { DashboardWidgetRegistry } from './registry';
import { PasswordDialog } from './password-dialog';
import { SessionBoundary, useSession } from './session';
import { routes, canAccess, isAdministrator, type Page } from './routes';
import { Modal, Button, DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel } from './ui';
import {
  createWorkspaceRouter, pageFromPath, PagePropsProvider, ShellOptionsProvider, NoticeProvider,
  useShellOptions, useSessionNotice, usePageProps, type PageProps, type PageComponent,
} from './router';
import { InstallPage } from './pages/install';
import { LoginPage, VerifyEmailPage, ResetPasswordPage } from './pages/auth';
import { NotFoundPage } from './pages/not-found';

export { DashboardWidgetRegistry } from './registry';
export type { PageProps, PageComponent } from './router';

const PAGE_LABELS = Object.fromEntries(Object.entries(routes).map(([id, route]) => [id, route.label])) as Record<Page, string>;

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
    const widgets = new DashboardWidgetRegistry().register({ id: 'platform-announcements', render: metadata => metadata.profile === 'web-platform' && metadata.identity_realm === 'user' && client.web ? <AnnouncementCard web={client.web} /> : null });
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
  const pathname = useRouterState({ select: state => state.location.pathname });
  // location.pathname is already basepath-stripped by the router.
  const page = pageFromPath(pathname);
  const data = metadata.data;
  const basename = pathname.replace(/^\//, '').split('?')[0];

  const locale = useLocale();
  useEffect(() => { if (data) document.title = t('{{v0}} · 工作空间', { v0: data.site_name }); }, [data?.site_name, locale]);

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
  if (data.capabilities.authentication && (!data.current_user || /^(verify-email|reset-password)$/.test(basename)) && client.web) {
    const props: PageProps = { page: 'overview', client, metadata: data, registry, theme, setTheme, refresh: () => void metadata.refetch() };
    const Flow = basename === 'verify-email' ? VerifyEmailPage : basename === 'reset-password' ? ResetPasswordPage : LoginPage;
    return <PagePropsProvider value={props}>
      <div className="flex min-h-dvh flex-col bg-background">
        <div className="fixed top-[15px] end-[20px] z-[45] rounded-lg border border-line bg-surface px-2 py-[5px] shadow-tint"><ClientControls /></div>
        <Flow {...props} />
        <SiteFooter metadata={data} compact />
      </div>
    </PagePropsProvider>;
  }

  const administration = data.identity_realm === 'administrator';
  const personalSettings = !administration;
  const settingsLabel = personalSettings ? t('外观设置') : t('基础设置');
  const permitted = canAccess(page, data);
  const refresh = () => { void metadata.refetch(); void router.invalidate(); };
  const props: PageProps = { page, client, metadata: data, registry, theme, setTheme, refresh };
  return <PagePropsProvider value={props}>
    <WorkspaceLayout
      navigationOpen={mobileOpen}
      onNavigationClose={() => setMobileOpen(false)}
      contentClassName={page === 'site' ? 'settings-content' : ''}
      navigation={<SideNavigation page={page} data={data} client={client} onNavigate={() => setMobileOpen(false)} onAbout={() => { setMobileOpen(false); setAbout(true); }} />}
      header={<TopBar page={page} data={data} client={client} settingsLabel={settingsLabel} connection={metadata.isSuccess ? 'connected' : metadata.isPending ? 'pending' : 'error'} mobileOpen={mobileOpen} onOpenMobile={() => setMobileOpen(true)} onOpenPassword={() => setPasswordOpen(true)} refresh={refresh} />}
      overlays={<>
        {passwordOpen && client.web && <PasswordDialog web={client.web} onClose={() => setPasswordOpen(false)} />}
        {about && <About onClose={() => setAbout(false)} />}
      </>}
    >
      <PageHeading page={page} data={data} personalSettings={personalSettings} settingsLabel={settingsLabel} administration={administration} />
      {metadata.isPending
        ? <StateCard tone="pending" icon={<Radio size={24} className="animate-pulse text-accent" />} title={t('正在连接 Go 核心')} detail={t('正在获取当前运行形态与能力信息…')} />
        : metadata.isError
          ? <StateCard tone="error" icon={<Radio size={26} className="text-danger" />} title={t('暂时无法连接核心')} detail={t(metadata.error.message)}
              action={<Button onClick={() => void metadata.refetch()}><RotateCcw size={15} />{t('重新连接')}</Button>} />
          : !permitted
            ? <StateCard tone="error" icon={<ShieldCheck size={26} className="text-danger" />} title={t('没有访问权限')} detail={t('请联系实例管理员授予相关权限。')} />
            : page === 'not-found' ? <NotFoundPage /> : <Outlet />}
      {!metadata.isPending && !metadata.isError && <div className="mt-6 flex items-center gap-1.5 text-2xs text-subtle"><Braces size={13} aria-hidden="true" /><span>{t('文本分析不保存输入，外观偏好仅在当前客户端生效。')}</span></div>}
      <SiteFooter metadata={data} />
    </WorkspaceLayout>
  </PagePropsProvider>;
}

function SideNavigation({ page, data, client, onNavigate, onAbout }: {
  page: Page; data: Bootstrap; client: AppClient; onNavigate: () => void; onAbout: () => void;
}) {
  useLocale();
  const router = useRouter();
  const administration = isAdministrator(data);
  const personalSettings = data.identity_realm !== 'administrator';
  function go(next: Page) { onNavigate(); void router.navigate({ to: `/${next === 'not-found' ? '' : next}` }); }
  return <>
    <div className={`relative ${data.version ? 'min-h-[52px]' : 'min-h-[42px]'}`}>
      <a className="flex items-center gap-[10px] px-[7px] text-[length:var(--font-27)] font-extrabold tracking-[-1.1px] text-ink" href="/" onClick={event => { event.preventDefault(); go('overview'); }}>
        <BrandLockup name={data.site_name} />
        {!data.version && <span className="absolute top-[70px] start-[74px] text-[length:var(--font-8)] font-semibold tracking-[2.5px] text-muted">FRAMEWORK</span>}
      </a>
      {data.version && <div className="absolute start-[53px] top-[29px]"><VersionBadge client={client} metadata={data} onOpen={() => go('edition')} /></div>}
    </div>
    <button className="mt-[35px] mb-[29px] flex w-full items-center gap-[10px] rounded-[10px] border border-line bg-surface p-[12px] text-start shadow-card transition-colors hover:bg-surface-alt" onClick={onAbout}>
      <span className="flex h-[34px] w-[31px] shrink-0 items-center justify-center rounded-md border border-line bg-surface-alt text-accent"><Braces size={19} aria-hidden="true" /></span>
      <span className="min-w-0"><strong className="block truncate text-[length:var(--font-12)] font-semibold text-ink">{data.site_name ?? t('默认工作空间')}</strong><small className="mt-[5px] block text-[length:var(--font-10)] text-muted">{t('Unicore 应用基座')}</small></span>
      <span className="ms-auto rounded-xs border border-line bg-surface-alt px-[5px] py-[3px] text-[length:var(--font-9)] text-muted">{data.stage ?? 'M2a'}</span>
    </button>
    <div className="flex flex-col gap-1">
      <nav aria-label={t('工作台')}>
        {([{ id: 'overview', icon: LayoutDashboard }, { id: 'lab', icon: FlaskConical }, { id: 'notes', icon: NotebookPen }] as const)
          .filter(({ id }) => canAccess(id, data))
          .map(({ id, icon: Icon }) => <NavItem key={id} icon={Icon} active={page === id} label={PAGE_LABELS[id]} onClick={() => go(id)} />)}
      </nav>
      {canAccess('files', data) && <NavItem icon={FolderOpen} active={page === 'files'} label={administration ? t('文件管理') : t('我的文件')} onClick={() => go('files')} />}
      {administration && <NavGroup title={t('用户管理')} icon={<Users size={19} />}>
        <NavEntry id="users" page={page} onNavigate={go} />
        <NavEntry id="administrators" page={page} onNavigate={go} />
        <NavEntry id="roles" page={page} onNavigate={go} />
      </NavGroup>}
      {canAccess('site', data) && (personalSettings
        ? <NavItem icon={Settings2} active={page === 'site'} label={t('外观设置')} onClick={() => go('site')} />
        : <NavGroup title={t('系统管理')} icon={<Settings2 size={19} />}>
            <NavEntry id="site" page={page} onNavigate={go} />
            {(['mail', 'mail-templates', 'announcements', 'storage', 'logs', 'edition'] as const).filter(id => canAccess(id, data)).map(id => <NavEntry key={id} id={id} page={page} onNavigate={go} />)}
          </NavGroup>)}
      {!administration && canAccess('edition', data) && <NavItem icon={PackageCheck} active={page === 'edition'} label={t('系统更新')} onClick={() => go('edition')} />}
    </div>
    <div className="mt-auto pt-[14px]"><SidebarTools onAbout={onAbout} /></div>
  </>;
}

function NavItem({ icon: Icon, label, active, onClick }: { icon: LucideIcon; label: string; active: boolean; onClick: () => void }) {
  useLocale();
  return <button className={`flex min-h-11 w-full items-center gap-[12px] rounded-lg px-[11px] text-start text-sm font-medium transition-colors ${active ? 'bg-primary-soft text-accent' : 'text-muted hover:bg-surface-alt hover:text-ink'}`} aria-current={active ? 'page' : undefined} onClick={onClick}>
    <Icon size={19} aria-hidden="true" /><span className="truncate">{t(label)}</span>{active && <span className="ms-auto size-1.5 shrink-0 rounded-full bg-accent" />}
  </button>;
}

function NavGroup({ title, icon, children }: { title: string; icon: ReactNode; children: ReactNode }) {
  useLocale();
  const [open, setOpen] = useState(true);
  return <section>
    <button className={`flex min-h-11 w-full items-center gap-[12px] rounded-lg px-[11px] text-start text-sm font-medium transition-colors ${open ? 'text-ink' : 'text-muted hover:bg-surface-alt hover:text-ink'}`} aria-expanded={open} onClick={() => setOpen(value => !value)}>
      {icon}<span className="truncate">{t(title)}</span><ChevronRight size={15} className={`ms-auto transition-transform ${open ? 'rotate-90' : ''}`} aria-hidden="true" />
    </button>
    <nav aria-label={t(title)} hidden={!open} className="ms-[18px] flex flex-col gap-0.5 border-s border-line ps-[9px]">{children}</nav>
  </section>;
}

const NAV_ICONS: Partial<Record<Page, LucideIcon>> = { announcements: Megaphone, storage: Cloud, files: FolderOpen, users: UserRound, administrators: UserCog, roles: ShieldCheck, site: Settings2, mail: Mail, 'mail-templates': Mail, logs: ScrollText, edition: PackageCheck };

function NavEntry({ id, page, onNavigate }: { id: Page; page: Page; onNavigate: (page: Page) => void }) {
  useLocale();
  const Icon = NAV_ICONS[id] ?? Circle;
  return <button className={`flex min-h-10 w-full items-center gap-[10px] rounded-lg px-[10px] text-start text-[length:var(--font-12)] font-medium transition-colors ${page === id ? 'bg-primary-soft text-accent' : 'text-muted hover:bg-surface-alt hover:text-ink'}`} aria-current={page === id ? 'page' : undefined} onClick={() => onNavigate(id)}>
    <Icon size={16} aria-hidden="true" /><span className="truncate">{t(PAGE_LABELS[id])}</span>{page === id && <span className="ms-auto size-1.5 shrink-0 rounded-full bg-accent" />}
  </button>;
}

function TopBar({ page, data, client, settingsLabel, connection, mobileOpen, onOpenMobile, onOpenPassword, refresh }: {
  page: Page; data: Bootstrap; client: AppClient; settingsLabel: string; connection: 'connected' | 'pending' | 'error';
  mobileOpen: boolean; onOpenMobile: () => void; onOpenPassword: () => void; refresh: () => void;
}) {
  useLocale();
  const router = useRouter();
  const administration = isAdministrator(data);
  const user = data.current_user;
  return <>
    <div className="flex min-w-0 items-center gap-4 text-[length:var(--font-11)] text-muted max-md:gap-1.5">
      <button className="mobile-menu size-8 items-center justify-center rounded-md text-muted hover:bg-primary-soft hover:text-accent max-md:-ms-1" aria-label={t('打开导航')} aria-expanded={mobileOpen} aria-controls="workspace-navigation" onClick={onOpenMobile}><Menu size={20} /></button>
      <span className="hidden max-lg:inline">{t('工作空间')}</span>
      <ChevronRight size={14} className="hidden max-md:block max-lg:hidden text-subtle" aria-hidden="true" />
      <strong className="truncate font-medium text-ink">{page === 'site' ? settingsLabel : t(PAGE_LABELS[page])}</strong>
    </div>
    <div className="flex shrink-0 items-center gap-[15px] max-md:gap-[9px]">
      <span className="flex items-center gap-1.5 text-[length:var(--font-10)] text-muted max-sm:hidden">
        <span className={`size-[5px] rounded-full ${connection === 'connected' ? 'bg-success shadow-[0_0_0_3px_var(--success-soft)]' : connection === 'pending' ? 'animate-pulse bg-muted' : 'bg-danger'}`} />
        {connection === 'connected' ? t('核心已连接') : connection === 'pending' ? t('连接中') : t('连接失败')}
      </span>
      <span className="mx-1 h-[18px] w-px bg-line max-sm:hidden" aria-hidden="true" />
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
              <DropdownMenuItem onSelect={() => void router.navigate({ to: '/account' })}>{t('账号资料')}</DropdownMenuItem>
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
        <span className="size-[5px] rounded-full bg-primary" aria-hidden="true" /> {administration ? 'UNICORE ADMINISTRATION' : 'UNICORE WORKSPACE'}
      </div>
      <h1 className="text-[length:var(--font-24)] font-semibold text-ink max-md:text-[length:var(--font-23)]">{t(page === 'site' && personalSettings ? '外观设置' : route.title)}<span className="ms-1 text-primary">.</span></h1>
      <p className="mt-[7px] text-[length:var(--font-11)] leading-[1.8] text-muted max-md:max-w-[290px] max-md:text-[length:var(--font-10)] max-md:leading-[1.9]">{t(page === 'site' && personalSettings ? '只影响当前客户端，不修改全局配置。' : route.description)}</p>
    </div>
    <span className="mt-5 flex items-center gap-1.5 whitespace-nowrap rounded-full border border-line bg-surface px-[11px] py-[7px] text-[length:var(--font-9)] text-muted max-sm:hidden">
      <span className="size-[5px] rounded-full bg-success" aria-hidden="true" /> {data.stage ?? 'M2a'}{t('· 核心已就绪')}
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
    <a className="inline-flex items-center gap-1 text-sm text-accent hover:underline" href="https://github.com/yunnuo88520/Unicore/tree/main/docs" target="_blank" rel="noopener noreferrer">
      {t('开发文档')}<ExternalLink size={13} aria-hidden="true" />
    </a>
  </Modal>;
}

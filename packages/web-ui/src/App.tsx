/** Author: yunnuo <ymz@ebox.vip>
 * Description: Shared responsive workspace. All business calls use AppClient.
 */
import { ClientControls } from './client-controls';
import { SidebarTools, VersionBadge } from './shell-tools';
import { useLocale, t, currentLocale } from './i18n';
import './preferences.css';
import { UpdatePanel } from './update-panel';
import { NotesPage } from './notes-page';
import { FileManagement } from './files-page';
import { Form } from './forms';
import { MessageProvider, useMessage } from './message';
import { SiteFooter } from './site-footer';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { useMutation } from '@tanstack/react-query';
import { NotebookPen, Cloud, FolderOpen, Activity, ArrowDown, ArrowRight, ArrowUpRight, Braces, Check, CheckCircle2, ChevronRight, Circle, Code2, Copy, Cpu, ExternalLink, FlaskConical, Globe2, Info, Layers3, LayoutDashboard, LoaderCircle, Menu, Monitor, Moon, Play, Radio, RotateCcw, Settings2, ShieldCheck, Sparkles, Sun, Terminal, Users, UserRound, UserCog, Mail, ScrollText, PackageCheck, X, type LucideIcon } from 'lucide-react';
import { BrandProvider, BrandMark, BrandLockup } from './brand';
import { type AppClient, type Bootstrap, type ExecuteOutput, type Profile } from '@unicore/sdk';
import { useTheme, type Theme } from './theme';
import { DashboardWidgetRegistry } from './registry';
import { InstallWizard } from './install-page';
import { LoginPage } from './account-flows';
import { ClientAppearance } from './appearance';
import { PasswordDialog } from './password-dialog';
import { AccountSecurity } from './oidc-page';
import { SessionBoundary, useSession } from './session';
import { routes, pageFromHash, canAccess, isAdministrator, type Page } from './routes';
import './flows.css';

export { DashboardWidgetRegistry } from './registry';
const SAMPLE = 'Hello, Unicore.\n一份 Go 核心，连接每一种可能。\nBuild once. Run everywhere.';
const PROFILE_LABELS: Record<Profile, string> = { 'web-platform': 'Web 平台', 'web-standalone': 'Web 单机', desktop: '桌面应用', cli: '命令行' };
const PAGE_LABELS = Object.fromEntries(Object.entries(routes).map(([id, route]) => [id, route.label])) as Record<Page, string>;

export type PageProps = { page: Page; client: AppClient; metadata: Bootstrap; registry: DashboardWidgetRegistry; theme: Theme; setTheme: (theme: Theme) => void; refresh: () => void };
type WorkspaceProps = { client: AppClient; registry?: DashboardWidgetRegistry; administratorPage?: (props: PageProps) => ReactNode };
export function Workspace({ client, registry = new DashboardWidgetRegistry(), administratorPage }: WorkspaceProps) {
  useLocale();
  return <MessageProvider><SessionBoundary client={client}>{notice => <BrandedApp client={client} registry={registry} notice={t(notice)} administratorPage={administratorPage} />}</SessionBoundary></MessageProvider>;
}

function BrandedApp(props: {client: AppClient; registry: DashboardWidgetRegistry; notice: string; administratorPage?: WorkspaceProps['administratorPage']}) {
  useLocale();
 const {metadata}=useSession(props.client);
 return <BrandProvider branding={metadata.data?.branding} name={metadata.data?.site_name}><App {...props} /></BrandProvider>;
}

function App({ client, registry, notice, administratorPage }: { client: AppClient; registry: DashboardWidgetRegistry; notice: string; administratorPage?: WorkspaceProps['administratorPage'] }) {
  const locale = useLocale();
  const [page, setPage] = useState<Page>(() => pageFromHash(window.location.hash));
  const [route, setRoute] = useState(window.location.hash);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [about, setAbout] = useState(false);
 const [passwordOpen,setPasswordOpen]=useState(false);
 const [avatarOpen,setAvatarOpen]=useState(false);
 const avatarRef=useRef<HTMLDivElement>(null);
 useEffect(()=>{if(!avatarOpen)return;const close=(e:PointerEvent)=>{if(!avatarRef.current?.contains(e.target as Node))setAvatarOpen(false);};const key=(e:KeyboardEvent)=>{if(e.key==='Escape'){setAvatarOpen(false);avatarRef.current?.querySelector('button')?.focus();}};document.addEventListener('pointerdown',close);document.addEventListener('keydown',key);return()=>{document.removeEventListener('pointerdown',close);document.removeEventListener('keydown',key);};},[avatarOpen]);
  const { metadata } = useSession(client);
  const previousAdminPath = useRef<string | undefined>(undefined);
  useEffect(() => {
    const data = metadata.data;
    if (!data || data.identity_realm !== 'administrator') return;
    if (previousAdminPath.current && window.location.pathname === previousAdminPath.current && data.admin_path !== previousAdminPath.current) {
      window.history.replaceState(null, '', data.admin_path + window.location.search + window.location.hash);
    }
    previousAdminPath.current = data.admin_path;
  }, [metadata.data?.admin_path, metadata.data?.identity_realm]);
  const [theme, setTheme] = useTheme();
  useEffect(() => { if (metadata.data) document.title = t("{{v0}} · 工作空间",{v0:metadata.data.site_name}); }, [metadata.data?.site_name, locale]);
  useEffect(() => {if (!window.location.hash && metadata.data?.current_user && window.location.pathname===metadata.data.admin_path) setPage('overview'); else if (!window.location.hash && window.location.pathname==='/settings') setPage('site');},[metadata.data]);
  useEffect(() => { const change = () => { setPage(pageFromHash(window.location.hash)); setRoute(window.location.hash); }; window.addEventListener('hashchange', change); return () => window.removeEventListener('hashchange', change); }, []);
  function openAbout() { setMobileOpen(false); setAbout(true); }
  function navigate(next: Page) { window.location.hash = next; setPage(next); setMobileOpen(false); }
  const refresh = () => { setRoute(window.location.hash); void metadata.refetch(); };
  const personalSettings = metadata.data?.identity_realm !== 'administrator';
  const settingsLabel = personalSettings ? t('外观设置') : t('基础设置');
  const permitted = canAccess(page, metadata.data);
  if (metadata.data?.capabilities.installation && !metadata.data.installed && client.web) return <><div className="public-client-controls"><ClientControls/></div><InstallWizard web={client.web} initialProfile={metadata.data.profile} onDone={result => { if(result.profile==='web-platform'){window.location.assign(result.admin_url);return;}window.history.replaceState({}, '', '/');navigate('overview');refresh(); }} /></>;
  if (metadata.data?.capabilities.authentication && (!metadata.data.current_user || /^#(verify-email|reset-password)(\?|$)/.test(route)) && client.web) return <div className="account-layout"><div className="public-client-controls"><ClientControls/></div><LoginPage key={route} administrator={metadata.data.identity_realm==='administrator'} adminPath={metadata.data.admin_path} web={client.web} siteName={metadata.data.site_name} onDone={refresh} notice={t(notice)} /><SiteFooter metadata={metadata.data} compact /></div>;
  return <div className="app-shell">
    <a className="skip-link" href="#main-content" onClick={event => { event.preventDefault(); document.getElementById('main-content')?.focus(); }}>{t("跳至主要内容")}</a>
    {mobileOpen && <button className="nav-scrim" aria-label={t("关闭导航")} onClick={() => setMobileOpen(false)} />}
    <aside className={`sidebar ${mobileOpen ? 'is-open' : ''}`} aria-label={t("主导航")}>
      <div className={`brand-region ${metadata.data?.version ? 'has-version' : ''}`}><a className="brand" href="#overview" onClick={() => navigate('overview')}><BrandLockup name={metadata.data?.site_name} />{!metadata.data?.version&&<span className="brand-tag">FRAMEWORK</span>}</a>{metadata.data?.version&&<div className="brand-version"><VersionBadge client={client} metadata={metadata.data} onOpen={()=>navigate('edition')}/></div>}</div>
      <button className="workspace-switch" onClick={openAbout}><span className="workspace-icon"><Braces size={19} /></span><span><strong>{metadata.data?.site_name ?? t('默认工作空间')}</strong><small>{t("Unicore 应用基座")}</small></span><span className="workspace-stage">{metadata.data?.stage ?? 'M2a'}</span></button>
      <div className="sidebar-navigation">
      <nav aria-label={t("工作台")}>{([{ id: 'overview', icon: LayoutDashboard }, { id: 'lab', icon: FlaskConical }, { id:'notes',icon:NotebookPen }] as const).filter(({id})=>canAccess(id,metadata.data)).map(({ id, icon: Icon }) => <button key={id} className={`nav-item ${page === id ? 'active' : ''}`} aria-current={page === id ? 'page' : undefined} onClick={() => navigate(id)}><Icon size={19} /><span>{t(PAGE_LABELS[id])}</span>{page === id && <span className="nav-active-dot" />}</button>)}</nav>
      {canAccess('files',metadata.data)&&<button className={`nav-item ${page==='files'?'active':''}`} onClick={()=>navigate('files')}><FolderOpen size={19}/><span>{isAdministrator(metadata.data)?t('文件管理'):t('我的文件')}</span></button>}
      {isAdministrator(metadata.data)&&<NavGroup title={t("用户管理")} icon={<Users size={19}/>}><NavEntry id="users" page={page} navigate={navigate}/><NavEntry id="administrators" page={page} navigate={navigate}/><NavEntry id="roles" page={page} navigate={navigate}/></NavGroup>}
      {canAccess('site',metadata.data)&&(personalSettings?<button className={`nav-item ${page==='site'?'active':''}`} onClick={()=>navigate('site')}><Settings2 size={19}/><span>{t("外观设置")}</span></button>:<NavGroup title={t("系统管理")} icon={<Settings2 size={19}/>}><NavEntry id="site" page={page} navigate={navigate}/>{(['mail','storage','logs','edition'] as const).filter(id=>canAccess(id,metadata.data)).map(id=><NavEntry key={id} id={id} page={page} navigate={navigate}/>)}</NavGroup>)}
      {!isAdministrator(metadata.data)&&canAccess('edition',metadata.data)&&<button className={`nav-item ${page==='edition'?'active':''}`} onClick={()=>navigate('edition')}><PackageCheck size={19}/><span>{t("系统更新")}</span></button>}
      </div>
      <div className="sidebar-bottom"><SidebarTools onAbout={openAbout}/></div>
    </aside>
    <div className="main-shell"><header className="topbar"><div className="breadcrumbs"><button className="icon-button mobile-menu" aria-label={t("打开导航")} onClick={() => setMobileOpen(true)}><Menu size={20} /></button><span className="breadcrumb-root">{t("工作空间")}</span><ChevronRight size={14} /><strong>{page === 'site' ? settingsLabel : t(PAGE_LABELS[page])}</strong></div><div className="top-actions"><span className={`connection ${metadata.isSuccess ? 'connected' : ''}`}><span />{metadata.isSuccess ? t('核心已连接') : metadata.isPending ? t('连接中') : t('连接失败')}</span><span className="top-divider" /><ClientControls/>{metadata.data?.profile === 'web-platform' && metadata.data.current_user && <div className="account-menu" ref={avatarRef}><button className="avatar top-avatar" aria-label={t("账号菜单")} aria-expanded={avatarOpen} aria-controls="account-actions" onClick={()=>setAvatarOpen(v=>!v)}>{(metadata.data?.current_user?.username??'Y').slice(0,1).toUpperCase()}</button>{avatarOpen&&<div id="account-actions" className="account-dropdown"><strong>{metadata.data?.current_user?.username??metadata.data?.site_name}</strong><small>{metadata.data?.current_user?(isAdministrator(metadata.data)?t('管理员'):t('普通用户')):t('本地工作空间')}</small>{client.web&&<><button onClick={()=>{setAvatarOpen(false);setPasswordOpen(true);}}>{t("修改密码")}</button><button onClick={()=>{setAvatarOpen(false);navigate('account');}}>{t("账号资料")}</button><button onClick={()=>{setAvatarOpen(false);void client.web!.logout().then(()=>{navigate('overview');refresh();},refresh);}}>{t("退出登录")}</button></>}</div>}</div>}</div></header>
      <main id="main-content" tabIndex={-1} className={`main-content${page === 'site' ? ' settings-content' : ''}`}><div className="page-heading"><div><div className="eyebrow"><span /> {isAdministrator(metadata.data) ? 'UNICORE ADMINISTRATION' : 'UNICORE WORKSPACE'}</div><h1>{t(page === 'site' && personalSettings ? '外观设置' : routes[page].title)}<span className="heading-dot">.</span></h1><p>{t(page === 'site' && personalSettings ? '只影响当前客户端，不修改全局配置。' : routes[page].description)}</p></div><span className="stage-pill"><span /> {metadata.data?.stage ?? 'M2a'}{t("· 核心已就绪")}</span></div>
        {metadata.isPending ? <div className="state-card" role="status"><LoaderCircle className="spin" size={24} /><strong>{t("正在连接 Go 核心")}</strong><p>{t("正在获取当前运行形态与能力信息…")}</p></div> : metadata.isError ? <div className="state-card error-state" role="alert"><Radio size={26} /><strong>{t("暂时无法连接核心")}</strong><p>{t(metadata.error.message)}</p><button className="primary-button" onClick={() => metadata.refetch()}><RotateCcw size={16} />{t("重新连接")}</button></div> : <>
          {!permitted ? <div className="state-card" role="alert"><ShieldCheck size={26} /><strong>{t("没有访问权限")}</strong><p>{t("请联系实例管理员授予相关权限。")}</p></div> : <PageContent page={page} client={client} metadata={metadata.data} registry={registry} theme={theme} setTheme={setTheme} refresh={refresh} administratorPage={administratorPage} />}
          <div className="foundation-note"><Info size={15} /><span>{t("文本分析不保存输入，外观偏好仅在当前客户端生效。")}</span></div>
        </>}
        <SiteFooter metadata={metadata.data} />
      </main>
    </div>
    {passwordOpen&&client.web&&<PasswordDialog web={client.web} onClose={()=>setPasswordOpen(false)}/>}
    {about && <About onClose={() => setAbout(false)} />}
  </div>;
}

function NavGroup({title,icon,children}:{title:string;icon:ReactNode;children:ReactNode}){
  useLocale();
 const [open,setOpen]=useState(true);const id=useId();
 return <section className="nav-group"><button className="nav-item nav-group-toggle" aria-expanded={open} aria-controls={id} onClick={()=>setOpen(v=>!v)}>{icon}<span>{t(title)}</span><ChevronRight size={15} className={open?'expanded':''}/></button><nav id={id} aria-label={t(title)} hidden={!open}>{children}</nav></section>;
}
const NAV_ICONS: Partial<Record<Page, LucideIcon>> = { storage:Cloud,files:FolderOpen,users: UserRound, administrators: UserCog, roles: ShieldCheck, site: Settings2, mail: Mail, logs: ScrollText, edition: PackageCheck };
function NavEntry({id,page,navigate}:{id:Page;page:Page;navigate:(p:Page)=>void}) {
  useLocale();
  const Icon = NAV_ICONS[id] ?? Circle;
  return <button className={`nav-item nav-child ${page===id?'active':''}`} aria-current={page===id?'page':undefined} onClick={()=>navigate(id)}><Icon size={16} aria-hidden="true"/><span>{t(PAGE_LABELS[id])}</span>{page===id&&<span className="nav-active-dot"/>}</button>;
}

function PageContent(props: PageProps & { administratorPage?: WorkspaceProps['administratorPage'] }) {
  useLocale();
  const {page,client,metadata,registry,theme,setTheme,refresh}=props;
  const administration=metadata.identity_realm==='administrator';
  if(administration && props.administratorPage && !['overview','lab','notes','account','files','not-found'].includes(page)) { const Administration=props.administratorPage;return <Administration {...props}/>; }
  switch(page){
    case 'overview': case 'lab': return <CoreWorkspace page={page} client={client} metadata={metadata} registry={registry}/>;
    case 'notes': return client.notes && <NotesPage client={client} metadata={metadata}/>;
    case 'files': return client.files && <FileManagement client={client} administrator={administration}/>;
    case 'account': return client.web && <AccountSecurity web={client.web} userID={metadata.current_user?.id??''} onChanged={refresh}/>;
    case 'edition': return __FEATURE_UPDATER__ && <UpdatePanel client={client} metadata={metadata}/>;
    case 'site': return <ClientAppearance theme={theme} onSaved={setTheme}/>;
    default: return <div className="state-card" role="alert"><Info size={26}/><strong>{t("找不到这个页面")}</strong><p>{t("请通过导航进入已有页面。")}</p><a className="primary-button" href="#overview">{t("返回工作台")}</a></div>;
  }
}
function CoreWorkspace({ page, client, metadata, registry }: { page: Page; client: AppClient; metadata: Bootstrap; registry: DashboardWidgetRegistry }) {
  useLocale();
  return <>
            <RuntimeCards metadata={metadata} transport={client.transport} />
            {page === 'overview' && <div className="intro-banner"><span className="banner-orbit orbit-one" /><span className="banner-orbit orbit-two" /><div className="banner-content"><span className="banner-tag"><Sparkles size={13} />{t("为下一款产品而生")}</span><h2>{t("构建一次，连接每个终端。")}</h2><p>{t("领域逻辑保持纯粹，交互体验始终一致。")}</p><button onClick={() => { window.location.hash = 'lab'; }}>{t("探索核心实验室")}<ArrowRight size={15} /></button></div><div className="banner-diagram" aria-hidden="true"><div className="diagram-core"><BrandMark size={30} /><span>Go Core</span></div><span className="diagram-line" /><div className="diagram-targets"><span><Globe2 size={17} /> Web</span><span><Monitor size={17} /> Desktop</span><span><Terminal size={17} /> CLI</span></div></div></div>}
            {page==='overview' && metadata.identity_realm!=='administrator' && <section className="business-placeholders" aria-label={t("业务空间")}><article className="panel"><FolderOpen size={22}/><h2>{t("我的项目")}</h2><p>{t("为你的业务预留空间，项目功能待接入。")}</p><span className="subtle-badge">{t("待接入")}</span></article><article className="panel"><Activity size={22}/><h2>{t("最近动态")}</h2><p>{t("业务接入后，在这里汇集与你有关的更新。")}</p><span className="subtle-badge">{t("待接入")}</span></article></section>}
            <div className="workspace-grid"><CoreLab client={client} /><div className="right-column"><Profiles current={metadata.profile} /><Architecture /></div></div>
            {registry.entries().map(widget => <section key={widget.id}>{widget.render(metadata)}</section>)}
  </>;
}

function RuntimeCards({ metadata, transport }: { metadata: Bootstrap; transport: AppClient['transport'] }) {
  useLocale();
  const cards = [
    { label: t('当前运行形态'), value: PROFILE_LABELS[metadata.profile], detail: metadata.profile, icon: metadata.profile === 'desktop' ? Monitor : Globe2, color: 'purple' },
    { label: t('核心服务'), value: t('运行正常'), detail: t('共享用例已就绪'), icon: Activity, color: 'green' },
    { label: t('连接方式'), value: transport === 'http' ? 'HTTP API' : 'Wails Bridge', detail: transport === 'http' ? t('/api/v1 · 统一接口契约') : t('原生桥接 · 无 HTTP 服务'), icon: Braces, color: 'blue' },
    metadata.version ? { label: t('框架版本'), value: `v${metadata.version}`, detail: `${metadata.stage} · ${metadata.deployment_kind}`, icon: Layers3, color: 'orange' } : {label:t('工作空间'),value:t('个人空间'),detail:t('专注于你的业务'),icon:Layers3,color:'orange'},
  ];
  return <section className="runtime-cards" aria-label={t("运行状态")}>{cards.map(card => <article className="runtime-card" key={t(card.label)}><div><p>{t(card.label)}</p><strong>{t(card.value)}</strong><small>{t(card.detail)}</small></div><span className={`card-icon ${card.color}`}><card.icon size={20} /></span></article>)}</section>;
}

function CoreLab({ client }: { client: AppClient }) {
  useLocale();
  const [text, setText] = useState(() => t(SAMPLE));
  const [copied, setCopied] = useState(false);
  const message = useMessage();
  const [recent, setRecent] = useState<{ result: ExecuteOutput; time: string }[]>([]);
  const execution = useMutation({ mutationFn: () => client.execute({ text }), onSuccess: result => { setCopied(false); setRecent(items => [{ result, time: new Date().toLocaleTimeString(currentLocale(), { hour12: false }) }, ...items].slice(0, 3)); } });
  const byteLength = new TextEncoder().encode(text).length;
  async function copyDigest() {
    try { await navigator.clipboard.writeText(execution.data!.sha256); setCopied(true); message.success(t('摘要已复制')); }
    catch { message.error(t('复制失败，请手动选择摘要文本复制')); }
  }
  return <section className="panel lab-panel"><div className="panel-heading"><div><h2><FlaskConical size={18} />{t("核心实验室")}</h2><p>{t("用一个真实用例，验证所有入口")}</p></div><span className="subtle-badge">{t("文本分析")}</span></div><Form pending={execution.isPending} onSubmit={e => { e.preventDefault(); execution.mutate(); }}>
    <div className="editor-label"><label htmlFor="core-input">{t("输入文本")}</label><button type="button" className="text-button" disabled={execution.isPending} onClick={() => { setText(t(SAMPLE)); execution.reset(); }}><RotateCcw size={12} />{t("重置示例")}</button></div>
    <div className="editor"><div className="editor-toolbar"><span><i /><i /><i /></span><small>example.txt</small><small>UTF-8</small></div><textarea id="core-input" value={text} onChange={e => setText(e.target.value)} spellCheck={false} aria-describedby="input-hint" placeholder={t("在这里输入想分析的文本…")} /></div>
    <div className="editor-footer"><span id="input-hint" className={byteLength > 65536 ? 'text-error' : ''}>{byteLength.toLocaleString()}{t("/ 65,536 字节")}<span className="hide-small">{t("· 不保存输入内容")}</span></span><button className="primary-button" disabled={execution.isPending || !text.trim() || byteLength > 65536}>{execution.isPending ? <LoaderCircle size={15} className="spin" /> : <Play size={14} fill="currentColor" />}{execution.isPending ? t('执行中…') : t('运行用例')}</button></div>
  </Form>
  <div className="result-heading"><span>{t("执行结果")}</span>{execution.isSuccess ? <span className="success-caption"><CheckCircle2 size={13} />{t("执行成功")}</span> : <span className="muted">Go Core</span>}</div>
  <div className="result-grid" aria-live="polite">{[{ key: 'characters', label: t('Unicode 字符'), icon: Code2 }, { key: 'words', label: t('空白分隔词'), icon: Braces }, { key: 'lines', label: t('文本行数'), icon: Layers3 }].map(({ key, label, icon: Icon }) => <div key={key}><span><Icon size={14} />{t(label)}</span><strong>{execution.data ? execution.data[key as 'characters' | 'words' | 'lines'].toLocaleString() : '—'}</strong></div>)}</div>
  {execution.data ? <div className="digest"><div><span>{t("SHA-256 摘要")}</span><button className="text-button" type="button" onClick={copyDigest}>{copied ? <Check size={13} /> : <Copy size={13} />}{copied ? t('已复制') : t('复制')}</button></div><code>{execution.data.sha256}</code></div> : <div className="result-empty"><Circle size={12} /><span>{t("点击「运行用例」，查看来自真实核心的结果")}</span></div>}
  <div className="recent-runs"><div><h3>{t("本次会话的运行记录")}</h3><span className="subtle-badge">{t("{{count}} 次",{count:recent.length})}</span></div>{recent.length ? recent.map((run, index) => <div className="recent-row" key={`${run.time}-${index}`}><span className="recent-check"><Check size={12} /></span><strong>{t("文本分析")}</strong><span>{t("{{count}} 字符",{count:run.result.characters})}</span><time>{run.time}</time></div>) : <p>{t("暂无运行记录，从第一次执行开始。")}</p>}</div>
  </section>;
}

function Profiles({ current }: { current: Profile }) {
  useLocale();
  const profiles = [{ id: 'web-platform', title: t('Web 平台'), detail: t('独立账号 · 服务端角色权限'), icon: Globe2 }, { id: 'web-standalone', title: t('Web 单机'), detail: t('轻装运行 · 专注本地业务'), icon: Monitor }, { id: 'desktop', title: 'Desktop', detail: t('Wails 原生桥接 · 共用界面'), icon: Layers3 }, { id: 'cli', title: 'CLI', detail: t('独立二进制 · 无数据库依赖'), icon: Terminal }];
  return <section className="panel profiles-panel"><div className="panel-heading"><div><h2>{t("一个核心，四种形态")}</h2><p>{t("入口各自独立，业务始终相同")}</p></div><span className="tiny-number">04</span></div><div className="profile-list">{profiles.map(item => <div className={`profile-row ${current === item.id ? 'current' : ''}`} key={item.id}><span className="profile-icon"><item.icon size={18} /></span><div><strong>{item.title}</strong><small>{t(item.detail)}</small></div>{current === item.id ? <span className="current-label">{t("当前")}</span> : <span className="profile-node" aria-label={t("已接入共享用例")} />}</div>)}</div><div className="profile-bottom"><CheckCircle2 size={14} /><span>{t("同一份 Go 业务逻辑 · 同一个接口契约")}</span></div></section>;
}

function Architecture() {
  useLocale();
  return <section className="panel architecture-panel"><div className="panel-heading"><div><h2>{t("清晰的边界，更自由的扩展")}</h2><p>{t("依赖向内，让核心保持纯粹")}</p></div></div><div className="architecture-flow"><div><span><Globe2 size={13} />HTTP</span><span><Monitor size={13} />Wails</span><span><Terminal size={13} />CLI</span></div><ArrowDown size={16} /><strong><Cpu size={17} /> Application / Go Core</strong></div><p className="architecture-detail">{t("领域层独立于 UI、传输与存储。新增产品只需扩展自己的业务模块。")}</p></section>;
}


function About({ onClose }: { onClose: () => void }) {
  useLocale();
  const dialogRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    dialogRef.current?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
      if (event.key === 'Tab') {
        const focusable = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>('button, a[href]') ?? []);
        const first = focusable[0]; const last = focusable.at(-1);
        if (event.shiftKey && (document.activeElement === first || document.activeElement === dialogRef.current)) { last?.focus(); event.preventDefault(); }
        else if (!event.shiftKey && document.activeElement === last) { first?.focus(); event.preventDefault(); }
      }
    };
    window.addEventListener('keydown', keydown);
    return () => { window.removeEventListener('keydown', keydown); const rect=previous?.getBoundingClientRect(); if(rect&&rect.right>0&&rect.left<window.innerWidth) previous?.focus(); else document.getElementById('main-content')?.focus(); };
  }, [onClose]);
  return <div className="modal-scrim" onClick={event => { if (event.target === event.currentTarget) onClose(); }}><div className="about-dialog" role="dialog" aria-modal="true" aria-labelledby="about-title" tabIndex={-1} ref={dialogRef}><button className="icon-button close-dialog" aria-label={t("关闭关于")} onClick={onClose}><X size={20} /></button><BrandMark size={44} /><h2 id="about-title">Unicore</h2><p>{t("一套 Go Core，一套 React UI。")}<br />{t("为 Web、桌面与命令行构建可复用的应用基座。")}</p><div className="about-stack"><span>Go</span><span>React</span><span>Wails v2</span><span>Cobra</span></div><p className="muted">{t("可扩展的业务基座、共享界面与原生桥接。")}<br />{t("完整范围与开发指南请阅读项目文档。")}</p><a href="https://github.com/yunnuo88520/Unicore/tree/main/docs" target="_blank" rel="noopener noreferrer">{t("开发文档")}<ExternalLink size={13} /></a></div></div>;
}

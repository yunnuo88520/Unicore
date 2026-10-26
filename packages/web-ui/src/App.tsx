/** Author: yunnuo <ymz@ebox.vip>
 * Description: Shared responsive workspace. All business calls use AppClient.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider, useMutation, useQuery } from '@tanstack/react-query';
import { Activity, ArrowDown, ArrowRight, ArrowUpRight, Braces, Check, CheckCircle2, ChevronRight, Circle, Code2, Copy, Cpu, ExternalLink, FlaskConical, Globe2, Info, Layers3, LayoutDashboard, LoaderCircle, Menu, Monitor, Moon, Play, Radio, RotateCcw, Settings2, ShieldCheck, Sparkles, Sun, Terminal, Users, X } from 'lucide-react';
import { AppError, type AppClient, type Bootstrap, type ExecuteOutput, type Profile } from '@unicore/sdk';
import { useTheme, type Theme } from './theme';
import { DashboardWidgetRegistry } from './registry';

export { DashboardWidgetRegistry } from './registry';
const SAMPLE = 'Hello, Unicore.\n一份 Go 核心，连接每一种可能。\nBuild once. Run everywhere.';
const PROFILE_LABELS: Record<Profile, string> = { 'web-platform': 'Web 平台', 'web-standalone': 'Web 单机', desktop: '桌面应用', cli: '命令行' };
type Page = 'overview' | 'lab' | 'settings';
const PAGE_LABELS = { overview: '工作台概览', lab: '核心实验室', settings: '外观设置' };

export function Workspace({ client, registry = new DashboardWidgetRegistry() }: { client: AppClient; registry?: DashboardWidgetRegistry }) {
  const [queryClient] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } } }));
  return <QueryClientProvider client={queryClient}><App client={client} registry={registry} /></QueryClientProvider>;
}

function App({ client, registry }: { client: AppClient; registry: DashboardWidgetRegistry }) {
  const pageFromHash = (): Page => { const hash = window.location.hash.slice(1); return hash === 'lab' || hash === 'settings' ? hash : 'overview'; };
  const [page, setPage] = useState<Page>(pageFromHash);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [about, setAbout] = useState(false);
  const [theme, setTheme] = useTheme();
  const metadata = useQuery({ queryKey: ['bootstrap', client.transport], queryFn: () => client.bootstrap() });
  useEffect(() => { const change = () => setPage(pageFromHash()); window.addEventListener('hashchange', change); return () => window.removeEventListener('hashchange', change); }, []);
  function navigate(next: Page) { window.location.hash = next; setPage(next); setMobileOpen(false); }
  return <div className="app-shell">
    <a className="skip-link" href="#main-content">跳至主要内容</a>
    {mobileOpen && <button className="nav-scrim" aria-label="关闭导航" onClick={() => setMobileOpen(false)} />}
    <aside className={`sidebar ${mobileOpen ? 'is-open' : ''}`} aria-label="主导航">
      <a className="brand" href="#overview" onClick={() => navigate('overview')}><span className="brand-mark"><Layers3 size={23} strokeWidth={2.4} /></span><span>unicore<span className="brand-dot">.</span></span><span className="brand-tag">FRAMEWORK</span></a>
      <button className="workspace-switch" onClick={() => setAbout(true)}><span className="workspace-icon"><Braces size={19} /></span><span><strong>默认工作空间</strong><small>Unicore 开发基座</small></span><span className="workspace-stage">M1</span></button>
      <div className="nav-caption">工作空间</div>
      <nav>{([{ id: 'overview', icon: LayoutDashboard }, { id: 'lab', icon: FlaskConical }, { id: 'settings', icon: Settings2 }] as const).map(({ id, icon: Icon }) => <button key={id} className={`nav-item ${page === id ? 'active' : ''}`} aria-current={page === id ? 'page' : undefined} onClick={() => navigate(id)}><Icon size={19} /><span>{PAGE_LABELS[id]}</span>{page === id && <span className="nav-active-dot" />}</button>)}</nav>
      <div className="nav-caption roadmap-caption">框架路线图</div>
      <div className="nav-item unavailable"><Users size={18} /><span>用户与权限</span><small>M2</small></div>
      <div className="nav-item unavailable"><ShieldCheck size={18} /><span>企业集成</span><small>M3</small></div>
      <div className="nav-item unavailable"><ArrowUpRight size={18} /><span>发布与升级</span><small>M4</small></div>
      <div className="sidebar-bottom"><div className="core-note"><div className="core-note-icon"><Cpu size={20} /></div><strong>One core. Every interface.</strong><p>让业务逻辑专注于业务，<br />让框架连接每一个终端。</p><button onClick={() => setAbout(true)}>了解架构 <ArrowUpRight size={14} /></button></div><button className="author" onClick={() => setAbout(true)}><span className="avatar">Y</span><span><strong>yunnuo</strong><small>框架作者</small></span><Info size={16} /></button></div>
    </aside>
    <div className="main-shell"><header className="topbar"><div className="breadcrumbs"><button className="icon-button mobile-menu" aria-label="打开导航" onClick={() => setMobileOpen(true)}><Menu size={20} /></button><span className="breadcrumb-root">工作空间</span><ChevronRight size={14} /><strong>{PAGE_LABELS[page]}</strong></div><div className="top-actions"><span className={`connection ${metadata.isSuccess ? 'connected' : ''}`}><span />{metadata.isSuccess ? '核心已连接' : metadata.isPending ? '连接中' : '连接失败'}</span><span className="top-divider" /><button className="icon-button" aria-label="切换主题" title="切换浅色 / 深色" onClick={() => setTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark')}>{theme === 'dark' ? <Moon size={18} /> : <Sun size={18} />}</button><button className="icon-button" aria-label="关于 Unicore" onClick={() => setAbout(true)}><Code2 size={19} /></button><span className="avatar top-avatar">Y</span></div></header>
      <main id="main-content" className="main-content"><div className="page-heading"><div><div className="eyebrow"><span /> UNICORE WORKSPACE</div><h1>{page === 'overview' ? '一份核心，无限可能' : page === 'lab' ? '探索核心的每一种可能' : '打造你的工作空间'}<span className="heading-dot">.</span></h1><p>{page === 'overview' ? '从这里出发，让同一份业务逻辑运行于 Web、桌面与命令行。' : page === 'lab' ? '修改输入、运行用例，验证跨形态一致的执行结果。' : '让界面跟随你的习惯。偏好仅保存在当前设备。'}</p></div><span className="stage-pill"><span /> M1 · 基座已就绪</span></div>
        {metadata.isPending ? <div className="state-card" role="status"><LoaderCircle className="spin" size={24} /><strong>正在连接 Go 核心</strong><p>正在获取当前运行形态与能力信息…</p></div> : metadata.isError ? <div className="state-card error-state" role="alert"><Radio size={26} /><strong>暂时无法连接核心</strong><p>{metadata.error.message}</p><button className="primary-button" onClick={() => metadata.refetch()}><RotateCcw size={16} />重新连接</button></div> : <>
          {page === 'settings' ? <Appearance theme={theme} setTheme={setTheme} /> : <>
            <RuntimeCards metadata={metadata.data} transport={client.transport} />
            {page === 'overview' && <div className="intro-banner"><span className="banner-orbit orbit-one" /><span className="banner-orbit orbit-two" /><div className="banner-content"><span className="banner-tag"><Sparkles size={13} /> 为下一款产品而生</span><h2>构建一次，连接每个终端。</h2><p>领域逻辑保持纯粹，交互体验始终一致。</p><button onClick={() => navigate('lab')}>探索核心实验室 <ArrowRight size={15} /></button></div><div className="banner-diagram" aria-hidden="true"><div className="diagram-core"><Layers3 size={30} /><span>Go Core</span></div><span className="diagram-line" /><div className="diagram-targets"><span><Globe2 size={17} /> Web</span><span><Monitor size={17} /> Desktop</span><span><Terminal size={17} /> CLI</span></div></div></div>}
            <div className="workspace-grid"><CoreLab client={client} /><div className="right-column"><Profiles current={metadata.data.profile} /><Architecture /></div></div>
            {registry.entries().map(widget => <section key={widget.id}>{widget.render(metadata.data)}</section>)}
          </>}
          <div className="foundation-note"><Info size={15} /><span>当前为 M1 开发基座：文本仅在内存中处理。安装、账号、持久化与升级将在后续里程碑实现。</span></div>
        </>}
        <footer><span>© {new Date().getFullYear()} Unicore · Crafted by yunnuo</span><span>Go + React <span className="footer-dot">·</span> {metadata.data ? `v${metadata.data.version}` : 'M1'}</span></footer>
      </main>
    </div>
    {about && <About onClose={() => setAbout(false)} />}
  </div>;
}

function RuntimeCards({ metadata, transport }: { metadata: Bootstrap; transport: AppClient['transport'] }) {
  const cards = [
    { label: '当前运行形态', value: PROFILE_LABELS[metadata.profile], detail: metadata.profile, icon: metadata.profile === 'desktop' ? Monitor : Globe2, color: 'purple' },
    { label: '核心服务', value: '运行正常', detail: '共享用例已就绪', icon: Activity, color: 'green' },
    { label: '连接方式', value: transport === 'http' ? 'HTTP API' : 'Wails Bridge', detail: transport === 'http' ? '/api/v1 · 统一接口契约' : '原生桥接 · 无 HTTP 服务', icon: Braces, color: 'blue' },
    { label: '框架版本', value: `v${metadata.version}`, detail: `${metadata.stage} · ${metadata.deployment_kind}`, icon: Layers3, color: 'orange' },
  ];
  return <section className="runtime-cards" aria-label="运行状态">{cards.map(card => <article className="runtime-card" key={card.label}><div><p>{card.label}</p><strong>{card.value}</strong><small>{card.detail}</small></div><span className={`card-icon ${card.color}`}><card.icon size={20} /></span></article>)}</section>;
}

function CoreLab({ client }: { client: AppClient }) {
  const [text, setText] = useState(SAMPLE);
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState('');
  const [recent, setRecent] = useState<{ result: ExecuteOutput; time: string }[]>([]);
  const execution = useMutation({ mutationFn: () => client.execute({ text }), onSuccess: result => { setCopied(false); setCopyError(''); setRecent(items => [{ result, time: new Date().toLocaleTimeString('zh-CN', { hour12: false }) }, ...items].slice(0, 3)); } });
  const byteLength = new TextEncoder().encode(text).length;
  async function copyDigest() {
    try { await navigator.clipboard.writeText(execution.data!.sha256); setCopied(true); setCopyError(''); }
    catch { setCopyError('复制失败，请手动选择摘要文本复制'); }
  }
  return <section className="panel lab-panel"><div className="panel-heading"><div><h2><FlaskConical size={18} />核心实验室</h2><p>用一个真实用例，验证所有入口</p></div><span className="subtle-badge">文本分析</span></div><form onSubmit={e => { e.preventDefault(); execution.mutate(); }}>
    <div className="editor-label"><label htmlFor="core-input">输入文本</label><button type="button" className="text-button" disabled={execution.isPending} onClick={() => { setText(SAMPLE); execution.reset(); }}><RotateCcw size={12} />重置示例</button></div>
    <div className="editor"><div className="editor-toolbar"><span><i /><i /><i /></span><small>example.txt</small><small>UTF-8</small></div><textarea id="core-input" value={text} onChange={e => setText(e.target.value)} spellCheck={false} aria-describedby="input-hint" placeholder="在这里输入想分析的文本…" /></div>
    <div className="editor-footer"><span id="input-hint" className={byteLength > 65536 ? 'text-error' : ''}>{byteLength.toLocaleString()} / 65,536 字节 <span className="hide-small">· 不保存输入内容</span></span><button className="primary-button" disabled={execution.isPending || !text.trim() || byteLength > 65536}>{execution.isPending ? <LoaderCircle size={15} className="spin" /> : <Play size={14} fill="currentColor" />}{execution.isPending ? '执行中…' : '运行用例'}</button></div>
  </form>
  <div className="result-heading"><span>执行结果</span>{execution.isSuccess ? <span className="success-caption"><CheckCircle2 size={13} />执行成功</span> : <span className="muted">Go Core</span>}</div>
  {execution.isError && <div className="inline-error" role="alert">{execution.error.message}{execution.error instanceof AppError && <small>错误码：{execution.error.code}</small>}</div>}
  <div className="result-grid" aria-live="polite">{[{ key: 'characters', label: 'Unicode 字符', icon: Code2 }, { key: 'words', label: '空白分隔词', icon: Braces }, { key: 'lines', label: '文本行数', icon: Layers3 }].map(({ key, label, icon: Icon }) => <div key={key}><span><Icon size={14} />{label}</span><strong>{execution.data ? execution.data[key as 'characters' | 'words' | 'lines'].toLocaleString() : '—'}</strong></div>)}</div>
  {execution.data ? <div className="digest"><div><span>SHA-256 摘要</span><button className="text-button" type="button" onClick={copyDigest}>{copied ? <Check size={13} /> : <Copy size={13} />}{copied ? '已复制' : '复制'}</button></div><code>{execution.data.sha256}</code>{copyError && <small role="alert">{copyError}</small>}</div> : <div className="result-empty"><Circle size={12} /><span>点击「运行用例」，查看来自真实核心的结果</span></div>}
  <div className="recent-runs"><div><h3>本次会话的运行记录</h3><span className="subtle-badge">{recent.length} 次</span></div>{recent.length ? recent.map((run, index) => <div className="recent-row" key={`${run.time}-${index}`}><span className="recent-check"><Check size={12} /></span><strong>文本分析</strong><span>{run.result.characters} 字符</span><time>{run.time}</time></div>) : <p>暂无运行记录，从第一次执行开始。</p>}</div>
  </section>;
}

function Profiles({ current }: { current: Profile }) {
  const profiles = [{ id: 'web-platform', title: 'Web 平台', detail: '多用户平台 · 身份模块待 M2', icon: Globe2 }, { id: 'web-standalone', title: 'Web 单机', detail: '轻装运行 · 专注本地业务', icon: Monitor }, { id: 'desktop', title: 'Desktop', detail: 'Wails 原生桥接 · 共用界面', icon: Layers3 }, { id: 'cli', title: 'CLI', detail: '独立二进制 · 无数据库依赖', icon: Terminal }];
  return <section className="panel profiles-panel"><div className="panel-heading"><div><h2>一个核心，四种形态</h2><p>入口各自独立，业务始终相同</p></div><span className="tiny-number">04</span></div><div className="profile-list">{profiles.map(item => <div className={`profile-row ${current === item.id ? 'current' : ''}`} key={item.id}><span className="profile-icon"><item.icon size={18} /></span><div><strong>{item.title}</strong><small>{item.detail}</small></div>{current === item.id ? <span className="current-label">当前</span> : <span className="profile-node" aria-label="已接入共享用例" />}</div>)}</div><div className="profile-bottom"><CheckCircle2 size={14} /><span>同一份 Go 业务逻辑 · 同一个接口契约</span></div></section>;
}

function Architecture() {
  return <section className="panel architecture-panel"><div className="panel-heading"><div><h2>清晰的边界，更自由的扩展</h2><p>依赖向内，让核心保持纯粹</p></div></div><div className="architecture-flow"><div><span><Globe2 size={13} />HTTP</span><span><Monitor size={13} />Wails</span><span><Terminal size={13} />CLI</span></div><ArrowDown size={16} /><strong><Cpu size={17} /> Application / Go Core</strong></div><p className="architecture-detail">领域层独立于 UI、传输与存储。新增产品只需扩展自己的业务模块。</p></section>;
}

function Appearance({ theme, setTheme }: { theme: Theme; setTheme: (theme: Theme) => void }) {
  const choices = [{ id: 'light', title: '浅色', detail: '明亮清晰，专注每一处细节', icon: Sun }, { id: 'dark', title: '深色', detail: '柔和低光，适合夜间工作', icon: Moon }, { id: 'system', title: '跟随系统', detail: '自动匹配设备的外观偏好', icon: Monitor }] as const;
  return <section className="panel appearance-panel"><div className="panel-heading"><div><h2>界面主题</h2><p>偏好会自动保存，也会应用于桌面版本</p></div><span className="subtle-badge">本机设置</span></div><div className="theme-choices" role="group" aria-label="界面主题">{choices.map(({ id, title, detail, icon: Icon }) => <button key={id} className={`theme-choice ${theme === id ? 'selected' : ''}`} aria-pressed={theme === id} onClick={() => setTheme(id)}><div className={`theme-preview ${id}`}><span /><div><i /><i /><i /></div></div><strong><Icon size={16} />{title}{theme === id && <CheckCircle2 size={16} />}</strong><small>{detail}</small></button>)}</div><div className="preference-saved" role="status"><CheckCircle2 size={15} />当前偏好：{choices.find(choice => choice.id === theme)?.title} · 自动保存</div></section>;
}

function About({ onClose }: { onClose: () => void }) {
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
    return () => { window.removeEventListener('keydown', keydown); previous?.focus(); };
  }, [onClose]);
  return <div className="modal-scrim" onClick={event => { if (event.target === event.currentTarget) onClose(); }}><div className="about-dialog" role="dialog" aria-modal="true" aria-labelledby="about-title" tabIndex={-1} ref={dialogRef}><button className="icon-button close-dialog" aria-label="关闭关于" onClick={onClose}><X size={20} /></button><span className="brand-mark"><Layers3 size={25} /></span><h2 id="about-title">Unicore</h2><p>一套 Go Core，一套 React UI。<br />为 Web、桌面与命令行构建可复用的应用基座。</p><div className="about-stack"><span>Go</span><span>React</span><span>Wails v2</span><span>Cobra</span></div><p className="muted">当前交付：M1 跨形态最小闭环。<br />完整范围、路线图与验收记录请阅读仓库 docs/。</p><a href="mailto:ymz@ebox.vip">yunnuo · ymz@ebox.vip <ExternalLink size={13} /></a></div></div>;
}

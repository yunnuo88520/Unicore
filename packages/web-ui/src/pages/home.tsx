// Author: yunnuo <ymz@ebox.vip>
// Description: Public, session-aware product homepage with factual form comparisons and optional motion.
import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, BookOpen, Check, ChevronRight, FileText, Laptop, Menu, Network, ShieldCheck, Terminal, Users, X } from 'lucide-react';
import { buttonVariants, TabsPrimitive } from '@unicore/ui';
import { cn } from '@unicore/ui/cn';
import { t, useLocale, defineMessages } from '../i18n';
import { productCommand, productName } from '../product.gen';
import { BrandLockup } from '../brand';
import { SiteFooter } from '../site-footer';
import { ClientControls } from '../client-controls';
import { workspaceLinks } from '../shell-tools';
import type { PageProps } from '../router';
import './home.css';

const forms = defineMessages([
  { id: 'platform', name: '多用户平台', icon: Users, title: '让团队在同一处协作', description: '通过浏览器访问，共享业务空间，以账号、角色和权限管理协作边界。', points: ['统一账号与角色权限', '笔记、业务附件与通知', '独立的管理工作台'], carrier: 'Web' },
  { id: 'standalone', name: '单机', icon: Laptop, title: '把专注留给自己的工作', description: '通过本地 Web 或桌面应用使用，同一套单机业务，无需创建账号或登录。', points: ['本地笔记与业务附件', 'Web 与桌面两种载体', '设备外观与本机运行监控'], carrier: 'Web / Desktop' },
  { id: 'cli', name: '命令行', icon: Terminal, title: '让工具融入现有流程', description: '从终端直接调用共享核心，处理标准输入与结构化输出，不启动图形界面。', points: ['直接调用共享核心', '支持脚本与管道', '无界面、无自身持久化'], carrier: 'CLI' },
]);
const features = defineMessages([
  { icon: FileText, title: '从日常业务开始', description: '用笔记整理信息，为业务内容添加附件；平台与单机都保留各自的工作空间。', scope: 'Platform / Standalone' },
  { icon: ShieldCheck, title: '把协作边界说清楚', description: '平台通过统一账号、多角色和细粒度权限管理访问，支持双重验证与操作审计。', scope: 'Platform' },
  { icon: Network, title: '让消息找到合适的人', description: '平台将业务事件交给通知渠道，支持站内信、邮件、企业微信与 Webhook。', scope: 'Platform' },
  { icon: Terminal, title: '为自己的业务留出空间', description: '从共享核心扩展业务，通过 Web、桌面或命令行承载适用的能力。', scope: 'Core' },
]);

export function HomePage({ metadata, client }: PageProps) {
  useLocale();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);
  const policy = useQuery({ queryKey: ['auth-policy'], queryFn: () => client.web!.authPolicy(), enabled: !!client.web && !metadata.current_user });
  const signedIn = !!metadata.current_user;
  const destination = signedIn ? '/' : '/login';
  const action = signedIn ? t('进入工作空间') : t('登录工作空间');
  const canRegister = !signedIn && policy.data?.registration_enabled === true;
  useEffect(() => {
    if (!menuOpen) return;
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') { setMenuOpen(false); menuButton.current?.focus(); } };
    document.addEventListener('keydown', escape);
    return () => document.removeEventListener('keydown', escape);
  }, [menuOpen]);
  const scrollTo = (id: string) => {
    setMenuOpen(false);
    document.getElementById(id)?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
  };
  return <div className="public-home flex min-h-dvh flex-col bg-background text-ink">
    <a href="#home-main" className="sr-only focus:not-sr-only focus:fixed focus:start-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-surface focus:p-3">{t('跳到主要内容')}</a>
    <header className="sticky top-0 z-40 border-b border-line bg-background">
      <nav aria-label={t('站点导航')} className="mx-auto flex min-h-16 max-w-6xl items-center justify-between gap-3 px-4 md:px-8">
        <a href="/home" aria-label={metadata.site_name} className="flex shrink-0 items-center gap-2 text-lg font-semibold"><BrandLockup name={metadata.site_name} /></a>
        <div className="hidden items-center gap-1 lg:flex">
          <button type="button" className={buttonVariants({ variant: 'ghost' })} onClick={() => scrollTo('home-features')}>{t('产品特性')}</button>
          <button type="button" className={buttonVariants({ variant: 'ghost' })} onClick={() => scrollTo('home-how')}>{t('快速开始')}</button>
          <a className={buttonVariants({ variant: 'ghost' })} href={workspaceLinks.documentation} target="_blank" rel="noopener noreferrer">{t('帮助文档')}</a>
        </div>
        <div className="flex items-center gap-2">
          <ClientControls showAppearanceSettings={false} />
          <a className={cn(buttonVariants({ size: 'sm' }), 'hidden sm:inline-flex')} href={destination}>{action}<ArrowRight size={14} aria-hidden="true" /></a>
          <button ref={menuButton} type="button" className={cn(buttonVariants({ variant: 'ghost', size: 'icon' }), 'lg:hidden')} aria-label={t(menuOpen ? '关闭导航' : '打开导航')} aria-expanded={menuOpen} aria-controls="home-mobile-nav" onClick={() => setMenuOpen(value => !value)}>
            {menuOpen ? <X size={18} aria-hidden="true" /> : <Menu size={18} aria-hidden="true" />}
          </button>
        </div>
      </nav>
      {menuOpen && <div id="home-mobile-nav" className="home-enter border-t border-line px-4 py-3 lg:hidden">
        <div className="mx-auto flex max-w-6xl flex-col items-stretch gap-1">
          <button type="button" className={cn(buttonVariants({ variant: 'ghost' }), 'justify-start')} onClick={() => scrollTo('home-features')}>{t('产品特性')}</button>
          <button type="button" className={cn(buttonVariants({ variant: 'ghost' }), 'justify-start')} onClick={() => scrollTo('home-how')}>{t('快速开始')}</button>
          <a className={cn(buttonVariants({ variant: 'ghost' }), 'justify-start')} href={workspaceLinks.documentation} target="_blank" rel="noopener noreferrer">{t('帮助文档')}</a>
          <a className={cn(buttonVariants(), 'mt-2')} href={destination}>{action}<ArrowRight size={14} aria-hidden="true" /></a>
        </div>
      </div>}
    </header>
    <main id="home-main" className="flex-1">
      <section className="px-4 py-16 md:px-8 md:py-24">
        <div className="mx-auto grid max-w-6xl items-center gap-12 lg:grid-cols-2 lg:gap-16">
          <div className="home-enter min-w-0">
            <p className="mb-6 flex items-center gap-3 text-sm text-muted"><span className="h-px w-8 bg-accent" aria-hidden="true" />{t('由你掌握的工作空间')}</p>
            <h1 className="text-[clamp(2.25rem,4.5vw,4rem)] font-medium leading-[1.15] tracking-tight">
              <span className="sr-only">{t('一份核心，多种工作方式')}</span>
              <span aria-hidden="true">{t('一份核心，')}<br /><Typewriter text={t('多种工作方式')} /></span>
            </h1>
            <p className="mt-6 max-w-lg text-base leading-relaxed text-muted">{metadata.site_description || t('面向团队协作、个人本地工作与命令行工具的可扩展应用框架。选择合适的形态，构建自己的业务。')}</p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <a href={destination} className={cn(buttonVariants({ size: 'lg' }), 'h-11')}>{action}<ArrowRight size={16} aria-hidden="true" /></a>
              <a href={workspaceLinks.quickStart} target="_blank" rel="noopener noreferrer" className={cn(buttonVariants({ variant: 'secondary', size: 'lg' }), 'h-11')}><BookOpen size={16} aria-hidden="true" />{t('部署文档')}</a>
            </div>
            {canRegister && <p className="mt-4 text-sm text-muted">{t('还没有账号？')} <a href="/register" className="text-accent underline-offset-4 hover:underline">{t('创建账号')}</a></p>}
            <p className="mt-8 text-xs leading-relaxed text-muted">{t('Platform · Standalone · CLI，三种形态，共享核心')}</p>
          </div>
          <FormExplorer />
        </div>
      </section>
      <section id="home-features" aria-labelledby="home-features-title" className="scroll-mt-24 border-y border-line bg-surface px-4 py-16 md:px-8 md:py-20">
        <div className="mx-auto max-w-6xl">
          <div className="mb-10 max-w-2xl"><p className="mb-3 text-sm text-muted">{t('产品特性')}</p><h2 id="home-features-title" className="text-3xl font-medium leading-tight">{t('把基础做好，让业务向前')}</h2><p className="mt-4 text-sm leading-relaxed text-muted">{t('不同形态承担不同的工作，功能边界清晰，按实际需要选择。')}</p></div>
          <div className="grid gap-x-16 gap-y-8 md:grid-cols-2">
            {features.map(feature => <article key={feature.title} className="flex gap-4 border-t border-line pt-6"><feature.icon size={20} strokeWidth={1.5} className="mt-1 shrink-0 text-muted" aria-hidden="true" /><div><h3 className="text-base font-medium">{t(feature.title)}</h3><p className="mt-2 max-w-md text-sm leading-relaxed text-muted">{t(feature.description)}</p><p className="mt-3 font-mono text-xs text-muted">{feature.scope}</p></div></article>)}
          </div>
        </div>
      </section>
      <section id="home-how" aria-labelledby="home-how-title" className="scroll-mt-24 px-4 py-16 md:px-8 md:py-20">
        <div className="mx-auto max-w-6xl">
          <h2 id="home-how-title" className="text-3xl font-medium">{t('从选择到开始，路径清楚')}</h2>
          <div className="mt-10 grid gap-8 md:grid-cols-3">
            {defineMessages([
              { title: '选择适合的形态', description: '团队选平台，个人选单机，脚本选命令行；单机可使用 Web 或桌面载体。' },
              { title: '准备运行环境', description: 'Web 通过安装向导配置数据库；桌面自动初始化本地数据；CLI 直接运行。' },
              { title: '进入自己的工作', description: '平台使用账号登录，单机直接进入工作空间，开发者可继续扩展业务模块。' },
            ]).map((step, index) => <article key={step.title} className="border-t border-line pt-5"><span className="font-mono text-sm tabular-nums text-accent">0{index + 1}</span><h3 className="mt-4 text-base font-medium">{t(step.title)}</h3><p className="mt-2 text-sm leading-relaxed text-muted">{t(step.description)}</p></article>)}
          </div>
        </div>
      </section>
      <section className="border-t border-line px-4 py-12 md:px-8 md:py-16" aria-label={t('开始使用')}>
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-6"><div><h2 className="text-2xl font-medium">{t('下一步，进入你的工作空间')}</h2><p className="mt-2 text-sm text-muted">{t('继续已有工作，或阅读文档了解部署与扩展。')}</p></div><a href={destination} className={cn(buttonVariants({ size: 'lg' }), 'h-11')}>{action}<ArrowRight size={16} aria-hidden="true" /></a></div>
      </section>
    </main>
    <div className="px-4 pb-8 md:px-8"><SiteFooter metadata={metadata} /></div>
  </div>;
}

/** The accessible heading stays whole while the visual copy types once, with a stable line box. */
function Typewriter({ text }: { text: string }) {
  const [visible, setVisible] = useState(text);
  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    let timer: ReturnType<typeof setInterval> | undefined;
    const stop = () => { clearInterval(timer); setVisible(text); };
    if (media.matches) { stop(); return; }
    const letters = Array.from(text);
    let index = 0;
    setVisible('');
    timer = setInterval(() => { index += 1; setVisible(letters.slice(0, index).join('')); if (index >= letters.length) clearInterval(timer); }, 95);
    media.addEventListener('change', stop);
    return () => { clearInterval(timer); media.removeEventListener('change', stop); };
  }, [text]);
  return <span className="relative inline-grid max-w-full text-accent"><span className="invisible col-start-1 row-start-1">{text}</span><span className="home-typed col-start-1 row-start-1">{visible}</span></span>;
}

/** An interactive capability comparison, not a simulated runtime dashboard. */
function FormExplorer() {
  const [active, setActive] = useState('platform');
  return <TabsPrimitive.Root value={active} onValueChange={setActive} className="home-enter min-w-0 rounded-2xl border border-line bg-surface shadow-card">
    <div className="flex items-center justify-between gap-3 border-b border-line px-6 py-4"><p className="flex items-center gap-2 text-sm font-medium"><Network size={16} aria-hidden="true" />{t('选择你的工作方式')}</p><span className="font-mono text-xs text-muted">{productName}</span></div>
    <div className="p-4 sm:p-6">
      <TabsPrimitive.List aria-label={t('产品形态')} className="w-full justify-center border-0 bg-surface-alt shadow-none">
        {forms.map(form => <TabsPrimitive.Trigger key={form.id} value={form.id} className="min-w-0 flex-1 gap-2 px-2"><form.icon size={16} aria-hidden="true" /><span>{t(form.name)}</span></TabsPrimitive.Trigger>)}
      </TabsPrimitive.List>
      {forms.map(form => <TabsPrimitive.Content key={form.id} value={form.id} className="home-panel min-h-80 pt-8 outline-none focus-visible:ring-2 focus-visible:ring-focus">
        <div className="mb-6 flex items-center gap-3"><span className="flex size-12 items-center justify-center rounded-xl bg-primary-soft text-accent"><form.icon size={24} strokeWidth={1.5} aria-hidden="true" /></span><span className="font-mono text-xs text-muted">{form.carrier}</span></div>
        <h2 className="text-xl font-medium">{t(form.title)}</h2><p className="mt-3 text-sm leading-relaxed text-muted">{t(form.description)}</p>
        <ul className="mt-6 flex flex-col gap-3">{form.points.map(point => <li key={point} className="flex items-center gap-2 text-sm"><Check size={16} className="shrink-0 text-accent" aria-hidden="true" />{t(point)}</li>)}</ul>
        {form.id === 'cli' && <code className="mt-5 block break-words rounded-lg bg-surface-alt px-3 py-2 text-xs">{productCommand} execute --text &quot;Hello {productName}&quot;</code>}
      </TabsPrimitive.Content>)}
    </div>
    <div className="flex items-center gap-2 border-t border-line px-6 py-4 text-xs text-muted"><ChevronRight size={14} aria-hidden="true" />{t('单机的 Web 与桌面载体，提供等效的产品能力')}</div>
  </TabsPrimitive.Root>;
}

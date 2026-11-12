// Author: yunnuo <ymz@ebox.vip>
// Description: Public product homepage behind site.home_enabled: split hero with terminal demo, stats, feature bento and CTA for unauthenticated visitors.
import { useEffect, useRef, useState } from 'react';
import { useRouter } from '@tanstack/react-router';
import { ArrowRight, BookOpen, Check, Database, Download, Gauge, HardDrive, HeartHandshake, KeyRound, Menu, MessageCircle, Mail, BellRing, Building2, Settings2, ShieldCheck, Terminal as TerminalIcon, UserPlus, Webhook } from 'lucide-react';
import type { Bootstrap } from '@unicore/sdk';
import { t, useLocale } from '../i18n';
import { productCommand } from '../product.gen';
import { BrandLockup } from '../brand';
import { SiteFooter } from '../site-footer';
import { ClientControls } from '../client-controls';
import { workspaceLinks } from '../shell-tools';
import { cn } from '@unicore/ui/cn';
import { Button } from '@unicore/ui';
import type { PageProps } from '../router';

/** Public landing page rendered by the shell for guests when site.home_enabled is on. */
export function HomePage({ metadata }: PageProps) {
  useLocale();
  const router = useRouter();
  const jump = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
  const version = metadata.version ? `v${metadata.version}` : '';
  return <div className="flex min-h-dvh flex-col bg-background text-ink">
    <header className="sticky top-0 z-40 border-b border-line bg-background">
      <div className="mx-auto flex max-w-6xl px-4 md:px-6">
        <nav aria-label={t('站点导航')} className="flex h-16 w-full items-center justify-between gap-2">
          {/* display:contents on BrandLockup makes its children flex items; keep logo+title glued together. */}
          <span className="flex items-center gap-2 text-lg font-semibold text-ink"><BrandLockup name={metadata.site_name} /></span>
          <div className="hidden min-w-0 items-center gap-0.5 lg:flex">
            <NavButton label={t('产品特性')} onClick={() => jump('home-features')} />
            <NavButton label={t('快速开始')} onClick={() => jump('home-how')} />
            <a className="rounded-lg px-3 py-1.5 text-sm font-medium text-muted transition-colors hover:text-ink" href={workspaceLinks.documentation} target="_blank" rel="noopener noreferrer">{t('帮助文档')}</a>
            <span className="mx-2 h-4 w-px bg-line" aria-hidden="true" />
            <ClientControls />
            <span className="mx-2 h-4 w-px bg-line" aria-hidden="true" />
            <a className="rounded-lg px-3 py-1.5 text-sm font-medium text-muted transition-colors hover:text-ink" href="/login" onClick={event => { event.preventDefault(); void router.navigate({ to: '/login' }); }}>{t('登录')}</a>
            <Button size="sm" onClick={() => void router.navigate({ to: '/register' })}>
              {t('免费注册')}<ArrowRight size={13} aria-hidden="true" />
            </Button>
          </div>
          <button type="button" className="grid size-9 place-items-center rounded-lg text-muted hover:bg-surface-alt hover:text-ink lg:hidden" aria-label={t('打开导航')}>
            <Menu size={18} aria-hidden="true" />
          </button>
        </nav>
      </div>
    </header>
    <main className="flex-1">
      <Hero metadata={metadata} version={version} onRegister={() => void router.navigate({ to: '/register' })} />
      <Stats />
      <Features />
      <HowItWorks />
      <CallToAction onRegister={() => void router.navigate({ to: '/register' })} />
    </main>
    <div className="px-4 pb-8 md:px-6"><SiteFooter metadata={metadata} /></div>
  </div>;
}

function NavButton({ label, onClick }: { label: string; onClick: () => void }) {
  return <button type="button" className="rounded-lg px-3 py-1.5 text-sm font-medium text-muted transition-colors hover:text-ink" onClick={onClick}>{label}</button>;
}

/** Split hero: copy + ecosystem chips on the left, terminal demo on the right. */
function Hero({ metadata, version, onRegister }: { metadata: Bootstrap; version: string; onRegister: () => void }) {
  return <section className="relative overflow-hidden px-4 pb-16 pt-14 md:px-6 md:pb-24 md:pt-24 lg:pb-28 lg:pt-32">
    <div aria-hidden="true" className="pointer-events-none absolute inset-0">
      <span className="absolute inset-0 opacity-10 [mask-image:radial-gradient(ellipse_60%_52%_at_50%_28%,black_18%,transparent_100%)] [background-size:56px_56px] bg-[linear-gradient(to_right,var(--color-line)_1px,transparent_1px),linear-gradient(to_bottom,var(--color-line)_1px,transparent_1px)]" />
    </div>
    <div className="relative mx-auto grid max-w-6xl grid-cols-1 items-start gap-12 lg:grid-cols-12 lg:gap-8">
      <div className="flex flex-col items-start text-left lg:col-span-6">
        {version && <span className="mb-5 inline-flex items-center gap-2 rounded-full border border-[var(--primary-border)] bg-[var(--primary-soft)] px-3 py-1.5 text-xs font-medium text-accent">
          <span className="size-1.5 rounded-full bg-accent" aria-hidden="true" />
          {t('{{v0}} 现已发布', { v0: version })}
        </span>}
        <h1 className="text-[clamp(2.1rem,4.5vw,3.1rem)] font-semibold leading-[1.16] tracking-tight">
          {t('一份核心，')}<br />{t('运行于每个终端')}
        </h1>
        <p className="mt-5 max-w-xl text-[15px] leading-relaxed text-muted [text-wrap:balance]">{metadata.site_description || t('自托管的一站式工作空间：文件、笔记、用户与通知开箱即用，几分钟完成部署。')}</p>
        <div className="mt-8 flex flex-wrap items-center gap-3">
          <Button size="lg" className="group" onClick={onRegister}>
            {t('免费注册')}<ArrowRight size={15} aria-hidden="true" className="transition-transform duration-200 group-hover:translate-x-0.5" />
          </Button>
          <a className="inline-flex h-11 items-center gap-2 rounded-lg border border-line bg-surface px-5 text-sm font-medium text-ink transition-colors hover:border-[var(--primary-border)] hover:text-accent" href={workspaceLinks.quickStart} target="_blank" rel="noopener noreferrer">
            <BookOpen size={15} aria-hidden="true" />{t('部署文档')}
          </a>
        </div>
        <div className="mt-10 w-full max-w-xl">
          <p className="text-xs font-medium text-muted">{t('兼容生态')}</p>
          <p className="mt-1 text-xs text-muted">{t('从嵌入式 SQLite 到多节点 MySQL / PostgreSQL 集群，按规模自由选择。')}</p>
          <div className="mt-3.5 flex flex-wrap items-center gap-2.5">
            <EcoChip icon={<Database size={15} aria-hidden="true" />} label="MySQL" detail={t('· PostgreSQL · SQLite')} />
            <EcoChip icon={<HardDrive size={15} aria-hidden="true" />} label="S3" detail={t('· MinIO · 本地磁盘')} />
            <EcoChip icon={<KeyRound size={15} aria-hidden="true" />} label="OIDC" detail={t('单点登录')} />
          </div>
        </div>
      </div>
      <div className="flex w-full justify-center lg:col-span-6 lg:mt-2">
        <TerminalDemo />
      </div>
    </div>
  </section>;
}

function EcoChip({ icon, label, detail }: { icon: React.ReactNode; label: string; detail: string }) {
  return <span className="inline-flex items-center gap-2 rounded-full border border-line bg-surface/60 px-4 py-2 text-sm font-medium text-ink transition-colors hover:border-[var(--primary-border)]">
    <span className="text-accent">{icon}</span>{label}<small className="font-normal text-muted">{detail}</small>
  </span>;
}

const TERMINAL_TABS = ['install', 'api', 'backup'] as const;

/** Terminal-style demo card: install flow, file API and backup log, mirroring the approved design. */
function TerminalDemo() {
  const [tab, setTab] = useState<(typeof TERMINAL_TABS)[number]>('install');
  const accents = { install: { text: 'text-success', border: 'border-success', badge: 'bg-[var(--success-soft)] text-success', method: 'SH' }, api: { text: 'text-accent', border: 'border-accent', badge: 'bg-primary-soft text-accent', method: 'POST' }, backup: { text: 'text-info', border: 'border-info', badge: 'bg-[var(--info-soft)] text-info', method: 'GET' } } as const;
  const accent = accents[tab];
  const endpoint = tab === 'install' ? `./${productCommand} --listen 127.0.0.1:8080` : tab === 'api' ? '/api/v1/files — ' + t('上传与直传') : '/api/v1/admin/backups — ' + t('备份与恢复');
  return <div className="w-full max-w-xl overflow-hidden rounded-2xl border border-line bg-surface/95 shadow-card backdrop-blur-sm">
    <div role="tablist" aria-label={t('示例')} className="flex items-center gap-0.5 border-b border-line px-2.5">
      {([['install', t('安装')], ['api', 'API'], ['backup', t('备份')]] as const).map(([id, label]) => (
        <button key={id} type="button" role="tab" aria-selected={tab === id}
          className={cn('-mb-px border-b-2 px-2.5 py-2.5 text-xs font-medium tracking-wide transition-colors', tab === id ? cn(accent.border, accent.text) : 'border-transparent text-muted hover:text-ink')}
          onClick={() => setTab(id)}>{label}</button>
      ))}
      <span className="ml-auto flex items-center gap-2 pr-2">
        <span className="size-1.5 rounded-full bg-success" aria-hidden="true" />
        <span className="font-mono text-[10px] uppercase tracking-wider text-subtle">200 OK</span>
      </span>
    </div>
    <div className="flex items-center gap-2.5 border-b border-line px-5 py-3">
      <span className={cn('rounded-md px-1.5 py-0.5 font-mono text-[10px] font-semibold tracking-wider', accent.badge)}>{accent.method}</span>
      <code className="truncate font-mono text-[12.5px] text-ink/75">{endpoint}</code>
    </div>
    <div className="grid min-h-[264px] grid-rows-[150px_minmax(0,1fr)] font-mono text-[12.5px] leading-[1.6]">
      <div className="overflow-hidden px-5 py-3.5">
        <p className="text-[10px] font-medium text-subtle">{tab === 'api' ? t('请求') : tab === 'backup' ? t('日志') : t('终端')}</p>
        <div className="mt-2 whitespace-pre-wrap break-words">
          {tab === 'install' && <TerminalInstall />}
          {tab === 'api' && <TerminalApi />}
          {tab === 'backup' && <TerminalBackup />}
        </div>
      </div>
      <div className="overflow-hidden border-t border-dashed border-line px-5 py-3.5">
        <p className="text-[10px] font-medium text-subtle">{tab === 'install' ? t('输出') : t('响应')}</p>
        <div className="mt-2 whitespace-pre-wrap break-words">
          {tab === 'install' && <TerminalInstallOutput />}
          {tab === 'api' && <TerminalApiResponse />}
          {tab === 'backup' && <TerminalBackupOutput />}
        </div>
      </div>
    </div>
    <div className="flex items-center justify-between border-t border-line bg-surface-alt px-5 py-2.5">
      <span className="flex items-center gap-2.5 font-mono text-[10.5px] text-muted">
        {tab === 'install' && <><span className="font-mono">1.2s</span>{t('启动')}<span className="size-1 rounded-full bg-line" aria-hidden="true" /><span className="font-mono">v0.1.2</span>{t('版本')}<span className="size-1 rounded-full bg-line" aria-hidden="true" />SQLite {t('已连接')}</>}
        {tab === 'api' && <><span className="font-mono">23ms</span>REST<span className="size-1 rounded-full bg-line" aria-hidden="true" /><span className="font-mono">S3</span>{t('对象存储')}</>}
        {tab === 'backup' && <><span className="font-mono">15s</span>{t('每日')}<span className="size-1 rounded-full bg-line" aria-hidden="true" /><span className="font-mono">sha256</span>{t('校验通过')}</>}
      </span>
      <span className="font-mono text-[10px] uppercase tracking-wider text-subtle">{t('单二进制 · 零依赖')}</span>
    </div>
  </div>;
}

function TerminalInstall() {
  return <>
    <span className="text-muted"># {t('下载并启动，单二进制无依赖')}</span>{'\n'}
    <span className="text-success">$</span> ./{productCommand} --help{'\n'}
    <span className="text-success">$</span> ./{productCommand} --listen 127.0.0.1:8080
  </>;
}
function TerminalInstallOutput() {
  return <>
    <CheckLine label={t('核心已连接')} />{'\n'}
    <CheckLine label={t('数据库初始化完成')} tail=" SQLite" />{'\n'}
    <CheckLine label={t('监听')} tail=" https://0.0.0.0:443" highlight />
  </>;
}
function TerminalApi() {
  return <>{'{'}{'\n'}  <Key k='"name"' />: <Str v='"product-brief-v3.pdf"' />,{'\n'}  <Key k='"storage"' />: <Str v='"s3-primary"' />{'\n'}{'}'}</>;
}
function TerminalApiResponse() {
  return <>{'{'}{'\n'}  <Key k='"file_id"' />: <Str v='"fil_9f2c…"' />,{'\n'}  <Key k='"url"' />: <Str v='"https://…"' />{'\n'}{'}'}</>;
}
function TerminalBackup() {
  return <>
    <span className="text-muted"># {t('每日凌晨自动备份')}</span>{'\n'}
    <span className="text-muted">[02:00:04] snapshot → s3://backup/1129</span>{'\n'}
    <span className="text-muted">[02:00:19] {t('校验 sha256 通过')}</span>
  </>;
}
function TerminalBackupOutput() {
  return <>
    <CheckLine label={t('1129 个快照可用')} />{'\n'}
    <CheckLine label={t('最近一次恢复演练')} tail=" 3min 41s" highlight />
  </>;
}
function CheckLine({ label, tail, highlight = false }: { label: string; tail?: string; highlight?: boolean }) {
  return <><span className="font-medium text-success">✓</span> <span className="text-muted">{label}</span>{tail && <span className={highlight ? 'font-medium text-[var(--color-accent-soft)]' : 'text-muted'}>{tail}</span>}</>;
}
function Key({ k }: { k: string }) { return <span className="text-info">{k}</span>; }
function Str({ v }: { v: string }) { return <span className="text-success">{v}</span>; }

/** Animated counters behind a quiet border-y strip (new-api stats anatomy). */
function Stats() {
  return <section aria-label={t('产品数据')} className="border-y border-line bg-surface/30">
    <div className="mx-auto grid max-w-6xl grid-cols-2 gap-y-8 px-4 py-10 md:grid-cols-4 md:px-6 md:py-12">
      <Stat end={20} suffix="+" label={t('内置功能模块')} />
      <Stat end={3} label={t('支持的主流数据库')} />
      <Stat end={4} label={t('交付形态：Web · 桌面 · CLI')} />
      <Stat end={100} suffix="%" label={t('源码开放，可自托管')} />
    </div>
  </section>;
}

function Stat({ end, suffix = '', label }: { end: number; suffix?: string; label: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { el.textContent = `${end}${suffix}`; return; }
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      observer.disconnect();
      const start = performance.now();
      const duration = 1400;
      const step = (now: number) => {
        const progress = Math.min((now - start) / duration, 1);
        el.textContent = `${Math.round(end * (1 - Math.pow(1 - progress, 3)))}${suffix}`;
        if (progress < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    }, { threshold: 0.5 });
    observer.observe(el);
    return () => observer.disconnect();
  }, [end, suffix]);
  return <div className="flex flex-col items-center text-center">
    <span ref={ref} className="text-2xl font-semibold tracking-tight tabular-nums md:text-3xl">{`${end}${suffix}`}</span>
    <span className="mt-1.5 text-xs text-muted">{label}</span>
  </div>;
}

/** Hairline bento grid plus a quiet four-up row (new-api features anatomy). */
function Features() {
  return <section id="home-features" aria-label={t('产品特性')} className="scroll-mt-24 px-4 py-20 md:px-6 md:py-28">
    <div className="mx-auto max-w-6xl">
      <p className="mb-3 text-xs font-medium text-muted">{t('核心特性')}</p>
      <h2 className="text-2xl font-semibold leading-tight tracking-tight md:text-3xl">{t('为团队而生，')}<br />{t('为规模而设计')}</h2>
      <div className="mt-12 grid grid-cols-1 gap-px overflow-hidden rounded-xl border border-line bg-line md:grid-cols-3">
        <BentoCell num="01" span title={t('文件存储')} desc={t('本地磁盘与 S3 / MinIO 对象存储，分片直传、签名下载与生命周期管理开箱即用。')}>
          <div className="mt-4 grid grid-cols-3 gap-2">
            {[t('本地磁盘'), 'S3', 'MinIO', t('分片直传'), t('签名下载'), t('生命周期')].map(name => (
              <span key={name} className="flex items-center justify-center rounded-lg border border-line px-2 py-2 text-xs text-muted transition-colors hover:border-[var(--primary-border)] hover:text-accent">{name}</span>
            ))}
          </div>
        </BentoCell>
        <BentoCell num="02" title={t('安全与审计')} desc={t('企业级安全：TOTP 双因素、登录保护与全量审计日志导出。')}>
          <div className="mt-4 flex justify-center py-2">
            <span className="relative flex size-16 items-center justify-center rounded-2xl border border-[var(--success-soft)] bg-[var(--success-soft)]">
              <ShieldCheck size={26} aria-hidden="true" className="text-success" />
              <span className="absolute -right-1 -top-1 flex size-4 items-center justify-center rounded-full bg-success text-[9px] font-semibold text-on-primary">✓</span>
            </span>
          </div>
        </BentoCell>
        <BentoCell num="03" title={t('用户与角色')} desc={t('管理员与普通用户双角色，菜单、页面与 API 权限逐点控制。')}>
          <div className="mt-4 flex flex-col gap-2.5">
            {[t('角色隔离'), t('权限点控制'), t('审计追踪')].map((step, index) => (
              <div key={step} className="flex items-center gap-2.5">
                <span className={cn('flex size-6 shrink-0 items-center justify-center rounded-full border text-[10px] font-semibold', index === 0 ? 'border-[var(--primary-border)] bg-primary-soft text-accent' : 'border-line bg-surface-alt text-muted')}>{index + 1}</span>
                <span className="h-px flex-1 bg-line" aria-hidden="true" />
                <small className="text-xs text-muted">{step}</small>
              </div>
            ))}
          </div>
        </BentoCell>
        <BentoCell num="04" span title={t('通知与集成')} desc={t('企业微信、Webhook 与邮件模板按事件路由；REST API 与 CLI 覆盖自动化场景。')}>
          <div className="mt-4 flex items-center gap-3">
            <span className="flex">
              {[<MessageCircle size={13} aria-hidden="true" key="w" />, <Webhook size={13} aria-hidden="true" key="h" />, <Mail size={13} aria-hidden="true" key="m" />, <TerminalIcon size={13} aria-hidden="true" key="t" />].map((icon, index) => (
                <span key={index} className={cn('flex size-8 items-center justify-center rounded-full border-2 border-background bg-surface-alt text-muted', index > 0 && '-ms-2')}>{icon}</span>
              ))}
            </span>
            <small className="flex items-center gap-1.5 text-xs text-muted"><Webhook size={13} aria-hidden="true" className="text-info" />{t('多渠道事件路由')}</small>
          </div>
        </BentoCell>
      </div>
      <div className="mt-12 grid grid-cols-2 gap-x-4 gap-y-8 md:grid-cols-4 md:gap-12">
        <ExtraItem icon={<Gauge size={21} strokeWidth={1.5} aria-hidden="true" />} title={t('高性能')} desc={t('单二进制部署，无外部依赖，资源占用低。')} />
        <ExtraItem icon={<Building2 size={21} strokeWidth={1.5} aria-hidden="true" />} title={t('企业身份')} desc={t('OIDC 单点登录与企业账号绑定。')} />
        <ExtraItem icon={<BellRing size={21} strokeWidth={1.5} aria-hidden="true" />} title={t('通知中心')} desc={t('按事件路由到企业微信、Webhook 与邮件。')} />
        <ExtraItem icon={<HeartHandshake size={21} strokeWidth={1.5} aria-hidden="true" />} title={t('开源自托管')} desc={t('社区驱动，源码开放，可自由扩展。')} />
      </div>
    </div>
  </section>;
}

function BentoCell({ num, title, desc, span = false, children }: { num: string; title: string; desc: string; span?: boolean; children: React.ReactNode }) {
  return <div className={cn('bg-background p-6 transition-colors duration-300 hover:bg-surface-alt/60 md:p-7', span && 'md:col-span-2')}>
    <div className="mb-3 flex items-center gap-3">
      <span className="flex size-7 items-center justify-center rounded-md border border-line bg-surface-alt text-[10px] font-semibold tabular-nums text-muted">{num}</span>
      <h3 className="text-sm font-semibold">{title}</h3>
    </div>
    <p className="text-sm leading-relaxed text-muted">{desc}</p>
    {children}
  </div>;
}

function ExtraItem({ icon, title, desc }: { icon: React.ReactNode; title: string; desc: string }) {
  return <div className="flex flex-col items-center text-center">
    <span className="mb-3 flex size-12 items-center justify-center rounded-xl border border-line bg-surface-alt/60 text-muted transition-colors hover:text-ink">{icon}</span>
    <h3 className="mb-1.5 text-sm font-semibold">{title}</h3>
    <p className="max-w-[200px] text-xs leading-relaxed text-muted">{desc}</p>
  </div>;
}

/** Centered three-step walkthrough with numbered icon tiles (new-api how-it-works anatomy). */
function HowItWorks() {
  const steps = [
    { icon: <Download size={25} strokeWidth={1.5} aria-hidden="true" />, title: t('安装服务'), desc: t('下载对应平台的发行包，一条命令启动单二进制服务。') },
    { icon: <Settings2 size={25} strokeWidth={1.5} aria-hidden="true" />, title: t('配置数据库'), desc: t('安装向导中连接 SQLite、MySQL 或 PostgreSQL，自动完成初始化。') },
    { icon: <UserPlus size={25} strokeWidth={1.5} aria-hidden="true" />, title: t('创建管理员'), desc: t('设置站点名称与管理员账号，登录后即可邀请团队成员。') },
  ];
  return <section id="home-how" aria-label={t('快速开始')} className="scroll-mt-24 border-t border-line px-4 py-20 md:px-6 md:py-28">
    <div className="mx-auto max-w-6xl">
      <div className="mb-14 text-center md:mb-20">
        <p className="mb-3 text-xs font-medium text-muted">{t('快速开始')}</p>
        <h2 className="text-2xl font-semibold tracking-tight md:text-3xl">{t('三步，拥有你的工作空间')}</h2>
      </div>
      <div className="grid gap-11 md:grid-cols-3 md:gap-12">
        {steps.map((step, index) => <div key={step.title} className="relative flex flex-col items-center text-center">
          <div className="relative mb-5">
            <span className="flex size-[62px] items-center justify-center rounded-2xl border border-line bg-surface-alt/60 text-muted">{step.icon}</span>
            <span className="absolute -right-2 -top-2 flex size-6 items-center justify-center rounded-full bg-[var(--color-ink)] text-xs font-semibold text-[var(--color-background)]">{index + 1}</span>
          </div>
          <h3 className="mb-2 text-base font-semibold">{step.title}</h3>
          <p className="max-w-[250px] text-sm leading-relaxed text-muted">{step.desc}</p>
        </div>)}
      </div>
    </div>
  </section>;
}

/** Bare centered type over the plain background — no filled band, per the approved design. */
function CallToAction({ onRegister }: { onRegister: () => void }) {
  return <section aria-label={t('开始使用')} className="px-4 py-24 md:px-6 md:py-32">
    <div className="mx-auto max-w-2xl text-center">
      <h2 className="text-2xl font-semibold leading-tight tracking-tight md:text-4xl">{t('准备好开始了吗？')}<br />{t('立即部署你的工作空间')}</h2>
      <p className="mx-auto mt-5 max-w-md text-sm leading-relaxed text-muted md:text-base">{t('在你的服务器上部署一套完整的自托管工作空间，从注册一个账号开始。')}</p>
      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        <Button size="lg" className="group" onClick={onRegister}>
          {t('免费注册')}<ArrowRight size={14} aria-hidden="true" className="transition-transform duration-200 group-hover:translate-x-0.5" />
        </Button>
        <a className="inline-flex h-11 items-center rounded-lg border border-line bg-surface px-5 text-sm font-medium text-ink transition-colors hover:border-[var(--primary-border)] hover:text-accent" href={workspaceLinks.documentation} target="_blank" rel="noopener noreferrer">
          {t('查看部署文档')}
        </a>
      </div>
    </div>
  </section>;
}

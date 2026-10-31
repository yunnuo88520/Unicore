// Author: yunnuo <ymz@ebox.vip>
// Description: Workspace overview and core lab: runtime cards, dashboard widgets and the shared execute use case.
import { defineMessages, t, useLocale, currentLocale } from '../i18n';
import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import {
  Activity, ArrowDown, ArrowRight, Braces, Check, CheckCircle2, Circle, Code2, Copy, Cpu, FlaskConical, Globe2,
  Layers3, LoaderCircle, Monitor, Play, RotateCcw, Sparkles, Terminal, FolderOpen, type LucideIcon,
} from 'lucide-react';
import type { AppClient, Bootstrap, ExecuteOutput, Profile } from '@unicore/sdk';
import { BrandMark } from '../brand';
import { Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, useMessage } from '../ui';
import { cn } from '../lib/cn';
import { SAMPLE } from '../../fixtures/analyze-sample';
import type { PageProps } from '../router';

const PROFILE_LABELS: Record<Profile, string> = defineMessages({ 'web-platform': 'Web 平台', 'web-standalone': 'Web 单机', desktop: '桌面应用', cli: '命令行' });

export function OverviewPage(props: PageProps) {
  return <CoreWorkspace {...props} page="overview" />;
}

export function LabPage(props: PageProps) {
  return <CoreWorkspace {...props} page="lab" />;
}

function CoreWorkspace({ page, client, metadata, registry }: PageProps & { page: 'overview' | 'lab' }) {
  useLocale();
  return <>
    <RuntimeCards metadata={metadata} transport={client.transport} />
    {page === 'overview' && registry.entries().map(widget => {
      const content = widget.render(metadata);
      return content ? <Card key={widget.id} className="dashboard-widget">{content}</Card> : null;
    })}
    {page === 'overview' && <IntroBanner />}
    {page === 'overview' && metadata.identity_realm !== 'administrator' && <BusinessPlaceholders />}
    <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
      <CoreLab client={client} />
      <div className="flex flex-col gap-4">
        <Profiles current={metadata.profile} />
        <Architecture />
      </div>
    </div>
  </>;
}

function RuntimeCards({ metadata, transport }: { metadata: Bootstrap; transport: AppClient['transport'] }) {
  useLocale();
  const cards = [
    { label: t('当前运行形态'), value: t(PROFILE_LABELS[metadata.profile]), detail: metadata.profile, icon: metadata.profile === 'desktop' ? Monitor : Globe2, tone: 'bg-primary-soft text-accent' },
    { label: t('核心服务'), value: t('运行正常'), detail: t('共享用例已就绪'), icon: Activity, tone: 'bg-success-soft text-success' },
    { label: t('连接方式'), value: transport === 'http' ? 'HTTP API' : 'Wails Bridge', detail: transport === 'http' ? t('/api/v1 · 统一接口契约') : t('原生桥接 · 无 HTTP 服务'), icon: Braces, tone: 'bg-info-soft text-info' },
    metadata.version
      ? { label: t('框架版本'), value: `v${metadata.version}`, detail: metadata.deployment_kind, icon: Layers3, tone: 'bg-warning-soft text-warning' }
      : { label: t('工作空间'), value: t('个人空间'), detail: t('专注于你的业务'), icon: Layers3, tone: 'bg-warning-soft text-warning' },
  ];
  return <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label={t('运行状态')}>
    {cards.map(card => <article key={card.label} className="flex items-start justify-between gap-3 rounded-xl border border-line bg-surface p-4 shadow-card">
      <div className="min-w-0"><p className="text-xs text-muted">{card.label}</p>
        <strong className="mt-1 block truncate text-md font-semibold text-ink">{card.value}</strong>
        <small className="mt-0.5 block truncate text-2xs text-subtle">{card.detail}</small></div>
      <span className={cn('flex size-9 shrink-0 items-center justify-center rounded-lg', card.tone)}><card.icon size={19} aria-hidden="true" /></span>
    </article>)}
  </section>;
}

function IntroBanner() {
  useLocale();
  const navigate = useNavigate();
  return <div className="relative overflow-hidden rounded-2xl border border-primary-line bg-gradient-to-br from-banner-from to-banner-to p-5 text-banner-ink md:p-7">
    <span aria-hidden="true" className="absolute -end-10 -top-14 size-48 rounded-full bg-glass blur-2xl" />
    <span aria-hidden="true" className="absolute -bottom-16 start-1/3 size-56 rounded-full bg-glass blur-3xl" />
    <div className="relative flex flex-wrap items-center justify-between gap-6">
      <div className="max-w-xl">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-glass px-2.5 py-1 text-2xs font-medium"><Sparkles size={12} aria-hidden="true" />{t('为下一款产品而生')}</span>
        <h2 className="mt-3 text-2xl font-semibold">{t('构建一次，连接每个终端。')}</h2>
        <p className="mt-1 text-sm text-banner-muted">{t('领域逻辑保持纯粹，交互体验始终一致。')}</p>
        <Button className="mt-4" onClick={() => void navigate({ to: '/lab' })}>{t('探索核心实验室')}<ArrowRight size={14} /></Button>
      </div>
      <div className="flex items-center gap-3 rounded-xl bg-glass px-4 py-3" aria-hidden="true">
        <span className="flex size-11 items-center justify-center rounded-xl bg-surface text-accent shadow-tint"><BrandMark size={24} /></span>
        <span className="text-xs font-medium">Go Core</span>
        <span className="h-px w-8 bg-banner-muted/50" />
        <span className="flex flex-col gap-1.5 text-2xs text-banner-muted">
          <span className="flex items-center gap-1.5"><Globe2 size={13} /> Web</span>
          <span className="flex items-center gap-1.5"><Monitor size={13} /> Desktop</span>
          <span className="flex items-center gap-1.5"><Terminal size={13} /> CLI</span>
        </span>
      </div>
    </div>
  </div>;
}

function BusinessPlaceholders() {
  useLocale();
  return <section className="grid gap-3 sm:grid-cols-2" aria-label={t('业务空间')}>
    <Card><CardContent className="flex flex-col items-start gap-1.5 py-5">
      <FolderOpen size={20} className="text-accent" aria-hidden="true" />
      <h2 className="text-md font-semibold text-ink">{t('我的项目')}</h2>
      <p className="text-xs text-muted">{t('为你的业务预留空间，项目功能待接入。')}</p>
      <span className="mt-1"><Badge>{t('待接入')}</Badge></span>
    </CardContent></Card>
    <Card><CardContent className="flex flex-col items-start gap-1.5 py-5">
      <Activity size={20} className="text-accent" aria-hidden="true" />
      <h2 className="text-md font-semibold text-ink">{t('最近动态')}</h2>
      <p className="text-xs text-muted">{t('业务接入后，在这里汇集与你有关的更新。')}</p>
      <span className="mt-1"><Badge>{t('待接入')}</Badge></span>
    </CardContent></Card>
  </section>;
}

function CoreLab({ client }: { client: AppClient }) {
  useLocale();
  const [text, setText] = useState(() => t(SAMPLE));
  const [copied, setCopied] = useState(false);
  const message = useMessage();
  const [recent, setRecent] = useState<{ result: ExecuteOutput; time: string }[]>([]);
  const execution = useMutation({
    mutationFn: () => client.execute({ text }),
    onSuccess: result => {
      setCopied(false);
      setRecent(items => [{ result, time: new Date().toLocaleTimeString(currentLocale(), { hour12: false }) }, ...items].slice(0, 3));
    },
  });
  const byteLength = new TextEncoder().encode(text).length;
  async function copyDigest() {
    try { await navigator.clipboard.writeText(execution.data!.sha256); setCopied(true); message.success(t('摘要已复制')); }
    catch { message.error(t('复制失败，请手动选择摘要文本复制')); }
  }
  return <Card>
    <CardHeader className="flex-row items-start justify-between gap-3">
      <div><CardTitle><FlaskConical size={17} className="text-accent" aria-hidden="true" />{t('核心实验室')}</CardTitle>
        <CardDescription>{t('用一个真实用例，验证所有入口')}</CardDescription></div>
      <span className="rounded-full border border-line bg-surface-alt px-2 py-0.5 text-2xs text-muted">{t('文本分析')}</span>
    </CardHeader>
    <CardContent className="flex flex-col gap-5">
      <form className="flex flex-col gap-3" onSubmit={event => { event.preventDefault(); execution.mutate(); }}>
        <div className="flex items-center justify-between">
          <label htmlFor="core-input" className="text-sm font-medium text-ink">{t('输入文本')}</label>
          <button type="button" className="inline-flex items-center gap-1 text-xs text-accent hover:underline disabled:opacity-55"
            disabled={execution.isPending} onClick={() => { setText(t(SAMPLE)); execution.reset(); }}>
            <RotateCcw size={11} />{t('重置示例')}
          </button>
        </div>
        <div className="overflow-hidden rounded-lg border border-line">
          <div className="flex items-center justify-between border-b border-line bg-surface-alt px-3 py-1.5">
            <span className="flex gap-1" aria-hidden="true"><i className="size-2 rounded-full bg-danger/60" /><i className="size-2 rounded-full bg-warning/60" /><i className="size-2 rounded-full bg-success/60" /></span>
            <small className="text-2xs text-muted">example.txt · UTF-8</small>
          </div>
          <textarea id="core-input" value={text} onChange={event => setText(event.target.value)} spellCheck={false} aria-describedby="input-hint"
            placeholder={t('在这里输入想分析的文本…')}
            className="min-h-32 w-full resize-y bg-surface px-3 py-2.5 font-mono text-sm text-ink outline-none placeholder:text-subtle" />
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span id="input-hint" className={cn('text-2xs text-muted', byteLength > 65536 && 'text-danger')}>
            {byteLength.toLocaleString()}{t('/ 65,536 字节')}<span className="hidden sm:inline">{t('· 不保存输入内容')}</span>
          </span>
          <Button type="submit" pending={execution.isPending} disabled={!text.trim() || byteLength > 65536}>
            {!execution.isPending && <Play size={13} fill="currentColor" />}
            {execution.isPending ? t('执行中…') : t('运行用例')}
          </Button>
        </div>
      </form>
      <div className="flex items-center justify-between border-t border-line pt-4">
        <span className="text-xs font-medium text-muted">{t('执行结果')}</span>
        {execution.isSuccess
          ? <span className="flex items-center gap-1 text-2xs text-success"><CheckCircle2 size={12} />{t('执行成功')}</span>
          : <span className="text-2xs text-subtle">Go Core</span>}
      </div>
      <div className="result-grid grid grid-cols-3 gap-2" aria-live="polite">
        {([['characters', t('Unicode 字符'), Code2], ['words', t('空白分隔词'), Braces], ['lines', t('文本行数'), Layers3]] as const).map(([key, label, Icon]) =>
          <div key={key} className="rounded-lg bg-surface-alt px-3 py-3">
            <span className="flex items-center gap-1 text-2xs text-muted"><Icon size={12} aria-hidden="true" />{label}</span>
            <strong className="mt-0.5 block text-md font-semibold text-ink">{execution.data ? execution.data[key].toLocaleString() : '—'}</strong>
          </div>)}
      </div>
      {execution.data
        ? <div className="digest flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line bg-surface-alt px-3 py-2">
            <div className="flex items-center gap-2">
              <span className="text-2xs text-muted">{t('SHA-256 摘要')}</span>
              <button type="button" className="inline-flex items-center gap-1 text-2xs text-accent hover:underline" onClick={copyDigest}>
                {copied ? <Check size={11} /> : <Copy size={11} />}{copied ? t('已复制') : t('复制')}
              </button>
            </div>
            <code className="truncate font-mono text-2xs text-ink">{execution.data.sha256}</code>
          </div>
        : <div className="flex items-center gap-1.5 px-1 text-2xs text-subtle"><Circle size={9} aria-hidden="true" />{t('点击「运行用例」，查看来自真实核心的结果')}</div>}
      <div className="rounded-lg border border-line">
        <div className="flex items-center justify-between border-b border-line bg-surface-alt/60 px-3 py-2">
          <h3 className="text-xs font-medium text-ink">{t('本次会话的运行记录')}</h3>
          <span className="text-2xs text-muted">{t('{{count}} 次', { count: recent.length })}</span>
        </div>
        <div className="px-3 py-2">
          {recent.length
            ? <ul className="flex flex-col divide-y divide-line">
                {recent.map((run, index) => <li key={`${run.time}-${index}`} className="flex items-center gap-2 py-1.5 text-xs">
                  <span className="flex size-4 items-center justify-center rounded-full bg-success-soft text-success"><Check size={9} aria-hidden="true" /></span>
                  <strong className="font-medium text-ink">{t('文本分析')}</strong>
                  <span className="text-muted">{t('{{count}} 字符', { count: run.result.characters })}</span>
                  <time className="ms-auto text-2xs text-subtle">{run.time}</time>
                </li>)}
              </ul>
            : <p className="py-1 text-2xs text-subtle">{t('暂无运行记录，从第一次执行开始。')}</p>}
        </div>
      </div>
    </CardContent>
  </Card>;
}

function Profiles({ current }: { current: Profile }) {
  useLocale();
  const profiles = [
    { id: 'web-platform', title: t('Web 平台'), detail: t('独立账号 · 服务端角色权限'), icon: Globe2 },
    { id: 'web-standalone', title: t('Web 单机'), detail: t('轻装运行 · 专注本地业务'), icon: Monitor },
    { id: 'desktop', title: 'Desktop', detail: t('Wails 原生桥接 · 共用界面'), icon: Layers3 },
    { id: 'cli', title: 'CLI', detail: t('独立二进制 · 无数据库依赖'), icon: Terminal },
  ];
  return <Card>
    <CardHeader className="flex-row items-start justify-between">
      <div><CardTitle>{t('一个核心，四种形态')}</CardTitle><CardDescription>{t('入口各自独立，业务始终相同')}</CardDescription></div>
      <span className="font-mono text-2xs text-subtle">04</span>
    </CardHeader>
    <CardContent className="flex flex-col gap-1">
      {profiles.map(item => <div key={item.id} className={cn('flex items-center gap-3 rounded-lg px-2 py-2', current === item.id && 'bg-primary-soft')}>
        <span className={cn('flex size-8 items-center justify-center rounded-lg', current === item.id ? 'bg-surface text-accent' : 'bg-surface-alt text-muted')}><item.icon size={16} aria-hidden="true" /></span>
        <div className="min-w-0"><strong className="block text-sm font-medium text-ink">{item.title}</strong>
          <small className="block truncate text-2xs text-muted">{item.detail}</small></div>
        {current === item.id
          ? <span className="ms-auto text-2xs font-medium text-accent">{t('当前')}</span>
          : <span className="ms-auto size-1.5 rounded-full bg-subtle" aria-label={t('已接入共享用例')} />}
      </div>)}
    </CardContent>
    <div className="flex items-center justify-center gap-1.5 border-t border-line py-2 text-2xs text-muted">
      <CheckCircle2 size={12} className="text-success" aria-hidden="true" />{t('同一份 Go 业务逻辑 · 同一个接口契约')}
    </div>
  </Card>;
}

function Architecture() {
  useLocale();
  return <Card>
    <CardHeader><CardTitle>{t('清晰的边界，更自由的扩展')}</CardTitle><CardDescription>{t('依赖向内，让核心保持纯粹')}</CardDescription></CardHeader>
    <CardContent>
      <div className="flex flex-col items-center gap-2 rounded-lg bg-surface-alt px-3 py-4">
        <div className="flex gap-2 text-2xs text-muted">
          <span className="flex items-center gap-1 rounded-md border border-line bg-surface px-2 py-1"><Globe2 size={12} aria-hidden="true" />HTTP</span>
          <span className="flex items-center gap-1 rounded-md border border-line bg-surface px-2 py-1"><Monitor size={12} aria-hidden="true" />Wails</span>
          <span className="flex items-center gap-1 rounded-md border border-line bg-surface px-2 py-1"><Terminal size={12} aria-hidden="true" />CLI</span>
        </div>
        <ArrowDown size={14} className="text-subtle" aria-hidden="true" />
        <strong className="flex items-center gap-1.5 text-sm text-ink"><Cpu size={15} aria-hidden="true" /> Application / Go Core</strong>
      </div>
      <p className="mt-2 text-center text-2xs text-muted">{t('领域层独立于 UI、传输与存储。新增产品只需扩展自己的业务模块。')}</p>
    </CardContent>
  </Card>;
}

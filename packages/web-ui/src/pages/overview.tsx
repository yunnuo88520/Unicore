// Author: yunnuo <ymz@ebox.vip>
// Description: Framework demo dashboard with instance metadata, business placeholders, widgets and quick links.
import { defineMessages, t, useLocale } from '../i18n';
import { Link } from '@tanstack/react-router';
import { canAccess, routes, type Page } from '../routes';
import { Activity, ArrowRight, Braces, FolderOpen, Globe2, Layers3, Monitor, NotebookPen, Terminal } from 'lucide-react';
import { BrandMark } from '../brand';
import type { AppClient, Bootstrap, Profile } from '@unicore/sdk';
import { Card, CardContent, StatCard } from '@unicore/ui';
import type { PageProps } from '../router';

export function OverviewPage(props: PageProps) {
  return <CoreDashboard {...props} />;
}
/** Preserve the framework demo; the live monitoring summary stays off the dashboard. */
function CoreDashboard({ client, metadata, registry }: PageProps) {
  useLocale();
  const quickLinks = ([{ id: 'notes', icon: NotebookPen }] as const)
    .filter(({ id }) => canAccess(id, metadata));
  return <div className="flex flex-col gap-4">
    <RuntimeCards metadata={metadata} transport={client.transport} />
    {registry.entries().map(widget => {
      const content = widget.render(metadata);
      return content ? <Card key={widget.id} variant="soft" className="dashboard-widget">{content}</Card> : null;
    })}
    <IntroBanner platform={metadata.profile === 'web-platform'} />
    {metadata.identity_realm !== 'administrator' && <BusinessPlaceholders />}
    {quickLinks.length > 0 && <section aria-label={t('快捷入口')}>
      <h2 className="mb-2 text-sm font-semibold text-ink">{t('快捷入口')}</h2>
      <div className="grid gap-4 sm:grid-cols-3">
        {quickLinks.map(({ id, icon: Icon }) => {
          const route = routes[id];
          return <Card asChild key={id} variant="soft" className="group flex flex-col items-start gap-1 p-5 transition-colors hover:bg-surface-hover">
            <Link to={ROUTE_PATHS[id as Page] ?? `/${id}`}>
              <span className="flex size-9 items-center justify-center rounded-lg bg-primary-soft text-accent"><Icon size={18} aria-hidden="true" /></span>
              <strong className="mt-1 text-sm font-medium text-ink">{t(route.label)}</strong>
              <small className="text-2xs text-muted">{t(route.description)}</small>
              <span className="mt-1 inline-flex items-center gap-1 text-2xs text-accent opacity-0 transition-opacity group-hover:opacity-100">{t('前往')}<ArrowRight size={11} aria-hidden="true" /></span>
            </Link>
          </Card>;
        })}
      </div>
    </section>}
  </div>;
}

const ROUTE_PATHS: Partial<Record<Page, string>> = { overview: '/' };

const PROFILE_LABELS: Record<Profile, string> = defineMessages({ 'web-platform': 'Web 平台', 'web-standalone': 'Web 单机', desktop: '桌面应用', cli: '命令行' });

function RuntimeCards({ metadata, transport }: { metadata: Bootstrap; transport: AppClient['transport'] }) {
  useLocale();
  const cards: { label: string; value: string; detail: string; icon: typeof Globe2; tone?: 'success' }[] = [
    { label: t('当前运行形态'), value: t(PROFILE_LABELS[metadata.profile]), detail: metadata.profile, icon: metadata.profile === 'desktop' ? Monitor : Globe2 },
    { label: t('核心服务'), value: t('运行正常'), detail: t('共享用例已就绪'), icon: Activity, tone: 'success' },
    { label: t('连接方式'), value: transport === 'http' ? 'HTTP API' : 'Wails Bridge', detail: transport === 'http' ? t('/api/v1 · 统一接口契约') : t('原生桥接'), icon: Braces },
    metadata.version
      ? { label: t('框架版本'), value: `v${metadata.version}`, detail: metadata.deployment_kind, icon: Layers3 }
      : { label: t('工作空间'), value: t('个人空间'), detail: t('专注于你的业务'), icon: Layers3 },
  ];
  return <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label={t('运行状态')}>
    {cards.map(({ tone, ...card }) => <StatCard key={card.label} {...card} tone={tone} variant="soft" />)}
  </section>;
}

function IntroBanner({ platform }: { platform: boolean }) {
  useLocale();
  return <Card variant="soft" className="p-6 text-ink md:p-8">
    <div className="flex flex-wrap items-center justify-between gap-6">
      <div className="max-w-xl">
        <p className="text-2xs font-medium text-muted">{platform ? t('为下一款产品而生') : t('工作空间')}</p>
        <h2 className="mt-2 text-xl font-medium">{platform ? t('构建一次，连接每个终端') : t('你的工作，从这里开始')}</h2>
        <p className="mt-1 text-sm text-muted">{platform ? t('领域逻辑保持纯粹，交互体验始终一致') : t('整理想法，记录进展，专注于手头的事')}</p>
      </div>
      <div className="flex items-center gap-3 rounded-xl bg-surface-alt px-4 py-3" aria-hidden="true">
        <span className="flex size-11 items-center justify-center rounded-xl bg-surface text-accent"><BrandMark size={24} /></span>
        {platform && <>
          <span className="text-xs font-medium">Go Core</span>
          <span className="h-px w-8 bg-line" />
          <span className="flex flex-col gap-1.5 text-2xs text-muted">
            <span className="flex items-center gap-1.5"><Globe2 size={13} /> Web</span>
            <span className="flex items-center gap-1.5"><Monitor size={13} /> Desktop</span>
            <span className="flex items-center gap-1.5"><Terminal size={13} /> CLI</span>
          </span>
        </>}
      </div>
    </div>
  </Card>;
}

function BusinessPlaceholders() {
  useLocale();
  return <section className="grid gap-4 sm:grid-cols-2" aria-label={t('业务空间')}>
    <Card variant="soft"><CardContent className="flex flex-col items-start gap-1.5 py-5">
      <FolderOpen size={20} className="text-accent" aria-hidden="true" />
      <h2 className="text-md font-medium text-ink">{t('我的项目')}</h2>
      <p className="text-xs text-muted">{t('为你的业务预留空间，项目功能待接入。')}</p>
      <span className="mt-1 text-2xs text-subtle">{t('待接入')}</span>
    </CardContent></Card>
    <Card variant="soft"><CardContent className="flex flex-col items-start gap-1.5 py-5">
      <Activity size={20} className="text-accent" aria-hidden="true" />
      <h2 className="text-md font-medium text-ink">{t('最近动态')}</h2>
      <p className="text-xs text-muted">{t('业务接入后，在这里汇集与你有关的更新。')}</p>
      <span className="mt-1 text-2xs text-subtle">{t('待接入')}</span>
    </CardContent></Card>
  </section>;
}

// Author: yunnuo <ymz@ebox.vip>
// Description: Route-level loading surface: a structured skeleton fallback and the top navigation progress bar.
// The bar is fed exclusively by router navigation events, so background polling and query refetches never trigger it.
import { useEffect, useState } from 'react';
import { Skeleton, Button } from '@unicore/ui';
import { t } from '../i18n';

export type PageSkeletonVariant = 'dashboard' | 'list' | 'cards' | 'feed' | 'form' | 'monitor' | 'editor' | 'catalog' | 'content';

const PAGE_SKELETONS: Record<string, PageSkeletonVariant> = {
  overview: 'dashboard', home: 'dashboard',
  users: 'list', administrators: 'list', announcements: 'list', 'access-tokens': 'list',
  roles: 'list', posts: 'list', departments: 'list', tasks: 'list', logs: 'list',
  notes: 'cards', 'note-management': 'list', 'ai-tools': 'list', 'ai-calls': 'list', 'ai-oauth': 'list',
  install: 'form', login: 'form', register: 'form', 'forgot-password': 'form', 'email-login': 'form',
  'resend-verification': 'form', 'registration-success': 'form', 'verify-email': 'form',
  'reset-password': 'form', authorize: 'form', site: 'form', 'account-policy': 'form', mail: 'form',
  'mail-templates': 'form', 'notification-channels': 'form', 'notification-templates': 'form',
  'system-notifications': 'form', edition: 'form', storage: 'editor', menus: 'editor', dictionaries: 'editor',
  files: 'catalog',
  monitor: 'monitor', 'monitor-services': 'cards', 'monitor-resources': 'monitor', 'monitor-events': 'feed',
  'api-docs': 'content', 'ai-access': 'form', 'ui-preview': 'content',
};

export function pageSkeletonForPage(page: string): PageSkeletonVariant {
  return PAGE_SKELETONS[page] ?? 'content';
}

export function pageSkeletonForPath(path: string): PageSkeletonVariant {
  const key = path === '/' ? 'overview' : path.replace(/^\/+|\/+$/g, '');
  return pageSkeletonForPage(key);
}

type Phase = 'idle' | 'active' | 'finish' | 'timeout';

let phase: Phase = 'idle';
const listeners = new Set<() => void>();
let showTimer: ReturnType<typeof setTimeout> | undefined;
let finishTimer: ReturnType<typeof setTimeout> | undefined;
let guardTimer: ReturnType<typeof setTimeout> | undefined;

const emit = () => listeners.forEach(notify => notify());

/** Navigation started: reveal the bar after a short delay so quick switches never flash it. */
export function navigationStart() {
  clearTimeout(showTimer);
  clearTimeout(finishTimer);
  clearTimeout(guardTimer);
  showTimer = setTimeout(() => {
    phase = 'active';
    emit();
  }, 150);
  // Safety net: a load stuck far beyond every reasonable chunk stays visible
  // but flips into an explicit timeout state with a reload action — silently
  // hiding the bar while the router is still waiting would leave the page
  // without any loading indicator.
  guardTimer = setTimeout(() => {
    if (phase === 'active') {
      phase = 'timeout';
      emit();
    }
  }, 12000);
}

/** Navigation settled (including error renders): sweep to 100% and fade out. */
export function navigationFinish() {
  clearTimeout(showTimer);
  if (phase === 'idle') return;
  phase = 'finish';
  emit();
  finishTimer = setTimeout(() => {
    phase = 'idle';
    emit();
  }, 320);
}

// The dedicated navigation animation: two accent segments chase across a
// transparent track (fast lead, soft trail), theme-aware through
// --color-accent and disabled into a calm pulse under reduced motion.
const PROGRESS_KEYFRAMES = `
@keyframes np-chase-a { 0% { transform: translateX(-130%) } 55% { transform: translateX(240%) } 100% { transform: translateX(360%) } }
@keyframes np-chase-b { 0% { transform: translateX(-320%) } 65% { transform: translateX(110%) } 100% { transform: translateX(420%) } }
@keyframes np-pulse { 0%, 100% { opacity: .35 } 50% { opacity: .9 } }
.nav-progress { position: fixed; inset-inline: 0; top: 0; z-index: 90; height: 3px; pointer-events: none; overflow: hidden; }
.nav-progress span { position: absolute; inset-block: 0; border-radius: 999px; background: var(--color-accent); box-shadow: 0 0 8px color-mix(in srgb, var(--color-accent) 55%, transparent); }
.nav-progress .np-a { width: 36%; animation: np-chase-a 1.15s cubic-bezier(.25,.6,.35,.9) infinite; }
.nav-progress .np-b { width: 22%; opacity: .6; animation: np-chase-b 1.15s cubic-bezier(.35,.2,.65,.8) infinite .12s; }
@media (prefers-reduced-motion: reduce) {
  .nav-progress .np-a, .nav-progress .np-b { width: 34%; animation: np-pulse 1.4s ease-in-out infinite; }
}`;

/** The top progress bar; mount once per entry, ideally at the router root. */
export function NavigationProgressBar() {
  const [current, setCurrent] = useState<Phase>('idle');
  useEffect(() => {
    const notify = () => setCurrent(phase);
    listeners.add(notify);
    notify();
    return () => { listeners.delete(notify); };
  }, []);
  if (current === 'idle') return null;
  return <div>
    <style>{PROGRESS_KEYFRAMES}</style>
    <div aria-hidden="true">
      {current === 'finish'
        ? <div className="nav-progress"><span className="h-full w-full opacity-100 transition-opacity duration-300 ease-out" style={{ opacity: 0 }} /></div>
        : <div className="nav-progress"><span className="np-a" /><span className="np-b" /></div>}
    </div>
    {current === 'timeout' && <div role="alert" className="pointer-events-none fixed inset-x-0 top-[11px] z-[90] flex justify-center px-3">
      <span className="pointer-events-auto flex items-center gap-3 rounded-lg border border-line bg-surface px-3 py-1.5 text-xs shadow-sm">
        {t('页面加载超时，请检查网络后重试')}
        <Button variant="secondary" size="sm" className="h-6" onClick={() => window.location.reload()}>{t('重新加载')}</Button>
      </span>
    </div>}
  </div>;
}

function PageHeadingSkeleton() {
  return <div data-skeleton-region="page-heading" className="flex flex-col gap-2">
    <Skeleton className="h-6 w-52" />
    <Skeleton className="h-4 w-80 max-w-full" />
  </div>;
}

function DashboardSkeleton() {
  return <>
    <div data-skeleton-region="dashboard-metrics" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {Array.from({ length: 4 }, (_, index) => <div key={index} className="flex flex-col gap-3 rounded-lg border border-line p-4">
        <Skeleton className="h-3 w-24" /><Skeleton className="h-7 w-28" /><Skeleton className="h-3 w-32" />
      </div>)}
    </div>
    <div data-skeleton-region="dashboard-content" className="grid gap-4 xl:grid-cols-3">
      <div className="flex h-64 flex-col gap-4 rounded-lg border border-line p-4 xl:col-span-2">
        <Skeleton className="h-4 w-40" /><Skeleton className="h-full w-full" />
      </div>
      <div className="flex h-64 flex-col gap-3 rounded-lg border border-line p-4">
        <Skeleton className="h-4 w-32" />{Array.from({ length: 4 }, (_, index) => <Skeleton key={index} className="h-8 w-full" />)}
      </div>
    </div>
  </>;
}

function ListSkeleton() {
  return <>
    <div data-skeleton-region="list-controls" className="flex flex-wrap items-center gap-2">
      <Skeleton className="h-9 w-full max-w-xs" />
      <Skeleton className="h-9 w-32" />
      <Skeleton className="ms-auto h-9 w-24" />
    </div>
    <div data-skeleton-region="list-table" className="overflow-hidden rounded-lg border border-line bg-surface">
      <div className="flex h-10 items-center gap-4 border-b border-line px-4">
        {Array.from({ length: 4 }, (_, index) => <Skeleton key={index} className="h-3 flex-1" />)}
      </div>
      {Array.from({ length: 5 }, (_, row) => <div key={row} className="flex h-12 items-center gap-4 border-b border-line px-4 last:border-0">
        {Array.from({ length: 4 }, (_, column) => <Skeleton key={column} className={`h-4 ${column === 0 ? 'w-1/4' : 'flex-1'}`} />)}
      </div>)}
    </div>
    <div className="flex justify-end"><Skeleton className="h-8 w-52" /></div>
  </>;
}

function FormSkeleton() {
  return <>
    <div data-skeleton-region="form-fields" className="flex max-w-3xl flex-col gap-6">
      <div className="flex flex-col gap-5 rounded-lg border border-line p-5">
        {Array.from({ length: 4 }, (_, index) => <div key={index} className="flex flex-col gap-2">
          <Skeleton className="h-3 w-28" /><Skeleton className="h-10 w-full" />
          {index === 1 && <Skeleton className="h-3 w-2/3" />}
        </div>)}
      </div>
      <div className="flex justify-end gap-2"><Skeleton className="h-9 w-24" /><Skeleton className="h-9 w-28" /></div>
    </div>
  </>;
}

function CatalogSkeleton() {
  return <>
    <Skeleton className="h-8 w-20 sm:hidden" />
    <div className="grid min-w-0 gap-4 sm:grid-cols-[minmax(190px,240px)_minmax(0,1fr)] sm:gap-5">
      <div data-skeleton-region="catalog-directories" className="hidden flex-col gap-3 sm:flex">
        <Skeleton className="h-5 w-28" />
        {Array.from({ length: 5 }, (_, index) => <Skeleton key={index} className={`h-8 ${index > 1 ? 'ms-5 w-4/5' : 'w-full'}`} />)}
      </div>
      <div className="flex min-w-0 flex-col gap-3"><ListSkeleton /></div>
    </div>
  </>;
}

function CardsSkeleton() {
  return <>
    <div className="flex flex-wrap items-center gap-2">
      <Skeleton className="h-9 w-full max-w-xs" /><Skeleton className="h-9 w-28" />
    </div>
    <div data-skeleton-region="card-grid" className="grid items-start gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: 6 }, (_, index) => <div key={index} className="flex flex-col gap-3 rounded-lg border border-line p-4">
        <Skeleton className="h-5 w-24" /><Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-4 w-1/2" /><Skeleton className="mt-2 h-4 w-20" />
      </div>)}
    </div>
  </>;
}

function FeedSkeleton() {
  return <div data-skeleton-region="event-feed" className="flex flex-col gap-4">
    <div className="flex justify-end gap-2"><Skeleton className="h-9 w-32" /><Skeleton className="h-9 w-20" /></div>
    <div className="divide-y divide-line overflow-hidden rounded-lg border border-line">
      {Array.from({ length: 6 }, (_, index) => <div key={index} className="flex items-start gap-3 p-4">
        <Skeleton className="mt-1 size-2.5 shrink-0 rounded-full" /><Skeleton className="h-5 w-16 shrink-0" />
        <div className="flex min-w-0 flex-1 flex-col gap-2"><Skeleton className="h-4 w-3/4" /><Skeleton className="h-3 w-1/2" /></div>
      </div>)}
    </div>
    <Skeleton className="h-24 w-full" />
  </div>;
}

function MonitorSkeleton() {
  return <>
    <div data-skeleton-region="monitor-stats" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {Array.from({ length: 4 }, (_, index) => <div key={index} className="flex flex-col gap-3 rounded-lg border border-line p-4">
        <Skeleton className="h-3 w-24" /><Skeleton className="h-7 w-20" />
      </div>)}
    </div>
    <div data-skeleton-region="monitor-charts" className="grid gap-4 xl:grid-cols-2">
      {Array.from({ length: 2 }, (_, index) => <div key={index} className="flex h-64 flex-col gap-4 rounded-lg border border-line p-4">
        <Skeleton className="h-4 w-36" /><Skeleton className="h-full w-full" />
      </div>)}
    </div>
    <div data-skeleton-region="monitor-events" className="flex flex-col gap-3 rounded-lg border border-line p-4">
      <Skeleton className="h-4 w-40" />{Array.from({ length: 3 }, (_, index) => <Skeleton key={index} className="h-8 w-full" />)}
    </div>
  </>;
}

function EditorSkeleton() {
  return <>
    <div className="grid min-h-80 gap-4 lg:grid-cols-[minmax(14rem,0.8fr)_minmax(0,2fr)]">
      <div data-skeleton-region="editor-navigation" className="flex flex-col gap-3 rounded-lg border border-line p-4">
        <Skeleton className="h-8 w-full" />{Array.from({ length: 6 }, (_, index) => <Skeleton key={index} className="h-9 w-full" />)}
      </div>
      <div data-skeleton-region="editor-workspace" className="flex flex-col gap-5 rounded-lg border border-line p-5">
        <Skeleton className="h-5 w-48" /><Skeleton className="h-10 w-full" /><Skeleton className="h-28 w-full" />
        <div className="ms-auto flex gap-2"><Skeleton className="h-9 w-24" /><Skeleton className="h-9 w-28" /></div>
      </div>
    </div>
  </>;
}

function ContentSkeleton() {
  return <>
    <div data-skeleton-region="content-body" className="flex max-w-4xl flex-col gap-4">
      <Skeleton className="h-5 w-2/3" />
      <Skeleton className="h-4 w-full" /><Skeleton className="h-4 w-11/12" /><Skeleton className="h-4 w-4/5" />
      <Skeleton className="mt-4 h-48 w-full" />
      <Skeleton className="h-4 w-full" /><Skeleton className="h-4 w-3/4" />
    </div>
  </>;
}

/** Route fallback shape is registered by page type so chunk loading preserves the destination's layout. */
export function PageLoader({ variant = 'content', showHeading = true }: { variant?: PageSkeletonVariant; showHeading?: boolean }) {
  const surface = {
    dashboard: <DashboardSkeleton />,
    list: <ListSkeleton />,
    cards: <CardsSkeleton />,
    feed: <FeedSkeleton />,
    form: <FormSkeleton />,
    monitor: <MonitorSkeleton />,
    editor: <EditorSkeleton />,
    catalog: <CatalogSkeleton />,
    content: <ContentSkeleton />,
  }[variant];
  return <div role="status" aria-busy="true" data-page-skeleton={variant} className="flex w-full min-w-0 flex-col gap-6 py-6">
    <span className="sr-only">{t('页面加载中…')}</span>
    {showHeading && <PageHeadingSkeleton />}
    {surface}
  </div>;
}

// Author: yunnuo <ymz@ebox.vip>
// Description: Controlled notification, task and search activity views; no synthetic data or services.
import { useId, type ReactNode } from 'react';
import { Bell, BellOff, CheckCircle2, Info, TriangleAlert, type LucideIcon } from 'lucide-react';
import { Button } from '../button';
import { Input, Label } from '../input';
import { cn } from '../cn';
import { useLocale } from '../i18n';
import { compositeT as t } from './messages';
import { agentActivityT as extra } from './agent-activity.messages';

export type NotificationStatus = 'neutral' | 'information' | 'success' | 'error';
export interface NotificationTab { id: string; label: ReactNode; count?: number; disabled?: boolean }
export interface NotificationAction { id: string; label: ReactNode; disabled?: boolean }
export interface NotificationItem { id: string; title: ReactNode; description?: ReactNode; timestamp?: ReactNode; unread?: boolean; status?: NotificationStatus; icon?: LucideIcon; actions?: NotificationAction[]; disabled?: boolean }
export interface NotificationCenterProps { title?: ReactNode; tabs: NotificationTab[]; activeTabId: string; onTabChange?: (id: string) => void; items: NotificationItem[]; unreadCount?: number; onMarkAllRead?: () => void; onItemActivate?: (id: string) => void; onAction?: (itemId: string, actionId: string) => void; busy?: boolean; disabled?: boolean; empty?: ReactNode; className?: string }
const validCount = (value: number | undefined): value is number => value !== undefined && Number.isFinite(value) && value >= 0;
const statusDisc: Record<NotificationStatus, string> = { neutral: 'bg-surface-inset text-muted', information: 'bg-info-soft text-info', success: 'bg-success-soft text-success', error: 'bg-danger-soft text-danger' };
const statusIcon: Record<NotificationStatus, LucideIcon> = { neutral: Bell, information: Info, success: CheckCircle2, error: TriangleAlert };

export function NotificationCenter({ title, tabs, activeTabId, onTabChange, items, unreadCount, onMarkAllRead, onItemActivate, onAction, busy, disabled, empty, className }: NotificationCenterProps) {
  useLocale(); const locked = !!(busy || disabled);
  const panelTitle = title ?? t('Notifications');
  const count = unreadCount ?? items.filter(item => item.unread && !item.disabled).length;
  const hasUnread = count > 0;
  return <section aria-label={typeof panelTitle === 'string' ? panelTitle : t('Notifications')} aria-busy={busy || undefined} className={cn('flex w-full min-w-0 flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-floating', className)}>
    <div className="flex flex-col gap-3 p-4 pb-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-0.5">
          <h2 className="text-base font-semibold text-ink">{panelTitle}</h2>
          <p className="text-sm text-muted">{hasUnread ? t('{{count}} unread', { count }) : t('No unread notifications')}</p>
        </div>
        <Button variant="ghost" size="sm" disabled={locked || !hasUnread || !onMarkAllRead} onClick={() => { if (!locked) onMarkAllRead?.(); }}>{t('Mark all read')}</Button>
      </div>
      <div role="tablist" aria-label={t('Notification filters')} className="flex w-full gap-1 rounded-lg bg-surface-alt p-1">
        {tabs.map(tab => <button key={tab.id} role="tab" type="button" aria-selected={tab.id === activeTabId} disabled={locked || tab.disabled || !onTabChange} className={cn('flex min-w-0 flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-sm transition-colors outline-none focus-visible:ring-2 focus-visible:ring-focus disabled:opacity-55', tab.id === activeTabId ? 'bg-surface text-ink shadow-tint' : 'text-muted hover:text-ink')} onClick={() => { if (!locked && !tab.disabled && tab.id !== activeTabId) onTabChange?.(tab.id); }}>
          <span className="truncate">{tab.label}</span>
          {validCount(tab.count) && <span className="inline-flex min-w-5 items-center justify-center rounded-sm bg-surface-inset px-1 text-2xs font-medium text-muted">{Math.floor(tab.count)}</span>}
        </button>)}
      </div>
    </div>
    <div className="px-1.5 pb-1.5">
      <div className="overflow-hidden rounded-xl bg-surface-alt">
        <div className="max-h-[26rem] overflow-y-auto overscroll-contain p-2">
          {items.length ? <ul className="flex flex-col gap-2">{items.map(item => {
            const unread = item.unread === true; const status = item.status ?? 'neutral'; const Icon = item.icon ?? statusIcon[status];
            const activatable = !!(onItemActivate && !locked && !item.disabled);
            return <li key={item.id}>
              <article aria-current={unread || undefined} className={cn('flex gap-3 rounded-lg bg-surface px-3 py-3', activatable && 'transition-colors hover:bg-surface-hover focus-within:bg-surface-hover', item.disabled && 'opacity-55')}>
                <span className={cn('flex size-10 shrink-0 items-center justify-center rounded-full', statusDisc[status])} aria-hidden="true"><Icon size={18} /></span>
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <div className="flex min-w-0 items-start justify-between gap-3">
                    {activatable ? <button type="button" className="min-w-0 text-start text-sm text-ink outline-none focus-visible:rounded-sm focus-visible:ring-2 focus-visible:ring-focus [overflow-wrap:anywhere]" onClick={() => { if (activatable) onItemActivate?.(item.id); }}>{item.title}</button>
                      : <p className="min-w-0 text-sm text-ink [overflow-wrap:anywhere]">{item.title}</p>}
                    <span className="flex shrink-0 items-center gap-2">
                      {item.timestamp != null && <span className="whitespace-nowrap text-xs text-subtle">{item.timestamp}</span>}
                      {unread && <span className="size-2 shrink-0 rounded-full bg-accent" aria-label={t('Unread')} />}
                    </span>
                  </div>
                  {item.description != null && <div className="text-sm text-muted [overflow-wrap:anywhere]">{item.description}</div>}
                  {item.actions?.length ? <div className="mt-1 flex flex-wrap items-center gap-2">{item.actions.map(action => <Button key={action.id} size="sm" variant="secondary" disabled={locked || item.disabled || action.disabled || !onAction} onClick={event => { event.stopPropagation(); if (!locked && !item.disabled && !action.disabled) onAction?.(item.id, action.id); }}>{action.label}</Button>)}</div> : null}
                </div>
              </article>
            </li>;
          })}</ul>
            : <div role="status" className="flex min-h-56 flex-col items-center justify-center gap-2 rounded-lg bg-surface px-6 text-center">
              <span className="flex size-11 items-center justify-center rounded-full bg-surface-alt text-muted" aria-hidden="true"><BellOff size={18} /></span>
              <p className="text-sm text-ink">{empty ?? t('No notifications')}</p>
              <p className="max-w-60 text-xs text-muted">{t('New activity will appear here when it arrives.')}</p>
            </div>}
        </div>
      </div>
    </div>
  </section>;
}
export type TaskStatus = 'pending' | 'active' | 'success' | 'error' | 'skipped';
export interface TaskStep { id: string; title: ReactNode; status: TaskStatus; detail?: ReactNode; children?: TaskStep[]; disabled?: boolean }
export interface TaskListProps { steps: TaskStep[]; revealedIds: string[]; onRevealChange?: (ids: string[]) => void; label?: string; disabled?: boolean; className?: string }
export function TaskList({ steps, revealedIds, onRevealChange, label, disabled, className }: TaskListProps) {
  useLocale(); const prefix = useId(); const statuses: Record<TaskStatus, string> = { pending: t('Pending'), active: t('In progress'), success: t('Complete'), error: t('Failed'), skipped: t('Skipped') };
  const renderSteps = (entries: TaskStep[], path: string, parentDisabled = false): ReactNode => <ol className="flex min-w-0 flex-col gap-2">{entries.map((step, index) => {
    const open = revealedIds.includes(step.id); const regionId = `${path}-${index}`; const hasDetail = step.detail != null || !!step.children?.length; const locked = !!(disabled || parentDisabled || step.disabled);
    return <li key={step.id} aria-current={step.status === 'active' ? 'step' : undefined} className="min-w-0 rounded-lg border border-line p-3"><div className="flex min-w-0 flex-wrap items-center gap-2"><span id={`${regionId}-title`} className="min-w-0 flex-1 break-words text-sm font-medium text-ink [overflow-wrap:anywhere]">{step.title}</span><span className={cn('inline-flex items-center gap-1.5 text-xs text-muted', step.status === 'error' && 'text-danger', step.status === 'success' && 'text-success')}>{step.status === 'active' && <span aria-hidden="true" className="size-1.5 rounded-full bg-current motion-safe:animate-pulse motion-reduce:animate-none" />}{statuses[step.status]}</span>{hasDetail && <Button size="sm" variant="ghost" aria-expanded={open} aria-controls={regionId} aria-describedby={`${regionId}-title`} disabled={locked || !onRevealChange} onClick={() => { if (!locked) onRevealChange?.(open ? revealedIds.filter(id => id !== step.id) : [...new Set([...revealedIds, step.id])]); }}>{open ? t('Hide details') : t('Show details')}</Button>}</div>{hasDetail && <div id={regionId} hidden={!open} className="mt-3 min-w-0 text-sm text-muted [overflow-wrap:anywhere]">{step.detail != null && <div className="mb-2">{step.detail}</div>}{step.children?.length ? renderSteps(step.children, regionId, locked) : null}</div>}</li>;
  })}</ol>;
  return <section aria-label={label ?? t('Tasks')} className={cn('min-w-0', className)}>{steps.length ? renderSteps(steps, prefix) : <p role="status" className="py-3 text-sm text-muted">{extra('No tasks')}</p>}</section>;
}
export interface SearchSource { id: string; label: ReactNode; status: 'pending' | 'searching' | 'complete' | 'error'; detail?: ReactNode; resultCount?: number; href?: string; disabled?: boolean }
export interface SearchActivityProps { query: string; onQueryChange?: (query: string) => void; onSearch?: (query: string) => void; sources: SearchSource[]; onSourceAction?: (id: string) => void; sourceActionLabel?: string; busy?: boolean; disabled?: boolean; revealedIds?: string[]; onRevealChange?: (ids: string[]) => void; className?: string }
/** Only explicit HTTP(S), fragments and local paths; never executable schemes or protocol-relative URLs. */
function safeSourceHref(value: string | undefined): string | undefined {
  if (!value || value !== value.trim() || /[\s\\\u0000-\u001f\u007f]/.test(value)) return undefined;
  if (/^https?:\/\//i.test(value)) { try { const url = new URL(value); return url.username || url.password ? undefined : value; } catch { return undefined; } }
  if (/^(?:\/(?!\/)|#|\.\.?\/)/.test(value)) return value;
  return undefined;
}
export function SearchActivity({ query, onQueryChange, onSearch, sources, onSourceAction, sourceActionLabel, busy, disabled, revealedIds, onRevealChange, className }: SearchActivityProps) {
  useLocale(); const id = useId(); const locked = !!(busy || disabled); const labels = { pending: t('Pending'), searching: t('Searching'), complete: t('Complete'), error: t('Failed') };
  return <section aria-label={t('Search activity')} className={cn('flex min-w-0 flex-col gap-4', className)}><form className="flex min-w-0 flex-wrap items-end gap-2" onSubmit={event => { event.preventDefault(); if (!locked && query.trim()) onSearch?.(query); }}><div className="flex min-w-0 flex-1 flex-col gap-1.5"><Label htmlFor={id}>{t('Search query')}</Label><Input id={id} value={query} readOnly={!onQueryChange} disabled={locked} onChange={event => { if (!locked) onQueryChange?.(event.target.value); }} /></div><Button type="submit" pending={busy} className="[&_svg]:motion-reduce:animate-none" disabled={disabled || !onSearch || !query.trim()}>{t('Search')}</Button></form><ul className="flex min-w-0 flex-col gap-2">{sources.map((source, index) => {
    const href = safeSourceHref(source.href); const sourceLocked = locked || source.disabled; const detailsId = `${id}-detail-${index}`; const titleId = `${id}-title-${index}`; const collapsible = revealedIds !== undefined; const open = !collapsible || revealedIds.includes(source.id);
    return <li key={source.id} className="flex min-w-0 flex-col gap-2 rounded-lg border border-line bg-surface p-3"><div className="flex min-w-0 flex-wrap items-center gap-2"><span id={titleId} className="min-w-0 flex-1 break-words text-sm font-medium text-ink [overflow-wrap:anywhere]">{source.label}</span><span role="status" aria-atomic="true" aria-describedby={titleId} className={cn('inline-flex items-center gap-1.5 text-xs text-muted', source.status === 'error' && 'text-danger')}>{source.status === 'searching' && <span aria-hidden="true" className="size-1.5 rounded-full bg-current motion-safe:animate-pulse motion-reduce:animate-none" />}{labels[source.status]}</span>{validCount(source.resultCount) && <span className="text-xs text-muted">{t('{{count}} results', { count: Math.floor(source.resultCount) })}</span>}</div>{source.detail != null && <>{collapsible && <Button size="sm" variant="ghost" className="self-start" aria-expanded={open} aria-controls={detailsId} aria-describedby={titleId} disabled={sourceLocked || !onRevealChange} onClick={() => { if (!sourceLocked) onRevealChange?.(open ? revealedIds.filter(sourceId => sourceId !== source.id) : [...new Set([...revealedIds, source.id])]); }}>{open ? t('Hide details') : t('Show details')}</Button>}<div id={detailsId} hidden={!open} className="text-sm text-muted [overflow-wrap:anywhere]">{source.detail}</div></>}{(href || sourceActionLabel) && <div className="flex flex-wrap items-center gap-2">{href && (sourceLocked ? <span aria-disabled="true" className="text-sm text-muted">{extra('Open source')}</span> : <a href={href} rel="noopener noreferrer" aria-describedby={titleId} className="rounded-sm text-sm text-accent underline underline-offset-4 outline-none focus-visible:ring-2 focus-visible:ring-focus">{extra('Open source')}</a>)}{sourceActionLabel && <Button size="sm" variant="ghost" disabled={sourceLocked || !onSourceAction} onClick={() => { if (!sourceLocked) onSourceAction?.(source.id); }}>{sourceActionLabel}</Button>}</div>}</li>;
  })}</ul>{!sources.length && <p role="status" className="py-3 text-sm text-muted">{extra('No search sources')}</p>}</section>;
}

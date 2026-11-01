// Author: yunnuo <ymz@ebox.vip>
// Description: User-only dashboard widget; disabled platform feeds disappear, detail is reauthorized on every open.
import { useCallback, useEffect, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronRight, Info, Megaphone, OctagonAlert, Pause, Play } from 'lucide-react';
import type { AnnouncementPublic, WebClient } from '@unicore/sdk';
import { currentLocale, defineMessages, t, useI18n } from './i18n';
import { Badge, Button, Modal } from './ui';
import { RichContent, contentSummary } from './rich-content';

export const announcementTypes = defineMessages({ info: '通知', success: '好消息', warning: '注意事项', error: '重要提醒' });
const typeIcons = { info: Info, success: CheckCircle2, warning: AlertTriangle, error: OctagonAlert };
const typeVariants = { info: 'info', success: 'success', warning: 'warning', error: 'danger' } as const;
const dotTone = { info: 'bg-info', success: 'bg-success', warning: 'bg-warning', error: 'bg-danger' };

export function AnnouncementType({ type }: { type: AnnouncementPublic['type'] }) {
  const { t } = useI18n();
  const Icon = typeIcons[type];
  return <Badge variant={typeVariants[type]}><Icon size={12} aria-hidden="true" />{t(announcementTypes[type])}</Badge>;
}

const feedSize = 5;

export function AnnouncementCard({ web }: { web: WebClient }) {
  const { t } = useI18n();
  const [cursor, setCursor] = useState({ page: 1, index: 0 });
  const [selected, setSelected] = useState('');
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [stopped, setStopped] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const query = useQuery({
    queryKey: ['announcements', cursor.page, feedSize],
    queryFn: () => web.announcements(cursor.page, feedSize),
    placeholderData: keepPreviousData,
    refetchInterval: 60000,
    refetchOnWindowFocus: 'always',
  });
  const feed = query.data;
  const index = feed ? Math.min(query.isPlaceholderData ? feed.items.length - 1 : cursor.index, feed.items.length - 1) : 0;
  const item = feed?.items[index];
  const advance = useCallback(() => {
    if (!feed?.items.length || query.isPlaceholderData) return;
    setCursor(current => current.index + 1 < feed.items.length
      ? { ...current, index: current.index + 1 }
      : { page: current.page * feedSize < feed.total ? current.page + 1 : 1, index: 0 });
  }, [feed, query.isPlaceholderData]);
  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const changed = () => setReducedMotion(media.matches);
    media.addEventListener('change', changed);
    return () => media.removeEventListener('change', changed);
  }, []);
  useEffect(() => {
    if (feed && !query.isPlaceholderData && cursor.page > Math.max(1, Math.ceil(feed.total / feedSize))) setCursor({ page: 1, index: 0 });
  }, [feed, query.isPlaceholderData, cursor.page]);
  useEffect(() => {
    if (!feed?.enabled || feed.total < 2 || query.isFetching || reducedMotion || stopped || hovered || focused || selected) return;
    const timer = window.setInterval(() => { if (!document.hidden) advance(); }, 5000);
    return () => window.clearInterval(timer);
  }, [feed, query.isFetching, reducedMotion, stopped, hovered, focused, selected, advance]);
  if (query.isPending || (feed && (!feed.enabled || feed.total === 0))) return null;
  return <article className="announcement-card flex min-h-14 min-w-0 items-center gap-3 px-4 py-2.5" aria-label={t('平台公告')}
    onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
    onFocusCapture={() => setFocused(true)} onBlurCapture={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setFocused(false); }}>
    <div className="flex shrink-0 items-center gap-2 border-e border-line pe-3">
      <Megaphone size={16} className="text-accent" aria-hidden="true" />
      <h2 className="whitespace-nowrap text-xs font-semibold text-ink">{t('平台公告')}</h2>
    </div>
    <div className="min-w-0 flex-1">
      {query.error
        ? <div className="flex min-h-9 items-center gap-2 text-xs text-muted">
            <span className="truncate" role="alert">{t('公告暂时无法加载')}</span>
            <Button variant="link" size="sm" className="h-auto p-0" onClick={() => void query.refetch()}>{t('重试')}</Button>
          </div>
        : item && <button type="button" className="announcement-feed-item block w-full min-w-0 rounded-md px-1 py-1.5 text-start hover:bg-surface-alt focus-visible:bg-primary-soft focus-visible:outline-none"
            onClick={() => setSelected(item.id)} aria-label={t('查看公告：{{content}}', { content: contentSummary(item.content_html) })}>
            <span key={item.id} className="announcement-ticker-slide flex min-h-5 items-center gap-2.5">
              <span className={`size-1.5 shrink-0 rounded-full ${dotTone[item.type]}`} title={t(announcementTypes[item.type])} />
              <span className="announcement-ticker-summary min-w-0 flex-1 truncate text-xs leading-relaxed text-ink">{contentSummary(item.content_html)}</span>
              <time dateTime={new Date(item.publish_at * 1000).toISOString()} className="shrink-0 text-2xs tabular-nums text-muted">
                {new Date(item.publish_at * 1000).toLocaleDateString(currentLocale(), { month: '2-digit', day: '2-digit' })}
              </time>
              <ChevronRight size={14} className="shrink-0 text-muted" aria-hidden="true" />
            </span>
          </button>}
    </div>
    {item && feed && feed.total > 1 && <div className="flex shrink-0 items-center gap-0.5">
      <span className="me-1 flex gap-1 text-2xs tabular-nums text-muted">{(feed.page - 1) * feedSize + index + 1}<span className="text-subtle">/</span>{feed.total}</span>
      {!reducedMotion && <Button variant="ghost" size="icon" className="size-7" aria-label={t(stopped ? '继续公告轮播' : '暂停公告轮播')} title={t(stopped ? '继续公告轮播' : '暂停公告轮播')}
        onClick={() => setStopped(value => !value)}>{stopped ? <Play size={13} /> : <Pause size={13} />}</Button>}
      <Button variant="ghost" size="icon" className="size-7" aria-label={t('下一条公告')} title={t('下一条公告')} disabled={query.isFetching} onClick={advance}>
        <ChevronDown size={14} />
      </Button>
    </div>}
    {selected && <AnnouncementDetail web={web} id={selected} onClose={() => setSelected('')} />}
  </article>;
}

function AnnouncementDetail({ web, id, onClose }: { web: WebClient; id: string; onClose: () => void }) {
  const { t } = useI18n();
  const query = useQuery({ queryKey: ['announcement', id], queryFn: () => web.announcement(id), staleTime: 0, gcTime: 0, retry: false });
  return <Modal title={t('公告详情')} onClose={onClose}>
    {query.isPending
      ? <div role="status" className="py-6 text-center text-sm text-muted">{t('正在读取公告…')}</div>
      : query.isError
        ? <div role="alert" className="flex flex-col items-center gap-2 py-6 text-center">
            <p className="text-sm text-danger">{t(query.error.message)}</p>
            <Button variant="secondary" size="sm" onClick={() => void query.refetch()}>{t('重试')}</Button>
          </div>
        : query.data && <>
            <div className="mb-4 flex items-center gap-3 text-xs text-muted">
              <AnnouncementType type={query.data.type} />
              <time>{new Date(query.data.publish_at * 1000).toLocaleString(currentLocale())}</time>
            </div>
            <RichContent html={query.data.content_html} />
          </>}
    <div className="mt-4 flex justify-end">
      <Button variant="secondary" onClick={onClose}>{t('关闭')}</Button>
    </div>
  </Modal>;
}

// Author: yunnuo <ymz@ebox.vip>
// Description: User announcement bell, paginated inbox and acknowledged popup queue within the session boundary.
import { useEffect, useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Bell, CheckCheck, CheckCircle2, ChevronLeft, ChevronRight, Info, OctagonAlert } from 'lucide-react';
import type { AnnouncementPublic, WebClient } from '@unicore/sdk';
import { currentLocale, defineMessages, useI18n } from './i18n';
import { Badge, Button, Dialog, DialogContent, DialogHeader, DialogTitle } from './ui';
import { RichContent, contentSummary } from './rich-content';

export const announcementTypes = defineMessages({ info: '通知', success: '好消息', warning: '注意事项', error: '重要提醒' });
const typeIcons = { info: Info, success: CheckCircle2, warning: AlertTriangle, error: OctagonAlert };
const typeVariants = { info: 'info', success: 'success', warning: 'warning', error: 'danger' } as const;
export function AnnouncementType({ type }: { type: AnnouncementPublic['type'] }) {
  const { t } = useI18n();
  const Icon = typeIcons[type];
  return <Badge variant={typeVariants[type]}><Icon size={12} aria-hidden="true" />{t(announcementTypes[type])}</Badge>;
}
const date = (value: number) => new Date(value * 1000).toLocaleString(currentLocale(), { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });

export function AnnouncementCenter({ web }: { web: WebClient }) {
  const { t } = useI18n();
  const cache = useQueryClient();
  const [open, setOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState('');
  const [ready, setReady] = useState(false);
  const [dismissed, setDismissed] = useState<Set<string>>(() => new Set());
  const refresh = () => cache.invalidateQueries({ queryKey: ['announcements'] });
  const feed = useQuery({ queryKey: ['announcements', 'inbox', page], queryFn: () => web.announcements(page, 10), placeholderData: keepPreviousData, refetchInterval: 60000, refetchOnWindowFocus: 'always' });
  // Fetch unread popup notices independently, so inbox pagination never drops notifications.
  const popups = useQuery({ queryKey: ['announcements', 'popups'], queryFn: () => web.announcements(1, 1, true), refetchInterval: 60000, refetchOnWindowFocus: 'always' });
  useEffect(() => { const timer = window.setTimeout(() => setReady(true), 3000); return () => window.clearTimeout(timer); }, []);
  useEffect(() => {
    const end = [...(feed.data?.items ?? []), ...(popups.data?.items ?? [])].map(item => item.ends_at).filter(value => value > Date.now() / 1000).sort((a, b) => a - b)[0];
    if (!end) return;
    const timer = window.setTimeout(() => { void refresh(); }, Math.min(2147483647, Math.max(0, end * 1000 - Date.now() + 50)));
    return () => window.clearTimeout(timer);
  }, [feed.data, popups.data]);
  useEffect(() => { if (feed.data && page > Math.max(1, Math.ceil(feed.data.total / 10))) setPage(1); }, [feed.data, page]);
  const allRead = useMutation({ mutationFn: () => web.markAllAnnouncementsRead(), onSuccess: async () => { setPage(1); await refresh(); } });
  const candidate = popups.data?.enabled ? popups.data.items.find(item => !dismissed.has(item.id)) : undefined;
  const popup = ready && !open && !selected ? candidate : undefined;
  const unread = feed.data?.unread_count ?? 0;
  return <>
    <Button variant="ghost" size="icon" className="relative size-8" aria-label={t('平台公告')} title={t('平台公告')} onClick={() => { setOpen(true); void refresh(); }}>
      <Bell size={19} aria-hidden="true" />
      {unread > 0 && <span className="absolute -end-1 -top-1 flex min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] leading-4 text-white" aria-label={t('{{count}} 条未读公告', { count: unread })}>{unread > 99 ? '99+' : unread}</span>}
    </Button>
    {open && <Dialog open onOpenChange={value => { if (!value) setOpen(false); }}>
      <DialogContent className="max-w-[620px]">
        <DialogHeader><DialogTitle>{t('平台公告')}</DialogTitle></DialogHeader>
        <div className="mb-3 flex items-center justify-between gap-2 border-b border-line pb-3">
          <span className="text-xs text-muted">{t('{{count}} 条未读公告', { count: unread })}</span>
          <Button variant="secondary" size="sm" disabled={!unread || allRead.isPending} pending={allRead.isPending} onClick={() => allRead.mutate()}><CheckCheck size={14} />{t('全部标为已读')}</Button>
        </div>
        {feed.isPending ? <p role="status" className="py-10 text-center text-sm text-muted">{t('正在读取公告…')}</p>
          : feed.isError ? <div role="alert" className="py-8 text-center"><p className="mb-3 text-sm text-danger">{t('公告暂时无法加载')}</p><Button variant="secondary" onClick={() => void feed.refetch()}>{t('重试')}</Button></div>
          : !feed.data?.items.length ? <div className="flex flex-col items-center gap-3 py-12 text-muted"><Bell size={32} /><p className="text-sm">{t('暂无公告')}</p></div>
          : <div className="flex max-h-[55dvh] flex-col gap-1 overflow-y-auto" aria-busy={feed.isFetching}>
              {feed.data.items.map(item => <button key={item.id} type="button" className="flex items-start gap-3 rounded-lg p-3 text-start hover:bg-surface-alt focus-visible:outline-focus" onClick={() => setSelected(item.id)}>
                <span className={`mt-2 size-2 shrink-0 rounded-full ${item.read_at ? 'bg-line' : 'bg-accent'}`} aria-hidden="true" />
                <span className="min-w-0 flex-1"><span className={`block break-words text-sm ${item.read_at ? 'text-muted' : 'font-semibold text-ink'}`}>{item.title}</span><span className="mt-1 block truncate text-xs text-muted">{contentSummary(item.content_html)}</span><time className="mt-2 block text-2xs text-subtle">{date(item.publish_at)}</time></span>
                <span className="shrink-0 text-2xs text-muted">{t(item.read_at ? '已读' : '未读')}</span>
              </button>)}
            </div>}
        {feed.data && feed.data.total > 10 && <div className="mt-3 flex items-center justify-end gap-2 border-t border-line pt-3 text-xs text-muted">
          <Button variant="ghost" size="icon" aria-label={t('上一页')} disabled={page === 1 || feed.isFetching} onClick={() => setPage(value => value - 1)}><ChevronLeft size={15} /></Button>
          <span>{page} / {Math.max(1, Math.ceil(feed.data.total / 10))}</span>
          <Button variant="ghost" size="icon" aria-label={t('下一页')} disabled={page * 10 >= feed.data.total || feed.isFetching} onClick={() => setPage(value => value + 1)}><ChevronRight size={15} /></Button>
        </div>}
      </DialogContent>
    </Dialog>}
    {(selected || popup) && <AnnouncementDetail key={selected || popup!.id} web={web} id={selected || popup!.id} popup={!selected}
      onRead={() => { if (popup) setDismissed(values => new Set([...values, popup.id])); void refresh(); }}
      onClose={() => { setSelected(''); if (popup) setDismissed(values => new Set([...values, popup.id])); }} />}
  </>;
}

function AnnouncementDetail({ web, id, popup, onClose, onRead }: { web: WebClient; id: string; popup: boolean; onClose: () => void; onRead: () => void }) {
  const { t } = useI18n();
  const cache = useQueryClient();
  const query = useQuery({ queryKey: ['announcement', id], queryFn: () => web.announcement(id), staleTime: 0, gcTime: 0, retry: false, refetchInterval: 15000 });
  const [read, setRead] = useState(false);
  const receipt = useMutation({ mutationFn: () => web.markAnnouncementRead(id), onSuccess: () => { setRead(true); onRead(); void cache.invalidateQueries({ queryKey: ['announcement', id] }); } });
  // Opening a list detail records first read; popup acknowledgement waits for an explicit click.
  useEffect(() => { if (!popup && query.data && !query.data.read_at && !read && !receipt.isPending && !receipt.isError) receipt.mutate(); }, [popup, query.data, read, receipt.isPending, receipt.isError]);
  const pending = receipt.isPending;
  return <Dialog open onOpenChange={value => { if (!value && !pending && (!popup || query.isError)) onClose(); }}>
    <DialogContent className={popup ? 'max-w-[680px]' : 'max-w-[780px]'} showClose={!popup || query.isError}
      onEscapeKeyDown={event => { if (pending || (popup && !query.isError)) event.preventDefault(); }} onInteractOutside={event => { if (pending || popup) event.preventDefault(); }}>
      <DialogHeader><DialogTitle>{query.data?.title ?? t('公告详情')}</DialogTitle></DialogHeader>
      {query.isPending ? <p role="status" className="py-10 text-center text-sm text-muted">{t('正在读取公告…')}</p>
        : query.isError ? <div role="alert" className="py-6 text-center"><p className="mb-3 text-sm text-danger">{t(query.error.message)}</p><Button variant="secondary" onClick={() => void query.refetch()}>{t('重试')}</Button><Button variant="ghost" onClick={onClose}>{t('关闭')}</Button></div>
        : query.data && <>
          <div className="mb-4 flex flex-wrap items-center gap-3 text-xs text-muted"><AnnouncementType type={query.data.type} /><time>{date(query.data.publish_at)}</time><Badge variant="subtle">{t(read || query.data.read_at ? '已读' : '未读')}</Badge></div>
          <div className="max-h-[50dvh] overflow-y-auto break-words"><RichContent html={query.data.content_html} /></div>
          {receipt.isError && <p role="alert" className="mt-3 text-sm text-danger">{t('已读状态保存失败，请重试。')}</p>}
          <div className="mt-5 flex justify-end gap-2 border-t border-line pt-4">
            {!popup && <Button variant="secondary" disabled={pending} onClick={onClose}>{t('关闭')}</Button>}
            {(popup || receipt.isError) && <Button pending={pending} onClick={() => receipt.mutate(undefined, { onSuccess: () => { if (popup) onClose(); } })}><CheckCheck size={15} />{t('标为已读')}</Button>}
          </div>
        </>}
    </DialogContent>
  </Dialog>;
}

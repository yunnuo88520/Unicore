// Author: yunnuo <ymz@ebox.vip>
// Description: User notification bell: anchored center popover over realtime inbox pushes, paginated announcements and acknowledged popup queue.
import { useEffect, useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from '@tanstack/react-router';
import { AlertTriangle, Bell, CheckCheck, CheckCircle2, ChevronLeft, ChevronRight, Info, Megaphone, OctagonAlert, Settings2 } from 'lucide-react';
import type { AnnouncementPublic, InboxEntry, WebClient } from '@unicore/sdk';
import { currentLocale, defineMessages, t, useI18n } from './i18n';
import { Badge, Button, Dialog, DialogContent, DialogHeader, DialogTitle, Popover, PopoverContent, PopoverTrigger } from '@unicore/ui';
import { NotificationCenter, type NotificationItem, type NotificationStatus } from '@unicore/ui/composites';
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
// Registered inbox types map to the panel's status disc; unknown types fall back to neutral.
const inboxDisc: Record<string, { status: NotificationStatus; icon?: typeof Megaphone }> = {
  announcement: { status: 'information', icon: Megaphone },
  system: { status: 'neutral', icon: Settings2 },
};

export function AnnouncementCenter({ web, administrator = false, standalone = false }: { web: WebClient; administrator?: boolean; standalone?: boolean }) {
  const { t } = useI18n();
  const cache = useQueryClient();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState(administrator || standalone ? 'inbox' : 'announcements');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState('');
  const [expanded, setExpanded] = useState('');
  const [ready, setReady] = useState(false);
  const [dismissed, setDismissed] = useState<Set<string>>(() => new Set());
  const router = useRouter();
  const refresh = () => cache.invalidateQueries({ queryKey: ['announcements'] });
  // Announcements stay a user-domain audience: administrators get the inbox tab
  // only, so their bell carries module/system notifications without the
  // announcement audience model.
  const feed = useQuery({ queryKey: ['announcements', 'inbox', page], queryFn: () => web.announcements(page, 10), placeholderData: keepPreviousData, refetchOnWindowFocus: 'always', enabled: !administrator && !standalone });
  // Fetch unread popup notices independently, so inbox pagination never drops notifications.
  const popups = useQuery({ queryKey: ['announcements', 'popups'], queryFn: () => web.announcements(1, 1, true), refetchOnWindowFocus: 'always', enabled: !administrator && !standalone });
  const inbox = useQuery({ queryKey: ['inbox'], queryFn: () => web.inbox(), refetchOnWindowFocus: 'always' });
  // Transport owns credentials, identity realm, reconnects and session cleanup.
  // Refetch authoritative counts after every push and reconnect; never count events locally.
  useEffect(() => web.subscribeEvents(() => {
    void cache.invalidateQueries({ queryKey: ['inbox'] });
    void cache.invalidateQueries({ queryKey: ['announcements'] });
    void cache.invalidateQueries({ queryKey: ['announcement'] });
  }), [web, cache]);
  useEffect(() => { if (administrator || standalone) return; const timer = window.setTimeout(() => setReady(true), 3000); return () => window.clearTimeout(timer); }, [administrator, standalone]);
  useEffect(() => {
    if (administrator || standalone) return;
    const end = [...(feed.data?.items ?? []), ...(popups.data?.items ?? [])].map(item => item.ends_at).filter(value => value > Date.now() / 1000).sort((a, b) => a - b)[0];
    if (!end) return;
    const timer = window.setTimeout(() => { void refresh(); }, Math.min(2147483647, Math.max(0, end * 1000 - Date.now() + 50)));
    return () => window.clearTimeout(timer);
  }, [administrator, standalone, feed.data, popups.data]);
  useEffect(() => { if (feed.data && page > Math.max(1, Math.ceil(feed.data.total / 10))) setPage(1); }, [feed.data, page]);
  const allRead = useMutation({ mutationFn: () => web.markAllAnnouncementsRead(), onSuccess: async () => { setPage(1); await refresh(); } });
  const inboxRead = useMutation({ mutationFn: (id: string) => web.readInbox(id), onSuccess: data => { cache.setQueryData(['inbox'], data); } });
  const inboxAllRead = useMutation({ mutationFn: () => web.readAllInbox(), onSuccess: data => { cache.setQueryData(['inbox'], data); } });
  const candidate = popups.data?.enabled ? popups.data.items.find(item => !dismissed.has(item.id)) : undefined;
  const popup = ready && !open && !selected ? candidate : undefined;
  const inboxUnread = inbox.data?.unread ?? 0;
  const unread = feed.data?.unread_count ?? 0;
  // Each tab renders its own source; the panel stays presentational.
  const items: NotificationItem[] = tab === 'announcements'
    ? (feed.data?.items ?? []).map(item => ({ id: item.id, title: item.title, description: contentSummary(item.content_html), timestamp: date(item.publish_at), unread: !item.read_at, status: 'information' as const }))
    : (inbox.data?.items ?? []).map(item => {
      const disc = inboxDisc[item.type];
      return { id: item.id, title: item.title, description: expanded === item.id ? item.body : item.body.length > 120 ? `${item.body.slice(0, 120)}…` : item.body, timestamp: date(item.created_at), unread: !item.read_at, status: disc?.status ?? 'neutral', icon: disc?.icon, actions: (item.actions ?? []).map(action => ({ id: action.id, label: action.label, href: action.href })) };
    });
  const pending = tab === 'announcements' ? feed.isPending : inbox.isPending;
  const error = tab === 'announcements' ? feed.error : inbox.error;
  const emptyMessage = tab === 'announcements' ? t('暂无公告') : t('暂无通知');
  return <>
    <Popover open={open} onOpenChange={value => { setOpen(value); if (value) { void refresh(); void cache.invalidateQueries({ queryKey: ['inbox'] }); } }}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative size-8" aria-label={t('通知中心')} title={t('通知中心')}>
          <Bell size={19} aria-hidden="true" />
          {(administrator || standalone ? inboxUnread : unread + inboxUnread) > 0 && <span className="absolute -end-1 -top-1 flex min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] leading-4 text-on-primary" aria-label={t('{{count}} 条未读消息', { count: administrator || standalone ? inboxUnread : unread + inboxUnread })}>{(administrator ? inboxUnread : unread + inboxUnread) > 99 ? '99+' : administrator ? inboxUnread : unread + inboxUnread}</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" sideOffset={8} role="dialog" aria-label={t('通知中心')} className="w-[min(440px,calc(100vw-24px))] rounded-2xl border-0 p-0">
        <NotificationCenter
          title={t('通知中心')}
          tabs={!administrator && !standalone
            ? [
              { id: 'announcements', label: t('公告'), count: unread },
              { id: 'inbox', label: t('通知'), count: inboxUnread },
            ]
            : [{ id: 'inbox', label: t('通知'), count: inboxUnread }]}
          activeTabId={tab}
          onTabChange={setTab}
          items={pending ? [] : items}
          unreadCount={!administrator && !standalone && tab === 'announcements' ? unread : inboxUnread}
          empty={error ? <span className="flex flex-col items-center gap-2"><span className="text-sm text-danger">{t(tab === 'announcements' ? '公告暂时无法加载' : '通知暂时无法加载')}</span><Button variant="secondary" size="sm" onClick={() => { void (tab === 'announcements' ? feed.refetch() : inbox.refetch()); }}>{t('重试')}</Button></span>
            : pending ? <span role="status" className="text-sm text-muted">{t(tab === 'announcements' ? '正在读取公告…' : '正在读取通知…')}</span>
              : <span className="text-sm">{t(tab === 'announcements' ? '暂无公告' : '暂无通知')}</span>}
          busy={(tab === 'announcements' ? feed.isFetching : inbox.isFetching) || allRead.isPending || inboxAllRead.isPending}
          onMarkAllRead={() => { if (tab === 'announcements') allRead.mutate(); else inboxAllRead.mutate(); }}
          onAction={(itemId, actionId) => {
            const entry = (inbox.data?.items ?? []).find(item => item.id === itemId);
            const action = entry?.actions?.find(candidate => candidate.id === actionId);
            if (!action?.href) return;
            setOpen(false);
            if (/^https?:\/\//i.test(action.href)) window.location.assign(action.href);
            else void router.navigate({ href: action.href });
          }}
          onItemActivate={id => {
            if (tab === 'announcements') { setSelected(id); setOpen(false); return; }
            const entry = (inbox.data?.items ?? []).find(item => item.id === id);
            setExpanded(current => current === id ? '' : id);
            if (entry && !entry.read_at) inboxRead.mutate(id);
          }}
        />
        {tab === 'announcements' && feed.data && feed.data.total > 10 && <div className="flex items-center justify-end gap-2 border-t border-line px-4 py-2.5 text-xs text-muted">
          <Button variant="ghost" size="icon" className="size-7" aria-label={t('上一页')} disabled={page === 1 || feed.isFetching} onClick={() => setPage(value => value - 1)}><ChevronLeft size={15} /></Button>
          <span>{page} / {Math.max(1, Math.ceil(feed.data.total / 10))}</span>
          <Button variant="ghost" size="icon" className="size-7" aria-label={t('下一页')} disabled={page * 10 >= feed.data.total || feed.isFetching} onClick={() => setPage(value => value + 1)}><ChevronRight size={15} /></Button>
        </div>}
      </PopoverContent>
    </Popover>
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

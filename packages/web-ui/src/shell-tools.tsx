// Author: yunnuo <ymz@ebox.vip>
// Description: Shared version capsule for every workspace sidebar: a popover with the current version and update status; super administrators with the updater capability check, jump to the edition console or roll back, everyone else reads.
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowUp, CheckCircle2, ExternalLink, History, RefreshCw } from 'lucide-react';
import type { AppClient, Bootstrap } from '@unicore/sdk';
import { canAccess } from './routes';
import { t, useLocale } from './i18n';
import { Button, Tooltip } from '@unicore/ui';

export const workspaceLinks = {
  documentation: 'https://github.com/yunnuo88520/Unicore/tree/main/docs',
  quickStart: 'https://github.com/yunnuo88520/Unicore#readme',
};

export function VersionBadge({ client, metadata, onOpen }: { client: AppClient; metadata?: Bootstrap; onOpen: () => void }) {
  useLocale();
  const [open, setOpen] = useState(false);
  const badge = useRef<HTMLButtonElement>(null);
  const cache = useQueryClient();
  // Update checks stay a super-admin capability: canAccess('edition') is
  // super-only on web-platform and feature-gated elsewhere, so restricted
  // operators and members never fire the request.
  const canManage = canAccess('edition', metadata) && !!metadata?.capabilities.updater && !!client.updates;
  const overview = useQuery({ queryKey: ['system-updates'], queryFn: () => client.updates!.overview(), enabled: canManage, retry: false, staleTime: 30000 });
  const check = useMutation({
    mutationFn: () => client.updates!.check(),
    onSuccess: data => cache.setQueryData(['system-updates'], data),
  });
  if (!metadata?.version) return null;
  const data = canManage ? check.data ?? overview.data : undefined;
  const status = !canManage ? 'readonly'
    : check.isError || overview.isError || data?.last_error ? 'offline'
    : data?.available ? 'available'
    : data?.checked_at ? 'latest' : 'idle';
  const statusText = !canManage
    ? t('当前版本')
    : status === 'offline' ? t('暂时无法连接更新源，仍可查看更新日志')
    : status === 'available' ? t('有新版本可用 {{version}}', { version: `v${data!.latest_version}` })
    : status === 'latest' ? t('已是最新版本')
    : t('尚未联网检查');
  // The release link reuses the catalogue's own per-release URL, like the
  // edition console's 查看发行详情; no synthetic releases page is invented.
  const releaseUrl = data?.history?.find(release => /^https:\/\//.test(release.url))?.url;
  return <div className="relative inline-flex">
    <Tooltip label={t(statusText)}>
      <button ref={badge} type="button" className={`version-badge status-${status} inline-flex items-center gap-2 rounded-[7px] bg-primary-soft px-2 py-[3px] text-[length:var(--font-10)] font-medium leading-[1.4] text-accent tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-focus`}
        aria-label={t('当前版本 {{version}}，{{status}}', { version: metadata.version, status: t(statusText) })}
        aria-expanded={open} onClick={() => setOpen(value => !value)}>
        <span>v{metadata.version}</span>
        <i aria-hidden="true" className={`size-[5px] rounded-full ${status === 'available' ? 'bg-success' : status === 'offline' ? 'bg-warning' : 'bg-subtle'}`} />
      </button>
    </Tooltip>
    {open && badge.current && <VersionPopover anchor={badge.current} metadata={metadata} status={status} statusText={statusText} canManage={canManage} releaseUrl={releaseUrl}
      checking={check.isPending} onCheck={() => check.mutate()} latest={data?.latest_version} onOpenConsole={() => { setOpen(false); onOpen(); }} onClose={() => setOpen(false)} />}
  </div>;
}

// The popover card: a centered version panel — the "当前版本" header row with
// the refresh shortcut, the large version number, the status line (green check
// when current, amber hint when a release is waiting, gray dot before the
// first check), full-width actions and a footer row for the release link and
// rollback. It portals to document.body because the sidebar clips absolutely
// positioned children (overflow-hidden) — a fixed-position layer above the
// sidebar (z-[60], like the tooltip) keeps the card fully visible. It anchors
// above the badge, flips below near the viewport top, and sizes to its content
// with a min width so narrow sidebars never squeeze it.
function VersionPopover({ anchor, metadata, status, statusText, canManage, releaseUrl, checking, onCheck, latest, onOpenConsole, onClose }: {
  anchor: HTMLElement; metadata: Bootstrap; status: string; statusText: string; canManage: boolean; releaseUrl?: string;
  checking: boolean; onCheck: () => void; latest?: string; onOpenConsole: () => void; onClose: () => void;
}) {
  useLocale();
  const ref = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ left: number; top: number; placement: 'top' | 'bottom' }>();
  useLayoutEffect(() => {
    const place = () => {
      const popover = ref.current;
      if (!popover) return;
      const rect = anchor.getBoundingClientRect();
      const width = popover.offsetWidth;
      const height = popover.offsetHeight;
      // Default sits above the badge; the flip keeps it on screen when the
      // badge itself rides near the viewport top.
      const placement = rect.top - height - 12 < 8 ? 'bottom' : 'top';
      setPosition({
        top: placement === 'top' ? rect.top - height - 8 : rect.bottom + 8,
        left: Math.min(Math.max(rect.left, 8), Math.max(8, window.innerWidth - width - 8)),
        placement,
      });
    };
    place();
    window.addEventListener('resize', place);
    return () => window.removeEventListener('resize', place);
  }, [anchor]);
  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => { if (!ref.current?.contains(event.target as Node)) onClose(); };
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => { document.removeEventListener('pointerdown', onPointerDown); document.removeEventListener('keydown', onKeyDown); };
  }, [onClose]);
  const statusIcon = status === 'latest' ? <CheckCircle2 size={14} aria-hidden="true" className="shrink-0 text-success" />
    : status === 'available' ? <ArrowUp size={14} aria-hidden="true" className="shrink-0 text-warning" />
    : <i aria-hidden="true" className={`size-[5px] shrink-0 rounded-full ${status === 'offline' ? 'bg-warning' : 'bg-subtle'}`} />;
  const rollback = canManage && status === 'latest';
  return createPortal(<div ref={ref} role="dialog" aria-label={t('版本信息')} data-placement={position?.placement ?? 'top'}
    style={position ? { position: 'fixed', left: position.left, top: position.top } : { position: 'fixed', visibility: 'hidden' as const }}
    className="z-[60] w-max min-w-64 max-w-[min(20rem,calc(100vw-1rem))] rounded-xl border border-line bg-surface p-4 shadow-card">
    <div className="flex items-center justify-between gap-3">
      <span className="text-xs font-medium text-muted">{t('当前版本')}</span>
      {canManage && <Button variant="ghost" size="icon" className="size-7" aria-label={t('刷新')} pending={checking} onClick={onCheck}>
        {!checking && <RefreshCw size={13} aria-hidden="true" />}
      </Button>}
    </div>
    <p className="mt-2 text-center text-2xl font-semibold leading-tight text-ink tabular-nums">v{metadata.version}</p>
    <p className="mt-1.5 flex items-center justify-center gap-1.5 text-xs text-muted">{statusIcon}{statusText}</p>
    {canManage && <div className="mt-3 flex flex-col gap-2">
      {status === 'available' && <Button pending={checking} onClick={onOpenConsole}>{t('立即更新')}</Button>}
      <Button variant={status === 'available' ? 'secondary' : 'primary'} pending={checking} onClick={onCheck}>
        {!checking && <RefreshCw size={13} aria-hidden="true" />}{t('检查更新')}
      </Button>
    </div>}
    {(releaseUrl || rollback) && <div className="mt-3 flex items-center justify-center gap-4 border-t border-line pt-3">
      {releaseUrl && <a href={releaseUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-sm text-accent hover:underline">
        {t('查看发布')}<ExternalLink size={12} aria-hidden="true" />
      </a>}
      {rollback && <Button variant="ghost" size="sm" onClick={onOpenConsole}><History size={13} aria-hidden="true" />{t('版本回退')}</Button>}
    </div>}
  </div>, document.body);
}

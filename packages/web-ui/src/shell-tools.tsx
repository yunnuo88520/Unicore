// Author: yunnuo <ymz@ebox.vip>
// Description: Shared permission-aware version capsule and quiet documentation/about sidebar tools.
import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { BookOpen, ExternalLink, Info } from 'lucide-react';
import type { AppClient, Bootstrap } from '@unicore/sdk';
import { canAccess } from './routes';
import { t, useLocale } from './i18n';
import { productName } from './product.gen';
import { Tooltip } from './ui';

export const workspaceLinks = {
  documentation: 'https://github.com/yunnuo88520/Unicore/tree/main/docs',
  quickStart: 'https://github.com/yunnuo88520/Unicore#readme',
};

const iconButton = 'inline-flex size-8 items-center justify-center rounded-md text-muted transition-colors outline-none hover:bg-primary-soft hover:text-accent focus-visible:ring-2 focus-visible:ring-focus';

export function VersionBadge({ client, metadata, onOpen }: { client: AppClient; metadata?: Bootstrap; onOpen: () => void }) {
  useLocale();
  const allowed = canAccess('edition', metadata) && !!metadata?.capabilities.updater;
  const overview = useQuery({ queryKey: ['system-updates'], queryFn: () => client.updates!.overview(), enabled: allowed && !!client.updates, retry: false, staleTime: 30000 });
  if (!metadata?.version) return null;
  const data = overview.data;
  const status = overview.isError || data?.last_error ? 'offline' : data?.available ? 'available' : data?.checked_at ? 'latest' : 'idle';
  const text = status === 'offline' ? t('暂时无法连接更新源，仍可查看更新日志') : status === 'available' ? t('有新版本可用') : status === 'latest' ? t('已是最新版本') : t('查看版本与更新日志');
  const label = t('当前版本 {{version}}，{{status}}', { version: metadata.version, status: t(text) });
  return <Tooltip label={t(text)}>
    {allowed
      ? <button className={`version-badge status-${status} inline-flex items-center gap-2 rounded-[7px] bg-primary-soft px-2 py-[3px] text-[length:var(--font-10)] font-medium leading-[1.4] text-accent tabular-nums`} aria-label={t(label)} onClick={onOpen}><span>v{metadata.version}</span><i aria-hidden="true" className={`size-[5px] rounded-full ${status === 'available' ? 'bg-success' : status === 'offline' ? 'bg-warning' : 'bg-subtle'}`} /></button>
      : <span className="version-badge inline-flex items-center gap-2 rounded-[7px] bg-primary-soft px-2 py-[3px] text-[length:var(--font-10)] font-medium leading-[1.4] text-accent tabular-nums" aria-label={t(label)}>v{metadata.version}</span>}
  </Tooltip>;
}

export function SidebarTools({ onAbout }: { onAbout: () => void }) {
  useLocale();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => { if (!ref.current?.contains(event.target as Node)) setOpen(false); };
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape') { setOpen(false); ref.current?.querySelector('button')?.focus(); } };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', key);
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', key); };
  }, [open]);
  const link = 'flex items-center justify-between gap-3 rounded-md px-2.5 py-2.5 text-sm text-muted transition-colors outline-none hover:bg-primary-soft hover:text-accent focus-visible:bg-primary-soft';
  return <div className="relative flex items-center justify-between border-t border-line px-0.5 pb-4 pt-3.5" ref={ref}>
    <button className="flex items-center gap-2 rounded-sm px-1 py-1.5 text-xs text-muted transition-colors outline-none hover:text-accent focus-visible:ring-2 focus-visible:ring-focus" onClick={() => setOpen(value => !value)} aria-expanded={open}>
      <BookOpen size={16} aria-hidden="true" />{t('文档与帮助')}
    </button>
    <Tooltip label={t('关于 {{name}}', { name: productName })}>
      <button className={iconButton} aria-label={t('关于 {{name}}', { name: productName })} onClick={onAbout}><Info size={16} /></button>
    </Tooltip>
    {open && <div className="absolute inset-x-0 bottom-16 z-40 flex flex-col gap-0.5 rounded-lg border border-line bg-surface p-2 shadow-modal">
      <a className={link} href={workspaceLinks.quickStart} target="_blank" rel="noopener noreferrer">{t('快速开始')}<ExternalLink size={13} aria-hidden="true" /></a>
      <a className={link} href={workspaceLinks.documentation} target="_blank" rel="noopener noreferrer">{t('开发文档')}<ExternalLink size={13} aria-hidden="true" /></a>
    </div>}
  </div>;
}

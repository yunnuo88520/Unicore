// Author: yunnuo <ymz@ebox.vip>
// Description: Shared permission-aware version capsule and quiet documentation links used by the about dialog.
import { useQuery } from '@tanstack/react-query';
import type { AppClient, Bootstrap } from '@unicore/sdk';
import { canAccess } from './routes';
import { t, useLocale } from './i18n';
import { Tooltip } from '@unicore/ui';

export const workspaceLinks = {
  documentation: 'https://github.com/yunnuo88520/Unicore/tree/main/docs',
  quickStart: 'https://github.com/yunnuo88520/Unicore#readme',
};

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

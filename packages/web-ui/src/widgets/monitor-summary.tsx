// Author: yunnuo <ymz@ebox.vip>
// Description: Dashboard monitor summary: one status card that routes readers into the runtime monitor console.
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { ArrowRight, XCircle } from 'lucide-react';
import { Button } from '@unicore/ui';
import { cn } from '@unicore/ui/cn';
import { defineMessages, t, useI18n, useLocale } from '../i18n';
import { isAdministrator } from '../routes';
import type { AppClient, Bootstrap } from '@unicore/sdk';

const STATUS_LABELS = defineMessages({ healthy: '运行正常', degraded: '部分异常', unavailable: '不可用' });
const STATUS_DOTS: Record<string, string> = { healthy: 'bg-success', degraded: 'bg-warning', unavailable: 'bg-danger' };

/** Platform keeps the summary super-admin-only; local profiles always show it. */
export function MonitorSummaryWidget({ client, metadata }: { client: AppClient; metadata: Bootstrap }) {
  if (metadata.profile === 'web-platform') {
    if (!(isAdministrator(metadata) && metadata.current_user?.roles.includes('super_admin'))) return null;
  }
  if (!client.monitorSnapshot) return null;
  return <MonitorSummary client={client} />;
}

function MonitorSummary({ client }: { client: AppClient }) {
  useLocale();
  const { t } = useI18n();
  const query = useQuery({
    queryKey: ['monitor-snapshot'],
    queryFn: () => client.monitorSnapshot!(),
    enabled: !!client.monitorSnapshot,
    staleTime: 15_000,
    refetchInterval: 30_000,
    retry: 1,
  });
  const status = query.data?.status;
  return <section role="region" aria-label={t('运行状态摘要')}>
    <div className="flex flex-wrap items-center gap-3">
      {query.isPending
        ? <p role="status" className="text-sm text-muted">{t('正在读取运行状态…')}</p>
        : query.isError || !query.data
          ? <div className="flex flex-wrap items-center gap-2 text-sm text-danger" role="alert">
              <XCircle size={14} aria-hidden="true" />{t('运行状态不可用')}
              <Button variant="secondary" onClick={() => void query.refetch()}>{t('重试')}</Button>
            </div>
          : <>
              <span className="flex items-center gap-2 text-sm font-medium text-ink">
                <span aria-hidden="true" className={cn('inline-block size-2.5 rounded-full', STATUS_DOTS[status ?? ''] ?? 'bg-subtle')} />
                {t(STATUS_LABELS[status as keyof typeof STATUS_LABELS] ?? status ?? '')}
              </span>
              <span className="text-xs text-muted">v{query.data.version}</span>
              <span className="text-xs text-muted">{t('数据库')} {query.data.database.status === 'healthy' ? t('正常') : t('异常')}</span>
              <Link to="/monitor" className="ms-auto inline-flex items-center gap-1 text-xs text-accent hover:underline">
                {t('进入运行监控')}<ArrowRight size={12} aria-hidden="true" />
              </Link>
            </>}
    </div>
  </section>;
}

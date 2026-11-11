// Author: yunnuo <ymz@ebox.vip>
// Description: Administrator activity chart backed by the shared AppClient and an accessible data summary.
import { useQuery } from '@tanstack/react-query';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis } from 'recharts';
import { useI18n } from '../i18n';
import { isAdministrator } from '../routes';
import { Button, Card, CardContent } from '@unicore/ui';
import type { AppClient, Bootstrap, WebClient } from '@unicore/sdk';

export function ActivityWidget({ client, metadata }: { client: AppClient; metadata: Bootstrap }) {
  if (!isAdministrator(metadata) || !client.web) return null;
  return <ActivityChart web={client.web} />;
}

function ActivityChart({ web }: { web: WebClient }) {
  const { t } = useI18n();
  const query = useQuery({ queryKey: ['dashboard'], queryFn: () => web.adminDashboard(), staleTime: 60_000 });
  const days = query.data?.activity_7d ?? [];
  return <section role="region" aria-label={t('近 7 日平台活动')}><Card><CardContent>
    <h2 className="mb-3 text-sm font-medium">{t('近 7 日平台活动')}</h2>
    {query.isPending ? <p role="status" className="text-sm text-muted">{t('正在读取活动统计…')}</p>
      : query.isError ? <div role="alert" className="flex flex-wrap items-center gap-2 text-sm text-danger"><span>{t(query.error.message)}</span><Button variant="secondary" onClick={() => void query.refetch()}>{t('重试')}</Button></div>
      : !days.length ? <p className="text-sm text-muted">{t('暂无活动统计')}</p>
      : <>
        <p className="mb-3 text-xs text-muted">{t('近 7 日共 {{count}} 次活动', { count: days.reduce((sum, day) => sum + day.count, 0) })}</p>
        <div aria-hidden="true"><ResponsiveContainer width="100%" height={180}>
          <BarChart data={days}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-line)" />
            <XAxis dataKey="date" tickFormatter={(value: string) => value.slice(5)} fontSize={11} stroke="var(--color-muted)" />
            <Tooltip contentStyle={{ background: 'var(--color-surface)', borderColor: 'var(--color-line)', color: 'var(--color-ink)' }} />
            <Bar dataKey="count" name={t('活动次数')} fill="var(--color-primary)" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer></div>
        <ul className="sr-only" aria-label={t('每日活动统计')}>{days.map(day => <li key={day.date}>{t('{{date}}：{{count}} 次活动', { date: day.date, count: day.count })}</li>)}</ul>
      </>}
  </CardContent></Card></section>;
}

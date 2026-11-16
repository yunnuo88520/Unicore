// Author: yunnuo <ymz@ebox.vip>
// Description: Administrator activity chart backed by the shared AppClient and an accessible data summary.
import { useQuery } from '@tanstack/react-query';
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis } from 'recharts';
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
    <h2 className="text-md font-semibold">{t('近 7 日平台活动')}</h2>
    {query.isPending ? <p role="status" className="mt-3 text-sm text-muted">{t('正在读取活动统计…')}</p>
      : query.isError ? <div role="alert" className="mt-3 flex flex-wrap items-center gap-2 text-sm text-danger"><span>{t(query.error.message)}</span><Button variant="secondary" onClick={() => void query.refetch()}>{t('重试')}</Button></div>
      : !days.length ? <p className="mt-3 text-sm text-muted">{t('暂无活动统计')}</p>
      : <>
        <p className="mt-1 text-sm text-muted">{t('近 7 日共 {{count}} 次活动', { count: days.reduce((sum, day) => sum + day.count, 0) })}</p>
        <div aria-hidden="true"><ResponsiveContainer width="100%" height={220}>
          <BarChart data={days} margin={{ top: 16 }}>
            <CartesianGrid stroke="var(--color-line)" vertical={false} />
            <XAxis dataKey="date" tickFormatter={(value: string) => value.slice(5)} tick={{ fontSize: 11, fill: 'var(--color-muted)', fontFamily: 'var(--font-mono, monospace)' }} axisLine={false} tickLine={false} />
            <Tooltip cursor={{ fill: 'var(--color-surface-alt)' }} contentStyle={{ background: 'var(--color-surface)', borderColor: 'var(--color-line)', color: 'var(--color-ink)', borderRadius: 10 }} />
            <Bar dataKey="count" name={t('活动次数')} radius={[4, 4, 0, 0]}>
              {/* One accent on the day that matters (today); the rest sit in neutral steps. */}
              {days.map((day, index) => <Cell key={day.date} fill={index === days.length - 1 ? 'var(--color-primary)' : 'var(--color-subtle)'} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer></div>
        <ul className="sr-only" aria-label={t('每日活动统计')}>{days.map(day => <li key={day.date}>{t('{{date}}：{{count}} 次活动', { date: day.date, count: day.count })}</li>)}</ul>
      </>}
  </CardContent></Card></section>;
}

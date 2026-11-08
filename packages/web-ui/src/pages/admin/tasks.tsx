// Author: yunnuo <ymz@ebox.vip>
// Description: Scheduled task console: enablement switches and manual triggers backed by the scheduler registry.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useId, type ReactNode } from 'react';
import { ListChecks, Play } from 'lucide-react';
import type { TaskEntry, WebClient } from '@unicore/sdk';
import { currentLocale, t, useI18n, useLocale } from '../../i18n';
import { Badge, Button, Card, CardContent, Switch as Toggle, Table, TableBody, TableCell, TableEmpty, TableHead, TableHeader, TableRow, useMessage } from '@unicore/ui';
import type { PageProps } from '../../router';

const COLUMN_COUNT = 7;
const timeText = (seconds: number) => seconds
  ? new Date(seconds * 1000).toLocaleString(currentLocale(), { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
  : '—';

function Switch({ label, ...props }: { label: string; checked: boolean; disabled?: boolean; onChange: (value: boolean) => void }) {
  const id = useId();
  return <span className="inline-flex shrink-0 whitespace-nowrap"><label className="sr-only" htmlFor={id}>{label}</label><Toggle id={id} {...props} /></span>;
}

function StatusBadge({ entry }: { entry: TaskEntry }) {
  const { t } = useI18n();
  const status = entry.last_status;
  if (!status) return <span className="text-muted">—</span>;
  const variant = status === 'ok' ? 'success' : status === 'error' ? 'danger' : 'subtle';
  return <Badge variant={variant} title={entry.last_error || undefined}>{status === 'ok' ? t('正常') : status === 'error' ? t('失败') : status}</Badge>;
}

export function AdminTasksPage({ client }: PageProps) {
  if (!client.web) return null;
  return <TaskPanel web={client.web} />;
}

function TaskPanel({ web }: { web: WebClient }) {
  useLocale();
  const { t } = useI18n();
  const message = useMessage();
  const cache = useQueryClient();
  const list = useQuery({ queryKey: ['tasks'], queryFn: () => web.listTasks() });
  const refresh = () => void cache.invalidateQueries({ queryKey: ['tasks'] });
  const toggle = useMutation({
    mutationFn: ({ entry, enabled }: { entry: TaskEntry; enabled: boolean }) => web.updateTask(entry.name, { enabled }),
    onSuccess: () => { message.success(t('任务已更新')); refresh(); },
  });
  const trigger = useMutation({
    mutationFn: (entry: TaskEntry) => web.triggerTask(entry.name),
    onSuccess: () => { message.success(t('已触发立即执行')); refresh(); },
  });
  const pending = toggle.isPending || trigger.isPending;
  const render = (children: ReactNode) => <Card><CardContent className="flex flex-col gap-4">{children}</CardContent></Card>;
  if (list.isPending) return render(<p role="status" className="py-10 text-center text-sm text-muted">{t('正在读取定时任务…')}</p>);
  if (list.isError) return render(<div role="alert" className="flex flex-col items-start gap-3 py-8">
    <p className="text-sm text-danger">{t(list.error.message)}</p>
    <Button variant="secondary" onClick={() => void list.refetch()}>{t('重试')}</Button>
  </div>);
  const items = list.data?.items ?? [];
  return render(<>
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 className="text-md font-semibold text-ink">{t('定时任务')}</h2>
        <p className="mt-0.5 text-xs text-muted">{t('关闭的任务不再按计划执行，已保存的配置保持不变。')}</p>
      </div>
      <span className="text-xs text-muted">{t('{{count}} 个任务', { count: items.length })}</span>
    </div>
    <div className="min-w-0 rounded-lg border border-line" aria-busy={list.isFetching || pending}>
      <Table className="min-w-[760px]">
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead>{t('名称')}</TableHead>
            <TableHead>{t('执行计划')}</TableHead>
            <TableHead>{t('状态')}</TableHead>
            <TableHead>{t('上次运行')}</TableHead>
            <TableHead>{t('下次运行')}</TableHead>
            <TableHead>{t('执行次数')}</TableHead>
            <TableHead>{t('操作')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {!items.length && <TableEmpty colSpan={COLUMN_COUNT}>
            <span className="flex flex-col items-center gap-1.5 py-6">
              <ListChecks size={24} className="text-subtle" aria-hidden="true" />
              <strong className="text-sm text-ink">{t('暂无定时任务')}</strong>
              <span className="text-xs text-muted">{t('当前实例没有注册任何后台任务。')}</span>
            </span>
          </TableEmpty>}
          {items.map(entry => <TableRow key={entry.name}>
            <TableCell><strong className="font-medium text-ink">{entry.name}</strong></TableCell>
            <TableCell><code className="font-mono text-xs text-muted">{entry.schedule}</code></TableCell>
            <TableCell><Switch label={`${t('启用')} ${entry.name}`} checked={entry.enabled} disabled={pending} onChange={value => toggle.mutate({ entry, enabled: value })} /></TableCell>
            <TableCell><span className="flex items-center gap-2 whitespace-nowrap"><time className="text-muted">{timeText(entry.last_run_at)}</time><StatusBadge entry={entry} /></span></TableCell>
            <TableCell><time className="whitespace-nowrap text-muted">{entry.enabled ? timeText(entry.next_run_at) : '—'}</time></TableCell>
            <TableCell><span className="tabular-nums text-muted">{entry.run_count}</span></TableCell>
            <TableCell><Button variant="link" size="sm" className="h-auto p-0" disabled={pending} onClick={() => trigger.mutate(entry)}><Play size={13} />{t('立即执行')}</Button></TableCell>
          </TableRow>)}
        </TableBody>
      </Table>
    </div>
  </>);
}

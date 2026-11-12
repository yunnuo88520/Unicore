// Author: yunnuo <ymz@ebox.vip>
// Description: Scheduled task console: builtin registry plus administrator-created custom tasks over a whitelisted executor set.
import { useState, useId, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ListChecks, Play } from 'lucide-react';
import { AppError } from '@unicore/sdk';
import type { TaskEntry, WebClient } from '@unicore/sdk';
import { AppControllerField, AppField, AppForm, useAppForm } from '@unicore/form';
import { Badge, Button, Card, CardContent, ConfirmDialog, Input, Modal, NativeSelect, Switch as Toggle, Table, TableBody, TableCell, TableEmpty, TableHead, TableHeader, TableRow, Textarea, useMessage } from '@unicore/ui';
import { currentLocale, t, useI18n, useLocale } from '../../i18n';
import { DataTableEmpty } from '../../components/data-table';
import { invalidateAfter } from '../../queries';
import { usePermissions } from '../../permissions';
import type { PageProps } from '../../router';

const COLUMN_COUNT = 8;
const timeText = (seconds: number) => seconds
  ? new Date(seconds * 1000).toLocaleString(currentLocale(), { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
  : '—';

function Switch({ label, ...props }: { label: string; checked: boolean; disabled?: boolean; onChange: (value: boolean) => void }) {
  const id = useId();
  return <span className="inline-flex shrink-0 whitespace-nowrap"><label className="sr-only" htmlFor={id}>{label}</label><Toggle id={id} {...props} /></span>;
}

function StatusBadge({ status, error }: { status?: string; error?: string }) {
  const { t } = useI18n();
  if (!status) return <span className="text-muted">—</span>;
  const variant = status === 'ok' ? 'success' : status === 'error' ? 'danger' : 'subtle';
  return <Badge variant={variant} title={error || undefined}>{status === 'ok' ? t('正常') : status === 'error' ? t('失败') : status}</Badge>;
}

export function AdminTasksPage({ client, metadata }: PageProps) {
  useLocale();
  const web = client.web!;
  const cache = useQueryClient();
  const message = useMessage();
  const { can } = usePermissions(metadata);

  const list = useQuery({ queryKey: ['tasks'], queryFn: () => web.listTasks() });
  const [editor, setEditor] = useState<TaskEntry | 'new' | null>(null);
  const [history, setHistory] = useState<TaskEntry | null>(null);
  const [removing, setRemoving] = useState<TaskEntry | null>(null);
  const refresh = () => void cache.invalidateQueries({ queryKey: ['tasks'] });
  const toggle = useMutation({
    mutationFn: ({ entry, enabled }: { entry: TaskEntry; enabled: boolean }) => web.updateTask(entry.name, { enabled }),
    onSuccess: () => { message.success(t('任务已更新')); refresh(); },
    onError: error => message.error(t(error.message)),
  });
  const trigger = useMutation({
    mutationFn: (entry: TaskEntry) => web.triggerTask(entry.name),
    onSuccess: () => { message.success(t('已触发立即执行')); refresh(); },
    onError: error => message.error(t(error.message)),
  });
  const remove = useMutation({
    mutationFn: (entry: TaskEntry) => web.deleteTask(entry.name),
    onSuccess: () => { setRemoving(null); message.success(t('任务已删除')); refresh(); },
    onError: error => message.error(t(error.message)),
  });
  const pending = toggle.isPending || trigger.isPending;
  const render = (children: ReactNode) => <Card><CardContent className="flex flex-col gap-4">{children}</CardContent></Card>;
  if (list.isPending) return render(<p role="status" className="py-10 text-center text-sm text-muted">{t('正在读取定时任务…')}</p>);
  if (list.isError) return render(<div role="alert" className="flex flex-col items-start gap-3 py-8">
    <p className="text-sm text-danger">{t(list.error.message)}</p>
    <Button variant="secondary" onClick={() => void list.refetch()}>{t('重试')}</Button>
  </div>);
  const items = list.data?.items ?? [];
  const executors = list.data?.executors ?? [];
  return <>
    <Card><CardContent className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-md font-semibold text-ink">{t('定时任务')}</h2>
          <p className="mt-0.5 text-xs text-muted">{t('关闭的任务不再按计划执行，已保存的配置保持不变。自建任务只能调度已注册的执行器。')}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted">{t('{{count}} 个任务', { count: items.length })}</span>
          {can('createTask') && <Button onClick={() => setEditor('new')}>{t('新增任务')}</Button>}
        </div>
      </div>
      <div className="min-w-0 rounded-lg border border-line" aria-busy={list.isFetching || pending}>
        <Table className="min-w-[860px]">
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>{t('名称')}</TableHead>
              <TableHead>{t('说明')}</TableHead>
              <TableHead>{t('执行计划')}</TableHead>
              <TableHead>{t('启用')}</TableHead>
              <TableHead>{t('上次运行')}</TableHead>
              <TableHead>{t('下次运行')}</TableHead>
              <TableHead>{t('执行次数')}</TableHead>
              <TableHead>{t('操作')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {!items.length && <TableEmpty colSpan={COLUMN_COUNT}>
              <DataTableEmpty icon={ListChecks} title={t('暂无定时任务')} hint={t('当前实例没有注册任何后台任务。')} />
            </TableEmpty>}
            {items.map(entry => <TableRow key={entry.name}>
              <TableCell><strong className="font-medium text-ink">{entry.name}</strong></TableCell>
              <TableCell className="max-w-56"><span className="line-clamp-1 text-muted" title={entry.description}>{entry.description || '—'}</span></TableCell>
              <TableCell><code className="font-mono text-xs text-muted">{entry.schedule}</code></TableCell>
              <TableCell><Switch label={`${t('启用')} ${entry.name}`} checked={entry.enabled} disabled={pending || !can('updateTask')} onChange={value => toggle.mutate({ entry, enabled: value })} /></TableCell>
              <TableCell><span className="flex items-center gap-2 whitespace-nowrap"><time className="text-muted">{timeText(entry.last_run_at)}</time><StatusBadge status={entry.last_status} error={entry.last_error} /></span></TableCell>
              <TableCell><time className="whitespace-nowrap text-muted">{entry.enabled ? timeText(entry.next_run_at) : '—'}</time></TableCell>
              <TableCell><span className="tabular-nums text-muted">{entry.run_count}</span></TableCell>
              <TableCell><div className="flex gap-1 whitespace-nowrap">
                <Button variant="link" size="sm" className="h-auto p-0" disabled={pending || !can('triggerTask')} onClick={() => trigger.mutate(entry)}><Play size={13} />{t('立即执行')}</Button>
                {can('listTaskRuns') && entry.custom && <Button variant="link" size="sm" className="h-auto p-0" onClick={() => setHistory(entry)}>{t('运行日志')}</Button>}
                {entry.custom && <>
                  {can('editTask') && <Button variant="link" size="sm" className="h-auto p-0" aria-label={t('编辑任务 {{name}}', { name: entry.name })} onClick={() => setEditor(entry)}>{t('编辑')}</Button>}
                  {can('deleteTask') && <Button variant="link" size="sm" className="h-auto p-0 text-danger" aria-label={t('删除任务 {{name}}', { name: entry.name })} onClick={() => setRemoving(entry)}>{t('删除')}</Button>}
                </>}
              </div></TableCell>
            </TableRow>)}
          </TableBody>
        </Table>
      </div>
    </CardContent></Card>
    {editor && <TaskEditor web={web} executors={executors} entry={editor === 'new' ? undefined : editor} onClose={() => setEditor(null)} onSaved={() => { setEditor(null); refresh(); }} />}
    {history && <TaskRuns web={web} entry={history} onClose={() => setHistory(null)} />}
    {removing && <ConfirmDialog danger title={t('删除任务')} description={t('确定删除任务「{{name}}」？它的运行历史会一并删除。', { name: removing.name })} confirmLabel={t('确认删除')} cancelLabel={t('取消')} pending={remove.isPending} onConfirm={() => remove.mutate(removing)} onCancel={() => setRemoving(null)} />}
  </>;
}

function TaskEditor({ web, executors, entry, onClose, onSaved }: {
  web: WebClient;
  executors: { key: string; description: string }[];
  entry?: TaskEntry;
  onClose: () => void;
  onSaved: () => void;
}) {
  useLocale();
  const message = useMessage();
  const editing = !!entry;
  const save = useMutation({
    mutationFn: (values: { name: string; description: string; schedule: string; executor: string }) => editing
      ? web.editTask(entry!.name, { description: values.description, schedule: values.schedule, executor: values.executor })
      : web.createTask(values),
    onSuccess: () => { message.success(t('任务已保存')); onSaved(); },
    onError: error => { if (error instanceof AppError && error.code !== 'SESSION_CHANGED') message.error(t(error.message)); },
  });
  const form = useAppForm<{ name: string; description: string; schedule: string; executor: string }>({
    schema: editing ? 'TaskEditInput' : 'TaskCreateInput',
    defaultValues: { name: entry?.name ?? '', description: entry?.description ?? '', schedule: entry?.schedule ?? '@daily', executor: entry?.executor ?? executors[0]?.key ?? '' },
    onSubmit: async values => {
      try {
        await save.mutateAsync({ ...values, name: values.name.trim(), schedule: values.schedule.trim(), executor: values.executor.trim(), description: values.description.trim() });
      } catch (error) {
        form.applyServerError(error);
      }
    },
  });
  return <Modal title={t(editing ? '编辑任务' : '新增任务')} pending={save.isPending} onClose={onClose}>
    <AppForm form={form} className="flex flex-col gap-3">
      {!editing && <AppField name="name" label={t('任务名')}><Input autoComplete="off" maxLength={64} placeholder="cleanup.stale" /></AppField>}
      <AppField name="description" label={t('说明')}><Textarea maxLength={200} rows={2} /></AppField>
      <AppControllerField name="executor" label={t('执行器')}>{field => <NativeSelect value={String(field.value ?? '')} onChange={event => field.onChange(event.target.value)} className="max-w-full">
        {executors.map(item => <option key={item.key} value={item.key}>{t(item.key)} · {t(item.description)}</option>)}
      </NativeSelect>}</AppControllerField>
      <AppField name="schedule" label={t('执行计划')} rules={{ required: true }}>
        <Input autoComplete="off" maxLength={64} placeholder="0 3 * * * / @daily" />
      </AppField>
      <small className="text-xs text-muted">{t('支持 5 位或 6 位（含秒）cron 表达式，以及 @daily、@hourly、@every 30m 等描述符；保存时校验。')}</small>
      <div className="flex justify-end gap-2">
        <Button variant="secondary" disabled={save.isPending} onClick={onClose}>{t('取消')}</Button>
        <Button type="submit" pending={save.isPending}>{t('保存')}</Button>
      </div>
    </AppForm>
  </Modal>;
}

function TaskRuns({ web, entry, onClose }: { web: WebClient; entry: TaskEntry; onClose: () => void }) {
  useLocale();
  const list = useQuery({ queryKey: ['task-runs', entry.name], queryFn: () => web.listTaskRuns(entry.name), refetchInterval: 5000 });
  return <Modal title={t('运行日志：{{name}}', { name: entry.name })} onClose={onClose}>
    {list.isError ? <div role="alert" className="flex items-center gap-2 text-sm text-danger">{t(list.error.message)}<Button variant="secondary" onClick={() => void list.refetch()}>{t('重试')}</Button></div> : <Table>
      <TableHeader><TableRow>
        <TableHead>{t('开始时间')}</TableHead><TableHead>{t('状态')}</TableHead><TableHead>{t('耗时')}</TableHead><TableHead>{t('错误')}</TableHead>
      </TableRow></TableHeader>
      <TableBody>
        {(list.data?.items ?? []).map((run, index) => <TableRow key={index}>
          <TableCell className="whitespace-nowrap text-muted">{timeText(run.started_at)}</TableCell>
          <TableCell><StatusBadge status={run.status} error={run.error} /></TableCell>
          <TableCell className="tabular-nums text-muted">{run.duration_ms} ms</TableCell>
          <TableCell className="max-w-48"><span className="line-clamp-1 font-mono text-xs text-muted" title={run.error}>{run.error || '—'}</span></TableCell>
        </TableRow>)}
        {!list.data?.items.length && <TableEmpty colSpan={4}>{list.isPending ? t('正在加载…') : t('暂无运行记录')}</TableEmpty>}
      </TableBody>
    </Table>}
    <p className="mt-2 text-xs text-muted">{t('每个任务保留最近 50 条运行记录，每 5 秒自动刷新。')}</p>
  </Modal>;
}

// Author: yunnuo <ymz@ebox.vip>
// Description: Leftover overview, single active migration job control, history records and resumable progress reporting.
import { Fragment, useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, Ban, CheckCircle2, ChevronDown, Info, Pause, Play, RefreshCw, RotateCcw } from 'lucide-react';
import type { AppClient, StorageMigrationFailure } from '@unicore/sdk';
import { Badge, Button, Card, CardContent, CardFooter, CardHeader, ConfirmDialog, Progress, SimpleSelect, selectOptions, useMessage } from '@unicore/ui';
import { cn } from '@unicore/ui/cn';
import { t, useLocale } from '../../../i18n';
import { formatDate, formatSize, locationLabel, locationName as sharedLocationName, reasonLabel, statusLabel } from './shared';

const activeStatuses = ['running', 'paused'];

// History badge variants mirror the active strip: completed runs read as
// informational, cancelled runs stay muted and failures shout.
const historyStatusVariant = (status: string) => (status === 'running' ? 'success' : status === 'paused' ? 'warning' : status === 'completed' ? 'info' : status === 'cancelled' ? 'subtle' : 'danger');

export function MigrationPanel({ client, canWrite }: { client: AppClient; canWrite: boolean }) {
  const locale = useLocale();
  const message = useMessage();
  const cache = useQueryClient();
  const migrations = client.storageMigrations!;
  const storage = client.storage!;
  const [source, setSource] = useState('');
  const [target, setTarget] = useState('');
  const [confirmCancel, setConfirmCancel] = useState(false);
  const locations = useQuery({ queryKey: ['storage-locations'], queryFn: () => storage.storageLocations() });
  // The summary is cheap metadata; the active job drives live progress polling.
  const summary = useQuery({ queryKey: ['migration-summary'], queryFn: () => migrations.summary(), refetchInterval: 15000 });
  const current = useQuery({
    queryKey: ['migration-current'],
    queryFn: () => migrations.current(),
    refetchInterval: query => (activeStatuses.includes(query.state.data?.job?.status ?? '') ? 2000 : false),
  });
  const job = current.data?.job;
  const jobActive = !!job && activeStatuses.includes(job.status);
  // Failure details survive only the active run server-side; keep the ones
  // observed while polling so the newest history record can still show them.
  const [failureDetails, setFailureDetails] = useState<Record<string, StorageMigrationFailure[]>>({});
  const activeFailures = job?.failures;
  useEffect(() => {
    if (!job?.id || !activeFailures?.length) return;
    setFailureDetails(previous => (previous[job.id]?.length === activeFailures.length ? previous : { ...previous, [job.id]: activeFailures }));
  }, [job?.id, activeFailures]);
  const history = useQuery({ queryKey: ['migration-history'], queryFn: () => migrations.list(), refetchInterval: 15000 });
  const jobStatus = job?.status;
  useEffect(() => {
    if (jobStatus && !activeStatuses.includes(jobStatus)) void cache.invalidateQueries({ queryKey: ['migration-history'] });
  }, [cache, jobStatus]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const refresh = () => {
    void cache.invalidateQueries({ queryKey: ['migration-summary'] });
    void cache.invalidateQueries({ queryKey: ['migration-current'] });
    void cache.invalidateQueries({ queryKey: ['migration-history'] });
    void cache.invalidateQueries({ queryKey: ['storage-locations'] });
    void cache.invalidateQueries({ queryKey: ['file-catalog'] });
  };
  const create = useMutation({
    mutationFn: () => migrations.create({ source_location_id: source || undefined, target_location_id: target }),
    onSuccess: () => { message.success(t('迁移任务已启动')); setSource(''); setTarget(''); refresh(); },
  });
  const action = useMutation({
    mutationFn: ({ kind, id }: { kind: 'pause' | 'resume' | 'cancel' | 'retryFailed'; id: string }) => {
      if (kind === 'pause') return migrations.pause(id);
      if (kind === 'resume') return migrations.resume(id);
      if (kind === 'cancel') return migrations.cancel(id);
      return migrations.retryFailed(id);
    },
    onSuccess: (_data, vars) => {
      message.success({ pause: t('迁移已暂停'), resume: t('迁移已恢复'), cancel: t('迁移已取消'), retryFailed: t('失败文件已重新排队') }[vars.kind]);
      setConfirmCancel(false);
      refresh();
    },
  });
  const busy = create.isPending || action.isPending;
  const activeLocation = useMemo(() => (locations.data?.items ?? []).find(item => item.id === locations.data?.active_id), [locations.data]);
  const testedTargets = (locations.data?.items ?? []).filter(item => item.tested && item.id !== 'legacy-brand');
  const sourceProvider = (summary.data?.items ?? []).find(item => item.location_id === source);
  const validTargets = testedTargets.filter(item => item.id !== source && !(sourceProvider && sourceProvider.provider !== 'local' && item.provider !== 'local'));
  const leftovers = (summary.data?.items ?? []).reduce((total, item) => total + item.file_count, 0);
  const leftoverSize = (summary.data?.items ?? []).reduce((total, item) => total + item.total_size, 0);
  const actionControl = (kind: 'pause' | 'resume' | 'cancel' | 'retryFailed', label: string, icon: React.ReactNode) => (
    <Button type="button" variant={kind === 'cancel' ? 'ghost' : 'secondary'} size="sm" disabled={!canWrite || busy}
      pending={action.isPending && action.variables?.kind === kind} onClick={() => (kind === 'cancel' ? setConfirmCancel(true) : action.mutate({ kind, id: job!.id }))}>
      {icon}{label}
    </Button>
  );
  return <div className="flex min-w-0 w-full max-w-4xl flex-col gap-5">
    <Card>
      <CardHeader><h2 className="text-md font-semibold">{t('待迁移概览')}</h2><p className="text-xs text-muted">{t('历史文件始终保存在写入时的存储位置；此处统计所有非默认位置中剩余的可用文件。')}</p></CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2.5 text-sm">
          <span className="text-muted">{t('当前全局默认')}</span>
          <strong className="font-medium">{activeLocation ? locationLabel(activeLocation) : summary.data?.active_location_id || t('未知')}</strong>
          <Badge variant="success">{t('使用中')}</Badge>
          {!summary.isPending && !summary.isError && !!leftovers && <span className="ms-auto text-xs tabular-nums text-muted">{t('共 {{count}} 个文件 · {{size}}', { count: leftovers, size: formatSize(leftoverSize) })}</span>}
        </div>
        {summary.isPending ? <p role="status" className="text-sm text-muted">{t('正在读取统计…')}</p>
          : summary.isError ? <p role="alert" className="text-sm text-danger">{t(summary.error.message)}</p>
            : !leftovers ? <p className="flex items-center gap-2 rounded-lg bg-surface-alt px-3 py-2 text-sm text-muted" role="status">
                <CheckCircle2 size={16} className="shrink-0 text-success" aria-hidden="true" />{t('没有待迁移的文件，所有可用文件都已在默认存储位置。')}
              </p>
              : <ul className="flex flex-col gap-2">
                {(summary.data?.items ?? []).map(item => <li key={item.location_id} className="flex min-w-0 flex-wrap items-center gap-2 rounded-md border border-line px-3 py-2 text-sm">
                  <strong className="min-w-0 truncate font-medium">{item.name || item.provider}</strong>
                  <span className="text-xs text-muted">{item.provider !== 'local' ? t('云端') : t('本地')}</span>
                  <span className="ms-auto text-xs tabular-nums text-muted">{t('{{count}} 个文件 · {{size}}', { count: item.file_count, size: formatSize(item.total_size) })}</span>
                </li>)}
              </ul>}
      </CardContent>
    </Card>
    <Card>
      <CardHeader><h2 className="text-md font-semibold">{t('迁移任务')}</h2><p className="text-xs text-muted">{t('同一时间只允许一个进行中的任务；服务重启后任务自动暂停，可从断点恢复。')}</p></CardHeader>
      {jobActive && job && <CardContent className="flex flex-col gap-4 border-b border-line" aria-live="polite">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Badge variant={job.status === 'running' ? 'success' : 'warning'}>{statusLabel(job.status)}</Badge>
          {job.mode === 'retry' && <Badge variant="warning">{t('失败重试')}</Badge>}
          <span className="text-xs text-muted">{t('由 {{actor}} 于 {{time}} 创建', { actor: job.created_by, time: formatDate(job.created_at, locale) })}</span>
          <span className="ms-auto text-xs text-muted">{sharedLocationName((locations.data?.items ?? []), job.source_location_id)} → {sharedLocationName((locations.data?.items ?? []), job.target_location_id)}</span>
        </div>
        <Progress value={job.total_count ? Math.round(job.succeeded_count / job.total_count * 100) : 0} aria-label={t('迁移进度')} />
        <div className="grid grid-cols-3 gap-2 sm:gap-3">
          <div className="rounded-lg border border-line px-3 py-2"><span className="block text-2xs text-muted">{t('文件总数')}</span><span className="text-md font-medium tabular-nums">{job.total_count}</span></div>
          <div className="rounded-lg border border-line px-3 py-2"><span className="block text-2xs text-muted">{t('迁移成功')}</span><span className="text-md font-medium tabular-nums text-success">{job.succeeded_count}</span></div>
          <div className="rounded-lg border border-line px-3 py-2"><span className="block text-2xs text-muted">{t('迁移失败')}</span><span className="text-md font-medium tabular-nums text-danger">{job.failed_count}</span></div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {job.status === 'running' && actionControl('pause', t('暂停'), <Pause size={14} />)}
          {job.status === 'paused' && actionControl('resume', t('恢复'), <Play size={14} />)}
          {actionControl('cancel', t('取消'), <Ban size={14} />)}
          <Button type="button" variant="ghost" size="sm" pending={current.isFetching} onClick={() => refresh()}><RefreshCw size={14} />{t('刷新')}</Button>
        </div>
        {!!job.failures?.length && <details className="rounded-md border border-line px-3 py-2">
          <summary className="cursor-pointer text-sm font-medium">{t('迁移失败的文件')} ({job.failures.length})</summary>
          <ul className="mt-2 max-h-40 overflow-auto ps-4 font-mono text-xs">
            {job.failures.map(failure => <li key={failure.file_id} className="flex flex-wrap gap-2 py-0.5">
              <span className="truncate">{failure.file_id}</span>
              <span className="truncate text-muted">{failure.original_name}</span>
              <span className="ms-auto text-danger">{reasonLabel(failure.reason)}</span>
            </li>)}
          </ul>
        </details>}
      </CardContent>}
      {!jobActive && job && !!job.failed_count && <CardContent className="flex flex-wrap items-center gap-2 border-b border-line py-3">
        <Badge variant={job.status === 'completed' ? 'info' : job.status === 'cancelled' ? 'subtle' : 'danger'}>{statusLabel(job.status)}</Badge>
        <span className="text-xs text-muted">{t('已迁移 {{done}} / {{total}}', { done: job.succeeded_count, total: job.total_count })}</span>
        <Button type="button" variant="secondary" size="sm" className="ms-auto" disabled={!canWrite || busy} pending={action.isPending && action.variables?.kind === 'retryFailed'} onClick={() => action.mutate({ kind: 'retryFailed', id: job.id })}><RotateCcw size={14} />{t('重试失败项')}</Button>
      </CardContent>}
      <CardContent className="flex flex-col gap-4">
        <form className="flex min-w-0 flex-col gap-4" onSubmit={event => { event.preventDefault(); if (source && target) create.mutate(); }}>
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] sm:items-end">
            <div className="flex min-w-0 flex-col gap-1.5">
              <span className="text-sm font-medium">{t('源存储位置（迁出）')}</span>
              <SimpleSelect aria-label={t('源存储位置（迁出）')} value={source} onChange={setSource} presentation="dropdown" disabled={busy}
                options={selectOptions(<>
                  <option value="" disabled>{t('选择要清空的存储位置')}</option>
                  {(summary.data?.items ?? []).map(item => <option key={item.location_id} value={item.location_id}>{item.name || item.provider} ({item.file_count})</option>)}
                </>)} />
            </div>
            <span className="mx-auto hidden pb-2 text-muted sm:block" aria-hidden="true"><ArrowRight size={16} /></span>
            <span className="mx-auto sm:hidden" aria-hidden="true"><ArrowRight size={16} className="rotate-90 text-muted" /></span>
            <div className="flex min-w-0 flex-col gap-1.5">
              <span className="text-sm font-medium">{t('目标存储位置（迁入）')}</span>
              <SimpleSelect aria-label={t('目标存储位置（迁入）')} value={target} onChange={setTarget} presentation="dropdown" disabled={busy}
                options={selectOptions(<>
                  <option value="" disabled>{t('选择已测试的存储位置')}</option>
                  {validTargets.map(item => <option key={item.id} value={item.id}>{locationLabel(item)}{item.id === locations.data?.active_id ? ` (${t('当前默认')})` : ''}</option>)}
                </>)} />
            </div>
          </div>
          <p className="text-xs leading-relaxed text-muted">{t('仅支持本地与云存储之间迁移；任务按批扫描源位置的可用文件，已迁移文件自动切换引用。')}</p>
          <div className="flex items-start gap-2 rounded-lg border border-line px-3 py-2.5 text-xs leading-relaxed text-muted" role="note">
            <Info size={14} className="mt-0.5 shrink-0 text-accent" aria-hidden="true" />
            <span>{t('迁移前请先把目标位置设为全局默认，迁移期间的新文件才会直接写入目标；源位置剩余文件由本任务收尾。')}</span>
          </div>
        </form>
      </CardContent>
      <CardFooter className="flex-wrap items-center justify-between gap-2 border-t border-line">
        <span className="text-xs text-muted">{t('任务在服务端后台异步执行，关闭页面不会中断；可随时暂停并恢复。')}</span>
        <Button type="button" variant="primary" pending={create.isPending} disabled={!canWrite || busy || !source || !target} onClick={() => create.mutate()}>
          {t('开始迁移')}
        </Button>
      </CardFooter>
    </Card>
    <Card>
      <CardHeader><h2 className="text-md font-semibold">{t('迁移记录')}</h2><p className="text-xs text-muted">{t('最近 20 次迁移任务的结果；活跃任务期间的失败明细可在此追溯。')}</p></CardHeader>
      <CardContent>
        {history.isPending ? <p role="status" className="text-sm text-muted">{t('正在读取记录…')}</p>
          : history.isError ? <p role="alert" className="text-sm text-danger">{t(history.error.message)}</p>
            : !history.data?.items.length ? <p role="status" className="rounded-lg bg-surface-alt px-3 py-2 text-sm text-muted">{t('暂无迁移记录')}</p>
              : <div className="overflow-x-auto">
                <table className="w-full min-w-0 text-sm">
                  <thead>
                    <tr className="text-2xs uppercase tracking-wide text-muted">
                      <th scope="col" className="px-3 py-2 text-start font-medium">{t('迁移方向')}</th>
                      <th scope="col" className="px-3 py-2 text-start font-medium">{t('状态')}</th>
                      <th scope="col" className="px-3 py-2 text-start font-medium">{t('结果统计')}</th>
                      <th scope="col" className="px-3 py-2 text-start font-medium">{t('开始时间')}</th>
                      <th scope="col" className="px-3 py-2 text-start font-medium">{t('完成时间')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.data.items.map(item => <Fragment key={item.id}>
                      <tr className="border-t border-line">
                        <td className="max-w-52 px-3 py-2">
                          <span className="flex min-w-0 items-center gap-1.5" title={`${sharedLocationName(locations.data?.items ?? [], item.source_location_id)} → ${sharedLocationName(locations.data?.items ?? [], item.target_location_id)}`}>
                            <span className="min-w-0 truncate">{sharedLocationName(locations.data?.items ?? [], item.source_location_id)}</span>
                            <ArrowRight size={13} className="shrink-0 text-muted" aria-hidden="true" />
                            <span className="min-w-0 truncate">{sharedLocationName(locations.data?.items ?? [], item.target_location_id)}</span>
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-3 py-2">
                          <Badge variant={historyStatusVariant(item.status)}>{statusLabel(item.status)}</Badge>
                          {item.mode === 'retry' && <Badge variant="warning">{t('失败重试')}</Badge>}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 tabular-nums" title={t('成功 {{succeeded}} · 失败 {{failed}} · 总数 {{total}}', { succeeded: item.succeeded_count, failed: item.failed_count, total: item.total_count })}>
                          {item.succeeded_count} / {item.total_count}
                          {item.failed_count > 0 && <button type="button" className="ms-2 inline-flex items-center gap-0.5 text-xs text-danger underline-offset-2 hover:underline" aria-expanded={expanded === item.id} onClick={() => setExpanded(value => (value === item.id ? null : item.id))}>
                            {t('失败 {{count}}', { count: item.failed_count })}
                            <ChevronDown size={12} className={cn(expanded === item.id && 'rotate-180')} aria-hidden="true" />
                          </button>}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 text-xs text-muted">{formatDate(item.created_at, locale)}</td>
                        <td className="whitespace-nowrap px-3 py-2 text-xs text-muted">{item.finished_at ? formatDate(item.finished_at, locale) : '—'}</td>
                      </tr>
                      {expanded === item.id && <tr className="border-t border-line bg-surface-alt">
                        <td colSpan={5} className="px-3 py-2">
                          {failureDetails[item.id]?.length ? <ul className="flex max-h-40 flex-col gap-1 overflow-auto font-mono text-xs">
                            {failureDetails[item.id].map(failure => <li key={failure.file_id} className="flex flex-wrap gap-2 py-0.5">
                              <span className="truncate">{failure.file_id}</span>
                              <span className="truncate text-muted">{failure.original_name}</span>
                              <span className="ms-auto text-danger">{reasonLabel(failure.reason)}</span>
                            </li>)}
                          </ul>
                            : <p className="text-xs text-muted">{t('失败明细已随任务归档，仅活跃任务期间可在线查看。')}</p>}
                        </td>
                      </tr>}
                    </Fragment>)}
                  </tbody>
                </table>
              </div>}
      </CardContent>
    </Card>
    {confirmCancel && job && <ConfirmDialog danger title={t('取消迁移')} description={t('已迁移的文件保持现状，剩余文件留在源位置。确定取消该任务？')} confirmLabel={t('确认取消')} cancelLabel={t('继续迁移')} pending={action.isPending} onConfirm={() => action.mutate({ kind: 'cancel', id: job.id })} onCancel={() => setConfirmCancel(false)} />}
  </div>;
}

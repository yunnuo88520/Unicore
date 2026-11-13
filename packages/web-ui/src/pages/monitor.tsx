// Author: yunnuo <ymz@ebox.vip>
// Description: Runtime monitor console: shared snapshot sections, the platform super-admin pages and the single local tabbed page, with live host hardware charts.
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState, type ReactNode } from 'react';
import { Link } from '@tanstack/react-router';
import { Activity, AlertTriangle, ArrowRight, BellRing, CheckCircle2, Cpu, Database, HardDrive, MemoryStick, Network, Pause, Play, Radar, RefreshCw, Server, XCircle } from 'lucide-react';
import { Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, PageHeader, Tabs } from '@unicore/ui';
import { cn } from '@unicore/ui/cn';
import { currentLocale, defineMessages, t, useI18n, useLocale } from '../i18n';
import { MeterBar, RingGauge, Sparkline, TrendArea, type TrendPoint, type TrendSeries } from '../widgets/monitor-charts';
import type { AppClient, MonitorAlertRule, MonitorAlertRules, MonitorEventList, MonitorSnapshot } from '@unicore/sdk';
import type { PageProps } from '../router';

const STATUS_LABELS = defineMessages({ healthy: '运行正常', degraded: '部分异常', unavailable: '不可用' });
const STATUS_TONES: Record<string, string> = {
  healthy: 'bg-success-soft text-success',
  degraded: 'bg-warning-soft text-warning',
  unavailable: 'bg-danger-soft text-danger',
};
const STATUS_DOTS: Record<string, string> = { healthy: 'bg-success', degraded: 'bg-warning', unavailable: 'bg-danger' };

/** One pull-based snapshot shared by every surface; refresh stays explicit and cheap. */
export function useMonitorSnapshot(client: AppClient) {
  return useQuery({
    queryKey: ['monitor-snapshot'],
    queryFn: () => {
      if (!client.monitorSnapshot) throw new Error(t('此版本未提供运行监控'));
      return client.monitorSnapshot();
    },
    enabled: !!client.monitorSnapshot,
    staleTime: 5_000,
    refetchInterval: 15_000,
    retry: 1,
  });
}

// The session series keeps the last ~15 minutes at a 5s cadence; it lives only
// in this page view and is never persisted (see the section footnotes).
const HISTORY_LIMIT = 180;
const REFRESH_MS = 5_000;

type PointKey = 'cpu' | 'mem' | 'disk' | 'goroutines' | 'heap' | 'rss' | 'latency' | 'sent' | 'recv';

function pointFrom(snapshot: MonitorSnapshot): TrendPoint {
  const point: TrendPoint = { t: Date.now() };
  const host = snapshot.host;
  if (host?.available) {
    point.cpu = host.cpu_percent;
    point.mem = host.mem_used_percent;
    point.disk = host.disks?.find(disk => disk.is_data_dir)?.used_percent;
    point.sent = host.net_sent_bytes;
    point.recv = host.net_recv_bytes;
    point.sentRate = host.net_sent_per_sec;
    point.recvRate = host.net_recv_per_sec;
  }
  point.goroutines = snapshot.runtime.goroutines;
  point.heap = snapshot.runtime.heap_alloc_bytes;
  if (snapshot.runtime.rss_bytes) point.rss = snapshot.runtime.rss_bytes;
  if (snapshot.database.status === 'healthy') point.latency = snapshot.database.latency_ms;
  return point;
}

/** Pages poll every 5 seconds and accumulate a session-local trend series for the charts. */
export function useMonitorHistory(client: AppClient) {
  const [paused, setPaused] = useState(false);
  const [history, setHistory] = useState<TrendPoint[]>([]);
  const query = useQuery({
    queryKey: ['monitor-snapshot'],
    queryFn: () => {
      if (!client.monitorSnapshot) throw new Error(t('此版本未提供运行监控'));
      return client.monitorSnapshot();
    },
    enabled: !!client.monitorSnapshot,
    staleTime: 5_000,
    refetchInterval: paused ? false : REFRESH_MS,
    retry: 1,
  });
  const snapshot = query.data;
  useEffect(() => {
    if (!snapshot) return;
    setHistory(previous => [...previous.slice(-(HISTORY_LIMIT - 1)), pointFrom(snapshot)]);
  }, [snapshot]);
  return { query, history, paused, setPaused };
}

function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (days > 0) return `${days} ${t('天')} ${hours} ${t('小时')}`;
  if (hours > 0) return `${hours} ${t('小时')} ${minutes} ${t('分钟')}`;
  if (minutes > 0) return `${minutes} ${t('分钟')}`;
  return `${seconds} ${t('秒')}`;
}

function formatBytes(value: number): string {
  if (!Number.isFinite(value)) return '—';
  const magnitude = Math.abs(value);
  if (magnitude >= 1073741824) return `${(value / 1073741824).toFixed(1)} GB`;
  if (magnitude >= 1048576) return `${(value / 1048576).toFixed(1)} MB`;
  if (magnitude >= 1024) return `${(value / 1024).toFixed(1)} KB`;
  // Sub-kilobyte rates need the decimal, or a 0.4 B/s axis tick reads "0 B".
  if (magnitude < 10) return `${value.toFixed(1)} B`;
  return `${Math.round(value)} B`;
}

function formatRate(value: number): string {
  return `${formatBytes(value)}/s`;
}

function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`;
}

function StatusDot({ status }: { status: string }) {
  return <span aria-hidden="true" className={cn('inline-block size-2.5 rounded-full', STATUS_DOTS[status] ?? 'bg-subtle')} />;
}

function SectionShell({ client, title, description, children }: { client: AppClient; title: string; description: string; children: (client: AppClient, snapshot: MonitorSnapshot, history: TrendPoint[], paused: boolean) => ReactNode }) {
  useLocale();
  const { query, history, paused, setPaused } = useMonitorHistory(client);
  return <div className="flex min-w-0 flex-col gap-6">
    <PageHeader title={title} description={description} actions={<>
        <Button variant="secondary" aria-pressed={paused} onClick={() => setPaused(value => !value)}>
          {paused ? <Play size={13} aria-hidden="true" /> : <Pause size={13} aria-hidden="true" />}{paused ? t('恢复自动刷新') : t('暂停自动刷新')}
        </Button>
        <Button variant="secondary" pending={query.isFetching} onClick={() => void query.refetch()}><RefreshCw size={13} />{t('刷新')}</Button>
    </>} />
    <p className="text-xs text-subtle">{paused ? t('自动刷新已暂停，可手动刷新。') : t('每 5 秒自动刷新；趋势图为页面打开期间的快照序列。')}</p>
    {query.isPending
      ? <Card><CardContent className="py-10 text-center text-sm text-muted" role="status">{t('正在读取运行快照…')}</CardContent></Card>
      : query.isError
        ? <Card><CardContent className="flex flex-wrap items-center justify-center gap-3 py-10 text-sm text-danger" role="alert">
            <AlertTriangle size={16} aria-hidden="true" />{t(query.error.message)}
            <Button variant="secondary" onClick={() => void query.refetch()}>{t('重试')}</Button>
          </CardContent></Card>
        : children(client, query.data!, history, paused)}
  </div>;
}

function StatusCard({ snapshot }: { snapshot: MonitorSnapshot }) {
  const { t } = useI18n();
  const host = snapshot.host;
  return <Card>
    <CardContent className="flex flex-wrap items-center gap-4 py-5">
      <span className={cn('flex size-12 items-center justify-center rounded-xl', STATUS_TONES[snapshot.status] ?? 'bg-surface-alt text-muted')}>
        {snapshot.status === 'unavailable' ? <XCircle size={22} aria-hidden="true" /> : <CheckCircle2 size={22} aria-hidden="true" />}
      </span>
      <div className="min-w-0">
        <strong className="flex items-center gap-2 text-md font-semibold text-ink"><StatusDot status={snapshot.status} />{t(STATUS_LABELS[snapshot.status as keyof typeof STATUS_LABELS] ?? snapshot.status)}</strong>
        <small className="mt-0.5 block text-2xs text-muted">{t('已运行 {{value}}', { value: formatUptime(snapshot.uptime_seconds) })}</small>
      </div>
      <div className="ms-auto grid grid-cols-2 gap-x-8 gap-y-1 text-2xs text-muted sm:grid-cols-4">
        <span>{t('版本')}<strong className="ms-1 text-ink">v{snapshot.version}</strong></span>
        <span>Go<strong className="ms-1 text-ink">{snapshot.go_version}</strong></span>
        <span>{t('启动于')}<strong className="ms-1 text-ink">{new Date(snapshot.started_at * 1000).toLocaleString(currentLocale(), { hour12: false })}</strong></span>
        {host?.available && host.platform
          ? <span>{t('主机')}<strong className="ms-1 text-ink">{[host.os === host.platform ? host.os : `${host.os} · ${host.platform}`, host.cpu_cores_logical ? `${host.cpu_cores_logical}C` : ''].filter(Boolean).join(' · ')}</strong></span>
          : <span className="font-mono">{snapshot.commit}</span>}
      </div>
    </CardContent>
  </Card>;
}

function StatTile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return <div className="rounded-lg bg-surface-alt px-3 py-3">
    <span className="text-2xs text-muted">{label}</span>
    <strong className="mt-0.5 block truncate text-md font-semibold text-ink">{value}</strong>
    {hint ? <small className="mt-0.5 block truncate text-2xs text-subtle">{hint}</small> : null}
  </div>;
}

function DatabaseCard({ snapshot, history, compact, paused }: { snapshot: MonitorSnapshot; history?: TrendPoint[]; compact?: boolean; paused?: boolean }) {
  const { t } = useI18n();
  const db = snapshot.database;
  const latencySeries: TrendSeries = { key: 'latency', label: t('探活延迟'), color: 'var(--color-primary)' };
  return <Card>
    <CardHeader className="flex-row items-center justify-between">
      <CardTitle><Database size={16} className="text-accent" aria-hidden="true" />{t('数据库')}</CardTitle>
      <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-2xs', STATUS_TONES[db.status === 'healthy' ? 'healthy' : 'unavailable'])}>
        <StatusDot status={db.status === 'healthy' ? 'healthy' : 'unavailable'} />{db.status === 'healthy' ? t('连接正常') : t('连接失败')}
      </span>
    </CardHeader>
    <CardContent>
      {compact
        ? <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <StatTile label={t('探活延迟')} value={`${db.latency_ms} ms`} />
            <StatTile label={t('打开连接')} value={(db.open_connections ?? 0).toLocaleString()} />
            <StatTile label={t('使用中')} value={(db.in_use_connections ?? 0).toLocaleString()} />
          </div>
        : <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
            <StatTile label={t('探活延迟')} value={`${db.latency_ms} ms`} />
            <StatTile label={t('打开连接')} value={(db.open_connections ?? 0).toLocaleString()} hint={db.max_open_connections ? `${t('上限')} ${db.max_open_connections}` : t('无上限')} />
            <StatTile label={t('使用中')} value={(db.in_use_connections ?? 0).toLocaleString()} />
            <StatTile label={t('空闲')} value={(db.idle_connections ?? 0).toLocaleString()} />
            <StatTile label={t('累计等待')} value={(db.wait_total ?? 0).toLocaleString()} />
            <StatTile label={t('等待耗时')} value={db.wait_duration_ms ? `${db.wait_duration_ms.toLocaleString()} ms` : '0 ms'} />
          </div>}
      {!compact && history
        ? <div className="mt-3"><TrendArea points={history} series={[latencySeries]} height={110} unit=" ms" ariaLabel={t('探活延迟趋势')} summary={t('探活延迟趋势')}
            pendingHint={paused ? t('自动刷新已暂停，恢复后继续累积趋势。') : undefined} /></div>
        : null}
    </CardContent>
  </Card>;
}

const PROBE_TONES: Record<string, string> = { healthy: 'bg-success', unavailable: 'bg-danger', unknown: 'bg-subtle' };
const PROBE_LABELS = defineMessages({ healthy: '健康', unavailable: '探活失败', unknown: '未探活' });

function StorageCard({ client, snapshot, compact }: { client: AppClient; snapshot: MonitorSnapshot; compact?: boolean }) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [probing, setProbing] = useState('');
  const storage = snapshot.storage;
  if (!storage.applicable) return null;
  const probe = async (location: string) => {
    if (!client.probeStorage) return;
    setProbing(location);
    try {
      await client.probeStorage(location);
      await queryClient.invalidateQueries({ queryKey: ['monitor-snapshot'] });
    } finally {
      setProbing('');
    }
  };
  if (compact) {
    return <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle><Server size={16} className="text-accent" aria-hidden="true" />{t('对象存储')}</CardTitle>
        <Badge>{storage.provider ?? '—'}</Badge>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-2">
          <StatTile label={t('当前位置')} value={storage.active_location ?? '—'} />
          <StatTile label={t('位置数量')} value={(storage.locations ?? 0).toLocaleString()} />
        </div>
      </CardContent>
    </Card>;
  }
  return <Card>
    <CardHeader className="flex-row items-center justify-between">
      <CardTitle><Server size={16} className="text-accent" aria-hidden="true" />{t('对象存储')}</CardTitle>
      <Badge>{storage.provider ?? '—'}</Badge>
    </CardHeader>
    <CardContent className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-2">
        <StatTile label={t('当前位置')} value={storage.active_location ?? '—'} />
        <StatTile label={t('位置数量')} value={(storage.locations ?? 0).toLocaleString()} />
      </div>
      {storage.probe?.length
        ? <ul className="flex flex-col divide-y divide-line rounded-lg border border-line">
            {storage.probe.map(location => <li key={location.id} className="flex flex-wrap items-center gap-2 px-3 py-2 text-xs">
              <span aria-hidden="true" className={cn('inline-block size-2.5 rounded-full', PROBE_TONES[location.status] ?? 'bg-subtle')} />
              <strong className="font-medium text-ink">{location.id}</strong>
              <Badge>{location.provider}</Badge>
              {location.active ? <Badge>{t('当前')}</Badge> : null}
              <span className="text-muted">{t(PROBE_LABELS[location.status as keyof typeof PROBE_LABELS] ?? location.status)}</span>
              {location.latency_ms != null ? <span className="text-2xs text-subtle">{location.latency_ms} ms</span> : null}
              {location.error ? <span className="truncate text-danger">{location.error}</span> : null}
              {location.checked_at ? <time className="ms-auto text-2xs text-subtle">{new Date(location.checked_at * 1000).toLocaleString(currentLocale(), { hour12: false })}</time> : null}
              <Button variant="secondary" className="ms-auto h-7 px-2 text-2xs" pending={probing === location.id} onClick={() => void probe(location.id)}>{t('立即探活')}</Button>
            </li>)}
          </ul>
        : null}
      <p className="text-2xs text-subtle">{t('探活会向该位置写入并清理一个临时校验对象；结果缓存到下次探活。')}</p>
    </CardContent>
  </Card>;
}

function HttpCard({ snapshot }: { snapshot: MonitorSnapshot }) {
  const { t } = useI18n();
  const http = snapshot.http_service;
  if (!http.applicable) return null;
  const errorRate = (http.requests_total ?? 0) > 0 ? `${(((http.errors_total ?? 0) / (http.requests_total ?? 1)) * 100).toFixed(2)}%` : '0.00%';
  return <Card>
    <CardHeader className="flex-row items-center justify-between">
      <CardTitle><Radar size={16} className="text-accent" aria-hidden="true" />{t('HTTP 服务')}</CardTitle>
      <Badge>{t('活动请求 {{count}}', { count: (http.active_requests ?? 0).toLocaleString() })}</Badge>
    </CardHeader>
    <CardContent>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        <StatTile label={t('累计请求')} value={(http.requests_total ?? 0).toLocaleString()} />
        <StatTile label={t('5xx 错误')} value={(http.errors_total ?? 0).toLocaleString()} />
        <StatTile label={t('错误率')} value={errorRate} />
        <StatTile label={t('平均耗时')} value={`${http.avg_duration_ms ?? 0} ms`} />
        <StatTile label={t('P95 耗时')} value={`${http.p95_duration_ms ?? 0} ms`} />
      </div>
    </CardContent>
  </Card>;
}

function TasksCard({ snapshot }: { snapshot: MonitorSnapshot }) {
  const { t } = useI18n();
  const tasks = snapshot.tasks;
  if (!tasks.applicable) return null;
  return <Card>
    <CardHeader className="flex-row items-center justify-between">
      <CardTitle><Activity size={16} className="text-accent" aria-hidden="true" />{t('后台任务')}</CardTitle>
      {snapshot.profile === 'web-platform'
        ? <Link to="/tasks" className="inline-flex items-center gap-1 text-2xs text-accent hover:underline">{t('管理定时任务')}<ArrowRight size={11} aria-hidden="true" /></Link>
        : null}
    </CardHeader>
    <CardContent className="flex flex-col gap-3">
      <div className="grid grid-cols-3 gap-2">
        <StatTile label={t('注册任务')} value={(tasks.total ?? 0).toLocaleString()} />
        <StatTile label={t('已启用')} value={(tasks.enabled ?? 0).toLocaleString()} />
        <StatTile label={t('最近失败')} value={(tasks.failing ?? 0).toLocaleString()} />
      </div>
      {tasks.recent && tasks.recent.length
        ? <ul className="flex flex-col divide-y divide-line rounded-lg border border-line">
            {tasks.recent.map(item => <li key={item.name} className="flex flex-col gap-1.5 px-3 py-2 text-xs">
              <div className="flex flex-wrap items-center gap-2">
                <StatusDot status={item.last_status === 'error' ? 'unavailable' : 'healthy'} />
                <strong className="font-medium text-ink">{item.name}</strong>
                {item.last_status ? <span className="text-muted">{t('上次')} {item.last_status === 'error' ? t('失败') : item.last_status}</span> : <span className="text-subtle">{t('尚未运行')}</span>}
                {item.last_error ? <span className="truncate text-danger">{item.last_error}</span> : null}
                {item.last_run_at ? <time className="ms-auto text-2xs text-subtle">{new Date(item.last_run_at * 1000).toLocaleString(currentLocale(), { hour12: false })}</time> : null}
              </div>
              {item.runs?.length
                ? <ul aria-label={t('最近运行记录')} className="flex flex-col gap-1 border-s-2 border-line ps-3 text-2xs text-muted">
                    {item.runs.map((run, index) => <li key={index} className="flex flex-wrap items-center gap-2">
                      <StatusDot status={run.status === 'error' ? 'unavailable' : 'healthy'} />
                      <time>{new Date(run.started_at * 1000).toLocaleString(currentLocale(), { hour12: false })}</time>
                      <span className={run.status === 'error' ? 'text-danger' : ''}>{run.status === 'error' ? t('失败') : run.status}</span>
                      <span className="text-subtle">{run.duration_ms} ms</span>
                      {run.error ? <span className="truncate text-danger">{run.error}</span> : null}
                    </li>)}
                  </ul>
                : null}
            </li>)}
          </ul>
        : <p className="text-2xs text-subtle">{t('暂无任务记录')}</p>}
    </CardContent>
  </Card>;
}

function TrendTile({ label, value, hint, points, series, ariaLabel }: { label: string; value: string; hint?: string; points: TrendPoint[]; series: TrendSeries; ariaLabel: string }) {
  return <Card>
    <CardContent className="px-4 py-4">
      <span className="text-2xs text-muted">{label}</span>
      <strong className="mt-0.5 block text-lg font-semibold text-ink">{value}</strong>
      {hint ? <small className="block truncate text-2xs text-subtle">{hint}</small> : null}
      <Sparkline points={points} series={series} ariaLabel={ariaLabel} />
    </CardContent>
  </Card>;
}

function OverviewSection({ client, snapshot, history }: { client: AppClient; snapshot: MonitorSnapshot; history: TrendPoint[] }) {
  const { t } = useI18n();
  const failing = (snapshot.tasks.recent ?? []).filter(item => item.last_status === 'error');
  const host = snapshot.host;
  const dataDisk = host?.disks?.find(disk => disk.is_data_dir);
  return <div className="flex flex-col gap-4">
    <StatusCard snapshot={snapshot} />
    <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,12rem),1fr))] gap-4">
      {host?.available && host.cpu_percent != null && <TrendTile label={t('CPU 使用率')} value={host?.available && host.cpu_percent != null ? formatPercent(host.cpu_percent) : '—'}
        hint={host?.available && host.cpu_cores_logical ? t('{{count}} 逻辑核心', { count: host.cpu_cores_logical }) : undefined}
        points={history} series={{ key: 'cpu', label: t('CPU 使用率'), color: 'var(--color-primary)' }} ariaLabel={t('CPU 使用率')} />}
      {host?.available && host.mem_used_percent != null && <TrendTile label={t('内存使用率')} value={host?.available && host.mem_used_percent != null ? formatPercent(host.mem_used_percent) : '—'}
        hint={host?.available && host.mem_used_bytes != null && host.mem_total_bytes ? `${formatBytes(host.mem_used_bytes)} / ${formatBytes(host.mem_total_bytes)}` : undefined}
        points={history} series={{ key: 'mem', label: t('内存使用率'), color: 'var(--color-accent)' }} ariaLabel={t('内存使用率')} />}
      {host?.available && dataDisk && <TrendTile label={t('磁盘使用率')} value={host?.available && dataDisk ? formatPercent(dataDisk.used_percent) : '—'}
        hint={host?.available && dataDisk ? `${t('数据目录')} · ${formatBytes(dataDisk.free_bytes)} ${t('可用')}` : undefined}
        points={history} series={{ key: 'disk', label: t('磁盘使用率'), color: 'var(--color-success)' }} ariaLabel={t('磁盘使用率')} />}
      <TrendTile label="Goroutines" value={snapshot.runtime.goroutines.toLocaleString()}
        hint={`${t('堆内存')} ${formatBytes(snapshot.runtime.heap_alloc_bytes)}`}
        points={history} series={{ key: 'goroutines', label: 'Goroutines', color: 'var(--color-warning)' }} ariaLabel="Goroutines" />
    </div>
    <div className={cn('grid gap-4', snapshot.storage.applicable && 'lg:grid-cols-2')}>
      <DatabaseCard snapshot={snapshot} compact />
      <StorageCard client={client} snapshot={snapshot} compact />
    </div>
    {snapshot.tasks.applicable && <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle><AlertTriangle size={16} className="text-accent" aria-hidden="true" />{t('最近异常')}</CardTitle>
        <Badge>{snapshot.status === 'healthy' ? t('一切正常') : t(STATUS_LABELS[snapshot.status as keyof typeof STATUS_LABELS] ?? snapshot.status)}</Badge>
      </CardHeader>
      <CardContent>
        {failing.length
          ? <ul className="flex flex-col gap-2">
              {failing.map(item => <li key={item.name} className="flex items-center gap-2 rounded-lg bg-danger-soft/60 px-3 py-2 text-xs text-danger">
                <XCircle size={13} aria-hidden="true" /><strong>{item.name}</strong>
                <span className="truncate">{item.last_error ?? t('执行失败')}</span>
              </li>)}
            </ul>
          : <p className="text-xs text-muted">{t('当前没有失败的任务。')}</p>}
        <p className="mt-3 text-2xs text-subtle">
          {t('此处汇总定时任务失败；系统级事件（启动、健康翻转、探活失败）见')}
          {' '}
          {snapshot.profile === 'web-platform'
            ? <Link to="/monitor-events" className="text-accent hover:underline">{t('运行事件')}<ArrowRight size={10} className="ms-0.5 inline" aria-hidden="true" /></Link>
            : `「${t('运行事件')}」${t('标签页。')}`}
        </p>
      </CardContent>
    </Card>}
  </div>;
}

function ServicesSection({ client, snapshot, history, paused }: { client: AppClient; snapshot: MonitorSnapshot; history: TrendPoint[]; paused?: boolean }) {
  return <div className="flex flex-col gap-4">
    <HttpCard snapshot={snapshot} />
    <DatabaseCard snapshot={snapshot} history={history} paused={paused} />
    <StorageCard client={client} snapshot={snapshot} />
    <TasksCard snapshot={snapshot} />
  </div>;
}

function usageTone(percent: number): string {
  return percent >= 90 ? 'bg-danger' : percent >= 75 ? 'bg-warning' : 'bg-primary';
}

function HostCard({ snapshot }: { snapshot: MonitorSnapshot }) {
  const { t } = useI18n();
  const host = snapshot.host;
  if (!host?.available) return null;
  return <Card className="lg:col-span-2">
    <CardHeader className="flex-row items-center justify-between">
      <CardTitle><Server size={16} className="text-accent" aria-hidden="true" />{t('主机信息')}</CardTitle>
      {host.sampled_at ? <Badge>{t('采样于 {{time}}', { time: new Date(host.sampled_at * 1000).toLocaleTimeString(currentLocale(), { hour12: false }) })}</Badge> : null}
    </CardHeader>
    <CardContent>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
        <StatTile label={t('主机名')} value={host.hostname ?? '—'} />
        <StatTile label={t('操作系统')} value={host.os ?? '—'} hint={host.platform ? `${host.platform} ${host.platform_version ?? ''}`.trim() : undefined} />
        <StatTile label={t('内核')} value={host.kernel_version ?? '—'} hint={host.kernel_arch} />
        <StatTile label={t('CPU 型号')} value={host.cpu_model || '—'} />
        <StatTile label={t('逻辑核心')} value={(host.cpu_cores_logical ?? 0).toLocaleString()} hint={host.cpu_cores_physical ? `${t('物理核心')} ${host.cpu_cores_physical}` : undefined} />
        <StatTile label={t('主机已运行')} value={host.host_uptime_seconds ? formatUptime(host.host_uptime_seconds) : '—'} />
        <StatTile label={t('系统负载')} value={host.load_1 != null ? host.load_1.toFixed(2) : '—'}
          hint={host.load_5 != null && host.load_15 != null ? `5m ${host.load_5.toFixed(2)} · 15m ${host.load_15.toFixed(2)}` : undefined} />
        <StatTile label={t('网络累计')} value={`${formatBytes(host.net_recv_bytes ?? 0)} ↓ / ${formatBytes(host.net_sent_bytes ?? 0)} ↑`} hint={t('自开机累计')} />
        {host.container?.detected && host.container.memory_limit_bytes != null
          ? <StatTile label={t('容器内存限额')} value={`${formatBytes(host.container.memory_usage_bytes ?? 0)} / ${formatBytes(host.container.memory_limit_bytes)}`}
              hint={host.container.cpu_quota_cores != null ? `${t('CPU 限额')} ${host.container.cpu_quota_cores} ${t('核')}` : undefined} />
          : null}
        {(host.sensors ?? []).slice(0, 2).map(sensorItem => <StatTile key={sensorItem.label} label={sensorItem.label} value={`${sensorItem.celsius.toFixed(1)} °C`} hint={t('硬件温度')} />)}
      </div>
    </CardContent>
  </Card>;
}

function CpuCard({ snapshot, history }: { snapshot: MonitorSnapshot; history: TrendPoint[] }) {
  const { t } = useI18n();
  const host = snapshot.host;
  if (!host?.available) return null;
  const perCore = host.cpu_per_core ?? [];
  return <Card>
    <CardHeader><CardTitle><Cpu size={16} className="text-accent" aria-hidden="true" />{t('CPU 使用率')}</CardTitle><CardDescription>{t('主机整体视角：全部逻辑核心的平均使用率，非应用进程占用。')}</CardDescription></CardHeader>
    <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-center">
      <RingGauge percent={host.cpu_percent ?? 0} label={t('平均')} ariaLabel={t('CPU 使用率')} />
      <div className="min-w-0 flex-1">
        {perCore.length
          ? <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
              {perCore.map((value, index) => <div key={index} className="flex items-center gap-2">
                <span className="w-6 shrink-0 text-right font-mono text-2xs text-subtle">{index + 1}</span>
                <div aria-hidden="true" className="h-2 flex-1 overflow-hidden rounded-full bg-surface-alt">
                  <span className={cn('block h-full rounded-full transition-[width]', usageTone(value))} style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
                </div>
                <span className="w-9 shrink-0 text-right font-mono text-2xs text-muted">{value.toFixed(0)}%</span>
              </div>)}
            </div>
          : <p className="text-2xs text-subtle">{t('当前环境未提供逐核心使用率。')}</p>}
        <Sparkline points={history} series={{ key: 'cpu', label: t('CPU 使用率'), color: 'var(--color-primary)' }} ariaLabel={t('CPU 使用率趋势')} height={30} />
      </div>
    </CardContent>
  </Card>;
}

function MemoryCard({ snapshot }: { snapshot: MonitorSnapshot }) {
  const { t } = useI18n();
  const host = snapshot.host;
  if (!host?.available) return null;
  const runtime = snapshot.runtime;
  return <Card>
    <CardHeader><CardTitle><MemoryStick size={16} className="text-accent" aria-hidden="true" />{t('内存')}</CardTitle><CardDescription>{t('主机整机视角（含其他进程与可回收缓存）；进程内存为本应用 RSS。')}</CardDescription></CardHeader>
    <CardContent className="flex flex-col gap-4">
      <div className="flex items-center gap-4">
        <RingGauge percent={host.mem_used_percent ?? 0} label={t('已用')} ariaLabel={t('内存使用率')} size={116} />
        <div className="min-w-0 flex-1 space-y-2">
          <MeterBar ariaLabel={t('内存分布')}
            segments={[{ value: host.mem_used_bytes ?? 0, className: 'bg-primary', title: t('已用内存') }, { value: host.mem_available_bytes ?? 0, className: 'bg-primary-soft', title: t('可用内存') }]} />
          {host.swap_total_bytes
            ? <MeterBar ariaLabel={t('交换分区')}
                segments={[{ value: host.swap_used_bytes ?? 0, className: 'bg-warning', title: t('已用') }, { value: Math.max(0, host.swap_total_bytes - (host.swap_used_bytes ?? 0)), className: 'bg-warning-soft', title: t('可用') }]} />
            : null}
          <div className="grid grid-cols-2 gap-2">
            <StatTile label={t('总内存')} value={formatBytes(host.mem_total_bytes ?? 0)} />
            <StatTile label={t('可用内存')} value={formatBytes(host.mem_available_bytes ?? 0)} />
          </div>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {runtime.rss_bytes ? <StatTile label={t('进程内存')} value={formatBytes(runtime.rss_bytes)} hint={t('常驻内存 RSS')} /> : null}
        <StatTile label={t('堆内存')} value={formatBytes(runtime.heap_alloc_bytes)} hint={`${t('系统内存')} ${formatBytes(runtime.heap_sys_bytes)}`} />
        {host.swap_total_bytes ? <StatTile label={t('交换分区')} value={`${formatBytes(host.swap_used_bytes ?? 0)} / ${formatBytes(host.swap_total_bytes)}`} /> : null}
      </div>
    </CardContent>
  </Card>;
}

function DiskCard({ snapshot }: { snapshot: MonitorSnapshot }) {
  const { t } = useI18n();
  const host = snapshot.host;
  if (!host?.available) return null;
  const disks = host.disks ?? [];
  return <Card>
    <CardHeader><CardTitle><HardDrive size={16} className="text-accent" aria-hidden="true" />{t('磁盘空间')}</CardTitle><CardDescription>{t('主机卷用量（非应用独占）；同一物理盘只列一次，数据目录所在卷单独标记。')}</CardDescription></CardHeader>
    <CardContent className="flex flex-col gap-3">
      {disks.length
        ? disks.map(disk => <div key={disk.path} className="flex flex-col gap-1.5">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="font-mono text-ink">{disk.path}</span>
              {disk.is_data_dir ? <Badge>{t('数据目录')}</Badge> : null}
              <span className="ms-auto text-2xs text-muted">{formatBytes(disk.used_bytes)} / {formatBytes(disk.total_bytes)}</span>
            </div>
            <div aria-hidden="true" className="h-2 w-full overflow-hidden rounded-full bg-surface-alt">
              <span className={cn('block h-full rounded-full transition-[width]', usageTone(disk.used_percent))} style={{ width: `${Math.min(100, Math.max(0, disk.used_percent))}%` }} />
            </div>
            <span className="text-2xs text-subtle">{formatPercent(disk.used_percent)} · {formatBytes(disk.free_bytes)} {t('可用')}</span>
          </div>)
        : <p className="text-2xs text-subtle">{t('当前环境未提供磁盘用量。')}</p>}
    </CardContent>
  </Card>;
}

function NetCard({ history, paused }: { history: TrendPoint[]; paused?: boolean }) {
  const { t } = useI18n();
  const host = history.at(-1);
  if (!host || host.sent == null) {
    return null;
  }
  // Server rates come from the service's own counter gap; the client delta
  // stays as the fallback for the very first pulls after startup.
  const rates = history.map((point, index) => {
    if (point.recvRate != null && point.sentRate != null) return { t: point.t, recv: point.recvRate, sent: point.sentRate };
    const previous = history[index - 1];
    const seconds = previous ? (point.t - previous.t) / 1000 : 0;
    return {
      t: point.t,
      recv: previous && seconds > 0 && point.recv != null && previous.recv != null ? Math.max(0, point.recv - previous.recv) / seconds : undefined,
      sent: previous && seconds > 0 && point.sent != null && previous.sent != null ? Math.max(0, point.sent - previous.sent) / seconds : undefined,
    };
  });
  const series: TrendSeries[] = [
    { key: 'recv', label: t('接收速率'), color: 'var(--color-accent)' },
    { key: 'sent', label: t('发送速率'), color: 'var(--color-warning)' },
  ];
  return <Card>
    <CardHeader><CardTitle><Network size={16} className="text-accent" aria-hidden="true" />{t('网络 I/O')}</CardTitle><CardDescription>{t('主机全部网卡累计；速率为相邻快照差值。')}</CardDescription></CardHeader>
    <CardContent className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-2">
        <StatTile label={t('累计接收')} value={formatBytes(host.recv ?? 0)} />
        <StatTile label={t('累计发送')} value={formatBytes(host.sent ?? 0)} />
      </div>
      <TrendArea points={rates} series={series} height={150} valueFormatter={formatRate} zeroBase ariaLabel={t('网络速率趋势')} summary={t('网络速率趋势')}
        pendingHint={paused ? t('自动刷新已暂停，恢复后继续累积趋势。') : undefined} />
    </CardContent>
  </Card>;
}

function RuntimeCard({ snapshot, history, paused }: { snapshot: MonitorSnapshot; history: TrendPoint[]; paused?: boolean }) {
  const { t } = useI18n();
  const runtime = snapshot.runtime;
  return <Card>
    <CardHeader>
      <CardTitle><Activity size={16} className="text-accent" aria-hidden="true" />{t('进程与 Go Runtime')}</CardTitle>
      <CardDescription>{t('应用进程视角；进程 CPU 为启动以来的累计值，主机整体占用见上方 CPU 卡。')}</CardDescription>
    </CardHeader>
    <CardContent className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        <StatTile label="Goroutines" value={runtime.goroutines.toLocaleString()} />
        <StatTile label={t('堆内存')} value={formatBytes(runtime.heap_alloc_bytes)} hint={`${t('系统内存')} ${formatBytes(runtime.heap_sys_bytes)}`} />
        <StatTile label={t('GC 轮次')} value={runtime.gc_cycles.toLocaleString()} hint={runtime.pause_total_ms ? `${t('累计暂停')} ${runtime.pause_total_ms} ms` : undefined} />
        {runtime.rss_bytes ? <StatTile label={t('进程内存')} value={formatBytes(runtime.rss_bytes)} /> : null}
        {runtime.cpu_time_ms ? <StatTile label={t('进程 CPU')} value={`${runtime.cpu_time_ms.toLocaleString()} ms`} /> : null}
      </div>
      <TrendArea points={history} series={[{ key: 'goroutines', label: 'Goroutines', color: 'var(--color-warning)' }]} height={130} ariaLabel="Goroutines" summary="Goroutines"
        pendingHint={paused ? t('自动刷新已暂停，恢复后继续累积趋势。') : undefined} />
    </CardContent>
  </Card>;
}

const EVENT_TYPE_LABELS = defineMessages({ lifecycle: '生命周期', database: '数据库', storage: '对象存储', task: '定时任务', alert_triggered: '告警触发', alert_recovered: '告警恢复', alert_reclassified: '归因转移', notification_failed: '通知失败' });
const EVENT_LABELS_FALLBACK = EVENT_TYPE_LABELS;
const SEVERITY_DOTS: Record<string, string> = { info: 'bg-success', warning: 'bg-warning', error: 'bg-danger' };
const ALERT_RULE_NAMES = defineMessages({ db_unavailable: '数据库不可用', cpu_high: 'CPU 使用率过高', memory_high: '内存使用率过高', disk_data_dir: '数据目录磁盘空间不足', task_recent_failure: '任务最近执行失败', overall_health: '应用整体健康' });
export function alertRuleName(id: string): string { return t(ALERT_RULE_NAMES[id as keyof typeof ALERT_RULE_NAMES] ?? id); }

/** The system events view: the process-perspective ring buffer, shared by both forms. */
export function EventsSection({ client, local = false }: { client: AppClient; local?: boolean }) {
  const { t } = useI18n();
  const query = useQuery({
    queryKey: ['monitor-events'],
    queryFn: () => {
      if (!client.monitorEvents) throw new Error(t('此版本未提供运行监控'));
      return client.monitorEvents();
    },
    enabled: !!client.monitorEvents,
    staleTime: 5_000,
    refetchInterval: 5_000,
    retry: 1,
  });
  const events = (query.data as MonitorEventList | undefined)?.items ?? [];
  const list = query.data as MonitorEventList | undefined;
  return <div className="flex flex-col gap-3">
    {query.isPending
      ? <Card><CardContent className="py-10 text-center text-sm text-muted" role="status">{t('正在读取事件流…')}</CardContent></Card>
      : query.isError
        ? <Card><CardContent className="flex flex-wrap items-center justify-center gap-3 py-10 text-sm text-danger" role="alert">
            <AlertTriangle size={16} aria-hidden="true" />{t(query.error.message)}
            <Button variant="secondary" onClick={() => void query.refetch()}>{t('重试')}</Button>
          </CardContent></Card>
        : <>
            {events.length
              ? <Card><CardContent className="p-0">
                  <ul className="flex flex-col divide-y divide-line">
                    {events.map(event => <li key={event.id} className="flex flex-wrap items-start gap-2 px-4 py-2.5 text-xs">
                      <span aria-hidden="true" className={cn('mt-1.5 inline-block size-2.5 shrink-0 rounded-full', SEVERITY_DOTS[event.severity] ?? 'bg-subtle')} />
                      <Badge>{t(EVENT_TYPE_LABELS[event.type as keyof typeof EVENT_LABELS_FALLBACK] ?? event.type)}</Badge>
                      <div className="min-w-0 flex-1">
                        <strong className="font-medium text-ink">{event.message}</strong>
                        {event.detail ? <span className="block truncate text-2xs text-muted">{event.detail}</span> : null}
                      </div>
                      <time className="text-2xs text-subtle" title={new Date(event.at * 1000).toLocaleString(currentLocale(), { hour12: false })}>
                        {new Date(event.at * 1000).toLocaleTimeString(currentLocale(), { hour12: false })}
                      </time>
                    </li>)}
                  </ul>
                </CardContent></Card>
              : <Card><CardContent className="py-10 text-center text-sm text-muted" role="status">{t('暂无事件记录')}</CardContent></Card>}
            <Card><CardContent className="py-4">
              <p className="text-2xs font-medium text-muted">{t('关于运行事件')}</p>
              <ul className="mt-1.5 flex flex-col gap-1 text-2xs text-subtle">
                <li>{local ? t('记录应用启动、数据库健康变化，以及本机告警的触发、恢复与归因变化。数据库健康变化仅在查看监控时检测。') : t('记录范围：实例启动生命周期、定时任务失败与恢复（调度器完成时直接投递）、对象存储探活失败（手动触发）、数据库健康翻转（仅在监控页面被查看期间检测）、告警触发/恢复/归因转移（后台检测引擎）。')}</li>
                <li>{t('环形缓冲仅保留最近 {{capacity}} 条，超出丢弃最旧记录；应用重启后全部清空。', { capacity: list?.capacity ?? 0 })}</li>
                <li>{local ? t('此处展示应用自身的运行事件，不保证覆盖所有异常。') : t('运行事件不等同于操作日志、系统通知或持久化审计，也不保证覆盖尚未接入事件源的所有异常。')}</li>
              </ul>
            </CardContent></Card>
          </>}
  </div>;
}

function AlertRulesCard({ client }: { client: AppClient }) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ['monitor-alert-rules'],
    queryFn: () => {
      if (!client.alertRules) throw new Error(t('此版本未提供运行监控'));
      return client.alertRules();
    },
    enabled: !!client.alertRules,
    staleTime: 15_000,
  });
  const [draft, setDraft] = useState<MonitorAlertRules | null>(null);
  const [saving, setSaving] = useState(false);
  const rules = draft ?? query.data;
  const update = (id: string, patch: Partial<MonitorAlertRule>) => {
    if (!rules) return;
    setDraft({ ...rules, rules: rules.rules.map(rule => (rule.id === id ? { ...rule, ...patch } : rule)) });
  };
  const save = async () => {
    if (!rules || !client.updateAlertRules) return;
    setSaving(true);
    try {
      const saved = await client.updateAlertRules(rules);
      setDraft(null);
      await queryClient.invalidateQueries({ queryKey: ['monitor-alert-rules'] });
      queryClient.setQueryData(['monitor-alert-rules'], saved);
    } finally {
      setSaving(false);
    }
  };
  if (query.isPending) return <Card><CardContent className="py-8 text-center text-sm text-muted" role="status">{t('正在读取告警规则…')}</CardContent></Card>;
  if (query.isError || !rules) return null;
  const dirty = draft != null;
  return <Card className="lg:col-span-2">
    <CardHeader className="flex-row items-center justify-between">
      <CardTitle><BellRing size={16} className="text-accent" aria-hidden="true" />{t('告警规则')}</CardTitle>
      <div className="flex items-center gap-2">
        {dirty ? <Button variant="secondary" onClick={() => setDraft(null)}>{t('放弃修改')}</Button> : null}
        <Button pending={saving} disabled={!dirty} onClick={() => void save()}>{t('保存规则')}</Button>
      </div>
    </CardHeader>
    <CardContent className="flex flex-col gap-3">
      <p className="text-2xs text-subtle">{t('规则保存后下一检测拍（30 秒）生效；全部停用即停止后台检测。')}</p>
      <ul className="flex flex-col divide-y divide-line rounded-lg border border-line">
        {rules.rules.map(rule => <li key={rule.id} className="flex flex-wrap items-center gap-3 px-3 py-2.5 text-xs">
          <strong className="w-44 shrink-0 font-medium text-ink">{alertRuleName(rule.id)}</strong>
          <button role="switch" aria-checked={rule.enabled} aria-label={`${alertRuleName(rule.id)} ${t('启用')}`}
            onClick={() => update(rule.id, { enabled: !rule.enabled })}
            className={cn('inline-flex h-5 w-9 items-center rounded-full px-0.5 transition-colors', rule.enabled ? 'bg-success justify-end' : 'bg-surface-alt justify-start')}>
            <span aria-hidden="true" className="size-4 rounded-full bg-surface shadow-sm" />
          </button>
          {rule.trigger_value != null ? <label className="flex items-center gap-1 text-2xs text-muted">{t('触发')}
            <input type="number" className="w-16 rounded border border-line bg-surface px-1.5 py-0.5 text-2xs text-ink" value={rule.trigger_value}
              onChange={event => update(rule.id, { trigger_value: Number(event.target.value) })} aria-label={t('触发阈值')} />%</label> : null}
          {rule.recover_value != null ? <label className="flex items-center gap-1 text-2xs text-muted">{t('恢复')}
            <input type="number" className="w-16 rounded border border-line bg-surface px-1.5 py-0.5 text-2xs text-ink" value={rule.recover_value}
              onChange={event => update(rule.id, { recover_value: Number(event.target.value) })} aria-label={t('恢复阈值')} />%</label> : null}
          {rule.consecutive != null ? <label className="flex items-center gap-1 text-2xs text-muted">{t('连续')}
            <input type="number" className="w-12 rounded border border-line bg-surface px-1.5 py-0.5 text-2xs text-ink" value={rule.consecutive} min={1} max={20}
              onChange={event => update(rule.id, { consecutive: Number(event.target.value) })} aria-label={t('连续采样次数')} />{t('拍')}</label> : null}
          {rule.cooldown_minutes != null ? <label className="flex items-center gap-1 text-2xs text-muted">{t('冷却')}
            <input type="number" className="w-14 rounded border border-line bg-surface px-1.5 py-0.5 text-2xs text-ink" value={rule.cooldown_minutes} min={0} max={1440}
              onChange={event => update(rule.id, { cooldown_minutes: Number(event.target.value) })} aria-label={t('冷却时间')} />{t('分钟')}</label> : null}
        </li>)}
      </ul>
      <p className="text-2xs text-subtle">{t('整体健康规则默认未启用：具体规则已覆盖数据库与任务异常的归因。')}</p>
    </CardContent>
  </Card>;
}

function ResourcesSection({ client, snapshot, history, paused }: { client: AppClient; snapshot: MonitorSnapshot; history: TrendPoint[]; paused?: boolean }) {
  const { t } = useI18n();
  return <div className="flex flex-col gap-4">
    <div className="grid gap-4 lg:grid-cols-2">
      <HostCard snapshot={snapshot} />
      <CpuCard snapshot={snapshot} history={history} />
      <MemoryCard snapshot={snapshot} />
      <DiskCard snapshot={snapshot} />
      <NetCard history={history} paused={paused} />
      <RuntimeCard snapshot={snapshot} history={history} paused={paused} />
      {snapshot.profile === 'web-platform' ? <AlertRulesCard client={client} /> : null}
    </div>
    <p className="text-2xs text-subtle">{t('宿主机指标来自只读采样且不落库；趋势为页面打开期间的快照序列；CPU 使用率取相邻两次快照的差值。容器部署时内存/负载为内核视角，容器限额单列。')}</p>
  </div>;
}

/** Platform super-admin pages: one monitor directory entry per section. */
export function AdminMonitorPage({ client }: PageProps) {
  return <SectionShell client={client} title={t('运行概览')} description={t('实例运行状态、版本与核心健康。')}>{(innerClient, snapshot, history) => <OverviewSection client={innerClient} snapshot={snapshot} history={history} />}</SectionShell>;
}
export function AdminMonitorServicesPage({ client }: PageProps) {
  return <SectionShell client={client} title={t('服务健康')} description={t('HTTP、数据库、存储与后台任务状态。')}>{(innerClient, snapshot, history, paused) => <ServicesSection client={innerClient} snapshot={snapshot} history={history} paused={paused} />}</SectionShell>;
}
export function AdminMonitorResourcesPage({ client }: PageProps) {
  return <SectionShell client={client} title={t('资源监控')} description={t('主机硬件、进程与 Go Runtime 资源。')}>{(innerClient, snapshot, history, paused) => <ResourcesSection client={innerClient} snapshot={snapshot} history={history} paused={paused} />}</SectionShell>;
}

/** Platform super-admin events page: the fourth monitor directory entry. */
export function AdminMonitorEventsPage({ client }: PageProps) {
  return <SectionShell client={client} title={t('运行事件')} description={t('应用实例自身产生的运行事件流：生命周期、服务健康变化与任务异常。')}>{(innerClient) => <EventsSection client={innerClient} />}</SectionShell>;
}

const LOCAL_TABS = defineMessages({ overview: '运行概览', services: '服务健康', resources: '资源监控', events: '运行事件' });

/** Standalone and desktop collapse the monitor group into one tabbed console page. */
export function MonitorPage({ client }: PageProps) {
  useLocale();
  const [tab, setTab] = useState('overview');
  const { t } = useI18n();
  return <SectionShell client={client} title={t('运行监控')} description={t('本机实例的运行状态、资源与服务健康。')}>
    {(innerClient, snapshot, history, paused) => <div className="flex flex-col gap-4">
      <Tabs id="local-monitor" label={t('运行监控分区')} value={tab} onChange={setTab}
        items={Object.entries(LOCAL_TABS).map(([id, label]) => ({ id, label: t(label) }))} />
      <div role="tabpanel" id={`local-monitor-panel-${tab}`} aria-labelledby={`local-monitor-tab-${tab}`} tabIndex={0}>
      {tab === 'overview'
        ? <OverviewSection client={innerClient} snapshot={snapshot} history={history} />
        : tab === 'services'
          ? <ServicesSection client={innerClient} snapshot={snapshot} history={history} />
          : tab === 'resources'
            ? <ResourcesSection client={innerClient} snapshot={snapshot} history={history} paused={paused} />
            : <EventsSection client={innerClient} local />}
      </div>
    </div>}
  </SectionShell>;
}

// Author: yunnuo <ymz@ebox.vip>
// Description: System updates: shared offline-first update panel plus the administrator edition panel.
import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, CheckCircle2, Download, History, KeyRound, RefreshCw, ShieldCheck, WifiOff } from 'lucide-react';
import type { AppClient, Bootstrap, UpdateRelease } from '@unicore/sdk';
import { currentLocale, t, useLocale } from '../i18n';
import { Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Checkbox, Modal, Progress, useMessage } from '@unicore/ui';
import type { PageProps } from '../router';

const busy = (status?: string) => ['downloading', 'preparing', 'restarting', 'swapping', 'awaiting_health', 'rolling_back'].includes(status ?? '');

export function UserEditionPage({ client, metadata }: PageProps) {
  useLocale();
  if (!__FEATURE_UPDATER__ || !metadata.capabilities.updater || !client.updates) return null;
  return <UpdatePanel client={client} metadata={metadata} />;
}

export function AdminEditionPage({ client, metadata }: PageProps) {
  useLocale();
  return <div className="flex flex-col gap-4">
    {__FEATURE_UPDATER__ && metadata.capabilities.updater && client.updates && <UpdatePanel client={client} metadata={metadata} />}
    {__FEATURE_LICENSE__ && metadata.capabilities.license && <Card>
      <CardHeader className="flex-row items-start justify-between gap-3">
        <CardTitle><KeyRound size={18} className="text-accent" aria-hidden="true" />{t('授权检测')}</CardTitle>
        <Badge>{t('待对接')}</Badge>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <p className="text-sm text-muted">{t('尚未接入授权服务。后续可连接你的独立授权服务器。')}</p>
        <div><Button variant="secondary" disabled>{t('检测授权')}</Button></div>
      </CardContent>
    </Card>}
  </div>;
}

function UpdatePanel({ client, metadata }: { client: AppClient; metadata: Bootstrap }) {
  useLocale();
  const api = client.updates!;
  const [confirm, setConfirm] = useState(false);
  const [backup, setBackup] = useState(false);
  const messages = useMessage();
  const caches = useQueryClient();
  const initiated = useRef(false);
  const query = useQuery({
    queryKey: ['system-updates'],
    queryFn: () => api.overview(),
    refetchInterval: q => busy(q.state.data?.job.status) ? 1000 : false,
    retry: 2,
  });
  const check = useMutation({
    mutationFn: () => api.check(),
    onSuccess: data => {
      caches.setQueryData(['system-updates'], data);
      if (data.last_error) messages.warning(t('暂时无法完成检查，更新日志已保留'));
      else if (data.available) messages.success(t('发现新版本'));
      else messages.info(t('已完成版本检查'));
    },
  });
  const apply = useMutation({
    mutationFn: () => api.apply({ version: query.data!.latest_version, backup_confirmed: backup }),
    onSuccess: () => {
      initiated.current = true;
      setConfirm(false);
      setBackup(false);
      messages.info(t('更新任务已开始，准备完成后将重启'));
      void query.refetch();
    },
  });
  const data = query.data;
  const running = busy(data?.job.status);
  useEffect(() => {
    if (initiated.current && data && !busy(data.job.status) && ['completed', 'rolled_back', 'failed'].includes(data.job.status)) {
      initiated.current = false;
      if (data.job.status === 'completed') messages.success(t('新版本已通过启动确认'));
      else messages.warning(data.job.message);
      if (client.transport === 'http' && data.current_version !== metadata.version) window.location.reload();
    }
  }, [data, client.transport, metadata.version, messages]);
  return <>
    <Card aria-label={t('在线更新')}>
      <CardHeader className="flex-row flex-wrap items-start justify-between gap-3">
        <div>
          <CardTitle><Download size={19} className="text-accent" aria-hidden="true" />{t('在线更新')}</CardTitle>
          <CardDescription>{t('检查新版本，验证更新包后安装并重启。')}</CardDescription>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="secondary" disabled={check.isPending || running || !data} pending={check.isPending} onClick={() => check.mutate()}>
            {!check.isPending && <RefreshCw size={15} aria-hidden="true" />}{t('检查更新')}
          </Button>
          <Button disabled={!data?.can_apply || running} onClick={() => { setBackup(false); setConfirm(true); }}><Download size={15} />{t('更新并重启')}</Button>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-4 rounded-lg bg-surface-alt px-3 py-2.5">
          <div><span className="block text-2xs text-muted">{t('当前版本')}</span><strong className="text-md text-ink tabular-nums">v{data?.current_version ?? metadata.version}</strong></div>
          <ArrowRight size={17} className="text-subtle" aria-hidden="true" />
          <div><span className="block text-2xs text-muted">{t('最新版本')}</span><strong className="text-md text-ink tabular-nums">{data?.latest_version ? `v${data.latest_version}` : t('等待检查')}</strong></div>
          <Badge variant={data?.available ? 'primary' : 'subtle'} className="ms-auto">
            {running ? t('更新进行中') : data?.available ? t('发现新版本') : data?.checked_at ? t('已完成检查') : t('尚未联网检查')}
          </Badge>
        </div>
        {data?.last_error && <p role="status" className="flex items-center gap-1.5 text-sm text-warning"><WifiOff size={16} aria-hidden="true" />{data.last_error}</p>}
        {data?.verified && data.available && <p className="flex items-center gap-1.5 text-sm text-success"><ShieldCheck size={16} aria-hidden="true" />{t('更新包已通过发行者签名与兼容性检查')}</p>}
        {data && !running && <p className="text-xs text-muted">{data.can_apply ? t('安装前请备份实例数据；更新不会覆盖数据目录。') : data.reason}</p>}
        {running && <div role="status" className="flex flex-col gap-1.5">
          <span className="flex items-center gap-1.5 text-sm text-ink"><RefreshCw size={15} className="animate-spin" aria-hidden="true" />{t(data?.job.message)}</span>
          <Progress value={data?.job.progress ?? 0} aria-label={t('更新进度')} />
          <small className="text-2xs text-muted">{t('重启期间连接会短暂中断，页面将自动重连。')}</small>
        </div>}
        {data?.job.status && ['completed', 'rolled_back', 'failed'].includes(data.job.status) && <div role="status" className="flex items-center gap-1.5 text-sm">
          <CheckCircle2 size={16} className={data.job.status === 'completed' ? 'text-success' : 'text-warning'} aria-hidden="true" />
          <span className={data.job.status === 'completed' ? 'text-success' : 'text-warning'}>{t(data.job.message)}{data.job.finished_at && ` · ${new Date(data.job.finished_at).toLocaleString(currentLocale())}`}</span>
        </div>}
        {query.isError && <p role="alert" className="flex flex-wrap items-center gap-2 text-sm text-danger">
          {running ? t('服务正在重启，正在尝试重新连接。') : t('暂时无法读取本机更新信息。')}
          <Button variant="link" size="sm" className="h-auto px-0" onClick={() => void query.refetch()}>{t('重试')}</Button>
        </p>}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3">
          <span className="text-xs text-ink">{data?.source ?? t('本机版本记录')}{data?.channel === 'preview' ? t(' · 开发预览渠道') : ''}</span>
          <small className="text-2xs text-subtle">{data?.checked_at ? t('上次检查 {{v0}}', { v0: new Date(data.checked_at).toLocaleString(currentLocale()) }) : t('仅在点击检查时联网')}</small>
        </div>
      </CardContent>
    </Card>
    <Card aria-label={t('更新日志')}>
      <CardHeader className="flex-row items-start justify-between gap-3">
        <div>
          <CardTitle><History size={19} className="text-accent" aria-hidden="true" />{t('更新日志')}</CardTitle>
          <CardDescription>{t('随应用内置，保留已获取的版本历史，离线也能阅读。')}</CardDescription>
        </div>
        <Badge>{t('{{count}} 个版本', { count: data?.history.length ?? 0 })}</Badge>
      </CardHeader>
      <CardContent>
        {query.isPending
          ? <p role="status" className="text-sm text-muted">{t('正在读取本机版本记录…')}</p>
          : data?.history.length
            ? <div className="flex flex-col divide-y divide-line">
                {data.history.map((release, index) => <article key={release.version} className="update-release flex flex-col gap-2 py-3 first:pt-0 last:pb-0">
                  <header className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <h3 className="text-md font-semibold text-ink">v{release.version}</h3>
                      {release.version === data.current_version && <Badge>{t('当前')}</Badge>}
                      {index === 0 && <Badge variant="primary">{t('最新记录')}</Badge>}
                    </div>
                    <time dateTime={release.published_at} className="text-2xs text-subtle">{new Date(release.published_at).toLocaleDateString(currentLocale())}</time>
                  </header>
                  <ReleaseNotes release={release} />
                  <footer className="flex flex-wrap items-center justify-between gap-2">
                    <small className="text-2xs text-subtle">{release.source}{release.prerelease ? t(' · 开发预览') : ''}</small>
                    {/^https:\/\//.test(release.url) && <a href={release.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-accent hover:underline">{t('查看发行详情')}</a>}
                  </footer>
                </article>)}
              </div>
            : <p className="text-sm text-muted">{t('此应用尚未内置版本记录，请维护项目的 CHANGELOG 后重新构建。')}</p>}
      </CardContent>
    </Card>
    {confirm && data && <Modal title={t('确认更新并重启')} pending={apply.isPending} onClose={() => setConfirm(false)}>
      <div className="flex flex-col gap-3">
        <p className="text-sm text-muted">{t('即将从 v{{current}} 更新到 v{{latest}}。下载与校验完成后服务会短暂重启，启动确认失败会恢复旧程序。', { current: data.current_version, latest: data.latest_version })}</p>
        <Checkbox checked={backup} onChange={setBackup}>{t('我已备份数据库、文件、配置和实例密钥')}</Checkbox>
        <p className="text-xs text-muted">{t('需要数据库结构迁移的版本须按部署手册人工升级。本次操作只接受兼容的签名更新包。')}</p>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button variant="secondary" onClick={() => setConfirm(false)}>{t('取消')}</Button>
          <Button disabled={!backup} pending={apply.isPending} onClick={() => apply.mutate()}><Download size={15} />{t('确认更新')}</Button>
        </div>
      </div>
    </Modal>}
  </>;
}

// A small text-only Markdown subset; remote HTML, images and executable links are never interpreted.
function ReleaseNotes({ release }: { release: UpdateRelease }) {
  useLocale();
  const lines = release.notes.split('\n').filter(line => line.trim() && !/^<!--/.test(line));
  return <div className="flex flex-col gap-1 text-sm text-muted">
    {lines.map((line, index) => /^[-*] /.test(line)
      ? <p key={index} className="flex gap-1.5"><span aria-hidden="true">•</span>{line.slice(2).replace(/`([^`]+)`/g, '$1')}</p>
      : <p key={index} className={/^#{1,6} /.test(line) ? 'font-semibold text-ink' : ''}>{line.replace(/^#{1,6} /, '').replace(/`([^`]+)`/g, '$1')}</p>)}
  </div>;
}

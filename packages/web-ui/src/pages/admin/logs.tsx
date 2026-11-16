// Author: yunnuo <ymz@ebox.vip>
// Description: Filtered audit records with server sorting and bounded CSV export, plus the mail delivery history table.
import { useRef, useState } from 'react';
import { keepPreviousData, useMutation, useQuery } from '@tanstack/react-query';
import { createColumnHelper, createSortedRowModel, rowSortingFeature, tableFeatures, useTable, type SortingState } from '@tanstack/react-table';
import { Download, RotateCcw, ScrollText } from 'lucide-react';
import type { AuditLogQuery, AuditLogList, MailJobList, WebClient } from '@unicore/sdk';

type AuditEntry = AuditLogList['items'][number];
type MailJob = MailJobList['items'][number];
import { currentLocale, defineMessages, t, useI18n } from '../../i18n';
import { Badge, Button, Card, CardContent, Input, SimpleSelect, Tabs, useMessage } from '@unicore/ui';
import { DataTable, DataTablePagination, DataTableSortHeader, DataTableToolbar } from '../../components/data-table';
import type { PageProps } from '../../router';

const auditFeatures = tableFeatures({ rowSortingFeature, sortedRowModel: createSortedRowModel() });
const mailFeatures = tableFeatures({});
const auditHelper = createColumnHelper<typeof auditFeatures, AuditEntry>();
const mailHelper = createColumnHelper<typeof mailFeatures, MailJob>();
const EMPTY_AUDIT: AuditEntry[] = [];
const EMPTY_JOBS: MailJob[] = [];
const PAGE_SIZES = [20, 50, 100] as const;
const actions = defineMessages({
 'account.profile.updated':'修改个人资料','account.email.code.requested':'申请邮箱换绑验证码','account.email.changed':'更换账号邮箱',
 'account.totp.enabled':'开启双重验证','account.totp.disabled':'关闭双重验证','account.totp.enterprise_verified':'完成企业身份验证','auth.mfa.verified':'完成双重验证','account.sessions.revoked':'下线登录设备',
 'account.sessions.recovered':'使用恢复码找回会话','administrator.password.recovered':'管理员离线恢复密码',
  'announcements.created': '新增平台公告', 'announcements.updated': '更新平台公告', 'announcements.deleted': '删除平台公告', 'announcements.configured': '配置平台公告',
  'departments.created': '新增部门', 'departments.updated': '更新部门', 'departments.deleted': '删除部门',
  'dictionaries.created': '新增数据字典', 'dictionaries.updated': '更新数据字典', 'dictionaries.deleted': '删除数据字典', 'dictionaries.items_replaced': '替换字典项',
  'install.completed': '完成安装', 'users.created': '新增用户', 'users.updated': '更新用户状态', 'administrators.created': '新增管理员', 'administrators.updated': '更新管理员状态',
  'menus.updated': '更新菜单树', 'posts.created': '新增岗位', 'posts.updated': '更新岗位', 'posts.deleted': '删除岗位',
  'roles.created': '新增角色', 'roles.updated': '更新角色', 'roles.deleted': '删除角色',
  'settings.updated': '更新系统设置', 'auth.login': '账号登录', 'auth.login.failed': '登录失败', 'auth.logout': '退出登录',
  'account.password.changed': '修改密码', 'mail.notification.queued': '系统通知入队', 'notifications.updated': '更新通知配置',
  'mail.template.tested': '测试邮件模板', 'mail.template.updated': '更新邮件模板', 'auth.verify.requested': '申请邮箱验证', 'auth.verify.completed': '完成邮箱验证',
  'auth.reset.requested': '申请密码重置', 'auth.reset.completed': '完成密码重置', 'auth.login.requested': '申请邮箱登录', 'auth.login.completed': '邮箱登录成功',
  'auth.oidc.login': '企业账号登录', 'auth.oidc.linked': '绑定企业身份', 'auth.oidc.unlinked': '解除企业绑定',
  'storage.location.updated': '更新存储位置', 'storage.location.deleted': '删除存储位置',
  'file.created': '上传文件', 'file.updated': '更新文件', 'file.deleted': '删除文件',
  'logs.viewed': '打开实时日志', 'logs.exported': '导出操作日志', 'updates.apply_requested': '申请安装系统更新',
  'notes.created': '新增笔记', 'notes.updated': '更新笔记', 'notes.deleted': '删除笔记',
  'tasks.created': '新增定时任务', 'tasks.updated': '更新定时任务', 'tasks.deleted': '删除定时任务', 'tasks.triggered': '触发定时任务',
});
const jobStates = defineMessages({ pending: '待发送', sending: '发送中', sent: '已发送', dead: '已终止', cancelled: '已取消' });
const actionLabel = (action: string) => t(actions[action as keyof typeof actions] ?? action);
const timeText = (seconds: number) => new Date(seconds * 1000).toLocaleString(currentLocale(), { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });

const auditColumns = auditHelper.columns([
  auditHelper.display({
    id: 'id',
    header: ({ column }) => <DataTableSortHeader label="ID" sorted={column.getIsSorted()} onToggle={() => column.toggleSorting(column.getIsSorted() !== 'desc')} />,
    cell: info => <code title={info.row.original.id} className="font-mono text-2xs text-muted">{info.row.original.id.slice(0, 8)}</code>,
  }),
  auditHelper.display({
    id: 'action',
    header: () => t('操作类型'),
    cell: info => <Badge variant={info.row.original.action.endsWith('updated') ? 'subtle' : 'primary'}>{actionLabel(info.row.original.action)}</Badge>,
  }),
  auditHelper.display({
    id: 'actor',
    header: () => t('操作人'),
    cell: info => {
      const item = info.row.original;
      return <span className="flex flex-col" title={item.actor_id}>
        <span className="max-w-40 truncate">{item.actor_name || (item.actor_id === 'bootstrap' ? t('首次安装') : item.actor_id.slice(0, 12))}</span>
        {item.realm && <small className="text-2xs text-subtle">{item.realm === 'administrator' ? t('管理员') : t('普通用户')}</small>}
      </span>;
    },
  }),
  auditHelper.display({
    id: 'target',
    header: () => t('操作目标'),
    cell: info => <span title={info.row.original.target} className="block max-w-44 truncate text-muted">{info.row.original.target || '—'}</span>,
  }),
  auditHelper.display({
    id: 'detail',
    header: () => t('详情'),
    cell: info => <span title={info.row.original.detail} className="block max-w-52 truncate text-muted">{info.row.original.detail || '—'}</span>,
  }),
  auditHelper.display({
    id: 'ip',
    header: () => t('IP 地址'),
    cell: info => <span className="whitespace-nowrap font-mono text-2xs text-muted">{info.row.original.ip_address || '—'}</span>,
  }),
  auditHelper.display({
    id: 'created_at',
    header: ({ column }) => <DataTableSortHeader label={t('时间')} sorted={column.getIsSorted()} onToggle={() => column.toggleSorting(column.getIsSorted() !== 'desc')} />,
    cell: info => <time className="whitespace-nowrap text-muted">{timeText(info.row.original.created_at)}</time>,
  }),
]);

const mailColumns = mailHelper.columns([
  mailHelper.display({
    id: 'state',
    header: () => t('状态'),
    cell: info => {
      const state = info.row.original.state;
      const label = t(jobStates[state as keyof typeof jobStates] ?? state);
      if (state === 'sent') return <Badge variant="success">{label}</Badge>;
      if (state === 'dead') return <Badge variant="danger">{label}</Badge>;
      return <Badge variant="subtle">{label}</Badge>;
    },
  }),
  mailHelper.display({id:'channel',header:()=>t('通知渠道'),cell:info=>info.row.original.channel==='wecom'?t('企业微信群机器人'):info.row.original.channel==='webhook'?'Webhook':t('邮件通知')}),
  mailHelper.display({ id: 'attempts', header: () => t('尝试次数'), cell: info => info.row.original.attempts }),
  mailHelper.display({
    id: 'created_at',
    header: () => t('创建时间'),
    cell: info => <time className="whitespace-nowrap text-muted">{new Date(info.row.original.created_at * 1000).toLocaleString(currentLocale())}</time>,
  }),
  mailHelper.display({
    id: 'result',
    header: () => t('结果'),
    cell: info => {
      const item = info.row.original;
      return <span className="text-muted">{item.last_error === 'EXPIRED' ? t('通知已过期') : item.last_error === 'DISABLED' ? t('通知已关闭或渠道已切换') : item.last_error ? t('发送失败') : '—'}</span>;
    },
  }),
]);

export function AdminLogsPage({ client }: PageProps) {
  if (!client.web) return null;
  return <LogsPanel web={client.web} />;
}

function LogsPanel({ web }: { web: WebClient }) {
  const { t } = useI18n();
  const message = useMessage();
  const [tab, setTab] = useState('audit');
  const [sorting, setSorting] = useState<SortingState>([{ id: 'created_at', desc: true }]);
  const [query, setQuery] = useState<AuditLogQuery>({ action: '', search: '', start: 0, end: 0, sort: 'created_at', direction: 'desc', page: 1, page_size: 20 });
  const [searchInput, setSearchInput] = useState('');
  const [startInput, setStartInput] = useState('');
  const [endInput, setEndInput] = useState('');
  const searchRef = useRef('');
  searchRef.current = searchInput;
  const sort = sorting[0]?.id === 'id' ? 'id' : 'created_at';
  const direction = sorting[0]?.desc === false ? 'asc' : 'desc';
  const effective: AuditLogQuery = { ...query, sort, direction };
  const audit = useQuery({
    queryKey: ['system-logs', effective],
    queryFn: () => web.systemLogs(effective),
    enabled: tab === 'audit',
    placeholderData: keepPreviousData,
  });
  const mail = useQuery({
    queryKey: ['mail-jobs'],
    queryFn: () => web.mailJobs(),
    enabled: tab === 'mail',
    refetchInterval: tab === 'mail' ? 5000 : false,
  });
  const exported = useMutation({
    mutationFn: () => web.exportSystemLogs(effective),
    onSuccess: data => {
      const url = URL.createObjectURL(new Blob([data.content], { type: 'text/csv;charset=utf-8' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = data.filename;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      message[data.truncated ? 'warning' : 'success'](data.truncated ? t('已导出 {{v0}} 条，达到上限；请缩小筛选范围。', { v0: data.exported }) : t('已导出 {{v0}} 条操作日志', { v0: data.exported }));
    },
    onError: error => message.error(t(error.message)),
  });
  const filter = (patch: Partial<AuditLogQuery>) => setQuery(current => ({ ...current, ...patch, page: 1 }));
  const setDates = (from: string, to: string) => {
    const next = to ? new Date(`${to}T00:00:00`) : null;
    next?.setDate(next.getDate() + 1);
    filter({
      start: from ? Math.floor(new Date(`${from}T00:00:00`).getTime() / 1000) : 0,
      end: next ? Math.floor(next.getTime() / 1000) : 0,
    });
  };
  const resetFilters = () => {
    setQuery({ action: '', search: '', start: 0, end: 0, sort: 'created_at', direction: 'desc', page: 1, page_size: 20 });
    setSorting([{ id: 'created_at', desc: true }]);
    setSearchInput('');
    setStartInput('');
    setEndInput('');
  };
  const auditTable = useTable({
    features: auditFeatures,
    columns: auditColumns,
    data: audit.data?.items ?? EMPTY_AUDIT,
    getRowId: row => row.id,
    manualSorting: true,
    state: { sorting },
    onSortingChange: updater => {
      setSorting(typeof updater === 'function' ? updater(sorting) : updater);
      setQuery(current => ({ ...current, page: 1 }));
    },
  });
  const mailTable = useTable({
    features: mailFeatures,
    columns: mailColumns,
    data: mail.data?.items ?? EMPTY_JOBS,
    getRowId: row => row.id,
  });
  return <div className="flex flex-col gap-4">
    <Tabs id="system-logs" label={t('日志类型')} value={tab} onChange={setTab} items={[{ id: 'audit', label: t('操作日志') }, { id: 'mail', label: t('通知投递') }]} />
    <section role="tabpanel" id={`system-logs-panel-${tab}`} aria-labelledby={`system-logs-tab-${tab}`}>
      {tab === 'audit' ? <Card>
        <CardContent className="flex flex-col gap-4">
          <DataTableToolbar
            search={{ label: t('搜索操作日志'), placeholder: t('搜索操作者、目标、详情或 IP…'), value: searchInput, maxLength: 128,
              onChange: value => setSearchInput(value), onSubmit: () => filter({ search: searchRef.current }) }}
            actions={<Button pending={exported.isPending} disabled={audit.isPending || !audit.data?.total} onClick={() => exported.mutate()}>
              <Download size={15} />{exported.isPending ? t('导出中…') : t('导出')}
            </Button>}>
            <SimpleSelect label={t('操作类型')} className="h-9 w-44" value={query.action}
              onChange={value => filter({ action: value })}
              options={[{ value: '', label: t('全部类型') }, ...(audit.data?.actions ?? []).map(action => ({ value: action, label: actionLabel(action) }))]} />
            <div className="flex items-center gap-2">
              <Input type="date" aria-label={t('开始日期')} className="h-9 w-auto" value={startInput} max={endInput || undefined}
                onChange={event => { setStartInput(event.target.value); setDates(event.target.value, endInput); }} />
              <span className="text-xs text-muted">{t('至')}</span>
              <Input type="date" aria-label={t('结束日期')} className="h-9 w-auto" value={endInput} min={startInput || undefined}
                onChange={event => { setEndInput(event.target.value); setDates(startInput, event.target.value); }} />
            </div>
            <Button variant="ghost" size="icon" aria-label={t('清除筛选')} onClick={resetFilters}><RotateCcw size={14} /></Button>
          </DataTableToolbar>
          <DataTable wrapperClassName="audit-table audit-table-wrap" table={auditTable} pending={audit.isPending} busy={audit.isFetching}
            error={audit.error} onRetry={() => void audit.refetch()}
            empty={{ icon: ScrollText, title: t('没有匹配的操作记录'), hint: t('试试其他类型、关键词或日期范围。') }} />
          <DataTablePagination className="audit-pagination" page={query.page} pageSize={query.page_size} total={audit.data?.total ?? 0}
            onPageChange={page => setQuery(current => ({ ...current, page }))} onPageSizeChange={size => filter({ page_size: size })} disabled={audit.isFetching} />
        </CardContent>
      </Card>
        : <Card>
          <CardContent className="flex flex-col gap-4">
            <div>
              <h2 className="text-md font-semibold text-ink">{t('通知投递记录')}</h2>
              <p className="mt-0.5 text-xs text-muted">{t('最近 30 个任务；失败自动重试，最多 5 次')}</p>
            </div>
            <DataTable table={mailTable} pending={mail.isPending} busy={mail.isFetching} error={mail.error}
              onRetry={() => void mail.refetch()} empty={{ title: t('暂无投递任务') }} />
          </CardContent>
        </Card>}
    </section>
  </div>;
}

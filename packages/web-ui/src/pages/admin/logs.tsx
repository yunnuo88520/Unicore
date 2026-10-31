// Author: yunnuo <ymz@ebox.vip>
// Description: Filtered audit records with server sorting and bounded CSV export, plus the mail delivery history table.
import { useRef, useState } from 'react';
import { keepPreviousData, useMutation, useQuery } from '@tanstack/react-query';
import { createColumnHelper, createSortedRowModel, flexRender, rowSortingFeature, tableFeatures, useTable, type SortingState } from '@tanstack/react-table';
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight, Download, RotateCcw, ScrollText, Search } from 'lucide-react';
import type { AuditLogQuery, AuditLogList, MailJobList, WebClient } from '@unicore/sdk';

type AuditEntry = AuditLogList['items'][number];
type MailJob = MailJobList['items'][number];
import { currentLocale, defineMessages, t, useI18n } from '../../i18n';
import { Badge, Button, Card, CardContent, Input, SimpleSelect, Table, TableBody, TableCell, TableEmpty, TableHead, TableHeader, TableRow, Tabs, useMessage } from '../../ui';
import type { PageProps } from '../../router';

const auditFeatures = tableFeatures({ rowSortingFeature, sortedRowModel: createSortedRowModel() });
const mailFeatures = tableFeatures({});
const auditHelper = createColumnHelper<typeof auditFeatures, AuditEntry>();
const mailHelper = createColumnHelper<typeof mailFeatures, MailJob>();
const EMPTY_AUDIT: AuditEntry[] = [];
const EMPTY_JOBS: MailJob[] = [];
const AUDIT_COLUMNS = 7;
const MAIL_COLUMNS = 4;
const PAGE_SIZES = [20, 50, 100] as const;
const actions = defineMessages({
  'announcements.created': '新增平台公告', 'announcements.updated': '更新平台公告', 'announcements.deleted': '删除平台公告', 'announcements.configured': '配置平台公告',
  'install.completed': '完成安装', 'users.created': '新增用户', 'users.updated': '更新用户状态', 'administrators.created': '新增管理员', 'administrators.updated': '更新管理员状态',
  'settings.updated': '更新系统设置', 'auth.login': '账号登录', 'account.password.changed': '修改密码', 'mail.notification.queued': '系统通知入队',
  'mail.template.tested': '测试邮件模板', 'mail.template.updated': '更新邮件模板', 'auth.verify.requested': '申请邮箱验证', 'auth.verify.completed': '完成邮箱验证',
  'auth.reset.requested': '申请密码重置', 'auth.reset.completed': '完成密码重置', 'auth.login.requested': '申请邮箱登录', 'auth.login.completed': '邮箱登录成功',
  'oidc.login': '企业账号登录', 'oidc.link': '绑定企业身份', 'oidc.unlink': '解除企业绑定', 'storage.location.updated': '更新存储位置', 'storage.location.deleted': '删除存储位置',
  'file.created': '上传文件', 'file.updated': '更新文件', 'notes.created': '新增笔记', 'notes.updated': '更新笔记', 'notes.deleted': '删除笔记',
});
const jobStates = defineMessages({ pending: '待发送', sending: '发送中', sent: '已发送', dead: '已终止', cancelled: '已取消' });
const actionLabel = (action: string) => t(actions[action as keyof typeof actions] ?? action);
const timeText = (seconds: number) => new Date(seconds * 1000).toLocaleString(currentLocale(), { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });

type SortHeaderProps = { label: string; sorted: false | 'asc' | 'desc'; onToggle: () => void };

function SortHeader({ label, sorted, onToggle }: SortHeaderProps) {
  const icon = sorted === 'asc' ? <ArrowUp size={13} aria-hidden="true" /> : sorted === 'desc' ? <ArrowDown size={13} aria-hidden="true" /> : <ArrowUpDown size={13} aria-hidden="true" />;
  return <button type="button" onClick={onToggle} className="inline-flex items-center gap-1 hover:text-ink">
    {label}{icon}
  </button>;
}

const auditColumns = auditHelper.columns([
  auditHelper.display({
    id: 'id',
    header: ({ column }) => <SortHeader label="ID" sorted={column.getIsSorted()} onToggle={() => column.toggleSorting(column.getIsSorted() !== 'desc')} />,
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
    header: ({ column }) => <SortHeader label={t('时间')} sorted={column.getIsSorted()} onToggle={() => column.toggleSorting(column.getIsSorted() !== 'desc')} />,
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
      return <span className="text-muted">{item.last_error === 'EXPIRED' ? t('邮件已过期') : item.last_error ? t('发送失败') : '—'}</span>;
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
  const pages = Math.max(1, Math.ceil((audit.data?.total ?? 0) / query.page_size));
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
    <Tabs id="system-logs" label={t('日志类型')} value={tab} onChange={setTab} items={[{ id: 'audit', label: t('操作日志') }, { id: 'mail', label: t('邮件投递') }]} />
    <section role="tabpanel" id={`system-logs-panel-${tab}`} aria-labelledby={`system-logs-tab-${tab}`}>
      {tab === 'audit' ? <Card>
        <CardContent className="flex flex-col gap-4">
          <form className="flex flex-wrap items-center gap-2" onSubmit={event => { event.preventDefault(); filter({ search: searchRef.current }); }}>
            <SimpleSelect label={t('操作类型')} className="h-9 w-44" value={query.action}
              onChange={value => filter({ action: value })}
              options={[{ value: '', label: t('全部类型') }, ...(audit.data?.actions ?? []).map(action => ({ value: action, label: actionLabel(action) }))]} />
            <label className="flex h-9 min-w-44 flex-1 items-center gap-2 rounded-md border border-line bg-surface px-3 text-base text-muted shadow-tint focus-within:border-focus focus-within:ring-2 focus-within:ring-focus sm:max-w-sm">
              <Search size={15} aria-hidden="true" />
              <input aria-label={t('搜索操作日志')} placeholder={t('搜索操作者、目标、详情或 IP…')} maxLength={128} className="w-full min-w-0 bg-transparent text-ink outline-none placeholder:text-subtle"
                value={searchInput} onChange={event => setSearchInput(event.target.value)} />
              <button type="submit" aria-label={t('搜索')} className="text-muted transition-colors hover:text-ink"><ChevronRight size={15} /></button>
            </label>
            <div className="flex items-center gap-2">
              <Input type="date" aria-label={t('开始日期')} className="h-9 w-auto" value={startInput} max={endInput || undefined}
                onChange={event => { setStartInput(event.target.value); setDates(event.target.value, endInput); }} />
              <span className="text-xs text-muted">{t('至')}</span>
              <Input type="date" aria-label={t('结束日期')} className="h-9 w-auto" value={endInput} min={startInput || undefined}
                onChange={event => { setEndInput(event.target.value); setDates(startInput, event.target.value); }} />
            </div>
            <Button variant="ghost" size="icon" aria-label={t('清除筛选')} onClick={resetFilters}><RotateCcw size={14} /></Button>
            <Button pending={exported.isPending} disabled={audit.isPending || !audit.data?.total}>
              <Download size={15} />{exported.isPending ? t('导出中…') : t('导出')}
            </Button>
          </form>
          {audit.isError && <div role="alert" className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-danger-line bg-danger-soft px-3 py-2 text-sm text-danger">
            <span>{t(audit.error.message)}</span>
            <Button variant="secondary" size="sm" onClick={() => void audit.refetch()}>{t('重试')}</Button>
          </div>}
          <div className="rounded-lg border border-line" aria-busy={audit.isFetching}>
            <Table>
              <TableHeader>
                {auditTable.getHeaderGroups().map(group => <TableRow key={group.id} className="hover:bg-transparent">
                  {group.headers.map(header => (
                    <TableHead key={header.id}
                      aria-sort={header.column.getIsSorted() ? (header.column.getIsSorted() === 'asc' ? 'ascending' : 'descending') : undefined}>
                      {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                    </TableHead>
                  ))}
                </TableRow>)}
              </TableHeader>
              <TableBody>
                {audit.isPending
                  ? <TableEmpty colSpan={AUDIT_COLUMNS}>{t('正在读取日志…')}</TableEmpty>
                  : auditTable.getRowModel().rows.map(row => <TableRow key={row.id}>
                      {row.getAllCells().map(cell => <TableCell key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>)}
                    </TableRow>)}
                {!audit.isPending && !audit.data?.items.length && <TableEmpty colSpan={AUDIT_COLUMNS}>
                  <span className="flex flex-col items-center gap-1.5 py-2">
                    <ScrollText size={24} className="text-subtle" aria-hidden="true" />
                    <strong className="text-sm text-ink">{t('没有匹配的操作记录')}</strong>
                    <span className="text-xs text-muted">{t('试试其他类型、关键词或日期范围。')}</span>
                  </span>
                </TableEmpty>}
              </TableBody>
            </Table>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted">
            <span>{t('共 {{v0}} 条操作记录', { v0: audit.data?.total ?? 0 })}</span>
            <div className="flex flex-wrap items-center gap-2">
              <SimpleSelect label={t('每页条数')} className="h-8 w-28" value={String(query.page_size)}
                onChange={value => filter({ page_size: Number(value) })}
                options={PAGE_SIZES.map(size => ({ value: String(size), label: t('每页 {{v0}} 条', { v0: size }) }))} />
              <Button variant="ghost" size="icon" aria-label={t('上一页')} disabled={query.page === 1 || audit.isFetching}
                onClick={() => setQuery(current => ({ ...current, page: current.page - 1 }))}><ChevronLeft size={15} aria-hidden="true" /></Button>
              <span>{query.page} / {pages}</span>
              <Button variant="ghost" size="icon" aria-label={t('下一页')} disabled={query.page >= pages || audit.isFetching}
                onClick={() => setQuery(current => ({ ...current, page: current.page + 1 }))}><ChevronRight size={15} aria-hidden="true" /></Button>
            </div>
          </div>
        </CardContent>
      </Card>
        : <Card>
          <CardContent className="flex flex-col gap-4">
            <div>
              <h2 className="text-md font-semibold text-ink">{t('邮件投递记录')}</h2>
              <p className="mt-0.5 text-xs text-muted">{t('最近 30 个任务；失败自动重试，最多 5 次')}</p>
            </div>
            {mail.isError && <div role="alert" className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-danger-line bg-danger-soft px-3 py-2 text-sm text-danger">
              <span>{t(mail.error.message)}</span>
              <Button variant="secondary" size="sm" onClick={() => void mail.refetch()}>{t('重试')}</Button>
            </div>}
            <div className="rounded-lg border border-line">
              <Table>
                <TableHeader>
                  {mailTable.getHeaderGroups().map(group => <TableRow key={group.id} className="hover:bg-transparent">
                    {group.headers.map(header => <TableHead key={header.id}>{header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}</TableHead>)}
                  </TableRow>)}
                </TableHeader>
                <TableBody>
                  {mail.isPending
                    ? <TableEmpty colSpan={MAIL_COLUMNS}>{t('正在读取日志…')}</TableEmpty>
                    : mailTable.getRowModel().rows.map(row => <TableRow key={row.id}>
                        {row.getAllCells().map(cell => <TableCell key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>)}
                      </TableRow>)}
                  {!mail.isPending && !mail.data?.items.length && <TableEmpty colSpan={MAIL_COLUMNS}>{t('暂无邮件任务')}</TableEmpty>}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>}
    </section>
  </div>;
}

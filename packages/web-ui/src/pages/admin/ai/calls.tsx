// Author: yunnuo <ymz@ebox.vip>
// Description: MCP call history: content-free metadata with actor, credential and outcome projections.
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ScrollText } from 'lucide-react';
import type { McpCall } from '@unicore/sdk';
import { Badge, Button, Card, CardContent, Input, Modal, PageHeader, SimpleSelect, Table, TableBody, TableCell, TableEmpty, TableHead, TableHeader, TableRow, selectOptions } from '@unicore/ui';
import { currentLocale, t, useI18n, useLocale } from '../../../i18n';
import { DataTableEmpty } from '../../../components/data-table';
import type { PageProps } from '../../../router';

const COLUMN_COUNT = 7;
const PAGE_SIZE = 50;
const statuses = ['succeeded', 'failed', 'denied', 'rate_limited', 'cancelled', 'timed_out', 'input_invalid', 'internal_error'] as const;

const timeText = (seconds: number) => seconds
  ? new Date(seconds * 1000).toLocaleString(currentLocale(), { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
  : '—';

function StatusBadge({ call }: { call: McpCall }) {
  const { t } = useI18n();
  const labels: Record<string, { text: string; variant: 'success' | 'danger' | 'warning' | 'subtle' }> = {
    succeeded: { text: t('成功'), variant: 'success' },
    failed: { text: t('失败'), variant: 'danger' },
    denied: { text: t('已拒绝'), variant: 'warning' },
    rate_limited: { text: t('限流'), variant: 'warning' },
    cancelled: { text: t('已取消'), variant: 'subtle' },
    timed_out: { text: t('超时'), variant: 'warning' },
    input_invalid: { text: t('参数无效'), variant: 'subtle' },
    internal_error: { text: t('服务错误'), variant: 'danger' },
  };
  const view = labels[call.status] ?? { text: call.status, variant: 'subtle' as const };
  return <Badge variant={view.variant} title={call.error_code || undefined}>{view.text}</Badge>;
}

export function AdminAiCallsPage({ client }: PageProps) {
  useLocale();
  const web = client.web!;
  const [filters, setFilters] = useState({ name: '', status: '', actor_id: '' });
  const [page, setPage] = useState(1);
  const [detail, setDetail] = useState<McpCall | null>(null);
  const list = useQuery({
    queryKey: ['mcp-calls', filters, page],
    queryFn: () => web.listMcpCalls!({ page, page_size: PAGE_SIZE, name: filters.name || undefined, status: filters.status || undefined, actor_id: filters.actor_id || undefined }),
  });
  const items = list.data?.items ?? [];
  const total = list.data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const rowDetail = (call: McpCall) => [
    { label: t('凭证'), value: call.credential_name || (call.credential_deleted ? t('已删除') : '—') },
    { label: t('角色'), value: call.role_id || '—' },
    { label: t('认证方式'), value: call.auth_method },
    { label: t('协议版本'), value: call.protocol_version || '—' },
    { label: t('客户端自报'), value: call.client_name ? `${call.client_name} ${call.client_version}` : '—' },
    { label: t('能力版本'), value: call.capability_version || '—' },
    { label: t('策略修订'), value: String(call.policy_revision) },
    { label: t('错误码'), value: call.error_code || '—' },
    { label: t('追踪 ID'), value: call.request_id },
  ];
  return <div className="flex min-w-0 flex-col gap-6">
    <PageHeader title={t('调用记录')} description={t('仅记录调用元数据；原始参数、结果与令牌不入库，客户端自报信息仅供参考。')} />
    <Card><CardContent className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="w-44"><Input label={t('按能力筛选')} value={filters.name} maxLength={128} onChange={event => { setFilters(current => ({ ...current, name: event.target.value })); setPage(1); }} /></div>
        <div className="w-40"><label className="flex flex-col gap-1.5 text-sm font-medium"><span>{t('按状态筛选')}</span>
          <SimpleSelect value={filters.status} onChange={value => { setFilters(current => ({ ...current, status: value })); setPage(1); }} className="max-w-full" aria-label={t('按状态筛选')}
            options={selectOptions(<>{<option value="">{t('全部状态')}</option>}{statuses.map(status => <option key={status} value={status}>{status === 'succeeded' ? t('成功') : status === 'failed' ? t('失败') : status === 'denied' ? t('已拒绝') : status === 'rate_limited' ? t('限流') : status === 'cancelled' ? t('已取消') : status === 'timed_out' ? t('超时') : status === 'input_invalid' ? t('参数无效') : t('服务错误')}</option>)}</>)} />
        </label></div>
        <span className="ms-auto text-xs text-muted">{t('{{count}} 条记录', { count: total })}</span>
      </div>
      <div className="min-w-0 overflow-x-auto rounded-lg border border-line" aria-busy={list.isFetching}>
        <Table className="min-w-[900px]">
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>{t('开始时间')}</TableHead>
              <TableHead>{t('操作者')}</TableHead>
              <TableHead>{t('凭证')}</TableHead>
              <TableHead>{t('能力')}</TableHead>
              <TableHead>{t('耗时')}</TableHead>
              <TableHead>{t('状态')}</TableHead>
              <TableHead>{t('详情')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {!items.length && <TableEmpty colSpan={COLUMN_COUNT}>
              <DataTableEmpty icon={ScrollText} title={t('暂无调用记录')} hint={t('外部客户端通过 /mcp 调用能力后，元数据会出现在这里。')} />
            </TableEmpty>}
            {items.map(call => <TableRow key={call.request_id}>
              <TableCell><time className="whitespace-nowrap text-muted">{timeText(call.started_at)}</time></TableCell>
              <TableCell><span className="font-medium text-ink">{call.actor_name || call.actor_id}</span></TableCell>
              <TableCell><span className="text-muted">{call.credential_name || (call.credential_deleted ? t('已删除') : '—')}</span></TableCell>
              <TableCell><code className="font-mono text-xs text-muted">{call.name}</code></TableCell>
              <TableCell><span className="tabular-nums text-muted">{call.duration_ms} ms</span></TableCell>
              <TableCell><StatusBadge call={call} /></TableCell>
              <TableCell><Button variant="link" size="sm" className="h-auto p-0" onClick={() => setDetail(call)}>{t('详情')}</Button></TableCell>
            </TableRow>)}
          </TableBody>
        </Table>
      </div>
      {pages > 1 && <div className="flex items-center justify-end gap-2 text-sm">
        <Button type="button" variant="secondary" size="sm" disabled={page <= 1} onClick={() => setPage(current => current - 1)}>{t('上一页')}</Button>
        <span className="text-xs text-muted">{page} / {pages}</span>
        <Button type="button" variant="secondary" size="sm" disabled={page >= pages} onClick={() => setPage(current => current + 1)}>{t('下一页')}</Button>
      </div>}
    </CardContent></Card>
    {detail && <Modal title={t('调用详情')} onClose={() => setDetail(null)}>
      <div className="flex flex-col gap-3 text-sm">
        <p className="flex items-center gap-2"><StatusBadge call={detail} /><code className="font-mono text-xs text-muted">{detail.name}</code></p>
        <p className="text-muted">{timeText(detail.started_at)} · {detail.duration_ms} ms</p>
        <dl className="grid gap-2 text-xs leading-relaxed">
          {rowDetail(detail).map(row => <div key={row.label} className="flex gap-2">
            <dt className="w-20 shrink-0 text-muted">{row.label}</dt>
            <dd className="min-w-0 break-all font-mono">{row.value}</dd>
          </div>)}
        </dl>
        <p className="rounded-lg bg-surface-alt p-3 text-xs leading-relaxed text-muted">{t('操作者显示名与凭证名称为读取时的投影；原始参数与结果永不入库。')}</p>
      </div>
    </Modal>}
  </div>;
}

// Author: yunnuo <ymz@ebox.vip>
// Description: MCP capability directory: review fingerprints, open policies and the frozen P1 read-only phase gate.
import { useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createColumnHelper, createPaginatedRowModel, rowPaginationFeature, tableFeatures, useTable, type PaginationState, type TableOptions } from '@tanstack/react-table';
import { ChevronDown, ChevronRight, ListChecks, Lock, ShieldCheck, Wrench } from 'lucide-react';
import type { McpTool } from '@unicore/sdk';
import { Badge, Button, Card, CardContent, Input, Modal, PageHeader, SimpleSelect, Table, TableCell, TableRow, useMessage, selectOptions } from '@unicore/ui';
import { currentLocale, t, useI18n, useLocale } from '../../../i18n';
import { DataTable, DataTablePagination } from '../../../components/data-table';
import type { PageProps } from '../../../router';

const PAGE_SIZE = 50;
const states = ['unreviewed', 'disabled', 'open', 'needs_review', 'module_missing'] as const;

function StateBadge({ tool }: { tool: McpTool }) {
  const { t } = useI18n();
  const labels = {
    open: { text: t('已开放'), variant: 'success' as const },
    disabled: { text: t('未开放'), variant: 'subtle' as const },
    unreviewed: { text: t('未审查'), variant: 'subtle' as const },
    needs_review: { text: t('需要重新审查'), variant: 'warning' as const },
    module_missing: { text: t('模块未装配'), variant: 'subtle' as const },
  } as const;
  const view = labels[tool.state as keyof typeof labels] ?? { text: tool.state, variant: 'subtle' as const };
  return <Badge variant={view.variant}>{view.text}</Badge>;
}

function EffectBadge({ tool }: { tool: McpTool }) {
  const { t } = useI18n();
  if (tool.effect === 'read') return <Badge variant="subtle">{t('只读')}</Badge>;
  if (tool.effect === 'destructive') return <Badge variant="danger">{t('破坏性写')}</Badge>;
  return <Badge variant="warning">{t('写入')}</Badge>;
}

export function AdminAiToolsPage({ client }: PageProps) {
  useLocale();
  const message = useMessage();
  const cache = useQueryClient();
  const web = client.web!;
  const [filters, setFilters] = useState({ search: '', state: '', module: '' });
  const [page, setPage] = useState(1);
  const [detail, setDetail] = useState<McpTool | null>(null);
  const [expanded, setExpanded] = useState('');
  const list = useQuery({
    queryKey: ['mcp-tools', filters, page],
    queryFn: () => web.listMcpTools!({ page, page_size: PAGE_SIZE, search: filters.search || undefined, state: filters.state || undefined, module: filters.module || undefined }),
    placeholderData: keepPreviousData,
  });
  const policy = useMutation({
    mutationFn: ({ tool, enabled }: { tool: McpTool; enabled: boolean }) =>
      web.patchMcpToolPolicy!(tool.name, { expected_version: tool.policy.version, expected_fingerprint: tool.fingerprint, enabled }),
    onSuccess: (_data, vars) => {
      message.success(vars.enabled ? t('能力已开放') : t('能力已停用'));
      void cache.invalidateQueries({ queryKey: ['mcp-tools'] });
      void cache.invalidateQueries({ queryKey: ['mcp-config'] });
      setDetail(null);
    },
    onError: error => message.error(t(error.message)),
  });
  const title = (tool: McpTool) => currentLocale().startsWith('zh') ? tool.title_zh : tool.title_en;
  const items = list.data?.items ?? [];
  const total = list.data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const governable = (tool: McpTool) => tool.state !== 'module_missing';
  const features = tableFeatures({ rowPaginationFeature, paginatedRowModel: createPaginatedRowModel() });
  const helper = createColumnHelper<typeof features, McpTool>();
  const columns = helper.columns([
    helper.display({
      id: 'expanded', header: () => <span className="sr-only">{t('展开详情')}</span>,
      cell: info => <Button type="button" variant="ghost" size="icon" className="size-7" aria-label={t('展开详情 {{name}}', { name: info.row.original.name })}
        aria-expanded={expanded === info.row.original.name}
        onClick={() => setExpanded(current => current === info.row.original.name ? '' : info.row.original.name)}>
        {expanded === info.row.original.name ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
      </Button>,
    }),
    helper.display({ id: 'name', header: () => t('名称'), cell: info => <><strong className="font-medium text-ink">{title(info.row.original)}</strong><span className="ms-2 block font-mono text-xs text-muted">{info.row.original.name}</span></> }),
    helper.display({ id: 'module', header: () => t('模块'), cell: info => <span className="text-muted">{info.row.original.module}</span> }),
    helper.display({ id: 'version', header: () => t('版本'), cell: info => <code className="font-mono text-xs text-muted">{info.row.original.version}</code> }),
    helper.display({ id: 'effect', header: () => t('风险'), cell: info => <EffectBadge tool={info.row.original} /> }),
    helper.display({ id: 'state', header: () => t('开放状态'), cell: info => <StateBadge tool={info.row.original} /> }),
    helper.display({
      id: 'actions', header: () => t('操作'),
      cell: info => {
        const tool = info.row.original;
        return <div className="flex gap-1 whitespace-nowrap">
          {governable(tool) && tool.state !== 'open' && <Button variant="link" size="sm" className="h-auto p-0" disabled={policy.isPending}
            pending={policy.isPending && policy.variables?.tool.name === tool.name && policy.variables.enabled}
            onClick={() => policy.mutate({ tool, enabled: true })}><ShieldCheck size={13} />{t('开放')}</Button>}
          {governable(tool) && tool.state === 'open' && <Button variant="link" size="sm" className="h-auto p-0 text-danger" disabled={policy.isPending}
            pending={policy.isPending && policy.variables?.tool.name === tool.name && !policy.variables.enabled}
            onClick={() => policy.mutate({ tool, enabled: false })}><Lock size={13} />{t('停用')}</Button>}
          <Button variant="link" size="sm" className="h-auto p-0" onClick={() => setDetail(tool)}>{t('详情')}</Button>
        </div>;
      },
    }),
  ]);
  const pagination: PaginationState = { pageIndex: page - 1, pageSize: PAGE_SIZE };
  const table = useTable({
    features, columns, data: items, getRowId: row => row.name,
    manualPagination: true, pageCount: pages,
    state: { pagination },
    onPaginationChange: updater => {
      const next = typeof updater === 'function' ? updater(pagination) : updater;
      setPage(next.pageIndex + 1);
    },
  } as TableOptions<typeof features, McpTool>);
  return <div className="flex min-w-0 flex-col gap-6">
    <PageHeader title={t('工具目录')} description={t('能力由代码注册、指纹固定；开放前必须审查输入输出与权限绑定，新版本会要求重新审查。')} />
    <Card><CardContent className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="w-44"><Input label={t('按名称筛选')} value={filters.search} maxLength={96} onChange={event => { setFilters(current => ({ ...current, search: event.target.value })); setPage(1); }} /></div>
        <div className="w-44"><label className="flex flex-col gap-1.5 text-sm font-medium"><span>{t('按状态筛选')}</span>
          <SimpleSelect value={filters.state} onChange={value => { setFilters(current => ({ ...current, state: value })); setPage(1); }} className="max-w-full" aria-label={t('按状态筛选')}
            options={selectOptions(<>{<option value="">{t('全部状态')}</option>}{states.map(state => <option key={state} value={state}>{state === 'open' ? t('已开放') : state === 'disabled' ? t('未开放') : state === 'unreviewed' ? t('未审查') : state === 'needs_review' ? t('需要重新审查') : t('模块未装配')}</option>)}</>)} />
        </label></div>
        <span className="ms-auto text-xs text-muted">{t('{{count}} 个能力', { count: total })}</span>
      </div>
      <DataTable table={table} pending={list.isPending} busy={list.isFetching || policy.isPending}
        error={list.isError ? { message: list.error.message } : null} onRetry={() => void list.refetch()}
        empty={{ icon: Wrench, title: t('暂无能力'), hint: t('已装配模块通过代码注册能力后，会出现在这里等待审查。') }}
        afterRow={row => {
          const tool = row.original;
          if (expanded !== tool.name) return null;
          return <TableRow className="hover:bg-transparent border-t-0">
            <TableCell colSpan={7} className="bg-surface-alt">
              <div className="flex max-w-4xl flex-col gap-2 py-1 text-sm">
                <p className="text-muted">{title(tool)}</p>
                <p className="text-xs leading-relaxed text-muted">{t('权限绑定')}: <code className="font-mono">{tool.operation_ids.join(', ')}</code></p>
                <p className="text-xs leading-relaxed text-muted">{t('变更指纹')}: <code className="break-all font-mono">{tool.fingerprint}</code></p>
                {tool.state === 'needs_review' && <p className="text-xs leading-relaxed text-warning">{t('定义在开放后发生过变化，外部调用已自动关闭；确认无误后重新开放。')}</p>}
              </div>
            </TableCell>
          </TableRow>;
        }}
        className="min-w-[880px]" />
      <DataTablePagination page={page} pageSize={PAGE_SIZE} total={total}
        onPageChange={next => setPage(next)} disabled={list.isFetching} />
    </CardContent></Card>
    {detail && <Modal title={t('能力详情')} onClose={() => setDetail(null)}>
      <div className="flex flex-col gap-3 text-sm">
        <p><strong className="font-medium">{title(detail)}</strong> <code className="ms-2 font-mono text-xs text-muted">{detail.name}</code></p>
        <p className="flex gap-2"><EffectBadge tool={detail} /><StateBadge tool={detail} /></p>
        <p className="leading-relaxed text-muted">{t('中文说明')}: {detail.description_zh}</p>
        <p className="leading-relaxed text-muted">{t('英文说明')}: {detail.description_en}</p>
        <p className="text-xs leading-relaxed text-muted">{t('权限绑定')}: <code className="font-mono">{detail.operation_ids.join(', ')}</code></p>
        <p className="text-xs leading-relaxed text-muted">{t('实现版本')}: <code className="font-mono">{detail.impl_version}</code> · {t('变更指纹')}: <code className="break-all font-mono">{detail.fingerprint}</code></p>
        {detail.effect !== 'read' && <p className="flex items-start gap-2 rounded-lg bg-surface-alt p-3 text-xs leading-relaxed text-muted"><ListChecks size={15} className="shrink-0" aria-hidden="true" />{t('该能力声明了写入或破坏性影响，当前阶段仅登记不执行。')}</p>}
      </div>
    </Modal>}
  </div>;
}

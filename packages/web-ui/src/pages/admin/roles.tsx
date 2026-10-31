// Author: yunnuo <ymz@ebox.vip>
// Description: Read-only role cards and the fixed administrator/member permission matrix on TanStack Table.
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { createColumnHelper, flexRender, tableFeatures, useTable } from '@tanstack/react-table';
import { CheckCircle2, RotateCcw, ShieldCheck } from 'lucide-react';
import type { RoleList, WebClient } from '@unicore/sdk';
import { defineMessages, t, useLocale } from '../../i18n';
import { Badge, Button, Card, CardContent, Table, TableBody, TableCell, TableEmpty, TableHead, TableHeader, TableRow } from '../../ui';
import type { PageProps } from '../../router';

const features = tableFeatures({});
const helper = createColumnHelper<typeof features, MatrixRow>();
const EMPTY_MATRIX: MatrixRow[] = [];
const COLUMN_COUNT = 3;
const roleNames = defineMessages({ super_admin: '管理员', user: '普通用户' });

type MatrixRow = { id: string; capability: string; note?: string; admin: 'allowed' | 'allowed-icon' | 'denied'; user: 'allowed' | 'allowed-icon' | 'denied' };

function grantCell(value: MatrixRow['admin']) {
  if (value === 'allowed') return <span className="text-muted">{t('允许')}</span>;
  if (value === 'allowed-icon') return <CheckCircle2 size={16} className="text-success" aria-label={t('允许')} aria-hidden="true" />;
  return <span className="text-muted">{t('禁止')}</span>;
}

const columns = helper.columns([
  helper.accessor('capability', {
    header: () => t('能力'),
    cell: info => <span className="flex flex-col">
      <strong className="font-medium text-ink">{info.getValue()}</strong>
      {info.row.original.note && <small className="text-2xs text-subtle">{info.row.original.note}</small>}
    </span>,
  }),
  helper.display({ id: 'admin', header: () => t('管理员'), cell: info => grantCell(info.row.original.admin) }),
  helper.display({ id: 'user', header: () => t('普通用户'), cell: info => grantCell(info.row.original.user) }),
]);

export function AdminRolesPage({ client }: PageProps) {
  if (!client.web) return null;
  return <RolePanel web={client.web} />;
}

function RolePanel({ web }: { web: WebClient }) {
  useLocale();
  const query = useQuery<RoleList>({ queryKey: ['roles'], queryFn: () => web.roles() });
  const rows: MatrixRow[] = useMemo(() => query.data
    ? [
        { id: 'workspace', capability: t('工作空间、本人账号、本地外观'), admin: 'allowed', user: 'allowed' },
        ...query.data.permissions.map(permission => ({
          id: permission.id, capability: t(permission.name), note: permission.id, admin: 'allowed-icon', user: 'denied',
        } as MatrixRow)),
      ]
    : EMPTY_MATRIX, [query.data]);
  const table = useTable({ features, columns, data: rows, getRowId: row => row.id });
  return <Card>
    <CardContent className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-md font-semibold text-ink">{t('角色权限')}</h2>
          <p className="mt-0.5 text-xs text-muted">{t('管理员与普通用户两种固定角色，权限由服务端统一校验')}</p>
        </div>
        <Badge>{t('固定角色')}</Badge>
      </div>
      {query.isPending && <p role="status" className="py-6 text-center text-sm text-muted">{t('正在加载角色…')}</p>}
      {query.isError && <div role="alert" className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-danger-line bg-danger-soft px-3 py-2 text-sm text-danger">
        <span>{t(query.error.message)}</span>
        <Button variant="secondary" size="sm" onClick={() => void query.refetch()}><RotateCcw size={13} />{t('重新加载')}</Button>
      </div>}
      {query.data && <>
        <div className="grid gap-3 sm:grid-cols-2">
          {query.data.items.map(role => <article key={role.id} className="role-card flex items-start gap-3 rounded-xl border border-line bg-surface-alt p-4">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-surface text-accent shadow-tint"><ShieldCheck size={20} aria-hidden="true" /></span>
            <div className="min-w-0">
              <strong className="block text-sm font-medium text-ink">{role.id === 'super_admin' ? t(roleNames.super_admin) : t(roleNames.user)}</strong>
              <small className="block text-2xs text-muted">{t('{{count}} 位用户', { count: role.user_count })}</small>
              <p className="mt-1 text-xs leading-relaxed text-muted">{role.id === 'super_admin' ? t('管理用户、全局设置和平台数据') : t('使用工作空间、管理本人账号和本地外观')}</p>
            </div>
          </article>)}
        </div>
        <div className="rounded-lg border border-line">
          <Table>
            <TableHeader>
              {table.getHeaderGroups().map(group => <TableRow key={group.id} className="hover:bg-transparent">
                {group.headers.map(header => <TableHead key={header.id}>{header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}</TableHead>)}
              </TableRow>)}
            </TableHeader>
            <TableBody>
              {table.getRowModel().rows.map(row => <TableRow key={row.id}>
                {row.getAllCells().map(cell => <TableCell key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>)}
              </TableRow>)}
            </TableBody>
          </Table>
          {!rows.length && <TableEmpty colSpan={COLUMN_COUNT}>{t('正在加载角色…')}</TableEmpty>}
        </div>
        <p className="text-xs leading-relaxed text-muted">{t('全局设置的菜单、页面与 API 仅管理员可访问；外观只影响当前客户端，不同步到服务器。')}</p>
      </>}
    </CardContent>
  </Card>;
}

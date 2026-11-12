// Author: yunnuo <ymz@ebox.vip>
// Description: Editable role console: member counts, data-scope column, guarded deletion and the tabbed grant editor.
import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createColumnHelper, flexRender, tableFeatures, useTable } from '@tanstack/react-table';
import { Copy, Pencil, Plus, RotateCcw, ShieldCheck, Trash2 } from 'lucide-react';
import type { Bootstrap, PermissionDefinition, Role, RoleList, WebClient } from '@unicore/sdk';
import { t, useLocale } from '../../i18n';
import { invalidateAfter } from '../../queries';
import { usePermissions } from '../../permissions';
import { Badge, Button, Card, CardContent, ConfirmDialog, PageHeader, Table, TableBody, TableCell, TableEmpty, TableHead, TableHeader, TableRow, useMessage } from '@unicore/ui';
import { RoleEditor, dataScopeText } from './role-editor';
import type { PageProps } from '../../router';

const features = tableFeatures({});
const helper = createColumnHelper<typeof features, Role>();
const EMPTY_ROLES: Role[] = [];
const EMPTY_PERMISSIONS: PermissionDefinition[] = [];
const COLUMN_COUNT = 6;

type EditorTarget = { mode: 'new' | 'edit' | 'copy'; role?: Role };

type RolesTableMeta = { canWrite: boolean; onEdit: (role: Role) => void; onCopy: (role: Role) => void; onRemove: (role: Role) => void };

const columns = helper.columns([
  helper.accessor('name', {
    header: () => t('名称'),
    cell: info => <strong className="font-medium text-ink">{info.getValue()}</strong>,
  }),
  helper.accessor('builtin', {
    header: () => t('类型'),
    cell: info => info.getValue() ? <Badge variant="primary">{t('内置')}</Badge> : <Badge variant="subtle">{t('自定义')}</Badge>,
  }),
  helper.accessor('permissions', {
    header: () => t('权限数'),
    cell: info => <span className="text-muted">{info.getValue().length}</span>,
  }),
  helper.accessor('data_scope', {
    header: () => t('数据范围'),
    cell: info => <Badge variant="subtle">{dataScopeText(info.row.original)}</Badge>,
  }),
  helper.accessor('user_count', {
    header: () => t('成员数'),
    cell: info => <span className="text-muted">{info.getValue()}</span>,
  }),
  helper.display({
    id: 'actions',
    header: () => t('操作'),
    cell: info => {
      const role = info.row.original;
      const meta = info.table.options.meta as RolesTableMeta;
      // super_admin is immutable server-side; the builtin user role cannot be deleted but can be duplicated.
      if (role.id === 'super_admin' || !meta.canWrite) return null;
      return <div className="flex items-center gap-1">
        <Button variant="ghost" size="icon" aria-label={t('编辑角色 {{name}}', { name: role.name })} onClick={() => meta.onEdit(role)}><Pencil size={14} /></Button>
        <Button variant="ghost" size="icon" aria-label={t('复制角色 {{name}}', { name: role.name })} onClick={() => meta.onCopy(role)}><Copy size={14} /></Button>
        {!role.builtin && <Button variant="ghost" size="icon" aria-label={t('删除角色 {{name}}', { name: role.name })} onClick={() => meta.onRemove(role)}><Trash2 size={14} /></Button>}
      </div>;
    },
  }),
]);

export function AdminRolesPage({ client, metadata }: PageProps) {
  if (!client.web) return null;
  return <RolePanel web={client.web} metadata={metadata} />;
}

function RolePanel({ web, metadata }: { web: WebClient; metadata: Bootstrap }) {
  useLocale();
  const message = useMessage();
  const cache = useQueryClient();
  const { has } = usePermissions(metadata);
  const canWrite = has('roles:write');
  const realm: Role['realm'] = 'user';
  const [editor, setEditor] = useState<EditorTarget | null>(null);
  const [removing, setRemoving] = useState<Role | null>(null);
  const list = useQuery<RoleList>({ queryKey: ['roles'], queryFn: () => web.roles() });
  const remove = useMutation({
    mutationFn: (role: Role) => web.deleteRole(role.id),
    onSuccess: (_data, role) => {
      message.success(t('角色已删除'));
      setRemoving(null);
      if (editor?.mode !== 'new' && editor?.role?.id === role.id) setEditor(null);
      void invalidateAfter(cache, 'roles');
    },
    onError: error => message.error(t(error.message)),
  });
  const roles = useMemo(() => list.data?.items ?? EMPTY_ROLES, [list.data]);
  const table = useTable({
    features,
    columns,
    data: roles,
    meta: {
      canWrite,
      onEdit: role => setEditor({ mode: 'edit', role }),
      // Copies open the create editor prefilled with the source's grants; the
      // strict create-time validation stays the single write path.
      onCopy: role => setEditor({ mode: 'copy', role }),
      onRemove: role => setRemoving(role),
    } satisfies RolesTableMeta,
    getRowId: role => role.id,
  });
  return <Card>
    <CardContent className="flex flex-col gap-4">
      <PageHeader title={t('角色权限')} description={t('为用户组合业务与管理权限；super_admin 由系统维护。')}
        actions={canWrite && <Button onClick={() => setEditor({ mode: 'new' })}><Plus size={15} />{t('新建角色')}</Button>} />

      {list.isError && <div role="alert" className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-danger-line bg-danger-soft px-3 py-2 text-sm text-danger">
        <span>{t(list.error.message)}</span>
        <Button variant="secondary" size="sm" onClick={() => void list.refetch()}><RotateCcw size={13} />{t('重试')}</Button>
      </div>}
      <div className="rounded-lg border border-line" aria-busy={list.isFetching}>
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map(group => <TableRow key={group.id} className="hover:bg-transparent">
              {group.headers.map(header => <TableHead key={header.id}>{header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}</TableHead>)}
            </TableRow>)}
          </TableHeader>
          <TableBody>
            {list.isPending
              ? <TableEmpty colSpan={COLUMN_COUNT}>{t('正在加载角色…')}</TableEmpty>
              : table.getRowModel().rows.length
                ? table.getRowModel().rows.map(row => <TableRow key={row.id}>
                    {row.getAllCells().map(cell => <TableCell key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>)}
                  </TableRow>)
                : <TableEmpty colSpan={COLUMN_COUNT}>
                    <span className="flex flex-col items-center gap-1.5 py-2">
                      <ShieldCheck size={24} className="text-subtle" aria-hidden="true" />
                      <strong className="text-sm text-ink">{t(list.isError ? list.error.message : '还没有自定义角色')}</strong>
                      <span className="text-xs text-muted">{t('新建角色，为不同用户组合业务权限。')}</span>
                    </span>
                  </TableEmpty>}
          </TableBody>
        </Table>
      </div>
      <p className="text-xs leading-relaxed text-muted">{t('角色可组合业务与管理权限；仅超级管理员权限保持保留。')}</p>
    </CardContent>
    {editor && <RoleEditor key={`${editor.mode}:${editor.role?.id ?? 'new'}`} web={web} realm={realm}
      role={editor.mode === 'edit' ? editor.role : undefined} source={editor.mode === 'copy' ? editor.role : undefined}
      permissions={list.data?.permissions ?? EMPTY_PERMISSIONS} onClose={() => setEditor(null)}
      onSaved={() => { setEditor(null); void invalidateAfter(cache, 'roles'); }} />}
    {removing && <ConfirmDialog danger title={t('删除角色')} description={t('确定删除角色「{{name}}」？该角色的 {{count}} 位成员将失去对应权限。', { name: removing.name, count: removing.user_count })}
      confirmLabel={t('确认删除')} cancelLabel={t('取消')} pending={remove.isPending}
      onConfirm={() => remove.mutate(removing)} onCancel={() => setRemoving(null)} />}
  </Card>;
}

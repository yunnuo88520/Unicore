// Author: yunnuo <ymz@ebox.vip>
// Description: Editable role console: list with member counts, grouped permission matrix editor and guarded deletion.
import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createColumnHelper, flexRender, tableFeatures, useTable } from '@tanstack/react-table';
import { Pencil, Plus, RotateCcw, ShieldCheck, Trash2 } from 'lucide-react';
import type { PermissionDefinition, Role, RoleList, RoleSaveInput, WebClient } from '@unicore/sdk';
import { t, useLocale } from '../../i18n';
import { invalidateAfter } from '../../queries';
import { Badge, Button, Card, CardContent, Checkbox, ConfirmDialog, Input, Modal, Table, TableBody, TableCell, TableEmpty, TableHead, TableHeader, TableRow, useMessage } from '@unicore/ui';
import type { PageProps } from '../../router';

const features = tableFeatures({});
const helper = createColumnHelper<typeof features, Role>();
const EMPTY_ROLES: Role[] = [];
const EMPTY_PERMISSIONS: PermissionDefinition[] = [];
const COLUMN_COUNT = 5;

type RolesTableMeta = { onEdit: (role: Role) => void; onRemove: (role: Role) => void };

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
  helper.accessor('user_count', {
    header: () => t('用户数'),
    cell: info => <span className="text-muted">{info.getValue()}</span>,
  }),
  helper.display({
    id: 'actions',
    header: () => t('操作'),
    cell: info => {
      const role = info.row.original;
      const meta = info.table.options.meta as RolesTableMeta;
      // super_admin is immutable server-side; the builtin user role cannot be deleted either.
      if (role.id === 'super_admin') return null;
      return <div className="flex items-center gap-1">
        <Button variant="ghost" size="icon" aria-label={t('编辑角色 {{name}}', { name: role.name })} onClick={() => meta.onEdit(role)}><Pencil size={14} /></Button>
        {!role.builtin && <Button variant="ghost" size="icon" aria-label={t('删除角色 {{name}}', { name: role.name })} onClick={() => meta.onRemove(role)}><Trash2 size={14} /></Button>}
      </div>;
    },
  }),
]);

export function AdminRolesPage({ client }: PageProps) {
  if (!client.web) return null;
  return <RolePanel web={client.web} />;
}

function RolePanel({ web }: { web: WebClient }) {
  useLocale();
  const message = useMessage();
  const cache = useQueryClient();
  const [editor, setEditor] = useState<Role | 'new' | null>(null);
  const [removing, setRemoving] = useState<Role | null>(null);
  const list = useQuery<RoleList>({ queryKey: ['roles'], queryFn: () => web.roles() });
  const remove = useMutation({
    mutationFn: (role: Role) => web.deleteRole(role.id),
    onSuccess: (_data, role) => {
      message.success(t('角色已删除'));
      setRemoving(null);
      if (editor !== 'new' && editor?.id === role.id) setEditor(null);
      void invalidateAfter(cache, 'roles');
    },
    onError: error => message.error(t(error.message)),
  });
  const roles = list.data?.items ?? EMPTY_ROLES;
  const table = useTable({
    features,
    columns,
    data: roles,
    meta: { onEdit: role => setEditor(role), onRemove: role => setRemoving(role) } satisfies RolesTableMeta,
    getRowId: role => role.id,
  });
  return <Card>
    <CardContent className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-md font-semibold text-ink">{t('角色权限')}</h2>
          <p className="mt-0.5 text-xs text-muted">{t('为普通用户组合可分配的业务权限；内置角色由系统维护。')}</p>
        </div>
        <Button onClick={() => setEditor('new')}><Plus size={15} />{t('新建角色')}</Button>
      </div>
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
      <p className="text-xs leading-relaxed text-muted">{t('标记「仅管理员」的权限点不会出现在矩阵中：自定义角色始终不能授予管理类权限，super_admin 拥有全部权限。')}</p>
    </CardContent>
    {editor && <RoleEditor key={editor === 'new' ? 'new' : editor.id} web={web} role={editor === 'new' ? undefined : editor}
      permissions={list.data?.permissions ?? EMPTY_PERMISSIONS} onClose={() => setEditor(null)}
      onSaved={() => { setEditor(null); void invalidateAfter(cache, 'roles'); }} />}
    {removing && <ConfirmDialog danger title={t('删除角色')} description={t('确定删除角色「{{name}}」？该角色的 {{count}} 位用户将失去对应权限。', { name: removing.name, count: removing.user_count })}
      confirmLabel={t('确认删除')} cancelLabel={t('取消')} pending={remove.isPending}
      onConfirm={() => remove.mutate(removing)} onCancel={() => setRemoving(null)} />}
  </Card>;
}

function RoleEditor({ web, role, permissions, onClose, onSaved }: {
  web: WebClient; role?: Role; permissions: PermissionDefinition[]; onClose: () => void; onSaved: () => void;
}) {
  useLocale();
  const message = useMessage();
  const [name, setName] = useState(role?.name ?? '');
  const [grants, setGrants] = useState<string[]>(role?.permissions ?? []);
  const [nameError, setNameError] = useState('');
  const groups = useMemo(() => {
    const result: { group: string; items: PermissionDefinition[] }[] = [];
    for (const permission of permissions) {
      const bucket = result.find(entry => entry.group === permission.group);
      if (bucket) bucket.items.push(permission);
      else result.push({ group: permission.group, items: [permission] });
    }
    return result;
  }, [permissions]);
  const save = useMutation({
    mutationFn: (input: RoleSaveInput) => (role ? web.updateRole(role.id, input) : web.createRole(input)),
    onSuccess: () => { message.success(t(role ? '角色已更新' : '角色已创建')); onSaved(); },
    onError: error => message.error(t(error.message)),
  });
  const pending = save.isPending;
  const toggle = (id: string, checked: boolean) => setGrants(current => checked ? [...current, id] : current.filter(value => value !== id));
  const submit = () => {
    const trimmed = name.trim();
    if (!trimmed) { setNameError(t('请输入角色名称')); return; }
    if (trimmed.length > 80) { setNameError(t('最多 {{count}} 个字符', { count: 80 })); return; }
    setNameError('');
    save.mutate({ name: trimmed, permissions: grants });
  };
  return <Modal title={t(role ? '编辑角色' : '新建角色')} onClose={onClose} pending={pending}>
    <form className="flex flex-col gap-4" onSubmit={event => { event.preventDefault(); submit(); }}>
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-ink">{t('角色名称')}</span>
        <Input required maxLength={80} autoComplete="off" value={name} aria-invalid={!!nameError}
          disabled={pending || !!role?.builtin} placeholder={t('例如 运营')}
          onChange={event => { setName(event.target.value); setNameError(''); }} />
        {role?.builtin && <small className="text-xs text-muted">{t('内置角色名称固定，仅可调整权限范围。')}</small>}
        {nameError && <p role="alert" className="text-xs text-danger">{nameError}</p>}
      </label>
      <fieldset disabled={pending} className="flex min-w-0 flex-col gap-1.5">
        <span className="text-sm font-medium text-ink">{t('权限点')}</span>
        <div className="flex max-h-72 flex-col gap-4 overflow-y-auto rounded-lg border border-line p-3" aria-label={t('权限点')}>
          {groups.map(group => <section key={group.group} className="flex flex-col gap-2">
            <h3 className="text-xs font-semibold text-muted">{t(group.group)}</h3>
            {group.items.map(permission => permission.assignable
              ? <label key={permission.id} className="flex items-start gap-2 text-sm">
                  <Checkbox className="mt-0.5" aria-label={t(permission.name)} checked={grants.includes(permission.id)}
                    onChange={checked => toggle(permission.id, checked)} />
                  <span className="flex min-w-0 flex-col">
                    <span className="font-medium text-ink">{t(permission.name)}</span>
                    <small className="text-2xs text-muted">{permission.description}</small>
                  </span>
                </label>
              : <div key={permission.id} className="flex items-start justify-between gap-2 rounded-md bg-surface-alt px-2 py-1.5 text-sm">
                  <span className="min-w-0">
                    <span className="block font-medium text-muted">{t(permission.name)}</span>
                    <small className="text-2xs text-subtle">{permission.description}</small>
                  </span>
                  <Badge variant="subtle">{t('仅管理员')}</Badge>
                </div>)}
          </section>)}
          {!groups.length && <p className="py-2 text-center text-xs text-muted">{t('权限目录加载中…')}</p>}
        </div>
      </fieldset>
      <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line pt-3">
        <Button variant="secondary" disabled={pending} onClick={onClose}>{t('取消')}</Button>
        <Button type="submit" pending={pending}>{pending ? t('处理中…') : t('保存')}</Button>
      </div>
    </form>
  </Modal>;
}

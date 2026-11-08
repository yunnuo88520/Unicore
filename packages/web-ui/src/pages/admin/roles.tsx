// Author: yunnuo <ymz@ebox.vip>
// Description: Editable role console per identity realm: realm tabs, member counts, permission matrix editor and guarded deletion.
import { useMemo, useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createColumnHelper, flexRender, tableFeatures, useTable } from '@tanstack/react-table';
import { Pencil, Plus, RotateCcw, ShieldCheck, Trash2 } from 'lucide-react';
import type { Bootstrap, PermissionDefinition, Role, RoleList, RoleSaveInput, WebClient } from '@unicore/sdk';
import { defineMessages, t, useLocale } from '../../i18n';
import { routes } from '../../routes';
import { sectionTitle } from '../../navigation';
import { buildDepartmentTree, flattenDepartmentTree, invalidateAfter, useDepartmentsQuery } from '../../queries';
import { operationPermissionsAllow, usePermissions } from '../../permissions';
import { Badge, Button, Card, CardContent, Checkbox, ConfirmDialog, Input, Modal, NativeSelect, Table, TableBody, TableCell, TableEmpty, TableHead, TableHeader, TableRow, useMessage } from '@unicore/ui';
import { OperationCatalogue } from './api-operations';
import type { PageProps } from '../../router';

const features = tableFeatures({});
const helper = createColumnHelper<typeof features, Role>();
const EMPTY_ROLES: Role[] = [];
const EMPTY_PERMISSIONS: PermissionDefinition[] = [];
const COLUMN_COUNT = 5;

// The server policy layer stays authoritative; this mirror only drives which
// points the matrix keeps out of custom administrator-realm roles. Menu and
// dictionary management are regular grants, not super_admin-exclusive ones.
const SUPER_ONLY_PERMISSIONS: ReadonlySet<string> = new Set(['roles:write', 'administrators:read', 'administrators:create', 'administrators:update', 'settings:write', 'updates:apply', 'storage:write']);

// User-realm custom roles hold assignable business grants only; administrator-
// realm custom roles hold every catalogue point except the super-only ones.
function lockedReason(_realm: Role['realm'], permission: PermissionDefinition): string | null {
 return SUPER_ONLY_PERMISSIONS.has(permission.id) ? t('仅超级管理员') : null;
}

// Data scopes gate the business lists (notes, files) per member; administrator
// roles stay self-scoped server-side, so the editor only exposes user realms.
const dataScopeLabels = defineMessages({ self: '仅本人', dept: '本部门', dept_and_below: '本部门及以下', custom: '自定义', all: '全部' });
const DATA_SCOPES = Object.keys(dataScopeLabels) as (keyof typeof dataScopeLabels)[];

// Same display fallback as the navigation projection: the node's own label
// first, then the registered page's route label, then the raw node id — so
// menu authorization rows stay locatable for unnamed nodes in tests and E2E.
function navigationLabel(node: { label: string; route_id?: string; id: string }): string {
  if (node.label) return t(node.label);
  const route = node.route_id && Object.hasOwn(routes, node.route_id) ? (routes as Record<string, { label?: string }>)[node.route_id] : undefined;
  return t(route?.label ?? node.id);
}

type RolesTableMeta = { canWrite: boolean; onEdit: (role: Role) => void; onRemove: (role: Role) => void };

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
    header: () => t('成员数'),
    cell: info => <span className="text-muted">{info.getValue()}</span>,
  }),
  helper.display({
    id: 'actions',
    header: () => t('操作'),
    cell: info => {
      const role = info.row.original;
      const meta = info.table.options.meta as RolesTableMeta;
      // super_admin is immutable server-side; the builtin user role cannot be deleted either.
      if (role.id === 'super_admin' || !meta.canWrite) return null;
      return <div className="flex items-center gap-1">
        <Button variant="ghost" size="icon" aria-label={t('编辑角色 {{name}}', { name: role.name })} onClick={() => meta.onEdit(role)}><Pencil size={14} /></Button>
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
  const roles = useMemo(() => list.data?.items ?? EMPTY_ROLES, [list.data]);
  const table = useTable({
    features,
    columns,
    data: roles,
    meta: { canWrite, onEdit: role => setEditor(role), onRemove: role => setRemoving(role) } satisfies RolesTableMeta,
    getRowId: role => role.id,
  });
  return <Card>
    <CardContent className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-md font-semibold text-ink">{t('角色权限')}</h2>
          <p className="mt-0.5 text-xs text-muted">{t('为用户组合业务与管理权限；super_admin 由系统维护。')}</p>
        </div>
        {canWrite && <Button onClick={() => setEditor('new')}><Plus size={15} />{t('新建角色')}</Button>}
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
      <p className="text-xs leading-relaxed text-muted">{t('角色可组合业务与管理权限；仅超级管理员权限保持保留。')}</p>
    </CardContent>
    {editor && <RoleEditor key={`${realm}-${editor === 'new' ? 'new' : editor.id}`} web={web} realm={realm} role={editor === 'new' ? undefined : editor}
      permissions={list.data?.permissions ?? EMPTY_PERMISSIONS} onClose={() => setEditor(null)}
      onSaved={() => { setEditor(null); void invalidateAfter(cache, 'roles'); }} />}
    {removing && <ConfirmDialog danger title={t('删除角色')} description={t('确定删除角色「{{name}}」？该角色的 {{count}} 位成员将失去对应权限。', { name: removing.name, count: removing.user_count })}
      confirmLabel={t('确认删除')} cancelLabel={t('取消')} pending={remove.isPending}
      onConfirm={() => remove.mutate(removing)} onCancel={() => setRemoving(null)} />}
  </Card>;
}

function RoleEditor({ web, realm, role, permissions, onClose, onSaved }: {
  web: WebClient; realm: Role['realm']; role?: Role; permissions: PermissionDefinition[]; onClose: () => void; onSaved: () => void;
}) {
  useLocale();
  const message = useMessage();
  const [name, setName] = useState(role?.name ?? '');
  const [grants, setGrants] = useState<string[]>(role?.permissions ?? []);
  const [nameError, setNameError] = useState('');
  const [dataScope, setDataScope] = useState<Role['data_scope']>(role?.data_scope ?? 'self');
  const [departmentIds, setDepartmentIds] = useState<string[]>(role?.department_ids ?? []);
  const [menuIds, setMenuIds] = useState<string[]>(role?.menu_ids ?? []);
  const [actionIds, setActionIds] = useState<string[]>(role?.action_ids ?? []);
  const [operationIds, setOperationIds] = useState<string[]>(role?.operation_ids ?? []);
  const navigation = useQuery({ queryKey: ['menu-config'], queryFn: () => web.menuConfig() });
  const sections = navigation.data?.sections ?? [];
  const nodes = navigation.data?.nodes ?? [];
  const toggleAuthorization = (current: string[], id: string, checked: boolean) => checked ? [...new Set([...current, id])] : current.filter(value => value !== id);
  const renderMenuTree = (sectionId: string, parentId?: string, trail: string[] = []): ReactNode => nodes
    .filter(node => node.section_id === sectionId && (node.parent_id || undefined) === parentId && node.type !== 'action' && !trail.includes(node.id))
    .sort((a, b) => a.sort - b.sort || a.id.localeCompare(b.id))
    .map(node => {
      const descendants = (id: string, seen = new Set<string>()): string[] => {
        if (seen.has(id)) return []; seen.add(id);
        return [id, ...nodes.filter(child => child.parent_id === id && child.type !== 'action').flatMap(child => descendants(child.id, seen))];
      };
      const ids = descendants(node.id);
      return <div key={node.id} className="flex flex-col gap-1 border-s border-line ps-3">
        <label className="flex items-center gap-2 text-sm"><Checkbox aria-label={navigationLabel(node)} disabled={pending || node.disabled}
          checked={ids.every(id => menuIds.includes(id))} onChange={checked => setMenuIds(current => checked ? [...new Set([...current, ...ids])] : current.filter(id => !ids.includes(id)))} />{navigationLabel(node)}</label>
        {renderMenuTree(sectionId, node.id, [...trail, node.id])}
      </div>;
    });
  const departments = useDepartmentsQuery(web, { enabled: dataScope === 'custom' });
  const departmentItems = flattenDepartmentTree(buildDepartmentTree(departments.data?.items ?? []));
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
  const toggleDepartment = (id: string, checked: boolean) => setDepartmentIds(current => checked ? [...current, id] : current.filter(value => value !== id));
  const submit = () => {
    const trimmed = name.trim();
    if (!trimmed) { setNameError(t('请输入角色名称')); return; }
    if (trimmed.length > 80) { setNameError(t('最多 {{count}} 个字符', { count: 80 })); return; }
    setNameError('');
    // Creates carry the tab-fixed realm; updates cannot move a role between realms.
    const validOperations = operationIds.filter(id => operationPermissionsAllow(grants, id));
    const validActions = actionIds.filter(id => nodes.some(node => node.id === id && node.permission && grants.includes(node.permission) && node.operation_ids.every(op => validOperations.includes(op))));
    const authorization = { menu_ids: menuIds, action_ids: validActions, operation_ids: validOperations };
    const input: RoleSaveInput = role ? { name: trimmed, permissions: grants, ...authorization } : { name: trimmed, permissions: grants, realm, ...authorization };
    {
      // Administrator roles stay self-scoped server-side; user roles carry the
      // chosen scope, and only the custom scope keeps a department selection.
      input.data_scope = dataScope;
      input.department_ids = dataScope === 'custom' ? departmentIds : [];
    }
    save.mutate(input);
  };
  return <Modal title={t(role ? '编辑角色' : '新建角色')} onClose={onClose} pending={pending}>
    <form className="flex flex-col gap-4" onSubmit={event => { event.preventDefault(); submit(); }}>
      {/* Guarded saves (403 PERMISSION_DENIED, version conflicts) render inside
        * the dialog: the modal marks outside toasts aria-hidden, so an inline
        * alert is the only reliably reachable feedback while editing. */}
      {save.error && <p role="alert" className="rounded-md border border-danger-line bg-danger-soft px-3 py-2 text-sm text-danger">{t(save.error.message)}</p>}
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-ink">{t('角色名称')}</span>
        <Input required maxLength={80} autoComplete="off" value={name} aria-invalid={!!nameError}
          disabled={pending || !!role?.builtin} placeholder={t('例如 运营')}
          onChange={event => { setName(event.target.value); setNameError(''); }} />
        {role?.builtin && <small className="text-xs text-muted">{t('内置角色名称固定，仅可调整权限范围。')}</small>}
        {nameError && <p role="alert" className="text-xs text-danger">{nameError}</p>}
      </label>
      <p className="text-xs text-muted">{t('未勾选表示不授权；菜单、按钮和 API 分别保存，业务权限始终作为访问上界。')}</p>
      <fieldset disabled={pending} className="flex min-w-0 flex-col gap-2 rounded-lg border border-line p-3">
        <legend className="px-1 font-medium">{t('菜单授权')}</legend>
        {navigation.isError && <p role="alert" className="text-sm text-danger">{t(navigation.error.message)} <Button variant="secondary" onClick={() => void navigation.refetch()}>{t('重试')}</Button></p>}
        {sections.map(section => {
          const label = `${t(section.surface === 'administrator' ? '管理端' : '用户端')} · ${t(sectionTitle(section))}`;
          return <section key={section.id} aria-label={label} className="flex flex-col gap-2"><h3 className="text-sm font-medium">{label}</h3>{renderMenuTree(section.id)}</section>;
        })}
        {!sections.length && <p className="text-xs text-muted">{navigation.isPending ? t('正在加载…') : t('没有可授权的菜单')}</p>}
      </fieldset>
      <fieldset disabled={pending} className="flex min-w-0 flex-col gap-2 rounded-lg border border-line p-3">
        <legend className="px-1 font-medium">{t('按钮授权')}</legend>
        {nodes.filter(node => node.type === 'action' && sections.some(section => section.id === node.section_id)).map(node => {
          const parent = nodes.find(item => item.id === node.parent_id);
          return <label key={node.id} className="flex items-start gap-2 text-sm">
            <Checkbox aria-label={navigationLabel(node)} disabled={node.disabled || (!actionIds.includes(node.id) && (!node.permission || !grants.includes(node.permission) || !node.operation_ids.every(op => operationIds.includes(op))))} checked={actionIds.includes(node.id)} onChange={checked => setActionIds(current => toggleAuthorization(current, node.id, checked))} />
            <span>{navigationLabel(node)}<small className="block text-muted">{parent ? navigationLabel(parent) : '—'} · {node.permission} · {node.operation_ids.join(', ')}</small></span>
          </label>;
        })}
      </fieldset>
      <fieldset disabled={pending} className="min-w-0 rounded-lg border border-line p-3">
        <legend className="px-1 font-medium">{t('API 授权')}</legend>
        <OperationCatalogue web={web} permissions={grants} selected={operationIds} onChange={setOperationIds} disabled={pending} />
      </fieldset>
      {<fieldset disabled={pending} className="flex min-w-0 flex-col gap-1.5">
        <span className="text-sm font-medium text-ink">{t('数据范围')}</span>
        <NativeSelect aria-label={t('数据范围')} value={dataScope} onChange={event => setDataScope(event.target.value as Role['data_scope'])}>
          {DATA_SCOPES.map(scope => <option key={scope} value={scope}>{t(dataScopeLabels[scope])}</option>)}
        </NativeSelect>
        <small className="text-xs text-muted">{t('数据范围决定角色成员在笔记、文件等业务列表中能看到的数据。')}</small>
        {dataScope === 'custom' && <div className="flex flex-col gap-1.5">
          <small className="text-xs text-muted">{t('勾选自定义范围包含的部门：')}</small>
          <div role="group" aria-label={t('自定义部门范围')} className="flex max-h-48 flex-col gap-1 overflow-y-auto rounded-lg border border-line p-3">
            {departmentItems.length
              ? departmentItems.map(({ department, depth }) => <label key={department.id} className="flex items-center gap-2 text-sm" style={{ paddingInlineStart: `${depth * 16}px` }}>
                  <Checkbox aria-label={department.name} checked={departmentIds.includes(department.id)}
                    onChange={checked => toggleDepartment(department.id, checked)} />
                  <span className="text-ink">{department.name}</span>
                </label>)
              : <p className="py-2 text-center text-xs text-muted">{t('部门目录加载中…')}</p>}
          </div>
        </div>}
      </fieldset>}
      <fieldset disabled={pending} className="flex min-w-0 flex-col gap-1.5">
        <span className="text-sm font-medium text-ink">{t('权限点')}</span>
        <div className="flex max-h-72 flex-col gap-4 overflow-y-auto rounded-lg border border-line p-3" aria-label={t('权限点')}>
          {groups.map(group => <section key={group.group} className="flex flex-col gap-2">
            <h3 className="text-xs font-semibold text-muted">{t(group.group)}</h3>
            {group.items.map(permission => {
              const locked = role?.id === 'user' && !permission.assignable ? t('仅业务权限') : lockedReason(realm, permission);
              return locked
                ? <div key={permission.id} className="flex items-start justify-between gap-2 rounded-md bg-surface-alt px-2 py-1.5 text-sm">
                    <span className="min-w-0">
                      <span className="block font-medium text-muted">{t(permission.name)}</span>
                      <small className="text-2xs text-subtle">{t(permission.description)}</small>
                    </span>
                    <Badge variant="subtle">{locked}</Badge>
                  </div>
                : <label key={permission.id} className="flex items-start gap-2 text-sm">
                    <Checkbox className="mt-0.5" aria-label={t(permission.name)} checked={grants.includes(permission.id)}
                      onChange={checked => toggle(permission.id, checked)} />
                    <span className="flex min-w-0 flex-col">
                      <span className="font-medium text-ink">{t(permission.name)}</span>
                      <small className="text-2xs text-muted">{t(permission.description)}</small>
                    </span>
                  </label>;
            })}
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

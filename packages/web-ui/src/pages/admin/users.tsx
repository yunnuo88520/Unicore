// Author: yunnuo <ymz@ebox.vip>
// Description: Separate administrator/member lists on TanStack Table with contract-validated creation and status toggling.
import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { columnVisibilityFeature, createColumnHelper, createPaginatedRowModel, flexRender, rowPaginationFeature, tableFeatures, useTable, type PaginationState } from '@tanstack/react-table';
import { RotateCcw, Settings2, UserPlus } from 'lucide-react';
import type { Bootstrap, User, UserCreate, WebClient } from '@unicore/sdk';
import { defineMessages, t, useLocale } from '../../i18n';
import { buildDepartmentTree, flattenDepartmentTree, invalidateAfter, useDepartmentsQuery, usePostsQuery } from '../../queries';
import { usePermissions } from '../../permissions';
import { roleDisplayLabels } from '../../role-display';
import { UserAvatar, displayLabel } from '../../user-avatar';
import { useColumnVisibility } from '../../column-visibility';
import { AppField, AppForm, useAppForm } from '@unicore/form';
import { Badge, Button, Card, CardContent, Checkbox, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger, Input, Modal, PageHeader, Table, TableBody, TableCell, TableEmpty, TableHead, TableHeader, TableRow, useMessage , NativeSelect} from '@unicore/ui';
import type { PageProps } from '../../router';

const features = tableFeatures({ rowPaginationFeature, columnVisibilityFeature, paginatedRowModel: createPaginatedRowModel() });
const helper = createColumnHelper<typeof features, User>();
const EMPTY_USERS: User[] = [];
const columnLabels = defineMessages({ username: '账号', email: '邮箱', phone: '手机号', role: '身份', department: '部门', post: '岗位', totp_enabled: '双因素认证', status: '状态' });
const COLUMN_KEYS = Object.keys(columnLabels) as (keyof typeof columnLabels)[];

type UsersTableMeta = { kind: string; pending: boolean; administrators?: boolean; currentUserId?: string; departmentNames: Map<string, string>; postNames: Map<string, string>; canToggle: boolean; onToggle?: (user: User) => void; onRole?: (user: User) => void; onResetPassword?: (user: User) => void };

type RoleOption = { id: string; name: string; assignable: boolean };

// RoleChipGroup renders the role selection as wrap-friendly bordered chips
// instead of a bare checkbox row: without spacing the checkboxes glued into
// one unreadable line inside the dialog. Each chip is a label wrapping the
// checkbox (the same pattern as the posts list below), the selection
// highlights with the shared badge tokens, and flex-wrap gap-2 keeps the
// group legible at any dialog width.
function RoleChipGroup({ options, selected, onToggle }: {
  options: RoleOption[]; selected: string[]; onToggle: (id: string, checked: boolean) => void;
}) {
  useLocale();
  return <div className="flex flex-wrap gap-2">
    {options.map(option => {
      const active = selected.includes(option.id);
      return <label key={option.id} data-role-chip={option.id}
        className={`flex w-max cursor-pointer items-center gap-2 rounded-lg border px-2.5 py-1.5 text-sm transition-colors ${active ? 'border-button bg-primary-soft' : 'border-line bg-surface hover:bg-surface-alt'} ${option.assignable ? '' : 'cursor-not-allowed opacity-55'}`}>
        <Checkbox aria-label={option.name} checked={active} disabled={!option.assignable} onChange={checked => onToggle(option.id, checked)} />
        <span className={active ? 'font-medium text-accent' : 'text-ink'}>{option.name}</span>
      </label>;
    })}
    {!options.length && <p className="py-1 text-center text-xs text-muted">{t('正在加载…')}</p>}
  </div>;
}

const columns = helper.columns([
  helper.accessor('username', {
    header: () => t('账号'),
    cell: info => {
      const meta = info.table.options.meta as UsersTableMeta;
      const user = info.row.original;
      // Nickname first with the raw account beneath it; the shared avatar
      // keeps an initial-letter circle for accounts without a profile image.
      const label = displayLabel(user.display_name, user.username) || user.username;
      return <span className="flex min-w-0 items-center gap-2">
        <UserAvatar name={label} className="size-7 text-2xs" />
        <span className="flex min-w-0 flex-col">
          <strong className="truncate font-medium text-ink">{label}</strong>
          {label !== user.username && <small className="truncate text-2xs text-subtle">{user.username}</small>}
        </span>
        {user.id === meta.currentUserId && <Badge>{t('当前账号')}</Badge>}
      </span>;
    },
  }),
  helper.accessor('email', { header: () => t('邮箱'), cell: info => <span className="text-muted">{info.getValue()}</span> }),
  helper.accessor('phone', { header: () => t('手机号'), cell: info => <span className="text-muted">{info.getValue() || '—'}</span> }),
  helper.display({
    id: 'role',
    header: () => t('身份'),
    // Catalogue names ride parallel to the role ids (role_names); the helper
    // localizes builtin ids and keeps super_admin's raw marker.
    cell: info => <span className="text-muted">{roleDisplayLabels(info.row.original.roles, info.row.original.role_names).join(', ')}</span>,
  }),
  helper.display({
    id: 'department',
    header: () => t('部门'),
    cell: info => {
      const departmentId = info.row.original.department_id;
      const name = departmentId ? (info.table.options.meta as UsersTableMeta).departmentNames.get(departmentId) : undefined;
      return <span className="text-muted">{name ?? '—'}</span>;
    },
  }),
  helper.display({
    id: 'post',
    header: () => t('岗位'),
    cell: info => {
      const ids = info.row.original.post_ids ?? [];
      const names = ids.map(id => (info.table.options.meta as UsersTableMeta).postNames.get(id)).filter(Boolean);
      return <span className="text-muted">{names.length ? names.join('、') : '—'}</span>;
    },
  }),
  helper.accessor('totp_enabled', { header: () => t('双因素认证'), cell: info => <Badge variant={info.getValue() ? 'success' : 'subtle'}>{info.getValue() ? t('已开启') : t('未开启')}</Badge> }),
  helper.accessor('status', {
    header: () => t('状态'),
    cell: info => {
      const status = info.row.original.status;
      return <Badge variant={status === 'active' ? 'success' : status === 'pending' ? 'warning' : 'subtle'}>
        {status === 'active' ? t('已启用') : status === 'pending' ? t('待验证') : t('已禁用')}
      </Badge>;
    },
  }),
  helper.display({
    id: 'actions',
    header: () => t('操作'),
    cell: info => {
      const user = info.row.original;
      const meta = info.table.options.meta as UsersTableMeta;
      return <div className="flex gap-2">
        {meta.canToggle && meta.onToggle && <Button variant="link" size="sm" className="h-auto p-0" disabled={meta.pending} onClick={() => meta.onToggle?.(user)}>
          {user.status === 'active' ? t('禁用') : t('启用')}
        </Button>}
        {meta.onRole && <Button variant="link" size="sm" className="h-auto p-0" disabled={meta.pending} onClick={() => meta.onRole?.(user)}>{t('编辑')}</Button>}
        {meta.onResetPassword && <Button variant="link" size="sm" className="h-auto p-0" disabled={meta.pending} onClick={() => meta.onResetPassword?.(user)}>{t('重置密码')}</Button>}
      </div>;
    },
  }),
]);

export function AdminUsersPage({ client, metadata }: PageProps) {
  if (!client.web) return null;
  return <UserListPanel web={client.web} metadata={metadata} administrators={false} />;
}

export function AdminAdministratorsPage({ client, metadata }: PageProps) {
  if (!client.web) return null;
  return <UserListPanel web={client.web} metadata={metadata} administrators />;
}

function UserListPanel({ web, metadata, administrators }: { web: WebClient; metadata: Bootstrap; administrators: boolean }) {
  useLocale();
  const message = useMessage();
  const cache = useQueryClient();
  const { has, can } = usePermissions(metadata);
  const kind = administrators ? t('管理员') : t('用户');
  const role = administrators ? 'super_admin' : 'user';
  // Every mutating button gates on its own point; readers without them keep a
  // fully usable list. Post assignment additionally needs the post catalogue.
  const canCreate = can(administrators ? 'createAdministrator' : 'createUser');
  const canUpdate = can(administrators ? 'updateAdministrator' : 'updateUser');
  const canPosts = !administrators && has('posts:read');
  const [search, setSearch] = useState('');
  const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: 20 });
  const [creating, setCreating] = useState(false);
  const [importing, setImporting] = useState(false);
  const [roleTargetID, setRoleTargetID] = useState<string | null>(null);
  const [resetTargetID, setResetTargetID] = useState<string | null>(null);
  const roleChange = useMutation({
    mutationFn: ({ id, role }: { id: string; role: string }) => (administrators ? web.updateAdministrator(id, { status: 'active', role }) : web.updateUser(id, { status: 'active', role })),
    onSuccess: () => {
      message.success(t('角色已更新'));
      setRoleTargetID(null);
      refresh();
    },
    onError: error => message.error(t(error.message)),
  });
  const list = useQuery({
    queryKey: [administrators ? 'administrators' : 'users', search, pagination],
    queryFn: () => (administrators ? web.administrators(search, pagination.pageIndex + 1) : web.users(search, pagination.pageIndex + 1)),
  });
  // Department names resolve from the shared tree query; administrators have no
  // membership so the lookup stays empty and the column renders placeholders.
  const departments = useDepartmentsQuery(web, { enabled: !administrators });
  const departmentNames = useMemo(
    () => new Map((departments.data?.items ?? []).map(department => [department.id, department.name])),
    [departments.data],
  );
  const posts = usePostsQuery(web, { enabled: canPosts });
  const postNames = useMemo(() => new Map((posts.data?.items ?? []).map(post => [post.id, post.name])), [posts.data]);
  // Derive the dialog target from the freshest list data so a reopened dialog
  // reflects the persisted assignment instead of the row snapshot at click time.
  const roleTarget = roleTargetID ? list.data?.items.find(user => user.id === roleTargetID) ?? null : null;
  const resetTarget = resetTargetID ? list.data?.items.find(user => user.id === resetTargetID) ?? null : null;
  const { columnVisibility, menu, toggle } = useColumnVisibility(administrators ? 'administrators' : 'users',
    COLUMN_KEYS.map(id => ({ id, label: t(columnLabels[id]) })));
  const refresh = () => {
    void cache.invalidateQueries({ queryKey: [administrators ? 'administrators' : 'users'] });
    void invalidateAfter(cache, 'users');
  };
  const update = useMutation({
    // Status toggles omit role: the core keeps the current assignment when the field is absent.
    mutationFn: ({ id, status }: { id: string; status: string }) => (administrators ? web.updateAdministrator(id, { status }) : web.updateUser(id, { status })),
    onSuccess: () => { message.success(t('{{v0}}状态已更新', { v0: kind })); refresh(); },
  });
  const table = useTable({
    features,
    columns,
    data: list.data?.items ?? EMPTY_USERS,
    meta: {
      kind,
      pending: update.isPending || roleChange.isPending,
      administrators,
      currentUserId: metadata.current_user?.id,
      departmentNames,
      postNames,
      canToggle: canUpdate,
      onToggle: canUpdate ? (user: User) => update.mutate({ id: user.id, status: user.status === 'active' ? 'disabled' : 'active' }) : undefined,
      onRole: canUpdate ? (user: User) => setRoleTargetID(user.id) : undefined,
      // The reset endpoint is contract-bound to /admin/users; the administrator
      // list keeps its existing actions.
      onResetPassword: !administrators && canUpdate ? (user: User) => setResetTargetID(user.id) : undefined,
    } satisfies UsersTableMeta,
    state: { pagination, columnVisibility },
    onPaginationChange: setPagination,
    manualPagination: true,
    pageCount: list.data ? Math.max(1, Math.ceil(list.data.total / list.data.page_size)) : 1,
  });
  return <Card>
    <CardContent className="flex flex-col gap-4">
      <PageHeader title={t('{{kind}}列表', { kind })} description={administrators ? t('管理后台账号及其启用状态') : t('统一账号可分配多个角色，按权限使用业务与管理工作台。')}
        actions={<>
          {!administrators && <>
            {can('exportUsers') && <SpreadsheetDownload label={t('导出用户')} filename="users.xlsx" load={() => web.exportUsers(search)} />}
            {can('userImportTemplate') && <SpreadsheetDownload label={t('下载导入模板')} filename="users-import-template.xlsx" load={() => web.usersImportTemplate()} />}
            {can('importUsers') && <Button variant="secondary" onClick={() => setImporting(true)}>{t('导入用户')}</Button>}
          </>}
          {canCreate && <Button onClick={() => setCreating(true)}><UserPlus size={15} />{t('新增{{kind}}', { kind })}</Button>}
        </>} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Input aria-label={t('搜索{{v0}}', { v0: kind })} placeholder={t('搜索')} maxLength={128} className="h-9 max-w-xs flex-1"
          value={search} onChange={event => { setSearch(event.target.value); setPagination(current => ({ ...current, pageIndex: 0 })); }} />
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted">{t('{{count}} 位{{kind}}', { count: list.data?.total ?? 0, kind })}</span>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" aria-label={t('列设置')}><Settings2 size={15} /></Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-40">
              <DropdownMenuLabel>{t('显示列')}</DropdownMenuLabel>
              {menu.map(column => <DropdownMenuItem key={column.id} onSelect={event => event.preventDefault()}>
                <Checkbox checked={column.visible} onChange={value => toggle(column.id, value)} aria-label={column.label}>{column.label}</Checkbox>
              </DropdownMenuItem>)}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
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
              ? <TableEmpty colSpan={table.getVisibleLeafColumns().length}>{t('正在加载…')}</TableEmpty>
              : table.getRowModel().rows.length
                ? table.getRowModel().rows.map(row => <TableRow key={row.id}>
                    {row.getVisibleCells().map(cell => <TableCell key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>)}
                  </TableRow>)
                : <TableEmpty colSpan={table.getVisibleLeafColumns().length}>{list.isError ? t(list.error.message) : t('没有匹配的{{kind}}', { kind })}</TableEmpty>}
          </TableBody>
        </Table>
      </div>
      <div className="flex items-center justify-between gap-3 text-xs text-muted">
        <Button variant="secondary" size="sm" disabled={!table.getCanPreviousPage()} onClick={() => table.previousPage()}>{t('上一页')}</Button>
        <span>{t('第 {{page}} 页', { page: pagination.pageIndex + 1 })}</span>
        <Button variant="secondary" size="sm" disabled={!table.getCanNextPage() || list.isFetching} onClick={() => table.nextPage()}>{t('下一页')}</Button>
      </div>
    </CardContent>
    {importing && <UserImportDialog web={web} onClose={() => setImporting(false)} onImported={refresh} />}
    {creating && <UserCreateDialog web={web} kind={kind} role={role} administrators={administrators} postsEnabled={canPosts} onClose={() => setCreating(false)} onCreated={refresh} />}
    {roleTarget && <UserRoleDialog web={web} administrators={administrators} user={roleTarget} postsEnabled={canPosts} onClose={() => setRoleTargetID(null)} onSaved={refresh} />}
    {resetTarget && <PasswordResetDialog web={web} user={resetTarget} onClose={() => setResetTargetID(null)} onSaved={refresh} />}
  </Card>;
}

function UserCreateDialog({ web, kind, role, administrators, postsEnabled, onClose, onCreated }: {
  web: WebClient; kind: string; role: string; administrators: boolean; postsEnabled: boolean; onClose: () => void; onCreated: () => void;
}) {
  useLocale();
  const message = useMessage();
  // Administrator creation draws from the admin-options catalogue (super_admin
  // plus self-built administrator roles, defaulting to super_admin); user
  // creation keeps the user-realm options. Two keyed queries keep the cached
  // shapes separate instead of one union-typed entry.
  const adminOptions = useQuery({ queryKey: ['admin-role-options'], queryFn: () => web.adminRoleOptions(), enabled: administrators });
  const userOptions = useQuery({ queryKey: ['role-options'], queryFn: () => web.roleOptions(), enabled: !administrators });
  const options = administrators ? adminOptions : userOptions;
  const departmentOptions = useDepartmentOptions(web, !administrators);
  const posts = usePostsQuery(web, { enabled: postsEnabled });
  const [postIds, setPostIds] = useState<string[]>([]);
  const [roleIds, setRoleIds] = useState<string[]>([role]);
  const form = useAppForm<UserCreate>({
    // The relaxed contract lets the administrator realm carry a non-super role id.
    schema: 'UserCreate',
    defaultValues: { username: '', email: '', password: '', display_name: '', role, department_id: '' },
    onSubmit: async values => {
      try {
        if (administrators) await web.createAdministrator({ username: values.username, email: values.email, password: values.password, role: '', role_ids: roleIds });
        else await web.createUser({ ...values, role: '', role_ids: roleIds, department_id: values.department_id || undefined, ...(postIds.length ? { post_ids: postIds } : {}) });
        message.success(t('{{v0}}已创建', { v0: kind }));
        onClose();
        onCreated();
      } catch (error) {
        form.applyServerError(error);
      }
    },
  });
  return <Modal title={t('新增{{v0}}', { v0: kind })} onClose={onClose} pending={form.formState.isSubmitting}>
    <AppForm form={form} className="flex flex-col gap-3">
      <AppField name="username" label={t('账号')}><Input required minLength={3} maxLength={64} autoComplete="off" /></AppField>
      <AppField name="display_name" label={t('昵称')} hint={t('选填；留空时各处显示直接使用账号。')}>
        <Input maxLength={80} autoComplete="nickname" />
      </AppField>
      <AppField name="email" label={t('邮箱')}><Input required type="email" maxLength={254} /></AppField>
      <AppField name="password" label={t('初始密码')}><Input required type="password" minLength={12} maxLength={128} autoComplete="new-password" /></AppField>
      <fieldset><legend>{t('角色')}</legend><RoleChipGroup options={options.data?.items ?? []} selected={roleIds}
        onToggle={(id, checked) => setRoleIds(ids => checked ? [...ids, id] : ids.filter(value => value !== id))} /></fieldset>
      {!administrators && <AppField name="department_id" label={t('部门')} hint={t('留空表示暂不分配部门。')}>
        <NativeSelect aria-label={t('部门')} disabled={departmentOptions.isLoading}>
          <option value="">{t('未分配')}</option>
          {departmentOptions.items.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}
        </NativeSelect>
      </AppField>}
      {!administrators && postsEnabled && <fieldset className="flex min-w-0 flex-col gap-1.5">
        <span className="text-sm font-medium text-ink">{t('岗位')}</span>
        <div role="group" aria-label={t('岗位')} className="flex max-h-40 flex-col gap-1 overflow-y-auto rounded-lg border border-line p-3">
          {(posts.data?.items ?? []).filter(post => post.enabled).map(post => <label key={post.id} className="flex items-center gap-2 text-sm">
            <Checkbox aria-label={post.name} checked={postIds.includes(post.id)} onChange={checked => setPostIds(current => checked ? [...current, post.id] : current.filter(id => id !== post.id))} />
            <span className="text-ink">{post.name}</span>
          </label>)}
          {!posts.data?.items.length && <p className="py-1 text-center text-xs text-muted">{posts.isLoading ? t('正在加载…') : t('暂无岗位')}</p>}
        </div>
      </fieldset>}
      <p className="text-xs leading-relaxed text-muted">
        {administrators ? t('使用当前后台入口登录。') : t('创建后即可从 /login 使用初始密码登录，无需邮件验证。')}
        {t('密码至少 12 位。')}
      </p>
      <div className="flex justify-end gap-2">
        <Button variant="secondary" disabled={form.formState.isSubmitting} onClick={onClose}>{t('取消')}</Button>
        <Button type="submit" disabled={!roleIds.length || options.isLoading} pending={form.formState.isSubmitting}>{form.formState.isSubmitting ? t('正在创建…') : t('创建{{v0}}', { v0: kind })}</Button>
      </div>
    </AppForm>
  </Modal>;
}

function UserRoleDialog({ web, administrators, user, postsEnabled, onClose, onSaved }: {
  web: WebClient; administrators: boolean; user: User; postsEnabled: boolean; onClose: () => void; onSaved: () => void;
}) {
  useLocale();
  const message = useMessage();
  const current = user.roles[0] ?? '';
  const currentDepartment = user.department_id ?? '';
  // Administrators pick from the admin-options catalogue (super_admin plus
  // self-built administrator roles); the server still protects the last
  // enabled super admin on downgrade. Two keyed queries keep the cached
  // shapes separate instead of one union-typed entry.
  const adminOptions = useQuery({ queryKey: ['admin-role-options'], queryFn: () => web.adminRoleOptions(), enabled: administrators });
  const userOptions = useQuery({ queryKey: ['role-options'], queryFn: () => web.roleOptions(), enabled: !administrators });
  const options = administrators ? adminOptions : userOptions;
  const departmentOptions = useDepartmentOptions(web, !administrators);
  const posts = usePostsQuery(web, { enabled: postsEnabled });
  const currentPostIds = user.post_ids ?? [];
  const [roleIds, setRoleIds] = useState<string[]>(user.roles);
  const [departmentId, setDepartmentId] = useState<string>(currentDepartment);
  const [postIds, setPostIds] = useState<string[]>(currentPostIds);
  const [displayName, setDisplayName] = useState<string>(user.display_name ?? '');
  const [email, setEmail] = useState<string>(user.email);
  const [touched, setTouched] = useState(false);
  // Follow refreshed list data until the operator edits the selection, so a
  // refetch landing after the dialog opens corrects a stale initial role.
  useEffect(() => {
    if (!touched) {
      setRoleIds(user.roles);
      setDepartmentId(user.department_id ?? '');
      setPostIds(user.post_ids ?? []);
      setDisplayName(user.display_name ?? '');
      setEmail(user.email);
    }
  }, [touched, current, currentDepartment, user.post_ids, user.display_name, user.email]);
  // The username is the login identity: created accounts keep it fixed, so
  // the dialog shows it read-only instead of pretending it is editable.
  const [saving, setSaving] = useState(false);
  return <Modal title={t('编辑{{v0}}', { v0: displayLabel(user.display_name, user.username) || user.username })} onClose={onClose} pending={saving}>
    <div className="flex flex-col gap-3">
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-muted">{t('账号')}</span>
        <Input value={user.username} readOnly aria-readonly="true" aria-label={t('账号')} className="opacity-70" />
        <small className="text-xs text-muted">{t('账号创建后不可修改，用于登录。')}</small>
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-muted">{t('昵称')}</span>
        <Input value={displayName} maxLength={80} autoComplete="nickname" aria-label={t('昵称')} onChange={event => setDisplayName(event.target.value)} placeholder={user.username} />
        <small className="text-xs text-muted">{t('显示昵称，留空时各处显示使用账号。')}</small>
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-muted">{t('邮箱')}</span>
        <Input type="email" maxLength={254} value={email} aria-label={t('邮箱')} onChange={event => setEmail(event.target.value)} />
        <small className="text-xs text-muted">{t('登录凭证之一，保存后立即生效。')}</small>
      </label>
      <fieldset><legend>{t('角色')}</legend><RoleChipGroup options={options.data?.items ?? []} selected={roleIds}
        onToggle={(id, checked) => { setTouched(true); setRoleIds(ids => checked ? [...ids, id] : ids.filter(value => value !== id)); }} /></fieldset>
      {!administrators && <label className="flex flex-col gap-1 text-sm">
        <span className="text-muted">{t('部门')}</span>
        <NativeSelect aria-label={t('部门')} value={departmentId} onChange={event => { setTouched(true); setDepartmentId(event.target.value); }} disabled={departmentOptions.isLoading}>
          <option value="">{t('未分配')}</option>
          {departmentOptions.items.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}
        </NativeSelect>
        <small className="text-xs text-muted">{t('选择「未分配」会清空该用户的部门归属。')}</small>
      </label>}
      {!administrators && postsEnabled && <fieldset className="flex min-w-0 flex-col gap-1.5">
        <span className="text-muted">{t('岗位')}</span>
        <div role="group" aria-label={t('岗位')} className="flex max-h-40 flex-col gap-1 overflow-y-auto rounded-lg border border-line p-3">
          {(posts.data?.items ?? []).map(post => {
            // Disabled posts cannot gain new members, but existing assignments
            // stay visible and removable; the server keeps omitted assignments.
            const assigned = postIds.includes(post.id);
            return <label key={post.id} className="flex items-center gap-2 text-sm">
              <Checkbox aria-label={post.name} checked={assigned} disabled={!post.enabled && !assigned}
                onChange={checked => { setTouched(true); setPostIds(current => checked ? [...current, post.id] : current.filter(id => id !== post.id)); }} />
              <span className={post.enabled ? 'text-ink' : 'text-muted'}>{post.name}{!post.enabled && <small className="ms-1 text-2xs text-subtle">{t('已停用')}</small>}</span>
            </label>;
          })}
          {!posts.data?.items.length && <p className="py-1 text-center text-xs text-muted">{posts.isLoading ? t('正在加载…') : t('暂无岗位')}</p>}
        </div>
        <small className="text-xs text-muted">{t('岗位只描述组织归属，不改变角色与权限。')}</small>
      </fieldset>}
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>{t('取消')}</Button>
        <Button disabled={!roleIds.length || options.isLoading || saving} onClick={() => {
          // Update semantics: omitted fields keep the stored value, an empty
          // string clears it, so the department select maps 未分配 to ''.
          const trimmed = displayName.trim();
          const submit = administrators
            ? web.updateAdministrator(user.id, { status: user.status, role_ids: roleIds, email, display_name: trimmed })
            : web.updateUser(user.id, { status: user.status, role_ids: roleIds, email, display_name: trimmed, department_id: departmentId, ...(postsEnabled ? { post_ids: postIds } : {}) });
          setSaving(true);
          void submit.then(() => {
            message.success(t('已保存'));
            onSaved();
            onClose();
          }).catch(error => message.error(t(error.message))).finally(() => setSaving(false));
        }}>{t('保存')}</Button>
      </div>
    </div>
  </Modal>;
}

// PasswordResetDialog offers the two reset shapes the contract supports: the
// operator types the replacement or asks the server to generate a temporary
// one. The generated password echoes once in the success view and the toast.
function PasswordResetDialog({ web, user, onClose, onSaved }: { web: WebClient; user: User; onClose: () => void; onSaved: () => void }) {
  useLocale();
  const message = useMessage();
  const [mode, setMode] = useState<'input' | 'generate'>('input');
  const [password, setPassword] = useState('');
  const reset = useMutation({
    mutationFn: () => web.resetUserPassword(user.id, mode === 'generate' ? {} : { password }),
    onSuccess: data => {
      message.success(t('新密码：{{password}}', { password: data.password }));
      onSaved();
      onClose();
    },
    onError: error => message.error(t(error.message)),
  });
  return <Modal title={t('重置密码')} onClose={onClose} pending={reset.isPending}>
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted">{t('为 {{name}} 设置新密码；保存后该账号的全部登录会话立即失效。', { name: displayLabel(user.display_name, user.username) || user.username })}</p>
      <fieldset className="flex flex-col gap-2">
        <legend className="sr-only">{t('密码方式')}</legend>
        <label className="flex items-center gap-2 text-sm">
          <input type="radio" name="reset-mode" checked={mode === 'input'} onChange={() => setMode('input')} aria-label={t('手动输入新密码')} />
          <span>{t('手动输入新密码')}</span>
        </label>
        {mode === 'input' && <Input type="password" minLength={12} maxLength={128} autoComplete="new-password" value={password}
          aria-label={t('新密码')} placeholder={t('至少 12 位')} onChange={event => setPassword(event.target.value)} />}
        <label className="flex items-center gap-2 text-sm">
          <input type="radio" name="reset-mode" checked={mode === 'generate'} onChange={() => setMode('generate')} aria-label={t('生成临时密码')} />
          <span>{t('生成临时密码')}</span>
        </label>
        {mode === 'generate' && <small className="text-xs text-muted">{t('系统生成一次性临时密码，仅在成功提示中显示一次。')}</small>}
      </fieldset>
      <div className="flex justify-end gap-2">
        <Button variant="secondary" disabled={reset.isPending} onClick={onClose}>{t('取消')}</Button>
        <Button pending={reset.isPending} disabled={mode === 'input' && password.length < 12} onClick={() => reset.mutate()}>{t('重置密码')}</Button>
      </div>
    </div>
  </Modal>;
}

// Indented department options for the user forms; roots keep their plain name
// and children indent one full-width step per level so the hierarchy reads.
function useDepartmentOptions(web: WebClient, enabled: boolean) {
  const departments = useDepartmentsQuery(web, { enabled });
  const items = useMemo(() => flattenDepartmentTree(buildDepartmentTree(departments.data?.items ?? []))
    .map(({ department, depth }) => ({ id: department.id, label: `${'\u3000'.repeat(depth)}${department.name}` })), [departments.data]);
  return { items, isLoading: departments.isLoading };
}

function SpreadsheetDownload({ label, filename, load }: { label: string; filename: string; load: () => Promise<Blob> }) {
  const download = useMutation({ mutationFn: load, onSuccess: blob => {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a'); link.href = url; link.download = filename;
    document.body.append(link); link.click(); link.remove(); window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  } });
  return <Button variant="secondary" pending={download.isPending} onClick={() => download.mutate()}>{label}</Button>;
}

function UserImportDialog({ web, onClose, onImported }: { web: WebClient; onClose: () => void; onImported: () => void }) {
  useLocale();
  const [file, setFile] = useState<File | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const run = useMutation({ mutationFn: () => web.importUsers(file!), onSuccess: onImported });
  const invalid = !!file && (!file.name.toLowerCase().endsWith('.xlsx') || file.size > 5 * 1024 * 1024);
  return <Modal title={run.isSuccess ? t('导入结果') : t('导入用户')} onClose={onClose} pending={run.isPending}>
    {run.isSuccess ? <div className="flex flex-col gap-3">
      <p role="status">{t('成功导入 {{count}} 位用户', { count: run.data.created })}</p>
      {!!run.data.errors.length && <div role="alert"><p>{t('{{count}} 行导入失败', { count: run.data.errors.length })}</p><ul className="max-h-60 overflow-auto text-sm text-danger">{run.data.errors.map((error, index) => <li key={index}>{error.replace(/^(\d+: )(.*)$/, (_, prefix: string, detail: string) => prefix + t(detail))}</li>)}</ul></div>}
      <Button onClick={onClose}>{t('关闭')}</Button>
    </div> : <div className="flex flex-col gap-3">
      <p className="text-sm text-muted">{t('请使用导入模板填写用户信息，支持 5 MiB 以内的 XLSX 文件。')}</p>
      <input ref={input} type="file" className="sr-only" tabIndex={-1} accept=".xlsx" aria-label={t('选择 XLSX 文件')} disabled={run.isPending} onChange={event => { setFile(event.target.files?.[0] ?? null); run.reset(); }} />
      <Button variant="secondary" disabled={run.isPending} onClick={() => input.current?.click()}>{t('选择 XLSX 文件')}</Button>
      {file && <p className="break-all text-sm">{file.name}</p>}
      {invalid && <p role="alert" className="text-sm text-danger">{t('请选择 5 MiB 以内的 XLSX 文件')}</p>}
      {run.isError && <p role="alert" className="text-sm text-danger">{t(run.error.message)}</p>}
      <div className="flex justify-end gap-2"><Button variant="secondary" disabled={run.isPending} onClick={onClose}>{t('取消')}</Button><Button pending={run.isPending} disabled={!file || invalid} onClick={() => run.mutate()}>{t('开始导入')}</Button></div>
    </div>}
  </Modal>;
}

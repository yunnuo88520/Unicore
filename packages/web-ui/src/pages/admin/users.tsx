// Author: yunnuo <ymz@ebox.vip>
// Description: Separate administrator/member lists on TanStack Table with contract-validated creation and status toggling.
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createColumnHelper, createPaginatedRowModel, flexRender, rowPaginationFeature, tableFeatures, useTable, type PaginationState } from '@tanstack/react-table';
import { RotateCcw, UserPlus } from 'lucide-react';
import type { Bootstrap, User, UserCreate, WebClient } from '@unicore/sdk';
import { t, useLocale } from '../../i18n';
import { invalidateAfter } from '../../queries';
import { AppField, AppForm, useAppForm } from '../../lib/form';
import { Badge, Button, Card, CardContent, Input, Modal, Table, TableBody, TableCell, TableEmpty, TableHead, TableHeader, TableRow, useMessage } from '../../ui';
import type { PageProps } from '../../router';

const features = tableFeatures({ rowPaginationFeature, paginatedRowModel: createPaginatedRowModel() });
const helper = createColumnHelper<typeof features, User>();
const EMPTY_USERS: User[] = [];
const COLUMN_COUNT = 6;

type UsersTableMeta = { kind: string; pending: boolean; currentUserId?: string; onToggle: (user: User) => void };

const columns = helper.columns([
  helper.accessor('username', {
    header: () => t('账号'),
    cell: info => {
      const meta = info.table.options.meta as UsersTableMeta;
      return <span className="flex items-center gap-2">
        <strong className="font-medium text-ink">{info.getValue()}</strong>
        {info.row.original.id === meta.currentUserId && <Badge>{t('当前账号')}</Badge>}
      </span>;
    },
  }),
  helper.accessor('email', { header: () => t('邮箱'), cell: info => <span className="text-muted">{info.getValue()}</span> }),
  helper.display({ id: 'role', header: () => t('身份'), cell: info => (info.table.options.meta as UsersTableMeta).kind }),
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
      return <Button variant="link" size="sm" className="h-auto p-0" disabled={meta.pending} onClick={() => meta.onToggle(user)}>
        {user.status === 'active' ? t('禁用') : t('启用')}
      </Button>;
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
  const kind = administrators ? t('管理员') : t('用户');
  const role = administrators ? 'super_admin' : 'user';
  const [search, setSearch] = useState('');
  const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: 20 });
  const [creating, setCreating] = useState(false);
  const list = useQuery({
    queryKey: [administrators ? 'administrators' : 'users', search, pagination],
    queryFn: () => (administrators ? web.administrators(search, pagination.pageIndex + 1) : web.users(search, pagination.pageIndex + 1)),
  });
  const refresh = () => {
    void cache.invalidateQueries({ queryKey: [administrators ? 'administrators' : 'users'] });
    void invalidateAfter(cache, 'users');
  };
  const update = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => (administrators ? web.updateAdministrator(id, { status, role }) : web.updateUser(id, { status, role })),
    onSuccess: () => { message.success(t('{{v0}}状态已更新', { v0: kind })); refresh(); },
  });
  const table = useTable({
    features,
    columns,
    data: list.data?.items ?? EMPTY_USERS,
    meta: {
      kind,
      pending: update.isPending,
      currentUserId: metadata.current_user?.id,
      onToggle: user => update.mutate({ id: user.id, status: user.status === 'active' ? 'disabled' : 'active' }),
    } satisfies UsersTableMeta,
    state: { pagination },
    onPaginationChange: setPagination,
    manualPagination: true,
    pageCount: list.data ? Math.max(1, Math.ceil(list.data.total / list.data.page_size)) : 1,
  });
  return <Card>
    <CardContent className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-md font-semibold text-ink">{t('{{kind}}列表', { kind })}</h2>
          <p className="mt-0.5 text-xs text-muted">{administrators ? t('管理后台账号及其启用状态') : t('普通用户创建后立即启用，使用用户登录入口进入工作空间')}</p>
        </div>
        <Button onClick={() => setCreating(true)}><UserPlus size={15} />{t('新增{{kind}}', { kind })}</Button>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Input aria-label={t('搜索{{v0}}', { v0: kind })} placeholder={t('搜索账号或邮箱…')} maxLength={128} className="h-9 max-w-xs flex-1"
          value={search} onChange={event => { setSearch(event.target.value); setPagination(current => ({ ...current, pageIndex: 0 })); }} />
        <span className="text-xs text-muted">{t('{{count}} 位{{kind}}', { count: list.data?.total ?? 0, kind })}</span>
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
              ? <TableEmpty colSpan={COLUMN_COUNT}>{t('正在加载…')}</TableEmpty>
              : table.getRowModel().rows.length
                ? table.getRowModel().rows.map(row => <TableRow key={row.id}>
                    {row.getAllCells().map(cell => <TableCell key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>)}
                  </TableRow>)
                : <TableEmpty colSpan={COLUMN_COUNT}>{list.isError ? t(list.error.message) : t('没有匹配的{{kind}}', { kind })}</TableEmpty>}
          </TableBody>
        </Table>
      </div>
      <div className="flex items-center justify-between gap-3 text-xs text-muted">
        <Button variant="secondary" size="sm" disabled={!table.getCanPreviousPage()} onClick={() => table.previousPage()}>{t('上一页')}</Button>
        <span>{t('第 {{page}} 页', { page: pagination.pageIndex + 1 })}</span>
        <Button variant="secondary" size="sm" disabled={!table.getCanNextPage() || list.isFetching} onClick={() => table.nextPage()}>{t('下一页')}</Button>
      </div>
    </CardContent>
    {creating && <UserCreateDialog web={web} kind={kind} role={role} administrators={administrators} onClose={() => setCreating(false)} onCreated={refresh} />}
  </Card>;
}

function UserCreateDialog({ web, kind, role, administrators, onClose, onCreated }: {
  web: WebClient; kind: string; role: UserCreate['role']; administrators: boolean; onClose: () => void; onCreated: () => void;
}) {
  useLocale();
  const message = useMessage();
  const form = useAppForm<UserCreate>({
    schema: 'UserCreate',
    defaultValues: { username: '', email: '', password: '', role },
    onSubmit: async values => {
      try {
        await (administrators ? web.createAdministrator(values) : web.createUser(values));
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
      <AppField name="email" label={t('邮箱')}><Input required type="email" maxLength={254} /></AppField>
      <AppField name="password" label={t('初始密码')}><Input required type="password" minLength={12} maxLength={128} autoComplete="new-password" /></AppField>
      <p className="text-xs leading-relaxed text-muted">
        {administrators ? t('使用当前后台入口登录。') : t('创建后即可从 /login 使用初始密码登录，无需邮件验证。')}
        {t('密码至少 12 位。')}
      </p>
      <div className="flex justify-end gap-2">
        <Button variant="secondary" disabled={form.formState.isSubmitting} onClick={onClose}>{t('取消')}</Button>
        <Button type="submit" pending={form.formState.isSubmitting}>{form.formState.isSubmitting ? t('正在创建…') : t('创建{{v0}}', { v0: kind })}</Button>
      </div>
    </AppForm>
  </Modal>;
}

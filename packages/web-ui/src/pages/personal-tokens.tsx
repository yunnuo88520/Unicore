// Author: yunnuo <ymz@ebox.vip>
// Description: Role-bound personal credentials on the shared data table kit, with bounded editors and one-time secret disclosure.
import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { createColumnHelper, tableFeatures, useTable } from '@tanstack/react-table';
import { KeyRound } from 'lucide-react';
import type { AdminPersonalTokenInput, PersonalToken, PersonalTokenCreated, PersonalTokenInput, PersonalTokenRenewInput, WebClient } from '@unicore/sdk';
import { AppControllerField, AppField, AppForm, useAppForm } from '@unicore/form';
import { Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, ConfirmDialog, Input, Modal, SimpleSelect, Textarea, useMessage } from '@unicore/ui';
import { DataTable, DataTableToolbar, DataTablePagination } from '../components/data-table';
import { defineMessages, t, useLocale } from '../i18n';
import { useColumnVisibility } from '../column-visibility';
import type { PageProps } from '../router';

const lifetimes = defineMessages([
  { value: '1', label: '1 天' }, { value: '7', label: '7 天' }, { value: '30', label: '30 天' }, { value: '90', label: '90 天' }, { value: '0', label: '永久' },
]);
const columnLabels = defineMessages({ name: '名称', status: '状态', role: '绑定角色', username: '所属用户', expires_at: '到期时间', created_at: '创建时间', last_used_at: '最近使用' });
// The owner column exists only in the admin view; the personal view never offers it.
const menuKeys = (manage: boolean) => (Object.keys(columnLabels) as (keyof typeof columnLabels)[]).filter(key => manage || key !== 'username');

const features = tableFeatures({});
const helper = createColumnHelper<typeof features, PersonalToken>();
const EMPTY_TOKENS: PersonalToken[] = [];

type TokensTableMeta = { date: (value: number) => string; busy: boolean; onRenew: (token: PersonalToken) => void; onRevoke: (token: PersonalToken) => void };

const statusOf = (token: PersonalToken) => {
  const expired = token.expires_at !== 0 && token.expires_at <= Date.now() / 1000;
  return token.revoked ? { label: t('已作废'), variant: 'danger' as const } : expired ? { label: t('已过期'), variant: 'warning' as const } : { label: t('有效'), variant: 'success' as const };
};

const buildColumns = (manage: boolean) => helper.columns([
  helper.accessor('name', {
    header: () => t('名称'),
    cell: info => <span className="flex min-w-0 flex-col">
      <strong className="break-all font-medium text-ink">{info.getValue()}</strong>
      {info.row.original.remark && <small className="whitespace-pre-wrap break-words text-2xs text-muted">{info.row.original.remark}</small>}
    </span>,
  }),
  helper.display({
    id: 'status',
    header: () => t('状态'),
    cell: info => { const status = statusOf(info.row.original); return <Badge variant={status.variant}>{status.label}</Badge>; },
  }),
  helper.display({
    id: 'role',
    header: () => t('绑定角色'),
    cell: info => <span className="break-all text-muted">{info.row.original.role_name || info.row.original.role_id}</span>,
  }),
  ...(manage ? [helper.display({
    id: 'username',
    header: () => t('所属用户'),
    cell: info => <span className="break-all text-muted">{info.row.original.username}</span>,
  })] : []),
  helper.accessor('expires_at', {
    header: () => t('到期时间'),
    cell: info => <span className="whitespace-nowrap text-muted">{info.getValue() ? (info.table.options.meta as TokensTableMeta).date(info.getValue()) : t('永久')}</span>,
  }),
  helper.accessor('created_at', {
    header: () => t('创建时间'),
    cell: info => <span className="whitespace-nowrap text-muted">{(info.table.options.meta as TokensTableMeta).date(info.getValue())}</span>,
  }),
  helper.accessor('last_used_at', {
    header: () => t('最近使用'),
    cell: info => <span className="whitespace-nowrap text-muted">{info.getValue() ? (info.table.options.meta as TokensTableMeta).date(info.getValue()) : t('尚未使用')}</span>,
  }),
  helper.display({
    id: 'actions',
    header: () => t('操作'),
    cell: info => {
      const meta = info.table.options.meta as TokensTableMeta;
      const token = info.row.original;
      return <div className="flex gap-2">
        <Button variant="secondary" size="sm" disabled={token.revoked} onClick={() => meta.onRenew(token)}>{t('续期')}</Button>
        <Button variant="secondary" size="sm" disabled={token.revoked || meta.busy} onClick={() => meta.onRevoke(token)}>{t('作废')}</Button>
      </div>;
    },
  }),
]);

export function PersonalTokensPage({ client, metadata }: PageProps) {
  return <TokenManager web={client.web!} userID={metadata.current_user!.id} />;
}
export function TokenManager({ web, userID, manage = false }: { web: WebClient; userID: string; manage?: boolean }) {
  const locale = useLocale();
  const message = useMessage();
  const [creating, setCreating] = useState(false);
  const [revoking, setRevoking] = useState<PersonalToken>();
  const [renewing, setRenewing] = useState<PersonalToken>();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const query = useQuery({ queryKey: ['personal-tokens', userID, manage, search, page], queryFn: () => manage ? web.adminPersonalTokens(search, page) : web.personalTokens(search, page) });
  const revoke = useMutation({ mutationFn: (id: string) => manage ? web.adminRevokePersonalToken(id) : web.revokePersonalToken(id), onSuccess: () => { setRevoking(undefined); message.success(t('访问令牌已作废')); void query.refetch(); } });
  const date = (value: number) => new Date(value * 1000).toLocaleString(locale);
  const columns = useMemo(() => buildColumns(manage), [manage]);
  const { columnVisibility, menu, toggle } = useColumnVisibility(manage ? 'admin-tokens' : 'personal-tokens',
    menuKeys(manage).map(id => ({ id, label: t(columnLabels[id]) })));
  const table = useTable({
    features,
    columns,
    data: query.data?.items ?? EMPTY_TOKENS,
    getRowId: token => token.id,
    meta: { date, busy: revoke.isPending, onRenew: setRenewing, onRevoke: setRevoking } satisfies TokensTableMeta,
    state: { columnVisibility },
  });
  return <Card><CardHeader className="flex-row flex-wrap items-start justify-between gap-3"><div className="min-w-0"><CardTitle>{t(manage ? '访问令牌管理' : '个人访问令牌')}</CardTitle><CardDescription>{t(manage ? '管理所有用户的访问令牌，或选择用户为其签发。' : '每个令牌绑定一个角色，仅使用该角色的当前权限和数据范围。')}</CardDescription></div><Button onClick={() => setCreating(true)}>{t('创建访问令牌')}</Button></CardHeader>
    <CardContent className="flex min-w-0 flex-col gap-4">
      <DataTableToolbar
        search={{ label: t('搜索访问令牌'), placeholder: t(manage ? '搜索名称、用户或备注' : '搜索名称或备注'), value: search, onChange: value => { setSearch(value); setPage(1); } }}
        columnMenu={{ entries: menu, onToggle: toggle }} />
      <DataTable table={table} pending={query.isPending} error={query.error} onRetry={() => void query.refetch()}
        empty={{ icon: KeyRound, title: t('暂无访问令牌'), hint: t('创建访问令牌，按绑定角色调用开放 API。') }} />
      {query.data && query.data.total > query.data.page_size
        && <DataTablePagination page={page} pageSize={query.data.page_size} total={query.data.total} onPageChange={setPage} disabled={query.isFetching} />}
    </CardContent>
    {creating && <CreateToken web={web} userID={userID} manage={manage} onClose={() => setCreating(false)} onCreated={() => void query.refetch()} />}
    {renewing && <RenewToken web={web} token={renewing} manage={manage} onClose={() => setRenewing(undefined)} onSaved={() => { setRenewing(undefined); void query.refetch(); }} />}
    {revoking && <ConfirmDialog title={t('作废访问令牌')} description={t('作废后立即失效，且无法通过续期恢复。')} confirmLabel={t('确认作废')} cancelLabel={t('取消')} danger pending={revoke.isPending} onConfirm={() => revoke.mutate(revoking.id)} onCancel={() => setRevoking(undefined)} />}
  </Card>;
}
function LifetimeField() {
  return <AppControllerField name="expires_in_days" label={t('有效期')}>{field => <SimpleSelect label={t('有效期')} value={String(field.value)} onChange={value => field.onChange(Number(value))} options={lifetimes.map(option => ({ ...option, label: t(option.label) }))} />}</AppControllerField>;
}
function CreateToken({ web, userID, manage, onClose, onCreated }: { web: WebClient; userID: string; manage: boolean; onClose: () => void; onCreated: () => void }) {
  useLocale();
  const [created, setCreated] = useState<PersonalTokenCreated>();
  const form = useAppForm<AdminPersonalTokenInput>({ schema: 'AdminPersonalTokenInput', defaultValues: { name: '', role_id: '', remark: '', expires_in_days: 30, user_id: manage ? '' : userID }, onSubmit: values => { save.mutate(values); } });
  const target = form.watch('user_id');
  const roles = useQuery({ queryKey: ['personal-token-roles', userID, manage, target], queryFn: () => manage ? web.adminPersonalTokenRoles(target) : web.personalTokenRoles(), enabled: !!target && !created });
  useEffect(() => { if (roles.data?.items.length === 1) form.setValue('role_id', roles.data.items[0].id); }, [roles.data, form]);
  const save = useMutation({ mutationFn: (input: AdminPersonalTokenInput) => {
    if (manage) return web.adminCreatePersonalToken(input);
    const { user_id: _owner, ...personal } = input;
    return web.createPersonalToken(personal as PersonalTokenInput);
  }, onSuccess: result => { setCreated(result); onCreated(); }, onError: form.applyServerError });
  return <Modal title={t('创建访问令牌')} onClose={onClose} pending={save.isPending}>
    {created ? <div className="flex min-w-0 flex-col gap-4"><p role="status">{t('令牌仅显示这一次。请立即复制并妥善保存，关闭后无法再次查看。')}</p><label className="flex min-w-0 flex-col gap-2 text-sm">{t('新访问令牌')}<Input autoComplete="off" readOnly value={created.token} onFocus={event => event.currentTarget.select()} /></label><Button onClick={onClose}>{t('完成')}</Button></div> : <AppForm form={form} className="flex min-w-0 flex-col gap-4">
      {manage && <AppControllerField name="user_id" label={t('所属用户')}>{field => <UserPicker web={web} value={String(field.value)} onChange={id => { field.onChange(id); form.setValue('role_id', ''); }} />}</AppControllerField>}
      <AppField name="name" label={t('令牌名称')} rules={{ required: t('此项为必填') }}><Input maxLength={80} autoComplete="off" /></AppField>
      <AppControllerField name="role_id" label={t('绑定角色')} hint={t('只能选择该用户已拥有的一个角色。')}>
        {field => <SimpleSelect label={t('绑定角色')} value={String(field.value)} onChange={field.onChange} disabled={!target || roles.isPending || !!roles.error || save.isPending} placeholder={t('请选择角色')} options={(roles.data?.items ?? []).map(role => ({ value: role.id, label: role.name }))} />}
      </AppControllerField>
      {roles.error && <div role="alert">{t('无法读取用户角色')} <Button type="button" variant="secondary" onClick={() => void roles.refetch()}>{t('重试')}</Button></div>}
      {!!target && roles.isSuccess && !roles.data.items.length && <p role="status">{t('当前用户没有可绑定的角色')}</p>}
      <LifetimeField />
      <AppField name="remark" label={t('备注')}><Textarea maxLength={500} rows={3} /></AppField>
      <div className="flex justify-end gap-2"><Button type="button" variant="secondary" disabled={save.isPending} onClick={onClose}>{t('取消')}</Button><Button type="submit" pending={save.isPending} disabled={!form.watch('role_id') || !target}>{t('生成令牌')}</Button></div>
    </AppForm>}
  </Modal>;
}
function UserPicker({ web, value, onChange }: { web: WebClient; value: string; onChange: (id: string) => void }) {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState('');
  const users = useQuery({ queryKey: ['personal-token-users', search, page], queryFn: () => web.personalTokenUsers(search, page) });
  return <div className="flex min-w-0 flex-col gap-2">
    {value && <p className="break-all text-sm" role="status">{t('已选择：{{name}}', { name: selected })}</p>}
    <Input aria-label={t('搜索用户')} placeholder={t('搜索用户名或邮箱')} maxLength={100} value={search} onChange={event => { setSearch(event.target.value); setPage(1); }} />
    <div className="max-h-36 min-h-0 overflow-y-auto overscroll-contain rounded-md border border-line p-1" role="group" aria-label={t('选择用户')}>
      {users.isPending ? <p role="status">{t('正在加载…')}</p> : users.error ? <div role="alert">{t('无法读取用户列表')}<Button type="button" variant="secondary" onClick={() => void users.refetch()}>{t('重试')}</Button></div> : users.data.items.filter(user => user.status === 'active').map(user => <Button key={user.id} type="button" variant={value === user.id ? 'secondary' : 'ghost'} className="h-auto w-full justify-start whitespace-normal break-all text-start" aria-pressed={value === user.id} onClick={() => { setSelected(user.username); onChange(user.id); }}>{user.username} · {user.email}</Button>)}
      {users.isSuccess && !users.data.items.some(user => user.status === 'active') && <p className="p-2 text-sm text-muted">{t('暂无可选用户')}</p>}
    </div>
    {users.data && users.data.total > users.data.page_size && <div className="flex justify-between gap-2"><Button type="button" variant="ghost" disabled={page <= 1 || users.isFetching} onClick={() => setPage(v => v - 1)}>{t('上一页')}</Button><Button type="button" variant="ghost" disabled={page * users.data.page_size >= users.data.total || users.isFetching} onClick={() => setPage(v => v + 1)}>{t('下一页')}</Button></div>}
  </div>;
}
function RenewToken({ web, token, manage, onClose, onSaved }: { web: WebClient; token: PersonalToken; manage: boolean; onClose: () => void; onSaved: () => void }) {
  useLocale();
  const message = useMessage();
  const form = useAppForm<PersonalTokenRenewInput>({ schema: 'PersonalTokenRenewInput', defaultValues: { expires_in_days: 30 }, onSubmit: input => { save.mutate(input); } });
  const save = useMutation({ mutationFn: (input: PersonalTokenRenewInput) => manage ? web.adminRenewPersonalToken(token.id, input) : web.renewPersonalToken(token.id, input), onSuccess: () => { message.success(t('访问令牌已续期')); onSaved(); }, onError: form.applyServerError });
  return <Modal title={t('续期访问令牌')} onClose={onClose} pending={save.isPending}><AppForm form={form} className="flex flex-col gap-4"><p className="break-all text-sm">{token.name}</p><p className="text-sm text-muted">{t('有效令牌从原到期时间延长，已过期或永久令牌从现在计算；原令牌保持不变。')}</p><LifetimeField /><div className="flex justify-end gap-2"><Button type="button" variant="secondary" disabled={save.isPending} onClick={onClose}>{t('取消')}</Button><Button type="submit" pending={save.isPending}>{t('确认续期')}</Button></div></AppForm></Modal>;
}

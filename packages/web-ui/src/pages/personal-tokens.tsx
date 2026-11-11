// Author: yunnuo <ymz@ebox.vip>
// Description: Own personal credentials; raw secrets exist only in the creation dialog's memory.
import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import type { PersonalTokenCreated, PersonalTokenInput, WebClient } from '@unicore/sdk';
import { AppField, AppForm, useAppForm } from '@unicore/form';
import { Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Checkbox, ConfirmDialog, Input, Modal, useMessage } from '@unicore/ui';
import { t, useLocale } from '../i18n';

export function PersonalTokens({ web, userID }: { web: WebClient; userID: string }) {
  const locale = useLocale();
  const message = useMessage();
  const [creating, setCreating] = useState(false);
  const [target, setTarget] = useState<{ id: string; name: string }>();
  const query = useQuery({ queryKey: ['personal-tokens', userID], queryFn: () => web.personalTokens() });
  const revoke = useMutation({ mutationFn: (id: string) => web.revokePersonalToken(id), onSuccess: () => { setTarget(undefined); message.success(t('访问令牌已撤销')); void query.refetch(); } });
  const date = (value: number) => value ? new Date(value * 1000).toLocaleString(locale) : t('尚未使用');
  return <Card><CardHeader className="flex-row flex-wrap items-start justify-between gap-3"><div><CardTitle>{t('个人访问令牌')}</CardTitle><CardDescription>{t('供脚本与外部程序调用 API；权限不会超过你当前的授权。')}</CardDescription></div><Button onClick={() => setCreating(true)}>{t('创建访问令牌')}</Button></CardHeader>
    <CardContent className="flex flex-col gap-3">
      {query.isPending ? <p role="status">{t('正在加载令牌…')}</p> : query.error ? <div role="alert"><p>{t('无法读取访问令牌')}</p><Button variant="secondary" onClick={() => void query.refetch()}>{t('重试')}</Button></div> : !query.data.items.length ? <p className="text-sm text-muted">{t('尚未创建访问令牌')}</p> : query.data.items.map(token => {
        const unavailable = token.revoked || token.expires_at <= Date.now() / 1000;
        return <div key={token.id} className="flex min-w-0 flex-col gap-3 rounded-lg border border-line p-3 sm:flex-row sm:justify-between"><div className="min-w-0"><strong className="break-all text-sm">{token.name}</strong><Badge variant="subtle" className="ms-2">{unavailable ? t('已失效') : t('有效')}</Badge><p className="mt-2 text-xs text-muted">{t('到期时间')}：{date(token.expires_at)}</p><p className="mt-1 text-xs text-muted">{t('最近使用')}：{date(token.last_used_at)}</p><p className="mt-2 break-all text-xs text-muted">{token.operation_ids.join(', ')}</p></div><Button variant="secondary" disabled={unavailable || revoke.isPending} onClick={() => setTarget(token)}>{t('撤销令牌')}</Button></div>;
      })}
      {creating && <CreateToken userID={userID} web={web} onClose={() => setCreating(false)} onCreated={() => void query.refetch()} />}
      {target && <ConfirmDialog title={t('撤销令牌')} description={t('撤销后，使用此令牌的程序将立即失去访问权限。')} confirmLabel={t('确认撤销')} cancelLabel={t('取消')} danger pending={revoke.isPending} onConfirm={() => revoke.mutate(target.id)} onCancel={() => setTarget(undefined)} />}
    </CardContent>
  </Card>;
}
function CreateToken({ web, userID, onClose, onCreated }: { web: WebClient; userID:string; onClose: () => void; onCreated: () => void }) {
  useLocale();
  const [created, setCreated] = useState<PersonalTokenCreated>();
  const scopes = useQuery({ queryKey: ['personal-token-scopes',userID], queryFn: () => web.personalTokenScopes(), staleTime: 0 });
  const form = useAppForm<PersonalTokenInput>({ schema: 'PersonalTokenInput', defaultValues: { name: '', expires_in_days: 30, operation_ids: [] }, onSubmit: values => { save.mutate(values); } });
  const selected = form.watch('operation_ids');
  const save = useMutation({ mutationFn: (input: PersonalTokenInput) => web.createPersonalToken(input), onSuccess: result => { setCreated(result); onCreated(); }, onError: form.applyServerError });
  return <Modal title={t('创建访问令牌')} onClose={onClose} pending={save.isPending}>
    {created ? <div className="flex flex-col gap-4"><p role="status">{t('令牌仅显示这一次。请立即复制并妥善保存，关闭后无法再次查看。')}</p><label className="flex min-w-0 flex-col gap-2 text-sm">{t('新访问令牌')}<Input autoComplete="off" readOnly value={created.token} onFocus={event => event.currentTarget.select()} /></label><Button onClick={onClose}>{t('完成')}</Button></div> : <AppForm form={form} className="flex flex-col gap-4">
      <AppField name="name" label={t('令牌名称')}><Input maxLength={80} autoComplete="off" /></AppField>
      <AppField name="expires_in_days" label={t('有效天数')} rules={{ valueAsNumber: true }}><Input type="number" min={1} max={365} /></AppField>
      <fieldset className="min-w-0"><legend className="mb-2 text-sm font-medium">{t('允许调用的 API')}</legend>
        {scopes.isPending ? <p role="status">{t('正在加载可授权 API…')}</p> : scopes.error ? <div role="alert"><p>{t('无法读取可授权 API')}</p><Button type="button" variant="secondary" onClick={() => void scopes.refetch()}>{t('重试')}</Button></div> : !scopes.data.items.length ? <p className="text-sm text-muted">{t('当前账号没有可授权的 API')}</p> : <div className="flex max-h-64 flex-col gap-3 overflow-auto rounded-lg border border-line p-3">{scopes.data.items.map(scope => <label key={scope.operation_id} className="flex min-w-0 items-start gap-2 text-sm"><Checkbox aria-label={scope.operation_id} checked={selected.includes(scope.operation_id)} onChange={checked => form.setValue('operation_ids', checked ? [...selected, scope.operation_id] : selected.filter(id => id !== scope.operation_id), { shouldValidate: true })} /><span className="min-w-0 break-all">{scope.operation_id}<small className="block text-muted">{scope.method} {scope.path}</small></span></label>)}</div>}
        {form.formState.errors.operation_ids && <p role="alert" className="mt-2 text-xs text-danger">{t('请至少选择一个 API')}</p>}
      </fieldset><div className="flex justify-end gap-2"><Button type="button" variant="secondary" disabled={save.isPending} onClick={onClose}>{t('取消')}</Button><Button type="submit" disabled={save.isPending || !scopes.data?.items.length}>{t('生成令牌')}</Button></div>
    </AppForm>}
  </Modal>;
}

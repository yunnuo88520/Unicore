// Author: yunnuo <ymz@ebox.vip>
// Description: Personal OAuth authorizations: applications the account consented to for MCP access, with immediate self revocation.
import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Bot, Plug } from 'lucide-react';
import type { AppClient } from '@unicore/sdk';
import { Badge, Button, Card, CardContent, ConfirmDialog, useMessage } from '@unicore/ui';
import { t, useLocale } from '../i18n';

export function AccountAppsPanel({ client }: { client: AppClient }) {
  const locale = useLocale();
  const message = useMessage();
  const web = client.web!;
  const [revoking, setRevoking] = useState('');
  const list = useQuery({
    queryKey: ['my-mcp-oauth-grants'],
    queryFn: () => web.myMcpOauthGrants(),
    retry: false,
    staleTime: 15_000,
  });
  const revoke = useMutation({
    mutationFn: (id: string) => web.revokeMyMcpOauthGrant(id),
    onSuccess: () => {
      setRevoking('');
      message.success(t('授权已撤销，应用的全部令牌已失效'));
      void list.refetch();
    },
  });
  if (list.isError) {
    // The endpoint answers 404 while MCP OAuth is disabled; the panel then has
    // nothing personal to offer and stays quiet.
    return null;
  }
  const date = (value: number) => value ? new Date(value * 1000).toLocaleString(locale) : t('尚未使用');
  return <div className="flex min-w-0 flex-col gap-4">
    <p className="text-xs text-muted">{t('这里列出你同意过的外部应用；撤销后应用需要重新发起授权。')}</p>
    {list.data?.items.length === 0 && <Card><CardContent className="flex flex-col items-center gap-2 p-8 text-center">
      <Plug size={22} className="text-muted" aria-hidden="true" />
      <p className="text-sm text-ink">{t('暂无已授权应用')}</p>
      <p className="text-xs text-muted">{t('当外部应用请求访问 MCP 能力时，授权会出现在这里。')}</p>
    </CardContent></Card>}
    {(list.data?.items ?? []).map(grant => <Card key={grant.id}><CardContent className="flex flex-wrap items-center gap-3 p-4 text-sm">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-accent"><Bot size={17} aria-hidden="true" /></span>
      <span className="flex min-w-0 flex-col">
        <strong className="break-all font-medium text-ink">{grant.client_name}</strong>
        <span className="text-xs text-muted">{t('绑定角色')}：{grant.role_name || grant.role_id}</span>
      </span>
      <span className="flex min-w-0 flex-wrap gap-1">
        {grant.scopes.map(scope => <Badge key={scope} variant="subtle" className="font-mono text-xs">{scope}</Badge>)}
      </span>
      <span className="text-xs text-muted">{t('最近使用')}：{date(grant.last_used_at)}</span>
      <Button variant="secondary" size="sm" className="ml-auto" disabled={revoking === grant.id} onClick={() => setRevoking(grant.id)}>{t('撤销授权')}</Button>
    </CardContent></Card>)}
    {revoking && <ConfirmDialog
      title={t('撤销授权')}
      description={t('撤销后该应用无法再通过 MCP 访问你的数据，直到重新授权。')}
      confirmLabel={t('确认撤销')} cancelLabel={t('取消')} danger pending={revoke.isPending}
      onConfirm={() => revoke.mutate(revoking)} onCancel={() => setRevoking('')} />}
  </div>;
}

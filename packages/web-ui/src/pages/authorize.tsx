// Author: yunnuo <ymz@ebox.vip>
// Description: MCP OAuth consent: describe the authorization request, bind one held role and return the one-time code to the client callback.
import { useMutation, useQuery } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { Bot, ShieldAlert, ShieldCheck } from 'lucide-react';
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, SimpleSelect } from '@unicore/ui';
import { defineMessages, t, useLocale } from '../i18n';
import { useRouteSearch, type PageProps } from '../router';
import type { AppClient } from '@unicore/sdk';

const SCOPE_LABELS = defineMessages({
  'mcp.read': '读取 MCP 能力',
  'offline_access': '在离线后保持连接（刷新令牌）',
});

type AuthorizeSearch = {
  client_id?: string;
  redirect_uri?: string;
  scope?: string;
  state?: string;
  code_challenge?: string;
  code_challenge_method?: string;
  resource?: string;
};

export function AuthorizePage({ client }: PageProps) {
  useLocale();
  const search = useRouteSearch<AuthorizeSearch>();
  const [roleId, setRoleId] = useState('');
  const web = client.web;
  const describe = useQuery({
    queryKey: ['mcp-oauth-authorize', search],
    queryFn: () => {
      if (!web) throw new Error(t('此运行形态不提供该能力'));
      return web.describeMcpOauthAuthorize({
        client_id: search.client_id ?? '', redirect_uri: search.redirect_uri ?? '',
        scope: search.scope, state: search.state, code_challenge: search.code_challenge,
        code_challenge_method: search.code_challenge_method, resource: search.resource,
      });
    },
    enabled: !!web && !!search.client_id && !!search.redirect_uri,
    retry: false,
    staleTime: 30_000,
  });
  const consent = useMutation({
    mutationFn: () => {
      if (!web) throw new Error(t('此运行形态不提供该能力'));
      const roles = describe.data?.roles ?? [];
      // Single-role accounts never see the selector; the held role still applies.
      const selected = roleId && roles.some(role => role.id === roleId) ? roleId : roles[0]?.id ?? '';
      return web.consentMcpOauthAuthorize({
        client_id: search.client_id ?? '', redirect_uri: search.redirect_uri ?? '',
        scope: search.scope, state: search.state, code_challenge: search.code_challenge,
        code_challenge_method: search.code_challenge_method, resource: search.resource,
        role_id: selected,
      });
    },
    onSuccess: result => { window.location.assign(result.redirect_uri); },
  });
  if (!search.client_id || !search.redirect_uri || !web) {
    return <ConsentShell><DeniedCard title={t('授权请求无效')} detail={t('缺少客户端标识或回调地址，请从应用重新发起授权。')} /></ConsentShell>;
  }
  if (describe.isPending) {
    return <ConsentShell><PendingCard /></ConsentShell>;
  }
  if (describe.isError || !describe.data) {
    return <ConsentShell><DeniedCard title={t('授权请求无效')} detail={t(describe.error instanceof Error ? describe.error.message : '此授权请求无法继续，请从应用重新发起。')} /></ConsentShell>;
  }
  const view = describe.data;
  const roles = view.roles ?? [];
  const selectedRole = roleId && roles.some(role => role.id === roleId) ? roleId : roles[0]?.id ?? '';
  const denyTarget = denyRedirect(search.redirect_uri, search.state);
  return <ConsentShell>
    <Card className="w-full max-w-[440px]">
      <CardHeader className="items-center text-center">
        <div className="mx-auto mb-2 flex size-12 items-center justify-center rounded-2xl bg-primary-soft text-accent"><Bot size={24} aria-hidden="true" /></div>
        <CardTitle>{t('授权 "{{v0}}" 访问工作空间', { v0: view.client_name })}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <ul className="flex flex-col gap-2">
          {view.scopes.map(scope => <li key={scope} className="flex items-center gap-2 text-sm text-ink">
            <ShieldCheck size={15} className="shrink-0 text-success" aria-hidden="true" />
            {SCOPE_LABELS[scope as keyof typeof SCOPE_LABELS] ? t(SCOPE_LABELS[scope as keyof typeof SCOPE_LABELS]) : scope}
            <Badge variant="subtle" className="ml-auto font-mono text-xs">{scope}</Badge>
          </li>)}
        </ul>
        {roles.length > 1 && <label className="flex flex-col gap-1.5 text-sm text-muted">
          {t('以哪个身份访问')}
          <SimpleSelect value={selectedRole} onChange={setRoleId} label={t('以哪个身份访问')}
            options={roles.map(role => ({ value: role.id, label: role.name }))} />
        </label>}
        <p className="text-xs text-subtle">{t('授权绑定所选角色当前的权限；你可以随时在个人中心撤销。')}</p>
        <div className="flex gap-2">
          <Button className="flex-1" disabled={consent.isPending || !selectedRole} onClick={() => consent.mutate()}>
            {t('同意授权')}
          </Button>
          <Button variant="secondary" className="flex-1" disabled={consent.isPending} onClick={() => { window.location.assign(denyTarget); }}>
            {t('拒绝')}
          </Button>
        </div>
        {consent.isError && <p role="alert" className="text-sm text-danger">{t('授权未能完成，请重试。')}</p>}
      </CardContent>
    </Card>
  </ConsentShell>;
}

function PendingCard() {
  return <Card className="w-full max-w-[440px]">
    <CardContent className="flex items-center justify-center gap-2 py-10 text-sm text-muted" role="status">
      <Bot size={16} className="animate-pulse text-accent" aria-hidden="true" />
      {t('正在确认应用身份与请求的能力范围…')}
    </CardContent>
  </Card>;
}

function ConsentShell({ children }: { children: ReactNode }) {
  return <main className="flex min-h-dvh items-center justify-center bg-background px-4 py-10">{children}</main>;
}

function DeniedCard({ title, detail }: { title: string; detail: string }) {
  return <Card className="w-full max-w-[440px]">
    <CardHeader className="items-center text-center">
      <div className="mx-auto mb-2 flex size-12 items-center justify-center rounded-2xl bg-danger-soft text-danger"><ShieldAlert size={24} aria-hidden="true" /></div>
      <CardTitle>{title}</CardTitle>
    </CardHeader>
    <CardContent><p className="text-center text-sm text-muted">{detail}</p></CardContent>
  </Card>;
}

// Denial follows RFC 6749 4.1.2.1: back to the callback with error=access_denied.
function denyRedirect(redirectURI: string, state?: string) {
  try {
    const parsed = new URL(redirectURI);
    parsed.searchParams.set('error', 'access_denied');
    if (state) parsed.searchParams.set('state', state);
    return parsed.toString();
  } catch {
    return redirectURI;
  }
}

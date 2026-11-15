// Author: yunnuo <ymz@ebox.vip>
// Description: MCP OAuth client console: pre-registered clients, one-time secrets, CAS edits and global grant revocation.
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { KeyRound, Lock, Plug, ShieldCheck } from 'lucide-react';
import type { McpOauthClient, WebClient } from '@unicore/sdk';
import { Badge, Button, Card, CardContent, ConfirmDialog, Input, Modal, PageHeader, SimpleSelect, Switch, Table, TableBody, TableCell, TableEmpty, TableHead, TableHeader, TableRow, Textarea, useMessage } from '@unicore/ui';
import { defineMessages, t, useLocale } from '../../../i18n';
import type { PageProps } from '../../../router';

const PAGE_SIZE = 50;
const typeLabels = defineMessages({ public: '公开客户端（PKCE）', confidential: '机密客户端（密钥）' });

export function AdminAiOauthPage({ client }: PageProps) {
  const locale = useLocale();
  const message = useMessage();
  const cache = useQueryClient();
  const web = client.web!;
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<McpOauthClient | null>(null);
  const [rotating, setRotating] = useState<McpOauthClient | null>(null);
  const [grantsOf, setGrantsOf] = useState<McpOauthClient | null>(null);
  const list = useQuery({ queryKey: ['mcp-oauth-clients'], queryFn: () => web.listMcpOauthClients!() });
  const date = (value: number) => value ? new Date(value * 1000).toLocaleString(locale) : '—';
  const refresh = () => void cache.invalidateQueries({ queryKey: ['mcp-oauth-clients'] });
  return <div className="flex min-w-0 flex-col gap-4">
    <PageHeader title={t('OAuth 接入')} description={t('预注册使用授权码 + PKCE 接入 MCP 的外部应用；密钥只在创建或轮换时显示一次。')} />
    <Card><CardContent className="flex min-w-0 flex-col gap-4 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted">{t('停用客户端会立即拒绝新的授权与令牌签发；已有令牌在下次使用时失效。')}</p>
        <Button size="sm" onClick={() => setCreating(true)}><Plug size={14} aria-hidden="true" />{t('注册客户端')}</Button>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t('名称')}</TableHead>
            <TableHead>{t('类型')}</TableHead>
            <TableHead>{t('回调地址')}</TableHead>
            <TableHead>{t('状态')}</TableHead>
            <TableHead>{t('更新时间')}</TableHead>
            <TableHead className="text-right">{t('操作')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {list.data?.items.length === 0 && <TableEmpty colSpan={6}><span className="block text-sm">{t('暂无注册客户端')}</span><span className="mt-1 block text-xs">{t('注册客户端后，用户即可在同意页授权其访问 MCP 能力。')}</span></TableEmpty>}
          {(list.data?.items ?? []).map(item => <TableRow key={item.id}>
            <TableCell><span className="break-all font-medium text-ink">{item.name}</span></TableCell>
            <TableCell><Badge variant={item.client_type === 'confidential' ? 'primary' : 'subtle'}>{t(typeLabels[item.client_type as keyof typeof typeLabels] ?? item.client_type)}</Badge></TableCell>
            <TableCell><span className="block max-w-[320px] truncate font-mono text-xs text-muted" title={item.redirect_uris.join('\n')}>{item.redirect_uris.join('  ')}</span></TableCell>
            <TableCell>{item.enabled ? <Badge variant="success">{t('已启用')}</Badge> : <Badge variant="warning">{t('已停用')}</Badge>}</TableCell>
            <TableCell className="whitespace-nowrap text-muted">{date(item.updated_at)}</TableCell>
            <TableCell className="text-right">
              <div className="flex justify-end gap-2">
                <Button variant="secondary" size="sm" onClick={() => setGrantsOf(item)}>{t('授权记录')}</Button>
                {item.client_type === 'confidential' && item.has_secret
                  && <Button variant="secondary" size="sm" onClick={() => setRotating(item)}><KeyRound size={13} aria-hidden="true" />{t('轮换密钥')}</Button>}
                <Button variant="secondary" size="sm" onClick={() => setEditing(item)}>{t('编辑')}</Button>
              </div>
            </TableCell>
          </TableRow>)}
        </TableBody>
      </Table>
      {list.isError && <div role="alert" className="flex items-center gap-2 text-sm text-danger">{t('无法读取客户端列表')} <Button variant="ghost" size="sm" onClick={() => void list.refetch()}>{t('重试')}</Button></div>}
      {list.data && list.data.items.length >= PAGE_SIZE && <p className="text-xs text-muted">{t('仅显示前 {{v0}} 个客户端。', { v0: PAGE_SIZE })}</p>}
    </CardContent></Card>
    {creating && <CreateClient web={web} onClose={() => setCreating(false)} onCreated={refresh} />}
    {editing && <EditClient web={web} client={editing} onClose={() => setEditing(null)} onSaved={refresh} />}
    {rotating && <RotateSecret web={web} client={rotating} onClose={() => setRotating(null)} onRotated={refresh} />}
    {grantsOf && <ClientGrants web={web} client={grantsOf} onClose={() => setGrantsOf(null)} onChanged={refresh} />}
  </div>;
}

// SecretDisclosure renders the one-time secret with the copy affordance.
function SecretDisclosure({ secret, label }: { secret: string; label: string }) {
  const message = useMessage();
  return <div className="flex min-w-0 items-center gap-2">
    <Input label={label} autoComplete="off" readOnly value={secret} onFocus={event => event.currentTarget.select()} className="font-mono" />
    <Button type="button" variant="secondary" onClick={() => { void navigator.clipboard.writeText(secret); message.success(t('密钥已复制')); }}>{t('复制')}</Button>
  </div>;
}

function CreateClient({ web, onClose, onCreated }: { web: WebClient; onClose: () => void; onCreated: () => void }) {
  useLocale();
  const [name, setName] = useState('');
  const [clientType, setClientType] = useState<'public' | 'confidential'>('public');
  const [uris, setUris] = useState('');
  const [created, setCreated] = useState<{ id: string; secret: string } | null>(null);
  const save = useMutation({
    mutationFn: () => web.createMcpOauthClient({ name: name.trim(), client_type: clientType, redirect_uris: redirectList(uris) }),
    onSuccess: result => { setCreated({ id: result.client.id, secret: result.secret }); onCreated(); },
  });
  const invalid = !name.trim() || redirectList(uris).length === 0;
  return <Modal title={t('注册客户端')} onClose={onClose} pending={save.isPending}>
    {created
      ? <div className="flex min-w-0 flex-col gap-4">
          <p role="status">{t('客户端已注册。密钥仅显示这一次，请立即复制并妥善保存。')}</p>
          <SecretDisclosure secret={created.secret || '—'} label={t('客户端密钥')} />
          <p className="text-xs text-muted">{t('客户端 ID：{{v0}}', { v0: created.id })}</p>
          <Button onClick={onClose}>{t('完成')}</Button>
        </div>
      : <div className="flex min-w-0 flex-col gap-4">
          <Input label={t('名称')} maxLength={80} autoComplete="off" value={name} onChange={event => setName(event.target.value)} />
          <SimpleSelect label={t('客户端类型')} value={clientType} onChange={value => setClientType(value === 'confidential' ? 'confidential' : 'public')} options={[
            { value: 'public', label: t('公开客户端（PKCE）') },
            { value: 'confidential', label: t('机密客户端（密钥）') },
          ]} />
          <div className="flex flex-col gap-1">
            <Textarea label={t('回调地址')} rows={4} value={uris} onChange={event => setUris(event.target.value)} />
            <p className="text-xs text-muted">{t('每行一个精确地址；默认仅允许 HTTPS，本机回环可使用 http。')}</p>
          </div>
          {save.isError && <p role="alert" className="text-sm text-danger">{t('注册信息未通过校验，请检查名称与回调地址。')}</p>}
          <div className="sticky bottom-0 z-10 flex justify-end gap-2 border-t border-line bg-surface pt-3">
            <Button type="button" variant="secondary" disabled={save.isPending} onClick={onClose}>{t('取消')}</Button>
            <Button pending={save.isPending} disabled={invalid} onClick={() => save.mutate()}>{t('注册')}</Button>
          </div>
        </div>}
  </Modal>;
}

function EditClient({ web, client, onClose, onSaved }: { web: WebClient; client: McpOauthClient; onClose: () => void; onSaved: () => void }) {
  useLocale();
  const [name, setName] = useState(client.name);
  const [uris, setUris] = useState(client.redirect_uris.join('\n'));
  const [enabled, setEnabled] = useState(client.enabled);
  const save = useMutation({
    mutationFn: () => web.updateMcpOauthClient(client.id, { name: name.trim(), redirect_uris: redirectList(uris), enabled, expected_version: client.version }),
    onSuccess: () => { onSaved(); onClose(); },
  });
  return <Modal title={t('编辑客户端')} onClose={onClose} pending={save.isPending}>
    <div className="flex min-w-0 flex-col gap-4">
      <Input label={t('名称')} maxLength={80} autoComplete="off" value={name} onChange={event => setName(event.target.value)} />
      <div className="flex flex-col gap-1">
        <Textarea label={t('回调地址')} rows={4} value={uris} onChange={event => setUris(event.target.value)} />
        <p className="text-xs text-muted">{t('每行一个精确地址；默认仅允许 HTTPS，本机回环可使用 http。')}</p>
      </div>
      <label className="flex items-center justify-between gap-3 text-sm">
        <span className="flex items-center gap-2"><ShieldCheck size={15} className="text-muted" aria-hidden="true" />{t('允许发起新授权')}</span>
        <Switch checked={enabled} onChange={setEnabled} aria-label={t('允许发起新授权')} />
      </label>
      {save.isError && <p role="alert" className="text-sm text-danger">{t('保存失败：客户端可能已被其他管理员修改，请刷新后重试。')}</p>}
      <div className="sticky bottom-0 z-10 flex justify-end gap-2 border-t border-line bg-surface pt-3">
        <Button type="button" variant="secondary" disabled={save.isPending} onClick={onClose}>{t('取消')}</Button>
        <Button pending={save.isPending} disabled={!name.trim() || redirectList(uris).length === 0} onClick={() => save.mutate()}>{t('保存')}</Button>
      </div>
    </div>
  </Modal>;
}

function RotateSecret({ web, client, onClose, onRotated }: { web: WebClient; client: McpOauthClient; onClose: () => void; onRotated: () => void }) {
  useLocale();
  const [secret, setSecret] = useState('');
  const rotate = useMutation({
    mutationFn: () => web.rotateMcpOauthClientSecret(client.id),
    onSuccess: result => { setSecret(result.secret); onRotated(); },
  });
  return <Modal title={t('轮换客户端密钥')} onClose={onClose} pending={rotate.isPending}>
    {secret
      ? <div className="flex min-w-0 flex-col gap-4">
          <p role="status">{t('旧密钥已立即失效。新密钥仅显示这一次，请立即复制并妥善保存。')}</p>
          <SecretDisclosure secret={secret} label={t('新客户端密钥')} />
          <Button onClick={onClose}>{t('完成')}</Button>
        </div>
      : <div className="flex min-w-0 flex-col gap-4">
          <p className="flex items-start gap-2 text-sm"><Lock size={15} className="mt-0.5 shrink-0 text-warning" aria-hidden="true" />{t('轮换后使用旧密钥的客户端将无法通过令牌端点认证，需要更新其配置。')}</p>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" disabled={rotate.isPending} onClick={onClose}>{t('取消')}</Button>
            <Button pending={rotate.isPending} onClick={() => rotate.mutate()}>{t('确认轮换')}</Button>
          </div>
        </div>}
  </Modal>;
}

function ClientGrants({ web, client, onClose, onChanged }: { web: WebClient; client: McpOauthClient; onClose: () => void; onChanged: () => void }) {
  const locale = useLocale();
  const message = useMessage();
  const [revoking, setRevoking] = useState('');
  const list = useQuery({ queryKey: ['mcp-oauth-client-grants', client.id], queryFn: () => web.listMcpOauthClientGrants(client.id) });
  const revoke = useMutation({
    mutationFn: (id: string) => web.revokeMcpOauthGrant(id),
    onSuccess: () => { setRevoking(''); message.success(t('授权已撤销，其全部令牌已失效')); onChanged(); void list.refetch(); },
  });
  const date = (value: number) => value ? new Date(value * 1000).toLocaleString(locale) : t('尚未使用');
  return <>
    <Modal title={t('授权记录 · {{v0}}', { v0: client.name })} onClose={onClose}>
      <div className="flex min-w-0 flex-col gap-3">
        {list.data?.items.length === 0 && <p className="text-sm text-muted">{t('该客户端暂无有效授权。')}</p>}
        {(list.data?.items ?? []).map(grant => <div key={grant.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-line p-3 text-sm">
          <span className="font-medium text-ink">{grant.username}</span>
          <Badge variant="subtle">{grant.role_name || grant.role_id}</Badge>
          <span className="font-mono text-xs text-muted">{grant.scopes.join(' ')}</span>
          <span className="text-xs text-muted">{t('最近使用')}：{date(grant.last_used_at)}</span>
          <Button variant="secondary" size="sm" className="ml-auto" disabled={revoking === grant.id} onClick={() => setRevoking(grant.id)}>{t('撤销')}</Button>
        </div>)}
      </div>
    </Modal>
    {revoking && <ConfirmDialog title={t('撤销该授权')} description={t('撤销后该用户对此客户端的授权与全部令牌立即失效。')} confirmLabel={t('确认撤销')} cancelLabel={t('取消')} danger pending={revoke.isPending} onConfirm={() => revoke.mutate(revoking)} onCancel={() => setRevoking('')} />}
  </>;
}

// redirectList parses the one-per-line textarea into a bounded, deduplicated list.
function redirectList(raw: string) {
  const seen = new Set<string>();
  const list: string[] = [];
  for (const line of raw.split('\n')) {
    const uri = line.trim();
    if (!uri || seen.has(uri)) continue;
    seen.add(uri);
    list.push(uri);
  }
  return list;
}

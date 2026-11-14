// Author: yunnuo <ymz@ebox.vip>
// Description: MCP access console: runtime switch, connection hint and bounded call limits behind the governance CAS.
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bot, Copy, Info, ShieldCheck } from 'lucide-react';
import type { McpConfig, McpConfigPatch } from '@unicore/sdk';
import { Badge, Button, Card, CardContent, Input, PageHeader, Switch, Textarea, useMessage } from '@unicore/ui';
import { defineMessages, t, useLocale } from '../../../i18n';
import type { PageProps } from '../../../router';

const limitFields = defineMessages([
  { id: 'timeout', label: '默认超时（秒）', hint: '1–120，单次工具调用上限' },
  { id: 'max_request_bytes', label: '请求上限（字节）', hint: '1024–4194304' },
  { id: 'max_result_bytes', label: '结果上限（字节）', hint: '1024–1048576' },
  { id: 'global_concurrency', label: '全局并发', hint: '1–256，单实例' },
  { id: 'user_concurrency', label: '用户并发', hint: '1–32，不高于全局' },
  { id: 'credential_concurrency', label: '凭证并发', hint: '1–16，不高于用户' },
  { id: 'user_calls_per_minute', label: '用户每分钟调用', hint: '1–10000，同一用户全部凭证合计' },
  { id: 'credential_calls_per_minute', label: '凭证每分钟调用', hint: '1–10000' },
  { id: 'log_retention_days', label: '记录保留（天）', hint: '1–180，仅调用元数据' },
] as const);

const limitKey = {
  timeout: 'default_timeout_seconds',
  max_request_bytes: 'max_request_bytes',
  max_result_bytes: 'max_result_bytes',
  global_concurrency: 'global_concurrency',
  user_concurrency: 'user_concurrency',
  credential_concurrency: 'credential_concurrency',
  user_calls_per_minute: 'user_calls_per_minute',
  credential_calls_per_minute: 'credential_calls_per_minute',
  log_retention_days: 'log_retention_days',
} as const;

export function AdminAiAccessPage({ client }: PageProps) {
  useLocale();
  const message = useMessage();
  const cache = useQueryClient();
  const web = client.web!;
  const [draft, setDraft] = useState<Partial<Record<string, string>>>({});
  const config = useQuery({ queryKey: ['mcp-config'], queryFn: () => web.getMcpConfig!() });
  const save = useMutation({
    mutationFn: (values: Record<string, string>) => {
      const data = config.data!;
      const patch: McpConfigPatch = { expected_revision: data.revision };
      if (values.enabled !== undefined) patch.enabled = values.enabled === 'true';
      if (values.pat_enabled !== undefined) patch.pat_enabled = values.pat_enabled === 'true';
      for (const field of limitFields) {
        const raw = values[limitKey[field.id]];
        if (raw !== undefined) patch[limitKey[field.id]] = Number(raw);
      }
      if (values.allowed_origins !== undefined) patch.allowed_origins = values.allowed_origins;
      return web.patchMcpConfig!(patch);
    },
    onSuccess: () => {
      setDraft({});
      message.success(t('接入配置已保存'));
      void cache.invalidateQueries({ queryKey: ['mcp-config'] });
    },
    onError: error => message.error(t(error.message)),
  });
  const value = (key: keyof McpConfig['limits']) => draft[key] ?? String(config.data?.limits[key] ?? '');
  const change = (key: string, update: string) => setDraft(current => ({ ...current, [key]: update }));
  const dirty = Object.keys(draft).length > 0;
  const render = (children: React.ReactNode) => <div className="flex min-w-0 flex-col gap-6"><PageHeader title={t('接入配置')} description={t('启用 MCP 服务并约束外部调用的频率与体积；配置保存采用版本校验，冲突时请刷新重试。')} />{children}</div>;
  if (config.isPending) return render(<Card><CardContent className="py-10 text-center text-sm text-muted" role="status">{t('正在读取接入配置…')}</CardContent></Card>);
  if (config.isError) return render(<Card><CardContent className="flex flex-col items-start gap-3 py-8" role="alert">
    <p className="text-sm text-danger">{t(config.error.message)}</p>
    <Button variant="secondary" onClick={() => void config.refetch()}>{t('重试')}</Button>
  </CardContent></Card>);
  const data = config.data;
  const enabled = draft.enabled !== undefined ? draft.enabled === 'true' : data.enabled;
  return render(<div className="flex min-w-0 flex-col gap-6">
    <Card>
      <CardContent className="flex flex-wrap items-center gap-3 text-sm">
        <Bot size={20} className="shrink-0 text-accent" aria-hidden="true" />
        <span className="text-muted">{t('服务状态')}</span>
        {data.enabled ? <Badge variant="success">{t('已启用')}</Badge> : <Badge variant="subtle">{t('未启用')}</Badge>}
        <span className="flex min-w-0 items-center gap-2 sm:ms-auto">
          <code className="min-w-0 truncate font-mono text-xs text-muted" title={data.endpoint}>{data.endpoint}</code>
          <Button type="button" variant="ghost" size="icon" className="size-7 shrink-0" aria-label={t('复制接入地址')}
            onClick={() => { void navigator.clipboard.writeText(data.endpoint); message.success(t('接入地址已复制')); }}>
            <Copy size={13} aria-hidden="true" />
          </Button>
        </span>
      </CardContent>
    </Card>
    <form onSubmit={event => { event.preventDefault(); save.mutate({ ...draft, enabled: String(enabled), pat_enabled: String(draft.pat_enabled !== undefined ? draft.pat_enabled === 'true' : data.pat_enabled) }); }}
      aria-busy={save.isPending}>
      <Card>
        <CardContent className="flex flex-col gap-5 px-4 py-5">
          <div className="flex flex-wrap items-center gap-4 border-b border-line pb-5">
            <label className="flex flex-1 min-w-52 items-center justify-between gap-3 text-sm font-medium">
              <span>{t('启用 MCP 服务')}<span className="ms-2 block text-xs font-normal text-muted">{t('关闭后 /mcp 返回 503，在途读取会被取消')}</span></span>
              <Switch checked={enabled} disabled={save.isPending} aria-label={t('启用 MCP 服务')} onChange={value => change('enabled', String(value))} />
            </label>
            <label className="flex flex-1 min-w-52 items-center justify-between gap-3 text-sm font-medium">
              <span>{t('允许个人令牌接入')}<span className="ms-2 block text-xs font-normal text-muted">{t('仅在服务启用时生效')}</span></span>
              <Switch checked={draft.pat_enabled !== undefined ? draft.pat_enabled === 'true' : data.pat_enabled} disabled={save.isPending} aria-label={t('允许个人令牌接入')} onChange={value => change('pat_enabled', String(value))} />
            </label>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {limitFields.map(field => <div key={field.id} className="flex flex-col gap-2 text-sm font-medium">
              <Input label={t(field.label)} type="number" required min={1} value={value(limitKey[field.id])} disabled={save.isPending}
                onChange={event => change(limitKey[field.id], event.target.value)} />
              <span className="text-xs font-normal text-muted">{t(field.hint)}</span>
            </div>)}
          </div>
          <div className="flex flex-col gap-2 border-t border-line pt-5 text-sm font-medium">
            <Textarea label={t('允许的浏览器 Origin')} rows={2} maxLength={2048} disabled={save.isPending}
              value={draft.allowed_origins ?? data.allowed_origins} onChange={event => change('allowed_origins', event.target.value)}
              placeholder="https://console.example.com" />
            <span className="flex items-start gap-2 text-xs leading-relaxed font-normal text-muted">
              <ShieldCheck size={15} className="shrink-0" aria-hidden="true" />
              {t('同源 base_url 隐式可信；额外来源请逐条精确登记（空格或逗号分隔），http 仅允许本机回环地址。')}
            </span>
          </div>
        </CardContent>
      </Card>
      <div className="flex flex-wrap items-center justify-end gap-3">
        <p className="me-auto flex items-center gap-2 text-xs text-muted"><Info size={14} aria-hidden="true" />{t('协议版本 {{protocols}}，当前实现能力：工具发现与调用', { protocols: data.supported_protocols.join(' / ') })}</p>
        {dirty && <Button type="button" variant="ghost" disabled={save.isPending} onClick={() => setDraft({})}>{t('重置')}</Button>}
        <Button type="submit" pending={save.isPending} disabled={!dirty}>{t('保存接入配置')}</Button>
      </div>
    </form>
  </div>);
}

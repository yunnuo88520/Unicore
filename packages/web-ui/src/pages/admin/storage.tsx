import { canAction } from '../../permissions';
// Author: yunnuo <ymz@ebox.vip>
// Description: One configuration per provider, explicit activation and shared upload rules.
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AppSwitchField } from '@unicore/form/fields';
import { CheckCircle2, Cloud, FlaskConical, Globe, HardDrive, Info, Plus, RefreshCw, RotateCcw, Save, Server, ShieldCheck, X } from 'lucide-react';
import type { AppClient, StorageClient, StorageLocation, StorageLocationInput } from '@unicore/sdk';
import { defineMessages, t, useLocale } from '../../i18n';
import { AppField, AppForm, useAppForm } from '@unicore/form';
import { cn } from '@unicore/ui/cn';
import { Badge, Button, Card, CardContent, CardFooter, CardHeader, Input, Switch, TabsPrimitive, Textarea, useMessage } from '@unicore/ui';
import { useNavigate } from '@tanstack/react-router';
import { useRouteSearch, type PageProps } from '../../router';
import { productSlug } from '../../product.gen';

const providers = defineMessages([
  { id: 'local', label: '本地存储', icon: HardDrive },
  { id: 'minio', label: 'MinIO', icon: Server },
  { id: 's3', label: 'Amazon S3', icon: Cloud },
  { id: 'oss', label: '阿里云 OSS', icon: Cloud },
  { id: 'cos', label: '腾讯云 COS', icon: Cloud },
] as const);
const sections = defineMessages([{ id: 'config', label: '存储配置' }, { id: 'rules', label: '上传规则' }]);
const providerName = (id: string) => t(providers.find(provider => provider.id === id)?.label ?? id);

export function AdminStoragePage({ client, metadata }: PageProps) {
  if (!client.storage) return null;
  return <fieldset className="contents" disabled={!canAction(metadata,'createStorageLocation')}><StoragePanel client={client} storage={client.storage} /></fieldset>;
}

function StoragePanel({ client, storage }: { client: AppClient; storage: StorageClient }) {
  useLocale();
  const message = useMessage();
  const cache = useQueryClient();
  const navigate = useNavigate();
  const search = useRouteSearch<{ provider: string; tab: string }>();
  const [pending, setPending] = useState('');
  const [saving, setSaving] = useState(false);
  const locations = useQuery({ queryKey: ['storage-locations'], queryFn: () => storage.storageLocations() });
  const action = useMutation({
    mutationFn: async ({ kind, item }: { kind: 'test' | 'activate' | 'browser' | 'cleanup'; item?: StorageLocation }) => {
      setPending(kind);
      switch (kind) {
        case 'test': return storage.testStorage(item!.id);
        case 'activate': return storage.activateStorage(item!.id);
        case 'browser': return storage.storageBrowser(item!.id, location.origin);
        case 'cleanup': return storage.cleanupStorage();
      }
    },
    onSuccess: (_data, vars) => {
      message.success({ test: t('读写、复制与删除测试通过'), activate: t('默认存储已切换'), browser: t('本站跨域已就绪'), cleanup: t('到期清理已执行') }[vars.kind]);
      void cache.invalidateQueries({ queryKey: ['storage-locations'] });
      if (vars.kind === 'activate') {
        void cache.invalidateQueries({ queryKey: ['persistent-settings'] });
        // Reload the document so its CSP includes the newly activated storage origin.
        window.location.reload();
      }
    },
    onSettled: () => setPending(''),
  });
  if (locations.isPending) return <Card><CardContent className="py-10 text-center text-sm text-muted" role="status">{t('正在读取存储配置…')}</CardContent></Card>;
  if (locations.isError) return <Card><CardContent className="flex flex-col items-center gap-2 py-10 text-center" role="alert">
    <p className="text-sm text-danger">{t(locations.error.message)}</p>
    <Button variant="secondary" onClick={() => void locations.refetch()}>{t('重试')}</Button>
  </CardContent></Card>;
  const active = locations.data.items.find(item => item.id === locations.data.active_id);
  const requested = search.provider ?? '';
  const provider = providers.some(item => item.id === requested) ? requested : active?.provider ?? 'local';
  const section = search.tab === 'rules' ? 'rules' : 'config';
  // Older locations remain referenced by historical files; they are not additional editable configurations.
  const item = locations.data.items.find(item => item.provider === provider && item.active)
    ?? locations.data.items.find(item => item.provider === provider);
  const change = (next: { provider?: string; tab?: string }) => void navigate({ to: '/storage', search: { provider, tab: section, ...next }, replace: true });
  const testControl = (target?: StorageLocation) => <Button type="button" variant="secondary" disabled={!target || action.isPending} pending={pending === 'test'} onClick={() => action.mutate({ kind: 'test', item: target })}>
    <FlaskConical size={15} />{t('测试连接')}
  </Button>;
  const activateControl = item && item.id !== active?.id && <Button type="button" disabled={!item.tested || action.isPending} pending={pending === 'activate'} onClick={() => action.mutate({ kind: 'activate', item })}>{t('设为全局默认')}</Button>;
  return <div className="flex min-w-0 flex-col gap-5">
    <Card>
      <CardContent className="flex flex-wrap items-center gap-2.5 text-sm" aria-label={t('全局默认')}>
        <CheckCircle2 size={17} className="shrink-0 text-success" aria-hidden="true" />
        <span className="text-muted">{t('全局默认')}</span>
        <strong className="font-medium">{providerName(active?.provider ?? 'local')}</strong>
        <Badge variant="success">{t('使用中')}</Badge>
        <span className="w-full text-xs text-muted sm:ms-auto sm:w-auto">{t('用于新上传的文件')}</span>
      </CardContent>
    </Card>
    <TabsPrimitive.Root value={section} onValueChange={tab => { if (!saving && !action.isPending) change({ tab }); }}>
      <TabsPrimitive.List aria-label={t('存储设置')} className="mb-5">
        {sections.map(tab => <TabsPrimitive.Trigger key={tab.id} value={tab.id} disabled={saving || action.isPending}>{t(tab.label)}</TabsPrimitive.Trigger>)}
      </TabsPrimitive.List>
      <TabsPrimitive.Content value="config" forceMount hidden={section !== 'config'} className="flex min-w-0 flex-col gap-5 data-[state=inactive]:hidden">
        <div role="group" aria-label={t('存储方式')} className="grid grid-cols-3 gap-2 sm:grid-cols-5">
          {providers.map(({ id, label, icon: Icon }) => <button key={id} type="button" aria-pressed={provider === id} disabled={action.isPending || saving} onClick={() => change({ provider: id })}
            className={cn('flex min-h-20 min-w-0 flex-col items-center justify-center gap-2 rounded-xl border px-2 py-3 text-xs transition-colors outline-none focus-visible:ring-2 focus-visible:ring-focus disabled:opacity-55', provider === id ? 'border-accent bg-primary-soft text-accent ring-1 ring-accent' : 'border-line bg-surface text-muted hover:bg-surface-alt')}>
            <Icon size={21} aria-hidden="true" /><span className="text-center">{t(label)}</span>
          </button>)}
        </div>
        <Card>
          <CardHeader><h2 className="text-md font-semibold">{providerName(provider)}</h2><p className="text-xs text-muted">{provider === 'local' ? t('保存在当前服务器的私有数据目录') : t('连接参数与访问凭据')}</p></CardHeader>
          {provider === 'local' ? <>
            <CardContent className="flex flex-col gap-5 py-5">
              <div className="flex items-center gap-3 border-b border-line pb-5"><HardDrive size={26} className="shrink-0 text-accent" aria-hidden="true" /><div><p className="text-sm font-medium">{t('由应用统一管理文件')}</p><p className="mt-1 text-xs text-muted">{t('文件保持私有，通过授权链接访问。')}</p></div></div>
              <label className="flex flex-col gap-2 text-sm font-medium">{t('存储目录')}<Input value="APP_DATA_DIR / files" readOnly /><span className="text-xs font-normal text-muted">{t('由服务器启动配置决定')}</span></label>
              <p className="flex items-start gap-2 rounded-lg bg-surface-alt p-3 text-xs leading-relaxed text-muted"><Info size={16} className="shrink-0" aria-hidden="true" />{t('上传路径和文件类型限制在“上传规则”中统一设置。')}</p>
            </CardContent>
            <CardFooter className="flex-wrap justify-between gap-2">{testControl(item)}{activateControl}</CardFooter>
          </> : <LocationEditor key={item?.id ?? provider} storage={storage} provider={provider} item={item} busy={action.isPending}
            onBusy={setSaving} onSaved={() => cache.invalidateQueries({ queryKey: ['storage-locations'] })} testControl={testControl(item)} activateControl={activateControl} />}
        </Card>
        {provider !== 'local' && <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted">
          <p className="min-w-0 flex-1 leading-relaxed">{t('请使用浏览器可访问的 Endpoint；HTTPS 站点需使用 HTTPS 地址。部分 MinIO 版本需在服务端配置本站 CORS。')}</p>
          <Button variant="ghost" size="sm" disabled={!item || action.isPending || saving} pending={pending === 'browser'} onClick={() => action.mutate({ kind: 'browser', item })}><Globe size={15} />{t('配置本站跨域')}</Button>
        </div>}
      </TabsPrimitive.Content>
      <TabsPrimitive.Content value="rules" forceMount hidden={section !== 'rules'} className="data-[state=inactive]:hidden">
        {client.settings && <StoragePolicy client={client} cleanup={<Button type="button" variant="secondary" disabled={action.isPending} pending={pending === 'cleanup'} onClick={() => action.mutate({ kind: 'cleanup' })}><RefreshCw size={14} />{t('执行到期清理')}</Button>} />}
      </TabsPrimitive.Content>
    </TabsPrimitive.Root>
  </div>;
}

function LocationEditor({ storage, provider, item, busy, onBusy, onSaved, testControl, activateControl }: {
  storage: StorageClient; provider: string; item?: StorageLocation; busy: boolean; onBusy: (pending: boolean) => void; onSaved: () => Promise<void>; testControl: React.ReactNode; activateControl: React.ReactNode;
}) {
  useLocale();
  const message = useMessage();
  const form = useAppForm<StorageLocationInput>({
    schema: 'StorageLocationInput',
    defaultValues: {
      name: item?.name ?? provider,
      provider: (item?.provider ?? provider) as StorageLocationInput['provider'],
      endpoint: item?.endpoint ?? '', bucket: item?.bucket ?? '', region: item?.region ?? '',
      prefix: item?.prefix ?? productSlug, path_style: item?.path_style ?? provider === 'minio', access_key: '', secret_key: '',
    },
    onSubmit: async values => {
      const required: (keyof StorageLocationInput)[] = ['endpoint', 'bucket', ...(provider === 'oss' ? ['region' as const] : []), ...(!item ? ['access_key' as const, 'secret_key' as const] : [])];
      const missing = required.filter(key => !String(values[key]).trim());
      if (missing.length) {
        for (const key of missing) form.setError(key, { type: 'required', message: t('此项为必填') });
        form.setFocus(missing[0]);
        return;
      }
      onBusy(true);
      try {
        await storage.saveStorage({ ...values, endpoint: values.endpoint.replace(/\/$/, '') }, item?.id);
        form.reset({ ...values, access_key: '', secret_key: '' });
        message.success(t('存储配置已保存'));
        await onSaved();
      } catch (error) { form.applyServerError(error); }
      finally { onBusy(false); }
    },
  });
  const locked = !!item;
  const pending = busy || form.formState.isSubmitting;
  return <AppForm form={form} aria-label={t('存储配置')} className="flex flex-col">
    <fieldset disabled={pending} className="flex min-w-0 flex-col gap-5 px-4 py-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <AppField name="endpoint" label="Endpoint" className="sm:col-span-2"><Input required type="url" readOnly={locked} placeholder={provider === 'cos' ? 'https://bucket-appid.cos.region.myqcloud.com' : t('https://存储 API 地址')} /></AppField>
        <AppField name="bucket" label="Bucket"><Input required readOnly={locked} /></AppField>
        <AppField name="region" label="Region"><Input required={provider === 'oss'} readOnly={locked} placeholder={t('例如 cn-hangzhou')} /></AppField>
        <AppField name="access_key" label="Access Key"><Input autoComplete="off" type="password" required={!item} placeholder={item ? t('留空保留原值') : ''} /></AppField>
        <AppField name="secret_key" label="Secret Key"><Input autoComplete="new-password" type="password" required={!item} placeholder={item ? t('留空保留原值') : ''} /></AppField>
        <AppField name="prefix" label={t('对象前缀')} className="sm:col-span-2"><Input maxLength={200} readOnly={locked} /></AppField>
      </div>
      {['minio', 's3'].includes(provider) && <AppSwitchField name="path_style" label={t('S3 路径式寻址')} disabled={locked || provider === 'minio' || pending} />}
      <p className="flex items-start gap-2 rounded-lg bg-surface-alt p-3 text-xs leading-relaxed text-muted"><ShieldCheck size={16} className="shrink-0" aria-hidden="true" />{locked ? t('已保存的目标地址、Bucket、Region 和前缀固定，以保护历史文件引用。密钥留空保留原值，轮换时自动验证。') : t('使用私有 Bucket 和限定前缀权限。保存配置后测试连接、配置本站跨域，再设为全局默认。')}</p>
    </fieldset>
    <CardFooter className="flex-wrap justify-between gap-2">
      <fieldset className="contents" disabled={form.formState.isSubmitting || form.formState.isDirty}>{testControl}</fieldset>
      <div className="flex flex-wrap gap-2"><Button type="submit" variant={activateControl ? 'secondary' : 'primary'} pending={form.formState.isSubmitting} disabled={busy || (locked && !form.formState.isDirty)}><Save size={14} />{t('保存配置')}</Button><fieldset className="contents" disabled={form.formState.isSubmitting || form.formState.isDirty}>{activateControl}</fieldset></div>
    </CardFooter>
  </AppForm>;
}

function StoragePolicy({ client, cleanup }: { client: AppClient; cleanup: React.ReactNode }) {
  useLocale();
  const message = useMessage();
  const cache = useQueryClient();
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [path, setPath] = useState('');
  const [pathError, setPathError] = useState('');
  const query = useQuery({ queryKey: ['persistent-settings'], queryFn: () => client.settings!() });
  const save = useMutation({
    mutationFn: () => client.patchSettings!({ changes: Object.entries(draft).map(([key, value]) => ({ key, value })) }),
    onSuccess: () => {
      setDraft({}); message.success(t('文件策略已保存'));
      void cache.invalidateQueries({ queryKey: ['persistent-settings'] });
      void cache.invalidateQueries({ queryKey: ['file-upload-policy'] });
    },
  });
  const value = (key: string) => draft[key] ?? query.data?.items.find(item => item.key === key)?.value ?? '';
  const paths = value('storage.upload_paths').split('\n').map(item => item.trim()).filter(Boolean);
  function addPath() {
    const next = path.trim();
    if (!next) return;
    if (next.length > 200 || /[\s\\]/u.test(next) || next.split('/').some(part => !part || part === '.' || part === '..')) { setPathError(t('请输入相对路径，例如 documents 或 reports/2026。')); return; }
    if (paths.length >= 200 || [...paths, next].join('\n').length > 16000) { setPathError(t('上传路径最多 200 条，总长度不超过 16000 字符。')); return; }
    if (!paths.includes(next)) setDraft(current => ({ ...current, 'storage.upload_paths': [...paths, next].join('\n') }));
    setPath(''); setPathError('');
  }
  const fields = (keys: string[]) => query.data?.items.filter(item => keys.includes(item.key)).map(item => <label key={item.key} className="flex min-w-0 flex-col gap-2 text-sm font-medium">
    {t(item.label)}<Input type="number" required min={item.key === 'storage.retention_days' ? 0 : item.key.endsWith('_ttl') ? 60 : item.key === 'storage.part_size_mb' ? 5 : 1}
      max={item.key.endsWith('_ttl') ? 3600 : item.key === 'storage.max_size_mb' ? 65536 : item.key === 'storage.part_size_mb' ? 64 : item.key === 'storage.parallelism' ? 6 : item.key === 'storage.pending_hours' ? 168 : 3650}
      value={value(item.key)} onChange={event => setDraft(current => ({ ...current, [item.key]: event.target.value }))} />
  </label>);
  return <Card>
    <CardHeader><h2 className="text-md font-semibold">{t('统一上传规则')}</h2><p className="text-xs leading-relaxed text-muted">{t('适用于所有存储方式，保存后对新上传生效。')}</p></CardHeader>
    {query.isError ? <CardContent role="alert"><p className="text-sm text-danger">{t(query.error.message)}</p><Button variant="secondary" onClick={() => void query.refetch()}>{t('重试')}</Button></CardContent>
      : query.isPending ? <CardContent role="status" className="text-sm text-muted">{t('正在读取策略…')}</CardContent>
        : <form onSubmit={event => { event.preventDefault(); save.mutate(); }}>
          <fieldset disabled={save.isPending} className="min-w-0">
            <div className="flex flex-col gap-3 border-b border-line px-4 py-5">
              <label htmlFor="storage-upload-path" className="text-sm font-medium">{t('自定义上传路径')}</label>
              <p className="text-xs leading-relaxed text-muted">{t('第一个路径为默认，上传时可选择其他路径；留空使用托管根目录。')}</p>
              <div className="flex flex-wrap gap-2">{paths.map(item => <span key={item} className="flex min-w-0 items-center gap-2 rounded-md border border-line bg-surface-alt py-1 ps-2.5 text-xs"><span className="break-all">{item}</span><Button type="button" variant="ghost" size="icon" className="size-7 shrink-0" aria-label={t('移除路径 {{path}}', { path: item })} onClick={() => setDraft(current => ({ ...current, 'storage.upload_paths': paths.filter(candidate => candidate !== item).join('\n') }))}><X size={13} aria-hidden="true" /></Button></span>)}</div>
              <div className="flex gap-2"><Input id="storage-upload-path" className="min-w-0 sm:max-w-sm" value={path} maxLength={200} placeholder={t('例如 reports/2026')} aria-invalid={!!pathError} aria-describedby={pathError ? 'storage-path-error' : undefined} onChange={event => { setPath(event.target.value); setPathError(''); }} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); addPath(); } }} /><Button type="button" variant="secondary" onClick={addPath}><Plus size={14} />{t('添加')}</Button></div>
              {pathError && <p id="storage-path-error" role="alert" className="text-xs text-danger">{pathError}</p>}
            </div>
            <div className="flex flex-col gap-3 border-b border-line px-4 py-5"><label htmlFor="storage-extensions" className="text-sm font-medium">{t('允许的文件扩展名')}</label><Textarea id="storage-extensions" rows={3} maxLength={16000} value={value('storage.allowed_extensions')} onChange={event => setDraft(current => ({ ...current, 'storage.allowed_extensions': event.target.value }))} /><p className="text-xs text-muted">{t('每行一个扩展名，如 jpg、png、tar.gz，不区分大小写；留空允许所有类型。')}</p></div>
            <div className="grid gap-4 border-b border-line px-4 py-5 sm:grid-cols-2">{fields(['storage.max_size_mb', 'storage.url_ttl', 'storage.retention_days'])}<p className="self-end text-xs leading-relaxed text-muted">{t('保留天数只作用于新上传的文件。0 表示永久保留；临时访问链接默认 5 分钟失效。')}</p></div>
            <details className="px-4 py-5"><summary className="cursor-pointer text-sm font-medium">{t('分片上传与自动清理')}</summary><div className="mt-4 grid gap-4 sm:grid-cols-2">{fields(['storage.part_size_mb', 'storage.parallelism', 'storage.upload_ttl', 'storage.pending_hours'])}</div><div className="mt-4 flex flex-wrap items-center justify-between gap-3"><p className="text-xs leading-relaxed text-muted">{t('未完成上传与到期文件由后台定时清理。已签发的云下载链接会在有效期内继续可用。')}</p>{cleanup}</div></details>
            <CardFooter className="flex-wrap justify-end gap-2"><Button type="button" variant="ghost" disabled={!Object.keys(draft).length} onClick={() => { setDraft({}); setPath(''); setPathError(''); }}><RotateCcw size={14} />{t('重置')}</Button><Button type="submit" pending={save.isPending} disabled={!Object.keys(draft).length}><Save size={14} />{t('保存上传规则')}</Button></CardFooter>
          </fieldset>
        </form>}
  </Card>;
}

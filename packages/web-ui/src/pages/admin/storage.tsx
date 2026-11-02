// Author: yunnuo <ymz@ebox.vip>
// Description: Object storage locations on a provider select bound to the URL search, with tests, activation and file policies.
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Controller } from 'react-hook-form';
import { Check, Cloud, FlaskConical, Globe, HardDrive, Pencil, Plus, RefreshCw, RotateCcw, Save, Trash2 } from 'lucide-react';
import type { AppClient, StorageClient, StorageLocation, StorageLocationInput } from '@unicore/sdk';
import { defineMessages, t, useLocale } from '../../i18n';
import { AppField, AppForm, useAppForm } from '../../lib/form';
import { Badge, Button, Card, CardContent, Checkbox, ConfirmDialog, Input, Modal, SimpleSelect, useMessage } from '../../ui';
import { useNavigate } from '@tanstack/react-router';
import { useRouteSearch, type PageProps } from '../../router';
import { productSlug } from '../../product.gen';

const providers = defineMessages([
  { id: 'local', label: '本地' },
  { id: 'minio', label: 'MinIO' },
  { id: 's3', label: 'Amazon S3' },
  { id: 'oss', label: '阿里云 OSS' },
  { id: 'cos', label: '腾讯云 COS' },
] as const);
const providerName = (id: string) => t(providers.find(provider => provider.id === id)?.label ?? id);
const providerIds: string[] = providers.map(provider => provider.id);

export function AdminStoragePage({ client }: PageProps) {
  if (!client.storage) return null;
  return <StoragePanel client={client} storage={client.storage} />;
}

function StoragePanel({ client, storage }: { client: AppClient; storage: StorageClient }) {
  useLocale();
  const message = useMessage();
  const cache = useQueryClient();
  const navigate = useNavigate();
  const search = useRouteSearch<{ provider: string }>();
  const requested = search.provider ?? '';
  const tab = providerIds.includes(requested) ? requested : 'local';
  const [editing, setEditing] = useState<StorageLocation | 'new' | null>(null);
  const [removing, setRemoving] = useState<StorageLocation | null>(null);
  const [actionID, setActionID] = useState('');
  const [defaultID, setDefaultID] = useState('');
  const locations = useQuery({ queryKey: ['storage-locations'], queryFn: () => storage.storageLocations() });
  const action = useMutation({
    mutationFn: async ({ kind, item }: { kind: 'test' | 'activate' | 'browser' | 'cleanup' | 'delete'; item?: StorageLocation }) => {
      setActionID(item?.id ?? 'cleanup');
      switch (kind) {
        case 'test': return storage.testStorage(item!.id);
        case 'activate': return storage.activateStorage(item!.id);
        case 'browser': return storage.storageBrowser(item!.id, location.origin);
        case 'cleanup': return storage.cleanupStorage();
        case 'delete': return storage.removeStorage(item!.id);
      }
    },
    onSuccess: (_data, vars) => {
      message.success({ test: t('读写、复制与删除测试通过'), activate: t('默认存储已切换'), browser: t('本站跨域已就绪'), cleanup: t('到期清理已执行'), delete: t('存储位置已删除') }[vars.kind]);
      setRemoving(null);
      void cache.invalidateQueries({ queryKey: ['storage-locations'] });
      if (vars.kind === 'activate') location.reload();
    },
    onSettled: () => setActionID(''),
  });
  if (locations.isPending) return <Card><CardContent className="py-10 text-center text-sm text-muted" role="status">{t('正在读取存储配置…')}</CardContent></Card>;
  if (locations.isError) return <Card><CardContent className="flex flex-col items-center gap-2 py-10 text-center" role="alert">
    <p className="text-sm text-danger">{t(locations.error.message)}</p>
    <Button variant="secondary" onClick={() => void locations.refetch()}>{t('重试')}</Button>
  </CardContent></Card>;
  const active = locations.data.items.find(item => item.active);
  const items = locations.data.items.filter(item => item.provider === tab);
  return <div className="flex flex-col gap-4">
    <Card>
      <CardContent className="flex flex-wrap items-center gap-4">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-accent"><Cloud size={22} aria-hidden="true" /></span>
        <div className="min-w-0">
          <strong className="block text-md font-semibold text-ink">{t('文件存储')}</strong>
          <p className="mt-0.5 text-xs text-muted">{t('当前默认：')}{active?.provider === 'local' ? t('本地存储') : active?.name ?? t('本地存储')} · {providerName(active?.provider ?? 'local')}</p>
        </div>
        <div className="flex w-full flex-wrap items-end gap-2 border-t border-line pt-3">
          <label className="flex min-w-0 flex-1 flex-col gap-1.5 text-sm font-medium text-ink">
            {t('全局默认存储位置')}
            <SimpleSelect label={t('全局默认存储位置')} value={defaultID || active?.id || 'local'}
              onChange={setDefaultID} options={locations.data.items.filter(item => item.tested || item.active).map(item => ({ value: item.id, label: `${item.provider === 'local' ? t('本地存储') : item.name} · ${providerName(item.provider)}` }))} />
          </label>
          <Button disabled={!defaultID || defaultID === active?.id || action.isPending} pending={action.isPending && actionID === defaultID}
            onClick={() => { const item = locations.data.items.find(item => item.id === defaultID); if (item) action.mutate({ kind: 'activate', item }); }}>{t('应用全局默认')}</Button>
          <p className="w-full text-xs text-muted">{t('新上传统一使用此位置。历史文件保持原位置，可在文件管理中批量迁移；云位置需先通过连接测试并配置本站跨域。')}</p>
        </div>
        <Badge className="ms-auto">{t('私有访问 · 临时签名')}</Badge>
      </CardContent>
    </Card>
    <div className="flex flex-wrap items-center gap-3">
      <span className="text-xs font-medium text-muted">{t('存储提供商')}</span>
      <SimpleSelect label={t('存储提供商')} className="h-9 w-44" value={tab}
        onChange={id => void navigate({ to: '/storage', search: { provider: id }, replace: true })}
        options={providers.map(provider => ({ value: provider.id, label: t(provider.label) }))} />
    </div>
    <Card>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-md font-semibold text-ink">{providerName(tab)}</h2>
            <p className="mt-0.5 text-xs text-muted">{tab === 'local' ? t('默认保存在服务器私有数据目录，通过签名链接下载。') : t('新增位置后先测试连接，再设为默认。切换不会改变历史文件的位置。')}</p>
          </div>
          {tab !== 'local' && <Button onClick={() => setEditing('new')}><Plus size={15} />{t('新增存储位置')}</Button>}
        </div>
        {!items.length ? <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-line px-4 py-10 text-center">
          <Cloud size={28} className="text-subtle" aria-hidden="true" />
          <strong className="text-sm text-ink">{t('尚未配置 {{provider}}', { provider: providerName(tab) })}</strong>
          <p className="text-xs text-muted">{t('配置保存在当前实例，密钥加密存储。')}</p>
        </div> : <div className="grid gap-3 lg:grid-cols-2">
          {items.map(item => <article key={item.id} className={`rounded-xl border bg-surface p-4 ${item.active ? 'border-primary-line' : 'border-line'}`}>
            <div className="flex items-center gap-3">
              {item.provider === 'local' ? <HardDrive size={22} className="shrink-0 text-accent" aria-hidden="true" /> : <Cloud size={22} className="shrink-0 text-accent" aria-hidden="true" />}
              <div className="min-w-0">
                <h3 className="truncate text-sm font-medium text-ink">{item.provider === 'local' ? t('本地存储') : item.name}</h3>
                <p className="truncate text-2xs text-muted">{item.provider === 'local' ? t('服务器托管目录') : item.bucket}</p>
              </div>
              <Badge variant={item.active ? 'primary' : item.tested ? 'success' : 'subtle'} className="ms-auto">
                {item.active ? t('正在使用') : item.tested ? t('测试通过') : t('待测试')}
              </Badge>
            </div>
            {item.provider !== 'local' && <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-xs">
              <dt className="text-subtle">Endpoint</dt><dd className="truncate text-ink">{item.endpoint}</dd>
              <dt className="text-subtle">{t('Region / 前缀')}</dt><dd className="truncate text-ink">{item.region || t('自动')} / {item.prefix || t('无')}</dd>
            </dl>}
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3">
              <small className="text-2xs text-muted">{t('{{count}} 个关联文件', { count: item.file_count })}</small>
              <div className="flex flex-wrap items-center gap-1.5">
                <Button variant="secondary" size="sm" disabled={action.isPending} onClick={() => action.mutate({ kind: 'test', item })}>
                  <FlaskConical size={13} />{actionID === item.id && action.isPending ? t('处理中…') : t('测试连接')}
                </Button>
                {!item.active && <Button size="sm" disabled={!item.tested || action.isPending} onClick={() => action.mutate({ kind: 'activate', item })}>
                  <Check size={13} />{t('设为默认')}
                </Button>}
                {item.provider !== 'local' && <>
                  <Button variant="secondary" size="sm" disabled={action.isPending} onClick={() => action.mutate({ kind: 'browser', item })}>
                    <Globe size={13} />{t('配置本站跨域')}
                  </Button>
                  <Button variant="ghost" size="icon" aria-label={t('编辑 {{v0}}', { v0: item.name })} onClick={() => setEditing(item)}><Pencil size={14} /></Button>
                  <Button variant="ghost" size="icon" aria-label={t('删除 {{v0}}', { v0: item.name })} disabled={item.active || item.file_count > 0 || action.isPending} onClick={() => setRemoving(item)}><Trash2 size={14} /></Button>
                </>}
              </div>
            </div>
          </article>)}
        </div>}
        {tab !== 'local' && <p className="text-xs leading-relaxed text-muted">
          {t('请先在存储服务创建私有 Bucket。Endpoint 必须能被浏览器直接访问；HTTPS 站点请使用 HTTPS 存储地址。跨域按钮仅合并本站规则，不开启公共读。')}
          {tab === 'minio' ? t(' 部分 MinIO 版本使用服务级 CORS，请在服务配置允许本站 Origin。') : ''}
        </p>}
      </CardContent>
    </Card>
    {client.settings && <StoragePolicy client={client} />}
    <Card>
      <CardContent className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-muted">{t('未完成上传与到期文件由后台定时清理。已签发的云下载链接会在有效期内继续可用。')}</p>
        <Button variant="secondary" disabled={action.isPending} onClick={() => action.mutate({ kind: 'cleanup' })}>
          <RefreshCw size={13} />{actionID === 'cleanup' && action.isPending ? t('处理中…') : t('执行到期清理')}
        </Button>
      </CardContent>
    </Card>
    {editing && <LocationDialog key={editing === 'new' ? `new-${tab}` : editing.id} storage={storage} provider={tab}
      item={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)}
      onSaved={() => { setEditing(null); void cache.invalidateQueries({ queryKey: ['storage-locations'] }); }} />}
    {removing && <ConfirmDialog danger title={t('删除存储位置')} pending={action.isPending}
      description={t('确定删除“{{name}}”的配置？存在文件或待清理对象时无法删除。', { name: removing.name })}
      confirmLabel={t('确认删除')} cancelLabel={t('取消')}
      onConfirm={() => action.mutate({ kind: 'delete', item: removing })} onCancel={() => setRemoving(null)} />}
  </div>;
}

function LocationDialog({ storage, provider, item, onClose, onSaved }: {
  storage: StorageClient; provider: string; item?: StorageLocation; onClose: () => void; onSaved: () => void;
}) {
  useLocale();
  const message = useMessage();
  const form = useAppForm<StorageLocationInput>({
    schema: 'StorageLocationInput',
    defaultValues: {
      name: item?.name ?? '',
      provider: (item?.provider ?? provider) as StorageLocationInput['provider'],
      endpoint: item?.endpoint ?? '',
      bucket: item?.bucket ?? '',
      region: item?.region ?? '',
      prefix: item?.prefix ?? productSlug,
      path_style: item?.path_style ?? provider === 'minio',
      access_key: '',
      secret_key: '',
    },
    onSubmit: async values => {
      try {
        await storage.saveStorage({ ...values, endpoint: values.endpoint.replace(/\/$/, '') }, item?.id);
        message.success(t('存储位置已保存'));
        onSaved();
      } catch (error) {
        form.applyServerError(error);
      }
    },
  });
  const locked = !!item;
  return <Modal title={item ? t('编辑存储位置') : t('新增存储位置')} onClose={onClose} pending={form.formState.isSubmitting}>
    <AppForm form={form} className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <AppField name="name" label={t('位置名称')}><Input required maxLength={80} disabled={form.formState.isSubmitting} /></AppField>
        <AppField name="endpoint" label="Endpoint">
          <Input required type="url" disabled={locked || form.formState.isSubmitting}
            placeholder={provider === 'cos' ? 'https://bucket-appid.cos.region.myqcloud.com' : t('https://存储 API 地址')} />
        </AppField>
        <AppField name="bucket" label="Bucket"><Input required disabled={locked || form.formState.isSubmitting} /></AppField>
        <AppField name="region" label="Region"><Input required={provider === 'oss'} disabled={locked || form.formState.isSubmitting} placeholder={t('例如 cn-hangzhou')} /></AppField>
        <AppField name="prefix" label={t('对象前缀')}><Input maxLength={200} disabled={locked || form.formState.isSubmitting} /></AppField>
        <AppField name="access_key" label="Access Key">
          <Input autoComplete="off" type="password" required={!item} disabled={form.formState.isSubmitting} placeholder={item ? t('留空保留原值') : ''} />
        </AppField>
        <AppField name="secret_key" label="Secret Key">
          <Input autoComplete="new-password" type="password" required={!item} disabled={form.formState.isSubmitting} placeholder={item ? t('留空保留原值') : ''} />
        </AppField>
        <Controller control={form.control} name="path_style" render={({ field }) => (
          <div className="flex items-end pb-1">
            <Checkbox checked={field.value === true} disabled={locked || provider === 'minio' || provider === 'oss' || provider === 'cos' || form.formState.isSubmitting}
              onChange={value => field.onChange(value)}>{t('S3 路径式寻址')}</Checkbox>
          </div>
        )} />
      </div>
      <p className="text-xs leading-relaxed text-muted">
        {item ? t('目标地址、Bucket 和前缀固定；更换目标请新增位置。有文件或正在使用的位置，轮换密钥时会先验证新凭据。') : t('建议使用专用前缀与最小权限账号，允许读、写、复制和删除该前缀内对象。')}
      </p>
      <div className="flex justify-end gap-2">
        <Button variant="secondary" disabled={form.formState.isSubmitting} onClick={onClose}>{t('取消')}</Button>
        <Button type="submit" pending={form.formState.isSubmitting}><Save size={14} />{form.formState.isSubmitting ? t('保存中…') : t('保存位置')}</Button>
      </div>
    </AppForm>
  </Modal>;
}

function StoragePolicy({ client }: { client: AppClient }) {
  useLocale();
  const message = useMessage();
  const cache = useQueryClient();
  const [draft, setDraft] = useState<Record<string, string>>({});
  const query = useQuery({ queryKey: ['persistent-settings'], queryFn: () => client.settings!() });
  const save = useMutation({
    mutationFn: () => client.patchSettings!({ changes: Object.entries(draft).map(([key, value]) => ({ key, value })) }),
    onSuccess: () => {
      setDraft({});
      message.success(t('文件策略已保存'));
      void cache.invalidateQueries({ queryKey: ['persistent-settings'] });
      void cache.invalidateQueries({ queryKey: ['file-upload-policy'] });
    },
    onError: error => message.error(t(error.message)),
  });
  const bounds = (key: string) => ({
    min: key === 'storage.retention_days' ? 0 : key.endsWith('_ttl') ? 60 : key === 'storage.part_size_mb' ? 5 : 1,
    max: key.endsWith('_ttl') ? 3600 : key === 'storage.max_size_mb' ? 65536 : key === 'storage.part_size_mb' ? 64 : key === 'storage.parallelism' ? 6 : key === 'storage.pending_hours' ? 168 : 3650,
  });
  return <Card>
    <CardContent className="flex flex-col gap-3">
      <h2 className="text-md font-semibold text-ink">{t('文件大小与生命周期策略')}</h2>
      <p className="text-xs leading-relaxed text-muted">{t('以下策略统一适用于本地和所有对象存储，仅管理员可修改。大小与分片策略对新上传生效，已开始的上传保留原会话。')}</p>
      <p className="text-xs leading-relaxed text-muted">{t('保留天数只作用于新上传的文件。0 表示永久保留；临时访问链接默认 5 分钟失效。')}</p>
      {query.isError ? <p role="alert" className="text-sm text-danger">{t(query.error.message)}</p>
        : query.isPending ? <p className="text-sm text-muted" role="status">{t('正在读取策略…')}</p>
          : <form className="flex flex-col gap-3" onSubmit={event => { event.preventDefault(); save.mutate(); }}>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {query.data.items.filter(item => item.group === 'storage' && item.key !== 'storage.active').map(item => {
                  const range = bounds(item.key);
                  return <label key={item.key} className="flex flex-col gap-1.5">
                    <span className="text-sm font-medium text-ink">{t(item.label)}</span>
                    <Input type="number" required {...range} value={draft[item.key] ?? item.value}
                      onChange={event => setDraft(current => ({ ...current, [item.key]: event.target.value }))} />
                  </label>;
                })}
              </div>
              <div className="flex items-center gap-2">
                {Object.keys(draft).length > 0 && <Button variant="ghost" size="sm" disabled={save.isPending} onClick={() => setDraft({})}><RotateCcw size={13} />{t('重置')}</Button>}
                <Button type="submit" className="ms-auto" pending={save.isPending} disabled={!Object.keys(draft).length}><Save size={14} />{t('保存文件策略')}</Button>
              </div>
            </form>}
    </CardContent>
  </Card>;
}

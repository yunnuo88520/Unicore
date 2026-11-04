/** Author: yunnuo <ymz@ebox.vip>
 * Description: Explicit preview/save/reset for normalized instance images over the shared client.
 */
import { defineMessages, t, useLocale } from './i18n';
import { useState, useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AppClient, Branding, BrandingInput } from '@unicore/sdk';
import { DefaultBrandMark } from './brand';
import { Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, useMessage } from './ui';
import { invalidateAfter } from './queries';

const slots = defineMessages([
  { id: 'logo', label: '浅色 Logo', help: '网站与账号邮件使用；建议透明背景。' },
  { id: 'logo_dark', label: '深色 Logo', help: '深色主题使用；未设置时沿用浅色 Logo。' },
  { id: 'favicon', label: '站点图标', help: '浏览器标签和网站安装图标；建议正方形。' },
] as const);

export function BrandingPanel({ client, canWrite, onSaved }: { client: AppClient; canWrite: boolean; onSaved: () => void }) {
  useLocale();
  const query = useQuery({ queryKey: ['branding'], queryFn: () => client.branding!() });
  return <Card>
    <CardHeader className="flex-row items-start justify-between gap-3">
      <div>
        <CardTitle>{t('实例品牌')}</CardTitle>
        <CardDescription>{t('最大 256 KiB · PNG/JPEG 16–2048 像素 · 站点图标另支持 ICO 16–256 像素')}</CardDescription>
      </div>
      <Badge>{t('全站共用')}</Badge>
    </CardHeader>
    <CardContent className="flex flex-col gap-3">
      <p className="text-xs text-muted">{t('图片保存后用于网站、登录页和新建邮件。应用安装包图标由项目品牌源生成。')}{!canWrite && t(' 当前账号仅可查看。')}</p>
      {query.isPending ? <p role="status" className="text-sm text-muted">{t('正在读取品牌…')}</p>
        : query.error ? <p role="alert" className="text-sm text-danger">{t(query.error.message)}<button className="ms-2 text-xs text-accent hover:underline" onClick={() => query.refetch()}>{t('重试')}</button></p>
          : <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {slots.map(slot => <BrandSlot key={slot.id} {...slot} branding={query.data!} client={client} canWrite={canWrite} onSaved={onSaved} />)}
              <BrandAccent branding={query.data!} client={client} canWrite={canWrite} onSaved={onSaved} />
            </div>}
    </CardContent>
  </Card>;
}

/** Instance accent color card: overrides the compiled brand accent unless the user picks a preset. */
function BrandAccent({ branding, client, canWrite, onSaved }: { branding: Branding; client: AppClient; canWrite: boolean; onSaved: () => void }) {
  useLocale();
  const [draft, setDraft] = useState('');
  const queryClient = useQueryClient();
  const message = useMessage();
  const valid = /^#[0-9a-fA-F]{6}$/.test(draft);
  const save = useMutation({
    mutationFn: (content: string) => client.updateBranding!({ slot: 'accent', content }),
    onSuccess: async (_, content) => {
      message.success(content ? t('主色已保存') : t('已恢复默认'));
      setDraft('');
      await invalidateAfter(queryClient, 'branding');
      onSaved();
    },
  });
  const current = valid ? draft : branding.accent ?? '';
  const swatch = current || getComputedStyle(document.documentElement).getPropertyValue('--preset-brand').trim();
  const colorValue = /^#[0-9a-fA-F]{6}$/.test(swatch) ? swatch : getComputedStyle(document.documentElement).getPropertyValue('--preset-brand').trim();
  return <form className="flex flex-col gap-2 rounded-lg border border-line bg-surface-alt p-3" aria-label={t('品牌主色')} onSubmit={event => { event.preventDefault(); if (valid) save.mutate(draft); }}>
    <h3 className="text-sm font-medium text-ink">{t('品牌主色')}</h3>
    <div className="flex h-24 items-center justify-center rounded-md border border-line p-2">
      <span className="size-10 rounded-full border border-line" style={swatch ? { background: swatch } : undefined} />
    </div>
    <p className="text-2xs text-muted">{t('覆盖编译期品牌主色；用户选择的主题预设仍然优先。')}</p>
    <div className="flex items-center gap-2">
      <input aria-label={t('选择颜色')} type="color" className="size-8 shrink-0 cursor-pointer rounded-xs border border-line bg-surface p-0.5 disabled:opacity-55" disabled={!canWrite || save.isPending} value={colorValue} onChange={event => setDraft(event.target.value)} />
      <input className="h-8 w-full min-w-0 rounded-md border border-line bg-surface px-2 text-xs text-ink outline-none focus-visible:ring-2 focus-visible:ring-focus disabled:opacity-55" aria-label={t('品牌主色')} aria-invalid={!!draft && !valid} disabled={!canWrite || save.isPending} value={draft} placeholder={t('跟随编译期品牌')} onChange={event => setDraft(event.target.value)} />
    </div>
    {draft && !valid && <p role="alert" className="text-2xs text-danger">{t('主色格式为 #RRGGBB')}</p>}
    {save.error && <p role="alert" className="text-2xs text-danger">{t(save.error.message)}</p>}
    <div className="mt-auto flex flex-wrap items-center gap-2">
      <Button type="submit" size="sm" pending={save.isPending} disabled={!canWrite || !valid}>{t('保存品牌主色')}</Button>
      {draft && <Button type="button" variant="ghost" size="sm" disabled={save.isPending} onClick={() => setDraft('')}>{t('取消预览')}</Button>}
      <Button type="button" variant="ghost" size="sm" disabled={!canWrite || !branding.accent || save.isPending} onClick={() => save.mutate('')}>{t('恢复默认')}</Button>
    </div>
  </form>;
}

function BrandSlot({ id, label, help, branding, client, canWrite, onSaved }: { id: BrandingInput['slot']; label: string; help: string; branding: Branding; client: AppClient; canWrite: boolean; onSaved: () => void }) {
  useLocale();
  const [draft, setDraft] = useState('');
  const [mime, setMime] = useState('image/png');
  const [filename, setFilename] = useState('');
  const selection = useRef(0);
  const [reset, setReset] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();
  const message = useMessage();
  const save = useMutation({
    mutationFn: (content: string) => client.updateBranding!({ slot: id, content }),
    onSuccess: async (_, content) => {
      message.success(content ? t('图片已保存') : t('已恢复默认'));
      setDraft(''); setReset(false);
      if (input.current) input.current.value = '';
      setFilename('');
      await invalidateAfter(queryClient, 'branding');
      onSaved();
    },
  });
  async function select(file?: File) {
    const revision = ++selection.current;
    setFilename(file?.name ?? ''); setDraft(''); message.destroy('message-error'); save.reset(); setReset(false);
    if (!file) return;
    const icon = id === 'favicon' && (['image/x-icon', 'image/vnd.microsoft.icon'].includes(file.type) || /\.ico$/i.test(file.name));
    const contentType = icon ? 'image/x-icon' : file.type;
    if (file.size > 256 * 1024 || (!icon && !['image/png', 'image/jpeg'].includes(file.type))) {
      message.error(id === 'favicon' ? t('请选择不超过 256 KiB 的 PNG、JPEG 或 ICO 图片') : t('请选择不超过 256 KiB 的 PNG 或 JPEG 图片'));
      return;
    }
    try {
      const content = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onerror = reject; reader.onload = () => resolve(String(reader.result).split(',')[1]); reader.readAsDataURL(file); });
      const image = new Image(); image.src = `data:${contentType};base64,${content}`; await image.decode();
      if (image.width < 16 || image.height < 16 || image.width > 2048 || image.height > 2048) throw new Error();
      if (revision === selection.current) { setMime(contentType); setDraft(content); }
    } catch { if (revision === selection.current) message.error(t('图片无法读取，或边长超出 16–2048 像素')); }
  }
  const preview = draft ? `data:${mime};base64,${draft}` : branding[id];
  return <form className="flex flex-col gap-2 rounded-lg border border-line bg-surface-alt p-3" aria-label={t(label)} onSubmit={event => { event.preventDefault(); if (draft) save.mutate(draft); }}>
    <h3 className="text-sm font-medium text-ink">{t(label)}</h3>
    <div className={`flex h-24 items-center justify-center rounded-md border border-line p-2 ${id === 'logo_dark' ? 'bg-(--dark-surface)' : 'bg-surface'}`}>
      {preview ? <img src={preview} alt={t('{{v0}}{{v1}}预览', { v0: t(label), v1: draft ? t('待保存') : t('当前') })} className="max-h-full max-w-full object-contain" />
        : <DefaultBrandMark size={56} />}
    </div>
    <p className="text-2xs text-muted">{t(help)}</p>
    <div className="flex items-center gap-2">
      <Button type="button" variant="secondary" size="sm" disabled={!canWrite || save.isPending} onClick={() => input.current?.click()}>{t('选择图片')}</Button>
      <span className="truncate text-2xs text-muted">{filename || t('尚未选择图片')}</span>
    </div>
    <input className="hidden" ref={input} id={`brand-${id}`} type="file" accept={id === 'favicon' ? 'image/png,image/jpeg,image/x-icon,image/vnd.microsoft.icon,.ico' : 'image/png,image/jpeg'} disabled={!canWrite || save.isPending} onChange={event => { void select(event.target.files?.[0]); }} />
    {draft && <p className="text-2xs text-accent" role="status">{t('待保存预览，点击保存后生效。')}</p>}
    {save.error && <p role="alert" className="text-2xs text-danger">{t(save.error.message)}</p>}
    <div className="mt-auto flex flex-wrap items-center gap-2">
      <Button type="submit" size="sm" pending={save.isPending} disabled={!canWrite || !draft}>{t('保存{{label}}', { label: t(label) })}</Button>
      {draft && <Button type="button" variant="ghost" size="sm" disabled={save.isPending} onClick={() => { setDraft(''); setFilename(''); if (input.current) input.current.value = ''; }}>{t('取消预览')}</Button>}
      <Button type="button" variant="ghost" size="sm" disabled={!canWrite || !branding[id] || save.isPending} onClick={() => setReset(true)}>{t('恢复默认')}</Button>
    </div>
    {reset && <div className="flex flex-wrap items-center gap-2 rounded-md border border-warning/30 bg-warning-soft p-2">
      <p className="text-xs text-ink">{t('确认恢复{{label}}', { label: t(label) })}？</p>
      <Button type="button" variant="secondary" size="sm" pending={save.isPending} onClick={() => save.mutate('')}>{t('确认恢复')}</Button>
      <Button type="button" variant="ghost" size="sm" onClick={() => setReset(false)}>{t('取消')}</Button>
    </div>}
  </form>;
}

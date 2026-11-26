/** Author: yunnuo <ymz@ebox.vip>
 * Description: Explicit preview/save/reset for normalized instance images over the shared client.
 */
import { defineMessages, t, useLocale } from './i18n';
import { useState, useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AppClient, Branding, BrandingInput } from '@unicore/sdk';
import { BrandLockup, DefaultBrandMark } from './brand';
import { Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Input, RadioGroup, RadioGroupItem, useMessage } from '@unicore/ui';
import { invalidateAfter } from './queries';

const slots = defineMessages([
  { id: 'logo', label: '浅色 Logo', help: '网站与账号邮件使用；建议透明背景。' },
  { id: 'logo_dark', label: '深色 Logo', help: '深色主题使用；未设置时沿用浅色 Logo。' },
  { id: 'favicon', label: '站点图标', help: '折叠导航和浏览器标签使用；未设置 Logo 时也用于网站品牌，建议正方形。' },
] as const);
const displayModes = defineMessages([
  { id: 'icon-title', label: '图标 + 站点名称', help: 'Logo 高度 32px、宽度自适应且不超过 100px，站点名称并排显示并自动省略。' },
  { id: 'wordmark', label: '完整字标', help: '横版 Logo 最宽 100px，不重复显示站点名称；侧栏版本号与 Logo 同行。' },
] as const);
type BrandDisplayMode = (typeof displayModes)[number]['id'];

function PreviewImage({ src, alt, icon }: { src: string; alt: string; icon: boolean }) {
  const [failed, setFailed] = useState(false);
  return failed ? <p role="alert" className="max-w-56 text-center text-xs leading-relaxed text-danger">{t('图片加载失败，请重新选择图片并保存。')}</p>
    : <img src={src} alt={alt} onError={() => setFailed(true)} className={`${icon ? 'max-h-20 max-w-20' : 'max-h-full max-w-full'} object-contain`} />;
}

export function BrandingPanel({ client, canWrite, onSaved, siteName }: { client: AppClient; canWrite: boolean; onSaved: () => void; siteName: string }) {
  useLocale();
  const queryClient = useQueryClient();
  const message = useMessage();
  const [displayModeDraft, setDisplayModeDraft] = useState<BrandDisplayMode | null>(null);
  const query = useQuery({ queryKey: ['branding'], queryFn: () => client.branding!() });
  const currentDisplayMode = query.data?.display_mode ?? 'icon-title';
  const displayMode = displayModeDraft ?? currentDisplayMode;
  const saveDisplayMode = useMutation({
    mutationFn: (value: BrandDisplayMode) => client.patchSettings!({ changes: [{ key: 'branding.display_mode', value }] }),
    onSuccess: async () => {
      setDisplayModeDraft(null);
      message.success(t('显示方式已保存'));
      await Promise.all([invalidateAfter(queryClient, 'branding'), invalidateAfter(queryClient, 'settings')]);
      onSaved();
    },
  });
  return <Card>
    <CardHeader className="flex-row items-start justify-between gap-3">
      <div>
        <CardTitle>{t('实例品牌')}</CardTitle>
        <CardDescription>{t('Logo 最多 500 KB，支持任意尺寸和比例的 PNG/JPEG；站点图标另支持 ICO（16–256 像素）')}</CardDescription>
      </div>
      <Badge>{t('全站共用')}</Badge>
    </CardHeader>
    <CardContent className="flex flex-col gap-5">
      <p className="text-xs text-muted">{t('图片保存后用于网站、登录页和新建邮件。应用安装包图标由项目品牌源生成。')}{!canWrite && t(' 当前账号仅可查看。')}</p>
      {query.isPending ? <p role="status" className="text-sm text-muted">{t('正在读取品牌…')}</p>
        : query.error ? <p role="alert" className="text-sm text-danger">{t(query.error.message)}<Button variant="link" size="sm" className="ms-2 h-auto p-0" onClick={() => query.refetch()}>{t('重试')}</Button></p>
          : <div className="flex flex-col gap-6">
              <section className="border-t border-line pt-5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <h3 className="text-sm font-medium text-ink">{t('网站品牌显示方式')}</h3>
                    <p className="mt-1 max-w-2xl text-xs text-muted">{t('选择网站如何组合 Logo 与站点名称。')}</p>
                  </div>
                  <Button type="button" size="sm" pending={saveDisplayMode.isPending} disabled={!canWrite || !client.patchSettings || displayMode === currentDisplayMode || saveDisplayMode.isPending} onClick={() => saveDisplayMode.mutate(displayMode)}>{t('保存显示方式')}</Button>
                </div>
                <RadioGroup className="mt-3 grid gap-2 sm:grid-cols-2" label={t('网站品牌显示方式')} name="branding-display-mode" value={displayMode} disabled={!canWrite || !client.patchSettings || saveDisplayMode.isPending} onValueChange={value => { saveDisplayMode.reset(); setDisplayModeDraft(value as BrandDisplayMode); }}>
                  {displayModes.map(mode => <RadioGroupItem key={mode.id} value={mode.id} itemLabel={t(mode.label)} className="min-h-16 items-start rounded-md py-2" disabled={!canWrite || !client.patchSettings || saveDisplayMode.isPending || (mode.id === 'wordmark' && !query.data!.logo && !query.data!.logo_dark)}>
                    <span className="flex min-w-0 flex-col gap-0.5 text-start">
                      <span className="text-sm font-medium">{t(mode.label)}</span>
                      <span className="text-2xs leading-4 text-muted">{t(mode.help)}</span>
                      {mode.id === 'wordmark' && !query.data!.logo && !query.data!.logo_dark && <span className="text-2xs leading-4 text-warning">{t('上传 Logo 后生效')}</span>}
                    </span>
                  </RadioGroupItem>)}
                </RadioGroup>
                {saveDisplayMode.error && <p role="alert" className="mt-2 text-xs text-danger">{t(saveDisplayMode.error.message)}</p>}
              </section>
              <div className="grid gap-x-8 gap-y-6 border-t border-line pt-5 lg:grid-cols-2">
                {slots.filter(slot => slot.id !== 'favicon').map(slot => <BrandSlot key={slot.id} {...slot} branding={query.data!} client={client} canWrite={canWrite} onSaved={onSaved} siteName={siteName} displayMode={displayMode} />)}
              </div>
              <section className="border-t border-line pt-5">
                <BrandSlot {...slots.find(slot => slot.id === 'favicon')!} branding={query.data!} client={client} canWrite={canWrite} onSaved={onSaved} siteName={siteName} displayMode={displayMode} />
              </section>
              <section className="border-t border-line pt-5">
                <BrandAccent branding={query.data!} client={client} canWrite={canWrite} onSaved={onSaved} />
              </section>
            </div>}
    </CardContent>
  </Card>;
}

/** Instance accent setting: overrides the compiled brand accent unless the user picks a preset. */
function BrandAccent({ branding, client, canWrite, onSaved }: { branding: Branding; client: AppClient; canWrite: boolean; onSaved: () => void }) {
  useLocale();
  const [draft, setDraft] = useState('');
  const queryClient = useQueryClient();
  const message = useMessage();
  const valid = /^#[0-9a-fA-F]{6}$/.test(draft);
  const save = useMutation({
    mutationFn: (content: string) => client.updateBranding!({ slot: 'accent', content }),
    onSuccess: async (branding, content) => {
      queryClient.setQueryData(['branding'], branding);
      message.success(content ? t('主色已保存') : t('已恢复默认'));
      setDraft('');
      await invalidateAfter(queryClient, 'branding');
      onSaved();
    },
  });
  const current = valid ? draft : branding.accent ?? '';
  const swatch = current || getComputedStyle(document.documentElement).getPropertyValue('--preset-brand').trim();
  const colorValue = /^#[0-9a-fA-F]{6}$/.test(swatch) ? swatch : getComputedStyle(document.documentElement).getPropertyValue('--preset-brand').trim();
  return <form className="flex flex-col gap-3" aria-label={t('品牌主色')} onSubmit={event => { event.preventDefault(); if (valid) save.mutate(draft); }}>
    <div className="flex min-w-0 items-start gap-3">
      <span className="size-8 shrink-0 rounded-full border border-line" aria-hidden="true" style={swatch ? { background: swatch } : undefined} />
      <div className="min-w-0 flex-1">
        <h3 className="text-sm font-medium text-ink">{t('品牌主色')}</h3>
        <p className="text-xs text-muted">{t('覆盖编译期品牌主色；用户选择的主题预设仍然优先。')}</p>
      </div>
    </div>
    <div className="grid w-full min-w-0 grid-cols-[2.5rem_minmax(0,1fr)] items-center gap-2 sm:max-w-md">
      <label htmlFor="brand-accent-color" className="sr-only">{t('选择颜色')}</label>
      <Input id="brand-accent-color" type="color" className="size-10 shrink-0 cursor-pointer p-1" disabled={!canWrite || save.isPending} value={colorValue} onChange={event => setDraft(event.target.value)} />
      <Input label={t('品牌主色')} aria-invalid={!!draft && !valid} disabled={!canWrite || save.isPending} value={draft} placeholder={t('跟随编译期品牌')} onChange={event => setDraft(event.target.value)} />
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

function BrandSlot({ id, label, help, branding, client, canWrite, onSaved, siteName, displayMode }: { id: BrandingInput['slot']; label: string; help: string; branding: Branding; client: AppClient; canWrite: boolean; onSaved: () => void; siteName: string; displayMode: BrandDisplayMode }) {
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
    onSuccess: async (branding, content) => {
      queryClient.setQueryData(['branding'], branding);
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
    if (file.size > 500 * 1024 || (!icon && !['image/png', 'image/jpeg'].includes(file.type))) {
      message.error(id === 'favicon' ? t('请选择不超过 500 KB 的 PNG、JPEG 或 ICO 图片') : t('请选择不超过 500 KB 的 PNG 或 JPEG 图片'));
      return;
    }
    try {
      const content = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onerror = reject; reader.onload = () => resolve(String(reader.result).split(',')[1]); reader.readAsDataURL(file); });
      const image = new Image(); image.src = `data:${contentType};base64,${content}`; await image.decode();
      if (revision === selection.current) { setMime(contentType); setDraft(content); }
    } catch { if (revision === selection.current) message.error(t('图片无法读取，请选择有效的 PNG 或 JPEG 文件')); }
  }
  const preview = draft ? `data:${mime};base64,${draft}` : branding[id];
  const logo = id !== 'favicon';
  // The dark slot renders the light logo at runtime when empty, so the raw
  // preview must say so instead of implying the compiled mark is configured.
  const image = preview ? <PreviewImage key={preview} src={preview} alt={t('{{v0}}{{v1}}预览', { v0: t(label), v1: draft ? t('待保存') : t('当前') })} icon={id === 'favicon'} />
    : id === 'logo_dark' && branding.logo ? <p className="max-w-56 text-center text-2xs leading-relaxed text-(--dark-muted)">{t('未设置，网站将沿用浅色 Logo')}</p>
    : <DefaultBrandMark size={56} />;
  return <form className="flex min-w-0 flex-col gap-3" aria-label={t(label)} onSubmit={event => { event.preventDefault(); if (draft) save.mutate(draft); }}>
    <div>
      <h3 className="text-sm font-medium text-ink">{t(label)}</h3>
      <p className="mt-1 text-xs text-muted">{t(help)}</p>
    </div>
    {logo ? <div className="grid min-w-0 gap-3 sm:grid-cols-2">
      <figure className="min-w-0">
        <figcaption className="mb-1.5 text-xs font-medium text-ink">{t('原图预览')}</figcaption>
        <div className={`flex h-36 min-w-0 items-center justify-center overflow-hidden rounded-md border p-4 ${id === 'logo_dark' ? 'border-(--dark-border) bg-(--dark-surface)' : 'border-(--light-border) bg-(--light-surface)'}`}>
          {image}
        </div>
        <p className="mt-1.5 text-2xs text-muted">{t('图片完整显示，不裁切')}</p>
      </figure>
      <figure className="min-w-0">
        <figcaption className="mb-1.5 text-xs font-medium text-ink">{t('网站展示预览')}</figcaption>
        <div className={`flex h-36 min-w-0 items-center justify-center overflow-hidden rounded-md border p-4 ${id === 'logo_dark' ? 'border-(--dark-border) bg-(--dark-surface) text-(--dark-text)' : 'border-(--light-border) bg-(--light-surface) text-(--light-text)'}`}>
          <BrandLockup branding={{ ...branding, [id]: preview, display_mode: displayMode }} appearance={id === 'logo_dark' ? 'dark' : 'light'} name={siteName} maxWidth={180} size={32} />
        </div>
        <p className="mt-1.5 text-2xs text-muted">{t('网站展示效果会按版位缩放图片')}</p>
      </figure>
    </div> : <div className="flex h-28 min-h-28 items-center justify-center rounded-md border border-line bg-surface p-3">
      {image}
    </div>}
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

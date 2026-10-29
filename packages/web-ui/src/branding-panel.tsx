/** Author: yunnuo <ymz@ebox.vip>
 * Description: Explicit preview/save/reset for normalized instance images over the shared client.
 */
import {defineMessages, t, useLocale } from './i18n';
import { useState, useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AppClient, Branding, BrandingInput } from '@unicore/sdk';
import { DefaultBrandMark } from './brand';
import { Form } from './forms';
import { useMessage } from './message';
import { invalidateAfter } from './queries';
const slots = defineMessages([{ id: 'logo', label: '浅色 Logo', help: '网站与账号邮件使用；建议透明背景。' }, { id: 'logo_dark', label: '深色 Logo', help: '深色主题使用；未设置时沿用浅色 Logo。' }, { id: 'favicon', label: '站点图标', help: '浏览器标签和网站安装图标；建议正方形。' }] as const);
export function BrandingPanel({ client, canWrite, onSaved }: { client: AppClient; canWrite: boolean; onSaved: () => void }) {
  useLocale();
  const query = useQuery({ queryKey: ['branding'], queryFn: () => client.branding!() });
  return <section className="panel branding-panel"><div className="panel-heading"><div><h2>{t("实例品牌")}</h2><p>{t("最大 256 KiB · PNG/JPEG 16–2048 像素 · 站点图标另支持 ICO 16–256 像素")}</p></div><span className="subtle-badge">{t("全站共用")}</span></div><p className="help-text">{t("图片保存后用于网站、登录页和新建邮件。应用安装包图标由项目品牌源生成。")}{!canWrite && t(' 当前账号仅可查看。')}</p>{query.isPending ? <p role="status">{t("正在读取品牌…")}</p> : query.error ? <p role="alert">{t(query.error.message)}<button className="text-button" onClick={() => query.refetch()}>{t("重试")}</button></p> : <div className="branding-grid">{slots.map(slot => <BrandSlot key={slot.id} {...slot} branding={query.data!} client={client} canWrite={canWrite} onSaved={onSaved} />)}</div>}</section>;
}
function BrandSlot({ id, label, help, branding, client, canWrite, onSaved }: { id: BrandingInput['slot']; label: string; help: string; branding: Branding; client: AppClient; canWrite: boolean; onSaved: () => void }) {
  useLocale();
  const [draft, setDraft] = useState(''); const [mime, setMime] = useState('image/png'); const [filename,setFilename]=useState(''); const selection = useRef(0); const [reset, setReset] = useState(false); const input = useRef<HTMLInputElement>(null); const queryClient = useQueryClient();
  const message = useMessage();
  const save = useMutation({ mutationFn: (content: string) => client.updateBranding!({ slot: id, content }), onSuccess: async (_, content) => { message.success(content ? t('图片已保存') : t('已恢复默认')); setDraft(''); setReset(false); if (input.current) input.current.value = ''; setFilename(''); await invalidateAfter(queryClient, 'branding'); onSaved(); } });
  async function select(file?: File) {
    const revision=++selection.current; setFilename(file?.name ?? ''); setDraft(''); message.destroy('message-error'); save.reset(); setReset(false);
    if (!file) return;
    const icon = id === 'favicon' && (['image/x-icon', 'image/vnd.microsoft.icon'].includes(file.type) || /\.ico$/i.test(file.name));
    const contentType = icon ? 'image/x-icon' : file.type;
    if (file.size > 256 * 1024 || (!icon && !['image/png', 'image/jpeg'].includes(file.type))) { message.error(id==='favicon'?t('请选择不超过 256 KiB 的 PNG、JPEG 或 ICO 图片'):t('请选择不超过 256 KiB 的 PNG 或 JPEG 图片')); return; }
    try {
      const content = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onerror = reject; reader.onload = () => resolve(String(reader.result).split(',')[1]); reader.readAsDataURL(file); });
      const image = new Image(); image.src = `data:${contentType};base64,${content}`; await image.decode();
      if (image.width < 16 || image.height < 16 || image.width > 2048 || image.height > 2048) throw new Error();
      if (revision===selection.current) {setMime(contentType);setDraft(content);}
    } catch { if(revision===selection.current)message.error(t('图片无法读取，或边长超出 16–2048 像素')); }
  }
  const preview = draft ? `data:${mime};base64,${draft}` : branding[id];
  return <Form error={save.error} pending={save.isPending} className="brand-slot" aria-label={t(label)} onSubmit={event => { event.preventDefault(); if (draft) save.mutate(draft); }}><h3>{t(label)}</h3><div className={`brand-preview ${id === 'logo_dark' ? 'brand-preview-dark' : ''}`}>{preview ? <img src={preview} alt={t("{{v0}}{{v1}}预览",{v0:t(label),v1:draft ? t('待保存') : t('当前')})} /> : <DefaultBrandMark size={64} />}</div><p className="help-text">{t(help)}</p><label htmlFor={`brand-${id}`}>{t("选择{{label}}",{label:t(label)})}</label><div className="brand-file-control"><button type="button" className="secondary-button" disabled={!canWrite || save.isPending} onClick={() => input.current?.click()}>{t("选择图片")}</button><span className="help-text">{filename || t('尚未选择图片')}</span></div><input className="brand-file-input" ref={input} id={`brand-${id}`} type="file" accept={id === 'favicon' ? 'image/png,image/jpeg,image/x-icon,image/vnd.microsoft.icon,.ico' : 'image/png,image/jpeg'} disabled={!canWrite || save.isPending} onChange={event => { void select(event.target.files?.[0]); }} />{draft && <p className="help-text" role="status">{t("待保存预览，点击保存后生效。")}</p>}<div className="brand-actions"><button className="primary-button" disabled={!canWrite || !draft || save.isPending}>{t("保存{{label}}",{label:t(label)})}</button>{draft && <button type="button" className="text-button" disabled={save.isPending} onClick={() => { setDraft(''); setFilename(''); if (input.current) input.current.value = ''; }}>{t("取消预览")}</button>}<button type="button" className="text-button" disabled={!canWrite || !branding[id] || save.isPending} onClick={() => setReset(true)}>{t("恢复默认")}</button></div>{reset && <div className="brand-reset"><p>{t("确认恢复{{label}}",{label:t(label)})}？</p><button type="button" className="secondary-button" disabled={save.isPending} onClick={() => save.mutate('')}>{t("确认恢复")}</button><button type="button" className="text-button" onClick={() => setReset(false)}>{t("取消")}</button></div>}</Form>;
}

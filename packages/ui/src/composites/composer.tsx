// Author: yunnuo <ymz@ebox.vip>
// Description: Controlled composition panel, provider rail and caller-owned attachment lifecycle.
import { useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { ArrowUp, Check, ChevronDown, FileText, SlidersHorizontal } from 'lucide-react';
import { Button } from '../button';
import { Input, Label, NativeSelect, Textarea } from '../input';
import { Popover, PopoverContent, PopoverTrigger } from '../popover';
import { cn } from '../cn';
import { useLocale } from '../i18n';
import { compositeT as t } from './messages';
import './composer.css';

export interface ComposerModel { id: string; label: string; provider: string; disabled?: boolean }
export interface ComposerPermissionOption { id: string; label: string; description?: string; disabled?: boolean }
export interface ComposerPanelProps {
  models?: ComposerModel[]; modelId?: string; onModelChange?: (id: string) => void;
  effort?: string; effortOptions?: { id: string; label: string }[]; onEffortChange?: (value: string) => void;
  permissionOptions?: ComposerPermissionOption[]; permissionId?: string; onPermissionChange?: (id: string) => void; disabled?: boolean;
  /** Supply value to use the complete input panel; omit it for the backwards-compatible toolbar. */
  value?: string; onChange?: (value: string) => void; onSubmit?: (value: string) => void; status?: ReactNode;
  busy?: boolean; label?: string; placeholder?: string; attachments?: ReactNode; actions?: ReactNode; className?: string;
}
function ComposerControls({ models = [], modelId, onModelChange, effort = '', effortOptions, onEffortChange, permissionOptions = [], permissionId = '', onPermissionChange, disabled }: ComposerPanelProps) {
  useLocale(); const id = useId(); const [query, setQuery] = useState(''); const [open, setOpen] = useState(false); const [effortOpen, setEffortOpen] = useState(false); const [provider, setProvider] = useState<string | null>(null);
  const providers = [...new Set(models.map(model => model.provider))];
  const selectedProvider = provider !== null && providers.includes(provider) ? provider : null;
  const filtered = models.filter(model => (selectedProvider === null || model.provider === selectedProvider) && `${model.provider} ${model.label}`.toLocaleLowerCase().includes(query.toLocaleLowerCase()));
  return <div className="flex min-w-0 flex-wrap items-center gap-1.5">
    <Popover open={open} onOpenChange={setOpen}><PopoverTrigger asChild><Button variant="ghost" size="sm" className="max-w-full rounded-full bg-surface-alt" disabled={disabled || !onModelChange} aria-label={t('Select model')}><span className="truncate">{models.find(model => model.id === modelId)?.label ?? t('Select model')}</span><ChevronDown size={12} aria-hidden="true" /></Button></PopoverTrigger>
      <PopoverContent className="w-[min(28rem,calc(100vw-2rem))] overflow-hidden p-0"><div className="border-b border-line p-3"><Label className="sr-only" htmlFor={`${id}-search`}>{t('Search models')}</Label><Input id={`${id}-search`} placeholder={t('Search models')} value={query} onChange={event => setQuery(event.target.value)} /></div><div className="grid grid-cols-[minmax(6rem,0.7fr)_minmax(0,1.5fr)]">
        <div role="group" aria-label={t('Model providers')} className="max-h-64 space-y-1 overflow-y-auto border-e border-line bg-surface-alt p-2"><Button size="sm" variant={selectedProvider === null ? 'secondary' : 'ghost'} className="w-full justify-start" aria-pressed={selectedProvider === null} onClick={() => setProvider(null)}>{t('All providers')}</Button>{providers.map(item => <Button key={item} size="sm" variant={item === selectedProvider ? 'secondary' : 'ghost'} aria-pressed={item === selectedProvider} className="h-auto w-full justify-start whitespace-normal text-start" onClick={() => setProvider(item)}>{item}</Button>)}</div>
        <div className="max-h-64 space-y-1 overflow-y-auto p-2" role="group" aria-label={t('Models')}>
          {filtered.map(model => <Button key={model.id} variant={model.id === modelId ? 'secondary' : 'ghost'} className="h-auto w-full justify-between whitespace-normal py-2 text-start" disabled={disabled || model.disabled || !onModelChange} aria-pressed={model.id === modelId} aria-label={`${model.provider} / ${model.label}`} onClick={() => { onModelChange?.(model.id); setOpen(false); }}><span><span className="block text-xs text-subtle">{model.provider}</span>{model.label}</span>{model.id === modelId && <Check size={14} aria-hidden="true" />}</Button>)}
          {!filtered.length && <p className="px-2 py-6 text-sm text-muted">{t('No models found')}</p>}
        </div></div></PopoverContent>
    </Popover>
    {effortOptions ? <Popover open={effortOpen} onOpenChange={setEffortOpen}><PopoverTrigger asChild><Button variant="ghost" size="sm" className="rounded-full" aria-label={t('Effort')} disabled={disabled || !onEffortChange}><SlidersHorizontal size={13} aria-hidden="true" />{effortOptions.find(option => option.id === effort)?.label ?? t('Select effort')}<ChevronDown size={12} aria-hidden="true" /></Button></PopoverTrigger><PopoverContent className="w-52 p-1.5"><div role="group" aria-label={t('Effort')}>{effortOptions.map(option => <Button key={option.id} variant={option.id === effort ? 'secondary' : 'ghost'} size="sm" className="w-full justify-between" aria-pressed={option.id === effort} disabled={disabled || !onEffortChange} onClick={() => { onEffortChange?.(option.id); setEffortOpen(false); }}>{option.label}{option.id === effort && <Check size={13} aria-hidden="true" />}</Button>)}</div></PopoverContent></Popover> : <div className="flex items-center gap-1"><Label className="sr-only" htmlFor={`${id}-effort`}>{t('Effort')}</Label><Input id={`${id}-effort`} className="h-7 w-24 rounded-full border-transparent bg-surface-alt text-xs shadow-none" placeholder={t('Effort')} value={effort} disabled={disabled || !onEffortChange} onChange={event => onEffortChange?.(event.target.value)} /></div>}
    {!!permissionOptions.length && <div className="min-w-0"><Label className="sr-only" htmlFor={`${id}-permission`}>{t('Permission mode')}</Label><NativeSelect id={`${id}-permission`} className="h-7 max-w-44 rounded-full border-transparent bg-surface-alt py-0 text-xs shadow-none" aria-describedby={permissionOptions.find(option => option.id === permissionId)?.description ? `${id}-policy` : undefined} value={permissionId} disabled={disabled || !onPermissionChange} onChange={event => onPermissionChange?.(event.target.value)}><option value="">{t('Select permission mode')}</option>{permissionOptions.map(option => <option key={option.id} value={option.id} disabled={option.disabled}>{option.label}</option>)}</NativeSelect>{permissionOptions.find(option => option.id === permissionId)?.description && <p id={`${id}-policy`} className="mt-1 max-w-56 text-xs text-muted">{permissionOptions.find(option => option.id === permissionId)?.description}</p>}</div>}
  </div>;
}
export function ComposerPanel(props: ComposerPanelProps) {
  return props.value !== undefined ? <Composer {...props} value={props.value} /> : <div className={props.className}><ComposerControls {...props} />{props.status && <div className="mt-2 text-xs text-muted">{props.status}</div>}</div>;
}
export interface ComposerProps extends ComposerPanelProps { value: string }
export function Composer({ value, onChange, onSubmit, busy, label, placeholder, attachments, actions, status, className, disabled, ...panel }: ComposerProps) {
  useLocale(); const id = useId(); const composing = useRef(false); const input = useRef<HTMLTextAreaElement>(null); const canSubmit = !!onSubmit && !!value.trim() && !busy && !disabled;
  useLayoutEffect(() => {
    const node = input.current; if (!node) return;
    const resize = () => { const style = getComputedStyle(node); const line = Number.parseFloat(style.lineHeight) || 24; const padding = (Number.parseFloat(style.paddingTop) || 0) + (Number.parseFloat(style.paddingBottom) || 0); node.style.height = 'auto'; const max = line * 10 + padding; node.style.height = `${Math.min(max, Math.max(line + padding, node.scrollHeight))}px`; node.style.overflowY = node.scrollHeight > max ? 'auto' : 'hidden'; };
    resize(); if (typeof ResizeObserver === 'undefined') return;
    let width = node.clientWidth; const observer = new ResizeObserver(() => { if (node.clientWidth !== width) { width = node.clientWidth; resize(); } }); observer.observe(node); return () => observer.disconnect();
  }, [value]);
  const submit = () => { if (canSubmit) onSubmit?.(value); };
  // A div deliberately avoids nesting forms when embedded in a caller-owned form.
  return <div className={cn('ui-composer overflow-hidden rounded-xl border border-line bg-surface shadow-card transition-colors focus-within:border-focus', className)} aria-busy={busy || undefined}>
    <div className="px-4 pt-3"><Label className="sr-only" htmlFor={id}>{label ?? t('Message')}</Label><Textarea ref={input} id={id} rows={1} className="ui-composer-input min-h-0 resize-none rounded-none border-0 bg-transparent px-0 py-1 text-base shadow-none focus-visible:ring-0" value={value} placeholder={placeholder} disabled={disabled || !onChange} onChange={event => onChange?.(event.target.value)} onCompositionStart={() => { composing.current = true; }} onCompositionEnd={() => { composing.current = false; }} onKeyDown={event => {
      if (event.key === 'Enter' && !event.shiftKey && !event.altKey && !event.ctrlKey && !event.metaKey && !composing.current && !event.nativeEvent.isComposing && event.nativeEvent.keyCode !== 229) { event.preventDefault(); submit(); }
    }} /></div>
    {attachments && <div className="px-3 pb-2">{attachments}</div>}
    {status && <div className="px-4 py-2 text-xs text-muted">{status}</div>}
    <div className="flex flex-wrap items-center justify-between gap-2 px-3 pb-3 pt-2"><ComposerControls {...panel} disabled={disabled || busy} /><div className="ms-auto flex items-center gap-2">{actions}<Button type="button" size="icon" className="rounded-full" aria-label={t('Send')} disabled={!canSubmit} pending={busy} onClick={submit}>{!busy && <ArrowUp size={17} aria-hidden="true" />}<span className="sr-only">{t('Send')}</span></Button></div></div>
  </div>;
}
export type ComposerAttachmentStatus = 'queued' | 'uploading' | 'success' | 'error';
export interface ComposerAttachment { id: string; name: string; status: ComposerAttachmentStatus; progress?: number; detail?: ReactNode; type?: string; preview?: ReactNode; thumbnail?: { src: string; alt?: string }; progressVariant?: 'bar' | 'ring' }
export interface ComposerAttachmentTileProps { attachment: ComposerAttachment; onRemove?: (id: string) => void; onRetry?: (id: string) => void; disabled?: boolean }
export function ComposerAttachmentTile({ attachment, onRemove, onRetry, disabled }: ComposerAttachmentTileProps) {
  useLocale(); const labels: Record<ComposerAttachmentStatus, string> = { queued: t('Queued'), uploading: t('Uploading'), success: t('Uploaded'), error: t('Upload failed') }; const progress = attachment.progress === undefined ? undefined : Math.max(0, Math.min(100, attachment.progress));
  return <li className="min-w-0 rounded-lg border border-line bg-surface-alt p-2.5 text-sm text-ink" aria-busy={attachment.status === 'uploading' || undefined}>
    <div className="flex items-center gap-3"><div className="flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-md border border-line bg-surface text-muted">{attachment.preview ?? (attachment.thumbnail ? <img src={attachment.thumbnail.src} alt={attachment.thumbnail.alt ?? ''} className="size-full object-cover" /> : <FileText size={20} aria-hidden="true" />)}</div><div className="min-w-0 flex-1"><p className="truncate font-medium" title={attachment.name}>{attachment.name}</p>{attachment.type && <p className="text-xs text-subtle">{attachment.type}</p>}<p role="status" className={attachment.status === 'error' ? 'text-xs text-danger' : 'text-xs text-muted'}>{labels[attachment.status]}</p></div>
      {attachment.status === 'uploading' && attachment.progressVariant === 'ring' && <svg role="progressbar" aria-label={t('Upload progress')} aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress} viewBox="0 0 36 36" className={cn('size-8 shrink-0 -rotate-90 text-accent', progress === undefined && 'motion-safe:animate-spin')}><circle cx="18" cy="18" r="15" fill="none" stroke="currentColor" strokeWidth="3" className="text-line" /><circle cx="18" cy="18" r="15" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" pathLength="100" strokeDasharray="100" strokeDashoffset={100 - (progress ?? 25)} /></svg>}
    </div>
    {attachment.status === 'uploading' && attachment.progressVariant !== 'ring' && <progress aria-label={t('Upload progress')} max={100} value={progress} className="mt-2 h-1 w-full accent-accent" />}{attachment.detail}
    <div className="mt-1 flex justify-end gap-1">{attachment.status === 'error' && <Button size="sm" variant="secondary" disabled={disabled || !onRetry} onClick={() => onRetry?.(attachment.id)}>{t('Retry')}</Button>}<Button size="sm" variant="ghost" disabled={disabled || !onRemove} aria-label={t('Remove {{name}}', { name: attachment.name })} onClick={() => onRemove?.(attachment.id)}>{t('Remove')}</Button></div>
  </li>;
}
export function ComposerAttachmentStrip({ attachments, onRemove, onRetry, disabled }: { attachments: ComposerAttachment[]; onRemove?: (id: string) => void; onRetry?: (id: string) => void; disabled?: boolean }) {
  useLocale(); return <ul aria-label={t('Attachments')} className="grid gap-2 sm:grid-cols-2">{attachments.map(attachment => <ComposerAttachmentTile key={attachment.id} attachment={attachment} onRemove={onRemove} onRetry={onRetry} disabled={disabled} />)}</ul>;
}
export function ComposerLoader({ busy = true, effect = 'border', label, children, className }: { busy?: boolean; effect?: 'border' | 'pulse' | 'none'; label?: string; children?: ReactNode; className?: string }) {
  useLocale(); return <div aria-busy={busy} data-busy={busy} data-effect={effect} className={cn('ui-composer-loader relative isolate rounded-xl border border-line bg-surface p-3', className)}>{busy && <span role="status" className="mb-2 block text-xs text-muted">{label ?? t('Working')}</span>}{children}</div>;
}

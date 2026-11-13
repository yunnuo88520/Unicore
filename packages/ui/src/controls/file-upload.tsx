// Author: yunnuo <ymz@ebox.vip>
// Description: Local file selection and drag/drop with explicit acceptance and rejection callbacks.
import { forwardRef, useId, useRef, useState, type InputHTMLAttributes, type ReactNode } from 'react';
import { Upload } from 'lucide-react';
import { Button } from '../button';
import { Progress } from '../misc';
import { X } from 'lucide-react';
import { cn } from '../cn';
import { useControlI18n } from './messages';

export interface RejectedFile { file: File; reason: 'type' | 'size' | 'count' }
export interface UploadFileItem { id: string; name: string; progress: number; status: string; error?: string }
export interface FileUploadDropzoneProps {
  label: string; description?: ReactNode; accept?: string; multiple?: boolean; maxFiles?: number; maxSize?: number; disabled?: boolean;
  onFiles: (files: File[]) => void; onReject?: (files: RejectedFile[]) => void; className?: string; name?: string; inputProps?: Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'onChange' | 'accept' | 'multiple' | 'disabled' | 'name' | 'value' | 'defaultValue'>;
  files?: readonly UploadFileItem[]; onRemove?: (id: string) => void;
}
function accepts(file: File, accept?: string) {
  if (!accept?.trim()) return true;
  return accept.split(',').some(rule => {
    const token = rule.trim().toLowerCase();
    if (!token) return false;
    if (token.startsWith('.')) return file.name.toLowerCase().endsWith(token);
    if (token.endsWith('/*')) return file.type.toLowerCase().startsWith(token.slice(0, -1));
    return file.type.toLowerCase() === token;
  });
}
export const FileUploadDropzone = forwardRef<HTMLDivElement, FileUploadDropzoneProps>(function FileUploadDropzone({ label, description, accept, multiple = false, maxFiles, maxSize, disabled, onFiles, onReject, className, name, inputProps, files, onRemove }, ref) {
  const { t } = useControlI18n();
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const depth = useRef(0);
  const [dragging, setDragging] = useState(false);
  const [queued, setQueued] = useState<UploadFileItem[]>([]);
  const receive = (files: File[]) => {
    if (disabled) return;
    const accepted: File[] = [];
    const rejected: RejectedFile[] = [];
    const limit = Math.max(0, Math.floor(multiple ? maxFiles ?? Infinity : 1));
    for (const file of files) {
      const reason = !accepts(file, accept) ? 'type' : maxSize !== undefined && file.size > maxSize ? 'size' : accepted.length >= limit ? 'count' : undefined;
      if (reason) rejected.push({ file, reason }); else accepted.push(file);
    }
    if (accepted.length) { setQueued(accepted.map((file, index) => ({ id: `${file.name}-${file.lastModified}-${index}`, name: file.name, progress: 0, status: 'Queued' }))); onFiles(accepted); }
    if (rejected.length) onReject?.(rejected);
  };
  return <div ref={ref} role="group" aria-label={t(label)} aria-disabled={disabled || undefined} className={cn('flex cursor-pointer flex-col items-center gap-3 rounded-lg border border-dashed border-line bg-surface p-6 text-center text-sm text-muted', dragging && !disabled && 'border-focus bg-surface-alt', disabled && 'cursor-not-allowed opacity-55', className)}
    onClick={event => { if (!disabled && !(event.target as HTMLElement).closest('button,input,li')) input.current?.click(); }}
    onDragEnter={event => { event.preventDefault(); depth.current++; if (!disabled) setDragging(true); }}
    onDragOver={event => { event.preventDefault(); event.dataTransfer.dropEffect = disabled ? 'none' : 'copy'; }}
    onDragLeave={event => { event.preventDefault(); depth.current = Math.max(0, depth.current - 1); if (!depth.current) setDragging(false); }}
    onDrop={event => { event.preventDefault(); depth.current = 0; setDragging(false); receive(Array.from(event.dataTransfer.files)); }}>
    <Upload size={24} aria-hidden="true" /><p className="font-medium text-ink">{t(label)}</p>{description && <div id={`${id}-description`}>{description}</div>}
    <p id={`${id}-limits`} className="text-xs leading-5">{accept || t('Any file type')}{' · '}{maxSize !== undefined ? t('Up to {{size}} MB per file', { size: Number((maxSize / 1024 / 1024).toPrecision(3)) }) : t('No size limit')}</p>
    <input {...inputProps} ref={input} type="file" name={name} accept={accept} multiple={multiple} disabled={disabled} tabIndex={-1} className="sr-only" aria-label={t(label)} aria-describedby={[description ? `${id}-description` : '', `${id}-limits`, inputProps?.['aria-describedby']].filter(Boolean).join(' ')}
      onChange={event => { receive(Array.from(event.target.files ?? [])); event.target.value = ''; }} />
    <Button type="button" variant="secondary" disabled={disabled} onClick={() => input.current?.click()}>{t('Choose files')}</Button><p>{t('Or drop files here')}</p>
    {!!(files ?? queued).length && <ul className="flex w-full min-w-0 cursor-default flex-col gap-3 text-start">{(files ?? queued).map(file => <li key={file.id} className="flex min-w-0 items-start gap-3 rounded-lg border border-line p-3"><div className="flex min-w-0 flex-1 flex-col gap-2"><span className="truncate text-sm text-ink">{file.name}</span><Progress value={Math.max(0, Math.min(100, file.progress))} aria-label={file.name} /><span className={cn('text-xs', file.error ? 'text-danger' : 'text-muted')}>{file.error ?? (files ? file.status : t(file.status))}</span></div><button type="button" disabled={disabled || !!files && !onRemove} aria-label={t('Remove {{label}}', { label: file.name })} className="flex size-8 shrink-0 items-center justify-center rounded-md text-muted outline-none hover:bg-surface-alt focus-visible:ring-2 focus-visible:ring-focus disabled:opacity-55" onClick={() => { if (files) onRemove?.(file.id); else { setQueued(items => items.filter(item => item.id !== file.id)); onRemove?.(file.id); } }}><X size={16} aria-hidden="true" /></button></li>)}</ul>}
  </div>;
});

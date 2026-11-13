// Author: yunnuo <ymz@ebox.vip>
// Description: Local file selection and drag/drop with explicit acceptance and rejection callbacks.
import { forwardRef, useId, useRef, useState, type InputHTMLAttributes, type ReactNode } from 'react';
import { Upload } from 'lucide-react';
import { Button } from '../button';
import { cn } from '../cn';
import { useControlI18n } from './messages';

export interface RejectedFile { file: File; reason: 'type' | 'size' | 'count' }
export interface FileUploadDropzoneProps {
  label: string; description?: ReactNode; accept?: string; multiple?: boolean; maxFiles?: number; maxSize?: number; disabled?: boolean;
  onFiles: (files: File[]) => void; onReject?: (files: RejectedFile[]) => void; className?: string; name?: string; inputProps?: Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'onChange' | 'accept' | 'multiple' | 'disabled' | 'name' | 'value' | 'defaultValue'>;
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
export const FileUploadDropzone = forwardRef<HTMLDivElement, FileUploadDropzoneProps>(function FileUploadDropzone({ label, description, accept, multiple = false, maxFiles, maxSize, disabled, onFiles, onReject, className, name, inputProps }, ref) {
  const { t } = useControlI18n();
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const depth = useRef(0);
  const [dragging, setDragging] = useState(false);
  const receive = (files: File[]) => {
    if (disabled) return;
    const accepted: File[] = [];
    const rejected: RejectedFile[] = [];
    const limit = Math.max(0, Math.floor(multiple ? maxFiles ?? Infinity : 1));
    for (const file of files) {
      const reason = !accepts(file, accept) ? 'type' : maxSize !== undefined && file.size > maxSize ? 'size' : accepted.length >= limit ? 'count' : undefined;
      if (reason) rejected.push({ file, reason }); else accepted.push(file);
    }
    if (accepted.length) onFiles(accepted);
    if (rejected.length) onReject?.(rejected);
  };
  return <div ref={ref} role="group" aria-label={t(label)} aria-disabled={disabled || undefined} className={cn('flex flex-col items-center gap-3 rounded-lg border border-dashed border-line bg-surface p-6 text-center text-sm text-muted', dragging && !disabled && 'border-focus bg-surface-alt', disabled && 'opacity-55', className)}
    onDragEnter={event => { event.preventDefault(); depth.current++; if (!disabled) setDragging(true); }}
    onDragOver={event => { event.preventDefault(); event.dataTransfer.dropEffect = disabled ? 'none' : 'copy'; }}
    onDragLeave={event => { event.preventDefault(); depth.current = Math.max(0, depth.current - 1); if (!depth.current) setDragging(false); }}
    onDrop={event => { event.preventDefault(); depth.current = 0; setDragging(false); receive(Array.from(event.dataTransfer.files)); }}>
    <Upload size={24} aria-hidden="true" /><p className="font-medium text-ink">{t(label)}</p>{description && <div id={`${id}-description`}>{description}</div>}
    <input {...inputProps} ref={input} type="file" name={name} accept={accept} multiple={multiple} disabled={disabled} tabIndex={-1} className="sr-only" aria-label={t(label)} aria-describedby={description ? `${id}-description` : undefined}
      onChange={event => { receive(Array.from(event.target.files ?? [])); event.target.value = ''; }} />
    <Button variant="secondary" disabled={disabled} onClick={() => input.current?.click()}>{t('Choose files')}</Button><p>{t('Or drop files here')}</p>
  </div>;
});

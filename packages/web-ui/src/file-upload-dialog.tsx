// Author: yunnuo <ymz@ebox.vip>
// Description: Shared resumable upload dialog with byte progress, pause, retry and explicit abandonment.
import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { File, LoaderCircle, Pause, Play, ShieldCheck, Trash2, Upload, X } from 'lucide-react';
import { AppError, type AppClient, type FileEntry, type UploadProgress, type UploadStage } from '@unicore/sdk';
import { t, useLocale } from './i18n';
import { Button, Dialog, DialogContent, DialogDescription, DialogTitle, NativeSelect, Progress, useMessage } from '@unicore/ui';
import { cn } from '@unicore/ui/cn';

const bytes = (n: number) => n >= 1073741824 ? `${(n / 1073741824).toFixed(1)} GiB` : n >= 1048576 ? `${(n / 1048576).toFixed(1)} MiB` : `${(n / 1024).toFixed(1)} KiB`;

export function FileUploadDialog({ client, resume, onClose, onUploaded, title, accept, maxSize }: { client: AppClient; resume?: FileEntry; onClose: () => void; onUploaded?: (file: FileEntry) => void; title?: string; accept?: string; maxSize?: number }) {
  useLocale();
  const api = client.files!;
  const [uploadPath,setUploadPath]=useState('');
  const message = useMessage();
  const cache = useQueryClient();
  const [file, setFile] = useState<globalThis.File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [stage, setStage] = useState<UploadStage>('hashing');
  const [session, setSession] = useState(resume?.file_id);
  const [paused, setPaused] = useState(!!resume);
  const [hashBytes, setHashBytes] = useState(0);
  const [progress, setProgress] = useState<UploadProgress>({ loaded: 0, total: resume?.size ?? 0, completedParts: 0, totalParts: 0 });
  const input = useRef<HTMLInputElement>(null);
  const zone = useRef<HTMLButtonElement>(null);
  const abort = useRef<AbortController | null>(null);
  useEffect(() => () => abort.current?.abort(), []);
  const policy = useQuery({ queryKey: ['file-upload-policy'], queryFn: () => api.uploadPolicy() });
  const status = useQuery({ queryKey: ['upload-session', resume?.file_id], queryFn: () => api.uploadStatus(resume!.file_id), enabled: !!resume });
  useEffect(() => {
    if (status.data) {
      const value = status.data;
      setProgress({ loaded: value.parts.reduce((sum, part) => sum + part.size, 0), total: value.file.size, completedParts: value.parts.length, totalParts: value.part_count });
    }
  }, [status.data]);
  const upload = useMutation({
    mutationFn: async () => {
      abort.current = new AbortController();
      setPaused(false); setHashBytes(0);
      try {
        return await api.uploadFile(file!, {
          resumeId: session,
          uploadPath: uploadPath || policy.data?.upload_paths?.[0],
          signal: abort.current.signal,
          onStage: setStage,
          onHashProgress: setHashBytes,
          onProgress: setProgress,
          onSession: value => { setSession(value.file.file_id); void cache.invalidateQueries({ queryKey: ['files'] }); },
        });
      } catch (error) {
        if (error instanceof AppError && error.code === 'REQUEST_CANCELLED') { setPaused(true); return null; }
        setPaused(true);
        throw error;
      }
    },
    onSuccess: result => { if (result) { if (onUploaded) onUploaded(result); else message.success(t('文件上传完成')); onClose(); } },
  });
  const discard = useMutation({
    mutationFn: () => api.deleteFile(session!),
    onSuccess: () => { message.success(t('上传已取消，临时分片将自动清理')); onClose(); },
  });
  const pending = upload.isPending || discard.isPending;
  const pick = (value: globalThis.File | null) => { setFile(value); upload.reset(); };
  const invalidType = !!file && !!accept && !accept.split(',').some(type => type.trim() === file.type);
  const invalidExtension = !!file && !session && !!policy.data?.allowed_extensions?.length && !policy.data.allowed_extensions.some(ext => file.name.toLowerCase().endsWith(`.${ext.toLowerCase().replace(/^\./, '')}`));
  const sizeLimit = Math.min(policy.data?.max_size ?? Infinity, maxSize ?? Infinity);
  const tooLarge = !!file && !session && file.size > sizeLimit;
  const percent = stage === 'hashing' && upload.isPending
    ? Math.round(hashBytes / (file?.size || 1) * 100)
    : Math.round(progress.loaded / (progress.total || 1) * 100);
  const selected = file ?? resume;
  const closeDisabled = pending || (stage === 'confirming' && upload.isPending);
  return <Dialog open onOpenChange={open => { if (!open && !closeDisabled) onClose(); }}>
    <DialogContent showClose={false} aria-label={title ?? (resume ? t('继续上传') : t('上传文件'))}>
      <div className="mb-3 flex flex-col gap-1 pe-8">
        <DialogTitle>{title ?? (resume ? t('继续上传') : t('上传文件'))}</DialogTitle>
        <DialogDescription>{session ? t('关闭或刷新后，可从文件列表继续；超期分片会自动清理。') : t('文件保持私有，访问需要业务授权。')}</DialogDescription>
      </div>
      <button type="button" className="absolute end-3 top-3 inline-flex size-8 items-center justify-center rounded-md text-muted transition-colors outline-none hover:bg-primary-soft hover:text-accent focus-visible:ring-2 focus-visible:ring-focus disabled:pointer-events-none disabled:opacity-55" aria-label={t('关闭对话框')} disabled={closeDisabled} onClick={onClose}><X size={17} aria-hidden="true" /></button>
      <form className="flex flex-col gap-3" aria-busy={pending} onSubmit={event => { event.preventDefault(); if (file && !tooLarge && !invalidExtension && !invalidType) upload.mutate(); }}>
        {upload.error && <p role="alert" className="rounded-md border border-danger-line bg-danger-soft px-3 py-2 text-sm text-danger">{t(upload.error.message)}</p>}
        <input ref={input} className="sr-only" type="file" accept={accept ?? policy.data?.allowed_extensions?.map(ext => `.${ext.replace(/^\./, '')}`).join(',')} aria-label={t('选择文件')} disabled={pending} tabIndex={-1} onChange={event => pick(event.target.files?.[0] ?? null)} />
      <button ref={zone} type="button" data-autofocus
        className={cn('upload-zone flex flex-col items-center gap-1.5 rounded-lg border border-dashed px-4 py-7 text-center outline-none transition-colors focus-visible:ring-2 focus-visible:ring-focus disabled:cursor-not-allowed disabled:opacity-55',
            dragging ? 'border-primary bg-primary-soft' : selected ? 'border-line bg-surface-alt' : 'border-line hover:border-primary hover:bg-primary-soft')}
          disabled={pending}
          onClick={() => input.current?.click()}
          onDragOver={event => { event.preventDefault(); if (!pending) setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={event => {
            event.preventDefault(); setDragging(false);
            if (!pending) {
              if (event.dataTransfer.files.length > 1) message.info(t('每次上传一个文件，请分别添加'));
              pick(event.dataTransfer.files[0] ?? null);
            }
          }}>
          <span className="flex size-11 items-center justify-center rounded-lg bg-primary-soft text-accent"><Upload size={24} aria-hidden="true" /></span>
          <strong className="text-sm font-medium text-ink">
            {dragging ? t('松开即可添加文件') : session ? t('重新选择原文件以继续') : file ? t('点击替换，或拖入其他文件') : t('将文件拖到这里')}
          </strong>
          <span className="text-xs text-muted">{policy.data ? t('单文件最大 {{size}} · 支持分片续传', { size: bytes(sizeLimit) }) : t('正在读取策略…')}</span>
        </button>
        {selected && <div className="upload-file-card flex items-center gap-2.5 rounded-lg border border-line bg-surface-alt px-3 py-2">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-surface text-muted"><File size={23} aria-hidden="true" /></span>
          <div className="min-w-0">
            <strong className="block truncate text-sm text-ink">{file?.name ?? resume?.original_name}</strong>
            <small className="block text-2xs text-muted">{bytes(selected.size)}{resume && !file ? ` · ${t('等待选择原文件')}` : ''}</small>
          </div>
          {file && <span className="rounded-full bg-primary-soft px-2 py-0.5 text-2xs font-medium text-accent">{t('已选择')}</span>}
          {file && !pending && <button type="button" className="ms-auto inline-flex size-7 items-center justify-center rounded-md text-muted transition-colors outline-none hover:bg-primary-soft hover:text-accent focus-visible:ring-2 focus-visible:ring-focus" aria-label={t('移除已选文件')} onClick={() => { pick(null); if (input.current) input.current.value = ''; zone.current?.focus(); }}><X size={17} /></button>}
        </div>}
        {!session && !!policy.data?.upload_paths?.length && <label className="flex flex-col gap-1.5 text-sm font-medium">{t('上传路径')}<NativeSelect aria-label={t('上传路径')} value={uploadPath || policy.data.upload_paths[0]} disabled={pending} onChange={event => setUploadPath(event.target.value)}>{policy.data.upload_paths.map(path => <option key={path} value={path}>{path}</option>)}</NativeSelect></label>}
        {!!policy.data?.allowed_extensions?.length && <p className="text-xs text-muted">{t('允许的扩展名：{{extensions}}', { extensions: policy.data.allowed_extensions.join(', ') })}</p>}
        {invalidType && <p role="alert" className="text-sm text-danger">{t('请选择 PNG、JPEG 或 GIF 图片')}</p>}
        {invalidExtension && <p role="alert" className="text-sm text-danger">{t('文件扩展名不在允许列表中')}</p>}
        {tooLarge && <p role="alert" className="text-sm text-danger">{t('文件超过管理员设置的大小上限')}</p>}
        {(pending || session) && <div role="status" className="flex flex-col gap-1.5 rounded-lg border border-line px-3 py-2.5">
          <div className="flex items-center gap-2">
            {pending ? <LoaderCircle size={16} className="animate-spin text-accent" aria-hidden="true" /> : <Pause size={16} className="text-muted" aria-hidden="true" />}
            <strong className="text-sm text-ink">
              {discard.isPending ? t('正在取消上传') : upload.isPending ? stage === 'hashing' ? t('正在核对文件内容') : stage === 'confirming' ? t('正在确认文件') : t('正在传输文件') : t('上传已暂停')}
            </strong>
            <span className="ms-auto text-sm font-medium tabular-nums text-ink">{percent}%</span>
          </div>
          <Progress value={percent} aria-label={t('上传进度')} />
          <small className="text-2xs text-muted">
            {stage === 'hashing' && pending
              ? t('核对内容以安全恢复，文件不会重复上传。')
              : stage === 'confirming' && pending
                ? t('正在校验并合并分片，请稍候。')
                : t('已上传 {{loaded}} / {{total}} · {{done}} / {{count}} 个分片', { loaded: bytes(progress.loaded), total: bytes(progress.total), done: progress.completedParts, count: progress.totalParts })}
          </small>
        </div>}
        <div className="mt-1 flex flex-wrap items-center justify-end gap-2">
          {session && !pending && <Button variant="ghost" className="text-danger hover:text-danger" disabled={discard.isPending} onClick={() => discard.mutate()}><Trash2 size={14} aria-hidden="true" />{t('放弃上传')}</Button>}
          <Button variant="secondary" disabled={discard.isPending || (stage === 'confirming' && upload.isPending)}
            onClick={() => { if (upload.isPending) abort.current?.abort(); else onClose(); }}>
            {upload.isPending ? <><Pause size={15} aria-hidden="true" />{t('暂停上传')}</> : session ? t('稍后继续') : t('取消')}
          </Button>
          <Button type="submit" pending={pending}
            disabled={!file || pending || tooLarge || invalidExtension || invalidType || policy.isPending || policy.isError || (!!resume && (status.isPending || status.isError))}>
            {!pending && (paused ? <Play size={16} aria-hidden="true" /> : <Upload size={16} aria-hidden="true" />)}
            {pending ? t('处理中…') : session ? t('继续上传') : t('开始上传')}
          </Button>
        </div>
        {policy.isError && <p role="alert" className="flex flex-wrap items-center gap-2 text-sm text-danger">
          {t(policy.error.message)}
          <Button variant="link" size="sm" className="h-auto px-0" onClick={() => void policy.refetch()}>{t('重试')}</Button>
        </p>}
        {status.isError && <p role="alert" className="flex flex-wrap items-center gap-2 text-sm text-danger">
          {t('上传会话不可用，请删除后重新上传')}
          <Button variant="link" size="sm" className="h-auto px-0" onClick={() => void status.refetch()}>{t('重试')}</Button>
        </p>}
      </form>
    </DialogContent>
  </Dialog>;
}

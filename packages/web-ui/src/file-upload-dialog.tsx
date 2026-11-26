// Author: yunnuo <ymz@ebox.vip>
// Description: Shared resumable upload dialog with byte progress, pause, retry and explicit abandonment.
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { File, FileArchive, FileImage, FileSpreadsheet, FileText, LoaderCircle, Pause, Play, ShieldCheck, Trash2, Upload, X } from 'lucide-react';
import { AppError, type AppClient, type FileEntry, type UploadProgress, type UploadStage } from '@unicore/sdk';
import { t, useLocale } from './i18n';
import { Alert, Button, Dialog, DialogContent, DialogDescription, DialogTitle, SimpleSelect, Progress, useMessage, selectOptions } from '@unicore/ui';
import { cn } from '@unicore/ui/cn';

const bytes = (n: number) => n >= 1073741824 ? `${(n / 1073741824).toFixed(1)} GiB` : n >= 1048576 ? `${(n / 1048576).toFixed(1)} MiB` : `${(n / 1024).toFixed(1)} KiB`;

// Type-aware glyph mirrors the EboxUI FileUpload reference: a compact icon per
// common extension family instead of one generic file outline.
const glyphExtensions: Record<'image' | 'spreadsheet' | 'archive' | 'text', readonly string[]> = {
  image: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'ico', 'avif'],
  spreadsheet: ['xlsx', 'xls', 'csv', 'ods'],
  archive: ['zip', 'gz', 'tgz', 'tar', '7z', 'rar', 'bz2', 'xz'],
  text: ['txt', 'md', 'pdf', 'doc', 'docx', 'ppt', 'pptx', 'odt', 'rtf', 'json', 'xml', 'log'],
};

// Rounded-rect progress path beginning at top-center and running clockwise,
// ported from the EboxUI FileUpload reference.
function ringPath(width: number, height: number, inset: number, radius: number) {
  const x0 = inset, y0 = inset, x1 = width - inset, y1 = height - inset;
  const arc = (endX: number, endY: number) => `A ${radius} ${radius} 0 0 1 ${endX} ${endY}`;
  return [`M ${width / 2} ${y0}`, `H ${x1 - radius}`, arc(x1, y0 + radius), `V ${y1 - radius}`, arc(x1 - radius, y1), `H ${x0 + radius}`, arc(x0, y1 - radius), `V ${y0 + radius}`, arc(x0 + radius, y0), 'Z'].join(' ');
}

// Drives the staggered reveal states between phase contents.
function useStaggerState(active: boolean): 'shown' | 'hiding' | 'hidden' {
  const [previous, setPrevious] = useState(active);
  const [hiding, setHiding] = useState(false);
  if (previous !== active) { setPrevious(active); setHiding(!active); }
  useEffect(() => {
    if (!hiding) return;
    const timer = setTimeout(() => setHiding(false), 200);
    return () => clearTimeout(timer);
  }, [hiding]);
  return active ? 'shown' : hiding ? 'hiding' : 'hidden';
}

const staggerContainer = (state: 'shown' | 'hiding' | 'hidden') => cn('t-stagger', state === 'shown' && 'is-shown', state === 'hiding' && 'is-hiding');
const staggerLine = (state: 'shown' | 'hiding' | 'hidden') => cn(
  state === 'shown' && 'translate-y-0 opacity-100 blur-0 [transition:opacity_var(--stagger-dur)_var(--stagger-ease),translate_var(--stagger-dur)_var(--stagger-ease),filter_var(--stagger-dur)_var(--stagger-ease)]',
  state === 'hiding' && 'translate-y-0 opacity-0 blur-0 [transition:opacity_200ms_ease]',
  state === 'hidden' && 'translate-y-3 opacity-0 blur-[3px] transition-none',
);

function FileGlyph({ name }: { name: string }) {
  const extension = name.split('.').pop()?.toLowerCase() ?? '';
  const Icon = glyphExtensions.image.includes(extension) ? FileImage
    : glyphExtensions.spreadsheet.includes(extension) ? FileSpreadsheet
      : glyphExtensions.archive.includes(extension) ? FileArchive
        : glyphExtensions.text.includes(extension) ? FileText
          : File;
  return <Icon size={20} aria-hidden="true" />;
}

// The progress engine is the EboxUI choreography, kept 1:1: a 90ms tick walks
// the ring 0→100 in small steps regardless of how sparse real byte events are,
// caps at 99 until the real upload finishes (single sweep, never backwards),
// then holds the success state for 1.6s before handing back to the caller.
const TICK_MS = 90;
const COMPLETE_HOLD_MS = 1600;

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
  const [displayed, setDisplayed] = useState(0);
  const [realDone, setRealDone] = useState(false);
  const [showComplete, setShowComplete] = useState(false);
  const resultRef = useRef<FileEntry | null>(null);
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
    onSuccess: result => {
      // Real completion only arms the handoff; the tick decides when the ring
      // reaches 100 so even a 1KiB file gets the full reference choreography.
      if (!result) return;
      resultRef.current = result;
      setRealDone(true);
    },
  });
  // The tick: small forward steps, capped at 99 until the real upload is done.
  useEffect(() => {
    if (!(upload.isPending || realDone)) return;
    const timer = setInterval(() => {
      setDisplayed(value => {
        if (value >= 100) return 100;
        const next = realDone ? Math.min(100, value + 6 + Math.random() * 8) : Math.min(99, value + 2 + Math.random() * 4);
        return next;
      });
    }, TICK_MS);
    return () => clearInterval(timer);
  }, [upload.isPending, realDone]);
  useEffect(() => {
    if (displayed >= 100) setShowComplete(true);
  }, [displayed]);
  // Success hold, then hand the file back to the caller and close.
  const finished = resultRef.current;
  useEffect(() => {
    if (!showComplete || !finished) return;
    const timer = setTimeout(() => {
      if (onUploaded) onUploaded(finished); else message.success(t('文件上传完成'));
      onClose();
    }, COMPLETE_HOLD_MS);
    return () => clearTimeout(timer);
  }, [showComplete]); // eslint-disable-line react-hooks/exhaustive-deps -- the held result is stable for this dialog lifetime
  const discard = useMutation({
    mutationFn: () => api.deleteFile(session!),
    onSuccess: () => { message.success(t('上传已取消，临时分片将自动清理')); onClose(); },
  });
  const pending = upload.isPending || discard.isPending;
  const pick = (value: globalThis.File | null) => { setFile(value); upload.reset(); setDisplayed(0); setRealDone(false); setShowComplete(false); };
  const invalidType = !!file && !!accept && !accept.split(',').some(type => type.trim() === file.type);
  const invalidExtension = !!file && !session && !!policy.data?.allowed_extensions?.length && !policy.data.allowed_extensions.some(ext => file.name.toLowerCase().endsWith(`.${ext.toLowerCase().replace(/^\./, '')}`));
  const sizeLimit = Math.min(policy.data?.max_size ?? Infinity, maxSize ?? Infinity);
  const tooLarge = !!file && !session && file.size > sizeLimit;
  const percent = stage === 'hashing' && upload.isPending
    ? Math.round(hashBytes / (file?.size || 1) * 100)
    : Math.round(progress.loaded / (progress.total || 1) * 100);
  const selected = file ?? resume;
  const active = upload.isPending || (realDone && !paused);
  const lock = active || showComplete;
  const closeDisabled = pending || lock || (stage === 'confirming' && upload.isPending);
  // Perimeter ring geometry follows the live drop-zone border box, like the
  // reference. The node lives in state so a replaced button re-arms measurement:
  // one synchronous read at attach plus a ResizeObserver for later resizes.
  const [zoneNode, setZoneNode] = useState<HTMLButtonElement | null>(null);
  const [box, setBox] = useState({ width: 533, height: 176 });
  useLayoutEffect(() => {
    if (!zoneNode) return;
    const measure = () => { if (zoneNode.offsetWidth > 0) setBox({ width: zoneNode.offsetWidth, height: zoneNode.offsetHeight }); };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(zoneNode);
    return () => observer.disconnect();
  }, [zoneNode, active]);
  const idleReveal = useStaggerState(!active);
  const busyReveal = useStaggerState(active);
  return <Dialog open onOpenChange={open => { if (!open && !closeDisabled) onClose(); }}>
    <DialogContent showClose={false} aria-label={title ?? (resume ? t('继续上传') : t('上传文件'))}>
      <div className="mb-3 flex flex-col gap-1 pe-8">
        <DialogTitle>{title ?? (resume ? t('继续上传') : t('上传文件'))}</DialogTitle>
        <DialogDescription>{session ? t('关闭或刷新后，可从文件列表继续；超期分片会自动清理。') : t('文件保持私有，访问需要业务授权。')}</DialogDescription>
      </div>
      <Button variant="ghost" size="icon" className="absolute end-4 top-4" aria-label={t('关闭对话框')} disabled={closeDisabled} onClick={onClose}><X size={17} aria-hidden="true" /></Button>
      <form className="flex flex-col gap-3" aria-busy={active || undefined} onSubmit={event => { event.preventDefault(); if (file && !tooLarge && !invalidExtension && !invalidType) { setDisplayed(0); setRealDone(false); setShowComplete(false); upload.mutate(); } }}>
        {upload.error && <Alert variant="danger">{t(upload.error.message)}</Alert>}
      <input ref={input} className="sr-only" type="file" accept={accept ?? policy.data?.allowed_extensions?.map(ext => `.${ext.replace(/^\./, '')}`).join(',')} aria-label={t('选择文件')} disabled={pending} tabIndex={-1} onChange={event => pick(event.target.files?.[0] ?? null)} />
      <button ref={node => { zone.current = node; setZoneNode(node); }} type="button" data-autofocus
        className={cn('upload-zone relative flex h-44 shrink-0 flex-col items-center justify-center gap-2 overflow-visible rounded-2xl border-2 bg-field px-4 text-center outline-none transition-colors focus-visible:ring-2 focus-visible:ring-focus',
            active ? 'border-line' : dragging ? 'border-primary bg-primary-soft' : 'border-dashed border-line-strong hover:border-primary hover:bg-primary-soft')}
          aria-busy={active || undefined}
          disabled={pending}
          onClick={() => { if (!active) input.current?.click(); }}
          onDragOver={event => { event.preventDefault(); if (!active) setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={event => {
            event.preventDefault(); setDragging(false);
            if (!active) {
              if (event.dataTransfer.files.length > 1) message.info(t('每次上传一个文件，请分别添加'));
              pick(event.dataTransfer.files[0] ?? null);
            }
          }}>
          {/* Explicit width/height: an SVG is a replaced element, so bare
              -inset-0.5 solves the width but derives height from the viewBox
              ratio; the calc classes force a full stretch in both axes. */}
          {active && <svg aria-hidden viewBox={`0 0 ${box.width} ${box.height}`} preserveAspectRatio="none" className="pointer-events-none absolute -inset-0.5 h-[calc(100%+4px)] w-[calc(100%+4px)]">
            <rect x={1} y={1} width={box.width - 2} height={box.height - 2} rx={15} fill="none" stroke="currentColor" strokeWidth={2} className="text-line" />
            <path d={ringPath(box.width, box.height, 1, 15)} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" pathLength={100}
              strokeDasharray={`${Math.min(102, displayed)} 200`} className="text-accent transition-[stroke-dasharray] duration-200 ease-linear" />
          </svg>}
          {active && <span aria-hidden className="pointer-events-none absolute -top-2.5 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-accent px-1.5 py-0.5 text-2xs font-medium tabular-nums text-on-primary">{Math.round(displayed)}%</span>}
          <span aria-hidden className={cn('pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2', staggerContainer(idleReveal), active && 'opacity-0')}>
            <span className={cn('flex size-11 items-center justify-center rounded-lg bg-primary-soft text-accent', staggerLine(idleReveal))}><Upload size={24} aria-hidden="true" /></span>
            <strong className={cn('text-sm font-medium text-ink', staggerLine(idleReveal))}>
              {dragging ? t('松开即可添加文件') : session ? t('重新选择原文件以继续') : file ? t('点击替换，或拖入其他文件') : t('将文件拖到这里')}
            </strong>
            <span className={cn('text-xs text-muted', staggerLine(idleReveal))}>{accept ? accept : policy.data?.allowed_extensions?.length ? t('允许的扩展名：{{extensions}}', { extensions: policy.data.allowed_extensions.join(', ') }) : t('不限文件类型')}</span>
            <span className={cn('text-xs text-muted', staggerLine(idleReveal))}>{policy.data ? t('单文件最大 {{size}} · 支持分片续传', { size: bytes(sizeLimit) }) : t('正在读取策略…')}</span>
          </span>
          {(active || busyReveal === 'hiding') && <span aria-hidden className={cn('pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2.5', staggerContainer(busyReveal))}>
            <span className={cn('flex size-11 items-center justify-center rounded-lg border border-line bg-surface text-muted', staggerLine(busyReveal))}><FileGlyph name={file?.name ?? resume?.original_name ?? ''} /></span>
            <strong className={cn('max-w-[90%] truncate text-sm font-medium text-ink', staggerLine(busyReveal))}>{file?.name ?? resume?.original_name}</strong>
            {active && !showComplete && <span className={cn('relative block h-5 w-full text-xs text-muted', staggerLine(busyReveal))}>
              <span className={cn('absolute inset-x-0', stage === 'hashing' ? staggerLine('shown') : staggerLine('hidden'))}>{t('正在核对文件内容')}</span>
              <span className={cn('absolute inset-x-0', stage === 'uploading' ? staggerLine('shown') : staggerLine('hidden'))}>{t('已上传 {{loaded}} / {{total}} · {{done}} / {{count}} 个分片', { loaded: bytes(progress.loaded), total: bytes(progress.total), done: progress.completedParts, count: progress.totalParts })}</span>
              <span className={cn('absolute inset-x-0', stage === 'confirming' ? staggerLine('shown') : staggerLine('hidden'))}>{t('正在确认文件')}</span>
            </span>}
            {showComplete && <span className={cn('relative block h-5 w-full text-xs text-muted', staggerLine(busyReveal))}><span className={cn('absolute inset-x-0', staggerLine(busyReveal))}>{t('上传完成')}</span></span>}
          </span>}
        </button>
        {selected && <div className="upload-file-card flex items-center gap-2.5 rounded-lg border border-line bg-surface-alt px-3 py-2">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-md border border-line bg-surface text-muted"><FileGlyph name={file?.name ?? resume?.original_name ?? ''} /></span>
          <div className="min-w-0 flex-1">
            <strong className="block truncate text-sm text-ink" title={file?.name ?? resume?.original_name}>{file?.name ?? resume?.original_name}</strong>
            <small className="block text-2xs text-muted">{bytes(selected.size)}{resume && !file ? ` · ${t('等待选择原文件')}` : ''}</small>
          </div>
          {file && <span className="shrink-0 whitespace-nowrap rounded-full bg-primary-soft px-2 py-0.5 text-2xs font-medium text-accent">{t('已选择')}</span>}
          {file && !pending && !lock && <Button variant="ghost" size="icon" className="size-7 shrink-0" aria-label={t('移除已选文件')} onClick={() => { pick(null); if (input.current) input.current.value = ''; zone.current?.focus(); }}><X size={17} /></Button>}
        </div>}
        {!session && !!policy.data?.upload_paths?.length && <label className="flex flex-col gap-1.5 text-sm font-medium">{t('上传路径')}<SimpleSelect aria-label={t('上传路径')} value={uploadPath || policy.data.upload_paths[0]} disabled={pending} onChange={event => setUploadPath(event)} options={selectOptions(<>{policy.data.upload_paths.map(path => <option key={path} value={path}>{path}</option>)}</>)} /></label>}
        {invalidType && <p role="alert" className="text-sm text-danger">{t('请选择 PNG、JPEG 或 GIF 图片')}</p>}
        {invalidExtension && <p role="alert" className="text-sm text-danger">{t('文件扩展名不在允许列表中')}</p>}
        {tooLarge && <p role="alert" className="text-sm text-danger">{t('文件超过管理员设置的大小上限')}</p>}
        {!active && (session || discard.isPending) && <div role="status" className="flex flex-col gap-1.5 rounded-lg border border-line px-3 py-2.5">
          <div className="flex items-center gap-2">
            {discard.isPending ? <LoaderCircle size={16} className="animate-spin text-accent" aria-hidden="true" /> : <Pause size={16} className="text-muted" aria-hidden="true" />}
            <strong className="text-sm text-ink">{discard.isPending ? t('正在取消上传') : t('上传已暂停')}</strong>
            <span className="ms-auto text-sm font-medium tabular-nums text-ink">{percent}%</span>
          </div>
          <Progress value={percent} aria-label={t('上传进度')} />
          <small className="text-2xs text-muted">{t('已上传 {{loaded}} / {{total}} · {{done}} / {{count}} 个分片', { loaded: bytes(progress.loaded), total: bytes(progress.total), done: progress.completedParts, count: progress.totalParts })}</small>
        </div>}
        <div className="mt-1 flex flex-wrap items-center justify-end gap-2">
          {session && !pending && !lock && <Button variant="ghost" className="text-danger hover:text-danger" disabled={discard.isPending} onClick={() => discard.mutate()}><Trash2 size={14} aria-hidden="true" />{t('放弃上传')}</Button>}
          {/* Pausing must stay available while parts are in flight; the lock only guards the post-completion hold. */}
          <Button variant="secondary" disabled={(!upload.isPending && lock) || discard.isPending || (stage === 'confirming' && upload.isPending)}
            onClick={() => { if (upload.isPending) abort.current?.abort(); else onClose(); }}>
            {upload.isPending ? <><Pause size={15} aria-hidden="true" />{t('暂停上传')}</> : session ? t('稍后继续') : t('取消')}
          </Button>
          <Button type="submit" pending={pending}
            disabled={lock || !file || pending || tooLarge || invalidExtension || invalidType || policy.isPending || policy.isError || (!!resume && (status.isPending || status.isError))}>
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

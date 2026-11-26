// Author: yunnuo <ymz@ebox.vip>
// Description: Sandboxed inline preview for whitelisted files: zoomable images, PDF frames and plain text.
import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Download, ExternalLink, RotateCw, ZoomIn, ZoomOut } from 'lucide-react';
import type { FileCatalogEntry } from '@unicore/sdk';
import { Button, Dialog, DialogContent, DialogTitle, useMessage } from '@unicore/ui';
import { t } from '../../../i18n';
import { formatSize, inlinePreviewable } from './shared';

export function FilePreviewModal({ entry, url, onClose, onDownload }: { entry: FileCatalogEntry; url: string | undefined; onClose: () => void; onDownload: (entry: FileCatalogEntry) => void }) {
  const message = useMessage();
  const [scale, setScale] = useState(1);
  const [rotation, setRotation] = useState(0);
  const frame = useRef<HTMLImageElement>(null);
  const category = entry.file.mime_type.split(';')[0].trim().toLowerCase();
  const isText = category === 'text/plain';
  const isPdf = category === 'application/pdf';
  const isImage = category.startsWith('image/');
  const supported = inlinePreviewable(entry.file.mime_type);
  useEffect(() => { setScale(1); setRotation(0); }, [entry.file.file_id, url]);
  const text = useQuery({
    queryKey: ['file-preview-text', entry.file.file_id, entry.etag],
    queryFn: async () => {
      const response = await fetch(url!, { mode: 'cors' });
      if (!response.ok) throw new Error(`${response.status}`);
      const body = await response.text();
      return body.length > 200000 ? `${body.slice(0, 200000)}\n…` : body;
    },
    enabled: supported && isText && !!url,
    staleTime: 4 * 60 * 1000,
    retry: false,
  });
  return <Dialog open onOpenChange={open => { if (!open) onClose(); }}>
    <DialogContent showClose aria-label={t('文件预览')} className="flex max-h-[85dvh] max-w-3xl flex-col gap-4">
      <div className="flex min-w-0 items-center justify-between gap-3 pe-6">
        <DialogTitle className="min-w-0 truncate">{entry.file.original_name}</DialogTitle>
        <span className="shrink-0 text-xs text-muted">{formatSize(entry.file.size)} · {entry.file.mime_type || t('未知')}</span>
      </div>
      <div className="flex min-h-40 flex-1 items-center justify-center overflow-auto rounded-lg border border-line bg-surface-alt p-2">
        {!supported && <p role="alert" className="p-6 text-center text-sm text-muted">{t('该类型不支持在线预览，请下载后查看。')}</p>}
        {supported && !url && <p role="status" className="p-6 text-sm text-muted">{t('正在生成预览链接…')}</p>}
        {supported && isImage && url && <img ref={frame} src={url} alt={entry.file.original_name}
          style={{ transform: `scale(${scale}) rotate(${rotation}deg)` }}
          className="max-h-[60dvh] max-w-full origin-center rounded-md object-contain transition-transform" />}
        {/* PDF relies on the browser viewer: the response carries a sandbox-free
            CSP with same-origin framing, so the frame itself stays unsandboxed. */}
        {supported && isPdf && url && <iframe src={url} title={entry.file.original_name} className="h-[60dvh] w-full rounded-md border-0 bg-white" />}
        {supported && isText && (text.isPending ? <p role="status" className="p-6 text-sm text-muted">{t('正在读取内容…')}</p>
          : text.isError ? <p role="alert" className="p-6 text-sm text-danger">{t('预览读取失败，请下载后查看。')}</p>
            : <pre className="max-h-[60dvh] w-full overflow-auto p-2 text-start font-mono text-xs leading-5 whitespace-pre-wrap">{text.data}</pre>)}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        {isImage && <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" aria-label={t('缩小')} disabled={scale <= 0.25} onClick={() => setScale(value => Math.max(0.25, value - 0.25))}><ZoomOut size={16} /></Button>
          <span className="w-12 text-center text-xs tabular-nums text-muted">{Math.round(scale * 100)}%</span>
          <Button variant="ghost" size="icon" aria-label={t('放大')} disabled={scale >= 4} onClick={() => setScale(value => Math.min(4, value + 0.25))}><ZoomIn size={16} /></Button>
          <Button variant="ghost" size="icon" aria-label={t('旋转')} onClick={() => setRotation(value => (value + 90) % 360)}><RotateCw size={16} /></Button>
        </div>}
        <span className="text-2xs text-muted">{t('预览链接短期有效，仅限类型白名单内的文件。')}</span>
        <div className="flex items-center gap-2">
          {isPdf && <Button variant="secondary" size="sm" disabled={!url} onClick={() => { if (url) window.open(url, '_blank', 'noopener'); }}>
            <ExternalLink size={14} />{t('新标签页打开')}
          </Button>}
          <Button variant="secondary" size="sm" pending={!url} onClick={() => { if (!url) { message.info(t('正在生成预览链接…')); return; } onDownload(entry); }}>
            <Download size={14} />{t('下载文件')}
          </Button>
        </div>
      </div>
    </DialogContent>
  </Dialog>;
}

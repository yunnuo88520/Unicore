// Author: yunnuo <ymz@ebox.vip>
// Description: Governance detail drawer: summary head, grouped metadata with copy actions and a sticky action bar.
import { useState } from 'react';
import { Check, Copy, Download, Eye, Trash2 } from 'lucide-react';
import type { FileCatalogClient, FileCatalogEntry, StorageLocation } from '@unicore/sdk';
import { Badge, Button, FormDrawer, useMessage } from '@unicore/ui';
import { t, useLocale } from '../../../i18n';
import { FileThumb } from './file-thumb';
import { formatDate, formatSize, inlinePreviewable, locationName, purposeLabel, stateLabel } from './shared';

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:gap-3">
    <span className="w-28 shrink-0 pt-0.5 text-sm text-muted">{label}</span>
    <span className="min-w-0 flex-1 break-all text-sm text-ink">{children}</span>
  </div>;
}

function CopyValue({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  if (!value) return <span className="text-sm text-muted">{t('未生成')}</span>;
  return <span className="flex min-w-0 items-center gap-1">
    <span className="min-w-0 flex-1 break-all font-mono text-xs leading-5">{value}</span>
    <Button variant="ghost" size="icon" className="size-7 shrink-0 text-muted hover:text-ink" aria-label={copied ? t('已复制') : t('复制')} title={copied ? t('已复制') : t('复制')}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch { /* clipboard unavailable: the value stays selectable */ }
      }}>
      {copied ? <Check size={13} className="text-success" /> : <Copy size={13} />}
    </Button>
  </span>;
}

export function FileDetailDrawer({ entry, locations, catalog, onClose, onPreview, onDownload, onDelete }: {
  entry: FileCatalogEntry; locations: StorageLocation[] | undefined; catalog: FileCatalogClient;
  onClose: () => void; onPreview: (entry: FileCatalogEntry) => void; onDownload: (entry: FileCatalogEntry) => void; onDelete: (entry: FileCatalogEntry) => void;
}) {
  const locale = useLocale();
  const message = useMessage();
  const expired = entry.file.state === 'ready' && entry.file.expires_at > 0 && entry.file.expires_at <= Math.floor(Date.now() / 1000);
  const previewable = entry.file.capabilities.download && inlinePreviewable(entry.file.mime_type);
  return <FormDrawer title={t('文件详情')} description={t('存储位置、对象键与引用状态仅供治理审计。')} onClose={onClose}>
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-5 py-5 sm:px-6">
        <div className="flex min-w-0 items-start gap-3 rounded-xl border border-line bg-surface-alt p-3">
          <FileThumb entry={entry} catalog={catalog} className="h-14 w-14" iconSize={26} />
          <div className="flex min-w-0 flex-col gap-1">
            <span className="break-all text-sm font-medium leading-5 text-ink" title={entry.file.original_name}>{entry.file.original_name}</span>
            <span className="text-xs tabular-nums text-muted">{formatSize(entry.file.size)} · {entry.file.mime_type || t('未知')}</span>
            <span className="flex flex-wrap items-center gap-1.5">
              <Badge variant={entry.file.state === 'ready' ? 'success' : 'warning'}>{stateLabel(entry.file.state)}</Badge>
              {expired && <Badge variant="warning">{t('已过期')}</Badge>}
              {entry.referenced && <Badge variant="info">{t('被业务引用')}</Badge>}
            </span>
          </div>
        </div>
        <section className="flex flex-col gap-3" aria-label={t('基础信息')}>
          <h3 className="text-sm font-semibold text-ink">{t('基础信息')}</h3>
          <Row label={t('业务用途')}>{purposeLabel(entry.purpose)}</Row>
          <Row label={t('存储位置')}>{locationName(locations, entry.file.location_id)}</Row>
          <Row label={t('上传者')}>{entry.creator_name || entry.creator_username || t(entry.file.creator_realm === 'system' ? '系统资源' : '账号已删除')}</Row>
          <Row label={t('上传时间')}>{formatDate(entry.file.created_at, locale)}</Row>
          <Row label={t('过期时间')}>{entry.file.expires_at ? formatDate(entry.file.expires_at, locale) : t('永久保留')}</Row>
        </section>
        <section className="flex flex-col gap-3" aria-label={t('技术元数据')}>
          <h3 className="text-sm font-semibold text-ink">{t('技术元数据')}</h3>
          <Row label={t('文件 ID')}><CopyValue value={entry.file.file_id} /></Row>
          <Row label={t('对象键')}><CopyValue value={entry.file_key} /></Row>
          <Row label={t('完整路径')}><CopyValue value={entry.storage_path} /></Row>
          <Row label={t('ETag')}><CopyValue value={entry.etag} /></Row>
        </section>
      </div>
      <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line bg-surface px-5 py-3 sm:px-6">
        {previewable && <Button variant="secondary" size="sm" onClick={() => { onClose(); onPreview(entry); }}><Eye size={14} />{t('预览')}</Button>}
        <Button variant="secondary" size="sm" disabled={!entry.file.capabilities.download} onClick={() => { onClose(); onDownload(entry); }}><Download size={14} />{t('下载文件')}</Button>
        {entry.file.capabilities.delete && <Button variant="dangerSoft" size="sm" onClick={() => { onClose(); onDelete(entry); }}><Trash2 size={14} />{t('删除文件')}</Button>}
      </div>
    </div>
  </FormDrawer>;
}

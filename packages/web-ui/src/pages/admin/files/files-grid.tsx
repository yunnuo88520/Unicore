// Author: yunnuo <ymz@ebox.vip>
// Description: Thumbnail grid alternative for scanning uploads visually.
import { Download, Eye, Info, Trash2 } from 'lucide-react';
import type { FileCatalogEntry, FileCatalogClient } from '@unicore/sdk';
import { Badge, Button } from '@unicore/ui';
import { t } from '../../../i18n';
import { FileThumb } from './file-thumb';
import { formatSize, stateLabel } from './shared';

export function FilesGrid({ entries, catalog, onPreview, onDetail, onDelete, onDownload }: {
  entries: FileCatalogEntry[]; catalog: FileCatalogClient;
  onPreview: (entry: FileCatalogEntry) => void; onDetail: (entry: FileCatalogEntry) => void; onDelete: (entry: FileCatalogEntry) => void; onDownload: (entry: FileCatalogEntry) => void;
}) {
  if (!entries.length) return <div role="status" className="flex flex-col items-center gap-2 rounded-lg border border-line px-4 py-12 text-center text-sm text-muted">
    {t('没有匹配的文件')}
  </div>;
  return <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
    {entries.map(entry => <li key={entry.file.file_id} className="group relative flex min-w-0 flex-col gap-2 rounded-lg border border-line bg-surface p-2.5">
      <button type="button" aria-label={t('预览 {{name}}', { name: entry.file.original_name })} className="relative block aspect-4/3 w-full overflow-hidden rounded-md border border-line bg-surface-alt" onClick={() => onPreview(entry)}>
        <FileThumb entry={entry} catalog={catalog} iconSize={30} className="h-full w-full rounded-none border-0 bg-surface-alt" />
        {entry.file.state !== 'ready' && <span className="absolute start-1.5 top-1.5"><Badge variant="warning">{stateLabel(entry.file.state)}</Badge></span>}
      </button>
      <span className="min-w-0">
        <span className="block truncate text-sm font-medium" title={entry.file.original_name}>{entry.file.original_name}</span>
        <span className="block text-2xs tabular-nums text-muted">{formatSize(entry.file.size)}</span>
      </span>
      <span className="flex items-center justify-end gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
        {entry.file.capabilities.download && <Button variant="ghost" size="icon" className="size-7" aria-label={t('预览 {{name}}', { name: entry.file.original_name })} onClick={() => onPreview(entry)}><Eye size={14} /></Button>}
        {entry.file.capabilities.download && <Button variant="ghost" size="icon" className="size-7" aria-label={t('下载文件')} onClick={() => onDownload(entry)}><Download size={14} /></Button>}
        <Button variant="ghost" size="icon" className="size-7" aria-label={t('详情 {{name}}', { name: entry.file.original_name })} onClick={() => onDetail(entry)}><Info size={14} /></Button>
        {entry.file.capabilities.delete && <Button variant="ghost" size="icon" className="size-7 text-danger hover:text-danger" aria-label={t('删除文件 {{name}}', { name: entry.file.original_name })} onClick={() => onDelete(entry)}><Trash2 size={14} /></Button>}
      </span>
    </li>)}
  </ul>;
}

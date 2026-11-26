// Author: yunnuo <ymz@ebox.vip>
// Description: Catalog table with thumbnails, purpose tags and per-row governance actions.
import { useMemo } from 'react';
import { createColumnHelper, tableFeatures, useTable } from '@tanstack/react-table';
import { Download, Eye, File as FilePlaceholderIcon, Info, Trash2 } from 'lucide-react';
import type { FileCatalogEntry, FileCatalogClient, StorageLocation } from '@unicore/sdk';
import { Badge, Button, Checkbox } from '@unicore/ui';
import { t, useLocale } from '../../../i18n';
import { DataTable } from '../../../components/data-table';
import { FileThumb } from './file-thumb';
import { creatorLabel, formatDate, formatSize, locationName, purposeLabel, stateLabel } from './shared';

const features = tableFeatures({});
const column = createColumnHelper<typeof features, FileCatalogEntry>();

export function FilesTable({ entries, locations, catalog, pending, busy, error, onRetry, selected, onToggle, onToggleAll, onPreview, onDetail, onDelete, onDownload }: {
  entries: FileCatalogEntry[]; locations: StorageLocation[] | undefined; catalog: FileCatalogClient;
  pending: boolean; busy: boolean; error: { message: string } | null; onRetry: () => void;
  selected: string[]; onToggle: (id: string, checked: boolean) => void; onToggleAll: (checked: boolean) => void;
  onPreview: (entry: FileCatalogEntry) => void; onDetail: (entry: FileCatalogEntry) => void; onDelete: (entry: FileCatalogEntry) => void; onDownload: (entry: FileCatalogEntry) => void;
}) {
  const locale = useLocale();
  const columns = useMemo(() => column.columns([
    column.display({ id: 'select', header: () => {
      const selectable = entries.filter(item => item.file.capabilities.delete);
      const checked = selectable.length > 0 && selectable.every(item => selected.includes(item.file.file_id));
      return <Checkbox aria-label={t('选择本页可删除文件')} checked={checked} disabled={!selectable.length} onChange={onToggleAll} />;
    }, cell: context => {
      const file = context.row.original.file;
      return <Checkbox aria-label={t('选择文件 {{name}}', { name: file.original_name })} checked={selected.includes(file.file_id)} disabled={!file.capabilities.delete} onChange={checked => onToggle(file.file_id, checked)} />;
    } }),
    column.display({ id: 'name', header: t('文件名'), cell: context => {
      const entry = context.row.original;
      const expired = entry.file.state === 'ready' && entry.file.expires_at > 0 && entry.file.expires_at <= Math.floor(Date.now() / 1000);
      return <div className="flex min-w-0 items-center gap-2.5">
        <FileThumb entry={entry} catalog={catalog} />
        <span className="flex min-w-0 flex-col">
          <button type="button" className="block max-w-52 truncate text-start font-medium hover:underline" title={`${entry.file.original_name}\n${entry.file.file_id}`} onClick={() => onPreview(entry)}>{entry.file.original_name}</button>
          <span className="block truncate text-[11px] text-muted" title={entry.file.mime_type || t('未知')}>{entry.file.mime_type || t('未知')}</span>
        </span>
        {entry.file.state !== 'ready' && <Badge variant="warning">{stateLabel(entry.file.state)}</Badge>}
        {expired && <Badge variant="warning">{t('已过期')}</Badge>}
      </div>;
    } }),
    column.accessor(row => row.purpose, { id: 'purpose', header: t('业务用途'), cell: context => <span className="block whitespace-nowrap"><Badge variant={context.getValue() === 'branding' ? 'info' : 'subtle'}>{purposeLabel(context.getValue())}</Badge></span> }),
    column.accessor(row => row.file.size, { id: 'size', header: t('大小'), cell: context => <span className="block whitespace-nowrap tabular-nums">{formatSize(context.getValue())}</span> }),
    column.accessor(row => row.file.location_id, { id: 'location', header: t('存储位置'), cell: context => <span className="block max-w-40 truncate whitespace-nowrap text-xs" title={locationName(locations, context.getValue())}>{locationName(locations, context.getValue())}</span> }),
    column.accessor(row => creatorLabel(row), { id: 'creator', header: t('上传者'), cell: context => <span className="flex items-center gap-1 whitespace-nowrap text-xs"><span className="max-w-28 truncate" title={context.getValue()}>{context.getValue()}</span>{context.row.original.creator_name && context.row.original.creator_username && <span className="truncate text-[11px] text-muted" title={context.row.original.creator_username}>@{context.row.original.creator_username}</span>}</span> }),
    column.accessor(row => row.file.created_at, { id: 'created', header: t('上传时间'), cell: context => <time className="block whitespace-nowrap text-xs leading-5" dateTime={new Date(context.getValue() * 1000).toISOString()}>{formatDate(context.getValue(), locale)}</time> }),
    column.display({ id: 'actions', header: t('操作'), cell: context => {
      const entry = context.row.original;
      return <div className="flex items-center gap-0.5 whitespace-nowrap">
        {entry.file.capabilities.download && <Button variant="ghost" size="icon" className="text-muted hover:text-ink" title={t('预览')} aria-label={t('预览 {{name}}', { name: entry.file.original_name })} onClick={() => onPreview(entry)}><Eye size={14} /></Button>}
        {entry.file.capabilities.download && <Button variant="ghost" size="icon" className="text-muted hover:text-ink" title={t('下载文件')} aria-label={t('下载文件')} onClick={() => onDownload(entry)}><Download size={14} /></Button>}
        <Button variant="ghost" size="icon" className="text-muted hover:text-ink" title={t('详情')} aria-label={t('详情 {{name}}', { name: entry.file.original_name })} onClick={() => onDetail(entry)}><Info size={14} /></Button>
        {entry.file.capabilities.delete && <Button variant="ghost" size="icon" className="text-muted hover:bg-danger/10 hover:text-danger" title={t('删除文件')} aria-label={t('删除文件 {{name}}', { name: entry.file.original_name })} onClick={() => onDelete(entry)}><Trash2 size={14} /></Button>}
      </div>;
    } }),
  ]), [catalog, entries, locale, locations, onDelete, onDetail, onDownload, onPreview, onToggle, onToggleAll, selected]);
  const table = useTable({ features, columns, data: entries });
  return <DataTable table={table} pending={pending} busy={busy} error={error} onRetry={onRetry}
    className="[&_th]:whitespace-nowrap [&_th]:px-3 [&_td]:px-3" compactHiddenColumns={['purpose', 'size', 'creator', 'created']} wrapperClassName="max-w-full"
    empty={{ icon: FilePlaceholderIcon, title: t('没有匹配的文件'), hint: t('更改搜索或筛选条件后重试。') }} />;
}

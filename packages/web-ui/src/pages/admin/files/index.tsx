// Author: yunnuo <ymz@ebox.vip>
// Description: Platform file governance: catalog views plus asynchronous storage migration control.
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { Upload, X } from 'lucide-react';
import type { FileCatalogEntry } from '@unicore/sdk';
import { Button, ConfirmDialog, PageHeader, TabsPrimitive, useMessage } from '@unicore/ui';
import { canAction } from '../../../permissions';
import { defineMessages, t, useLocale } from '../../../i18n';
import { DataTablePagination, DataTableToolbar } from '../../../components/data-table';
import { FileUploadDialog } from '../../../file-upload-dialog';
import { useRouteSearch, type PageProps } from '../../../router';
import { FileDetailDrawer } from './file-detail-drawer';
import { FilePreviewModal } from './file-preview-modal';
import { FilesGrid } from './files-grid';
import { FilesTable } from './files-table';
import { FilesFilters, FilesViewSwitch } from './files-toolbar';
import { MigrationPanel } from './migration-panel';

const tabMessages = defineMessages([
  { id: 'catalog', label: '文件列表' },
  { id: 'migration', label: '存储迁移' },
] as const);
type TabKey = (typeof tabMessages)[number]['id'];

export function AdminFilesPage({ client, metadata }: PageProps) {
  useLocale();
  const catalog = client.fileCatalog;
  const storage = client.storage;
  if (!catalog || !storage) return <p role="alert" className="text-sm text-danger">{t('文件管理服务不可用')}</p>;
  return <FileGovernance client={client} metadata={metadata} />;
}

function FileGovernance({ client, metadata }: Pick<PageProps, 'client' | 'metadata'>) {
  const navigate = useNavigate();
  const search = useRouteSearch<{ tab?: string }>();
  const cache = useQueryClient();
  const message = useMessage();
  const migrations = client.storageMigrations;
  const tab: TabKey = search.tab === 'migration' && migrations ? 'migration' : 'catalog';
  const [uploadOpen, setUploadOpen] = useState(false);
  const canUpload = canAction(metadata, 'createMultipartUpload');
  const refresh = () => {
    void cache.invalidateQueries({ queryKey: ['file-catalog'] });
    void cache.invalidateQueries({ queryKey: ['migration-summary'] });
  };
  const change = (next: TabKey) => void navigate({ to: '/files', search: { tab: next }, replace: true });
  return <div className="flex min-w-0 flex-col gap-5">
    <PageHeader title={t('文件管理')} description={t('查看与管理全实例私有文件：筛选、预览、删除，以及本地与云存储之间的异步迁移。')}
      actions={tab === 'catalog' && canUpload && <Button variant="primary" onClick={() => setUploadOpen(true)}><Upload size={15} />{t('上传文件')}</Button>} />
    <TabsPrimitive.Root value={tab} onValueChange={value => change(value as TabKey)}>
      <TabsPrimitive.List aria-label={t('文件管理视图')} className="mb-5">
        {tabMessages.map(item => <TabsPrimitive.Trigger key={item.id} value={item.id}>{t(item.label)}</TabsPrimitive.Trigger>)}
      </TabsPrimitive.List>
      <TabsPrimitive.Content value="catalog" forceMount hidden={tab !== 'catalog'} className="flex min-w-0 flex-col data-[state=inactive]:hidden">
        <FileCatalogPanel client={client} metadata={metadata} />
      </TabsPrimitive.Content>
      <TabsPrimitive.Content value="migration" forceMount hidden={tab !== 'migration'} className="flex min-w-0 flex-col data-[state=inactive]:hidden">
        {migrations ? <MigrationPanel client={client} canWrite={canAction(metadata, 'createStorageMigration')} />
          : <p role="alert" className="text-sm text-muted">{t('此运行形态不提供存储迁移。')}</p>}
      </TabsPrimitive.Content>
    </TabsPrimitive.Root>
    {uploadOpen && <FileUploadDialog client={client} title={t('上传文件')} onClose={() => setUploadOpen(false)} onUploaded={() => { setUploadOpen(false); message.success(t('文件上传完成')); refresh(); }} />}
  </div>;
}

function FileCatalogPanel({ client, metadata }: Pick<PageProps, 'client' | 'metadata'>) {
  const message = useMessage();
  const cache = useQueryClient();
  const catalog = client.fileCatalog!;
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [locationID, setLocationID] = useState('');
  const [purpose, setPurpose] = useState('');
  const [type, setType] = useState('');
  const [view, setView] = useState<'table' | 'grid'>('table');
  const [selected, setSelected] = useState<string[]>([]);
  const [confirmDelete, setConfirmDelete] = useState<FileCatalogEntry | null>(null);
  const [preview, setPreview] = useState<{ entry: FileCatalogEntry; url?: string } | null>(null);
  const [detail, setDetail] = useState<FileCatalogEntry | null>(null);
  const locations = useQuery({ queryKey: ['storage-locations'], queryFn: () => client.storage!.storageLocations() });
  const listLocation = locationID === 'legacy-brand' ? 'legacy-brand' : locationID || undefined;
  const list = useQuery({
    queryKey: ['file-catalog', { search: search.trim(), page, locationID: listLocation, purpose, type }],
    queryFn: () => catalog.catalog({ search: search.trim() || undefined, page, location_id: listLocation, purpose: purpose || undefined, type: type || undefined }),
  });
  const previewLink = useQuery({
    queryKey: ['file-preview-link', preview?.entry.file.file_id, preview?.entry.etag],
    queryFn: () => catalog.access(preview!.entry.file.file_id, 'inline'),
    enabled: !!preview,
    staleTime: 4 * 60 * 1000,
  });
  const download = useMutation({
    mutationFn: (entry: FileCatalogEntry) => catalog.access(entry.file.file_id),
    onSuccess: (result, entry) => {
      const link = document.createElement('a');
      link.href = result.url;
      link.rel = 'noreferrer';
      link.download = entry.file.original_name;
      document.body.append(link);
      link.click();
      link.remove();
    },
    onError: error => message.error(error instanceof Error ? error.message : t('下载失败，请重试')),
  });
  const remove = useMutation({
    mutationFn: async (entry: FileCatalogEntry) => catalog.deleteFile(entry.file.file_id),
    onSuccess: () => { message.success(t('文件已删除')); setConfirmDelete(null); refresh(); },
  });
  const removeMany = useMutation({
    mutationFn: async (ids: string[]) => {
      const failures: string[] = [];
      for (const id of ids) {
        try { await catalog.deleteFile(id); } catch { failures.push(id); }
      }
      return failures;
    },
    onSuccess: failures => {
      if (failures.length) message.open({ type: 'warning', content: t('删除完成，{{count}} 个文件失败', { count: failures.length }), duration: 6000 });
      else message.success(t('文件已删除'));
      setSelected([]);
      refresh();
    },
  });
  const refresh = () => {
    void cache.invalidateQueries({ queryKey: ['file-catalog'] });
    void cache.invalidateQueries({ queryKey: ['migration-summary'] });
  };
  const entries = list.data?.items ?? [];
  const deletable = entries.filter(item => item.file.capabilities.delete).map(item => item.file.file_id);
  const toggle = (id: string, checked: boolean) => setSelected(current => checked ? [...new Set([...current, id])] : current.filter(value => value !== id));
  const toggleAll = (checked: boolean) => setSelected(current => checked ? [...new Set([...current, ...deletable])] : current.filter(id => !deletable.includes(id)));
  const openPreview = (entry: FileCatalogEntry) => setPreview({ entry });
  const canModify = canAction(metadata, 'deleteCatalogFile');
  const locations_ = locations.data?.items;
  const resetPage = (apply: (value: string) => void) => (value: string) => { apply(value); setPage(1); setSelected([]); };
  return <div className="flex min-w-0 flex-col gap-4">
    <DataTableToolbar
      summary={{ label: t('文件总数'), value: list.data?.total ?? 0 }}
      search={{ label: t('搜索文件'), placeholder: t('文件名、文件 ID 或上传者'), value: search, maxLength: 200, onChange: value => { setSearch(value); setPage(1); setSelected([]); } }}
      actions={<FilesViewSwitch view={view} onView={setView} />}>
      <FilesFilters locationID={locationID} onLocation={resetPage(setLocationID)}
        purpose={purpose} onPurpose={resetPage(setPurpose)}
        type={type} onType={resetPage(setType)} locations={locations_} />
    </DataTableToolbar>
    {selected.length > 0 && <div className="flex min-w-0 flex-wrap items-center gap-2 rounded-lg border border-line bg-surface-alt px-3 py-2 text-sm" role="status">
      <span className="text-muted">{t('已选 {{count}} 项', { count: selected.length })}</span>
      <Button variant="dangerSoft" size="sm" disabled={removeMany.isPending} pending={removeMany.isPending} onClick={() => removeMany.mutate(selected)}>{t('批量删除')}</Button>
      <Button variant="ghost" size="sm" disabled={removeMany.isPending} onClick={() => setSelected([])}><X size={13} />{t('取消选择')}</Button>
    </div>}
    {view === 'table'
      ? <FilesTable entries={entries} locations={locations_} catalog={catalog} pending={list.isPending} busy={list.isFetching} error={list.error ? { message: list.error.message } : null}
          onRetry={() => void list.refetch()} selected={selected} onToggle={toggle} onToggleAll={toggleAll}
          onPreview={openPreview} onDetail={setDetail} onDelete={setConfirmDelete} onDownload={entry => download.mutate(entry)} />
      : <FilesGrid entries={entries} catalog={catalog} onPreview={openPreview} onDetail={setDetail} onDelete={setConfirmDelete} onDownload={entry => download.mutate(entry)} />}
    <DataTablePagination page={page} pageSize={list.data?.page_size ?? 20} total={list.data?.total ?? 0} onPageChange={setPage} disabled={list.isFetching || removeMany.isPending} />
    {preview && <FilePreviewModal entry={preview.entry} url={previewLink.data?.url} onClose={() => setPreview(null)} onDownload={entry => download.mutate(entry)} />}
    {detail && <FileDetailDrawer entry={detail} locations={locations_} catalog={catalog} onClose={() => setDetail(null)} onPreview={openPreview} onDownload={entry => download.mutate(entry)} onDelete={setConfirmDelete} />}
    {confirmDelete && <ConfirmDialog danger title={t('删除文件')} description={t('确定删除文件“{{name}}”？删除后无法恢复。', { name: confirmDelete.file.original_name })} confirmLabel={t('确认删除')} cancelLabel={t('取消')} pending={remove.isPending} onConfirm={() => remove.mutate(confirmDelete)} onCancel={() => setConfirmDelete(null)} />}
  </div>;
}

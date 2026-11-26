// Author: yunnuo <ymz@ebox.vip>
// Description: Platform super-admin catalogue for private files, directories, access and storage migration.
import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createColumnHelper, tableFeatures, useTable } from '@tanstack/react-table';
import { Archive, ChevronDown, Download, File, Folder, FolderOpen, HardDrive, Trash2 } from 'lucide-react';
import type { FileCatalogEntry, FileDirectoryList, StorageLocation } from '@unicore/sdk';
import { Badge, Button, Checkbox, ConfirmDialog, FormDrawer, PageHeader, SimpleSelect, Switch, useMessage } from '@unicore/ui';
import { AppFormBody, AppFormFooter } from '@unicore/form';
import { TreeView, type TreeNode } from '@unicore/ui/controls';
import { DataTable, DataTablePagination, DataTableToolbar } from '../../components/data-table';
import { defineMessages, t, useLocale } from '../../i18n';
import type { PageProps } from '../../router';

const PAGE_SIZE = 20;
const features = tableFeatures({});
const column = createColumnHelper<typeof features, FileCatalogEntry>();
type DirectoryTarget = { locationID: string; path?: string };
type TreeBuild = { nodes: TreeNode[]; targets: Map<string, DirectoryTarget> };

const stateLabels = defineMessages({
  pending: '等待处理', copying: '处理中', ready: '可用', deleted: '已删除',
});
const locationNames = defineMessages({ local: '本地存储', minio: 'MinIO', s3: 'Amazon S3', oss: '阿里云 OSS', cos: '腾讯云 COS' });

function locationLabel(location: StorageLocation): string {
  return !location.name || location.name === location.provider
    ? t(locationNames[location.provider as keyof typeof locationNames] ?? location.provider)
    : location.name;
}

function formatSize(size: number): string {
  if (!Number.isFinite(size) || size <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const index = Math.min(Math.floor(Math.log(size) / Math.log(1024)), units.length - 1);
  return `${(size / 1024 ** index).toFixed(index ? 1 : 0)} ${units[index]}`;
}

function formatDate(value: number, locale: string): string {
  if (!value) return '—';
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value * 1000));
}

function creatorLabel(entry: FileCatalogEntry): string {
  return entry.creator_name || entry.creator_username || t(entry.file.creator_realm === 'system' ? '系统资源' : '账号已删除');
}

function directoryTree(locations: StorageLocation[], directoryList: FileDirectoryList | undefined): TreeBuild {
  const targets = new Map<string, DirectoryTarget>();
  const items = directoryList?.items ?? [];
  targets.set('all-files', { locationID: '' });
  const nodes = locations.map(location => {
    const rootId = `location:${location.id}`;
    targets.set(rootId, { locationID: location.id });
    type Branch = { id: string; path: string; count: number; children: Map<string, Branch> };
    const roots = new Map<string, Branch>();
    for (const item of items.filter(entry => entry.location_id === location.id)) {
      const path = item.path.replace(/^\/+|\/+$/g, '');
      const segments = path ? path.split('/').filter(Boolean) : [''];
      let level = roots;
      let currentPath = '';
      let branch: Branch | undefined;
      for (const segment of segments) {
        currentPath = segment ? currentPath ? `${currentPath}/${segment}` : segment : '';
        const id = `directory:${location.id}:${currentPath}`;
        branch = level.get(segment);
        if (!branch) {
          branch = { id, path: currentPath, count: 0, children: new Map() };
          level.set(segment, branch);
        }
        branch.count += item.file_count;
        level = branch.children;
      }
    }
    const toNodes = (branches: Map<string, Branch>): TreeNode[] => [...branches.entries()].map(([segment, branch]) => {
      targets.set(branch.id, { locationID: location.id, path: branch.path });
      return {
        id: branch.id,
        label: `${segment || t('默认上传目录')} (${branch.count})`,
        icon: <Folder size={15} aria-hidden="true" />,
        children: toNodes(branch.children),
      };
    });
    return {
      id: rootId,
      label: `${locationLabel(location)} (${location.file_count})`,
      icon: <HardDrive size={15} aria-hidden="true" />,
      children: toNodes(roots),
    };
  });
  return { nodes: [{ id: 'all-files', label: `${t('全部文件')} (${items.reduce((total, item) => total + item.file_count, 0)})`, icon: <File size={15} aria-hidden="true" /> }, ...nodes], targets };
}

export function AdminFilesPage({ client }: PageProps) {
  useLocale();
  const catalog = client.fileCatalog;
  const storage = client.storage;
  if (!catalog || !storage) return <p role="alert" className="text-sm text-danger">{t('文件管理服务不可用')}</p>;
  return <FileCatalogue catalog={catalog} storage={storage} />;
}

function FileCatalogue({ catalog, storage }: { catalog: NonNullable<PageProps['client']['fileCatalog']>; storage: NonNullable<PageProps['client']['storage']> }) {
  const locale = useLocale();
  const cache = useQueryClient();
  const message = useMessage();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [selectedNode, setSelectedNode] = useState<string[]>(['all-files']);
  const [checkedIDs, setCheckedIDs] = useState<string[]>([]);
  const [checkedSources, setCheckedSources] = useState<Record<string, string>>({});
  const [targetLocation, setTargetLocation] = useState('');
  const [mobileTreeOpen, setMobileTreeOpen] = useState(false);
  const [startingAll, setStartingAll] = useState(false);
  const [activateAfterMigration, setActivateAfterMigration] = useState(false);
  const [migrationDrawer, setMigrationDrawer] = useState<'selected' | 'all' | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<FileCatalogEntry | null>(null);
  const locations = useQuery({ queryKey: ['storage-locations'], queryFn: () => storage.storageLocations() });
  const directories = useQuery({ queryKey: ['file-catalog-directories'], queryFn: () => catalog.directories() });
  const allLocations = useMemo(() => {
    const known = [...(locations.data?.items ?? [])];
    const legacyRows = directories.data?.items.filter(item => item.location_id === 'legacy-brand') ?? [];
    if (legacyRows.length && !known.some(location => location.id === 'legacy-brand')) known.push({ id: 'legacy-brand', name: t('旧品牌存储'), provider: 'local', endpoint: '', bucket: '', region: '', prefix: '', path_style: false, configured: false, tested: false, active: false, file_count: legacyRows.reduce((sum, item) => sum + item.file_count, 0), created_at: 0 });
    return known;
  }, [directories.data, locations.data, locale]);
  const tree = useMemo(() => directoryTree(allLocations, directories.data), [allLocations, directories.data]);
  const target = selectedNode[0] ? tree.targets.get(selectedNode[0]) : undefined;
  const locationID = target?.locationID ?? '';
  const directory = target?.path;
  const query = { search: search.trim() || undefined, location_id: locationID || undefined, directory, page };
  const list = useQuery({ queryKey: ['file-catalog', query], queryFn: () => catalog.catalog(query) });
  const rows = list.data?.items ?? [];
  const selectableIDs = rows.filter(item => item.file.state === 'ready' && item.file.capabilities.download).map(item => item.file.file_id);
  const refresh = () => {
    void cache.invalidateQueries({ queryKey: ['file-catalog'] });
    void cache.invalidateQueries({ queryKey: ['file-catalog-directories'] });
    void cache.invalidateQueries({ queryKey: ['storage-locations'] });
  };
  const remove = useMutation({
    mutationFn: (entry: FileCatalogEntry) => catalog.deleteFile(entry.file.file_id),
    onSuccess: () => { message.success(t('文件已删除')); setConfirmDelete(null); setCheckedIDs([]); refresh(); },
  });
  const migrate = useMutation({
    mutationFn: async ({ ids, destination, activate }: { ids: string[]; destination: string; activate: boolean }) => {
      const failures: string[] = [];
      for (let index = 0; index < ids.length; index += 1) {
        setMigration({ done: index, total: ids.length, failed: [...failures], destination });
        try { await catalog.migrateFile(ids[index], destination); }
        catch { failures.push(ids[index]); }
      }
      setMigration({ done: ids.length, total: ids.length, failed: failures, destination });
      let activationFailed = false;
      if (!failures.length && activate) {
        try { await storage.activateStorage(destination); }
        catch { activationFailed = true; }
      }
      return { failures, activationFailed, activate };
    },
    onSuccess: ({ failures, activationFailed, activate }) => {
      setCheckedIDs([]);
      refresh();
      if (failures.length) message.open({ type: 'warning', content: t('迁移完成，{{count}} 个文件失败', { count: failures.length }), duration: 6000 });
      else if (activationFailed) message.error(t('文件已迁移，但默认存储切换失败，请在对象存储设置中重试。'));
      else message.success(t(activate ? '文件迁移完成，新上传位置已切换' : '文件迁移已完成'));
      void cache.invalidateQueries({ queryKey: ['persistent-settings'] });
    },
  });
  const [migration, setMigration] = useState<{ done: number; total: number; failed: string[]; destination: string } | null>(null);
  const sourceIsCloud = migrationDrawer === 'selected'
    ? checkedIDs.some(id => checkedSources[id] && checkedSources[id] !== 'local')
    : !!locationID && allLocations.some(item => item.id === locationID && item.provider !== 'local');
  const validTargets = locations.data?.items.filter(item => item.tested && item.id !== 'legacy-brand' && (!sourceIsCloud || item.provider === 'local')) ?? [];
  const targetValid = validTargets.some(item => item.id === targetLocation && item.id !== locationID);
  const startMigration = (ids: string[], destination = targetLocation) => {
    const transferable = ids.filter(id => {
      const item = rows.find(entry => entry.file.file_id === id);
      return !item || item.file.location_id !== destination;
    });
    if (!validTargets.some(item => item.id === destination) || migrate.isPending) return false;
    if (!transferable.length) { message.info(t('所选文件已在目标存储位置')); return false; }
    setMigration({ done: 0, total: transferable.length, failed: [], destination });
    migrate.mutate({ ids: transferable, destination, activate: activateAfterMigration });
    return true;
  };
  const startAllReady = async () => {
    if (migrate.isPending || startingAll || !targetLocation) return;
    if (query.location_id === targetLocation) { message.info(t('当前筛选文件已在目标存储位置')); return; }
    const snapshotQuery = { search: query.search, location_id: query.location_id, directory: query.directory, target_location_id: targetLocation };
    setStartingAll(true);
    try {
      const snapshot = await catalog.selection(snapshotQuery);
      const transferable = snapshot.file_ids.filter(id => !rows.some(row => row.file.file_id === id && row.file.location_id === targetLocation));
      if (!transferable.length) {
        setMigration(null);
        message.info(t('当前筛选没有可迁移的文件'));
      } else startMigration(transferable, targetLocation);
    } catch {
      message.error(t('读取迁移文件列表失败，请重试'));
    } finally {
      setStartingAll(false);
    }
  };
  const toggleAll = () => { setCheckedSources(current => ({ ...current, ...Object.fromEntries(rows.map(item => [item.file.file_id, item.file.storage_type])) })); setCheckedIDs(current => selectableIDs.every(id => current.includes(id))
    ? current.filter(id => !selectableIDs.includes(id))
    : [...new Set([...current, ...selectableIDs])]); };
  const onPageChange = (next: number) => setPage(next);
  const beginMigration = async () => {
    if (!migrationDrawer || !targetValid || migrate.isPending || startingAll) return;
    if (migrationDrawer === 'selected') {
      if (startMigration(checkedIDs)) setMigrationDrawer(null);
      return;
    }
    await startAllReady();
    setMigrationDrawer(null);
  };
  const columns = useColumns({ checkedIDs, setCheckedIDs, setCheckedSources, setConfirmDelete, catalog, selectableIDs, toggleAll, locale });
  const dataTable = useTable({ features, columns, data: rows });

  return <div className="flex min-w-0 flex-col gap-5">
    <PageHeader title={t('文件管理')} description={t('查看私有文件、目录与存储位置，管理授权下载、删除和存储迁移。')} />
    <div className="flex flex-wrap items-center gap-2 sm:hidden">
      <Button variant="secondary" size="sm" aria-expanded={mobileTreeOpen} onClick={() => setMobileTreeOpen(open => !open)}>
        <FolderOpen size={15} aria-hidden="true" />{t('目录')}
        <ChevronDown size={14} className={mobileTreeOpen ? 'rotate-180 transition-transform' : 'transition-transform'} aria-hidden="true" />
      </Button>
      {target && <span className="min-w-0 truncate text-xs text-muted">{t('当前目录')}：{directory || t('全部文件')}</span>}
    </div>
    <div className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-[minmax(190px,240px)_minmax(0,1fr)] sm:gap-5">
      <aside className={`${mobileTreeOpen ? 'block' : 'hidden'} min-w-0 sm:block`}>
        <div className="flex min-w-0 flex-col gap-3 sm:sticky sm:top-4">
          <div className="flex items-center justify-between gap-2"><h2 className="text-sm font-semibold">{t('存储目录')}</h2><span className="text-xs tabular-nums text-muted">{allLocations.length}</span></div>
          {locations.isError || directories.isError ? <div role="alert" className="flex flex-col gap-2 rounded-md border border-line p-3 text-sm"><p className="text-danger">{t('目录读取失败')}</p><Button variant="secondary" size="sm" onClick={() => { void locations.refetch(); void directories.refetch(); }}>{t('重试')}</Button></div>
            : locations.isPending || directories.isPending ? <div role="status" className="rounded-md border border-line px-3 py-6 text-center text-sm text-muted">{t('正在读取目录…')}</div>
              : tree.nodes.length ? <TreeView label={t('存储目录')} nodes={tree.nodes} selectionMode="single" selectedIds={selectedNode} onSelectionChange={ids => { setSelectedNode(ids); setPage(1); setCheckedIDs([]); }} defaultExpandedIds={tree.nodes.map(node => node.id)} className="max-h-[60dvh] overflow-auto rounded-md border-line bg-surface p-1.5 sm:max-h-[calc(100dvh-13rem)]" />
                : <p className="rounded-md border border-line px-3 py-5 text-center text-sm text-muted">{t('暂无存储位置')}</p>}
        </div>
      </aside>
      <section className="flex min-w-0 flex-col gap-3" aria-label={t('文件列表')}>
        <DataTableToolbar summary={{ label: t('文件总数'), value: list.data?.total ?? 0 }}
          search={{ label: t('搜索文件'), placeholder: t('文件名或文件 ID'), value: search, maxLength: 200, onChange: value => { setSearch(value); setPage(1); setCheckedIDs([]); } }} />
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <Button variant="secondary" size="sm" disabled={!checkedIDs.length || migrate.isPending || startingAll} onClick={() => setMigrationDrawer('selected')}><Archive size={14} />{t('迁移所选')} ({checkedIDs.length})</Button>
          <Button variant="secondary" size="sm" disabled={!list.data?.total || migrate.isPending || startingAll} onClick={() => setMigrationDrawer('all')}><Archive size={14} />{t('迁移当前筛选的全部可用文件')}</Button>
        </div>
        {migration && <div className="flex min-w-0 flex-wrap items-center justify-between gap-2 border-s-2 border-accent bg-surface-alt px-3 py-2 text-xs" role="status" aria-live="polite">
          <span>{t('迁移进度')}：{t('已处理 {{done}} / {{total}}', { done: migration.done, total: migration.total })}{migration.failed.length ? ` · ${t('失败')} ${migration.failed.length}` : ''}</span>
          <progress className="h-2 w-32 accent-[var(--color-accent)]" max={Math.max(migration.total, 1)} value={migration.done} aria-label={t('迁移进度')} />
        </div>}
        {migration?.failed.length ? <div className="rounded-md border border-line px-3 py-2 text-xs text-muted"><div className="flex flex-wrap items-center justify-between gap-2"><span>{t('迁移失败的文件')} ({migration.failed.length})</span><Button variant="secondary" size="sm" disabled={migrate.isPending || startingAll} onClick={() => startMigration(migration.failed, migration.destination)}>{t('重试失败项')}</Button></div><ul className="mt-2 max-h-28 overflow-auto ps-5 font-mono">{migration.failed.map(id => <li key={id}>{id}</li>)}</ul></div> : null}
        {list.data && <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
          <span>{t('已选择 {{count}} 个可用文件', { count: checkedIDs.length })}</span>
          <Button variant="ghost" size="sm" disabled={!selectableIDs.length || migrate.isPending || startingAll} onClick={toggleAll}>{selectableIDs.length && selectableIDs.every(id => checkedIDs.includes(id)) ? t('取消本页全选') : t('选择本页可用文件')}</Button>
        </div>}
        <DataTable table={dataTable} pending={list.isPending} busy={list.isFetching} error={list.error} onRetry={() => void list.refetch()}
          className="[&_th]:px-3 [&_td]:px-3" compactHiddenColumns={['size', 'creator', 'created']} wrapperClassName="max-w-full"
          empty={{ icon: File, title: t('没有匹配的文件'), hint: t('更改搜索条件或目录筛选后重试。') }} />
        <DataTablePagination page={page} pageSize={list.data?.page_size ?? PAGE_SIZE} total={list.data?.total ?? 0} onPageChange={onPageChange} disabled={list.isFetching || migrate.isPending} />
      </section>
    </div>
    {migrationDrawer && <FormDrawer title={t('迁移文件')} description={t(migrationDrawer === 'all' ? '选择目标后将迁移当前筛选下全部可用文件。' : '选择目标后将迁移选中的可用文件。')} onClose={() => setMigrationDrawer(null)} pending={migrate.isPending || startingAll}>
      <div className="flex min-h-0 flex-1 flex-col">
        <AppFormBody className="gap-5">
          <SimpleSelect label={t('目标存储位置')} value={targetLocation} onChange={setTargetLocation} disabled={migrate.isPending || startingAll} options={[
          { value: '', label: t('选择已测试的存储位置'), disabled: true },
          ...validTargets.map(item => ({ value: item.id, label: `${locationLabel(item)}${item.active ? ` (${t('当前默认')})` : ''}`, disabled: item.id === locationID })),
          ]} />
          <p className="text-sm leading-relaxed text-muted">{t('迁移不会改变文件引用；目标仅限已通过测试的存储位置。')}</p>
          <p className="text-xs leading-relaxed text-muted">{t('仅支持本地与云存储之间迁移，不支持云存储之间互迁。')}</p>
          {migrationDrawer === 'all' && <p className="text-xs leading-relaxed text-muted">{t('云存储目标只迁移本地文件；本地目标接收云端文件。')}</p>}
          <label className="flex items-start justify-between gap-4 text-sm">
            <span>{t('全部迁移成功后，将目标设为全局默认')}<span className="mt-1 block text-xs leading-relaxed text-muted">{t('切换后新文件上传到目标位置；失败时保留当前默认。')}</span></span>
            <Switch checked={activateAfterMigration} onChange={setActivateAfterMigration} disabled={migrate.isPending || startingAll} aria-label={t('全部迁移成功后，将目标设为全局默认')} />
          </label>
          <p className="text-xs leading-relaxed text-muted">{t('迁移期间请保持此页面打开；中断后可按源存储位置筛选并继续。')}</p>
          <p className="border-s-2 border-accent bg-surface-alt px-3 py-2 text-sm">{migrationDrawer === 'all' ? t('迁移当前筛选下全部可用文件') : t('迁移选中的 {{count}} 个可用文件', { count: checkedIDs.length })}</p>
        </AppFormBody>
        <AppFormFooter>
          <Button type="button" variant="secondary" disabled={migrate.isPending || startingAll} onClick={() => setMigrationDrawer(null)}>{t('取消')}</Button>
          <Button type="button" disabled={!targetValid || migrate.isPending || startingAll || (migrationDrawer === 'selected' && !checkedIDs.length)} pending={startingAll || migrate.isPending} onClick={() => void beginMigration()}>{t('开始迁移')}</Button>
        </AppFormFooter>
      </div>
    </FormDrawer>}
    {confirmDelete && <ConfirmDialog danger title={t('删除文件')} description={t('确定删除文件“{{name}}”？删除后无法恢复。', { name: confirmDelete.file.original_name })} confirmLabel={t('确认删除')} cancelLabel={t('取消')} pending={remove.isPending} onConfirm={() => remove.mutate(confirmDelete)} onCancel={() => setConfirmDelete(null)} />}
  </div>;
}

function useColumns({ checkedIDs, setCheckedIDs, setCheckedSources, setConfirmDelete, catalog, selectableIDs = [], toggleAll, locale }: {
  checkedIDs: string[]; setCheckedIDs: (value: string[] | ((current: string[]) => string[])) => void;
  setCheckedSources: (value: (current: Record<string, string>) => Record<string, string>) => void;
  setConfirmDelete: (entry: FileCatalogEntry) => void; catalog: NonNullable<PageProps['client']['fileCatalog']>;
  selectableIDs?: string[]; toggleAll?: () => void; locale: string;
}) {
  useLocale();
  return useMemo(() => column.columns([
    column.display({ id: 'select', header: () => <Checkbox aria-label={t('选择本页所有可用文件')} checked={!!selectableIDs.length && selectableIDs.every(id => checkedIDs.includes(id))} disabled={!selectableIDs.length} onChange={toggleAll ?? (() => {})} />, cell: context => {
      const file = context.row.original.file;
      return <Checkbox aria-label={t('选择文件 {{name}}', { name: file.original_name })} checked={checkedIDs.includes(file.file_id)} disabled={file.state !== 'ready' || !file.capabilities.download} onChange={checked => { setCheckedSources(current => ({ ...current, [file.file_id]: file.storage_type })); setCheckedIDs(current => checked ? [...new Set([...current, file.file_id])] : current.filter(id => id !== file.file_id)); }} />;
    } }),
    column.accessor(row => row.file.original_name, { id: 'name', header: t('文件名'), cell: context => {
      const { file, directory } = context.row.original;
      const expired = file.state === 'ready' && file.expires_at > 0 && file.expires_at <= Math.floor(Date.now() / 1000);
      return <div className="flex min-w-0 max-w-52 flex-col gap-1 max-sm:max-w-[calc(100vw-11rem)]">
        <span className="truncate font-medium" title={`${file.original_name}\n${file.file_id}`}>{file.original_name}</span>
        <span className="truncate text-[11px] text-muted" title={`${directory || t('默认上传目录')} · ${file.mime_type}`}>{directory || t('默认上传目录')} · {file.mime_type || t('未知')}</span>
        <span className="text-[11px] tabular-nums text-muted sm:hidden">{formatSize(file.size)}</span>
        <span className="truncate text-[11px] text-muted sm:hidden">{creatorLabel(context.row.original)}</span>
        {file.state !== 'ready' && <Badge variant="warning">{t(stateLabels[file.state] ?? file.state)}</Badge>}
        {expired && <Badge variant="warning">{t('已过期')}</Badge>}
      </div>;
    } }),
    column.accessor(row => row.file.size, { id: 'size', header: t('大小'), cell: context => <span className="whitespace-nowrap tabular-nums">{formatSize(context.getValue())}</span> }),
    column.accessor(row => creatorLabel(row), { id: 'creator', header: t('上传者'), cell: context => <div className="flex max-w-28 flex-col gap-0.5 text-xs"><span className="truncate" title={context.getValue()}>{context.getValue()}</span>{context.row.original.creator_name && context.row.original.creator_username && <span className="truncate text-[11px] text-muted" title={context.row.original.creator_username}>@{context.row.original.creator_username}</span>}</div> }),
    column.accessor(row => row.file.created_at, { id: 'created', header: t('上传时间'), cell: context => <time className="block max-w-28 text-xs leading-5" dateTime={new Date(context.getValue() * 1000).toISOString()}>{formatDate(context.getValue(), locale)}</time> }),
    column.display({ id: 'actions', header: t('操作'), cell: context => <FileActions entry={context.row.original} catalog={catalog} onDelete={setConfirmDelete} /> }),
  ]), [catalog, checkedIDs, locale, selectableIDs, setCheckedIDs, setCheckedSources, setConfirmDelete, toggleAll]);
}

function FileActions({ entry, catalog, onDelete }: { entry: FileCatalogEntry; catalog: NonNullable<PageProps['client']['fileCatalog']>; onDelete: (entry: FileCatalogEntry) => void }) {
  const message = useMessage();
  const access = useMutation({
    mutationFn: () => catalog.access(entry.file.file_id),
    onSuccess: result => {
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
  return <div className="flex items-center gap-1">
    {entry.file.capabilities.download && <Button variant="ghost" size="icon" title={t('下载文件')} aria-label={t('下载文件')} pending={access.isPending} disabled={access.isPending} onClick={() => access.mutate()}><Download size={14} aria-hidden="true" /></Button>}
    {entry.file.capabilities.delete && <Button variant="ghost" size="icon" title={t('删除文件')} aria-label={t('删除文件')} disabled={access.isPending} onClick={() => onDelete(entry)}><Trash2 size={14} aria-hidden="true" /></Button>}
  </div>;
}

// Author: yunnuo <ymz@ebox.vip>
// Description: Owner-scoped files on TanStack Table v9: uploads, temporary grants, migration and deletion.
import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRightLeft, Download, File, Play, Search, Trash2, Upload } from 'lucide-react';
import { columnVisibilityFeature, createColumnHelper, createCoreRowModel, createPaginatedRowModel, flexRender, rowPaginationFeature, tableFeatures, useTable } from '@tanstack/react-table';
import { defineMessages, currentLocale, t, useLocale } from '../i18n';
import { Button, Card, CardContent, Input, Modal, NativeSelect, Table, TableBody, TableCell, TableEmpty, TableHead, TableHeader, TableRow, useMessage } from '../ui';
import { cn } from '../lib/cn';
import { FileUploadDialog } from '../file-upload-dialog';
import type { PageProps } from '../router';
import type { FileEntry } from '@unicore/sdk';

const bytes = (n: number) => n >= 1073741824 ? `${(n / 1073741824).toFixed(1)} GiB` : n >= 1048576 ? `${(n / 1048576).toFixed(1)} MiB` : n >= 1024 ? `${(n / 1024).toFixed(1)} KiB` : `${n} B`;
const states: Record<string, string> = defineMessages({ pending: '待上传', copying: '待确认', ready: '可用', deleted: '已删除' });

// Static feature set: pagination state plus the row models used by this server-paginated table.
const filesFeatures = tableFeatures({
  rowPaginationFeature,
  columnVisibilityFeature,
  coreRowModel: createCoreRowModel(),
  paginatedRowModel: createPaginatedRowModel(),
});
const helper = createColumnHelper<typeof filesFeatures, FileEntry>();
const EMPTY_FILES: FileEntry[] = [];
type Dialog = { kind: 'delete' | 'migrate'; file: FileEntry };

export function FilesPage({ client, metadata }: PageProps) {
  useLocale();
  const administrator = metadata.identity_realm === 'administrator';
  const api = client.files!;
  const cache = useQueryClient();
  const message = useMessage();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [upload, setUpload] = useState<{ file?: FileEntry } | null>(null);
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [target, setTarget] = useState('');
  const q = useQuery({ queryKey: ['files', search, page], queryFn: () => api.listFiles(search, page) });
  const locations = useQuery({
    queryKey: ['storage-locations'],
    queryFn: () => client.storage!.storageLocations(),
    enabled: administrator && dialog?.kind === 'migrate',
  });
  const mutate = useMutation({
    mutationFn: async ({ kind, file }: { kind: 'access' | 'delete' | 'migrate'; file: FileEntry }) => {
      if (kind === 'access') {
        const access = await api.fileAccess(file.file_id);
        const link = document.createElement('a');
        link.href = access.url; link.rel = 'noreferrer'; link.download = file.original_name;
        document.body.append(link); link.click(); link.remove();
        return;
      }
      if (kind === 'delete') await api.deleteFile(file.file_id);
      else await api.migrateFile(file.file_id, target);
    },
    onSuccess: (_, change) => {
      if (change.kind === 'access') return;
      message.success(change.kind === 'delete' ? t('文件已删除，旧下载链接将在有效期后失效') : t('文件迁移完成，文件 ID 保持不变'));
      setDialog(null);
      void cache.invalidateQueries({ queryKey: ['files'] });
      void cache.invalidateQueries({ queryKey: ['storage-locations'] });
    },
  });

  const columns = useMemo(() => helper.columns([
    helper.accessor('original_name', {
      header: () => t('文件'),
      cell: ({ row }) => <div className="min-w-0">
        <strong className="block max-w-56 truncate text-sm font-medium text-ink sm:max-w-none" title={row.original.original_name}>{row.original.original_name}</strong>
        {administrator && <small className="block truncate font-mono text-2xs text-subtle">{row.original.file_id}</small>}
      </div>,
    }),
    helper.accessor('size', {
      header: () => t('大小 / 类型'),
      cell: ({ row }) => <div>
        <span className="text-sm tabular-nums">{bytes(row.original.size)}</span>
        <small className="block truncate text-2xs text-subtle">{row.original.mime_type}</small>
      </div>,
    }),
    helper.display({
      id: 'state',
      header: () => administrator ? t('存储 / 状态') : t('状态'),
      cell: ({ row }) => administrator
        ? <div>
            <span className="text-sm">{row.original.storage_type}</span>
            <small className="block text-2xs text-subtle">{t(states[row.original.state])}</small>
          </div>
        : <span className={cn('inline-flex rounded-full px-2 py-0.5 text-2xs font-medium',
            row.original.state === 'ready' ? 'bg-success-soft text-success' : 'bg-surface-alt text-muted')}>
            {t(states[row.original.state])}
          </span>,
    }),
    helper.accessor('created_at', {
      header: () => t('上传时间'),
      cell: ({ row }) => <span className="whitespace-nowrap text-sm tabular-nums">{new Date(row.original.created_at * 1000).toLocaleString(currentLocale())}</span>,
    }),
    helper.display({
      id: 'actions',
      header: () => t('操作'),
      cell: ({ row }) => {
        const file = row.original;
        return <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" aria-label={t('下载 {{v0}}', { v0: file.original_name })} disabled={file.state !== 'ready' || mutate.isPending} onClick={() => mutate.mutate({ kind: 'access', file })}><Download size={17} /></Button>
          {file.state !== 'ready' && <Button variant="ghost" size="icon" aria-label={t('继续上传 {{name}}', { name: file.original_name })} onClick={() => setUpload({ file })}><Play size={17} /></Button>}
          {administrator && <Button variant="ghost" size="icon" aria-label={t('迁移 {{v0}}', { v0: file.original_name })} disabled={file.state !== 'ready' || mutate.isPending} onClick={() => { setTarget(''); setDialog({ kind: 'migrate', file }); }}><ArrowRightLeft size={17} /></Button>}
          <Button variant="ghost" size="icon" className="hover:text-danger" aria-label={t('删除 {{v0}}', { v0: file.original_name })} disabled={mutate.isPending} onClick={() => setDialog({ kind: 'delete', file })}><Trash2 size={17} /></Button>
        </div>;
      },
    }),
  ]), [administrator, mutate]);

  const total = q.data?.total ?? 0;
  const pageSize = q.data?.page_size ?? 1;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const table = useTable({
    features: filesFeatures,
    columns,
    data: q.data?.items ?? EMPTY_FILES,
    manualPagination: true,
    pageCount,
    state: { pagination: { pageIndex: page - 1, pageSize } },
    onPaginationChange: updater => {
      const next = typeof updater === 'function' ? updater({ pageIndex: page - 1, pageSize }) : updater;
      setPage(Math.min(Math.max(next.pageIndex + 1, 1), pageCount));
    },
  });

  return <section className="flex flex-col gap-4" aria-label={t('文件管理')}>
    <Card>
      <CardContent className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-md font-semibold text-ink">{administrator ? t('实例文件') : t('我的文件')}</h2>
          <p className="text-xs text-muted">{administrator ? t('查看实例文件与存储分布，按需迁移。') : t('文件仅本人和管理员可访问，下载链接会自动过期。')}</p>
        </div>
        <Button onClick={() => setUpload({})}><Upload size={16} />{t('上传文件')}</Button>
      </CardContent>
    </Card>
    <Card>
      <CardContent className="flex flex-col gap-3">
        <div className="relative max-w-sm">
          <Search size={15} className="pointer-events-none absolute start-2.5 top-1/2 -translate-y-1/2 text-subtle" aria-hidden="true" />
          <Input aria-label={t('搜索文件')} placeholder={t('搜索文件名')} value={search} onChange={event => { setSearch(event.target.value); setPage(1); }} className="ps-8" />
        </div>
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map(group => <TableRow key={group.id}>
              {group.headers.map(header => <TableHead key={header.id}>
                {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
              </TableHead>)}
            </TableRow>)}
          </TableHeader>
          <TableBody>
            {q.isPending
              ? <TableEmpty colSpan={columns.length}><span role="status">{t('正在读取文件…')}</span></TableEmpty>
              : q.isError
                ? <TableEmpty colSpan={columns.length}><span className="flex flex-col items-center gap-2" role="alert">
                    <span>{t(q.error.message)}</span>
                    <Button variant="secondary" size="sm" onClick={() => void q.refetch()}>{t('重试')}</Button>
                  </span></TableEmpty>
                : !table.getRowModel().rows.length
                  ? <TableEmpty colSpan={columns.length}><span className="flex flex-col items-center gap-1.5 py-6">
                      <File size={32} className="text-subtle" aria-hidden="true" />
                      <strong className="text-md font-semibold text-ink">{t('还没有文件')}</strong>
                      <span className="text-sm text-muted">{t('上传后可在这里获取临时下载链接。')}</span>
                    </span></TableEmpty>
                  : table.getRowModel().rows.map(row => <TableRow key={row.id}>
                      {row.getVisibleCells().map(cell => <TableCell key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>)}
                    </TableRow>)}
          </TableBody>
        </Table>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <small className="text-xs text-muted">{t('共 {{total}} 个文件 · 第 {{page}} 页', { total, page })}</small>
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" disabled={page === 1} onClick={() => table.previousPage()}>{t('上一页')}</Button>
            <Button variant="secondary" size="sm" disabled={page * pageSize >= total} onClick={() => table.nextPage()}>{t('下一页')}</Button>
          </div>
        </div>
      </CardContent>
    </Card>
    {upload && <FileUploadDialog client={client} resume={upload.file} onClose={() => { setUpload(null); void cache.invalidateQueries({ queryKey: ['files'] }); }} />}
    {dialog && <Modal title={dialog.kind === 'delete' ? t('删除文件') : t('迁移文件')} pending={mutate.isPending} onClose={() => setDialog(null)}>
      <p className="truncate text-sm font-medium text-ink" title={dialog.file.original_name}>{dialog.file.original_name}</p>
      {dialog.kind === 'delete'
        ? <p className="mt-2 text-sm text-muted">{t('确定删除此文件？访问将被关闭，对象在已有链接到期后清理。')}</p>
        : <div className="mt-2 flex flex-col gap-2">
            <p className="text-xs text-muted">{t('复制并校验成功后才切换引用，旧对象会延迟清理。')}</p>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="migrate-target" className="text-sm font-medium text-ink">{t('目标存储位置')}</label>
              <NativeSelect id="migrate-target" required value={target} onChange={event => setTarget(event.target.value)}>
                <option value="">{t('请选择')}</option>
                {locations.data?.items.filter(l => l.tested && l.id !== dialog.file.location_id).map(l => <option key={l.id} value={l.id}>{l.name} · {l.provider}</option>)}
              </NativeSelect>
              {locations.isError && <p role="alert" className="text-xs text-danger">{t(locations.error.message)}</p>}
            </div>
          </div>}
      <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
        <Button variant="secondary" disabled={mutate.isPending} onClick={() => setDialog(null)}>{t('取消')}</Button>
        <Button pending={mutate.isPending} disabled={mutate.isPending || (dialog.kind === 'migrate' && !target)}
          onClick={() => mutate.mutate({ kind: dialog.kind, file: dialog.file })}>
          {mutate.isPending ? t('处理中…') : dialog.kind === 'delete' ? t('确认删除') : t('开始迁移')}
        </Button>
      </div>
    </Modal>}
  </section>;
}

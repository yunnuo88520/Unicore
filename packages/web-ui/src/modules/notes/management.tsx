// Author: yunnuo <ymz@ebox.vip>
import { useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { columnVisibilityFeature, createColumnHelper, createPaginatedRowModel, rowPaginationFeature, tableFeatures, useTable, type PaginationState } from '@tanstack/react-table';
import { NotebookPen, Save } from 'lucide-react';
import { AppField, AppForm, useAppForm } from '@unicore/form';
import { AppError, type ManagedNoteDetail, type ManagedNoteEditInput, type NoteManagementEntry } from '@unicore/sdk';
import { Badge, Button, Card, CardContent, ConfirmDialog, DialogFooter, Input, Modal, SimpleSelect, Textarea, useMessage } from '@unicore/ui';
import { useColumnVisibility } from '../../column-visibility';
import { DataTable, DataTablePagination, DataTableRowActions, DataTableToolbar, type DataTableAction } from '../../components/data-table';
import { currentLocale, defineMessages, t, useI18n } from '../../i18n';
import type { PageProps } from '../../router';
import { usePermissions } from '../../permissions';

const features = tableFeatures({ rowPaginationFeature, columnVisibilityFeature, paginatedRowModel: createPaginatedRowModel() });
const helper = createColumnHelper<typeof features, NoteManagementEntry>();
const emptyItems: NoteManagementEntry[] = [];
const statuses = defineMessages({ open: '待处理', done: '已完成' });
const columnLabels = defineMessages({ owner_name: '作者', status: '状态', updated_at: '更新时间' });
const compactHiddenColumns = Object.keys(columnLabels) as (keyof typeof columnLabels)[];
type RowActions = { actions: (note: NoteManagementEntry) => DataTableAction[]; preview?: (note: NoteManagementEntry) => void };
type ManagementClient = NonNullable<PageProps['client']['web']>;
type OpenNote = { note: NoteManagementEntry; edit: boolean };
const ownerName = (note: NoteManagementEntry) => note.owner_name || t('账号已删除');
function NoteStatus({ status }: { status: NoteManagementEntry['status'] }) {
  const done = status === 'done';
  return <Badge variant={done ? 'success' : 'subtle'}>{t(statuses[done ? 'done' : 'open'])}</Badge>;
}
function NoteTime({ timestamp }: { timestamp: number }) {
  const date = new Date(timestamp * 1000);
  return <time dateTime={date.toISOString()} className="whitespace-nowrap text-muted">{date.toLocaleString(currentLocale(), {
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  })}</time>;
}
const columns = helper.columns([
  helper.accessor('title', {
    header: () => t('笔记标题'),
    cell: ({ row: { original: note }, table }) => {
      const preview = (table.options.meta as RowActions).preview;
      const visible = table.options.state?.columnVisibility ?? {};
      return <div className="min-w-0">
        {preview && note.can_preview
          ? <button type="button" className="rounded-sm text-start font-medium [overflow-wrap:anywhere] hover:text-accent hover:underline focus-visible:outline-2 focus-visible:outline-focus" onClick={() => preview(note)}>{note.title}</button>
          : <span className="font-medium [overflow-wrap:anywhere]">{note.title}</span>}
        {compactHiddenColumns.some(id => visible[id] !== false) && <div className="mt-1 flex flex-col items-start gap-1 text-xs text-muted sm:hidden">
          {visible.owner_name !== false && <span className="[overflow-wrap:anywhere]">{ownerName(note)}</span>}
          {(visible.status !== false || visible.updated_at !== false) && <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            {visible.status !== false && <NoteStatus status={note.status} />}
            {visible.updated_at !== false && <NoteTime timestamp={note.updated_at} />}
          </div>}
        </div>}
      </div>;
    },
  }),
  helper.accessor('owner_name', {
    header: () => t(columnLabels.owner_name),
    cell: ({ row: { original: note } }) => <span className="block [overflow-wrap:anywhere]">
      {ownerName(note)}
      {note.owner_username && note.owner_username !== note.owner_name && <small className="block text-xs text-muted">{note.owner_username}</small>}
    </span>,
  }),
  helper.accessor('status', {
    header: () => t(columnLabels.status),
    cell: ({ getValue }) => <NoteStatus status={getValue()} />,
  }),
  helper.accessor('updated_at', {
    header: () => t(columnLabels.updated_at),
    cell: ({ getValue }) => <NoteTime timestamp={getValue()} />,
  }),
  helper.display({ id: 'actions', header: () => t('操作'), cell: ({ row, table }) =>
    <DataTableRowActions label={t('笔记操作：{{title}}', { title: row.original.title })} items={(table.options.meta as RowActions).actions(row.original)} />,
  }),
]);

type Mutation = { note: NoteManagementEntry; status?: 'open' | 'done' };

export default function NoteManagementPage({ client, metadata }: PageProps) {
  const { t } = useI18n();
  const { can } = usePermissions(metadata);
  const message = useMessage();
  const cache = useQueryClient();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: 20 });
  const [confirm, setConfirm] = useState<Mutation | null>(null);
  const [opened, setOpened] = useState<OpenNote | null>(null);
  const web = client.web;
  const filter = { search: search.trim(), status, page: pagination.pageIndex + 1 };
  const list = useQuery({ queryKey: ['note-management', filter], queryFn: () => web!.listNoteManagement(filter), enabled: !!web, placeholderData: keepPreviousData });
  const { columnVisibility, menu, toggle } = useColumnVisibility('note-management',
    compactHiddenColumns.map(id => ({ id, label: t(columnLabels[id]) })));
  const refresh = () => cache.invalidateQueries({ queryKey: ['note-management'] });
  const filtered = !!(filter.search || filter.status);
  const firstPage = () => setPagination(current => current.pageIndex === 0 ? current : { ...current, pageIndex: 0 });
  const mutation = useMutation({
    mutationFn: ({ note, status }: Mutation) => status ? web!.updateNoteManagementStatus(note.owner_id, note.id, { status, version: note.version }) : web!.deleteManagedNote(note.owner_id, note.id, note.version),
    onSuccess: (_data, input) => {
      if ((!input.status || filter.status && filter.status !== input.status) && !list.isPlaceholderData && list.data?.items.length === 1 && pagination.pageIndex > 0) {
        setPagination(current => ({ ...current, pageIndex: Math.max(0, current.pageIndex - 1) }));
      }
      setConfirm(null);
      message.success(t(input.status ? '笔记状态已更新' : '笔记已删除'));
      void refresh();
    },
    onError: error => {
      if (error instanceof AppError && ['NOTE_CONFLICT', 'NOTE_NOT_FOUND'].includes(error.code)) {
        setConfirm(null);
        void refresh();
      }
    },
  });
  const canUpdate = can('updateNoteManagementStatus');
  const canDelete = can('deleteManagedNote');
  const canPreview = can('previewManagedNote');
  const canEdit = canPreview && can('editManagedNote');
  const table = useTable({ features, columns: canPreview || canUpdate || canDelete ? columns : columns.filter(column => column.id !== 'actions'),
    data: list.data?.items ?? emptyItems, getRowId: row => `${row.owner_id}/${row.id}`,
    meta: { actions: note => [
      ...(canPreview && note.can_preview ? [{ label: t('预览笔记'), onSelect: () => setOpened({ note, edit: false }) }] : []),
      ...(canEdit && note.can_edit ? [{ label: t('编辑笔记'), onSelect: () => setOpened({ note, edit: true }) }] : []),
      ...(canUpdate && note.can_update ? [{ label: t(note.status === 'done' ? '标记为待处理' : '标记为已完成'),
        onSelect: () => setConfirm({ note, status: note.status === 'done' ? 'open' : 'done' }) }] : []),
      ...(canDelete && note.can_delete ? [{ label: t('删除笔记'), danger: true, onSelect: () => setConfirm({ note }) }] : []),
    ], preview: canPreview ? note => setOpened({ note, edit: false }) : undefined } satisfies RowActions,
    state: { columnVisibility, pagination }, onPaginationChange: setPagination, manualPagination: true,
    pageCount: list.data ? Math.max(1, Math.ceil(list.data.total / list.data.page_size)) : 1,
  });
  return <Card className="min-w-0">
    <CardContent className="flex flex-col gap-4">
      <DataTableToolbar
        summary={{ label: filtered ? t('筛选结果') : t('笔记总数'), value: <span role="status">
          {list.isFetching ? t('加载中…') : list.data ? t('共 {{count}} 条', { count: list.data.total }) : '–'}
        </span> }}
        search={{ label: t('搜索标题或作者'), placeholder: t('搜索'), value: search, maxLength: 128,
          onChange: value => { setSearch(value); firstPage(); } }}
        columnMenu={{ entries: menu, onToggle: toggle }}>
        <SimpleSelect label={t('笔记状态')} className="h-9 w-auto" value={status}
          onChange={value => { setStatus(value); firstPage(); }}
          options={[{ value: '', label: t('全部状态') }, ...Object.entries(statuses).map(([value, label]) => ({ value, label: t(label) }))]} />
      </DataTableToolbar>
      <DataTable table={table} pending={list.isPending} busy={list.isFetching} error={list.error} onRetry={() => void list.refetch()}
        compactHiddenColumns={compactHiddenColumns} empty={{ icon: NotebookPen, title: t('没有符合条件的笔记') }} />
      <DataTablePagination table={table} disabled={list.isFetching} />
    </CardContent>
    {web && opened && canPreview && <ManagedNoteDialog web={web} opened={opened}
      edit={canEdit && opened.edit} onClose={() => setOpened(null)} onSaved={() => { setOpened(null); void refresh(); }} />}
    {confirm && <ConfirmDialog
      title={t(confirm.status ? '修改笔记状态' : '删除笔记')}
      description={confirm.status ? t('将「{{title}}」设为{{status}}？', { title: confirm.note.title, status: t(statuses[confirm.status]) })
        : t('删除「{{title}}」后，作者也将无法再查看。', { title: confirm.note.title })}
      confirmLabel={t(confirm.status ? '确定' : '确认删除')} cancelLabel={t('取消')} danger={!confirm.status} pending={mutation.isPending}
      onCancel={() => setConfirm(null)} onConfirm={() => mutation.mutate(confirm)} />}
  </Card>;
}

function ManagedNoteDialog({ web, opened, edit, onClose, onSaved }: {
  web: ManagementClient; opened: OpenNote; edit: boolean; onClose: () => void; onSaved: () => void;
}) {
  const { t } = useI18n();
  const { note } = opened;
  const message = useMessage();
  const detail = useQuery({ queryKey: ['managed-note-detail', note.owner_id, note.id],
    queryFn: () => web.previewManagedNote(note.owner_id, note.id), gcTime: 0, refetchOnWindowFocus: false });
  const save = useMutation({
    mutationFn: (values: ManagedNoteEditInput) => web.editManagedNote(note.owner_id, note.id, values),
    onSuccess: () => { message.success(t('笔记已保存')); onSaved(); },
  });
  return <Modal title={t(edit ? '编辑笔记' : '预览笔记')} pending={save.isPending} onClose={onClose}>
    {detail.isPending ? <p role="status" className="text-sm text-muted">{t('加载中…')}</p>
      : detail.isError ? <div role="alert" className="flex flex-wrap items-center gap-3 text-sm text-danger">
        <span>{t(detail.error.message)}</span><Button variant="secondary" onClick={() => void detail.refetch()}>{t('重试')}</Button>
      </div>
      : edit ? <ManagedNoteForm detail={detail.data} pending={save.isPending} onClose={onClose} onSubmit={save.mutate} />
        : <>
          <div className="space-y-3">
            <h3 className="font-semibold text-ink [overflow-wrap:anywhere]">{detail.data.title}</h3>
            <div className="flex flex-wrap items-center gap-2 text-sm text-muted">
              <span className="[overflow-wrap:anywhere]">{ownerName(note)}</span><NoteStatus status={detail.data.status} />
            </div>
            <p className="whitespace-pre-wrap text-sm text-ink [overflow-wrap:anywhere]">{detail.data.body || t('无正文')}</p>
          </div>
          <DialogFooter><Button variant="secondary" onClick={onClose}>{t('关闭')}</Button></DialogFooter>
        </>}
  </Modal>;
}

function ManagedNoteForm({ detail, pending, onClose, onSubmit }: {
  detail: ManagedNoteDetail; pending: boolean; onClose: () => void;
  onSubmit: (values: ManagedNoteEditInput, options: { onError: (error: Error) => void }) => void;
}) {
  const { t } = useI18n();
  const form = useAppForm<ManagedNoteEditInput>({
    schema: 'ManagedNoteEditInput', defaultValues: { title: detail.title, body: detail.body, version: detail.version },
    onSubmit: values => onSubmit({ ...values, title: values.title.trim() }, { onError: error => form.applyServerError(error) }),
  });
  return <AppForm form={form} className="flex min-w-0 flex-col gap-3">
    <AppField name="title" label={t('标题')}><Input autoFocus required maxLength={120} /></AppField>
    <AppField name="body" label={t('正文')}><Textarea maxLength={5000} rows={8} /></AppField>
    <DialogFooter className="mt-1">
      <Button variant="secondary" onClick={onClose} disabled={pending}>{t('取消')}</Button>
      <Button type="submit" pending={pending}>{!pending && <Save size={14} aria-hidden="true" />}{t('保存笔记')}</Button>
    </DialogFooter>
  </AppForm>;
}

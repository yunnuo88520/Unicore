// Author: yunnuo <ymz@ebox.vip>
// Description: Announcement console on TanStack Table: visibility switch, batch deletion and modal editing with live preview.
import { useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createColumnHelper, createPaginatedRowModel, flexRender, rowPaginationFeature, tableFeatures, useTable, type PaginationState, type TableOptions } from '@tanstack/react-table';
import { Controller, useWatch } from 'react-hook-form';
import { ChevronLeft, ChevronRight, Eye, Megaphone, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import type { AnnouncementEntry, AnnouncementInput, AnnouncementQuery, AnnouncementSelection, WebClient } from '@unicore/sdk';
import { currentLocale, defineMessages, t, useI18n } from '../../i18n';
import { AppForm, useAppForm } from '../../lib/form';
import { Badge, Button, Card, CardContent, Checkbox, ConfirmDialog, Input, Label, Modal, NativeSelect, Switch, Table, TableBody, TableCell, TableEmpty, TableHead, TableHeader, TableRow, Textarea, useMessage } from '../../ui';
import { RichTextEditor } from '../../ui/editor';
import { RichContent, contentSummary } from '../../rich-content';
import { AnnouncementType, announcementTypes } from '../../announcements-card';
import type { PageProps } from '../../router';

const features = tableFeatures({ rowPaginationFeature, paginatedRowModel: createPaginatedRowModel() });
const helper = createColumnHelper<typeof features, AnnouncementEntry>();
const EMPTY_ITEMS: AnnouncementEntry[] = [];
const COLUMN_COUNT = 7;
const PAGE_SIZE = 10;
const statuses = defineMessages({ draft: '草稿', published: '已发布', scheduled: '定时发布' });
const localDate = (seconds: number) => {
  const date = new Date(seconds * 1000);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};

type AnnouncementTableMeta = {
  allChecked: boolean;
  isSelected: (id: string) => boolean;
  onSelectAll: (checked: boolean) => void;
  onToggle: (item: AnnouncementEntry, checked: boolean) => void;
  onEdit: (item: AnnouncementEntry) => void;
  onRemove: (item: AnnouncementEntry) => void;
};

const columns = helper.columns([
  helper.display({
    id: 'selected',
    header: ({ table }) => {
      const meta = table.options.meta as AnnouncementTableMeta;
      return <Checkbox aria-label={t('选择本页公告')} checked={meta.allChecked} onChange={meta.onSelectAll} />;
    },
    cell: info => {
      const meta = info.table.options.meta as AnnouncementTableMeta;
      const item = info.row.original;
      return <Checkbox aria-label={t('选择公告 {{id}}', { id: item.id.slice(0, 8) })} checked={meta.isSelected(item.id)} onChange={value => meta.onToggle(item, value)} />;
    },
  }),
  helper.display({
    id: 'content',
    header: () => t('公告内容'),
    cell: info => <button type="button" className="block max-w-72 min-w-44 truncate text-start text-ink hover:text-accent hover:underline"
      onClick={() => (info.table.options.meta as AnnouncementTableMeta).onEdit(info.row.original)}>
      {contentSummary(info.row.original.content_html)}
    </button>,
  }),
  helper.display({ id: 'type', header: () => t('类型'), cell: info => <AnnouncementType type={info.row.original.type} /> }),
  helper.display({
    id: 'status',
    header: () => t('状态'),
    cell: info => {
      const item = info.row.original;
      const scheduled = item.status === 'published' && item.publish_at > Date.now() / 1000;
      return <Badge variant={scheduled || item.status === 'published' ? 'primary' : 'subtle'}>{t(statuses[scheduled ? 'scheduled' : item.status])}</Badge>;
    },
  }),
  helper.display({
    id: 'publish_at',
    header: () => t('发布时间'),
    cell: info => <time className="whitespace-nowrap text-muted">{new Date(info.row.original.publish_at * 1000).toLocaleString(currentLocale(), { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}</time>,
  }),
  helper.display({
    id: 'note',
    header: () => t('备注'),
    cell: info => <span title={info.row.original.note} className="block max-w-36 truncate text-muted">{info.row.original.note || '—'}</span>,
  }),
  helper.display({
    id: 'actions',
    header: () => t('操作'),
    cell: info => {
      const meta = info.table.options.meta as AnnouncementTableMeta;
      const item = info.row.original;
      return <div className="flex items-center gap-1">
        <Button variant="ghost" size="icon" aria-label={t('编辑公告')} onClick={() => meta.onEdit(item)}><Pencil size={14} /></Button>
        <Button variant="ghost" size="icon" aria-label={t('删除公告')} onClick={() => meta.onRemove(item)}><Trash2 size={14} /></Button>
      </div>;
    },
  }),
]);

export function AdminAnnouncementsPage({ client }: PageProps) {
  if (!client.web) return null;
  return <AnnouncementPanel web={client.web} />;
}

function AnnouncementPanel({ web }: { web: WebClient }) {
  const { t } = useI18n();
  const message = useMessage();
  const cache = useQueryClient();
  const [switchValue, setSwitchValue] = useState<boolean | null>(null);
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState<AnnouncementQuery>({ search: '', status: '', page: 1, page_size: PAGE_SIZE });
  const [editor, setEditor] = useState<AnnouncementEntry | 'new' | null>(null);
  const [selection, setSelection] = useState<AnnouncementSelection[]>([]);
  const [removing, setRemoving] = useState<AnnouncementSelection[] | null>(null);
  const list = useQuery({
    queryKey: ['admin-announcements', query],
    queryFn: () => web.adminAnnouncements(query),
    placeholderData: keepPreviousData,
  });
  const refresh = () => {
    setSelection([]);
    void cache.invalidateQueries({ queryKey: ['admin-announcements'] });
    void cache.invalidateQueries({ queryKey: ['announcements'] });
  };
  const toggle = useMutation({
    mutationFn: (enabled: boolean) => web.saveAnnouncementSettings(enabled),
    onError: () => setSwitchValue(null),
    onSuccess: data => {
      cache.setQueriesData({ queryKey: ['admin-announcements'] }, (old: { enabled: boolean } | undefined) => old ? { ...old, enabled: data.enabled } : old);
      setSwitchValue(null);
      message.success(t('公告展示设置已保存'));
      refresh();
    },
  });
  const remove = useMutation({
    mutationFn: (items: AnnouncementSelection[]) => web.deleteAnnouncements(items),
    onSuccess: (_data, removed) => {
      message.success(t('公告已删除'));
      setRemoving(null);
      if (list.data && list.data.items.length <= removed.length && query.page > 1) setQuery(current => ({ ...current, page: current.page - 1 }));
      refresh();
    },
  });
  const setFilter = (patch: Partial<AnnouncementQuery>) => {
    setQuery(current => ({ ...current, ...patch, page: 1 }));
    setSelection([]);
  };
  const items = list.data?.items ?? EMPTY_ITEMS;
  const selected = (id: string) => selection.some(item => item.id === id);
  const all = items.length > 0 && items.every(item => selected(item.id));
  const pages = Math.max(1, Math.ceil((list.data?.total ?? 0) / query.page_size));
  const meta: AnnouncementTableMeta = {
    allChecked: all,
    isSelected: selected,
    onSelectAll: checked => setSelection(checked ? items.map(({ id, version }) => ({ id, version })) : []),
    onToggle: (item, checked) => setSelection(current => checked
      ? [...current, { id: item.id, version: item.version }]
      : current.filter(entry => entry.id !== item.id)),
    onEdit: item => setEditor(item),
    onRemove: item => setRemoving([{ id: item.id, version: item.version }]),
  };
  const pagination: PaginationState = { pageIndex: query.page - 1, pageSize: query.page_size };
  const table = useTable({
    features,
    columns,
    data: items,
    meta,
    getRowId: row => row.id,
    manualPagination: true,
    pageCount: pages,
    state: { pagination },
    onPaginationChange: updater => {
      const next = typeof updater === 'function' ? updater(pagination) : updater;
      setQuery(current => ({ ...current, page: next.pageIndex + 1, page_size: next.pageSize }));
      setSelection([]);
    },
  } as TableOptions<typeof features, AnnouncementEntry>);
  return <div className="flex flex-col gap-4">
    <Card>
      <CardContent className="flex items-center gap-4">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-accent"><Megaphone size={22} aria-hidden="true" /></span>
        <div className="min-w-0">
          <h2 className="text-md font-semibold text-ink">{t('公告展示')}</h2>
          <p className="mt-0.5 text-xs text-muted">{t('开启后，已发布公告会显示在用户工作台。')}</p>
        </div>
        <div className="ms-auto">
          <Switch id="announcements-enabled" checked={switchValue ?? list.data?.enabled ?? true} disabled={!list.data || toggle.isPending}
            onChange={value => { setSwitchValue(value); toggle.mutate(value); }} />
        </div>
      </CardContent>
    </Card>
    <Card>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-md font-semibold text-ink">{t('公告列表')}</h2>
            <p className="mt-0.5 text-xs text-muted">{t('集中管理通知、发布计划与内部备注。')}</p>
          </div>
          <Button onClick={() => setEditor('new')}><Plus size={15} />{t('新增公告')}</Button>
        </div>
        <form className="flex flex-wrap items-center gap-2" onSubmit={event => { event.preventDefault(); setFilter({ search }); }}>
          <label className="flex h-9 min-w-44 flex-1 items-center gap-2 rounded-md border border-line bg-surface px-3 text-base text-muted shadow-tint focus-within:border-focus focus-within:ring-2 focus-within:ring-focus sm:max-w-xs">
            <Search size={15} aria-hidden="true" />
            <input aria-label={t('搜索公告')} placeholder={t('搜索公告内容或备注…')} maxLength={128} className="w-full min-w-0 bg-transparent text-ink outline-none placeholder:text-subtle"
              value={search} onChange={event => setSearch(event.target.value)} />
          </label>
          <NativeSelect aria-label={t('公告状态')} className="h-9 w-auto" value={query.status} disabled={list.isFetching}
            onChange={event => setFilter({ status: event.target.value as AnnouncementQuery['status'] })}>
            <option value="">{t('全部状态')}</option>
            {Object.entries(statuses).map(([id, label]) => <option key={id} value={id}>{t(label)}</option>)}
          </NativeSelect>
          <Button variant="secondary" type="submit">{t('搜索')}</Button>
          <Button variant="secondary" type="button" className="ms-auto" disabled={!selection.length} onClick={() => setRemoving(selection)}>
            <Trash2 size={14} />{t('批量删除')}{selection.length > 0 && <span className="rounded-full bg-danger-soft px-1.5 text-2xs text-danger">{selection.length}</span>}
          </Button>
        </form>
        {list.isError && <div role="alert" className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-danger-line bg-danger-soft px-3 py-2 text-sm text-danger">
          <span>{t(list.error.message)}</span>
          <Button variant="secondary" size="sm" onClick={() => void list.refetch()}>{t('重试')}</Button>
        </div>}
        <div className="announcement-table announcement-table-content rounded-lg border border-line" aria-busy={list.isFetching}>
          <Table>
            <TableHeader>
              {table.getHeaderGroups().map(group => <TableRow key={group.id} className="hover:bg-transparent">
                {group.headers.map(header => <TableHead key={header.id}>{header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}</TableHead>)}
              </TableRow>)}
            </TableHeader>
            <TableBody>
              {list.isPending
                ? <TableEmpty colSpan={COLUMN_COUNT}>{t('正在读取公告…')}</TableEmpty>
                : table.getRowModel().rows.map(row => <TableRow key={row.id}>
                    {row.getAllCells().map(cell => <TableCell key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>)}
                  </TableRow>)}
              {!list.isPending && !items.length && <TableEmpty colSpan={COLUMN_COUNT}>
                <span className="flex flex-col items-center gap-1.5 py-2">
                  <Megaphone size={24} className="text-subtle" aria-hidden="true" />
                  <strong className="text-sm text-ink">{t(query.search || query.status ? '没有匹配的公告' : '暂无公告')}</strong>
                  <span className="text-xs text-muted">{t('新增公告，向用户传递平台消息。')}</span>
                </span>
              </TableEmpty>}
            </TableBody>
          </Table>
        </div>
        <div className="flex items-center justify-between gap-3 text-xs text-muted">
          <span>{t('共 {{count}} 条公告', { count: list.data?.total ?? 0 })}</span>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" aria-label={t('上一页')} disabled={!table.getCanPreviousPage() || list.isFetching}
              onClick={() => table.previousPage()}><ChevronLeft size={15} /></Button>
            <span>{query.page} / {pages}</span>
            <Button variant="ghost" size="icon" aria-label={t('下一页')} disabled={!table.getCanNextPage() || list.isFetching}
              onClick={() => table.nextPage()}><ChevronRight size={15} /></Button>
          </div>
        </div>
      </CardContent>
    </Card>
    {editor && <AnnouncementEditor key={editor === 'new' ? 'new' : editor.id} web={web} entry={editor === 'new' ? undefined : editor}
      onClose={() => setEditor(null)} onSaved={() => { setEditor(null); refresh(); }} />}
    {removing && <ConfirmDialog danger title={t('删除公告')} description={t('确定删除选中的 {{count}} 条公告？用户将无法继续查看。', { count: removing.length })}
      confirmLabel={t('确认删除')} cancelLabel={t('取消')} pending={remove.isPending}
      onConfirm={() => remove.mutate(removing)} onCancel={() => setRemoving(null)} />}
  </div>;
}

function AnnouncementEditor({ web, entry, onClose, onSaved }: { web: WebClient; entry?: AnnouncementEntry; onClose: () => void; onSaved: () => void }) {
  const { t } = useI18n();
  const message = useMessage();
  const [preview, setPreview] = useState(false);
  const form = useAppForm<AnnouncementInput>({
    schema: 'AnnouncementInput',
    defaultValues: {
      content: entry?.content ?? '',
      format: entry?.format ?? 'markdown',
      type: entry?.type ?? 'info',
      note: entry?.note ?? '',
      status: entry?.status ?? 'published',
      publish_at: entry?.publish_at ?? Math.floor(Date.now() / 1000),
    },
    onSubmit: async values => {
      try {
        await (entry ? web.updateAnnouncement(entry.id, { ...values, version: entry.version }) : web.createAnnouncement(values));
        message.success(t('公告已保存'));
        onSaved();
      } catch (error) {
        form.applyServerError(error);
      }
    },
  });
  const values = useWatch({ control: form.control }) as Partial<AnnouncementInput>;
  const format = values.format ?? 'markdown';
  const content = values.content ?? '';
  const render = useMutation({
    mutationFn: (input: AnnouncementInput) => web.previewAnnouncement(input),
    onSuccess: () => setPreview(true),
    onError: error => message.error(t(error.message)),
  });
  const pending = form.formState.isSubmitting || render.isPending;
  const current = (): AnnouncementInput => ({ ...form.getValues() });
  return <Modal title={t(entry ? '编辑公告' : '新增公告')} onClose={onClose} pending={pending}>
    <AppForm form={form} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between gap-3">
          <Label htmlFor="announcement-content">{t('公告内容')}</Label>
          <div className="flex items-center gap-3">
            <small className="text-2xs text-muted">{[...content].length} / 500</small>
            <NativeSelect aria-label={t('内容格式')} className="h-7 w-auto py-0 text-xs" disabled={pending} value={format}
              onChange={event => { setPreview(false); form.setValue('format', event.target.value as AnnouncementInput['format'], { shouldDirty: true }); }}>
              <option value="markdown">Markdown</option>
              <option value="html">HTML</option>
            </NativeSelect>
          </div>
        </div>
        {format === 'markdown'
          ? <Textarea id="announcement-content" required rows={6} maxLength={500} disabled={pending} value={content}
              placeholder={t('输入公告内容，支持 Markdown。')} onChange={event => { setPreview(false); form.setValue('content', event.target.value, { shouldDirty: true }); }} />
          : <RichTextEditor value={content} label={t('公告内容')} sourceLabel={t('公告内容源代码')} disabled={pending}
              onChange={value => { setPreview(false); form.setValue('content', value, { shouldDirty: true }); }} />}
        <small className="text-xs text-muted">{t('支持安全 Markdown 或 HTML；不允许脚本、图片或嵌入页面。')}</small>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Controller control={form.control} name="publish_at" render={({ field }) => (
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-ink">{t('发布时间')}</span>
            <Input type="datetime-local" required disabled={pending} value={localDate(field.value ?? Math.floor(Date.now() / 1000))}
              onChange={event => { if (event.target.value) { setPreview(false); field.onChange(Math.floor(new Date(event.target.value).getTime() / 1000)); } }} />
          </label>
        )} />
        <Controller control={form.control} name="type" render={({ field }) => (
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-ink">{t('公告类型')}</span>
            <NativeSelect disabled={pending} value={field.value ?? 'info'} onChange={event => { setPreview(false); field.onChange(event.target.value); }}>
              {Object.entries(announcementTypes).map(([id, label]) => <option key={id} value={id}>{t(label)}</option>)}
            </NativeSelect>
          </label>
        )} />
        <Controller control={form.control} name="status" render={({ field }) => (
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-ink">{t('发布状态')}</span>
            <NativeSelect disabled={pending} value={field.value ?? 'published'} onChange={event => { setPreview(false); field.onChange(event.target.value); }}>
              <option value="published">{t((values.publish_at ?? 0) > Date.now() / 1000 ? '定时发布' : '发布')}</option>
              <option value="draft">{t('草稿')}</option>
            </NativeSelect>
          </label>
        )} />
        <Controller control={form.control} name="note" render={({ field }) => (
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-ink">{t('内部备注')}</span>
            <Input maxLength={100} disabled={pending} placeholder={t('仅管理员可见，最多 100 字')} value={field.value ?? ''}
              onChange={event => { setPreview(false); field.onChange(event.target.value); }} />
          </label>
        )} />
      </div>
      {preview && render.data && <div className="announcement-preview max-h-44 overflow-auto rounded-lg border border-line bg-surface-alt p-3"><RichContent html={render.data.content_html} /></div>}
      <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3">
        <Button variant="secondary" disabled={pending || !content.trim()} onClick={() => render.mutate(current())}>
          <Eye size={14} />{t('预览')}
        </Button>
        <span className="flex-1" />
        <Button variant="secondary" disabled={pending} onClick={onClose}>{t('取消')}</Button>
        <Button type="submit" pending={form.formState.isSubmitting}>{pending ? t('处理中…') : t('保存')}</Button>
      </div>
    </AppForm>
  </Modal>;
}

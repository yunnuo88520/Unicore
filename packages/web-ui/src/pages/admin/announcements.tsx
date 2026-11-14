// Author: yunnuo <ymz@ebox.vip>
// Description: Announcement console on TanStack Table: visibility switch, batch deletion and modal editing with live preview.
import { useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createColumnHelper, createPaginatedRowModel, rowPaginationFeature, tableFeatures, useTable, type PaginationState, type TableOptions } from '@tanstack/react-table';
import { Controller, useWatch } from 'react-hook-form';
import { AppSelectField } from '@unicore/form/fields';
import { Eye, Megaphone, Pencil, Plus, Trash2 } from 'lucide-react';
import type { AnnouncementEntry, AnnouncementInput, AnnouncementQuery, AnnouncementSelection, WebClient } from '@unicore/sdk';
import { currentLocale, defineMessages, t, useI18n } from '../../i18n';
import { AppField, AppForm, useAppForm } from '@unicore/form';
import { Badge, Button, Card, CardContent, Checkbox, ConfirmDialog, Input, Label, Modal, SimpleSelect, PageHeader, Switch, Table, TableBody, TableCell, TableEmpty, TableHead, TableHeader, TableRow, Textarea, useMessage, selectOptions } from '@unicore/ui';
import { RichTextEditor } from '@unicore/ui/editor';
import { DataTable, DataTablePagination, DataTableToolbar } from '../../components/data-table';
import { RichContent } from '../../rich-content';
import { AnnouncementType, announcementTypes } from '../../announcement-center';
import type { PageProps } from '../../router';
import type { Bootstrap, OperationId } from '@unicore/sdk';
import { usePermissions } from '../../permissions';

const features = tableFeatures({ rowPaginationFeature, paginatedRowModel: createPaginatedRowModel() });
const helper = createColumnHelper<typeof features, AnnouncementEntry>();
const EMPTY_ITEMS: AnnouncementEntry[] = [];
const PAGE_SIZE = 10;
const statuses = defineMessages({ draft: '草稿', published: '已发布', scheduled: '定时发布', archived: '已归档', expired: '已过期' });
const notifyModes = defineMessages({ silent: '静默通知', popup: '弹窗提醒' });
const localDate = (seconds: number) => {
  const date = new Date(seconds * 1000);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};

type AnnouncementTableMeta = {
  allChecked: boolean;
 can:(operation:OperationId)=>boolean;
  isSelected: (id: string) => boolean;
  onSelectAll: (checked: boolean) => void;
  onToggle: (item: AnnouncementEntry, checked: boolean) => void;
  onEdit: (item: AnnouncementEntry) => void;
  onRemove: (item: AnnouncementEntry) => void;
 onReaders: (item:AnnouncementEntry)=>void;
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
    header: () => t('公告标题'),
    cell: info => <button type="button" className="block max-w-72 min-w-44 truncate text-start text-ink hover:text-accent hover:underline"
      disabled={!(info.table.options.meta as AnnouncementTableMeta).can('updateAnnouncement')} onClick={() => (info.table.options.meta as AnnouncementTableMeta).onEdit(info.row.original)}>
      {info.row.original.title}
    </button>,
  }),
  helper.display({ id: 'type', header: () => t('类型'), cell: info => <AnnouncementType type={info.row.original.type} /> }),
  helper.display({
    id: 'status',
    header: () => t('状态'),
    cell: info => {
      const item = info.row.original;
      const expired=item.status==='published' && item.ends_at>0 && item.ends_at<=Date.now()/1000;
 const scheduled = item.status === 'published' && item.publish_at > Date.now() / 1000;
      return <Badge dot={scheduled || item.status === 'published'} variant={scheduled || item.status === 'published' ? 'primary' : 'subtle'}>{t(statuses[expired ? 'expired' : scheduled ? 'scheduled' : item.status])}</Badge>;
    },
  }),
  helper.display({
    id: 'publish_at',
    header: () => t('发布时间'),
    cell: info => <time className="whitespace-nowrap text-muted">{new Date(info.row.original.publish_at * 1000).toLocaleString(currentLocale(), { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}<span className="mt-1 block text-2xs text-subtle">{info.row.original.ends_at ? `${t('结束时间')} · ${new Date(info.row.original.ends_at * 1000).toLocaleString(currentLocale())}` : t('无结束时间')}</span></time>,
  }),
  helper.display({id:'notify_mode',header:()=>t('通知方式'),cell:info=><Badge variant={info.row.original.notify_mode==='popup'?'warning':'subtle'}>{t(info.row.original.notify_mode==='popup'?'弹窗提醒':'静默通知')}</Badge>}),
 helper.display({id:'audience',header:()=>t('接收范围'),cell:info=><span className="whitespace-nowrap text-muted">{t(info.row.original.audience==='all'?'全部用户':'指定用户')}</span>}),
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
      return <div className="flex items-center justify-end gap-1.5">
        {meta.can('announcementReadStatus') && <Button variant="secondary" size="icon" aria-label={t('阅读情况')} onClick={() => meta.onReaders(item)}><Eye size={14} /></Button>}
        {meta.can('updateAnnouncement') && <Button variant="secondary" size="icon" aria-label={t('编辑公告')} onClick={() => meta.onEdit(item)}><Pencil size={14} /></Button>}
        {meta.can('deleteAnnouncements') && <Button variant="secondary" size="icon" aria-label={t('删除公告')} onClick={() => meta.onRemove(item)}><Trash2 size={14} /></Button>}
      </div>;
    },
  }),
]);

export function AdminAnnouncementsPage({ client, metadata }: PageProps) {
  if (!client.web) return null;
  return <AnnouncementPanel metadata={metadata} web={client.web} />;
}

function AnnouncementPanel({ web, metadata }: { web: WebClient; metadata: Bootstrap }) {
 const {can} = usePermissions(metadata);
  const { t } = useI18n();
  const message = useMessage();
  const cache = useQueryClient();
  const [switchValue, setSwitchValue] = useState<boolean | null>(null);
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState<AnnouncementQuery>({ search: '', status: '', page: 1, page_size: PAGE_SIZE });
  const [readers,setReaders]=useState<AnnouncementEntry|null>(null);
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
  const meta: AnnouncementTableMeta = { can,
    allChecked: all,
    isSelected: selected,
    onSelectAll: checked => setSelection(checked ? items.map(({ id, version }) => ({ id, version })) : []),
    onToggle: (item, checked) => setSelection(current => checked
      ? [...current, { id: item.id, version: item.version }]
      : current.filter(entry => entry.id !== item.id)),
    onEdit: item => setEditor(item),
 onReaders:item=>setReaders(item),
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
  return <div className="flex min-w-0 flex-col gap-6">
    <PageHeader title={t('平台公告')} description={t('集中管理通知、发布计划与内部备注。')}
      actions={can('createAnnouncement') && <Button onClick={() => setEditor('new')}><Plus size={16} />{t('新增公告')}</Button>} />
    <Card>
      <CardContent className="flex items-center gap-4">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-accent"><Megaphone size={22} aria-hidden="true" /></span>
        <div className="min-w-0">
          <h2 className="text-md font-semibold text-ink">{t('公告展示')}</h2>
          <p className="mt-0.5 text-xs text-muted">{t('开启后，用户可通过顶部铃铛查看公告，并接收弹窗提醒。')}</p>
        </div>
        <div className="ms-auto">
          <Switch id="announcements-enabled" checked={switchValue ?? list.data?.enabled ?? true} disabled={!can('saveAnnouncementSettings') || !list.data || toggle.isPending}
            onChange={value => { setSwitchValue(value); toggle.mutate(value); }} />
        </div>
      </CardContent>
    </Card>
    <Card>
      <CardContent className="flex flex-col gap-4">
        <DataTableToolbar
          summary={{ label: t('公告总数'), value: t('共 {{count}} 条', { count: list.data?.total ?? 0 }) }}
          search={{ label: t('搜索公告'), placeholder: t('搜索公告标题、内容或备注…'), value: search, maxLength: 128,
            onChange: value => setSearch(value), onSubmit: () => setFilter({ search }) }}
          actions={can('deleteAnnouncements') && <Button variant="secondary" disabled={!selection.length} onClick={() => setRemoving(selection)}>
            <Trash2 size={14} />{t('批量删除')}{selection.length > 0 && <span className="rounded-full bg-danger-soft px-1.5 text-2xs text-danger">{selection.length}</span>}
          </Button>}>
          <SimpleSelect aria-label={t('公告状态')} className="h-9 w-auto border-line bg-surface" value={query.status} disabled={list.isFetching}
            onChange={event => setFilter({ status: event as AnnouncementQuery['status'] })} options={selectOptions(<>
            <option value="">{t('全部状态')}</option>
            {Object.entries(statuses).map(([id, label]) => <option key={id} value={id}>{t(label)}</option>)}
          </>)} />
        </DataTableToolbar>
        <DataTable table={table} pending={list.isPending} busy={list.isFetching} error={list.error} onRetry={() => void list.refetch()}
          empty={{ icon: Megaphone, title: query.search || query.status ? t('没有匹配的公告') : t('暂无公告'), hint: t('新增公告，向用户传递平台消息。') }} />
        <DataTablePagination page={query.page} pageSize={query.page_size} total={list.data?.total ?? 0}
          onPageChange={page => { setQuery(current => ({ ...current, page })); setSelection([]); }} disabled={list.isFetching} />
      </CardContent>
    </Card>
    {readers && <AnnouncementReaders web={web} entry={readers} onClose={()=>setReaders(null)}/>}
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
      title: entry?.title ?? '',
 notify_mode:entry?.notify_mode ?? 'silent',ends_at:entry?.ends_at ?? 0,audience:entry?.audience ?? 'all',recipient_ids:entry?.recipient_ids ?? [],
 content: entry?.content ?? '',
      format: entry?.format ?? 'markdown',
      type: entry?.type ?? 'info',
      note: entry?.note ?? '',
      status: entry?.status ?? 'draft',
      publish_at: entry?.publish_at ?? Math.floor(Date.now() / 1000),
    },
    onSubmit: async values => {
      if (values.ends_at && values.ends_at <= values.publish_at) { form.setError('ends_at', { type: 'validate', message: t('结束时间必须晚于发布时间。') }); return; }
      if (values.audience === 'selected' && !values.recipient_ids.length) { form.setError('recipient_ids', { type: 'validate', message: t('请至少选择一位接收用户。') }); return; }
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
 <AppField name="title" label={t('公告标题')}><Input required maxLength={200} disabled={pending}/></AppField>
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between gap-3">
          <Label htmlFor="announcement-content">{t('公告内容')}</Label>
          <div className="flex items-center gap-3">
            <small className="text-2xs text-muted">{[...content].length} / 10000</small>
            <SimpleSelect aria-label={t('内容格式')} className="h-7 w-auto py-0 text-xs" disabled={pending} value={format}
              onChange={event => { setPreview(false); form.setValue('format', event as AnnouncementInput['format'], { shouldDirty: true }); }} options={selectOptions(<>
              <option value="markdown">Markdown</option>
              <option value="html">HTML</option>
            </>)} />
          </div>
        </div>
        {format === 'markdown'
          ? <Textarea id="announcement-content" required rows={6} maxLength={10000} disabled={pending} value={content}
              placeholder={t('输入公告内容，支持 Markdown。')} onChange={event => { setPreview(false); form.setValue('content', event.target.value, { shouldDirty: true }); }} />
          : <RichTextEditor value={content} label={t('公告内容')} sourceLabel={t('公告内容源代码')} disabled={pending}
              onChange={value => { setPreview(false); form.setValue('content', value, { shouldDirty: true }); }} />}
        <small className="text-xs text-muted">{t('支持安全 Markdown 或 HTML；不允许脚本、图片或嵌入页面。')}</small>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Controller control={form.control} name="publish_at" render={({ field }) => (
          <div className="flex flex-col gap-1.5">

            <Input label={t('发布时间')} type="datetime-local" required disabled={pending} value={localDate(field.value ?? Math.floor(Date.now() / 1000))}
              onChange={event => { if (event.target.value) { setPreview(false); field.onChange(Math.floor(new Date(event.target.value).getTime() / 1000)); } }} />
          </div>
        )} />
        <Controller control={form.control} name="ends_at" render={({field})=><div className="flex flex-col gap-1.5"><Input label={t('结束时间（可选）')} type="datetime-local" disabled={pending} value={field.value?localDate(field.value):''} min={localDate(values.publish_at ?? Math.floor(Date.now()/1000))} onChange={event=>field.onChange(event.target.value?Math.floor(new Date(event.target.value).getTime()/1000):0)}/></div>}/>
        <AppSelectField name="notify_mode" label={t('通知方式')} disabled={pending} options={[{ value: 'silent', label: notifyModes.silent }, { value: 'popup', label: notifyModes.popup }]} />
        <Controller control={form.control} name="type" render={({ field }) => (
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-ink">{t('公告类型')}</span>
            <SimpleSelect aria-label={t('公告类型')} disabled={pending} value={field.value ?? 'info'} onChange={event => { setPreview(false); field.onChange(event); }} options={selectOptions(<>
              {/* Offer the two editorial types only; success/warning stay renderable for legacy entries. */}
              <option value="info">{t(announcementTypes.info)}</option>
              <option value="error">{t(announcementTypes.error)}</option>
            </>)} />
          </label>
        )} />
        <Controller control={form.control} name="status" render={({ field }) => (
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-ink">{t('发布状态')}</span>
            <SimpleSelect aria-label={t('发布状态')} disabled={pending} value={field.value ?? 'draft'} onChange={event => { setPreview(false); field.onChange(event); }} options={selectOptions(<>
              <option value="published">{t((values.publish_at ?? 0) > Date.now() / 1000 ? '定时发布' : '发布')}</option>
              <option value="draft">{t('草稿')}</option>
 <option value="archived">{t('已归档')}</option>
            </>)} />
          </label>
        )} />
        <Controller control={form.control} name="note" render={({ field }) => (
          <div className="flex flex-col gap-1.5">

            <Input label={t('内部备注')} maxLength={100} disabled={pending} placeholder={t('仅管理员可见，最多 100 字')} value={field.value ?? ''}
              onChange={event => { setPreview(false); field.onChange(event.target.value); }} />
          </div>
        )} />
      </div>
      <Controller control={form.control} name="audience" render={({field})=><label className="flex flex-col gap-1.5"><span className="text-sm font-medium text-ink">{t('接收范围')}</span><SimpleSelect aria-label={t('接收范围')} value={field.value} disabled={pending} onChange={event=>{field.onChange(event);if(event==='all')form.setValue('recipient_ids',[]);}} options={selectOptions(<><option value="all">{t('全部用户')}</option><option value="selected">{t('指定用户')}</option></>)} /></label>}/>
      {values.audience==='selected' && <RecipientPicker web={web} selected={values.recipient_ids ?? []} disabled={pending} onChange={ids=>form.setValue('recipient_ids',ids,{shouldDirty:true})}/>}
      <p className="text-xs text-muted">{t('修改公告不会重置已读记录；需要重新提醒时，请新建公告。')}</p>
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

function RecipientPicker({ web, selected, disabled, onChange }: { web: WebClient; selected: string[]; disabled: boolean; onChange: (ids: string[]) => void }) {
  const { t } = useI18n();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const users = useQuery({ queryKey: ['announcement-recipient-options', search, page], queryFn: () => web.users(search, page), placeholderData: keepPreviousData });
  return <div className="rounded-lg border border-line p-3">
    <p className="mb-2 text-xs text-muted">{t('已选择 {{count}} 位用户（最多 500 位）', { count: selected.length })}</p>
    <Input aria-label={t('搜索接收用户')} placeholder={t('搜索')} value={search} maxLength={128} disabled={disabled} onChange={event => { setSearch(event.target.value); setPage(1); }} />
    {users.isError ? <div role="alert" className="mt-2"><span className="text-xs text-danger">{t(users.error.message)}</span><Button variant="link" onClick={() => void users.refetch()}>{t('重试')}</Button></div>
      : users.isPending ? <p role="status" className="py-3 text-xs text-muted">{t('加载中…')}</p>
      : <div className="my-2 flex max-h-40 flex-col gap-2 overflow-y-auto">{users.data.items.map(user => <label key={user.id} className="flex items-center gap-2 text-sm"><Checkbox checked={selected.includes(user.id)} disabled={disabled || (!selected.includes(user.id) && selected.length >= 500)} onChange={checked => onChange(checked ? [...selected, user.id] : selected.filter(id => id !== user.id))} /><span className="min-w-0 truncate">{user.username} · {user.email}</span></label>)}{!users.data.items.length && <p className="text-xs text-muted">{t('没有匹配的用户')}</p>}</div>}
    <div className="flex justify-end gap-2"><Button size="sm" variant="ghost" disabled={disabled || page === 1 || users.isFetching} onClick={() => setPage(value => value - 1)}>{t('上一页')}</Button><Button size="sm" variant="ghost" disabled={disabled || !users.data || page * users.data.page_size >= users.data.total || users.isFetching} onClick={() => setPage(value => value + 1)}>{t('下一页')}</Button><Button size="sm" variant="secondary" disabled={disabled || !selected.length} onClick={() => onChange([])}>{t('清空选择')}</Button></div>
  </div>;
}

function AnnouncementReaders({ web, entry, onClose }: { web: WebClient; entry: AnnouncementEntry; onClose: () => void }) {
  const { t } = useI18n();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const query = useQuery({ queryKey: ['announcement-read-status', entry.id, search, page], queryFn: () => web.announcementReadStatus(entry.id, page, 10, search), placeholderData: keepPreviousData });
  return <Modal title={t('阅读情况')} onClose={onClose}>
    <p className="mb-2 break-words text-sm font-semibold text-ink">{entry.title}</p>
    <p className="mb-3 text-xs text-muted">{t('接收范围按当前配置判断；已读时间记录首次打开或确认，不代表完整阅读。')}</p>
    <Input aria-label={t('搜索阅读用户')} placeholder={t('搜索')} maxLength={128} value={search} onChange={event => { setSearch(event.target.value); setPage(1); }} />
    {query.isError ? <div role="alert" className="mt-3"><span className="text-sm text-danger">{t(query.error.message)}</span><Button variant="link" onClick={() => void query.refetch()}>{t('重试')}</Button></div>
      : <div className="mt-3 overflow-x-auto"><Table><TableHeader><TableRow><TableHead>{t('账号')}</TableHead><TableHead>{t('接收范围')}</TableHead><TableHead>{t('首次已读时间')}</TableHead></TableRow></TableHeader><TableBody>
          {query.isPending ? <TableEmpty colSpan={3}>{t('加载中…')}</TableEmpty> : query.data.items.map(user => <TableRow key={user.id}><TableCell><span className="block">{user.username}</span><small className="text-muted">{user.email}</small></TableCell><TableCell>{t(user.eligible ? '符合条件' : '不符合条件')}</TableCell><TableCell><span className="whitespace-nowrap">{user.read_at ? new Date(user.read_at * 1000).toLocaleString(currentLocale()) : t('未读')}</span></TableCell></TableRow>)}
          {!query.isPending && !query.data?.items.length && <TableEmpty colSpan={3}>{t('没有匹配的用户')}</TableEmpty>}
        </TableBody></Table></div>}
    <div className="mt-3 flex items-center justify-end gap-2 text-xs text-muted"><span>{page} / {Math.max(1, Math.ceil((query.data?.total ?? 0) / 10))}</span><Button variant="secondary" size="sm" disabled={page === 1 || query.isFetching} onClick={() => setPage(value => value - 1)}>{t('上一页')}</Button><Button variant="secondary" size="sm" disabled={page * 10 >= (query.data?.total ?? 0) || query.isFetching} onClick={() => setPage(value => value + 1)}>{t('下一页')}</Button></div>
  </Modal>;
}

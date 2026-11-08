// Author: yunnuo <ymz@ebox.vip>
// Description: Notes workspace: card grid, modal editing, ownership attachments and pagination over AppClient.
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Circle, Download, NotebookPen, Paperclip, Pencil, Plus, Search, Trash2, X } from 'lucide-react';
import type { AppClient, NoteEntry, NoteQuery } from '@unicore/sdk';
import { currentLocale, t, useLocale } from '../../i18n';
import { hasPermissionPoint } from '../../permissions';
import { Badge, Button, Card, CardContent, Input, Modal, NativeSelect, Textarea, useMessage } from '@unicore/ui';
import { AppField, AppForm, useAppForm } from '@unicore/form';
import type { PageProps } from '../../router';

const initialQuery: NoteQuery = { search: '', status: '', sort: 'updated_at', direction: 'desc', page: 1 };

export function NotesPage({ client, metadata }: PageProps) {
  useLocale();
  const api = client.notes!;
  // The page stays gated by notes:access for the create entry; row edit/delete
  // follow the server-projected per-row capabilities, so readable rows from a
  // shared scope stay read-only while own rows with the action grant keep buttons.
  const canCreate = hasPermissionPoint(metadata, 'notes:create');
  const cache = useQueryClient();
  const message = useMessage();
  const [query, setQuery] = useState<NoteQuery>(initialQuery);
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<NoteEntry | 'new' | null>(null);
  const [removing, setRemoving] = useState<NoteEntry | null>(null);
  const list = useQuery({ queryKey: ['notes', query], queryFn: () => api.listNotes(query) });
  const refresh = () => void cache.invalidateQueries({ queryKey: ['notes'] });
  const remove = useMutation({
    mutationFn: (note: NoteEntry) => api.deleteNote(note.id, note.version),
    onSuccess: () => { message.success(t('笔记已删除')); setRemoving(null); refresh(); },
  });
  const download = useMutation({
    mutationFn: async (id: string) => {
      const access = await client.files!.fileAccess(id);
      const a = document.createElement('a');
      a.href = access.url; a.rel = 'noreferrer'; a.download = '';
      document.body.append(a); a.click(); a.remove();
    },
  });
  return <section className="flex flex-col gap-4" aria-label={t('个人笔记')}>
    <Card>
      <CardContent className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-accent"><NotebookPen size={19} aria-hidden="true" /></span>
          <div>
            <h2 className="text-md font-semibold text-ink">{t('个人笔记')}</h2>
            <p className="text-xs text-muted">{t('把想法写下来，按自己的节奏推进。')}</p>
          </div>
        </div>
        {canCreate && <Button onClick={() => setEditing('new')}><Plus size={16} />{t('新建笔记')}</Button>}
      </CardContent>
    </Card>
    <Card>
      <CardContent>
        <form className="flex flex-wrap items-center gap-2" onSubmit={event => { event.preventDefault(); setQuery(q => ({ ...q, search, page: 1 })); }}>
          <div className="relative min-w-0 flex-1 sm:max-w-64">
            <Search size={15} className="pointer-events-none absolute start-2.5 top-1/2 -translate-y-1/2 text-subtle" aria-hidden="true" />
            <Input aria-label={t('搜索笔记')} placeholder={t('搜索笔记标题')} maxLength={128} value={search} onChange={event => setSearch(event.target.value)} className="ps-8" />
          </div>
          <Button type="submit" variant="secondary">{t('搜索')}</Button>
          <NativeSelect aria-label={t('笔记状态')} value={query.status} onChange={event => setQuery(q => ({ ...q, status: event.target.value as NoteQuery['status'], page: 1 }))} className="w-28">
            <option value="">{t('全部状态')}</option>
            <option value="open">{t('进行中')}</option>
            <option value="done">{t('已完成')}</option>
          </NativeSelect>
          <NativeSelect aria-label={t('笔记排序')} value={query.sort} onChange={event => setQuery(q => ({ ...q, sort: event.target.value as NoteQuery['sort'], page: 1 }))} className="w-28">
            <option value="updated_at">{t('最近更新')}</option>
            <option value="title">{t('按标题')}</option>
          </NativeSelect>
          <Button type="button" variant="secondary" onClick={() => setQuery(q => ({ ...q, direction: q.direction === 'desc' ? 'asc' : 'desc', page: 1 }))}>
            {query.direction === 'desc' ? t('降序') : t('升序')}
          </Button>
        </form>
      </CardContent>
    </Card>
    {list.isPending
      ? <Card><CardContent className="py-10 text-center text-sm text-muted" role="status">{t('正在读取笔记…')}</CardContent></Card>
      : list.isError
        ? <Card><CardContent className="flex flex-col items-center gap-2 py-10 text-center" role="alert">
            <p className="text-sm text-muted">{t(list.error.message)}</p>
            <Button variant="secondary" onClick={() => void list.refetch()}>{t('重试')}</Button>
          </CardContent></Card>
        : !list.data.items.length
          ? <Card><CardContent className="flex flex-col items-center gap-1.5 py-12 text-center">
              <NotebookPen size={36} className="text-subtle" aria-hidden="true" />
              <strong className="text-md font-semibold text-ink">{query.search || query.status ? t('没有符合条件的笔记') : t('让第一条想法落在这里')}</strong>
              <p className="text-sm text-muted">{t('新建一条笔记，记录值得跟进的事。')}</p>
            </CardContent></Card>
          : <>
              <div className="grid items-start gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {list.data.items.map(note => <article key={note.id} className="flex flex-col gap-2 rounded-xl border border-line bg-surface p-4 shadow-card">
                  <div className="flex items-start justify-between gap-2">
                    <Badge variant={note.status === 'done' ? 'success' : 'subtle'} className="gap-1">
                      {note.status === 'done' ? <CheckCircle2 size={13} aria-hidden="true" /> : <Circle size={13} aria-hidden="true" />}
                      {note.status === 'done' ? t('已完成') : t('进行中')}
                    </Badge>
                    <div className="flex items-center gap-1">
                      {note.capabilities.update && <Button variant="ghost" size="icon" aria-label={t('编辑 {{v0}}', { v0: note.title })} onClick={() => setEditing(note)}><Pencil size={16} /></Button>}
                      {note.capabilities.delete && <Button variant="ghost" size="icon" aria-label={t('删除 {{v0}}', { v0: note.title })} onClick={() => setRemoving(note)}><Trash2 size={16} /></Button>}
                    </div>
                  </div>
                  <h3 className="text-md font-semibold text-ink">{note.title}</h3>
                  <p className="whitespace-pre-wrap text-sm text-muted">{note.body || t('还没有正文，随时补充你的想法。')}</p>
                  {note.attachment_ids.length > 0 && client.files && <div className="flex flex-wrap gap-1.5">
                    {note.attachment_ids.map((id, index) => <Button key={id} variant="link" size="sm" className="h-auto px-0" disabled={download.isPending} onClick={() => download.mutate(id)}>
                      <Paperclip size={13} />{t('附件 {{count}}', { count: index + 1 })}<Download size={12} />
                    </Button>)}
                  </div>}
                  <small className="mt-auto text-2xs text-subtle">{t('更新于 {{date}}', { date: new Date(note.updated_at * 1000).toLocaleString(currentLocale()) })}</small>
                </article>)}
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <small className="text-xs text-muted">{t('共 {{total}} 条笔记 · 第 {{page}} 页', { total: list.data.total, page: query.page })}</small>
                <div className="flex items-center gap-2">
                  <Button variant="secondary" size="sm" disabled={query.page === 1} onClick={() => setQuery(q => ({ ...q, page: q.page - 1 }))}>{t('上一页')}</Button>
                  <Button variant="secondary" size="sm" disabled={query.page * list.data.page_size >= list.data.total} onClick={() => setQuery(q => ({ ...q, page: q.page + 1 }))}>{t('下一页')}</Button>
                </div>
              </div>
            </>}
    {editing && <NoteEditor key={editing === 'new' ? 'new' : editing.id} client={client} metadata={metadata} note={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); refresh(); }} />}
    {removing && <Modal title={t('删除笔记')} onClose={() => setRemoving(null)} pending={remove.isPending}>
      <p className="text-sm text-ink">{t('确定删除“{{name}}”？此操作不可撤销，附件原文件会保留。', { name: removing.title })}</p>
      <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
        <Button variant="secondary" disabled={remove.isPending} onClick={() => setRemoving(null)}>{t('取消')}</Button>
        <Button pending={remove.isPending} onClick={() => remove.mutate(removing)}>{t('确认删除')}</Button>
      </div>
    </Modal>}
  </section>;
}

type NoteValues = { title: string; body: string; status: 'open' | 'done'; attachment_ids: string[]; version?: number };

function NoteEditor({ client, metadata, note, onClose, onSaved }: {
  client: AppClient; metadata: PageProps['metadata']; note?: NoteEntry; onClose: () => void; onSaved: () => void;
}) {
  useLocale();
  const message = useMessage();
  const [fileSearch, setFileSearch] = useState('');
  const save = useMutation({
    mutationFn: (values: NoteValues) => note ? client.notes!.updateNote(note.id, { ...values, version: values.version ?? note.version }) : client.notes!.createNote(values),
    onSuccess: () => { message.success(note ? t('笔记已保存') : t('笔记已创建')); onSaved(); },
  });
  const form = useAppForm<NoteValues>({
    schema: note ? 'NoteUpdate' : 'NoteInput',
    defaultValues: { title: note?.title ?? '', body: note?.body ?? '', status: note?.status ?? 'open', attachment_ids: note?.attachment_ids ?? [], ...(note ? { version: note.version } : {}) },
    onSubmit: values => save.mutate(values, { onError: error => form.applyServerError(error) }),
  });
  const files = useQuery({
    queryKey: ['note-files', fileSearch],
    queryFn: () => client.files!.listFiles(fileSearch, 1),
    enabled: metadata.profile === 'web-platform' && !!client.files,
  });
  const mine = files.data?.items.filter(f => f.state === 'ready' && f.creator_id === metadata.current_user?.id && f.creator_realm === metadata.identity_realm) ?? [];
  const value = form.watch();
  function setAttachments(next: string[]) { form.setValue('attachment_ids', next, { shouldDirty: true }); }
  return <Modal title={note ? t('编辑笔记') : t('新建笔记')} pending={save.isPending} onClose={onClose}>
    <AppForm form={form} className="note-form flex flex-col gap-3">
      {note && <input type="hidden" {...form.register('version')} />}
      <AppField name="title" label={t('标题')}>
        <Input required maxLength={120} placeholder={t('给这条笔记一个名字')} />
      </AppField>
      <AppField name="body" label={t('正文')}>
        <Textarea name="body" maxLength={5000} rows={6} placeholder={t('写下细节、计划或下一步…')} />
      </AppField>
      <AppField name="status" label={t('状态')}>
        <NativeSelect className="w-40">
          <option value="open">{t('进行中')}</option>
          <option value="done">{t('已完成')}</option>
        </NativeSelect>
      </AppField>
      {metadata.profile === 'web-platform' && client.files && <fieldset className="flex flex-col gap-2 rounded-lg border border-line p-3">
        <legend className="flex items-center gap-1.5 px-1 text-sm font-medium text-ink"><Paperclip size={14} aria-hidden="true" />{t('附件')}</legend>
        <p className="text-xs text-muted">{t('先在“我的文件”上传，再选择本人文件。最多 5 个。')}</p>
        <Input aria-label={t('搜索可选附件')} placeholder={t('搜索本人文件')} maxLength={128} value={fileSearch} onChange={event => setFileSearch(event.target.value)} />
        <NativeSelect aria-label={t('添加已有附件')} disabled={value.attachment_ids.length >= 5} value="" onChange={event => { if (event.target.value) setAttachments([...value.attachment_ids, event.target.value]); }}>
          <option value="">{t('选择本人文件')}</option>
          {mine.filter(f => !value.attachment_ids.includes(f.file_id)).map(f => <option key={f.file_id} value={f.file_id}>{f.original_name}</option>)}
        </NativeSelect>
        {files.isError && <p role="alert" className="text-xs text-danger">{t(files.error.message)}</p>}
        {value.attachment_ids.map((id, index) => <div key={id} className="flex items-center gap-2 rounded-md bg-surface-alt px-2.5 py-1.5">
          <Paperclip size={14} className="shrink-0 text-muted" aria-hidden="true" />
          <span className="min-w-0 truncate text-sm text-ink">{mine.find(f => f.file_id === id)?.original_name ?? t('已选附件 {{v0}}', { v0: index + 1 })}</span>
          <Button variant="ghost" size="icon" className="ms-auto size-7" aria-label={t('移除附件 {{v0}}', { v0: index + 1 })} onClick={() => setAttachments(value.attachment_ids.filter(f => f !== id))}><X size={15} /></Button>
        </div>)}
      </fieldset>}
      <div className="mt-1 flex flex-wrap items-center justify-end gap-2">
        <Button variant="secondary" disabled={save.isPending} onClick={onClose}>{t('取消')}</Button>
        <Button type="submit" pending={save.isPending}>{save.isPending ? t('保存中…') : t('保存笔记')}</Button>
      </div>
    </AppForm>
  </Modal>;
}

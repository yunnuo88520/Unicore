// Author: yunnuo <ymz@ebox.vip>
// Description: Dictionary console: selectable type list with create/rename/delete plus a full item replacement editor.
import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BookMarked, Pencil, Plus, RotateCcw, Save, Trash2 } from 'lucide-react';
import type { DictionaryCreateInput, DictionaryItemEntry, DictionaryList, DictionarySummary, DictionaryUpdateInput, WebClient } from '@unicore/sdk';
import { t, useLocale } from '../../i18n';
import { AppField, AppForm, useAppForm } from '@unicore/form';
import { cn } from '@unicore/ui/cn';
import { Badge, Button, Card, CardContent, ConfirmDialog, Input, Modal, NativeSelect, Table, TableBody, TableCell, TableEmpty, TableHead, TableHeader, TableRow, useMessage } from '@unicore/ui';
import type { PageProps } from '../../router';

const EMPTY_TYPES: DictionarySummary[] = [];
const ITEM_COLUMN_COUNT = 6;

export function AdminDictionariesPage({ client }: PageProps) {
  if (!client.web) return null;
  return <DictionaryPanel web={client.web} />;
}

function DictionaryPanel({ web }: { web: WebClient }) {
  useLocale();
  const message = useMessage();
  const cache = useQueryClient();
  const [selected, setSelected] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [renaming, setRenaming] = useState<{ id: string; code: string; name: string; description: string } | null>(null);
  const [removing, setRemoving] = useState<DictionarySummary | null>(null);
  const list = useQuery<DictionaryList>({ queryKey: ['dictionaries'], queryFn: () => web.dictionaries() });
  const types = list.data?.items ?? EMPTY_TYPES;
  const activeId = selected && types.some(type => type.id === selected) ? selected : types[0]?.id ?? null;
  const detail = useQuery({ queryKey: ['dictionary', activeId], queryFn: () => web.dictionary(activeId!), enabled: !!activeId });
  const invalidate = () => {
    void cache.invalidateQueries({ queryKey: ['dictionaries'] });
    void cache.invalidateQueries({ queryKey: ['dictionary', activeId] });
  };
  const remove = useMutation({
    mutationFn: (type: DictionarySummary) => web.deleteDictionary(type.id),
    onSuccess: (_data, type) => {
      message.success(t('字典类型已删除'));
      setRemoving(null);
      if (selected === type.id) setSelected(null);
      void cache.invalidateQueries({ queryKey: ['dictionaries'] });
    },
    onError: error => message.error(t(error.message)),
  });
  // grid-cols-1 keeps the mobile track at minmax(0,1fr): without it the implicit
  // auto track grows to the entry table's min-content width and stretches the page.
  return <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[300px_minmax(0,1fr)]">
    <Card>
      <CardContent className="flex flex-col gap-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h2 className="text-md font-semibold text-ink">{t('字典类型')}</h2>
            <p className="mt-0.5 text-xs text-muted">{t('按类型维护业务枚举值')}</p>
          </div>
          <Button size="sm" onClick={() => setCreating(true)}><Plus size={14} />{t('新建')}</Button>
        </div>
        {list.isPending && <p role="status" className="py-4 text-center text-xs text-muted">{t('正在加载字典类型…')}</p>}
        {list.isError && <div role="alert" className="flex flex-col items-start gap-2 rounded-md border border-danger-line bg-danger-soft px-3 py-2 text-xs text-danger">
          <span>{t(list.error.message)}</span>
          <Button variant="secondary" size="sm" onClick={() => void list.refetch()}><RotateCcw size={13} />{t('重试')}</Button>
        </div>}
        {list.data && <div className="flex flex-col gap-1.5">
          {types.map(type => <button key={type.id} type="button" aria-pressed={type.id === activeId} onClick={() => setSelected(type.id)}
            className={cn('flex min-w-0 items-center justify-between gap-2 rounded-lg border px-3 py-2 text-start text-sm outline-none focus-visible:ring-2 focus-visible:ring-focus',
              type.id === activeId ? 'border-accent bg-primary-soft text-accent' : 'border-line bg-surface text-ink hover:bg-surface-alt')}>
            <span className="min-w-0">
              <span className="block truncate font-medium">{t(type.name)}</span>
              <small className={cn('block truncate text-2xs', type.id === activeId ? 'text-accent/80' : 'text-subtle')}>{type.code}</small>
            </span>
            <Badge variant="subtle">{t('{{count}} 项', { count: type.item_count })}</Badge>
          </button>)}
          {!types.length && !list.isPending && <p className="py-4 text-center text-xs text-muted">{t('暂无字典类型，先新建一个。')}</p>}
        </div>}
      </CardContent>
    </Card>
    <Card>
      <CardContent className="flex flex-col gap-4">
        {!activeId ? <div className="flex flex-col items-center gap-2 py-10 text-center">
          <BookMarked size={24} className="text-subtle" aria-hidden="true" />
          <strong className="text-sm text-ink">{t('尚未选择字典类型')}</strong>
          <span className="text-xs text-muted">{t('从左侧选择一个类型，或新建字典类型后维护其条目。')}</span>
        </div>
        : detail.isPending ? <p role="status" className="py-10 text-center text-sm text-muted">{t('正在读取字典…')}</p>
        : detail.isError ? <div role="alert" className="flex flex-col items-center gap-2 py-10 text-center">
            <p className="text-sm text-danger">{t(detail.error.message)}</p>
            <Button variant="secondary" onClick={() => void detail.refetch()}>{t('重试')}</Button>
          </div>
        : detail.data && <>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="text-md font-semibold text-ink">{t(detail.data.name)}</h2>
                <p className="mt-0.5 text-xs text-muted">{detail.data.code}{detail.data.description ? ` · ${detail.data.description}` : ''}</p>
              </div>
              <div className="flex gap-2">
                <Button variant="secondary" size="sm" onClick={() => setRenaming({ id: detail.data.id, code: detail.data.code, name: detail.data.name, description: detail.data.description })}>
                  <Pencil size={13} />{t('编辑类型')}
                </Button>
                <Button variant="secondary" size="sm" onClick={() => setRemoving(types.find(type => type.id === activeId) ?? null)}>
                  <Trash2 size={13} />{t('删除类型')}
                </Button>
              </div>
            </div>
            <ItemsEditor key={activeId} web={web} id={activeId} items={detail.data.items} onSaved={invalidate} />
          </>}
      </CardContent>
    </Card>
    {creating && <DictionaryCreateDialog web={web} onClose={() => setCreating(false)}
      onCreated={id => { setSelected(id); void cache.invalidateQueries({ queryKey: ['dictionaries'] }); }} />}
    {renaming && <DictionaryRenameDialog web={web} entry={renaming} onClose={() => setRenaming(null)} onSaved={invalidate} />}
    {removing && <ConfirmDialog danger title={t('删除字典类型')} description={t('确定删除「{{name}}」？该类型下的 {{count}} 个字典项将一并删除。', { name: removing.name, count: removing.item_count })}
      confirmLabel={t('确认删除')} cancelLabel={t('取消')} pending={remove.isPending}
      onConfirm={() => remove.mutate(removing)} onCancel={() => setRemoving(null)} />}
  </div>;
}

function ItemsEditor({ web, id, items, onSaved }: { web: WebClient; id: string; items: DictionaryItemEntry[]; onSaved: () => void }) {
  useLocale();
  const message = useMessage();
  const cache = useQueryClient();
  const [draft, setDraft] = useState<DictionaryItemEntry[]>(() => items.map(row => ({ ...row })));
  // A refetch (after save or external change) replaces the draft wholesale; edits in between are dropped.
  useEffect(() => { setDraft(items.map(row => ({ ...row }))); }, [items]);
  const dirty = JSON.stringify(draft) !== JSON.stringify(items);
  const update = (index: number, patch: Partial<DictionaryItemEntry>) => setDraft(current => current.map((row, i) => i === index ? { ...row, ...patch } : row));
  const addRow = () => setDraft(current => [...current, { id: '', value: '', label: '', remark: '', sort: current.length + 1, status: 'active' }]);
  const removeRow = (index: number) => setDraft(current => current.filter((_row, i) => i !== index));
  const save = useMutation({
    mutationFn: (entries: DictionaryItemEntry[]) => web.replaceDictionaryItems(id, { items: entries }),
    onSuccess: () => {
      message.success(t('字典项已保存'));
      onSaved();
    },
    onError: error => message.error(t(error.message)),
  });
  const submit = () => {
    if (draft.some(row => !row.value.trim())) { message.error(t('存在未填写「值」的字典项，请补全后再保存。')); return; }
    save.mutate(draft);
  };
  const pending = save.isPending;
  return <div className="flex flex-col gap-3">
    <div className="min-w-0 rounded-lg border border-line" aria-busy={pending}>
      <Table className="min-w-[640px]">
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead>{t('值')}</TableHead>
            <TableHead>{t('显示名')}</TableHead>
            <TableHead>{t('备注')}</TableHead>
            <TableHead>{t('排序')}</TableHead>
            <TableHead>{t('状态')}</TableHead>
            <TableHead>{t('操作')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {draft.map((row, index) => <TableRow key={row.id || `new-${index}`}>
            <TableCell><Input className="h-8 min-w-24" maxLength={64} autoComplete="off" aria-label={t('字典值')} disabled={pending}
              value={row.value} onChange={event => update(index, { value: event.target.value })} /></TableCell>
            <TableCell><Input className="h-8 min-w-24" maxLength={80} autoComplete="off" aria-label={t('显示名')} disabled={pending}
              placeholder={t('默认同值')} value={row.label} onChange={event => update(index, { label: event.target.value })} /></TableCell>
            <TableCell><Input className="h-8 min-w-24" maxLength={200} autoComplete="off" aria-label={t('备注')} disabled={pending}
              value={row.remark} onChange={event => update(index, { remark: event.target.value })} /></TableCell>
            <TableCell><Input className="h-8 w-16" type="number" aria-label={t('排序')} disabled={pending}
              value={row.sort} onChange={event => update(index, { sort: Number(event.target.value) || 0 })} /></TableCell>
            <TableCell><NativeSelect className="h-8 w-24" aria-label={t('状态')} disabled={pending}
              value={row.status} onChange={event => update(index, { status: event.target.value })}>
              <option value="active">{t('启用')}</option>
              <option value="disabled">{t('停用')}</option>
            </NativeSelect></TableCell>
            <TableCell><Button variant="ghost" size="icon" className="size-7" disabled={pending} aria-label={t('移除该字典项')}
              onClick={() => removeRow(index)}><Trash2 size={13} /></Button></TableCell>
          </TableRow>)}
          {!draft.length && <TableEmpty colSpan={ITEM_COLUMN_COUNT}>
            <span className="flex flex-col items-center gap-1.5 py-2">
              <strong className="text-sm text-ink">{t('暂无字典项')}</strong>
              <span className="text-xs text-muted">{t('添加字典项后，保存时全量提交。')}</span>
            </span>
          </TableEmpty>}
        </TableBody>
      </Table>
    </div>
    <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted">
      <span>{t('保存时全量替换该类型的所有字典项；新增行与修改一并提交。')}</span>
      <div className="flex gap-2">
        <Button variant="secondary" size="sm" disabled={pending} onClick={addRow}><Plus size={13} />{t('添加字典项')}</Button>
        <Button size="sm" pending={pending} disabled={!dirty} onClick={submit}><Save size={13} />{t('保存字典项')}</Button>
      </div>
    </div>
  </div>;
}

function DictionaryCreateDialog({ web, onClose, onCreated }: { web: WebClient; onClose: () => void; onCreated: (id: string) => void }) {
  useLocale();
  const message = useMessage();
  const form = useAppForm<DictionaryCreateInput>({
    schema: 'DictionaryCreateInput',
    defaultValues: { code: '', name: '', description: '' },
    onSubmit: async values => {
      try {
        const created = await web.createDictionary(values);
        message.success(t('字典类型已创建'));
        onCreated(created.id);
        onClose();
      } catch (error) {
        form.applyServerError(error);
      }
    },
  });
  return <Modal title={t('新建字典类型')} onClose={onClose} pending={form.formState.isSubmitting}>
    <AppForm form={form} className="flex flex-col gap-3">
      <AppField name="code" label={t('类型编码')} hint={t('小写字母开头，仅含小写字母、数字与下划线；创建后不可修改。')}>
        <Input required minLength={2} maxLength={64} autoComplete="off" placeholder="order_status" />
      </AppField>
      <AppField name="name" label={t('名称')}><Input required maxLength={80} autoComplete="off" /></AppField>
      <AppField name="description" label={t('描述（可选）')}><Input maxLength={200} autoComplete="off" /></AppField>
      <div className="flex justify-end gap-2">
        <Button variant="secondary" disabled={form.formState.isSubmitting} onClick={onClose}>{t('取消')}</Button>
        <Button type="submit" pending={form.formState.isSubmitting}>{form.formState.isSubmitting ? t('正在创建…') : t('创建')}</Button>
      </div>
    </AppForm>
  </Modal>;
}

function DictionaryRenameDialog({ web, entry, onClose, onSaved }: {
  web: WebClient; entry: { id: string; code: string; name: string; description: string }; onClose: () => void; onSaved: () => void;
}) {
  useLocale();
  const message = useMessage();
  const form = useAppForm<DictionaryUpdateInput>({
    schema: 'DictionaryUpdateInput',
    defaultValues: { name: entry.name, description: entry.description },
    onSubmit: async values => {
      try {
        await web.updateDictionary(entry.id, values);
        message.success(t('字典类型已更新'));
        onSaved();
        onClose();
      } catch (error) {
        form.applyServerError(error);
      }
    },
  });
  return <Modal title={t('编辑字典类型')} onClose={onClose} pending={form.formState.isSubmitting}>
    <AppForm form={form} className="flex flex-col gap-3">
      <p className="rounded-md bg-surface-alt px-3 py-2 text-xs text-muted">{t('类型编码 {{code}} 创建后不可修改。', { code: entry.code })}</p>
      <AppField name="name" label={t('名称')}><Input required maxLength={80} autoComplete="off" /></AppField>
      <AppField name="description" label={t('描述（可选）')}><Input maxLength={200} autoComplete="off" /></AppField>
      <div className="flex justify-end gap-2">
        <Button variant="secondary" disabled={form.formState.isSubmitting} onClick={onClose}>{t('取消')}</Button>
        <Button type="submit" pending={form.formState.isSubmitting}>{form.formState.isSubmitting ? t('保存中…') : t('保存')}</Button>
      </div>
    </AppForm>
  </Modal>;
}

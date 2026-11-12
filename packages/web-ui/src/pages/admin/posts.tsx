// Author: yunnuo <ymz@ebox.vip>
// Description: Independent post directory; membership is separate from role authorization.
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AppError } from '@unicore/sdk';
import type { Post, PostSaveInput, WebClient } from '@unicore/sdk';
import { AppControllerField, AppField, AppForm, useAppForm } from '@unicore/form';
import { Button, Card, CardContent, ConfirmDialog, Input, Modal, Switch, Table, TableBody, TableCell, TableEmpty, TableHead, TableHeader, TableRow, Textarea, useMessage } from '@unicore/ui';
import { DataTableEmpty } from '../../components/data-table';
import { t, useLocale } from '../../i18n';
import { invalidateAfter, usePostsQuery } from '../../queries';
import { usePermissions } from '../../permissions';
import type { PageProps } from '../../router';

export function AdminPostsPage({ client, metadata }: PageProps) {
  useLocale();
  const web = client.web!;
  const cache = useQueryClient();
  const message = useMessage();
  const { can } = usePermissions(metadata);

  const list = usePostsQuery(web);
  const [editor, setEditor] = useState<Post | 'new' | null>(null);
  const [removing, setRemoving] = useState<Post | null>(null);
  const [members, setMembers] = useState<Post | null>(null);
  const remove = useMutation({
    mutationFn: (post: Post) => web.deletePost(post.id),
    onSuccess: () => { setRemoving(null); message.success(t('岗位已删除')); void invalidateAfter(cache, 'posts'); },
    // The confirm dialog stays open so the guarded result is visible in context.
    onError: error => message.error(t(error.message)),
  });
  return <Card><CardContent className="flex min-w-0 flex-col gap-4">
    <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="font-semibold">{t('岗位管理')}</h2>{can('createPost') && <Button onClick={() => setEditor('new')}>{t('新建岗位')}</Button>}</div>
    <p className="text-sm text-muted">{t('岗位用于组织成员，不会隐式授予角色或权限。')}</p>
    {list.isError && <div role="alert">{t(list.error.message)} <Button variant="secondary" onClick={() => void list.refetch()}>{t('重试')}</Button></div>}
    <div className="min-w-0 overflow-x-auto rounded-lg border border-line"><Table className="min-w-[680px]"><TableHeader><TableRow>
      <TableHead>{t('编码')}</TableHead><TableHead>{t('名称')}</TableHead><TableHead>{t('排序')}</TableHead><TableHead>{t('状态')}</TableHead><TableHead>{t('说明')}</TableHead><TableHead>{t('操作')}</TableHead>
    </TableRow></TableHeader><TableBody>
      {(list.data?.items ?? []).map(post => <TableRow key={post.id}><TableCell>{post.code}</TableCell><TableCell>{post.name}</TableCell><TableCell>{post.sort}</TableCell><TableCell>{post.enabled ? t('已启用') : t('已禁用')}</TableCell><TableCell className="max-w-64 break-words">{post.description || '—'}</TableCell><TableCell><div className="flex gap-2">
        {can('listUsers') && <Button variant="link" onClick={() => setMembers(post)}>{t('成员')}</Button>}{can('updatePost') && <Button variant="link" aria-label={t('编辑岗位 {{name}}', { name: post.name })} onClick={() => setEditor(post)}>{t('编辑')}</Button>}{can('deletePost') && <Button variant="link" aria-label={t('删除岗位 {{name}}', { name: post.name })} onClick={() => setRemoving(post)}>{t('删除')}</Button>}
      </div></TableCell></TableRow>)}
      {!list.data?.items.length && <TableEmpty colSpan={6}>{list.isPending ? t('正在加载…') : <DataTableEmpty title={t('暂无岗位')} hint={t('岗位用于组织成员，不会隐式授予角色或权限。')} />}</TableEmpty>}
    </TableBody></Table></div>
  </CardContent>
    {editor && <PostEditor web={web} post={editor === 'new' ? undefined : editor} onClose={() => setEditor(null)} onSaved={() => { setEditor(null); void invalidateAfter(cache, 'posts'); }} />}
    {removing && <ConfirmDialog danger title={t('删除岗位')} description={t('确定删除岗位「{{name}}」？已关联用户的岗位不可删除。', { name: removing.name })} confirmLabel={t('确认删除')} cancelLabel={t('取消')} pending={remove.isPending} onConfirm={() => remove.mutate(removing)} onCancel={() => setRemoving(null)} />}
    {members && <PostMembers web={web} post={members} onClose={() => setMembers(null)} />}
  </Card>;
}

function PostEditor({ web, post, onClose, onSaved }: { web: WebClient; post?: Post; onClose: () => void; onSaved: () => void }) {
  useLocale();
  const message = useMessage();
  // The toast lives on the mutation's own onError so the global cache yields
  // to it; guarded saves (409 POST_CONFLICT / POST_IN_USE and server-side
  // guards alike) carry no field targets, so applyServerError surfaces them
  // through the AppForm summary banner inside this dialog.
  const save = useMutation({
    mutationFn: (input: PostSaveInput) => post ? web.updatePost(post.id, input) : web.createPost(input),
    onSuccess: () => { message.success(t('岗位已保存')); onSaved(); },
    onError: error => { if (error instanceof AppError && error.code !== 'SESSION_CHANGED') message.error(t(error.message)); },
  });
  const form = useAppForm<PostSaveInput>({ schema: 'PostSaveInput', defaultValues: { code: post?.code ?? '', name: post?.name ?? '', sort: post?.sort ?? 0, enabled: post?.enabled ?? true, description: post?.description ?? '' }, onSubmit: async values => {
    try {
      await save.mutateAsync({ ...values, code: values.code.trim().toLowerCase(), name: values.name.trim() });
    } catch (error) {
      form.applyServerError(error);
    }
  } });
  return <Modal title={t(post ? '编辑岗位' : '新建岗位')} pending={save.isPending} onClose={onClose}><AppForm form={form} className="flex flex-col gap-3">
    <AppField name="code" label={t('岗位编码')} onFieldChange={event => form.setValue('code', event.target.value.trim().toLowerCase())}><Input autoComplete="off" maxLength={64} /></AppField>
    <AppField name="name" label={t('岗位名称')}><Input maxLength={80} /></AppField>
    <AppField name="sort" label={t('排序')} rules={{ valueAsNumber: true }}><Input type="number" step="1" /></AppField>
    <AppControllerField name="enabled" label={t('状态')}>{field => <Switch aria-label={t('启用岗位')} checked={!!field.value} onChange={field.onChange} />}</AppControllerField>
    <AppField name="description" label={t('说明')}><Textarea maxLength={1000} /></AppField>
    <div className="flex justify-end gap-2"><Button variant="secondary" disabled={save.isPending} onClick={onClose}>{t('取消')}</Button><Button type="submit" pending={save.isPending}>{t('保存')}</Button></div>
  </AppForm></Modal>;
}

function PostMembers({ web, post, onClose }: { web: WebClient; post: Post; onClose: () => void }) {
  useLocale();
  const [page, setPage] = useState(1);
  const list = useQuery({ queryKey: ['users', 'post-members', post.id, page], queryFn: () => web.users('', page, post.id) });
  return <Modal title={t('岗位成员：{{name}}', { name: post.name })} onClose={onClose}>
    {list.isError ? <div role="alert">{t(list.error.message)} <Button onClick={() => void list.refetch()}>{t('重试')}</Button></div> : <ul className="flex flex-col gap-2">{list.data?.items.map(user => <li key={user.id}>{user.username} · {user.email}</li>)}{!list.data?.items.length && <li>{list.isPending ? t('正在加载…') : t('暂无成员')}</li>}</ul>}
    <div className="mt-4 flex justify-between gap-2"><Button variant="secondary" disabled={page <= 1 || list.isFetching} onClick={() => setPage(value => value - 1)}>{t('上一页')}</Button><Button variant="secondary" disabled={!list.data || page * list.data.page_size >= list.data.total || list.isFetching} onClick={() => setPage(value => value + 1)}>{t('下一页')}</Button></div>
  </Modal>;
}

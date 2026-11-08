// Author: yunnuo <ymz@ebox.vip>
// Description: Department tree console: create, rename, reorder and delete nodes with hierarchy guides and guarded deletion.
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, ChevronDown, ChevronRight, Network, Pencil, Plus, RotateCcw, Trash2 } from 'lucide-react';
import { AppError } from '@unicore/sdk';
import type { Bootstrap, Department, DepartmentSaveInput, WebClient } from '@unicore/sdk';
import { t, useLocale } from '../../i18n';
import { buildDepartmentTree, departmentSiblings, flattenDepartmentTree, invalidateAfter, useDepartmentsQuery, type DepartmentNode } from '../../queries';
import { usePermissions } from '../../permissions';
import { Button, Card, CardContent, ConfirmDialog, Input, Modal, NativeSelect, useMessage } from '@unicore/ui';
import type { PageProps } from '../../router';

export function AdminDepartmentsPage({ client, metadata }: PageProps) {
  if (!client.web) return null;
  return <DepartmentPanel web={client.web} metadata={metadata} />;
}

type MoveInput = { id: string; input: DepartmentSaveInput };

function DepartmentPanel({ web, metadata }: { web: WebClient; metadata: Bootstrap }) {
  useLocale();
  const message = useMessage();
  const cache = useQueryClient();
  const { has } = usePermissions(metadata);
  const canWrite = has('departments:write');
  const list = useDepartmentsQuery(web);
  const tree = buildDepartmentTree(list.data?.items ?? []);
  // Nodes expand by default; the set only tracks manually collapsed branches.
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState<Department | 'root' | null>(null);
  const [renaming, setRenaming] = useState<Department | null>(null);
  const [removing, setRemoving] = useState<Department | null>(null);
  const refresh = () => void invalidateAfter(cache, 'departments');
  const report = (error: unknown) => message.error(t(error instanceof Error ? error.message : String(error)));
  const create = useMutation({
    mutationFn: ({ name, parent }: { name: string; parent?: Department }) =>
      web.createDepartment({ name, ...(parent ? { parent_id: parent.id } : {}) }),
    onSuccess: () => { message.success(t('部门已创建')); setCreating(null); refresh(); },
    onError: report,
  });
  const rename = useMutation({
    // Updates re-send the chosen parent and current sort so partial inputs never reset them.
    mutationFn: ({ department, name, parentId }: { department: Department; name: string; parentId?: string }) =>
      web.updateDepartment(department.id, { name, parent_id: parentId, sort: department.sort }),
    onSuccess: () => { message.success(t('部门已重命名')); setRenaming(null); refresh(); },
    onError: report,
  });
  const remove = useMutation({
    mutationFn: (department: Department) => web.deleteDepartment(department.id),
    onSuccess: (_data, department) => {
      message.success(t('部门已删除'));
      setRemoving(null);
      setSelectedId(current => (current === department.id ? null : current));
      refresh();
    },
    onError: error => {
      if (error instanceof AppError && error.code === 'DEPARTMENT_IN_USE') message.error(t('部门下仍有子部门或挂靠用户'));
      else report(error);
    },
  });
  // Reordering renumbers the whole sibling row so arbitrary stored sorts converge
  // on the displayed order regardless of the values the backend kept before.
  const move = useMutation({
    mutationFn: (updates: MoveInput[]) => Promise.all(updates.map(({ id, input }) => web.updateDepartment(id, input))),
    onSuccess: () => { message.success(t('排序已更新')); refresh(); },
    onError: report,
  });
  const moveNode = (node: DepartmentNode, direction: -1 | 1) => {
    const siblings = [...departmentSiblings(tree, node.id)];
    const index = siblings.findIndex(item => item.id === node.id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= siblings.length) return;
    [siblings[index], siblings[target]] = [siblings[target], siblings[index]];
    move.mutate(siblings.map((item, sort) => ({ id: item.id, input: { name: item.name, parent_id: item.parent_id, sort } })));
  };
  const toggle = (id: string, expanded: boolean) => setCollapsed(current => {
    // `expanded` mirrors the row's current state: collapsing adds the id to the
    // set, expanding removes it; the set stays empty while everything is open.
    const next = new Set(current);
    if (expanded) next.add(id); else next.delete(id);
    return next;
  });

  const renderNodes = (nodes: readonly DepartmentNode[]) => <ul className="flex min-w-0 flex-col">
    {nodes.map(node => {
      const expanded = !collapsed.has(node.id);
      const selected = selectedId === node.id;
      const siblings = departmentSiblings(tree, node.id);
      const index = siblings.findIndex(item => item.id === node.id);
      return <li key={node.id} className="min-w-0">
        <div className={`flex items-center gap-1 rounded-md px-1.5 py-1 ${selected ? 'bg-primary-soft' : 'hover:bg-surface-alt'}`}>
          {node.children.length
            ? <Button variant="ghost" size="icon" className="size-5 shrink-0" aria-label={expanded ? t('收起 {{name}}', { name: node.name }) : t('展开 {{name}}', { name: node.name })}
                aria-expanded={expanded} onClick={() => toggle(node.id, expanded)}>
                {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              </Button>
            : <span aria-hidden="true" className="size-5 shrink-0" />}
          <button type="button" className="min-w-0 flex-1 truncate text-start text-sm text-ink" aria-current={selected || undefined}
            onClick={() => setSelectedId(node.id)}>{node.name}</button>
          {canWrite && <span className="flex shrink-0 items-center gap-0.5">
            <Button variant="ghost" size="icon" className="size-7" aria-label={t('在 {{name}} 下新建子部门', { name: node.name })}
              disabled={move.isPending || create.isPending} onClick={() => setCreating(node)}><Plus size={13} /></Button>
            <Button variant="ghost" size="icon" className="size-7" aria-label={t('重命名 {{name}}', { name: node.name })}
              disabled={move.isPending || rename.isPending} onClick={() => setRenaming(node)}><Pencil size={13} /></Button>
            <Button variant="ghost" size="icon" className="size-7" aria-label={t('上移 {{name}}', { name: node.name })}
              disabled={move.isPending || index <= 0} onClick={() => moveNode(node, -1)}><ArrowUp size={13} /></Button>
            <Button variant="ghost" size="icon" className="size-7" aria-label={t('下移 {{name}}', { name: node.name })}
              disabled={move.isPending || index < 0 || index >= siblings.length - 1} onClick={() => moveNode(node, 1)}><ArrowDown size={13} /></Button>
            <Button variant="ghost" size="icon" className="size-7 text-danger" aria-label={t('删除 {{name}}', { name: node.name })}
              disabled={remove.isPending} onClick={() => setRemoving(node)}><Trash2 size={13} /></Button>
          </span>}
        </div>
        {expanded && !!node.children.length && <div className="ms-4 border-s border-line ps-1">{renderNodes(node.children)}</div>}
      </li>;
    })}
  </ul>;

  return <Card>
    <CardContent className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-md font-semibold text-ink">{t('部门管理')}</h2>
          <p className="mt-0.5 text-xs text-muted">{t('维护部门层级，为角色的数据范围提供组织依据。')}</p>
        </div>
        {canWrite && <Button onClick={() => setCreating('root')}><Plus size={15} />{t('新建根部门')}</Button>}
      </div>
      {list.isError && <div role="alert" className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-danger-line bg-danger-soft px-3 py-2 text-sm text-danger">
        <span>{t(list.error.message)}</span>
        <Button variant="secondary" size="sm" onClick={() => void list.refetch()}><RotateCcw size={13} />{t('重试')}</Button>
      </div>}
      <div className="rounded-lg border border-line p-2" aria-busy={list.isFetching}>
        {list.isPending
          ? <p className="py-8 text-center text-sm text-muted" role="status">{t('正在加载部门…')}</p>
          : tree.length
            ? renderNodes(tree)
            : <span className="flex flex-col items-center gap-1.5 py-8">
                <Network size={24} className="text-subtle" aria-hidden="true" />
                <strong className="text-sm text-ink">{t('还没有部门')}</strong>
                <span className="text-xs text-muted">{t('新建第一个部门，让笔记与文件按组织范围可见。')}</span>
                {canWrite && <Button size="sm" variant="secondary" className="mt-1" onClick={() => setCreating('root')}><Plus size={14} />{t('新建根部门')}</Button>}
              </span>}
      </div>
      <p className="text-xs leading-relaxed text-muted">{t('部门挂靠用户或包含子部门时不可删除；删除前请先迁移子部门并调整用户归属。')}</p>
    </CardContent>
    {creating && <DepartmentNameDialog
      title={creating === 'root' ? t('新建根部门') : t('新建子部门')}
      description={creating === 'root' ? t('顶级部门，不挂在任何部门之下。') : t('上级部门：{{name}}', { name: creating.name })}
      pending={create.isPending} submitLabel={t('创建')}
      onSubmit={name => create.mutate({ name, parent: creating === 'root' ? undefined : creating })}
      onClose={() => setCreating(null)} />}
    {renaming && <RenameDialog
      department={renaming} items={list.data?.items ?? []} pending={rename.isPending}
      onSubmit={({ name, parentId }) => rename.mutate({ department: renaming, name, parentId })}
      onClose={() => setRenaming(null)} />}
    {removing && <ConfirmDialog danger title={t('删除部门')}
      description={t('确定删除部门「{{name}}」？删除后不可恢复。', { name: removing.name })}
      confirmLabel={t('确认删除')} cancelLabel={t('取消')} pending={remove.isPending}
      onConfirm={() => remove.mutate(removing)} onCancel={() => setRemoving(null)} />}
  </Card>;
}

/** Rename plus parent move in one dialog; self and descendants are excluded so
 *  a cycle can never be produced from this UI, and the server re-checks anyway. */
function RenameDialog({ department, items, pending, onSubmit, onClose }: {
  department: Department; items: readonly Department[]; pending: boolean;
  onSubmit: (input: { name: string; parentId?: string }) => void; onClose: () => void;
}) {
  useLocale();
  const [name, setName] = useState(department.name);
  const [parentId, setParentId] = useState(department.parent_id ?? '');
  const [error, setError] = useState('');
  const blocked = new Set<string>([department.id]);
  const stack = [department.id];
  while (stack.length) {
    const current = stack.pop()!;
    for (const item of items) if (item.parent_id === current && !blocked.has(item.id)) { blocked.add(item.id); stack.push(item.id); }
  }
  const options = flattenDepartmentTree(buildDepartmentTree([...items]))
    .filter(({ department: item }) => !blocked.has(item.id))
    .map(({ department: item, depth }) => ({ id: item.id, label: `${'\u3000'.repeat(depth)}${item.name}` }));
  const submit = () => {
    const trimmed = name.trim();
    if (!trimmed) { setError(t('请输入部门名称')); return; }
    if (trimmed.length > 64) { setError(t('最多 {{count}} 个字符', { count: 64 })); return; }
    setError('');
    // An empty select means root; the empty string maps to no parent at all.
    onSubmit({ name: trimmed, parentId: parentId || undefined });
  };
  return <Modal title={t('重命名部门')} onClose={onClose} pending={pending}>
    <form className="flex flex-col gap-3" onSubmit={event => { event.preventDefault(); submit(); }}>
      <p className="text-xs text-muted">{t('调整「{{name}}」的名称与上级部门；同层排序保持不变。', { name: department.name })}</p>
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-ink">{t('部门名称')}</span>
        <Input required maxLength={64} autoComplete="off" value={name} aria-invalid={!!error}
          placeholder={t('例如 研发部')} autoFocus
          onChange={event => { setName(event.target.value); setError(''); }} />
        {error && <p role="alert" className="text-xs text-danger">{error}</p>}
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-ink">{t('上级部门')}</span>
        <NativeSelect aria-label={t('上级部门')} value={parentId} onChange={event => setParentId(event.target.value)}>
          <option value="">{t('作为根部门')}</option>
          {options.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}
        </NativeSelect>
        <small className="text-xs text-muted">{t('不能选择本部门或其下级部门作为上级；调整后沿用原排序。')}</small>
      </label>
      <div className="flex justify-end gap-2">
        <Button variant="secondary" disabled={pending} onClick={onClose}>{t('取消')}</Button>
        <Button type="submit" pending={pending}>{t('保存')}</Button>
      </div>
    </form>
  </Modal>;
}

function DepartmentNameDialog({ title, description, initialName = '', submitLabel, pending, onSubmit, onClose }: {
  title: string; description: string; initialName?: string; submitLabel: string; pending: boolean;
  onSubmit: (name: string) => void; onClose: () => void;
}) {
  useLocale();
  const [name, setName] = useState(initialName);
  const [error, setError] = useState('');
  const submit = () => {
    const trimmed = name.trim();
    if (!trimmed) { setError(t('请输入部门名称')); return; }
    if (trimmed.length > 64) { setError(t('最多 {{count}} 个字符', { count: 64 })); return; }
    setError('');
    onSubmit(trimmed);
  };
  return <Modal title={title} onClose={onClose} pending={pending}>
    <form className="flex flex-col gap-3" onSubmit={event => { event.preventDefault(); submit(); }}>
      <p className="text-xs text-muted">{description}</p>
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-ink">{t('部门名称')}</span>
        <Input required maxLength={64} autoComplete="off" value={name} aria-invalid={!!error}
          placeholder={t('例如 研发部')} autoFocus
          onChange={event => { setName(event.target.value); setError(''); }} />
        {error && <p role="alert" className="text-xs text-danger">{error}</p>}
      </label>
      <div className="flex justify-end gap-2">
        <Button variant="secondary" disabled={pending} onClick={onClose}>{t('取消')}</Button>
        <Button type="submit" pending={pending}>{submitLabel}</Button>
      </div>
    </form>
  </Modal>;
}

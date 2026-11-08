// Author: yunnuo <ymz@ebox.vip>
// Description: Navigation editor over the persisted section/node tree: both surfaces, directory/page/link/action rows, badges and role assignment; one save submits the whole tree with a version CAS.
import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowDown, ArrowUp, ChevronRight, EllipsisVertical, FolderPlus, Link2, ListTree, Lock,
  MousePointerClick, Pencil, Plus, RotateCcw, Save, SquarePen, Trash2, UserRound, type LucideIcon,
} from 'lucide-react';
import {
  Button, Card, CardContent, Checkbox, ConfirmDialog, DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuTrigger, Input, Modal, SimpleSelect, Switch, Table, TableBody, TableCell, TableHead, TableHeader, TableRow, useMessage,
} from '@unicore/ui';
import { AppError, type APIOperation, type AppClient, type Bootstrap, type MenuList, type MenuSaveInput, type NavigationNode, type NavigationSection, type Role, type WebClient } from '@unicore/sdk';
import { buildMenuTree, defaultNavigation, directoryTitle, isRegisteredPage, newNavigationNode, sectionTitle, validNavigationUrl, type MenuTreeNode } from '../../navigation';
import { NavigationIconPicker, resolveNavigationIcon } from '../../navigation-icons';
import { isAdministrator, routes } from '../../routes';
import { defineMessages, t, useLocale } from '../../i18n';
import { usePermissions } from '../../permissions';
import type { PageProps } from '../../router';

const MAX_DEPTH = 5;
const MAX_NODES = 256;
const SURFACES = defineMessages({ user: '用户端', administrator: '管理端' });
const TYPE_LABELS = defineMessages({ directory: '目录', page: '页面', link: '链接', action: '按钮' });
const TYPE_ICONS: Record<NavigationNode['type'], LucideIcon> = { directory: ListTree, page: SquarePen, link: Link2, action: MousePointerClick };
const BADGE_COLORS = defineMessages({ primary: '主色', success: '成功', warning: '警告', danger: '危险', muted: '中性' });

type Draft = { version: number; sections: NavigationSection[]; nodes: NavigationNode[] };
type RoleMenus = Record<string, string[]>;

const nodeIndex = (nodes: NavigationNode[]): Map<string, NavigationNode> => new Map(nodes.map(node => [node.id, node]));
// The editor shows the same display names as the workspace: operator labels
// first, then the registered route label or the seeded directory fallback.
// The editor shows the same display names as the workspace: operator labels
// first, then the registered route label or the seeded directory fallback.
const displayName = (node: NavigationNode): string => node.label.trim() || (isRegisteredPage(node.route_id) ? t(routes[node.route_id].label) : node.type === 'directory' ? t(directoryTitle(node.id)) : node.id);
function depthOf(nodes: NavigationNode[], id: string): number {
  let depth = 1; let current = nodeIndex(nodes).get(id); const seen = new Set([id]);
  while (current?.parent_id && !seen.has(current.parent_id)) { seen.add(current.parent_id); current = nodeIndex(nodes).get(current.parent_id); depth++; }
  return current ? depth : 1;
}
function heightOf(nodes: NavigationNode[], id: string): number {
  let height = 1;
  for (const child of nodes) if (child.parent_id === id) height = Math.max(height, 1 + heightOf(nodes, child.id));
  return height;
}
function isDescendant(nodes: NavigationNode[], id: string, ancestor: string): boolean {
  let current = nodeIndex(nodes).get(id); const seen = new Set([id]);
  while (current?.parent_id && !seen.has(current.parent_id)) { if (current.parent_id === ancestor) return true; seen.add(current.parent_id); current = nodeIndex(nodes).get(current.parent_id); }
  return false;
}
function randomId(nodes: NavigationNode[], prefix: string): string {
  const taken = new Set(nodes.map(node => node.id));
  for (;;) {
    const bytes = crypto.getRandomValues(new Uint8Array(6));
    const id = `${prefix}:${Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('')}`;
    if (!taken.has(id)) return id;
  }
}
// Dangling parents fall back to their section top; children follow the section of their parent row.
function normalize(nodes: NavigationNode[], sections: NavigationSection[]): NavigationNode[] {
  const ids = new Set(nodes.map(node => node.id));
  const sectionIds = new Set(sections.map(section => section.id));
  return nodes.map(node => ({
    ...node,
    section_id: sectionIds.has(node.section_id) ? node.section_id : sections[0]?.id ?? node.section_id,
    parent_id: node.parent_id && node.parent_id !== node.id && ids.has(node.parent_id) ? node.parent_id : undefined,
  }));
}
function renumber(draft: Draft, surface: NavigationSection['surface']): NavigationNode[] {
  const tree = buildMenuTree({ sections: draft.sections.filter(section => section.surface === surface), nodes: draft.nodes.filter(node => draft.sections.find(section => section.id === node.section_id)?.surface === surface) });
  const sorts = new Map<string, number>();
  const walk = (list: MenuTreeNode[]) => list.forEach((item, index) => { sorts.set(item.node.id, (index + 1) * 10); walk(item.children); });
  tree.forEach(({ children }) => walk(children));
  return draft.nodes.map(node => sorts.has(node.id) ? { ...node, sort: sorts.get(node.id)! } : node);
}
function shiftNode(draft: Draft, surface: NavigationSection['surface'], key: string, direction: -1 | 1): Draft {
  const tree = buildMenuTree({ sections: draft.sections.filter(section => section.surface === surface), nodes: draft.nodes.filter(node => draft.sections.find(section => section.id === node.section_id)?.surface === surface) });
  const flat = tree.flatMap(({ children }) => {
    const walk = (list: MenuTreeNode[]): MenuTreeNode[] => list.flatMap(item => [item, ...walk(item.children)]);
    return walk(children);
  });
  const position = flat.findIndex(item => item.node.id === key);
  if (position < 0) return draft;
  const siblings = (list: MenuTreeNode[], id: string): MenuTreeNode[] => {
    for (const item of list) { if (item.node.id === id) return list; const found = siblings(item.children, id); if (found.length) return found; }
    return [];
  };
  const list = siblings(flat, key);
  const index = list.findIndex(item => item.node.id === key);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= list.length) return draft;
  const order = list.map(item => item.node.id);
  [order[index], order[target]] = [order[target], order[index]];
  const sorts = new Map(order.map((id, slot) => [id, (slot + 1) * 10]));
  return { ...draft, nodes: draft.nodes.map(node => sorts.has(node.id) ? { ...node, sort: sorts.get(node.id)! } : node) };
}
function removeNode(draft: Draft, key: string): Draft {
  const node = nodeIndex(draft.nodes).get(key);
  if (!node) return draft;
  return { ...draft, nodes: draft.nodes.filter(item => item.id !== key).map(item => item.parent_id === key ? { ...item, parent_id: undefined } : item) };
}
function loadDraft(data: MenuList): Draft {
  const sections = [...data.sections];
  const nodes = [...data.nodes];
  if (!sections.length && !nodes.length) {
    for (const surface of ['user', 'administrator'] as const) {
      const fallback = defaultNavigation(surface);
      sections.push(...fallback.sections);
      nodes.push(...fallback.nodes);
    }
  }
  return { version: data.version, sections, nodes: normalize(nodes, sections) };
}

export function AdminMenusPage({ client, metadata }: PageProps) {
  if (!client.web) return null;
  return <MenuPanel web={client.web} metadata={metadata} />;
}

type NodeDialogState =
  | { mode: 'create'; type: NavigationNode['type']; sectionId: string; parentId?: string }
  | { mode: 'edit'; key: string };

function MenuPanel({ web, metadata }: { web: WebClient; metadata: Bootstrap }) {
  useLocale();
  const message = useMessage();
  const cache = useQueryClient();
  const { has } = usePermissions(metadata);
  // Role assignment is a roles-management capability: super administrator plus roles:write, never menus:write alone.
  const canManageRoles = isAdministrator(metadata) && has('roles:write');
  const [surface, setSurface] = useState<NavigationSection['surface']>(metadata.identity_realm === 'administrator' ? 'administrator' : 'user');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [nodeDialog, setNodeDialog] = useState<NodeDialogState | null>(null);
  const [moveDialog, setMoveDialog] = useState<string | null>(null);
  const [deleteNode, setDeleteNode] = useState<string | null>(null);
  const [deleteSection, setDeleteSection] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [roleMenus, setRoleMenus] = useState<RoleMenus>({});

  const config = useQuery<MenuList>({ queryKey: ['menu-config'], queryFn: () => web.menuConfig() });
  const roles = useQuery<RoleListRealm>({ queryKey: ['roles'], queryFn: () => web.roles() });
  const operations = useQuery({ queryKey: ['api-operations'], queryFn: () => web.apiOperations() });
  const baseline = useMemo(() => (config.data ? loadDraft(config.data) : null), [config.data]);
  useEffect(() => { if (config.data && !draft) setDraft(loadDraft(config.data)); }, [config.data, draft]);
  const dirty = !!draft && !!baseline && (JSON.stringify([draft.sections, draft.nodes]) !== JSON.stringify([baseline.sections, baseline.nodes]) || Object.keys(roleMenus).length > 0);
  const pending = !draft;

  const invalidate = () => {
    void cache.invalidateQueries({ queryKey: ['menu-config'] });
    // Navigation derives from bootstrap.navigation; refresh both realms' shells.
    void cache.invalidateQueries({ queryKey: ['bootstrap'] });
  };
  const save = useMutation({
    mutationFn: (input: MenuSaveInput) => web.saveMenuConfig(input),
    onSuccess: data => {
      message.success(t('菜单配置已保存'));
      // Adopt the server's table (new version) so the editor never resubmits a stale CAS.
      setDraft(loadDraft(data));
      invalidate();
    },
    onError: error => {
      // A menu save only ever conflicts on the version CAS. The catalogue routes
      // that through ENTITY_CONFLICT ("记录已被修改，请刷新后重试"); answer with the
      // explainer instead of the raw catalogue message and pull the fresh table
      // so a retry targets the new version.
      const conflict = error instanceof AppError && ['ENTITY_CONFLICT', 'ACCOUNT_EXISTS'].includes(error.code);
      message.error(conflict ? t('记录已被修改，请刷新后重试') : t(error.message));
      if (conflict) void cache.invalidateQueries({ queryKey: ['menu-config'] });
    },
  });

  if (!draft) return <Card><CardContent className="flex min-w-0 flex-col gap-4">
    {config.isError && <LoadError onRetry={() => void config.refetch()} error={config.error} />}
    {config.isPending && <p role="status" className="py-6 text-center text-sm text-muted">{t('正在读取菜单配置…')}</p>}
  </CardContent></Card>;

  const surfaceSections = draft.sections.filter(section => section.surface === surface).sort((a, b) => a.sort - b.sort || a.id.localeCompare(b.id));
  const surfaceNodes = draft.nodes.filter(node => surfaceSections.some(section => section.id === node.section_id));
  const tree = buildMenuTree({ sections: surfaceSections, nodes: surfaceNodes });
  const realmRoles = (roles.data?.items ?? []).filter(role => role.id !== 'super_admin');

  const patchSection = (id: string, patch: Partial<NavigationSection>) =>
    setDraft(current => current && { ...current, sections: current.sections.map(section => section.id === id ? { ...section, ...patch } : section) });
  const patchNode = (id: string, patch: Partial<NavigationNode>) =>
    setDraft(current => current && { ...current, nodes: current.nodes.map(node => node.id === id ? { ...node, ...patch } : node) });
  // Drag & drop reorders within one sibling list; cross-parent moves stay on
  // the explicit move dialog so a drop never silently re-parents a node.
  const reorderNode = (sourceId: string, targetId: string, before: boolean) => setDraft(current => {
    if (!current || sourceId === targetId) return current;
    const index = nodeIndex(current.nodes);
    const source = index.get(sourceId); const target = index.get(targetId);
    if (!source || !target) return current;
    if (source.section_id !== target.section_id || (source.parent_id ?? '') !== (target.parent_id ?? '')) return current;
    const tree = buildMenuTree({ sections: current.sections.filter(section => section.surface === surface), nodes: current.nodes.filter(node => current.sections.find(section => section.id === node.section_id)?.surface === surface) });
    const flat = tree.flatMap(({ children }) => { const walk = (list: MenuTreeNode[]): MenuTreeNode[] => list.flatMap(item => [item, ...walk(item.children)]); return walk(children); });
    const siblings = (list: MenuTreeNode[], id: string): MenuTreeNode[] => {
      for (const item of list) { if (item.node.id === id) return list; const found = siblings(item.children, id); if (found.length) return found; }
      return [];
    };
    const ids = siblings(flat, sourceId).map(item => item.node.id).filter(id => id !== sourceId);
    const at = ids.indexOf(targetId);
    if (at < 0) return current;
    ids.splice(before ? at : at + 1, 0, sourceId);
    const sorts = new Map(ids.map((id, slot) => [id, (slot + 1) * 10]));
    return { ...current, nodes: current.nodes.map(node => sorts.has(node.id) ? { ...node, sort: sorts.get(node.id)! } : node) };
  });
  const addNode = (type: NavigationNode['type'], sectionId: string, parentId?: string) => setNodeDialog({ mode: 'create', type, sectionId, parentId });
  const saveSection = (sectionId: string) => setDraft(current => current && { ...current, sections: current.sections.filter(section => section.id !== sectionId) });
  const submitNode = (node: NavigationNode, isNew: boolean) => setDraft(current => {
    if (!current) return current;
    if (!isNew) return { ...current, nodes: current.nodes.map(item => item.id === node.id ? node : item) };
    return { ...current, nodes: [...current.nodes, node] };
  });
  const submitMove = (key: string, sectionId: string, parentId?: string) => {
    setMoveDialog(null);
    setDraft(current => {
      if (!current) return current;
      const next: Draft = { ...current, nodes: current.nodes.map(node => node.id === key ? { ...node, section_id: sectionId, parent_id: parentId } : node) };
      return { ...next, nodes: renumber({ ...next, nodes: normalize(next.nodes, next.sections) }, surface) };
    });
  };
  const confirmDeleteNode = (key: string) => { setDraft(current => current && { ...current, nodes: renumber(removeNode(current, key), surface) }); setDeleteNode(null); };
  const confirmDeleteSection = (sectionId: string) => { saveSection(sectionId); setDeleteSection(null); };
  const submitReset = () => {
    if (!draft) return;
    // reset is both-surface: the server restores the registered defaults for the
    // user and administrator surfaces together, not only the visible tab.
    save.mutate({ version: draft.version, sections: [], nodes: [], reset: true });
    setConfirmReset(false);
  };
  const saveTree = () => {
    if (!draft) return;
    const assignments = canManageRoles ? Object.entries(roleMenus)
      .filter(([roleId, menuIds]) => { const role = roles.data?.items.find(item => item.id === roleId); return role && JSON.stringify([...menuIds].sort()) !== JSON.stringify([...role.menu_ids].sort()); })
      .map(([roleId, menuIds]) => ({ role_id: roleId, menu_ids: menuIds, action_ids: roles.data?.items.find(item => item.id === roleId)?.action_ids ?? [] }))
    : undefined;
    save.mutate({ version: draft.version, sections: draft.sections, nodes: draft.nodes, ...(assignments?.length ? { role_assignments: assignments } : {}) });
  };

  return <Card><CardContent className="flex min-w-0 flex-col gap-4">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 className="text-md font-semibold text-ink">{t('菜单配置')}</h2>
        <p className="mt-0.5 text-xs text-muted">{surface === 'user'
          ? t('调整普通用户的产品导航：分组、顺序、名称、图标与可见性；角色可见性在角色权限编辑器中配置。')
          : t('维护管理控制台结构：受限管理员只看到被授权的页面；角色可见性在角色权限编辑器中配置。')}</p>
      </div>
      <div role="tablist" aria-label={t('配置区域')} className="flex gap-1 rounded-lg border border-line bg-surface-alt p-1">
        {(['user', 'administrator'] as const).map(key => <button key={key} role="tab" aria-selected={surface === key}
          className={`rounded-md px-3 py-1 text-sm font-medium ${surface === key ? 'bg-surface text-ink shadow-tint' : 'text-muted hover:text-ink'}`}
          onClick={() => setSurface(key)}>{t(SURFACES[key])}</button>)}
      </div>
    </div>
    {config.isFetching && <p role="status" className="text-2xs text-subtle">{t('正在刷新菜单配置…')}</p>}
    <div className="flex flex-col gap-4">
      {tree.map(({ section, children }) => <SectionEditor key={section.id} section={section} nodes={children} draft={draft} surface={surface}
        dirtyFlag={dirty}
        onPatch={patchSection} onAddNode={addNode} onEditNode={key => setNodeDialog({ mode: 'edit', key })}
        onMoveNode={key => setMoveDialog(key)} onShiftNode={(key, direction) => setDraft(current => current && shiftNode(current, surface, key, direction))}
        onReorderNode={reorderNode}
        onVisibleNode={(key, visible) => patchNode(key, { visible })}
        onDeleteNode={key => setDeleteNode(key)} onDeleteSection={id => setDeleteSection(id)} />)}
    </div>
    <div className="flex flex-wrap items-center justify-between gap-3">
      <Button variant="secondary" size="sm" disabled={pending} onClick={() => {
        const id = randomId(draft?.nodes ?? [], 'section');
        setDraft(current => current && { ...current, sections: [...current.sections, { id, surface, name: '', sort: (current.sections.filter(item => item.surface === surface).length + 1) * 10, visible: true, show_title: true }] });
      }}><Plus size={14} />{t('添加区域')}</Button>
      <div className="flex flex-wrap items-center gap-2">
        {dirty && <span role="status" className="text-2xs font-medium text-warning">{t('有未保存的更改')}</span>}
        <Button variant="secondary" pending={save.isPending} disabled={pending} onClick={() => setConfirmReset(true)}><RotateCcw size={14} />{t('恢复默认')}</Button>
        <Button pending={save.isPending} disabled={pending} onClick={saveTree}><Save size={14} />{t('保存菜单配置')}</Button>
      </div>
    </div>
    {nodeDialog && <NodeDialog state={nodeDialog} draft={draft} surface={surface} pages={config.data?.pages ?? []}
      permissions={(roles.data?.permissions ?? []).map(permission => permission.id)}
      operations={operations.data?.items ?? []} onClose={() => setNodeDialog(null)} onSubmit={submitNode} />}
    {moveDialog && <MoveDialog draft={draft} surface={surface} node={nodeIndex(draft.nodes).get(moveDialog)!} onClose={() => setMoveDialog(null)} onConfirm={submitMove} />}
    {deleteNode && <ConfirmDialog title={t('删除菜单节点')} danger confirmLabel={t('删除')} cancelLabel={t('取消')}
      description={t('该节点将从导航移除，其子节点回到所在区域顶层；保存菜单配置后生效。')}
      onConfirm={() => confirmDeleteNode(deleteNode)} onCancel={() => setDeleteNode(null)} />}
    {deleteSection && <ConfirmDialog title={t('删除区域')} danger confirmLabel={t('删除')} cancelLabel={t('取消')}
      description={t('仅可删除空区域；请先移除或移动区域内的节点。')}
      onConfirm={() => confirmDeleteSection(deleteSection)} onCancel={() => setDeleteSection(null)} />}
    {confirmReset && <ConfirmDialog title={t('恢复默认菜单配置')} danger confirmLabel={t('恢复默认')} cancelLabel={t('取消')}
      pending={save.isPending}
      description={t('将清空用户端与管理端的全部自定义区域与节点，立即恢复两端的注册默认树。')}
      onConfirm={submitReset} onCancel={() => setConfirmReset(false)} />}
  </CardContent></Card>;
}

type RoleListRealm = Awaited<ReturnType<WebClient['roles']>>;

function LoadError({ error, onRetry }: { error: { message: string }; onRetry: () => void }) {
  return <div role="alert" className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-danger-line bg-danger-soft px-3 py-2 text-sm text-danger">
    <span>{t(error.message)}</span>
    <Button variant="secondary" size="sm" onClick={onRetry}><RotateCcw size={13} />{t('重试')}</Button>
  </div>;
}

// The shared Switch renders no accessible name of its own; wrap it in a label
// whose text (visible or screen-reader only) names the control.
function LabeledSwitch({ label, checked, onChange, disabled }: { label: string; checked: boolean; onChange: (value: boolean) => void; disabled?: boolean }) {
  return <label className="inline-flex items-center gap-1.5 text-xs text-muted">
    <span>{label}</span>
    <Switch checked={checked} onChange={onChange} disabled={disabled} />
  </label>;
}

type SectionHandlers = {
  draft: Draft; surface: NavigationSection['surface'];
  dirtyFlag: boolean;
  onPatch: (id: string, patch: Partial<NavigationSection>) => void;
  onAddNode: (type: NavigationNode['type'], sectionId: string, parentId?: string) => void;
  onEditNode: (key: string) => void; onMoveNode: (key: string) => void;
  onShiftNode: (key: string, direction: -1 | 1) => void; onReorderNode: (sourceId: string, targetId: string, before: boolean) => void;
  onVisibleNode: (key: string, visible: boolean) => void;
  onDeleteNode: (key: string) => void; onDeleteSection: (id: string) => void;
};

function SectionEditor({ section, nodes, ...handlers }: { section: NavigationSection; nodes: MenuTreeNode[] } & SectionHandlers) {
  const [open, setOpen] = useState(true);
  const count = nodes.reduce((sum, item) => sum + 1 + countChildren(item), 0);
  return <section data-section={section.id} aria-label={t(sectionTitle(section))} className="rounded-xl border border-line bg-surface p-3">
    <div className="flex flex-wrap items-center gap-2">
      <button type="button" aria-expanded={open} aria-label={t('展开或收起 {{name}}', { name: sectionTitle(section) })}
        onClick={() => setOpen(value => !value)} className="rounded p-1 text-subtle hover:bg-surface-alt hover:text-ink">
        <ChevronRight size={15} className={open ? 'rotate-90' : ''} />
      </button>
      <Input className="h-8 w-40" maxLength={40} aria-label={t('区域名称')} placeholder={t('区域名称')} value={section.name}
        onChange={event => handlers.onPatch(section.id, { name: event.target.value })} />
      <Input className="h-8 w-20" type="number" aria-label={t('区域排序')} value={section.sort}
        onChange={event => handlers.onPatch(section.id, { sort: Number(event.target.value) || 0 })} />
      <LabeledSwitch label={t('显示')} checked={section.visible} onChange={value => handlers.onPatch(section.id, { visible: value })} />
      <LabeledSwitch label={t('标题')} checked={section.show_title} onChange={value => handlers.onPatch(section.id, { show_title: value })} />
      <span className="rounded-full bg-surface-alt px-1.5 py-0.5 text-2xs tabular-nums text-muted" data-count={section.id}>{count}</span>
      <div className="ms-auto flex flex-wrap items-center gap-1">
        <Button variant="ghost" size="sm" onClick={() => handlers.onAddNode('directory', section.id)}><FolderPlus size={14} />{t('目录')}</Button>
        <Button variant="ghost" size="sm" onClick={() => handlers.onAddNode('page', section.id)}><SquarePen size={14} />{t('页面')}</Button>
        <Button variant="ghost" size="sm" onClick={() => handlers.onAddNode('link', section.id)}><Link2 size={14} />{t('链接')}</Button>
        <Button variant="ghost" size="sm" disabled={count > 0} onClick={() => handlers.onDeleteSection(section.id)}><Trash2 size={14} />{t('删除')}</Button>
      </div>
    </div>
    {open && <div className="mt-2">
      <NodeTable nodes={nodes} {...handlers} />
      {!nodes.length && <p className="rounded-lg border border-dashed border-line px-3 py-2 text-center text-2xs text-subtle">{t('此区域暂无节点')}</p>}
    </div>}
  </section>;
}

function countChildren(item: MenuTreeNode): number { return item.children.reduce((sum, child) => sum + 1 + countChildren(child), 0); }

// One flat tbody per section: children render as sibling rows indented by
// depth, so the table nesting stays valid while the tree collapses locally.
function NodeTable({ nodes, ...handlers }: { nodes: MenuTreeNode[] } & SectionHandlers) {
  // Directories start collapsed, matching the workspace sidebar; the operator's
  // toggles and drags take over from there.
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set(nodes.filter(item => item.children.length > 0).map(item => item.node.id)));
  const rows: { item: MenuTreeNode; depth: number }[] = [];
  const walk = (list: MenuTreeNode[], depth: number, hidden: boolean) => list.forEach(item => {
    const isHidden = hidden || collapsed.has(item.node.id);
    if (!hidden) rows.push({ item, depth });
    walk(item.children, depth + 1, isHidden);
  });
  walk(nodes, 0, false);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropHint, setDropHint] = useState<{ id: string; before: boolean } | null>(null);
  const endDrag = () => { setDragId(null); setDropHint(null); };
  // The ui Table owns the horizontal scroll; min-w-0 keeps this block shrinkable
  // inside the flex column so the table never widens the document itself.
  return <div className="min-w-0">
    <Table className="max-sm:[&_td]:px-2 max-sm:[&_th]:px-2">
      <TableHeader><TableRow>
        <TableHead>{t('名称')}</TableHead><TableHead className="max-sm:hidden">{t('类型')}</TableHead><TableHead className="max-sm:hidden">{t('图标')}</TableHead><TableHead className="max-sm:hidden">{t('目标')}</TableHead>
        <TableHead>{t('排序')}</TableHead><TableHead>{t('显示')}</TableHead><TableHead className="text-end">{t('操作')}</TableHead>
      </TableRow></TableHeader>
      <TableBody>
        {rows.map(({ item, depth }) => <NodeRow key={item.node.id} item={item} depth={depth} hasChildren={item.children.length > 0}
          collapsed={collapsed.has(item.node.id)} onToggle={key => setCollapsed(current => {
            const next = new Set(current);
            if (next.has(key)) next.delete(key); else next.add(key);
            return next;
          })}
          dragging={dragId === item.node.id}
          dropHint={dragId && dragId !== item.node.id ? dropHint?.id === item.node.id ? dropHint.before ? 'before' : 'after' : null : null}
          onDragStart={() => setDragId(item.node.id)}
          onDragOver={event => {
            if (!dragId || dragId === item.node.id) return;
            event.preventDefault();
            const rect = event.currentTarget.getBoundingClientRect();
            const before = event.clientY < rect.top + rect.height / 2;
            setDropHint(current => current?.id === item.node.id && current.before === before ? current : { id: item.node.id, before });
          }}
          onDrop={() => { if (dragId && dropHint?.id === item.node.id) handlers.onReorderNode(dragId, dropHint.id, dropHint.before); endDrag(); }}
          onDragEnd={endDrag}
          {...handlers} />)}
      </TableBody>
    </Table>
  </div>;
}

function NodeRow({ item, depth, hasChildren, collapsed, onToggle, dragging, dropHint, onDragStart, onDragOver, onDrop, onDragEnd, ...handlers }: {
  item: MenuTreeNode; depth: number; hasChildren: boolean; collapsed: boolean; onToggle: (key: string) => void;
  dragging: boolean; dropHint: 'before' | 'after' | null;
  onDragStart: () => void; onDragOver: (event: React.DragEvent<HTMLTableRowElement>) => void; onDrop: () => void; onDragEnd: () => void;
} & Omit<SectionHandlers, 'draft'> & { draft: Draft }) {
  const { node, children } = item;
  const open = !collapsed;
  const Icon = resolveNavigationIcon(node.icon);
  const TypeIcon = TYPE_ICONS[node.type];
  const target = node.type === 'page' ? node.route_id ?? '' : node.type === 'link' ? node.url ?? '' : node.type === 'action' ? node.permission ?? '' : '';
  const menuLabel = t('{{name}}的操作', { name: displayName(node) });
  return <>
    <TableRow data-node={node.id} data-node-type={node.type}
      draggable onDragStart={onDragStart} onDragOver={onDragOver} onDrop={onDrop} onDragEnd={onDragEnd}
      className={`${dragging ? 'opacity-40' : ''} ${dropHint === 'before' ? 'border-t-2 border-t-accent' : dropHint === 'after' ? 'border-b-2 border-b-accent' : ''}`}>
      <TableCell>
        <div className="flex items-center gap-2" style={{ paddingInlineStart: depth * 16 }}>
          {hasChildren && <button type="button" aria-expanded={open} aria-label={t('展开或收起 {{name}}', { name: displayName(node) })}
            onClick={() => onToggle(node.id)} className="rounded p-0.5 text-subtle hover:text-ink"><ChevronRight size={14} className={open ? 'rotate-90' : ''} /></button>}
          <Icon size={15} aria-hidden="true" className="shrink-0 text-muted" />
          <span className="break-all font-medium">{displayName(node)}</span>
          {node.badge_dot && <span className={`size-2 rounded-full bg-accent`} aria-label={t('圆点标记')} />}
          {!node.badge_dot && node.badge_text && <span className="rounded-full bg-surface-alt px-1.5 text-2xs text-muted">{node.badge_text}</span>}
        </div>
      </TableCell>
      <TableCell className="max-sm:hidden"><span className="inline-flex items-center gap-1 text-xs text-muted"><TypeIcon size={13} aria-hidden="true" />{t(TYPE_LABELS[node.type])}</span></TableCell>
      <TableCell className="max-sm:hidden"><span className="text-xs text-muted">{node.icon || '—'}</span></TableCell>
      <TableCell className="max-sm:hidden"><span className="text-xs text-muted">{target || '—'}</span></TableCell>
      <TableCell><span className="inline-flex items-center gap-1 text-xs tabular-nums text-muted">
        <button type="button" aria-label={t('上移 {{name}}', { name: displayName(node) })} className="rounded p-0.5 hover:text-ink" onClick={() => handlers.onShiftNode(node.id, -1)}><ArrowUp size={13} /></button>
        {node.sort}
        <button type="button" aria-label={t('下移 {{name}}', { name: displayName(node) })} className="rounded p-0.5 hover:text-ink" onClick={() => handlers.onShiftNode(node.id, 1)}><ArrowDown size={13} /></button>
      </span></TableCell>
      <TableCell><Switch aria-label={t('显示或隐藏 {{name}}', { name: displayName(node) })} checked={node.visible} onChange={value => handlers.onVisibleNode(node.id, value)} /></TableCell>
      <TableCell className="text-end">
        <DropdownMenu>
          <DropdownMenuTrigger asChild><button type="button" aria-label={menuLabel} className="rounded p-1 text-subtle hover:bg-surface-alt hover:text-ink"><EllipsisVertical size={15} /></button></DropdownMenuTrigger>
          <DropdownMenuContent align="end" aria-label={menuLabel} className="min-w-44">
            <DropdownMenuItem onSelect={() => handlers.onEditNode(node.id)}><Pencil size={14} />{t('编辑')}</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => handlers.onMoveNode(node.id)}><ListTree size={14} />{t('移动…')}</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => handlers.onAddNode('directory', node.section_id, node.id)} disabled={node.type !== 'directory' || depthOf(handlers.draft.nodes, node.id) >= MAX_DEPTH}><FolderPlus size={14} />{t('添加子目录…')}</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => handlers.onAddNode('page', node.section_id, node.id)} disabled={node.type !== 'directory' || depthOf(handlers.draft.nodes, node.id) >= MAX_DEPTH}><SquarePen size={14} />{t('添加子页面…')}</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => handlers.onAddNode('link', node.section_id, node.id)} disabled={node.type !== 'directory' || depthOf(handlers.draft.nodes, node.id) >= MAX_DEPTH}><Link2 size={14} />{t('添加子链接…')}</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => handlers.onDeleteNode(node.id)}><Trash2 size={14} />{t('删除')}</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </TableCell>
    </TableRow>
  </>;
}

type NodeForm = {
  parentId: string; name: string; icon: string; sort: string; visible: boolean;
  routeId: string; activeMenu: string; url: string; openMode: NavigationNode['open_mode'];
  permission: string; operationIds: string[]; badgeText: string; badgeColor: string; badgeDot: boolean;
};

function NodeDialog({ state, draft, surface, pages, permissions, operations, onClose, onSubmit }: {
  state: NodeDialogState; draft: Draft; surface: NavigationSection['surface']; pages: MenuList['pages']; permissions: string[]; operations: APIOperation[];
  onClose: () => void; onSubmit: (node: NavigationNode, isNew: boolean) => void;
}) {
  useLocale();
  const editing = state.mode === 'edit' ? nodeIndex(draft.nodes).get(state.key) : undefined;
  const type: NavigationNode['type'] = editing ? editing.type : state.mode === 'create' ? state.type : 'page';
  const sections = draft.sections.filter(section => section.surface === surface);
  const directories = draft.nodes.filter(node => node.type === 'directory' && sections.some(section => section.id === node.section_id)
    && (!editing || (!isDescendant(draft.nodes, node.id, editing.id) && node.id !== editing.id)));
  const usedRoutes = new Set(draft.nodes.filter(node => node.type === 'page' && node.id !== editing?.id && sections.some(section => section.id === node.section_id)).map(node => node.route_id));
  const routeOptions = (pages.length ? pages.filter(page => page.surfaces.includes(surface)).map(page => page.id) : Object.keys(routes).filter(isRegisteredPage))
    .filter(isRegisteredPage).filter(id => !usedRoutes.has(id));
  const [operationSearch, setOperationSearch] = useState('');
  const parentRefOf = (node: NavigationNode): string => {
    if (!node.parent_id) return `top:${node.section_id}`;
    return `${nodeIndex(draft.nodes).get(node.parent_id)?.type === 'page' ? 'page' : 'dir'}:${node.parent_id}`;
  };
  const surfacePages = draft.nodes.filter(item => item.type === 'page' && sections.some(section => section.id === item.section_id));
  const parentRef = editing ? parentRefOf(editing) : state.mode === 'create' && state.parentId ? `${state.type === 'action' ? 'page' : 'dir'}:${state.parentId}` : state.mode === 'create' ? `top:${state.sectionId}` : 'top:';
  const [form, setForm] = useState<NodeForm>({
    parentId: parentRef,
    name: editing?.label ?? '',
    icon: editing?.icon ?? (type === 'directory' ? 'Folder' : type === 'link' ? 'Link' : type === 'action' ? 'MousePointerClick' : 'Circle'),
    sort: String(editing?.sort ?? 100),
    visible: editing?.visible ?? true,
    routeId: editing?.route_id ?? '',
    activeMenu: editing?.active_menu ?? '',
    url: editing?.url ?? '',
    openMode: editing?.open_mode ?? 'same_tab',
    permission: editing?.permission ?? '',
    operationIds: editing?.operation_ids ?? [],
    badgeText: editing?.badge_text ?? '',
    badgeColor: editing?.badge_color || 'primary',
    badgeDot: editing?.badge_dot ?? false,
  });
  const [errors, setErrors] = useState<{ name?: string; url?: string; route?: string }>({});
  const operationMatches = operations.filter(operation => `${operation.method} ${operation.path} ${operation.summary}`.toLowerCase().includes(operationSearch.toLowerCase())).slice(0, 50);
  const patch = (value: Partial<NodeForm>) => setForm(current => ({ ...current, ...value }));
  // The server attaches actions to pages, so the parent picker is type-aware:
  // pages pick a section top or a directory, actions pick a page row.
  const parentOptions = type === 'action'
    ? surfacePages.filter(item => depthOf(draft.nodes, item.id) < MAX_DEPTH && (!editing || item.id !== editing.id))
        .map(item => ({ value: `page:${item.id}`, label: displayName(item) }))
    : sections.map(section => ({ value: `top:${section.id}`, label: t('顶层 · {{name}}', { name: sectionTitle(section) }) }))
        .concat(directories.map(node => ({ value: `dir:${node.id}`, label: `${'　'.repeat(Math.max(0, depthOf(draft.nodes, node.id) - 1))}${displayName(node)}` })));
  const submit = () => {
    const next: typeof errors = {};
    if (!form.name.trim() && type !== 'page') next.name = t('请输入名称');
    if (type === 'page' && !form.routeId) next.route = t('请选择已注册页面');
    if (type === 'link' && !validNavigationUrl(form.url)) next.url = t('链接地址需为站内已注册路径或 http(s) 地址');
    setErrors(next);
    if (Object.keys(next).length) return;
    const parentKind = form.parentId.split(':')[0];
    const parentIdValue = form.parentId.slice(parentKind.length + 1);
    const parentRow = parentKind === 'dir' ? directories.find(node => node.id === parentIdValue)
      : parentKind === 'page' ? surfacePages.find(node => node.id === parentIdValue) : undefined;
    const sectionId = parentRow?.section_id ?? (parentKind === 'top' ? parentIdValue : sections[0].id);
    const parentId = parentKind === 'top' ? undefined : parentIdValue;
    const node: NavigationNode = editing
      ? { ...editing, section_id: sectionId, parent_id: parentId,
          label: form.name.trim(), icon: form.icon, sort: Number(form.sort) || 0, visible: form.visible,
          url: type === 'link' ? form.url.trim() : editing.url, open_mode: form.openMode,
          active_menu: form.activeMenu || undefined, permission: type === 'action' ? form.permission || undefined : editing.permission,
          operation_ids: type === 'action' ? form.operationIds : editing.operation_ids,
          badge_text: form.badgeText.trim(), badge_color: form.badgeDot || form.badgeText.trim() ? form.badgeColor : '', badge_dot: form.badgeDot,
          route_id: type === 'page' ? form.routeId : editing.route_id }
      : { ...newNavigationNode(randomId(draft.nodes, type), sectionId, type),
          parent_id: parentId,
          label: form.name.trim(), icon: form.icon, sort: Number(form.sort) || 0, visible: form.visible,
          route_id: type === 'page' ? form.routeId : undefined, url: type === 'link' ? form.url.trim() : undefined,
          open_mode: form.openMode, active_menu: form.activeMenu || undefined,
          permission: type === 'action' ? form.permission || undefined : undefined,
          operation_ids: type === 'action' ? form.operationIds : [],
          badge_text: form.badgeText.trim(), badge_color: form.badgeDot || form.badgeText.trim() ? form.badgeColor : '', badge_dot: form.badgeDot };
    onSubmit(node, !editing);
    onClose();
  };
  return <Modal title={editing ? t('编辑节点') : t('添加{{type}}', { type: t(TYPE_LABELS[type]) })} onClose={onClose} className="flex min-h-0 flex-1 flex-col">
    {/* Body scrolls, the action row stays pinned so 添加/取消 never sit below the fold. */}
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto pe-1">
    <label className="flex flex-col gap-1 text-xs text-muted">{t('父区域/目录')}
      <SimpleSelect label={t('父区域/目录')} value={form.parentId} onChange={value => patch({ parentId: value })} options={parentOptions} />
    </label>
    {type === 'page' && <label className="flex flex-col gap-1 text-xs text-muted">{t('目标页面（仅已注册路由）')}
      <SimpleSelect label={t('目标页面（仅已注册路由）')} value={form.routeId} placeholder={t('选择页面')}
        onChange={value => patch({ routeId: value })}
        options={routeOptions.map(id => ({ value: id, label: t(routes[id].label) }))} />
      {errors.route && <small role="alert" className="text-danger">{errors.route}</small>}
    </label>}
    {type === 'link' && <>
      <label className="flex flex-col gap-1 text-xs text-muted">{t('链接地址')}
        <Input value={form.url} maxLength={2048} inputMode="url" aria-label={t('链接地址')} placeholder="https://example.com/help"
          aria-invalid={!!errors.url || undefined} onChange={event => patch({ url: event.target.value })} />
        {errors.url && <small role="alert" className="text-danger">{errors.url}</small>}
        <small>{t('站内地址需指向已注册页面，不能指向任意文件路径。')}</small>
      </label>
      <label className="flex flex-col gap-1 text-xs text-muted">{t('打开方式')}
        <SimpleSelect label={t('打开方式')} value={form.openMode} onChange={value => patch({ openMode: value as NavigationNode['open_mode'] })}
          options={[{ value: 'same_tab', label: t('当前窗口') }, { value: 'new_tab', label: t('新窗口') }]} />
      </label>
    </>}
    {type === 'action' && <>
      <label className="flex flex-col gap-1 text-xs text-muted">{t('引用权限点')}
        <SimpleSelect label={t('引用权限点')} value={form.permission} placeholder={t('选择权限点')} onChange={value => patch({ permission: value })}
          options={permissions.map(id => ({ value: id, label: id }))} />
        <small>{t('按钮仅在侧栏定义入口，引用已登记的权限点，不代表业务代码本身。')}</small>
      </label>
      <div className="flex flex-col gap-1 text-xs text-muted">
        <span>{t('引用操作（API 目录）')}</span>
        <Input value={operationSearch} aria-label={t('筛选 API 操作')} placeholder={t('筛选 API 操作')} autoComplete="off"
          onChange={event => setOperationSearch(event.target.value)} />
        <div role="group" aria-label={t('引用操作（API 目录）')} className="flex max-h-40 flex-col gap-1 overflow-y-auto rounded-md border border-line p-2">
          {operationMatches.map(operation => <Checkbox key={operation.operation_id}
            aria-label={`${operation.method} ${operation.path}`}
            checked={form.operationIds.includes(operation.operation_id)}
            onChange={checked => patch({ operationIds: checked ? [...form.operationIds, operation.operation_id] : form.operationIds.filter(id => id !== operation.operation_id) })}>
            <span className="font-mono text-2xs text-muted">{operation.method}</span>{` ${operation.path}`}
          </Checkbox>)}
          {!operationMatches.length && <span className="text-2xs text-subtle">{t('没有匹配的操作')}</span>}
        </div>
        <small>{t('仅登记 API 操作标识，不执行任何请求。')}</small>
      </div>
    </>}
    <label className="flex flex-col gap-1 text-xs text-muted">{t('显示名称')}
      <Input value={form.name} maxLength={64} autoComplete="off" aria-label={t('显示名称')} placeholder={type === 'page' ? t('留空使用页面默认名称') : t('请输入名称')}
        aria-invalid={!!errors.name || undefined} onChange={event => patch({ name: event.target.value })} />
      {errors.name && <small role="alert" className="text-danger">{errors.name}</small>}
    </label>
    <NavigationIconPicker value={form.icon} onChange={icon => patch({ icon })} />
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <label className="flex flex-col gap-1 text-xs text-muted">{t('排序')}
        <Input type="number" aria-label={t('排序')} value={form.sort} onChange={event => patch({ sort: event.target.value })} />
      </label>
      <label className="flex flex-col gap-1 text-xs text-muted">{t('在导航中显示')}
        <Switch checked={form.visible} onChange={value => patch({ visible: value })} />
      </label>
      <label className="flex flex-col gap-1 text-xs text-muted">{t('角标文字')}
        <Input value={form.badgeText} maxLength={12} aria-label={t('角标文字')} onChange={event => patch({ badgeText: event.target.value })} />
      </label>
      <label className="flex flex-col gap-1 text-xs text-muted">{t('角标样式')}
        <div className="flex items-center gap-2">
          <SimpleSelect label={t('角标样式')} value={form.badgeColor} onChange={value => patch({ badgeColor: value })}
            options={Object.entries(BADGE_COLORS).map(([value, label]) => ({ value, label: t(label) }))} />
          <label className="flex items-center gap-1 text-xs text-muted"><Switch checked={form.badgeDot} onChange={value => patch({ badgeDot: value })} />{t('圆点角标')}</label>
        </div>
      </label>
      {type !== 'action' && <label className="flex flex-col gap-1 text-xs text-muted">{t('高亮菜单（active_menu）')}
        <SimpleSelect label={t('高亮菜单（active_menu）')} value={form.activeMenu} placeholder={t('默认按目标高亮')} onChange={value => patch({ activeMenu: value })}
          options={routeOptions.map(id => ({ value: id, label: t(routes[id].label) }))} />
      </label>}
    </div>
    </div>
    <div className="flex shrink-0 justify-end gap-2 border-t border-line pt-3">
      <Button variant="secondary" onClick={onClose}>{t('取消')}</Button>
      <Button onClick={submit}>{editing ? t('保存') : t('添加')}</Button>
    </div>
  </Modal>;
}

function MoveDialog({ draft, surface, node, onClose, onConfirm }: {
  draft: Draft; surface: NavigationSection['surface']; node: NavigationNode; onClose: () => void;
  onConfirm: (key: string, sectionId: string, parentId?: string) => void;
}) {
  useLocale();
  const sections = draft.sections.filter(section => section.surface === surface);
  const directories = draft.nodes.filter(item => item.type === 'directory' && item.id !== node.id && !isDescendant(draft.nodes, item.id, node.id)
    && sections.some(section => section.id === item.section_id)
    && depthOf(draft.nodes, item.id) + heightOf(draft.nodes, node.id) <= MAX_DEPTH);
  const [value, setValue] = useState(node.parent_id ? `${nodeIndex(draft.nodes).get(node.parent_id)?.type === 'page' ? 'page' : 'dir'}:${node.parent_id}` : `top:${node.section_id}`);
  // Actions always move onto a page row; everything else moves to a section top or a directory.
  const options = node.type === 'action'
    ? draft.nodes.filter(item => item.type === 'page' && item.id !== node.id && sections.some(section => section.id === item.section_id)
        && depthOf(draft.nodes, item.id) + 1 <= MAX_DEPTH)
        .map(item => ({ value: `page:${item.id}`, label: displayName(item) }))
    : sections.map(section => ({ value: `top:${section.id}`, label: t('顶层 · {{name}}', { name: sectionTitle(section) }) }))
        .concat(directories.map(item => ({ value: `dir:${item.id}`, label: `${'　'.repeat(Math.max(0, depthOf(draft.nodes, item.id) - 1))}${displayName(item)}` })));
  return <Modal title={t('移动节点')} onClose={onClose} className="flex flex-col gap-3">
    <p className="text-xs text-muted">{t('选择目标区域顶层，或嵌套到其他目录之下；深度最多 {{count}} 层。', { count: MAX_DEPTH })}</p>
    <label className="flex flex-col gap-1 text-xs text-muted">{t('目标位置')}
      <SimpleSelect label={t('目标位置')} value={value} onChange={setValue} options={options} />
    </label>
    <div className="flex shrink-0 justify-end gap-2 border-t border-line pt-3">
      <Button variant="secondary" onClick={onClose}>{t('取消')}</Button>
      <Button onClick={() => {
        const kind = value.split(':')[0];
        const id = value.slice(kind.length + 1);
        const target = kind === 'top' ? undefined : nodeIndex(draft.nodes).get(id);
        onConfirm(node.id, target?.section_id ?? (kind === 'top' ? id : node.section_id), kind === 'top' ? undefined : id);
      }}>{t('移动')}</Button>
    </div>
  </Modal>;
}


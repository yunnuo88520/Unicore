// Author: yunnuo <ymz@ebox.vip>
// Description: Single tree-table navigation editor over the one persisted shared navigation tree: region root rows with nested directory/page/link/action rows, one per-row more-actions dropdown (every directory, page and link can add sub-menus), parent picking, full tree drag & drop (same-list reorder, re-parent and cross-region moves through one subtree-rewriting primitive shared with the move dialog), search, bulk expand/collapse and subtree copy; one save derives surfaces from the route registry and submits the whole tree with a version CAS.
import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowDown, ArrowUp, ChevronsDown, ChevronsUp, ChevronDown, ChevronRight, Copy, FolderTree, Link2, ListTree,
  MoreHorizontal, MousePointerClick, Pencil, Plus, RotateCcw, Save, Search, SquarePen, Trash2, type LucideIcon,
} from 'lucide-react';
import { Alert, Badge, Button, Card, CardContent, Checkbox, ConfirmDialog, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, Input, Modal, SimpleSelect, Switch, Table, TableBody, TableCell, TableHead, TableHeader, TableRow, useMessage } from '@unicore/ui';
import { AppError, type AppClient, type Bootstrap, type MenuList, type MenuSaveInput, type NavigationNode, type NavigationSection, type RoleList, type WebClient } from '@unicore/sdk';
import {
  buildMenuTree, copyMenuNode, defaultNavigation, filterMenuTree, isRegisteredPage, menuNodeLabel, menuNodeTarget,
  newNavigationNode, routeSurfaces, sectionTitle, validNavigationUrl, type MenuTreeNode,
} from '../../navigation';
import { NavigationIconPicker, resolveNavigationIcon } from '../../navigation-icons';
import { routes } from '../../routes';
import { invalidateAfter } from '../../queries';
import { defineMessages, t, useLocale } from '../../i18n';
import type { PageProps } from '../../router';

const MAX_DEPTH = 5;
const TYPE_LABELS = defineMessages({ directory: '目录', page: '页面', link: '链接', action: '按钮' });
const TYPE_ICONS: Record<NavigationNode['type'], LucideIcon> = { directory: ListTree, page: SquarePen, link: Link2, action: MousePointerClick };
const BADGE_COLORS = defineMessages({ primary: '主色', success: '成功', warning: '警告', danger: '危险', muted: '中性' });
// Actions attach to pages server-side, so the editor never creates them from scratch.
const CREATABLE_TYPES: NavigationNode['type'][] = ['directory', 'page', 'link'];
const typeDefaultIcon = (type: NavigationNode['type']): string =>
  type === 'directory' ? 'Folder' : type === 'link' ? 'Link' : type === 'action' ? 'MousePointerClick' : 'Circle';

type Draft = { version: number; sections: NavigationSection[]; nodes: NavigationNode[] };

const nodeIndex = (nodes: NavigationNode[]): Map<string, NavigationNode> => new Map(nodes.map(node => [node.id, node]));
// Action nodes are authorization units managed in the role editor; the menu
// layout tree arranges directories, pages and links only.
function stripActionNodes(items: MenuTreeNode[]): MenuTreeNode[] {
  return items.filter(item => item.node.type !== 'action').map(item => ({ ...item, children: stripActionNodes(item.children) }));
}
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
function randomId(takenIds: string[], prefix: string): string {
  const taken = new Set(takenIds);
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
function renumber(draft: Draft): NavigationNode[] {
  const tree = buildMenuTree(draft);
  const sorts = new Map<string, number>();
  const walk = (list: MenuTreeNode[]) => list.forEach((item, index) => { sorts.set(item.node.id, (index + 1) * 10); walk(item.children); });
  tree.forEach(({ children }) => walk(children));
  return draft.nodes.map(node => sorts.has(node.id) ? { ...node, sort: sorts.get(node.id)! } : node);
}
function shiftNode(draft: Draft, key: string, direction: -1 | 1): Draft {
  const tree = buildMenuTree(draft);
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

type DropMode = 'before' | 'after' | 'inside';
type DropTarget = { kind: 'node'; id: string } | { kind: 'section'; id: string };
type DropPlacement = { kind: 'before' | 'after'; siblingId: string } | { kind: 'append' };

// One relocation primitive shared by drag & drop and the move dialog: the node
// re-parents, its whole subtree — invisible action descendants included —
// rewrites to the target section so every parent chain stays inside one section
// (the server refuses cross-section chains wholesale), active_menu references
// stranded across the boundary drop, and the sibling lists renumber. Guards
// fail closed: self or descendant landings, action parent rules and depth
// overflow leave the draft untouched.
function moveSubtree(draft: Draft, key: string, sectionId: string, parentId: string | undefined, placement: DropPlacement): Draft {
  const index = nodeIndex(draft.nodes);
  const source = index.get(key);
  if (!source || !draft.sections.some(section => section.id === sectionId) || placement.kind !== 'append' && placement.siblingId === key) return draft;
  if (source.type === 'action' && (!parentId || index.get(parentId)?.type !== 'page')) return draft;
  if (parentId) {
    const parent = index.get(parentId);
    if (!parent || parent.id === key || parent.type === 'action' || isDescendant(draft.nodes, parentId, key)) return draft;
    if (depthOf(draft.nodes, parentId) + heightOf(draft.nodes, key) > MAX_DEPTH) return draft;
  } else if (heightOf(draft.nodes, key) > MAX_DEPTH) return draft;
  const subtree = new Set<string>([key]);
  const collect = (id: string) => { for (const node of draft.nodes) if (node.parent_id === id) { subtree.add(node.id); collect(node.id); } };
  collect(key);
  let nodes = draft.nodes.map(node => subtree.has(node.id)
    ? { ...node, section_id: sectionId, ...(node.id === key ? { parent_id: parentId } : {}) }
    : node);
  // active_menu must reference a same-section non-action node; a cross-section
  // move may strand a reference on either side of the boundary, so drop those.
  const moved = nodeIndex(nodes);
  nodes = nodes.map(node => {
    if (!node.active_menu) return node;
    const target = moved.get(node.active_menu);
    return !target || target.type === 'action' || target.section_id !== node.section_id ? { ...node, active_menu: undefined } : node;
  });
  // Pin the drop position inside the target sibling list before the whole-tree
  // renumber, so a cross-list arrival lands exactly where it was released.
  const siblings = nodes
    .filter(node => parentId ? node.parent_id === parentId : !node.parent_id && node.section_id === sectionId)
    .sort((a, b) => a.sort - b.sort || a.id.localeCompare(b.id));
  const ids = siblings.map(item => item.id).filter(id => id !== key);
  let at = ids.length;
  if (placement.kind !== 'append') {
    const anchor = ids.indexOf(placement.siblingId);
    if (anchor < 0) return draft;
    at = placement.kind === 'before' ? anchor : anchor + 1;
  }
  ids.splice(at, 0, key);
  const sorts = new Map(ids.map((id, slot) => [id, (slot + 1) * 10]));
  nodes = nodes.map(node => sorts.has(node.id) ? { ...node, sort: sorts.get(node.id)! } : node);
  return { ...draft, nodes: renumber({ ...draft, nodes }) };
}

// A landing is legal when the target is neither the source nor its descendant,
// the moved subtree still fits MAX_DEPTH at its new depth and actions stay
// page-bound; cross-region landings are legal — the whole subtree rewrites.
function resolveDrop(draft: Draft, sourceId: string, target: DropTarget, mode: DropMode): { sectionId: string; parentId?: string; placement: DropPlacement } | null {
  const index = nodeIndex(draft.nodes);
  const source = index.get(sourceId);
  if (!source || source.type === 'action') return null;
  if (target.kind === 'section') {
    if (!draft.sections.some(section => section.id === target.id) || heightOf(draft.nodes, sourceId) > MAX_DEPTH) return null;
    return { sectionId: target.id, parentId: undefined, placement: { kind: 'append' } };
  }
  if (target.id === sourceId) return null;
  const row = index.get(target.id);
  if (!row || row.type === 'action' || isDescendant(draft.nodes, target.id, sourceId)) return null;
  const height = heightOf(draft.nodes, sourceId);
  if (mode === 'inside') {
    if (depthOf(draft.nodes, target.id) + height > MAX_DEPTH) return null;
    return { sectionId: row.section_id, parentId: target.id, placement: { kind: 'append' } };
  }
  const parentDepth = row.parent_id ? depthOf(draft.nodes, row.parent_id) : 0;
  if (parentDepth + height > MAX_DEPTH) return null;
  return { sectionId: row.section_id, parentId: row.parent_id, placement: { kind: mode, siblingId: target.id } };
}
// Surfaces are never operator-editable: the route registry decides page reach,
// directories aggregate their subtree, links stay shared and actions keep the
// persisted arrays. Deriving on save mirrors the seeded tree without exposing
// any workspace concept in the editor.
function deriveSurfaces(nodes: NavigationNode[]): NavigationNode[] {
  const childrenOf = new Map<string, NavigationNode[]>();
  for (const node of nodes) if (node.parent_id) childrenOf.set(node.parent_id, [...childrenOf.get(node.parent_id) ?? [], node]);
  const surfacesOf = (node: NavigationNode): NavigationNode['surfaces'] => {
    if (node.type === 'page') return routeSurfaces(node.route_id ?? '');
    if (node.type === 'link') return ['user', 'administrator'];
    if (node.type === 'directory') {
      const merged = new Set<'user' | 'administrator'>();
      for (const child of childrenOf.get(node.id) ?? []) if (child.type === 'page' || child.type === 'directory') for (const surface of surfacesOf(child)) merged.add(surface);
      // A childless directory stays reachable in both workspaces until pages land.
      return merged.size ? [...merged] : ['user', 'administrator'];
    }
    return [...node.surfaces];
  };
  return nodes.map(node => ({ ...node, surfaces: surfacesOf(node) }));
}
function loadDraft(data: MenuList, profile: Bootstrap['profile']): Draft {
  const sections = [...data.sections];
  const nodes = [...data.nodes];
  if (!sections.length && !nodes.length) {
    const fallback = defaultNavigation(['user', 'administrator'], profile);
    sections.push(...fallback.sections);
    nodes.push(...fallback.nodes);
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
  const [draft, setDraft] = useState<Draft | null>(null);
  const [nodeDialog, setNodeDialog] = useState<NodeDialogState | null>(null);
  const [moveDialog, setMoveDialog] = useState<string | null>(null);
  const [deleteNode, setDeleteNode] = useState<string | null>(null);
  const [deleteSection, setDeleteSection] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [search, setSearch] = useState('');
  const [assigning, setAssigning] = useState<{ node: NavigationNode; version: number } | null>(null);
  const canAssign = !!metadata.current_user?.roles.includes('super_admin');
  const roleList = useQuery({ queryKey: ['roles'], queryFn: () => web.roles(), enabled: canAssign });
  // null keeps the defaults: regions open, directories with children collapsed.
  const [collapsed, setCollapsed] = useState<Set<string> | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropHint, setDropHint] = useState<{ id: string; mode: DropMode } | null>(null);

  const config = useQuery<MenuList>({ queryKey: ['menu-config'], queryFn: () => web.menuConfig() });
  const baseline = useMemo(() => (config.data ? loadDraft(config.data, metadata.profile) : null), [config.data, metadata.profile]);
  useEffect(() => { if (config.data && !draft) setDraft(loadDraft(config.data, metadata.profile)); }, [config.data, draft, metadata.profile]);
  const dirty = !!draft && !!baseline && JSON.stringify([draft.sections, draft.nodes]) !== JSON.stringify([baseline.sections, baseline.nodes]);
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
      setDraft(loadDraft(data, metadata.profile));
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

  const tree = useMemo(() => (draft ? buildMenuTree(draft) : []), [draft]);
  const defaultCollapsed = useMemo(() => draft
    ? new Set(draft.nodes.filter(node => node.type === 'directory' && draft.nodes.some(child => child.parent_id === node.id)).map(node => node.id))
    : new Set<string>(), [draft]);
  const collapsedSet = collapsed ?? defaultCollapsed;
  const toggleCollapse = (id: string) => setCollapsed(current => {
    const next = new Set(current ?? defaultCollapsed);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const expandAll = () => setCollapsed(new Set<string>());
  const collapseAll = () => {
    if (!draft) return;
    const ids = new Set<string>(draft.sections.map(section => section.id));
    for (const node of draft.nodes) if (node.type === 'directory' && draft.nodes.some(child => child.parent_id === node.id)) ids.add(node.id);
    setCollapsed(ids);
  };
  const query = search.trim().toLowerCase();
  const searching = query.length > 0;
  // Action nodes are authorization units managed in the role editor; the
  // layout tree only arranges directories, pages and links. They stay in the
  // draft and ride along in the saved payload.
  const layoutTree = useMemo(() => tree.map(({ section, children }) => ({ section, children: stripActionNodes(children) })), [tree]);
  const visibleTree = useMemo(() => searching
    ? filterMenuTree(layoutTree,
        node => menuNodeLabel(node).toLowerCase().includes(query) || menuNodeTarget(node).toLowerCase().includes(query),
        section => sectionTitle(section).toLowerCase().includes(query))
    : layoutTree, [layoutTree, searching, query]);

  if (!draft) return <Card><CardContent className="flex min-w-0 flex-col gap-4">
    {config.isError && <LoadError onRetry={() => void config.refetch()} error={config.error} />}
    {config.isPending && <p role="status" className="py-6 text-center text-sm text-muted">{t('正在读取菜单配置…')}</p>}
  </CardContent></Card>;

  const counts = new Map(layoutTree.map(({ section, children }) => [section.id, countAll(children)]));
  const rows: TreeRow[] = [];
  for (const { section, children } of visibleTree) {
    const open = searching || !collapsedSet.has(section.id);
    rows.push({ kind: 'section', section, count: counts.get(section.id) ?? 0, open });
    if (!open) continue;
    const walk = (items: MenuTreeNode[], depth: number) => items.forEach(item => {
      const expanded = searching || !collapsedSet.has(item.node.id);
      rows.push({ kind: 'node', item, depth, collapsed: !expanded });
      if (expanded) walk(item.children, depth + 1);
    });
    walk(children, 1);
  }

  const patchSection = (id: string, patch: Partial<NavigationSection>) =>
    setDraft(current => current && { ...current, sections: current.sections.map(section => section.id === id ? { ...section, ...patch } : section) });
  const patchNode = (id: string, patch: Partial<NavigationNode>) =>
    setDraft(current => current && { ...current, nodes: current.nodes.map(node => node.id === id ? { ...node, ...patch } : node) });
  // Full tree drag & drop over the shared primitive: the row's upper/lower
  // third inserts beside it (a pure reorder within one parent, a re-parent
  // across lists otherwise), the middle nests it as that row's last child and
  // a region root row takes the whole subtree to that region's top. Illegal
  // landings keep the browser's forbidden cursor because dragover never
  // preventDefaults, so the drop never fires.
  const dropZone = (event: React.DragEvent<HTMLTableRowElement>): DropMode => {
    const rect = event.currentTarget.getBoundingClientRect();
    if (event.clientY < rect.top + rect.height / 3) return 'before';
    if (event.clientY > rect.bottom - rect.height / 3) return 'after';
    return 'inside';
  };
  const endDrag = () => { setDragId(null); setDropHint(null); };
  const handleDragStart = (id: string) => setDragId(id);
  const handleDragOver = (event: React.DragEvent<HTMLTableRowElement>, target: DropTarget) => {
    if (!dragId || !draft) return;
    const mode = target.kind === 'section' ? 'inside' as const : dropZone(event);
    if (!resolveDrop(draft, dragId, target, mode)) return;
    event.preventDefault();
    setDropHint(current => current?.id === target.id && current.mode === mode ? current : { id: target.id, mode });
  };
  const handleDrop = (event: React.DragEvent<HTMLTableRowElement>, target: DropTarget) => {
    // preventDefault also keeps the browser from pouring the dragged row's
    // text into the region name or sort inputs under the pointer.
    event.preventDefault();
    if (dragId && draft && dropHint?.id === target.id) {
      const plan = resolveDrop(draft, dragId, target, dropHint.mode);
      if (plan) {
        setDraft(current => current && moveSubtree(current, dragId, plan.sectionId, plan.parentId, plan.placement));
        // A subtree dropped inside a collapsed directory must show up at once.
        if (plan.parentId) setCollapsed(current => {
          const base = current ?? defaultCollapsed;
          if (!base.has(plan.parentId!)) return current;
          const next = new Set(base); next.delete(plan.parentId!); return next;
        });
      }
    }
    endDrag();
  };
  const addSection = () => setDraft(current => current && { ...current, sections: [...current.sections, {
    id: randomId([...current.sections.map(section => section.id), ...current.nodes.map(node => node.id)], 'section'),
    surfaces: ['user', 'administrator'], name: '', sort: (current.sections.length + 1) * 10, visible: true, show_title: true }] });
  const addChild = (sectionId: string, parentId?: string) => setNodeDialog({ mode: 'create', type: 'directory', sectionId, parentId });
  const submitNode = (node: NavigationNode, isNew: boolean) => {
    setDraft(current => {
      if (!current) return current;
      if (!isNew) return { ...current, nodes: current.nodes.map(item => item.id === node.id ? node : item) };
      return { ...current, nodes: [...current.nodes, node] };
    });
    // A node added under a collapsed directory must become visible right away.
    if (isNew && node.parent_id) setCollapsed(current => {
      const base = current ?? defaultCollapsed;
      if (!base.has(node.parent_id!)) return current;
      const next = new Set(base); next.delete(node.parent_id!); return next;
    });
  };
  const submitMove = (key: string, sectionId: string, parentId?: string) => {
    setMoveDialog(null);
    // The dialog is the fallback for the same relocation the drag path performs:
    // one primitive, one subtree section rewrite, one ordering semantic.
    setDraft(current => current && moveSubtree(current, key, sectionId, parentId, { kind: 'append' }));
  };
  const copyNode = (key: string) => setDraft(current => current && { ...current, nodes: copyMenuNode(current.nodes, key) });
  const confirmDeleteNode = (key: string) => { setDraft(current => current && { ...current, nodes: renumber(removeNode(current, key)) }); setDeleteNode(null); };
  const confirmDeleteSection = (sectionId: string) => {
    setDraft(current => current && { ...current, sections: current.sections.filter(section => section.id !== sectionId) });
    setDeleteSection(null);
  };
  const submitReset = () => {
    if (!draft) return;
    // reset is whole-tree: the server restores the registered default tree for
    // every workspace together, not only the section being viewed.
    save.mutate({ version: draft.version, sections: [], nodes: [], reset: true });
    setConfirmReset(false);
  };
  const saveTree = () => {
    if (!draft) return;
    save.mutate({ version: draft.version, sections: draft.sections, nodes: deriveSurfaces(draft.nodes) });
  };

  const handlers: RowHandlers = {
    draft,
    assignedRoles: roleList.data,
    onAssign: canAssign ? key => { if (dirty) { message.error(t('请先保存菜单配置再分配角色')); return; } const node = nodeIndex(draft!.nodes).get(key); if (node) setAssigning({ node, version: draft!.version }); } : undefined,
    onToggleCollapse: toggleCollapse,
    onPatchSection: patchSection,
    onAddChild: addChild,
    onEditNode: key => setNodeDialog({ mode: 'edit', key }),
    onMoveNode: key => setMoveDialog(key),
    onCopyNode: copyNode,
    onShiftNode: (key, direction) => setDraft(current => current && shiftNode(current, key, direction)),
    onVisibleNode: (key, visible) => patchNode(key, { visible }),
    onDeleteNode: key => setDeleteNode(key),
    onDeleteSection: id => setDeleteSection(id),
  };

  return <Card><CardContent className="flex min-w-0 flex-col gap-4">
    <div>
      <h2 className="text-md font-semibold text-ink">{t('菜单配置')}</h2>
      <p className="mt-0.5 text-xs text-muted">{t('调整共享导航树的分组、顺序、名称、图标与可见性；页面所属工作空间由路由注册决定，可在菜单行分配角色，或在角色权限中细化按钮与 API。')}</p>
    </div>
    {config.isFetching && <p role="status" className="text-2xs text-subtle">{t('正在刷新菜单配置…')}</p>}
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative min-w-52 flex-1 sm:max-w-80">
        <Search size={14} aria-hidden="true" className="pointer-events-none absolute start-2.5 top-1/2 -translate-y-1/2 text-subtle" />
        <Input className="ps-8" value={search} aria-label={t('搜索名称、路由或链接')} placeholder={t('搜索名称、路由或链接')} autoComplete="off"
          onChange={event => setSearch(event.target.value)} />
      </div>
      <Button variant="secondary" size="sm" disabled={pending} onClick={expandAll}><ChevronsDown size={14} />{t('展开全部')}</Button>
      <Button variant="secondary" size="sm" disabled={pending} onClick={collapseAll}><ChevronsUp size={14} />{t('收起全部')}</Button>
      <Button variant="secondary" size="sm" disabled={pending} onClick={addSection}><Plus size={14} />{t('添加区域')}</Button>
    </div>
    <MenuTreeTable rows={rows} searching={searching} handlers={handlers}
      drag={{ dragId, dropHint, onDragStart: handleDragStart, onDragOver: handleDragOver, onDrop: handleDrop, onDragEnd: endDrag }} />
    <p className="text-2xs text-subtle">{t('拖拽行到目标行的上三分之一或下三分之一插入为其前后兄弟，居中释放嵌套为其子菜单，拖到区域行移入该区域顶层。')}</p>
    <div className="flex flex-wrap items-center justify-between gap-3">
      {dirty && <span role="status" className="text-2xs font-medium text-warning">{t('有未保存的更改')}</span>}
      <div className="flex flex-wrap items-center gap-2 ms-auto">
        <Button variant="secondary" pending={save.isPending} disabled={pending} onClick={() => setConfirmReset(true)}><RotateCcw size={14} />{t('恢复默认')}</Button>
        <Button pending={save.isPending} disabled={pending} onClick={saveTree}><Save size={14} />{t('保存菜单配置')}</Button>
      </div>
    </div>
    {assigning && config.data && roleList.data && <MenuRolesDialog web={web} node={assigning.node}
      config={{ ...config.data, version: assigning.version }} roles={roleList.data} onClose={() => setAssigning(null)} onSaved={() => { message.success(t('角色已更新')); setAssigning(null); void invalidateAfter(cache, 'roles'); }} />}
    {nodeDialog && <NodeDialog state={nodeDialog} draft={draft} pages={config.data?.pages ?? []}
      onClose={() => setNodeDialog(null)} onSubmit={submitNode} />}
    {moveDialog && <MoveDialog draft={draft} node={nodeIndex(draft.nodes).get(moveDialog)!} onClose={() => setMoveDialog(null)} onConfirm={submitMove} />}
    {deleteNode && <ConfirmDialog title={t('删除菜单节点')} danger confirmLabel={t('删除')} cancelLabel={t('取消')}
      description={t('该节点将从导航移除，其子节点回到所在区域顶层；保存菜单配置后生效。')}
      onConfirm={() => confirmDeleteNode(deleteNode)} onCancel={() => setDeleteNode(null)} />}
    {deleteSection && <ConfirmDialog title={t('删除区域')} danger confirmLabel={t('删除')} cancelLabel={t('取消')}
      description={t('仅可删除空区域；请先移除或移动区域内的节点。')}
      onConfirm={() => confirmDeleteSection(deleteSection)} onCancel={() => setDeleteSection(null)} />}
    {confirmReset && <ConfirmDialog title={t('恢复默认菜单配置')} danger confirmLabel={t('恢复默认')} cancelLabel={t('取消')}
      pending={save.isPending}
      description={t('将清空全部自定义区域与节点，立即恢复注册默认导航树。')}
      onConfirm={submitReset} onCancel={() => setConfirmReset(false)} />}
  </CardContent></Card>;
}

function LoadError({ error, onRetry }: { error: { message: string }; onRetry: () => void }) {
  return <Alert action={<Button variant="secondary" size="sm" onClick={onRetry}>{t('重试')}</Button>}>{t(error.message)}</Alert>;
}

// The shared Switch renders no accessible name of its own; wrap it in a label
// whose text (visible or screen-reader only) names the control.
function LabeledSwitch({ label, checked, onChange, disabled }: { label: string; checked: boolean; onChange: (value: boolean) => void; disabled?: boolean }) {
  return <label className="inline-flex items-center gap-1.5 text-xs text-muted">
    <span>{label}</span>
    <Switch checked={checked} onChange={onChange} disabled={disabled} />
  </label>;
}

function countAll(items: MenuTreeNode[]): number { return items.reduce((sum, item) => sum + 1 + countAll(item.children), 0); }

type TreeRow =
  | { kind: 'section'; section: NavigationSection; count: number; open: boolean }
  | { kind: 'node'; item: MenuTreeNode; depth: number; collapsed: boolean };

type RowHandlers = {
  draft: Draft;
  assignedRoles?: RoleList;
  onAssign?: (id: string) => void;
  onToggleCollapse: (id: string) => void;
  onPatchSection: (id: string, patch: Partial<NavigationSection>) => void;
  onAddChild: (sectionId: string, parentId?: string) => void;
  onEditNode: (key: string) => void; onMoveNode: (key: string) => void; onCopyNode: (key: string) => void;
  onShiftNode: (key: string, direction: -1 | 1) => void;
  onVisibleNode: (key: string, visible: boolean) => void;
  onDeleteNode: (key: string) => void; onDeleteSection: (id: string) => void;
};

type DragProps = {
  dragId: string | null;
  dropHint: { id: string; mode: DropMode } | null;
  onDragStart: (id: string) => void;
  onDragOver: (event: React.DragEvent<HTMLTableRowElement>, target: DropTarget) => void;
  onDrop: (event: React.DragEvent<HTMLTableRowElement>, target: DropTarget) => void;
  onDragEnd: () => void;
};

// The whole page is one tree table: region root rows expand into nested
// directory/page/link/action rows, and every row carries one more-actions
// dropdown in the trailing column. Region rows are drop targets too: a
// subtree released anywhere on one joins that region's top level.
function MenuTreeTable({ rows, searching, handlers, drag }: { rows: TreeRow[]; searching: boolean; handlers: RowHandlers; drag: DragProps }) {
  // The ui Table owns the horizontal scroll; min-w-0 keeps this block shrinkable
  // inside the flex column so the table never widens the document itself.
  return <div className="min-w-0">
    <Table className="max-sm:[&_td]:px-2 max-sm:[&_th]:px-2">
      <TableHeader><TableRow>
        <TableHead>{t('名称')}</TableHead>
        <TableHead className="max-sm:hidden">{t('类型')}</TableHead>
        <TableHead className="max-sm:hidden">{t('目标')}</TableHead>
        <TableHead>{t('排序')}</TableHead>
        <TableHead>{t('显示')}</TableHead>
        <TableHead className="text-end">{t('操作')}</TableHead>
      </TableRow></TableHeader>
      <TableBody>
        {rows.map(row => row.kind === 'section'
          ? <RegionRow key={row.section.id} row={row} handlers={handlers} drag={drag} />
          : <NodeRow key={row.item.node.id} row={row} handlers={handlers} drag={drag} />)}
      </TableBody>
    </Table>
    {!rows.length && <p className="rounded-lg border border-dashed border-line px-3 py-6 text-center text-2xs text-subtle">{t('没有匹配的菜单')}</p>}
    {searching && !!rows.length && <p className="mt-1 text-2xs text-subtle">{t('搜索时自动展开匹配路径')}</p>}
  </div>;
}

function RegionRow({ row, handlers, drag }: { row: Extract<TreeRow, { kind: 'section' }>; handlers: RowHandlers; drag: DragProps }) {
  const { section, count, open } = row;
  // Region rows only receive: a subtree released anywhere on the row joins the
  // region's top level, so the whole row lights up instead of an edge line.
  const dropHint = drag.dragId && drag.dropHint?.id === section.id ? drag.dropHint.mode : null;
  return <TableRow data-region={section.id} aria-label={t(sectionTitle(section))}
    onDragOver={event => drag.onDragOver(event, { kind: 'section', id: section.id })}
    onDrop={event => drag.onDrop(event, { kind: 'section', id: section.id })}
    onDragEnd={drag.onDragEnd}
    className={dropHint ? 'bg-accent/10' : ''}>
    <TableCell>
      <div className="flex items-center gap-2">
        <button type="button" aria-expanded={open} aria-label={t('展开或收起 {{name}}', { name: sectionTitle(section) })}
          onClick={() => handlers.onToggleCollapse(section.id)} className="rounded p-0.5 text-subtle hover:bg-surface-alt hover:text-ink">
          <ChevronRight size={15} className={open ? 'rotate-90' : ''} />
        </button>
        <FolderTree size={15} aria-hidden="true" className="shrink-0 text-muted" />
        <Input className="h-8 w-36" maxLength={40} aria-label={t('区域名称')} placeholder={t(sectionTitle(section))} value={section.name}
          onChange={event => handlers.onPatchSection(section.id, { name: event.target.value })} />
        <span className="rounded-full bg-surface-alt px-1.5 py-0.5 text-2xs tabular-nums text-muted" data-count={section.id}>{count}</span>
      </div>
    </TableCell>
    <TableCell className="max-sm:hidden"><Badge><FolderTree size={11} aria-hidden="true" />{t('区域')}</Badge></TableCell>
    <TableCell className="max-sm:hidden"><span className="text-xs text-subtle">—</span></TableCell>
    <TableCell><Input className="h-8 w-16" type="number" aria-label={t('区域排序')} value={section.sort}
      onChange={event => handlers.onPatchSection(section.id, { sort: Number(event.target.value) || 0 })} /></TableCell>
    <TableCell><div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <LabeledSwitch label={t('显示')} checked={section.visible} onChange={value => handlers.onPatchSection(section.id, { visible: value })} />
      <LabeledSwitch label={t('标题')} checked={section.show_title} onChange={value => handlers.onPatchSection(section.id, { show_title: value })} />
    </div></TableCell>
    <TableCell className="text-end">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label={t('更多操作：{{name}}', { name: sectionTitle(section) })}>
            <MoreHorizontal size={15} aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-40">
          <DropdownMenuItem onSelect={() => handlers.onAddChild(section.id)}>
            <Plus size={13} aria-hidden="true" />{t('添加子菜单')}
          </DropdownMenuItem>
          <DropdownMenuItem disabled={count > 0} onSelect={() => handlers.onDeleteSection(section.id)}>
            <Trash2 size={13} aria-hidden="true" />{t('删除区域')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </TableCell>
  </TableRow>;
}

function NodeRow({ row, handlers, drag }: { row: Extract<TreeRow, { kind: 'node' }>; handlers: RowHandlers; drag: DragProps }) {
  const { item, depth, collapsed } = row;
  const { node } = item;
  const open = !collapsed;
  const hasChildren = item.children.length > 0;
  const Icon = resolveNavigationIcon(node.icon);
  const TypeIcon = TYPE_ICONS[node.type];
  const target = menuNodeTarget(node);
  const dropHint = drag.dragId && drag.dragId !== node.id && drag.dropHint?.id === node.id ? drag.dropHint.mode : null;
  return <TableRow data-node={node.id} data-node-type={node.type} data-section={node.section_id}
    draggable onDragStart={() => drag.onDragStart(node.id)} onDragOver={event => drag.onDragOver(event, { kind: 'node', id: node.id })}
    onDrop={event => drag.onDrop(event, { kind: 'node', id: node.id })} onDragEnd={drag.onDragEnd}
    className={`${drag.dragId === node.id ? 'opacity-40' : ''} ${dropHint === 'before' ? 'border-t-2 border-t-accent' : dropHint === 'after' ? 'border-b-2 border-b-accent' : dropHint === 'inside' ? 'bg-accent/10' : ''}`}>
    <TableCell>
      <div className="flex items-center gap-2" style={{ paddingInlineStart: depth * 16 }}>
        {hasChildren
          ? <button type="button" aria-expanded={open} aria-label={t('展开或收起 {{name}}', { name: menuNodeLabel(node) })}
              onClick={() => handlers.onToggleCollapse(node.id)} className="rounded p-0.5 text-subtle hover:text-ink">
              <ChevronRight size={14} className={open ? 'rotate-90' : ''} />
            </button>
          : <span aria-hidden="true" className="w-[18px] shrink-0" />}
        <Icon size={15} aria-hidden="true" className="shrink-0 text-muted" />
        <span className="min-w-0">
          <span className="break-all font-medium">{menuNodeLabel(node)}</span>
          {handlers.onAssign && <span className="block text-2xs text-muted">{handlers.assignedRoles?.items.filter(role => role.id !== 'super_admin' && role.menu_ids.includes(node.id)).map(role => role.name).join(' · ') || t('未分配角色')}</span>}
        </span>
        {node.badge_dot && <span className="size-2 rounded-full bg-accent" aria-label={t('圆点标记')} />}
        {!node.badge_dot && node.badge_text && <span className="rounded-full bg-surface-alt px-1.5 text-2xs text-muted">{node.badge_text}</span>}
      </div>
    </TableCell>
    <TableCell className="max-sm:hidden"><Badge><TypeIcon size={11} aria-hidden="true" />{t(TYPE_LABELS[node.type])}</Badge></TableCell>
    <TableCell className="max-sm:hidden"><span className="break-all text-xs text-muted">{target || '—'}</span></TableCell>
    <TableCell><span className="inline-flex items-center gap-1 text-xs tabular-nums text-muted">
      <button type="button" aria-label={t('上移 {{name}}', { name: menuNodeLabel(node) })} className="rounded p-0.5 hover:text-ink" onClick={() => handlers.onShiftNode(node.id, -1)}><ArrowUp size={13} /></button>
      {node.sort}
      <button type="button" aria-label={t('下移 {{name}}', { name: menuNodeLabel(node) })} className="rounded p-0.5 hover:text-ink" onClick={() => handlers.onShiftNode(node.id, 1)}><ArrowDown size={13} /></button>
    </span></TableCell>
    <TableCell><label>
      {/* The shared Switch drops extra props, so the row name comes from a visually hidden label. */}
      <span className="sr-only">{t('显示或隐藏 {{name}}', { name: menuNodeLabel(node) })}</span>
      <Switch checked={node.visible} onChange={value => handlers.onVisibleNode(node.id, value)} />
    </label></TableCell>
    <TableCell className="text-end">
      {handlers.onAssign && <Button variant="ghost" size="sm" aria-label={t('分配角色：{{name}}', { name: menuNodeLabel(node) })} onClick={() => handlers.onAssign?.(node.id)}>{t('分配角色')}</Button>}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label={t('更多操作：{{name}}', { name: menuNodeLabel(node) })}>
            <MoreHorizontal size={15} aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-40">
          {/* Every directory, page and link can take sub-menus; the depth cap
              only disables the entry once the row already sits at MAX_DEPTH. */}
          <DropdownMenuItem disabled={depthOf(handlers.draft.nodes, node.id) >= MAX_DEPTH}
            title={depthOf(handlers.draft.nodes, node.id) >= MAX_DEPTH ? t('已达最大层级，无法再嵌套子菜单') : undefined}
            onSelect={() => handlers.onAddChild(node.section_id, node.id)}>
            <Plus size={13} aria-hidden="true" />{t('添加子菜单')}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => handlers.onEditNode(node.id)}><Pencil size={13} aria-hidden="true" />{t('编辑')}</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => handlers.onMoveNode(node.id)}><ListTree size={13} aria-hidden="true" />{t('移动…')}</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => handlers.onCopyNode(node.id)}><Copy size={13} aria-hidden="true" />{t('复制')}</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => handlers.onDeleteNode(node.id)}><Trash2 size={13} aria-hidden="true" />{t('删除')}</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </TableCell>
  </TableRow>;
}

type NodeForm = {
  parentId: string; name: string; icon: string; sort: string; visible: boolean;
  routeId: string; activeMenu: string; url: string; openMode: NavigationNode['open_mode'];
  badgeText: string; badgeColor: string; badgeDot: boolean;
};

// The dialog is the only editor for one layout node: directory, page or link.
// Action nodes are authorization units managed in the role editor, so they
// never open here; their persisted permission and operation grants ride along
// untouched in the draft.
function NodeDialog({ state, draft, pages, onClose, onSubmit }: {
  state: NodeDialogState; draft: Draft; pages: MenuList['pages'];
  onClose: () => void; onSubmit: (node: NavigationNode, isNew: boolean) => void;
}) {
  useLocale();
  const editing = state.mode === 'edit' ? nodeIndex(draft.nodes).get(state.key) : undefined;
  // Create mode picks the type in the dialog itself; edit mode keeps the persisted one.
  const [type, setType] = useState<NavigationNode['type']>(editing ? editing.type : state.mode === 'create' ? state.type : 'page');
  const sections = [...draft.sections].sort((a, b) => a.sort - b.sort || a.id.localeCompare(b.id));
  const height = editing ? heightOf(draft.nodes, editing.id) : 1;
  // Any non-action node (directory, page or link) may parent another
  // non-action node; the subtree's own height keeps the choice inside
  // MAX_DEPTH and a node can never move under its own descendant.
  const parents = draft.nodes.filter(node => node.type !== 'action' && sections.some(section => section.id === node.section_id)
    && (!editing || (!isDescendant(draft.nodes, node.id, editing.id) && node.id !== editing.id))
    && depthOf(draft.nodes, node.id) + height <= MAX_DEPTH);
  const usedRoutes = new Set(draft.nodes.filter(node => node.type === 'page' && node.id !== editing?.id && sections.some(section => section.id === node.section_id)).map(node => node.route_id));
  const routeOptions = (pages.length ? pages.map(page => page.id) : Object.keys(routes).filter(isRegisteredPage))
    .filter(isRegisteredPage).filter(id => !usedRoutes.has(id));
  const parentRefOf = (node: NavigationNode): string => {
    if (!node.parent_id) return `top:${node.section_id}`;
    const parent = nodeIndex(draft.nodes).get(node.parent_id);
    return `${parent?.type ?? 'directory'}:${node.parent_id}`;
  };
  const parentRef = editing ? parentRefOf(editing) : state.mode === 'create' && state.parentId ? `${nodeIndex(draft.nodes).get(state.parentId)?.type ?? 'directory'}:${state.parentId}` : state.mode === 'create' ? `top:${state.sectionId}` : 'top:';
  const [form, setForm] = useState<NodeForm>({
    parentId: parentRef,
    name: editing?.label ?? '',
    icon: editing?.icon ?? typeDefaultIcon(state.mode === 'create' ? state.type : 'page'),
    sort: String(editing?.sort ?? 100),
    visible: editing?.visible ?? true,
    routeId: editing?.route_id ?? '',
    activeMenu: editing?.active_menu ?? '',
    url: editing?.url ?? '',
    openMode: editing?.open_mode ?? 'same_tab',
    badgeText: editing?.badge_text ?? '',
    badgeColor: editing?.badge_color || 'primary',
    badgeDot: editing?.badge_dot ?? false,
  });
  const [errors, setErrors] = useState<{ name?: string; url?: string; route?: string }>({});
  const patch = (value: Partial<NodeForm>) => setForm(current => ({ ...current, ...value }));
  // Parent options: a section top ("作为顶级菜单") or any non-action node,
  // depth-filtered so the moved subtree stays inside MAX_DEPTH.
  const parentOptions = sections.map(section => ({ value: `top:${section.id}`, label: t('顶层 · {{name}}', { name: sectionTitle(section) }) }))
    .concat(parents.map(node => ({ value: `${node.type}:${node.id}`, label: `${'　'.repeat(Math.max(0, depthOf(draft.nodes, node.id) - 1))}${menuNodeLabel(node)}` })));
  if (editing) {
    const current = parentRefOf(editing);
    if (!parentOptions.some(option => option.value === current)) {
      const separator = current.indexOf(':');
      const kind = current.slice(0, separator); const id = current.slice(separator + 1);
      const section = kind === 'top' ? sections.find(item => item.id === id) : undefined;
      const parent = kind !== 'top' ? nodeIndex(draft.nodes).get(id) : undefined;
      parentOptions.unshift({ value: current, label: section ? t('顶层 · {{name}}', { name: sectionTitle(section) }) : parent ? menuNodeLabel(parent) : id });
    }
  }
  const submit = () => {
    const next: typeof errors = {};
    if (!form.name.trim() && type !== 'page') next.name = t('请输入名称');
    if (type === 'page' && !form.routeId) next.route = t('请选择已注册页面');
    if (type === 'link' && !validNavigationUrl(form.url)) next.url = t('链接地址需为站内已注册路径或 http(s) 地址');
    setErrors(next);
    if (Object.keys(next).length) return;
    const parentKind = form.parentId.split(':')[0];
    const parentIdValue = form.parentId.slice(parentKind.length + 1);
    // The chosen parent comes from the picker options, so resolve it against the
    // whole node table; the depth-filtered option list may legitimately omit a
    // node's current parent while it stays the selected value.
    const parentRow = parentKind === 'top' ? undefined : nodeIndex(draft.nodes).get(parentIdValue);
    const sectionId = parentRow?.section_id ?? (parentKind === 'top' ? parentIdValue : sections[0].id);
    const parentId = parentKind === 'top' ? undefined : parentIdValue;
    const node: NavigationNode = editing
      ? { ...editing, section_id: sectionId, parent_id: parentId,
          label: form.name.trim(), icon: form.icon, sort: Number(form.sort) || 0, visible: form.visible,
          url: type === 'link' ? form.url.trim() : editing.url, open_mode: form.openMode,
          active_menu: form.activeMenu || undefined,
          badge_text: form.badgeText.trim(), badge_color: form.badgeDot || form.badgeText.trim() ? form.badgeColor : '', badge_dot: form.badgeDot,
          route_id: type === 'page' ? form.routeId : editing.route_id }
      : { ...newNavigationNode(randomId(draft.nodes.map(item => item.id), type), sectionId, type),
          parent_id: parentId,
          label: form.name.trim(), icon: form.icon, sort: Number(form.sort) || 0, visible: form.visible,
          route_id: type === 'page' ? form.routeId : undefined, url: type === 'link' ? form.url.trim() : undefined,
          open_mode: form.openMode, active_menu: form.activeMenu || undefined,
          badge_text: form.badgeText.trim(), badge_color: form.badgeDot || form.badgeText.trim() ? form.badgeColor : '', badge_dot: form.badgeDot };
    onSubmit(node, !editing);
    onClose();
  };
  return <Modal title={editing ? t('编辑节点') : t('添加{{type}}', { type: t(TYPE_LABELS[type]) })} onClose={onClose} contentClassName="sm:max-w-2xl" className="flex min-h-0 flex-col gap-4">
    {/* Two columns: layout facts on the left, presentation on the right; the
        body scrolls while the action row stays pinned. */}
    <div className="grid min-h-0 gap-x-6 gap-y-3 overflow-y-auto pe-1 md:grid-cols-2">
      <div className="flex min-w-0 flex-col gap-3">
        {!editing && <label className="flex flex-col gap-1 text-xs text-muted">{t('菜单类型')}
          <SimpleSelect label={t('菜单类型')} value={type} onChange={value => { setType(value as NavigationNode['type']); setErrors({}); }}
            options={CREATABLE_TYPES.map(candidate => ({ value: candidate, label: t(TYPE_LABELS[candidate]) }))} />
        </label>}
        <label className="flex flex-col gap-1 text-xs text-muted">{t('显示名称')}
          <Input value={form.name} maxLength={64} autoComplete="off" aria-label={t('显示名称')} placeholder={type === 'page' ? t('留空使用页面默认名称') : t('请输入名称')}
            aria-invalid={!!errors.name || undefined} onChange={event => patch({ name: event.target.value })} />
          {errors.name && <small role="alert" className="text-danger">{errors.name}</small>}
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted">{t('上级菜单')}
          <SimpleSelect label={t('上级菜单')} value={form.parentId} onChange={value => patch({ parentId: value })} options={parentOptions} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted">{t('排序')}
          <Input type="number" aria-label={t('排序')} value={form.sort} onChange={event => patch({ sort: event.target.value })} />
        </label>
        <label className="flex items-center gap-2 text-xs text-muted">{t('在导航中显示')}
          <Switch checked={form.visible} onChange={value => patch({ visible: value })} />
        </label>
        {type !== 'directory' && <label className="flex flex-col gap-1 text-xs text-muted">{t('打开方式')}
          <SimpleSelect label={t('打开方式')} value={form.openMode} onChange={value => patch({ openMode: value as NavigationNode['open_mode'] })}
            options={[{ value: 'same_tab', label: t('当前页') }, { value: 'new_tab', label: t('新标签') }]} />
        </label>}
      </div>
      <div className="flex min-w-0 flex-col gap-3">
        <NavigationIconPicker value={form.icon} onChange={icon => patch({ icon })} />
        {type === 'page' && <label className="flex flex-col gap-1 text-xs text-muted">{t('目标页面（仅已注册路由）')}
          <SimpleSelect label={t('目标页面（仅已注册路由）')} value={form.routeId} placeholder={t('选择页面')}
            onChange={value => patch({ routeId: value })}
            options={routeOptions.map(id => ({ value: id, label: t(routes[id].label) }))} />
          {errors.route && <small role="alert" className="text-danger">{errors.route}</small>}
        </label>}
        {type === 'link' && <label className="flex flex-col gap-1 text-xs text-muted">{t('链接地址')}
          <Input value={form.url} maxLength={2048} inputMode="url" aria-label={t('链接地址')} placeholder="https://example.com/help"
            aria-invalid={!!errors.url || undefined} onChange={event => patch({ url: event.target.value })} />
          {errors.url && <small role="alert" className="text-danger">{errors.url}</small>}
          <small>{t('站内地址需指向已注册页面，不能指向任意文件路径。')}</small>
        </label>}
      </div>
    </div>
    <div className="grid shrink-0 gap-x-6 gap-y-3 border-t border-line pt-3 md:grid-cols-2">
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
    <div className="flex shrink-0 justify-end gap-2 border-t border-line pt-3">
      <Button variant="secondary" onClick={onClose}>{t('取消')}</Button>
      <Button onClick={submit}>{t('确定')}</Button>
    </div>
  </Modal>;
}

function MoveDialog({ draft, node, onClose, onConfirm }: {
  draft: Draft; node: NavigationNode; onClose: () => void;
  onConfirm: (key: string, sectionId: string, parentId?: string) => void;
}) {
  useLocale();
  const sections = [...draft.sections].sort((a, b) => a.sort - b.sort || a.id.localeCompare(b.id));
  const directories = draft.nodes.filter(item => item.type === 'directory' && item.id !== node.id && !isDescendant(draft.nodes, item.id, node.id)
    && sections.some(section => section.id === item.section_id)
    && depthOf(draft.nodes, item.id) + heightOf(draft.nodes, node.id) <= MAX_DEPTH);
  const [value, setValue] = useState(node.parent_id ? `${nodeIndex(draft.nodes).get(node.parent_id)?.type === 'page' ? 'page' : 'dir'}:${node.parent_id}` : `top:${node.section_id}`);
  // Actions always move onto a page row; everything else moves to a section top or a directory.
  const options = node.type === 'action'
    ? draft.nodes.filter(item => item.type === 'page' && item.id !== node.id && sections.some(section => section.id === item.section_id)
        && depthOf(draft.nodes, item.id) + 1 <= MAX_DEPTH)
        .map(item => ({ value: `page:${item.id}`, label: menuNodeLabel(item) }))
    : sections.map(section => ({ value: `top:${section.id}`, label: t('顶层 · {{name}}', { name: sectionTitle(section) }) }))
        .concat(directories.map(item => ({ value: `dir:${item.id}`, label: `${'　'.repeat(Math.max(0, depthOf(draft.nodes, item.id) - 1))}${menuNodeLabel(item)}` })));
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

// The server patches only this membership against the observed role IDs. Other
// role grants/data scopes are read again inside the transaction and preserved.
function MenuRolesDialog({ web, node, config, roles, onClose, onSaved }: {
  web: WebClient; node: NavigationNode; config: MenuList; roles: RoleList; onClose: () => void; onSaved: () => void;
}) {
  const [expected] = useState(() => roles.items.filter(role => role.id !== 'super_admin' && role.menu_ids.includes(node.id)).map(role => role.id));
  const [selected, setSelected] = useState(expected);
  const point = config.pages.find(page => page.id === node.route_id)?.permission;
  const definition = roles.permissions.find(item => item.id === point);
  const reserved = !!definition?.super_admin;
  const cache = useQueryClient();
  const save = useMutation({ mutationFn: () => web.assignMenuRoles(node.id, { version: config.version, expected_role_ids: expected, role_ids: selected }), onSuccess: onSaved, onError: () => { void invalidateAfter(cache, 'roles'); } });
  return <Modal title={t('分配角色：{{name}}', { name: menuNodeLabel(node) })} onClose={onClose} pending={save.isPending}>
    <p className="text-sm text-muted">{t('仅修改当前菜单的角色分配。新增页面包含祖先菜单和浏览接口；取消菜单保留独立按钮与 API 授权。超级管理员始终可见。')}</p>
    {reserved && <p className="text-sm text-muted">{t('仅超级管理员')}</p>}
    {save.error && <p role="alert" className="text-sm text-danger">{t(save.error.message)}</p>}
    <div className="my-4 flex max-h-80 flex-col gap-3 overflow-y-auto" role="group" aria-label={t('角色')}>
      {roles.items.filter(role => role.id !== 'super_admin').map(role => <label key={role.id} className="flex items-center gap-2 text-sm">
        <Checkbox aria-label={role.name} disabled={save.isPending || (!selected.includes(role.id) && (reserved || (role.id === 'user' && !!definition && !definition.assignable)))}
          checked={selected.includes(role.id)} onChange={checked => setSelected(current => checked ? [...current, role.id] : current.filter(id => id !== role.id))} />
        {role.name}
      </label>)}
    </div>
    <div className="flex justify-end gap-2"><Button variant="secondary" disabled={save.isPending} onClick={onClose}>{t('取消')}</Button><Button pending={save.isPending} onClick={() => save.mutate()}>{t('保存')}</Button></div>
  </Modal>;
}

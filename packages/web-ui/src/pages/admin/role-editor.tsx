// Author: yunnuo <ymz@ebox.vip>
// Description: Page-centric grants with safe read defaults, explicit buttons and a complete advanced API selector.
import { useMemo, useState, type ReactNode } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { operations } from '@unicore/sdk';
import { OperationCatalogue } from './api-operations';
import type { NavigationNode, PermissionDefinition, Role, RoleSaveInput, WebClient } from '@unicore/sdk';
import { defineMessages, t, useLocale } from '../../i18n';
import { buildMenuTree, directoryTitle, isRegisteredPage, sectionTitle, type MenuTreeNode } from '../../navigation';
import { routes } from '../../routes';
import { buildDepartmentTree, flattenDepartmentTree, useDepartmentsQuery } from '../../queries';
import { operationPermissionsAllow } from '../../permissions';
import { Alert, Badge, Button, Checkbox, Input, Modal, NativeSelect, useMessage } from '@unicore/ui';

// Data scopes apply to the resource permissions held by each role.
const dataScopeLabels = defineMessages({ self: '仅本人', dept: '本部门', dept_and_below: '本部门及以下', custom: '自定义', all: '全部' });
const DATA_SCOPES = Object.keys(dataScopeLabels) as (keyof typeof dataScopeLabels)[];

export function dataScopeText(role: Pick<Role, 'data_scope' | 'department_ids'>): string {
  // The backend fails closed to self, so unknown values render as self too.
  return role.data_scope === 'custom'
    ? t('自定义 · {{count}} 个部门', { count: role.department_ids?.length ?? 0 })
    : t(dataScopeLabels[role.data_scope] ?? dataScopeLabels.self);
}

// Same display fallback as the navigation projection: the node's own label
// first, then the registered page's route label, then localized directory
// titles for the seeded empty-label directories. Raw ids stay the last resort
// so unnamed nodes in tests and E2E remain locatable.
function nodeLabel(node: NavigationNode): string {
  if (node.label) return t(node.label);
  if (node.route_id && isRegisteredPage(node.route_id)) return t(routes[node.route_id].label);
  if (node.type === 'directory') return t(directoryTitle(node.id));
  return t(node.id);
}

// Reserved metadata is supplied by the backend, including module contributions.
function lockedReason(permission: PermissionDefinition): string | null {
  return permission.super_admin ? t('仅超级管理员') : null;
}

type CatalogOperation = { id: string; uiPage?: string; method: string; path: string; permissions: readonly string[]; permissionMode?: string; identityRealm?: string };
const catalogOperations: CatalogOperation[] = Object.entries(operations)
  .filter(([, op]) => !op.superAdmin && op.permissions.length > 0
    && ['session', 'authenticated', 'platform-session'].includes(op.access)
    && !/\/auth\/|\/account|\/bootstrap$/.test(op.path))
  .map(([id, op]) => ({ id, ...op }));
const operationMeta = (id: string) => catalogOperations.find(op => op.id === id);

const routePermission = (routeId: string | undefined): string | undefined =>
  routeId && isRegisteredPage(routeId) ? (routes[routeId] as { permission?: string }).permission : undefined;

// Submission permissions are one union: manual grants from the advanced
// catalogue plus everything the current selection implies — route points of
// granted pages, points of granted action nodes and of checked API operations.
// The backend stays the enforcement point; this only keeps the payload valid.
function derivePermissions(nodes: NavigationNode[], menus: readonly string[], actions: readonly string[], operationIds: readonly string[], manual: readonly string[]): string[] {
  const byId = new Map(nodes.map(node => [node.id, node]));
  const points = new Set(manual);
  for (const id of menus) { const permission = routePermission(byId.get(id)?.route_id); if (permission) points.add(permission); }
  for (const id of actions) { const permission = byId.get(id)?.permission; if (permission) points.add(permission); }
  for (const id of operationIds) { const op = operationMeta(id); if (op?.permissionMode !== 'any') for (const permission of op?.permissions ?? []) points.add(permission); }
  return [...points];
}

// The payload the current selection saves: the derived point union plus the
// operations and actions it actually legitimizes. Shared by the submit handler
// and the change handlers so the tree never shows a grant the save would
// silently drop — an unchecked operation or revoked point takes its dependent
// buttons with it instead of failing only at submit time.
function effectiveSelection(nodes: NavigationNode[], menus: readonly string[], actions: readonly string[], operationIds: readonly string[], manual: readonly string[]): { permissions: string[]; operations: string[]; actions: string[] } {
  const permissions = derivePermissions(nodes, menus, actions, operationIds, manual);
  const operations = operationIds.filter(id => operationPermissionsAllow(permissions, id));
  const byId = new Map(nodes.map(node => [node.id, node]));
  const granted = new Set(operations);
  return {
    permissions,
    operations,
    actions: actions.filter(id => {
      const node = byId.get(id);
      return !!node?.permission && permissions.includes(node.permission) && node.operation_ids.every(op => granted.has(op));
    }),
  };
}

type ActionGroup = { key: string; label: string; hint: string; ids: string[]; nodes: NavigationNode[] };

// Surface badges: shared nodes authorize once for both workspaces.

export function RoleEditor({ web, realm, role, source, permissions, onClose, onSaved }: {
  web: WebClient; realm: Role['realm']; role?: Role; source?: Role; permissions: PermissionDefinition[]; onClose: () => void; onSaved: () => void;
}) {
  useLocale();
  const message = useMessage();
  // Edits mutate the role itself; copies start from the source's grants but
  // always create a new role, so the strict create-time validation applies.
  const baseline = role ?? source;
  const [name, setName] = useState(role?.name ?? (source ? t('{{name}} 副本', { name: source.name }) : ''));
  const [nameError, setNameError] = useState('');
  const [grants, setGrants] = useState<string[]>(baseline?.permissions ?? []);
  const [dataScope, setDataScope] = useState<Role['data_scope']>(baseline?.data_scope ?? 'self');
  const [departmentIds, setDepartmentIds] = useState<string[]>(baseline?.department_ids ?? []);
  const [menuIds, setMenuIds] = useState<string[]>(baseline?.menu_ids ?? []);
  const [actionIds, setActionIds] = useState<string[]>(baseline?.action_ids ?? []);
  const [operationIds, setOperationIds] = useState<string[]>(baseline?.operation_ids ?? []);
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  const [advanced, setAdvanced] = useState(false);
  const [search, setSearch] = useState('');
  const navigation = useQuery({ queryKey: ['menu-config'], queryFn: () => web.menuConfig() });
  const sections = navigation.data?.sections ?? [];
  const nodes = navigation.data?.nodes ?? [];
  const byId = useMemo(() => new Map(nodes.map(node => [node.id, node])), [nodes]);
  const tree = useMemo(() => buildMenuTree({ sections, nodes }), [sections, nodes]);
  // Derived button nodes ride their owning page: one disclosure per page keeps
  // the tree scannable while the grants stay per action node.
  const actionsByParent = useMemo(() => {
    const map = new Map<string, NavigationNode[]>();
    for (const node of nodes) {
      if (node.type !== 'action' || !node.parent_id) continue;
      const bucket = map.get(node.parent_id) ?? [];
      bucket.push(node);
      map.set(node.parent_id, bucket);
    }
    return map;
  }, [nodes]);
  // Checking a node collects its whole non-action subtree AND its ancestor
  // chain: the navigation projection only renders pages whose ancestors are
  // granted, so a child checked without its directory would stay invisible.
  const descendants = (id: string, seen = new Set<string>()): string[] => {
    if (seen.has(id)) return []; seen.add(id);
    return [id, ...nodes.filter(child => child.parent_id === id && child.type !== 'action').flatMap(child => descendants(child.id, seen))];
  };
  const ancestorsOf = (id: string): string[] => {
    const chain: string[] = [];
    const seen = new Set<string>([id]);
    let cursor = nodes.find(node => node.id === id)?.parent_id;
    while (cursor && !seen.has(cursor)) {
      seen.add(cursor);
      const parent = nodes.find(node => node.id === cursor);
      if (!parent) break;
      if (parent.type !== 'action') chain.push(parent.id);
      cursor = parent.parent_id;
    }
    return chain;
  };
  // Workspace surfaces describe the page, never the role's historical category.
  const pageOperations = (pageId: string): CatalogOperation[] => {
    const page = byId.get(pageId);
    return catalogOperations.filter(op => op.uiPage === page?.route_id
      && (!op.identityRealm || page?.surfaces.includes(op.identityRealm as 'user' | 'administrator')));
  };
  const reservedNode = (node: NavigationNode) => permissions.some(point => point.id === routePermission(node.route_id) && (point.super_admin || (role?.id === 'user' && !point.assignable)));
  const operationLocked = (op: CatalogOperation) => {
    const permittedPoint = (point: string) => permissions.some(definition => definition.id === point && !definition.super_admin && (role?.id !== 'user' || definition.assignable));
    return op.permissionMode === 'any' ? !op.permissions.some(permittedPoint) : !op.permissions.every(permittedPoint);
  };
  const toggleMenu = (node: NavigationNode, checked: boolean) => {
    const ids = [...descendants(node.id), ...(checked ? ancestorsOf(node.id) : [])].filter(id => !checked || !reservedNode(byId.get(id)!));
    setMenuIds(current => checked ? [...new Set([...current, ...ids])] : current.filter(id => !ids.includes(id)));
    // Page selection is read-only by default; writes/buttons are explicit.
    if (checked) {
      const points = derivePermissions(nodes, [...menuIds, ...ids], actionIds, operationIds, grants);
      setOperationIds(current => [...new Set([...current, ...ids.flatMap(id => pageOperations(id).filter(op => op.method === 'GET' && operationPermissionsAllow(points, op.id) && (!op.identityRealm || op.identityRealm === (byId.get(id)?.surfaces.includes('user') ? 'user' : 'administrator'))).map(op => op.id))])]);
    }
  };
  const selectOperations = (next: string[]) => {
    const selection = effectiveSelection(nodes, menuIds, actionIds, next, grants);
    setOperationIds(selection.operations);
    setActionIds(selection.actions);
  };
  const departments = useDepartmentsQuery(web, { enabled: dataScope === 'custom' });
  const departmentItems = flattenDepartmentTree(buildDepartmentTree(departments.data?.items ?? []));
  const groups = useMemo(() => {
    const result: { group: string; items: PermissionDefinition[] }[] = [];
    for (const permission of permissions) {
      const bucket = result.find(entry => entry.group === permission.group);
      if (bucket) bucket.items.push(permission);
      else result.push({ group: permission.group, items: [permission] });
    }
    return result;
  }, [permissions]);
  const effectivePermissions = useMemo(() => derivePermissions(nodes, menuIds, actionIds, operationIds, grants), [nodes, menuIds, actionIds, operationIds, grants]);
  const save = useMutation({
    mutationFn: (input: RoleSaveInput) => (role ? web.updateRole(role.id, input) : web.createRole(input)),
    onSuccess: () => { message.success(t(role ? '角色已更新' : '角色已创建')); onSaved(); },
    onError: error => message.error(t(error.message)),
  });
  const pending = save.isPending;
  const toggle = (id: string, checked: boolean) => {
    setGrants(current => checked ? [...current, id] : current.filter(value => value !== id));
    if (checked) return;
    // Revoke dependants before deriving the remaining union, otherwise the
    // selected API/action would immediately put the point back.
    const nextMenus = menuIds.filter(menu => routePermission(byId.get(menu)?.route_id) !== id);
    const nextActions = actionIds.filter(action => byId.get(action)?.permission !== id);
    const nextOperations = operationIds.filter(operation => {
      const op = operationMeta(operation);
      return op?.permissionMode === 'any'
        ? operationPermissionsAllow(effectivePermissions.filter(point => point !== id), operation)
        : !op?.permissions.includes(id);
    });
    const nextPoints = derivePermissions(nodes, nextMenus, nextActions, nextOperations, grants.filter(value => value !== id)).filter(point => point !== id);
    const selection = effectiveSelection(nodes, nextMenus, nextActions, nextOperations, nextPoints);
    setMenuIds(nextMenus);
    setOperationIds(selection.operations);
    setActionIds(selection.actions);
  };
  const toggleDepartment = (id: string, checked: boolean) => setDepartmentIds(current => checked ? [...current, id] : current.filter(value => value !== id));
  const submit = () => {
    const trimmed = name.trim();
    if (!trimmed) { setNameError(t('请输入角色名称')); return; }
    if (trimmed.length > 80) { setNameError(t('最多 {{count}} 个字符', { count: 80 })); return; }
    setNameError('');
    // Creates carry the editor-fixed realm; updates cannot move a role between realms.
    const { permissions: derived, operations: validOperations, actions: validActions } = effectiveSelection(nodes, menuIds, actionIds, operationIds, grants);
    const authorization = { menu_ids: menuIds, action_ids: validActions, operation_ids: validOperations };
    const input: RoleSaveInput = role ? { name: trimmed, permissions: derived, ...authorization } : { name: trimmed, permissions: derived, realm, ...authorization };
    {
      // Only custom scope keeps an explicit department selection.
      input.data_scope = dataScope;
      input.department_ids = dataScope === 'custom' ? departmentIds : [];
    }
    save.mutate(input);
  };
  const needle = search.trim().toLowerCase();
  // Buttons and linked operations of a page participate in the search haystack
  // so a hit opens the page's detail panel instead of hiding the row.
  const detailHaystack = (parentId: string) => [
    ...(actionsByParent.get(parentId) ?? []).map(node => `${nodeLabel(node)} ${node.permission ?? ''} ${node.operation_ids.join(' ')}`),
    ...pageOperations(parentId).map(op => `${op.id} ${op.method} ${op.path}`),
  ].join(' ').toLowerCase();
  const matches = (node: NavigationNode) => !needle
    || `${nodeLabel(node)} ${node.permission ?? ''} ${node.operation_ids.join(' ')}`.toLowerCase().includes(needle)
    || detailHaystack(node.id).includes(needle);
  // While searching, ancestors of a match stay visible so hits keep context;
  // matching parents keep all of their children as plain context.
  const filterTree = (items: MenuTreeNode[]): MenuTreeNode[] | null => {
    const kept: MenuTreeNode[] = [];
    for (const item of items) {
      const children = filterTree(item.children.filter(child => child.node.type !== 'action'));
      if (matches(item.node) || children) kept.push(children ? { node: item.node, children } : item);
    }
    return kept.length ? kept : null;
  };
  const actionGroups = (parentId: string): ActionGroup[] => {
    const result: ActionGroup[] = [];
    for (const node of actionsByParent.get(parentId) ?? []) {
      const branch = node.operation_ids.some(id => operationMeta(id)?.permissionMode === 'any') ? permissions.find(point => point.id === node.permission) : undefined;
      const title = branch ? `${nodeLabel(node)} · ${t(branch.name)}` : nodeLabel(node);
      const managementVariant = byId.get(parentId)?.surfaces.includes('user') && node.operation_ids.length > 0 && node.operation_ids.every(id => operationMeta(id)?.identityRealm === 'administrator');
      const label = managementVariant ? t('{{name}} · 管理工作台', { name: title }) : title;
      const bucket = result.find(item => item.label === label);
      if (bucket) {
        bucket.ids.push(node.id);
        bucket.nodes.push(node);
        if (node.permission && !bucket.hint.includes(node.permission)) bucket.hint = `${bucket.hint} / ${node.permission}`;
        for (const operation of node.operation_ids) if (!bucket.hint.includes(operation)) bucket.hint = `${bucket.hint} · ${operation}`;
      } else {
        result.push({ key: node.id, label, hint: [node.permission, ...node.operation_ids].filter(Boolean).join(' · '), ids: [node.id], nodes: [node] });
      }
    }
    return result;
  };
  const actionLocked = (node: NavigationNode) => !node.permission || permissions.some(point => point.id === node.permission && (point.super_admin || (role?.id === 'user' && !point.assignable)));
  const renderRow = (item: MenuTreeNode, depth: number): ReactNode => {
    const { node } = item;
    const menuChildren = item.children.filter(child => child.node.type !== 'action');
    const groups = actionGroups(node.id);
    const pageOps = node.type === 'page' ? pageOperations(node.id) : [];
    const hasChildren = menuChildren.length > 0;
    const hasDetail = groups.length > 0 || pageOps.length > 0;
    const detailOpen = (!!needle && (groups.some(group => `${group.label} ${group.hint}`.toLowerCase().includes(needle)) || pageOps.some(op => `${op.id} ${op.method} ${op.path}`.toLowerCase().includes(needle)))) || expanded.has(node.id);
    const open = hasChildren ? !collapsed.has(node.id) : detailOpen;
    // Implied permission points: the page's route point once granted plus the
    // points of every checked action and operation underneath it.
    const implied: string[] = [];
    const imply = (point?: string) => { if (point && !implied.includes(point)) implied.push(point); };
    if (menuIds.includes(node.id)) imply(routePermission(node.route_id));
    for (const group of groups) for (const action of group.nodes) if (actionIds.includes(action.id)) imply(action.permission);
    for (const op of pageOps) if (operationIds.includes(op.id)) for (const point of op.permissions) imply(point);
    return <div key={node.id} className="flex flex-col">
      <div className="flex h-8 items-center gap-1.5 rounded-md px-1 hover:bg-surface-alt" style={{ paddingInlineStart: `${depth * 16}px` }}>
        {hasChildren || hasDetail
          ? <Button variant="ghost" size="icon" className="size-5 shrink-0" aria-label={t('展开或收起 {{name}}', { name: nodeLabel(node) })} aria-expanded={open} disabled={pending}
              onClick={() => {
                if (hasChildren) setCollapsed(current => { const next = new Set(current); if (next.has(node.id)) next.delete(node.id); else next.add(node.id); return next; });
                if (hasDetail) setExpanded(current => { const next = new Set(current); if (next.has(node.id)) next.delete(node.id); else next.add(node.id); return next; });
              }}>
              {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
            </Button>
          : <span className="size-5 shrink-0" aria-hidden="true" />}
        <Checkbox aria-label={nodeLabel(node)} disabled={pending || node.disabled || (!menuIds.includes(node.id) && reservedNode(node))}
          checked={(() => { const ids = descendants(node.id); const selected = ids.filter(id => menuIds.includes(id)).length; return selected === ids.length ? true : selected ? 'indeterminate' : false; })()}
          onChange={checked => toggleMenu(node, checked)} />
        <span className="min-w-0 truncate text-sm text-ink">{nodeLabel(node)}</span>
      </div>
      {hasDetail && detailOpen && <div className="flex flex-col gap-1 pb-1" style={{ paddingInlineStart: `${(depth + 1) * 16 + 20}px` }}>
        {groups.map(group => {
          const selected = group.ids.filter(id => actionIds.includes(id)).length;
          return <label key={group.key} className="flex h-7 items-center gap-2 rounded-md px-1 hover:bg-surface-alt" title={group.hint}>
            <Checkbox aria-label={group.label} disabled={pending || group.nodes.some(node => node.disabled) || (!selected && group.nodes.some(node => actionLocked(node)))}
              checked={selected === group.ids.length ? true : selected ? 'indeterminate' : false}
              onChange={checked => {
                setActionIds(current => checked ? [...new Set([...current, ...group.ids])] : current.filter(id => !group.ids.includes(id)));
                if (checked) {
                  setGrants(current => [...new Set([...current, ...group.nodes.flatMap(node => node.permission ? [node.permission] : [])])]);
                  setOperationIds(current => [...new Set([...current, ...group.nodes.flatMap(node => node.operation_ids)])]);
                }
              }} />
            <span className="min-w-0 truncate text-sm text-ink">{group.label}</span>
            {group.ids.length > 1 && <span className="shrink-0 text-2xs text-subtle">×{group.ids.length}</span>}
          </label>;
        })}
        {pageOps.length > 0 && <div className="flex flex-col gap-0.5">
          <small className="px-1 text-2xs font-medium text-subtle">{t('API 操作')}</small>
          {pageOps.map(op => <label key={op.id} className="flex h-7 items-center gap-2 rounded-md px-1 hover:bg-surface-alt" title={`${op.method} ${op.path} · ${op.permissions.join(', ')}`}>
            <Checkbox aria-label={op.id} disabled={pending || (!operationIds.includes(op.id) && (operationLocked(op) || (op.permissionMode === 'any' && !operationPermissionsAllow(effectivePermissions, op.id))))} checked={operationIds.includes(op.id)}
              onChange={checked => {
                // Unchecking an operation stops its buttons from riding along:
                // the visible tree keeps matching what the save will keep.
                const nextOperations = checked ? [...new Set([...operationIds, op.id])] : operationIds.filter(id => id !== op.id);
                const selection = effectiveSelection(nodes, menuIds, actionIds, nextOperations, grants);
                setOperationIds(nextOperations);
                setActionIds(selection.actions);
              }} />
            <code className="min-w-0 truncate text-xs text-muted">{op.id}</code>
          </label>)}
        </div>}
        {implied.length > 0 && <div className="flex flex-wrap items-center gap-1 px-1">
          <small className="text-2xs text-subtle">{t('权限点')}</small>
          {implied.map(point => {
            const definition = permissions.find(item => item.id === point);
            return <Badge key={point} variant="subtle" title={point}>{definition ? t(definition.name) : point}</Badge>;
          })}
        </div>}
      </div>}
      {!collapsed.has(node.id) && hasChildren && menuChildren.map(child => renderRow(child, depth + 1))}
    </div>;
  };
  return <Modal title={t(role ? '编辑角色' : '新建角色')} onClose={onClose} pending={pending}
    className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden pe-0" contentClassName="h-[85dvh] max-w-6xl overflow-hidden">
    <form className="flex min-h-0 flex-1 flex-col gap-3" onSubmit={event => { event.preventDefault(); submit(); }}>
      {/* Guarded saves (403 PERMISSION_DENIED, version conflicts) render inside
        * the dialog: the modal marks outside toasts aria-hidden, so an inline
        * alert is the only reliably reachable feedback while editing. */}
      {save.error && <Alert>{t(save.error.message)}</Alert>}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center gap-3">
          <label htmlFor="role-editor-name" className="w-16 shrink-0 text-sm font-medium text-ink">{t('角色名称')}</label>
          <Input id="role-editor-name" required maxLength={80} autoComplete="off" value={name} aria-invalid={!!nameError} className="max-w-sm"
            disabled={pending || !!role?.builtin} placeholder={t('例如 运营')}
            onChange={event => { setName(event.target.value); setNameError(''); }} />
          {nameError && <p role="alert" className="text-xs text-danger">{nameError}</p>}
        </div>
        <p className="text-xs text-muted">
          {role?.builtin && <>{t('内置角色名称固定，仅可调整权限范围。')} </>}
          {t('勾选页面默认授予浏览接口；写入操作需单独勾选按钮或 API。取消菜单或按钮不撤销独立 API 授权。')}
        </p>
      </div>
      <fieldset disabled={pending} className="flex min-w-0 flex-col gap-1.5">
        <div className="flex items-center gap-3">
          <span className="w-16 shrink-0 text-sm font-medium text-ink">{t('数据范围')}</span>
          <NativeSelect aria-label={t('数据范围')} className="max-w-44" value={dataScope} onChange={event => setDataScope(event.target.value as Role['data_scope'])}>
            {DATA_SCOPES.map(scope => <option key={scope} value={scope}>{t(dataScopeLabels[scope])}</option>)}
          </NativeSelect>
          <small className="min-w-0 text-xs text-muted">{t('数据范围决定角色成员在笔记、文件等业务列表中能看到的数据。')}</small>
        </div>
        {dataScope === 'custom' && <div className="flex flex-col gap-1.5">
          <small className="text-xs text-muted">{t('勾选自定义范围包含的部门：')}</small>
          <div role="group" aria-label={t('自定义部门范围')} className="flex max-h-48 flex-col gap-1 overflow-y-auto rounded-lg border border-line p-3">
            {departmentItems.length
              ? departmentItems.map(({ department, depth }) => <label key={department.id} className="flex items-center gap-2 text-sm" style={{ paddingInlineStart: `${depth * 16}px` }}>
                  <Checkbox aria-label={department.name} checked={departmentIds.includes(department.id)}
                    onChange={checked => toggleDepartment(department.id, checked)} />
                  <span className="text-ink">{department.name}</span>
                </label>)
              : <p className="py-2 text-center text-xs text-muted">{t('部门目录加载中…')}</p>}
          </div>
        </div>}
      </fieldset>
      <Input aria-label={t('搜索菜单或按钮')} placeholder={t('搜索菜单或按钮')} autoComplete="off" value={search} disabled={pending} onChange={event => setSearch(event.target.value)} />
      {navigation.isError && <p role="alert" className="text-sm text-danger">{t(navigation.error.message)} <Button variant="secondary" onClick={() => void navigation.refetch()}>{t('重试')}</Button></p>}
      {/* pe-4 keeps the per-row actions and section counts clear of the
        * overlay scrollbar, which floats above content on macOS instead of
        * reserving a gutter like classic scrollbars do. */}
      <div className="min-h-0 flex-1 overflow-y-auto pe-4">
        <div className="flex flex-col gap-4">
          {tree.map(({ section, children }) => {
            const label = t(sectionTitle(section));
            const visible = needle ? filterTree(children) : children;
            const menuable = nodes.filter(node => node.section_id === section.id && node.type !== 'action');
            const selected = menuable.filter(node => menuIds.includes(node.id)).length;
            return <section key={section.id} aria-label={label} className="flex flex-col gap-1">
              <div className="flex items-center gap-2 border-b border-line pb-1.5">
                <h3 className="text-sm font-medium text-ink">{label}</h3>
                <small className="ms-auto text-xs text-subtle">{t('已选 {{count}}', { count: selected })}</small>
              </div>
              {visible
                ? visible.map(item => renderRow(item, 0))
                : <p className="py-2 text-xs text-muted">{navigation.isPending ? t('正在加载…') : t('没有匹配的菜单')}</p>}
            </section>;
          })}
          {!sections.length && <p className="text-xs text-muted">{navigation.isPending ? t('正在加载…') : t('没有可授权的菜单')}</p>}
        </div>
        {/* The advanced catalogue stays collapsed: page-centric authorization
          * covers most roles, while pure-API roles still grant raw points. */}
        <fieldset disabled={pending} className="mt-4 flex flex-col gap-2 border-t border-line pt-3">
          <button type="button" aria-expanded={advanced} className="flex items-center gap-1 self-start rounded-md px-1 py-0.5 text-sm font-medium text-ink hover:bg-surface-alt"
            onClick={() => setAdvanced(value => !value)}>
            {advanced ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            {t('高级')}
            <small className="text-xs font-normal text-subtle">{t('已选 {{count}}', { count: grants.length })}</small>
          </button>
          {advanced && <>
            <h3 className="text-sm font-medium text-ink">{t('API 授权')}</h3>
            <OperationCatalogue web={web} selected={operationIds} onChange={selectOperations} permissions={effectivePermissions} disabled={pending} businessOnly={role?.id === 'user'} assignablePermissions={permissions.filter(point => point.assignable).map(point => point.id)} />
            <small className="text-xs text-muted">{t('选择 API 自动补齐全部匹配所需的权限点；任一匹配的 API 请先选择一个权限点。菜单、按钮与 API 可独立撤销。')}</small>
            <div role="group" aria-label={t('权限点')} className="flex max-h-72 flex-col gap-4 overflow-y-auto rounded-lg border border-line p-3 pe-4">
              {groups.map(group => <section key={group.group} className="flex flex-col gap-2">
                <h3 className="text-xs font-semibold text-muted">{t(group.group)}</h3>
                {group.items.map(permission => {
                  const locked = role?.id === 'user' && !permission.assignable ? t('仅业务权限') : lockedReason(permission);
                  return locked
                    ? <div key={permission.id} className="flex items-start justify-between gap-2 rounded-md bg-surface-alt px-2 py-1.5 text-sm">
                        <span className="min-w-0">
                          <span className="block font-medium text-muted">{t(permission.name)}</span>
                          <small className="text-2xs text-subtle">{t(permission.description)}</small>
                        </span>
                        <Badge variant="subtle">{locked}</Badge>
                      </div>
                    : <label key={permission.id} className="flex items-start gap-2 text-sm">
                        <Checkbox className="mt-0.5" aria-label={t(permission.name)} checked={effectivePermissions.includes(permission.id)}
                          onChange={checked => toggle(permission.id, checked)} />
                        <span className="flex min-w-0 flex-col">
                          <span className="font-medium text-ink">{t(permission.name)}</span>
                          <small className="text-2xs text-muted">{t(permission.description)}</small>
                        </span>
                      </label>;
                })}
              </section>)}
              {!groups.length && <p className="py-2 text-center text-xs text-muted">{t('权限目录加载中…')}</p>}
            </div>
          </>}
        </fieldset>
      </div>
      <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line pt-3">
        <Button variant="secondary" disabled={pending} onClick={onClose}>{t('取消')}</Button>
        <Button type="submit" pending={pending} disabled={navigation.isPending || navigation.isError}>{pending ? t('处理中…') : t('保存')}</Button>
      </div>
    </form>
  </Modal>;
}

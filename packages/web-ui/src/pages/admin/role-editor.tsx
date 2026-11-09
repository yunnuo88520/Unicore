// Author: yunnuo <ymz@ebox.vip>
// Description: Tabbed role editor: a collapsible menu tree with per-page button groups, the API operation catalogue and the permission-point/data-scope matrix in one large dialog.
import { useMemo, useState, type ReactNode } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { ChevronDown, ChevronRight } from 'lucide-react';
import type { NavigationNode, PermissionDefinition, Role, RoleSaveInput, WebClient } from '@unicore/sdk';
import { defineMessages, t, useLocale } from '../../i18n';
import { buildMenuTree, directoryTitle, isRegisteredPage, sectionTitle, type MenuTreeNode } from '../../navigation';
import { routes } from '../../routes';
import { buildDepartmentTree, flattenDepartmentTree, useDepartmentsQuery } from '../../queries';
import { operationPermissionsAllow } from '../../permissions';
import { Badge, Button, Checkbox, Input, Modal, NativeSelect, Tabs, useMessage } from '@unicore/ui';
import { OperationCatalogue } from './api-operations';

// Data scopes gate the business lists (notes, files) per member; administrator
// roles stay self-scoped server-side, so the editor only exposes user realms.
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

// The server policy layer stays authoritative; this mirror only drives which
// points the matrix keeps out of custom administrator-realm roles. Menu and
// dictionary management are regular grants, not super_admin-exclusive ones.
const SUPER_ONLY_PERMISSIONS: ReadonlySet<string> = new Set(['roles:write', 'administrators:read', 'administrators:create', 'administrators:update', 'settings:write', 'updates:apply', 'storage:write']);

// User-realm custom roles hold assignable business grants only; administrator-
// realm custom roles hold every catalogue point except the super-only ones.
function lockedReason(permission: PermissionDefinition): string | null {
  return SUPER_ONLY_PERMISSIONS.has(permission.id) ? t('仅超级管理员') : null;
}

type EditorTab = 'menus' | 'api' | 'points';
type ActionGroup = { key: string; label: string; hint: string; ids: string[]; nodes: NavigationNode[] };
const sameSet = (a: readonly string[], b: readonly string[]) => a.length === b.length && new Set([...a, ...b]).size === new Set(a).size;

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
  const [activeTab, setActiveTab] = useState<EditorTab>('menus');
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
  const [openButtons, setOpenButtons] = useState<ReadonlySet<string>>(new Set());
  const [search, setSearch] = useState('');
  const navigation = useQuery({ queryKey: ['menu-config'], queryFn: () => web.menuConfig() });
  const sections = navigation.data?.sections ?? [];
  const nodes = navigation.data?.nodes ?? [];
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
  const toggleAuthorization = (current: string[], id: string, checked: boolean) => checked ? [...new Set([...current, id])] : current.filter(value => value !== id);
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
  const toggleMenu = (node: NavigationNode, checked: boolean) => setMenuIds(current => {
    const ids = [...descendants(node.id), ...(checked ? ancestorsOf(node.id) : [])];
    return checked ? [...new Set([...current, ...ids])] : current.filter(id => !ids.includes(id));
  });
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
  const save = useMutation({
    mutationFn: (input: RoleSaveInput) => (role ? web.updateRole(role.id, input) : web.createRole(input)),
    onSuccess: () => { message.success(t(role ? '角色已更新' : '角色已创建')); onSaved(); },
    onError: error => message.error(t(error.message)),
  });
  const pending = save.isPending;
  const toggle = (id: string, checked: boolean) => setGrants(current => checked ? [...current, id] : current.filter(value => value !== id));
  const toggleDepartment = (id: string, checked: boolean) => setDepartmentIds(current => checked ? [...current, id] : current.filter(value => value !== id));
  const submit = () => {
    const trimmed = name.trim();
    if (!trimmed) { setNameError(t('请输入角色名称')); return; }
    if (trimmed.length > 80) { setNameError(t('最多 {{count}} 个字符', { count: 80 })); return; }
    setNameError('');
    // Creates carry the tab-fixed realm; updates cannot move a role between realms.
    const validOperations = operationIds.filter(id => operationPermissionsAllow(grants, id));
    const validActions = actionIds.filter(id => nodes.some(node => node.id === id && node.permission && grants.includes(node.permission) && node.operation_ids.every(op => validOperations.includes(op))));
    const authorization = { menu_ids: menuIds, action_ids: validActions, operation_ids: validOperations };
    const input: RoleSaveInput = role ? { name: trimmed, permissions: grants, ...authorization } : { name: trimmed, permissions: grants, realm, ...authorization };
    {
      // Administrator roles stay self-scoped server-side; user roles carry the
      // chosen scope, and only the custom scope keeps a department selection.
      input.data_scope = dataScope;
      input.department_ids = dataScope === 'custom' ? departmentIds : [];
    }
    save.mutate(input);
  };
  // Dirty dots mirror unsaved changes per tab so an operator can see which
  // authorization faces differ from the persisted (or copied) baseline.
  const base = baseline ?? { permissions: [], data_scope: 'self' as Role['data_scope'], department_ids: [], menu_ids: [], action_ids: [], operation_ids: [] };
  const tabItems = [
    { id: 'menus', label: t('菜单与按钮'), dirty: !sameSet(menuIds, base.menu_ids) || !sameSet(actionIds, base.action_ids) },
    { id: 'api', label: t('API 授权'), dirty: !sameSet(operationIds, base.operation_ids) },
    { id: 'points', label: t('权限点与数据范围'), dirty: !sameSet(grants, base.permissions) || dataScope !== base.data_scope || !sameSet(departmentIds, base.department_ids) },
  ];
  const needle = search.trim().toLowerCase();
  // Buttons of a page participate in the search haystack so a hit on an
  // operation id opens its page's button group instead of hiding the row.
  const buttonHaystack = (parentId: string) => (actionsByParent.get(parentId) ?? [])
    .map(node => `${nodeLabel(node)} ${node.permission ?? ''} ${node.operation_ids.join(' ')}`).join(' ').toLowerCase();
  const matches = (node: NavigationNode) => !needle
    || `${nodeLabel(node)} ${(node.permission ?? '')} ${node.operation_ids.join(' ')}`.toLowerCase().includes(needle)
    || (node.type !== 'action' && buttonHaystack(node.id).includes(needle));
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
      const label = nodeLabel(node);
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
  const actionLocked = (node: NavigationNode) => !actionIds.includes(node.id) && (!node.permission || !grants.includes(node.permission) || !node.operation_ids.every(op => operationIds.includes(op)));
  const renderRow = (item: MenuTreeNode, depth: number): ReactNode => {
    const { node } = item;
    const menuChildren = item.children.filter(child => child.node.type !== 'action');
    const buttonGroups = actionGroups(node.id);
    const buttonIds = buttonGroups.flatMap(group => group.ids);
    const grantedButtons = buttonIds.filter(id => actionIds.includes(id)).length;
    const buttonsOpen = (!!needle && buttonGroups.some(group => `${group.label} ${group.hint}`.toLowerCase().includes(needle))) || openButtons.has(node.id);
    return <div key={node.id} className="flex flex-col">
      <div className="flex h-8 items-center gap-1.5 rounded-md px-1 hover:bg-surface-alt" style={{ paddingInlineStart: `${depth * 16}px` }}>
        {menuChildren.length
          ? <Button variant="ghost" size="icon" className="size-5 shrink-0" aria-label={t('展开或收起 {{name}}', { name: nodeLabel(node) })} aria-expanded={!collapsed.has(node.id)} disabled={pending}
              onClick={() => setCollapsed(current => { const next = new Set(current); if (next.has(node.id)) next.delete(node.id); else next.add(node.id); return next; })}>
              {collapsed.has(node.id) ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
            </Button>
          : <span className="size-5 shrink-0" aria-hidden="true" />}
        <Checkbox aria-label={nodeLabel(node)} disabled={pending || node.disabled}
          checked={(() => { const ids = descendants(node.id); const selected = ids.filter(id => menuIds.includes(id)).length; return selected === ids.length ? true : selected ? 'indeterminate' : false; })()}
          onChange={checked => toggleMenu(node, checked)} />
        <span className="min-w-0 truncate text-sm text-ink">{nodeLabel(node)}</span>
        {buttonGroups.length > 0 && <button type="button" disabled={pending}
          className="ms-auto shrink-0 text-xs font-medium text-accent underline-offset-2 hover:underline disabled:opacity-55"
          aria-label={t('{{name}} 的按钮', { name: nodeLabel(node) })} aria-expanded={buttonsOpen}
          onClick={() => setOpenButtons(current => { const next = new Set(current); if (next.has(node.id)) next.delete(node.id); else next.add(node.id); return next; })}>
          {t('按钮 {{granted}}/{{total}}', { granted: grantedButtons, total: buttonIds.length })}
        </button>}
      </div>
      {buttonsOpen && buttonGroups.length > 0 && <div className="flex flex-col gap-0.5 pb-1" style={{ paddingInlineStart: `${(depth + 1) * 16 + 20}px` }}>
        {buttonGroups.map(group => {
          const selected = group.ids.filter(id => actionIds.includes(id)).length;
          return <label key={group.key} className="flex h-7 items-center gap-2 rounded-md px-1 hover:bg-surface-alt" title={group.hint}>
            <Checkbox aria-label={group.label} disabled={pending || group.nodes.some(node => node.disabled) || (!selected && group.nodes.some(node => actionLocked(node)))}
              checked={selected === group.ids.length ? true : selected ? 'indeterminate' : false}
              onChange={checked => setActionIds(current => checked ? [...new Set([...current, ...group.ids])] : current.filter(id => !group.ids.includes(id)))} />
            <span className="min-w-0 truncate text-sm text-ink">{group.label}</span>
            {group.ids.length > 1 && <span className="shrink-0 text-2xs text-subtle">×{group.ids.length}</span>}
          </label>;
        })}
      </div>}
      {!collapsed.has(node.id) && menuChildren.length > 0 && menuChildren.map(child => renderRow(child, depth + 1))}
    </div>;
  };
  return <Modal title={t(role ? '编辑角色' : '新建角色')} onClose={onClose} pending={pending}
    className="flex min-h-0 flex-1 flex-col gap-3" contentClassName="h-[85dvh] max-w-6xl overflow-hidden">
    <form className="flex min-h-0 flex-1 flex-col gap-3" onSubmit={event => { event.preventDefault(); submit(); }}>
      {/* Guarded saves (403 PERMISSION_DENIED, version conflicts) render inside
        * the dialog: the modal marks outside toasts aria-hidden, so an inline
        * alert is the only reliably reachable feedback while editing. */}
      {save.error && <p role="alert" className="rounded-md border border-danger-line bg-danger-soft px-3 py-2 text-sm text-danger">{t(save.error.message)}</p>}
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
          {t('未勾选表示不授权；菜单、按钮和 API 分别保存，业务权限始终作为访问上界。')}
        </p>
      </div>
      <Tabs id="role-editor-tabs" label={t('角色授权分区')} items={tabItems} value={activeTab} onChange={value => setActiveTab(value as EditorTab)} />
      {/* pe-4 keeps the per-row actions and section counts clear of the
        * overlay scrollbar, which floats above content on macOS instead of
        * reserving a gutter like classic scrollbars do. */}
      <div className="min-h-0 flex-1 overflow-y-auto pe-4">
        <div role="tabpanel" id="role-editor-tabs-panel-menus" aria-labelledby="role-editor-tabs-tab-menus" hidden={activeTab !== 'menus'} className="flex flex-col gap-4">
          <Input aria-label={t('搜索菜单或按钮')} placeholder={t('搜索菜单或按钮')} autoComplete="off" value={search} disabled={pending} onChange={event => setSearch(event.target.value)} />
          {navigation.isError && <p role="alert" className="text-sm text-danger">{t(navigation.error.message)} <Button variant="secondary" onClick={() => void navigation.refetch()}>{t('重试')}</Button></p>}
          {tree.map(({ section, children }) => {
            const label = `${t(section.surface === 'administrator' ? '管理端' : '用户端')} · ${t(sectionTitle(section))}`;
            const visible = needle ? filterTree(children) : children;
            const menuable = nodes.filter(node => node.section_id === section.id && node.type !== 'action');
            const selected = menuable.filter(node => menuIds.includes(node.id)).length;
            return <section key={section.id} aria-label={label} className="flex flex-col gap-1">
              <div className="flex items-center justify-between gap-2 border-b border-line pb-1.5">
                <h3 className="text-sm font-medium text-ink">{label}</h3>
                <small className="text-xs text-subtle">{t('已选 {{selected}}/{{total}}', { selected, total: menuable.length })}</small>
              </div>
              {visible
                ? visible.map(item => renderRow(item, 0))
                : <p className="py-2 text-xs text-muted">{navigation.isPending ? t('正在加载…') : t('没有匹配的菜单')}</p>}
            </section>;
          })}
          {!sections.length && <p className="text-xs text-muted">{navigation.isPending ? t('正在加载…') : t('没有可授权的菜单')}</p>}
        </div>
        <div role="tabpanel" id="role-editor-tabs-panel-api" aria-labelledby="role-editor-tabs-tab-api" hidden={activeTab !== 'api'} className="flex flex-col gap-2">
          <p className="text-xs text-muted">{t('已授权 {{count}} 个 API 操作。', { count: operationIds.length })}</p>
          <OperationCatalogue web={web} permissions={grants} selected={operationIds} onChange={setOperationIds} disabled={pending} />
        </div>
        <div role="tabpanel" id="role-editor-tabs-panel-points" aria-labelledby="role-editor-tabs-tab-points" hidden={activeTab !== 'points'} className="flex flex-col gap-4">
          <fieldset disabled={pending} className="flex min-w-0 flex-col gap-1.5">
            <span className="text-sm font-medium text-ink">{t('数据范围')}</span>
            <NativeSelect aria-label={t('数据范围')} className="max-w-sm" value={dataScope} onChange={event => setDataScope(event.target.value as Role['data_scope'])}>
              {DATA_SCOPES.map(scope => <option key={scope} value={scope}>{t(dataScopeLabels[scope])}</option>)}
            </NativeSelect>
            <small className="text-xs text-muted">{t('数据范围决定角色成员在笔记、文件等业务列表中能看到的数据。')}</small>
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
          <fieldset disabled={pending} className="flex min-w-0 flex-col gap-1.5">
            <span className="text-sm font-medium text-ink">{t('权限点')}</span>
            <div className="flex max-h-72 flex-col gap-4 overflow-y-auto rounded-lg border border-line p-3 pe-4" aria-label={t('权限点')}>
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
                        <Checkbox className="mt-0.5" aria-label={t(permission.name)} checked={grants.includes(permission.id)}
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
          </fieldset>
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line pt-3">
        <Button variant="secondary" disabled={pending} onClick={onClose}>{t('取消')}</Button>
        <Button type="submit" pending={pending}>{pending ? t('处理中…') : t('保存')}</Button>
      </div>
    </form>
  </Modal>;
}

// Author: yunnuo <ymz@ebox.vip>
// Description: Central mutation-to-resource invalidation, shared query hooks and department tree helpers; identity changes belong to SessionBoundary.
import { useQuery } from '@tanstack/react-query';
import type { QueryClient } from '@tanstack/react-query';
import type { Department, WebClient } from '@unicore/sdk';
const affected = {
 branding: ['branding', 'bootstrap', 'mail-templates'],
  users: ['users', 'posts', 'roles', 'role-options', 'user-role-options', 'admin-role-options', 'administrators', 'bootstrap'],
  roles: ['roles', 'menu-config', 'role-options', 'user-role-options', 'admin-role-options', 'users', 'administrators', 'bootstrap', 'notes', 'files', 'note-files'],
  departments: ['departments', 'roles', 'users', 'bootstrap', 'notes', 'files', 'note-files'],
  posts: ['posts', 'users', 'bootstrap'],
  settings: ['persistent-settings', 'bootstrap', 'auth-policy', 'oidc-public', 'oidc-account', 'oidc-settings', 'mail-policy', 'mail-templates'],
} as const;
export function invalidateAfter(client: QueryClient, mutation: keyof typeof affected) {
  return Promise.all(affected[mutation].map(key => client.invalidateQueries({ queryKey: [key] })));
}

// Departments feed the tree console, user forms and role data scopes; one
// cached query key keeps every consumer on the same projection.
export function useDepartmentsQuery(web: WebClient | undefined, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ['departments'],
    queryFn: () => web!.listDepartments(),
    enabled: !!web && (options?.enabled ?? true),
  });
}

export function usePostsQuery(web: WebClient | undefined, options?: { enabled?: boolean }) {
  return useQuery({ queryKey: ['posts'], queryFn: () => web!.listPosts(), enabled: !!web && (options?.enabled ?? true) });
}

export type DepartmentNode = Department & { children: DepartmentNode[] };

/** Build the ordered tree: siblings sort by sort, then name, then id so ties stay deterministic. */
export function buildDepartmentTree(items: readonly Department[]): DepartmentNode[] {
  const nodes = new Map<string, DepartmentNode>();
  for (const item of items) nodes.set(item.id, { ...item, children: [] });
  const roots: DepartmentNode[] = [];
  for (const node of nodes.values()) {
    const parent = node.parent_id ? nodes.get(node.parent_id) : undefined;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }
  const order = (list: DepartmentNode[]) => {
    list.sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
    for (const node of list) order(node.children);
  };
  order(roots);
  // Orphaned parents (deleted mid-flight) already surface as roots above.
  return roots;
}

/** Depth-first flatten of the ordered tree, for indented selects and lookups. */
export function flattenDepartmentTree(nodes: readonly DepartmentNode[], depth = 0): { department: Department; depth: number }[] {
  return nodes.flatMap(node => [{ department: node, depth }, ...flattenDepartmentTree(node.children, depth + 1)]);
}

/** The sibling array containing `id` (roots included), for move up/down. */
export function departmentSiblings(nodes: readonly DepartmentNode[], id: string): readonly DepartmentNode[] {
  if (nodes.some(node => node.id === id)) return nodes;
  for (const node of nodes) {
    const found = departmentSiblings(node.children, id);
    if (found.length) return found;
  }
  return [];
}

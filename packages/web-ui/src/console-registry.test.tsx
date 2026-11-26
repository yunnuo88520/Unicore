// Author: yunnuo <ymz@ebox.vip>
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryHistory } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { expect, it, vi } from 'vitest';
import type { AppClient, Bootstrap } from '@unicore/sdk';
import { Workspace, WorkspaceSwitcher, consoleHref, consolePageHref, defineConsoles, type ConsoleShellProps } from '@unicore/web-ui';
import { consoleRoute } from './console-registry';

const renders = vi.fn();
function PartnerShell({ title, navigation, children }: ConsoleShellProps) {
  return <div data-testid="partner-shell"><h1>{title}</h1><nav>{navigation.map(item => <a key={item.href} href={item.href}>{item.label}</a>)}</nav>{children}</div>;
}
function PartnerOrders({ path }: { path: readonly string[] }) { renders(['orders', ...path]); return <h2>Assigned customer orders</h2>; }
function Reconciliation() { renders('finance'); return <h2>Partner reconciliation</h2>; }
const consoles = defineConsoles({ id: 'partner', title: 'Partner console', permission: 'partner:access', shell: PartnerShell, pages: [
  { id: 'orders', label: 'Orders', permission: 'orders:assigned:read', component: PartnerOrders },
  { id: 'reconciliation', label: 'Reconciliation', permission: 'orders:reconcile', component: Reconciliation },
] });

function mount(path: string, roles: string[], permissions: string[], profile: Bootstrap['profile'] = 'web-platform', definitions = consoles, adminPath: string | null = '/admin') {
  renders.mockClear();
  const client = { transport: 'http', bootstrap: async () => ({ profile, installed: true, site_name: 'Fixture', ...(adminPath ? { admin_path: adminPath } : {}), identity_realm: 'user', capabilities: {}, current_user: { roles, permissions } }) } as AppClient;
  return render(<Workspace client={client} consoles={definitions} history={() => createMemoryHistory({ initialEntries: [path] })} />);
}

it('shows order operations and reconciliation to different partner roles in the same independent console', async () => {
  const path = '/workspaces/partner';
  const sales = mount(path, ['agent'], ['partner:access', 'orders:assigned:read']);
  expect(await screen.findByRole('heading', { name: 'Assigned customer orders' })).toBeVisible();
  expect(screen.getByTestId('partner-shell')).toBeVisible();
  expect(screen.getByRole('link', { name: 'Orders' })).toHaveAttribute('href', `${path}/orders`);
  expect(screen.queryByRole('link', { name: 'Reconciliation' })).toBeNull();
  sales.unmount();
  mount(path, ['agent-finance'], ['partner:access', 'orders:reconcile']);
  expect(await screen.findByRole('heading', { name: 'Partner reconciliation' })).toBeVisible();
  expect(screen.queryByRole('link', { name: 'Orders' })).toBeNull();
});

it.each([
  { roles: ['customer'], permissions: ['orders:mine'], path: '/workspaces/partner/orders' },
  { roles: ['order-admin'], permissions: ['orders:review'], path: '/workspaces/partner/reconciliation' },
  { roles: ['agent'], permissions: ['partner:access', 'orders:assigned:read'], path: '/workspaces/partner/reconciliation' },
])('does not mount privileged order pages for $roles when deep-linked', ({ roles, permissions, path }) => {
  mount(path, roles, permissions);
  return screen.findByText('403').then(() => expect(renders).not.toHaveBeenCalled());
});

it('does not expose the console on standalone', async () => {
  mount('/workspaces/partner/orders', ['agent'], ['partner:access', 'orders:assigned:read'], 'web-standalone');
  expect(await screen.findByText('404')).toBeVisible();
  expect(renders).not.toHaveBeenCalled();
});

it('rejects conflicting and invalid registrations', () => {
  expect(() => defineConsoles(consoles[0], consoles[0])).toThrow();
  expect(() => defineConsoles({ ...consoles[0], id: '../admin' })).toThrow();
});

it('deep-links a console page with its sub-route segments and keeps refresh semantics', async () => {
  mount('/workspaces/partner/orders/42/order.v2', ['agent'], ['partner:access', 'orders:assigned:read']);
  expect(await screen.findByRole('heading', { name: 'Assigned customer orders' })).toBeVisible();
  expect(renders).toHaveBeenCalledWith(['orders', '42', 'order.v2']);
});

const cacheReads = vi.fn(async () => ({ sequence: cacheReads.mock.calls.length }));
function SharedCachePage() {
  const query = useQuery({ queryKey: ['same-console-query'], queryFn: cacheReads, staleTime: Infinity });
  return <p role="status">workspace value {query.data?.sequence ?? 'pending'}</p>;
}
function SwitchingShell({ children, workspaces }: ConsoleShellProps) {
  return <div>
    <WorkspaceSwitcher workspaces={workspaces ?? []} aria-label="Switch workspace" />
    {children}
  </div>;
}
const multiRoleConsoles = defineConsoles(
  { id: 'partner', title: 'Partner console', permission: 'partner:access', shell: SwitchingShell, pages: [
    { id: 'orders', label: 'Orders', permission: 'orders:assigned:read', component: SharedCachePage },
  ] },
  { id: 'finance', title: 'Finance console', permission: 'finance:access', shell: SwitchingShell, pages: [
    { id: 'invoices', label: 'Invoices', permission: 'invoices:review', component: SharedCachePage },
  ] },
  { id: 'restricted', title: 'Restricted console', permission: 'restricted:access', shell: SwitchingShell, pages: [
    { id: 'records', label: 'Records', component: SharedCachePage },
  ] },
);

it('switches between independently registered workspaces and clears each workspace cache on exit', async () => {
  const user = userEvent.setup();
  cacheReads.mockClear();
  mount('/workspaces/partner', ['agent', 'finance'], [
    'partner:access', 'orders:assigned:read', 'finance:access', 'invoices:review',
  ], 'web-platform', multiRoleConsoles);
  expect(await screen.findByText('workspace value 1')).toBeVisible();

  await user.click(screen.getByRole('button', { name: 'Switch workspace' }));
  expect(screen.getByRole('menuitem', { name: '工作空间' })).toHaveAttribute('href', '/');
  expect(screen.getByRole('menuitem', { name: '管理工作台' })).toHaveAttribute('href', '/admin');
  expect(screen.queryByRole('menuitem', { name: 'Restricted console' })).toBeNull();
  expect(screen.getByRole('menuitem', { name: 'Partner console' })).toHaveAttribute('aria-disabled', 'true');
  await user.click(screen.getByRole('menuitem', { name: 'Finance console' }));
  expect(await screen.findByText('workspace value 2')).toBeVisible();
  await user.click(screen.getByRole('button', { name: 'Switch workspace' }));
  await user.click(screen.getByRole('menuitem', { name: 'Partner console' }));
  expect(await screen.findByText('workspace value 3')).toBeVisible();
  expect(cacheReads).toHaveBeenCalledTimes(3);
});

it('omits the administrator workspace when bootstrap has no admin path', async () => {
  const user = userEvent.setup();
  mount('/workspaces/partner', ['agent'], ['partner:access', 'orders:assigned:read'], 'web-platform', multiRoleConsoles, null);
  await screen.findByText('workspace value 1');
  await user.click(screen.getByRole('button', { name: 'Switch workspace' }));
  expect(screen.queryByRole('menuitem', { name: '管理工作台' })).toBeNull();
  expect(screen.getByRole('menuitem', { name: '工作空间' })).toHaveAttribute('href', '/');
});

it('exports route builders through the public Workspace entry', () => {
  expect(consoleHref('partner')).toBe('/workspaces/partner');
  expect(consolePageHref('partner', 'orders', '42')).toBe('/workspaces/partner/orders/42');
  expect(consolePageHref('partner', 'orders', 'order 42')).toBe('/workspaces/partner/orders/order%2042');
  expect(() => consolePageHref('partner', 'orders', '..')).toThrow();
  expect(() => consolePageHref('partner', 'orders', 'order/42')).toThrow();
});

it.each([
  '/workspaces/partner/orders/../reconciliation',
  '/workspaces/partner/orders/%2e%2e/reconciliation',
  '/workspaces/partner/orders/%252e%252e/reconciliation',
  '/workspaces/partner/orders/%2Fadmin',
  '/workspaces/partner/orders/%5Cadmin',
  '/workspaces/partner//orders/42',
  '/workspaces/partner/orders/%E0%A4%A',
])('rejects unsafe or malformed console route %s', path => {
  expect(consoleRoute(consoles, path)).toBeNull();
});

it('rejects dot segments in console sub-routes instead of mounting a page', () => {
  mount('/workspaces/partner/orders/../reconciliation', ['agent'], ['partner:access', 'orders:assigned:read', 'orders:reconcile']);
  return screen.findByText('404').then(() => expect(renders).not.toHaveBeenCalled());
});

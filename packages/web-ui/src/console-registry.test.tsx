// Author: yunnuo <ymz@ebox.vip>
import { render, screen } from '@testing-library/react';
import { createMemoryHistory } from '@tanstack/react-router';
import { expect, it, vi } from 'vitest';
import type { AppClient, Bootstrap } from '@unicore/sdk';
import { Workspace, defineConsoles, type ConsoleShellProps } from './App';

const renders = vi.fn();
function PartnerShell({ title, navigation, children }: ConsoleShellProps) {
  return <div data-testid="partner-shell"><h1>{title}</h1><nav>{navigation.map(item => <a key={item.href} href={item.href}>{item.label}</a>)}</nav>{children}</div>;
}
function PartnerOrders() { renders('orders'); return <h2>Assigned customer orders</h2>; }
function Reconciliation() { renders('finance'); return <h2>Partner reconciliation</h2>; }
const consoles = defineConsoles({ id: 'partner', title: 'Partner console', permission: 'partner:access', shell: PartnerShell, pages: [
  { id: 'orders', label: 'Orders', permission: 'orders:assigned:read', component: PartnerOrders },
  { id: 'reconciliation', label: 'Reconciliation', permission: 'orders:reconcile', component: Reconciliation },
] });

function mount(path: string, roles: string[], permissions: string[], profile: Bootstrap['profile'] = 'web-platform') {
  renders.mockClear();
  const client = { transport: 'http', bootstrap: async () => ({ profile, installed: true, site_name: 'Fixture', identity_realm: 'user', capabilities: {}, current_user: { roles, permissions } }) } as AppClient;
  return render(<Workspace client={client} consoles={consoles} history={() => createMemoryHistory({ initialEntries: [path] })} />);
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

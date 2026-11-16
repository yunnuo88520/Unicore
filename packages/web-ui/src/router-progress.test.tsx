/** Author: yunnuo <ymz@ebox.vip> */
// Navigation progress integration: the top bar must stay running while the
// matched route's page module is still downloading, and finish on load
// failure — onResolved alone ends the sweep too early for slow imports.
import { render, waitFor } from '@testing-library/react';
import { beforeAll, expect, it, vi } from 'vitest';
import { useEffect, useState } from 'react';
import { createMemoryHistory, Outlet, RouterProvider } from '@tanstack/react-router';
import type { AppClient, Bootstrap } from '@unicore/sdk';
import { createWorkspaceRouter, PagePropsProvider, ShellOptionsProvider } from './router';

// Each gate stands in for one page chunk: resolution speed is the test lever.
const gates = vi.hoisted(() => {
  const make = () => {
    let resolve!: (module: unknown) => void;
    let reject!: (error: unknown) => void;
    const promise = new Promise<unknown>((res, rej) => { resolve = res; reject = rej; });
    return { promise, resolve, reject };
  };
  return { overview: make(), home: make(), install: make(), apiDocs: make(), aiAccess: make(), users: make() };
});
vi.mock('./pages/overview', () => gates.overview.promise);
vi.mock('./pages/home', () => gates.home.promise);
vi.mock('./pages/install', () => gates.install.promise);
vi.mock('./pages/api-docs', () => gates.apiDocs.promise);
vi.mock('./pages/admin/ai/access', () => gates.aiAccess.promise);
vi.mock('./pages/admin/users', () => gates.users.promise);

const page = (label: string) => () => <div>{label}</div>;
const OverviewStub = () => <div>overview-ready</div>;

const metadata = {
  profile: 'web-standalone', version: '0.1.0', commit: 'dev', build_time: 'unknown', stage: 'M1',
  deployment_kind: 'development', installed: true, site_name: 'Unicore', admin_path: '/admin',
  capabilities: { execute: true, api_docs: false, authentication: false, database: false, installation: false, settings: false, license: false, updater: false, features: { notes: false } },
} as Bootstrap;
const props = { page: 'overview', client: {} as AppClient, metadata, registry: {} as never, theme: 'light' as never, setTheme: () => {}, refresh: () => {} };

beforeAll(() => {
  // The initial overview module is preloaded for every test: only the
  // navigation targets under test stay gated.
  gates.overview.resolve({ OverviewPage: OverviewStub });
});

// Structural handle: only navigation is exercised, generics stay internal.
type NavRouter = { navigate: (options: { to: string }) => Promise<unknown> };
function Harness({ onReady, initialPath = '/' }: { onReady: (router: NavRouter) => void; initialPath?: string }) {
  const [router] = useState(() => createWorkspaceRouter({
    history: () => createMemoryHistory({ initialEntries: [initialPath] }),
    shell: () => (
      <ShellOptionsProvider value={{ client: props.client, registry: props.registry }}>
        <PagePropsProvider value={props as never}>
          <Outlet />
        </PagePropsProvider>
      </ShellOptionsProvider>
    ),
  }));
  useEffect(() => onReady(router as NavRouter), []);
  return <RouterProvider router={router} />;
}

async function mount(onReady: (router: NavRouter) => void, initialPath?: string) {
  const rendered = render(<Harness onReady={onReady} initialPath={initialPath} />);
  return rendered;
}

const bar = () => document.querySelector('.nav-progress');

it('keeps the bar running while a slow page module downloads', async () => {
  gates.home.promise.catch(() => {});
  let router!: NavRouter;
  await mount(given => { router = given; });
  // The initial overview load settles with no navigation event: no bar.
  await waitFor(() => expect(screenText('overview-ready')).toBeTruthy());
  expect(bar()).toBeNull();
  void router.navigate({ to: '/home' });
  // Resolution happens into a still-pending module: the bar shows once the
  // reveal delay passes and does NOT finish at onResolved.
  await waitFor(() => expect(bar()).not.toBeNull(), { timeout: 2000 });
  gates.home.resolve({ HomePage: page('home-ready') });
  await waitFor(() => expect(screenText('home-ready')).toBeTruthy());
  await waitFor(() => expect(bar()).toBeNull(), { timeout: 2000 });
});

it('does not finish while another navigation chunk is still pending', async () => {
  gates.install.promise.catch(() => {});
  gates.apiDocs.promise.catch(() => {});
  let router!: NavRouter;
  await mount(given => { router = given; });
  await waitFor(() => expect(screenText('overview-ready')).toBeTruthy());
  void router.navigate({ to: '/install' });
  await waitFor(() => expect(bar()).not.toBeNull(), { timeout: 2000 });
  void router.navigate({ to: '/api-docs' });
  // The first module settles while the second is still downloading: the bar
  // must keep running for the remaining chunk.
  gates.install.resolve({ InstallPage: page('install-ready') });
  await new Promise(resolve => setTimeout(resolve, 400));
  expect(bar()).not.toBeNull();
  gates.apiDocs.resolve({ ApiDocsPage: page('api-docs-ready') });
  await waitFor(() => expect(bar()).toBeNull(), { timeout: 2000 });
});

it('ends the bar when the page module fails to load', async () => {
  gates.aiAccess.promise.catch(() => {});
  let router!: NavRouter;
  await mount(given => { router = given; });
  await waitFor(() => expect(screenText('overview-ready')).toBeTruthy());
  void router.navigate({ to: '/ai-access' });
  await waitFor(() => expect(bar()).not.toBeNull(), { timeout: 2000 });
  gates.aiAccess.reject(new Error('chunk download failed'));
  // The failure settles the tracked load: the bar sweeps out and the error
  // boundary surfaces the standalone 500 page.
  await waitFor(() => expect(bar()).toBeNull(), { timeout: 2000 });
  await waitFor(() => expect(screenText('服务器出错了')).toBeTruthy());
});

function screenText(text: string) {
  return document.body.textContent?.includes(text);
}

it('covers a deep link with the shared skeleton while its module loads', async () => {
  gates.users.promise.catch(() => {});
  let router!: NavRouter;
  await mount(given => { router = given; }, '/users');
  // The deep link's chunk is still downloading: the route-level pending
  // skeleton renders immediately — no blank shell between the boot
  // placeholder and the page.
  await waitFor(() => expect(screenText('页面加载中…')).toBeTruthy());
  // The initial deep link does not ride a history event (the boot placeholder
  // owns the pre-router chrome); the route-level skeleton is the coverage.
  gates.users.resolve({ AdminUsersPage: page('users-ready') });
  await waitFor(() => expect(screenText('users-ready')).toBeTruthy());
  await waitFor(() => expect(bar()).toBeNull(), { timeout: 2000 });
});

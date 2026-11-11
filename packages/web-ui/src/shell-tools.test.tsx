/** Author: yunnuo <ymz@ebox.vip>
 * Description: The shared version badge: super administrators with the updater capability get check/update/rollback actions, restricted operators and members get a read-only popover and never fire update requests.
 */
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { expect, it, vi } from 'vitest';
import { MessageProvider } from '@unicore/ui';
import type { AppClient, Bootstrap } from '@unicore/sdk';
import { VersionBadge } from './shell-tools';

function metadata(overrides: Partial<Bootstrap> = {}): Bootstrap {
  return {
    profile: 'web-platform', identity_realm: 'administrator', version: '0.1.3', commit: 'dev', build_time: 'now',
    stage: 'M3b', deployment_kind: 'development', installed: true, site_name: 'Unicore', admin_path: '/admin',
    capabilities: { execute: true, authentication: true, database: true, installation: true, settings: true, license: false, updater: true, features: {} },
    current_user: { id: 'admin-1', username: 'admin', email: '', status: 'active', roles: ['super_admin'], permissions: ['updates:read'], created_at: 1, last_login_at: 1, totp_enabled: false },
    ...overrides,
  } as Bootstrap;
}

const updatesClient = (overview: Record<string, unknown>, check?: Record<string, unknown>) => ({
  updates: {
    overview: vi.fn().mockResolvedValue(overview),
    check: vi.fn().mockResolvedValue(check ?? overview),
  },
}) as unknown as AppClient;

async function mount(client: AppClient, data: Bootstrap, onOpen = vi.fn()) {
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MessageProvider>
        {/* onOpen navigates to the edition console; the badge passes it through. */}
        <VersionBadge client={client} metadata={data} onOpen={onOpen} />
      </MessageProvider>
    </QueryClientProvider>,
  );
  return onOpen;
}

it('opens a read-only popover for members and never requests update data', async () => {
  const client = updatesClient({});
  const member = metadata({
    identity_realm: 'user',
    capabilities: { execute: true, authentication: true, database: true, installation: true, settings: true, license: false, updater: false, features: {} } as Bootstrap['capabilities'],
    current_user: { id: 'u1', username: 'member', email: '', status: 'active', roles: ['user'], permissions: ['notes:access'], created_at: 1, last_login_at: 1, totp_enabled: false },
  });
  await mount(client, member);
  await userEvent.click(await screen.findByRole('button', { name: /当前版本 0\.1\.3/ }));
  const popover = screen.getByRole('dialog', { name: '版本信息' });
  expect(within(popover).getByText('v0.1.3')).toBeVisible();
  expect(within(popover).queryByRole('button', { name: '检查更新' })).toBeNull();
  expect(within(popover).queryByRole('button', { name: '立即更新' })).toBeNull();
  expect(within(popover).queryByRole('button', { name: '刷新' })).toBeNull();
  expect(client.updates!.overview).not.toHaveBeenCalled();
  expect(client.updates!.check).not.toHaveBeenCalled();
});

it('keeps restricted administrators read-only without update requests', async () => {
  const client = updatesClient({});
  const restricted = metadata({
    current_user: { id: 'a2', username: 'restricted', email: '', status: 'active', roles: ['restricted-id'], permissions: ['users:read'], created_at: 1, last_login_at: 1, totp_enabled: false },
  });
  await mount(client, restricted);
  await userEvent.click(await screen.findByRole('button', { name: /当前版本 0\.1\.3/ }));
  const popover = screen.getByRole('dialog', { name: '版本信息' });
  expect(within(popover).getByText('v0.1.3')).toBeVisible();
  expect(within(popover).queryByRole('button', { name: '检查更新' })).toBeNull();
  expect(client.updates!.overview).not.toHaveBeenCalled();
});

it('offers check, update-now and rollback entries to the super administrator', async () => {
  const overview = { current_version: '0.1.3', latest_version: '0.2.0', available: true, checked_at: '2026-11-10T00:00:00Z', can_apply: true, history: [{ version: '0.2.0', url: 'https://github.com/yunnuo88520/Unicore/releases/tag/v0.2.0', notes: '', source: '', prerelease: false, published_at: '2026-11-10T00:00:00Z' }] };
  const client = updatesClient(overview);
  const onOpen = await mount(client, metadata());
  await userEvent.click(await screen.findByRole('button', { name: /当前版本 0\.1\.3/ }));
  const popover = screen.getByRole('dialog', { name: '版本信息' });
  expect(within(popover).getByText(/有新版本可用 v0\.2\.0/)).toBeVisible();
  expect(client.updates!.overview).toHaveBeenCalled();
  // The centered layout: the header row carries the refresh shortcut, the
  // version number renders large and centered, and the actions are stacked
  // full-width with 立即更新 as the primary when a release is waiting.
  expect(within(popover).getByRole('button', { name: '刷新' })).toBeVisible();
  expect(within(popover).getByText('v0.1.3').className).toContain('text-center');
  const actions = within(popover).getByRole('button', { name: '立即更新' }).parentElement!;
  expect(actions.className).toContain('flex-col');
  expect(within(actions).getByRole('button', { name: '检查更新' })).toBeVisible();
  await userEvent.click(within(popover).getByRole('button', { name: '检查更新' }));
  await vi.waitFor(() => expect(client.updates!.check).toHaveBeenCalled());
  await userEvent.click(within(popover).getByRole('button', { name: '立即更新' }));
  expect(onOpen).toHaveBeenCalledTimes(1);
});

it('shows the release link and rollback entry when already up to date', async () => {
  const overview = { current_version: '0.1.3', latest_version: '0.1.3', available: false, checked_at: '2026-11-10T00:00:00Z', can_apply: false, history: [{ version: '0.1.3', url: 'https://github.com/yunnuo88520/Unicore/releases/tag/v0.1.3', notes: '', source: '', prerelease: false, published_at: '2026-11-10T00:00:00Z' }] };
  const client = updatesClient(overview);
  const onOpen = await mount(client, metadata());
  await userEvent.click(await screen.findByRole('button', { name: /当前版本 0\.1\.3/ }));
  const popover = screen.getByRole('dialog', { name: '版本信息' });
  expect(within(popover).getByText('已是最新版本')).toBeVisible();
  // The current status carries the green check; the update-now primary is
  // gone and the check button drops back to the only full-width action.
  expect(within(popover).queryByRole('button', { name: '立即更新' })).toBeNull();
  const release = within(popover).getByRole('link', { name: /查看发布/ });
  expect(release).toHaveAttribute('href', 'https://github.com/yunnuo88520/Unicore/releases/tag/v0.1.3');
  const footer = release.parentElement!;
  expect(footer.className).toContain('justify-center');
  await userEvent.click(within(popover).getByRole('button', { name: '版本回退' }));
  expect(onOpen).toHaveBeenCalledTimes(1);
});

it('portals the popover to document.body above the clipping sidebar layer', async () => {
  const client = updatesClient({});
  await mount(client, metadata());
  await userEvent.click(await screen.findByRole('button', { name: /当前版本 0\.1\.3/ }));
  const popover = screen.getByRole('dialog', { name: '版本信息' });
  // The portal escapes the badge's inline container: the sidebar's
  // overflow-hidden would otherwise clip the card to its left half.
  expect(popover.parentElement).toBe(document.body);
  expect(popover.style.position).toBe('fixed');
  // jsdom rects are zero-sized, so only the flip contract is asserted here;
  // the real above/below placement is covered by the Playwright bounding box.
  expect(['top', 'bottom']).toContain(popover.dataset.placement);
  // Content-sized with a min width so a narrow sidebar never squeezes it.
  expect(popover.className).toContain('min-w-64');
  expect(popover.className).toContain('z-[60]');
  await userEvent.keyboard('{Escape}');
  expect(screen.queryByRole('dialog', { name: '版本信息' })).toBeNull();
});

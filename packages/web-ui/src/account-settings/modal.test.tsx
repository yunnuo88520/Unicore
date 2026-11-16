// Author: yunnuo <ymz@ebox.vip>
// Description: The account settings modal opens from both account menus, commits profile rows on blur
// with the saved toast, switches its four pages from the nav rail, and closes on Escape.
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it, vi } from 'vitest';
import { Workspace } from '../App';
import { grantUI } from '../test-authorization';
import type { AppClient, Bootstrap } from '@unicore/sdk';

const metadata: Bootstrap = { profile: 'web-platform', version: '', commit: '', build_time: '', stage: '', deployment_kind: 'development', installed: true, site_name: 'Unicore', admin_path: '', identity_realm: 'user', current_user: { totp_enabled: false, id: 'user', status: 'active', created_at: 0, last_login_at: 0, username: 'demo', email: 'demo@example.test', roles: ['user'], permissions: ['notes:access'] }, capabilities: { execute: true, api_docs: false, authentication: true, database: true, installation: false, settings: true, license: false, updater: false, features: { notes: true } } };

function client(overrides: Partial<Record<string, unknown>> = {}): AppClient {
  return {
    transport: 'http',
    bootstrap: vi.fn().mockResolvedValue(grantUI(metadata)),
    execute: vi.fn(),
    notes: { listNotes: vi.fn().mockResolvedValue({ items: [], total: 0, page: 1, page_size: 20 }) },
    web: {
      subscribeEvents: vi.fn().mockReturnValue(() => {}),
      announcements: vi.fn().mockResolvedValue({ items: [], total: 0, page: 1, page_size: 10 }),
      inbox: vi.fn().mockResolvedValue({ unread: 0, items: [] }),
      accountProfile: vi.fn().mockResolvedValue({ display_name: 'Demo', avatar_url: '', totp_enabled: false, force_2fa: false, can_disable_2fa: false, user: { username: 'demo', email: 'demo@example.test', status: 'active' } }),
      saveAccountProfile: vi.fn(async (_input: unknown) => ({})),
      accountSessions: vi.fn().mockResolvedValue({ items: [{ id: 's1', user_agent: 'Mozilla/5.0 (Macintosh)', ip_address: '10.0.0.2', current: true, last_seen_at: 1700000000, created_at: 1699000000, expires_at: 1799000000 }], total: 1, page: 1, page_size: 20 }),
      revokeOtherSessions: vi.fn(),
      revokeAccountSession: vi.fn(),
      oidcAccount: vi.fn().mockResolvedValue({ enabled: false, linked: false, has_local_password: true, provider_name: '', issuer: '' }),
      personalTokens: vi.fn().mockResolvedValue({ items: [], total: 0, page: 1, page_size: 20 }),
      personalTokenRoles: vi.fn(),
      logout: vi.fn(),
      ...overrides,
    },
    ...overrides,
  } as unknown as AppClient;
}

async function openPersonalCenter(api: AppClient) {
  render(<Workspace client={api} />);
  await userEvent.click(await screen.findByRole('button', { name: '侧栏账号菜单' }, { timeout: 5000 }));
  await userEvent.click(await screen.findByRole('menuitem', { name: '个人中心' }));
  return await screen.findByRole('dialog', { name: '个人中心' }, { timeout: 5000 });
}

beforeEach(() => { localStorage.clear(); window.location.hash = ''; });

it('opens from the sidebar account menu with the profile page and commits the nickname on blur', async () => {
  const api = client();
  const dialog = await openPersonalCenter(api);
  expect(within(dialog).getByRole('heading', { name: '个人资料' })).toBeVisible();
  // The nav rail lists all four personal pages.
  for (const label of ['个人资料', '安全设置', '登录会话', '访问令牌']) {
    expect(within(dialog).getByRole('button', { name: label })).toBeVisible();
  }
  const nickname = within(dialog).getByLabelText('昵称');
  await userEvent.clear(nickname);
  await userEvent.type(nickname, '云核');
  await userEvent.tab();
  await waitFor(() => expect(api.web!.saveAccountProfile).toHaveBeenCalledWith({ display_name: '云核' }));
  // The saved toast floats under the panel; unchanged values never save.
  expect(await screen.findByText('已保存')).toBeVisible();
  await userEvent.clear(nickname);
  await userEvent.tab();
  await waitFor(() => expect(api.web!.saveAccountProfile).toHaveBeenCalledTimes(1));
});

it('switches pages from the nav rail and renders the sessions and tokens panes', async () => {
  const api = client();
  const dialog = await openPersonalCenter(api);
  await userEvent.click(within(dialog).getByRole('button', { name: '登录会话' }));
  expect(within(dialog).getByRole('heading', { name: '登录会话' })).toBeVisible();
  expect(await within(dialog).findByText('电脑或浏览器')).toBeVisible();
  expect(within(dialog).getByRole('button', { name: '下线其他设备' })).toBeDisabled();
  await userEvent.click(within(dialog).getByRole('button', { name: '访问令牌' }));
  expect(within(dialog).getByRole('heading', { name: '访问令牌' })).toBeVisible();
  expect(await within(dialog).findByText('暂无访问令牌')).toBeVisible();
});

it('closes on Escape and keeps the account menu working afterwards', async () => {
  const api = client();
  const dialog = await openPersonalCenter(api);
  await userEvent.keyboard('{Escape}');
  await waitFor(() => expect(screen.queryByRole('dialog', { name: '个人中心' })).toBeNull());
  // The trigger still works: the modal can be reopened.
  await userEvent.click(screen.getByRole('button', { name: '侧栏账号菜单' }));
  await userEvent.click(await screen.findByRole('menuitem', { name: '个人中心' }));
  expect(await screen.findByRole('dialog', { name: '个人中心' })).toBeVisible();
});

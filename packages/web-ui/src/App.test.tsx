/** Author: yunnuo <ymz@ebox.vip> */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it, vi } from 'vitest';
import { Workspace } from './App';
import { AppError, type AppClient, type Bootstrap } from '@unicore/sdk';

const metadata: Bootstrap = { profile: 'web-standalone', version: '0.1.0', commit: 'dev', build_time: 'unknown', stage: 'M1', deployment_kind: 'development', installed: true, site_name: 'Unicore', admin_path: '/admin', capabilities: { execute: true, api_docs: false, authentication: false, database: false, installation: false, settings: false, license: false, updater: false, features: { notes: true } } };
function client(): AppClient { return { transport: 'http', bootstrap: vi.fn().mockResolvedValue(metadata), execute: vi.fn().mockResolvedValue({ characters: 42, words: 6, lines: 3, bytes: 66, sha256: 'abc123' }) }; }
beforeEach(() => { window.location.hash = ''; localStorage.clear(); });
it('calls the supplied client and displays actual output', async () => {
  const api = client(); render(<Workspace client={api} />);
  await userEvent.click(await screen.findByRole('button', { name: '核心实验室' }, { timeout: 5000 }));
  await userEvent.click(await screen.findByRole('button', { name: '运行用例' }, { timeout: 5000 }));
  expect(await screen.findByText('执行成功')).toBeVisible();
  expect(screen.getByText('42')).toBeVisible();
  expect(api.execute).toHaveBeenCalledWith({ text: expect.stringContaining('Hello, world') });
  expect(screen.queryByText('总用户数')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: '账号菜单' })).not.toBeInTheDocument();
});
it('shows recoverable failures and disables blank input', async () => {
  const api = client(); vi.mocked(api.execute).mockRejectedValue(new AppError('INVALID_INPUT', '文本不合法'));
  render(<Workspace client={api} />);
  await userEvent.click(await screen.findByRole('button', { name: '核心实验室' }, { timeout: 5000 }));
  await userEvent.click(await screen.findByRole('button', { name: '运行用例' }, { timeout: 5000 }));
  expect(await screen.findByRole('alert')).toHaveTextContent('文本不合法');
  await userEvent.clear(screen.getByLabelText('输入文本'));
  expect(screen.getByRole('button', { name: '运行用例' })).toBeDisabled();
});
it('persists appearance preference', async () => {
  const api = client();
  vi.mocked(api.bootstrap).mockResolvedValue({ ...metadata, capabilities: { ...metadata.capabilities, settings: true } });
  const settings = { items: [{ key: 'appearance.theme', group: 'appearance', label: '默认主题', value_type: 'string', value: 'system', sensitive: false, configured: true }] };
  api.settings = vi.fn().mockResolvedValue(settings); api.patchSettings = vi.fn().mockResolvedValue(settings);
  render(<Workspace client={api} />);
  await userEvent.click(await screen.findByRole('button', { name: '外观设置' }, { timeout: 5000 }));
  await userEvent.click(await screen.findByRole('button', { name: /深色.*柔和低光/ }, { timeout: 5000 }));
  await userEvent.click(screen.getByRole('button', { name: '保存设置' }));
  await waitFor(() => expect(document.documentElement.dataset.theme).toBe('dark'));
  expect(localStorage.getItem('unicore.theme')).toBe('dark');
  expect(api.settings).not.toHaveBeenCalled();expect(api.patchSettings).not.toHaveBeenCalled();
});
it('offers retry when bootstrap fails', async () => {
  const api = client(); vi.mocked(api.bootstrap).mockRejectedValue(new AppError('NETWORK_ERROR', '服务离线'));
  render(<Workspace client={api} />);
  await userEvent.click(await screen.findByRole('button', { name: '重新连接' }, { timeout: 5000 }));
  expect(await screen.findByRole('button', { name: '重新连接' }, { timeout: 5000 })).toBeVisible();
});

it('renders catalogue role names in both account menus', { timeout: 20000 }, async () => {
  const memberMetadata: Bootstrap = {
    ...metadata,
    profile: 'web-platform',
    identity_realm: 'user',
    capabilities: { ...metadata.capabilities, authentication: true, database: true, installation: true, settings: true },
    current_user: { id: 'u1', username: 'member', email: '', status: 'active', roles: ['role-uuid-1', 'user'], role_names: ['运营', 'user'], permissions: ['notes:access'], created_at: 1, last_login_at: 1, totp_enabled: false, menu_ids: ['overview'] },
    navigation: {
      version: 1,
      sections: [{ id: 'business', name: '业务', surfaces: ['user', 'administrator'], visible: true, sort: 10, show_title: true }],
      nodes: [{ id: 'overview', section_id: 'business', surfaces: ['user', 'administrator'], type: 'page', label: '', icon: 'LayoutDashboard', route_id: 'overview', visible: true, open_mode: 'same_tab', sort: 0, badge_text: '', badge_color: '', badge_dot: false, operation_ids: [], disabled: false }],
    },
  } as Bootstrap;
  const api = client(); vi.mocked(api.bootstrap).mockResolvedValue(memberMetadata);
  // Earlier tests navigate the shared browser history; members land on the
  // workspace root, and any other path renders the forbidden page instead.
  window.history.replaceState(null, '', '/');
  render(<Workspace client={api} />);
  // The workspace mounts after the bootstrap resolves.
  const topBar = await screen.findByRole('button', { name: '账号菜单' }, { timeout: 8000 });
  // The sidebar footer trigger subtitles the member with resolved role names.
  const sidebar = screen.getByRole('button', { name: '侧栏账号菜单' });
  await waitFor(() => expect(sidebar).toHaveTextContent('运营, 用户'));
  // The top bar dropdown label resolves the same names.
  await userEvent.click(topBar);
  const dialog = screen.getByRole('menu');
  expect(dialog).toHaveTextContent('运营, 用户');
});

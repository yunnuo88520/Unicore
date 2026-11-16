/** Author: yunnuo <ymz@ebox.vip> */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it, vi } from 'vitest';
import { Workspace } from './App';
import { AppError, type AppClient, type Bootstrap } from '@unicore/sdk';

const metadata: Bootstrap = { profile: 'web-standalone', version: '0.1.0', commit: 'dev', build_time: 'unknown', stage: 'M1', deployment_kind: 'development', installed: true, site_name: 'Unicore', admin_path: '/admin', capabilities: { execute: true, api_docs: false, authentication: false, database: false, installation: false, settings: false, license: false, updater: false, features: { notes: true } } };
function client(): AppClient { return { transport: 'http', bootstrap: vi.fn().mockResolvedValue(metadata), execute: vi.fn().mockResolvedValue({ characters: 42, words: 6, lines: 3, bytes: 66, sha256: 'abc123' }) }; }
beforeEach(() => { window.location.hash = ''; localStorage.clear(); });
it('keeps local preferences in the top bar and removes demo navigation', async () => {
  const api = client();
  api.settings = vi.fn(); api.patchSettings = vi.fn(); api.monitorSnapshot = vi.fn();
  render(<Workspace client={api} />);
  const heading = await screen.findByRole('heading', { name: '工作台概览', level: 1 });
  expect(document.getElementById('main-content')).toContainElement(heading);
  expect(document.querySelector('.topbar h1')).toBeNull();
  expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
  for (const name of ['核心实验室', '文件管理', '外观设置']) expect(screen.queryByRole('button', { name })).not.toBeInTheDocument();
  expect(document.querySelector('.sidebar-utilities')).toBeNull();
  expect(await screen.findByRole('region', { name: '运行状态' })).toBeVisible();
  expect(screen.getByRole('heading', { name: '我的项目' })).toBeVisible();
  expect(screen.getByRole('heading', { name: '最近动态' })).toBeVisible();
  expect(screen.queryByRole('region', { name: '运行状态摘要' })).not.toBeInTheDocument();
  expect(screen.queryByText(/Wails Bridge|Web 平台|CLI/)).not.toBeInTheDocument();
  expect(api.monitorSnapshot).not.toHaveBeenCalled();
  await userEvent.click(screen.getByRole('button', { name: '切换主题' }));
  await waitFor(() => expect(document.documentElement.dataset.theme).toBe('dark'));
  expect(api.settings).not.toHaveBeenCalled(); expect(api.patchSettings).not.toHaveBeenCalled();
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

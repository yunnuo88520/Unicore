/** Author: yunnuo <ymz@ebox.vip> */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it, vi } from 'vitest';
import { Workspace } from './App';
import { AppError, type AppClient, type Bootstrap } from '@unicore/sdk';

const metadata: Bootstrap = { profile: 'web-standalone', version: '0.1.0', commit: 'dev', build_time: 'unknown', stage: 'M1', deployment_kind: 'development', installed: true, site_name: 'Unicore', admin_path: '/admin', capabilities: { execute: true, authentication: false, database: false, installation: false, settings: false, license: false, updater: false } };
function client(): AppClient { return { transport: 'http', bootstrap: vi.fn().mockResolvedValue(metadata), execute: vi.fn().mockResolvedValue({ characters: 42, words: 6, lines: 3, bytes: 66, sha256: 'abc123' }) }; }
beforeEach(() => { window.location.hash = ''; localStorage.clear(); });
it('calls the supplied client and displays actual output', async () => {
  const api = client(); render(<Workspace client={api} />);
  await userEvent.click(await screen.findByRole('button', { name: '运行用例' }));
  expect(await screen.findByText('执行成功')).toBeVisible();
  expect(screen.getByText('42')).toBeVisible();
  expect(api.execute).toHaveBeenCalledWith({ text: expect.stringContaining('Unicore') });
  expect(screen.queryByText('总用户数')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: '账号菜单' })).not.toBeInTheDocument();
});
it('shows recoverable failures and disables blank input', async () => {
  const api = client(); vi.mocked(api.execute).mockRejectedValue(new AppError('INVALID_INPUT', '文本不合法'));
  render(<Workspace client={api} />);
  await userEvent.click(await screen.findByRole('button', { name: '运行用例' }));
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
  await userEvent.click(await screen.findByRole('button', { name: '外观设置' }));
  await userEvent.click(screen.getByRole('button', { name: /深色.*柔和低光/ }));
  await userEvent.click(screen.getByRole('button', { name: '保存设置' }));
  await waitFor(() => expect(document.documentElement.dataset.theme).toBe('dark'));
  expect(localStorage.getItem('unicore.theme')).toBe('dark');
  expect(api.settings).not.toHaveBeenCalled();expect(api.patchSettings).not.toHaveBeenCalled();
});
it('offers retry when bootstrap fails', async () => {
  const api = client(); vi.mocked(api.bootstrap).mockRejectedValueOnce(new AppError('NETWORK_ERROR', '服务离线'));
  render(<Workspace client={api} />);
  await userEvent.click(await screen.findByRole('button', { name: '重新连接' }));
  expect(await screen.findByRole('button', { name: '运行用例' })).toBeVisible();
});

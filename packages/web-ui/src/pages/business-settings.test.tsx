// Author: yunnuo <ymz@ebox.vip>
// Description: Backend-registered settings groups render bilingual controls and save only their own draft.
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it, vi } from 'vitest';
import type { AppClient, Bootstrap, Settings } from '@unicore/sdk';
import { setPreferences } from '@unicore/theme/preferences';
import { Workspace } from '../App';
import { grantUI } from '../test-authorization';
import { AdminMailSettingsPage } from './appearance';

const metadata = grantUI({ profile: 'web-platform', version: '', commit: '', build_time: '', stage: '', deployment_kind: 'development', installed: true, site_name: 'Unicore', admin_path: '/admin', identity_realm: 'administrator', current_user: { id: 'admin', username: 'admin', email: '', status: 'active', roles: ['super_admin'], permissions: ['settings:read', 'settings:write'], created_at: 0, last_login_at: 0, totp_enabled: false }, capabilities: { execute: true, authentication: true, database: true, installation: false, settings: true, license: false, updater: false, features: {} } } as Bootstrap);
const settings: Settings = {
  groups: [{ id: 'reports', label: '业务报表', label_en: 'Business reports', description: '配置报表输出。', description_en: 'Configure report output.', order: 1 }],
  items: [{ key: 'site.name', group: 'site', label: '站点名称', value_type: 'string', value: 'Unicore', sensitive: false }, { key: 'reports.retention', group: 'reports', label: '保留天数', label_en: 'Retention days', value_type: 'integer', value: '30', sensitive: false }],
};
beforeEach(() => { localStorage.clear(); setPreferences({ locale: 'zh-CN' }); window.history.replaceState({}, '', '/site'); });
it.each(['zh-CN', 'en'] as const)('renders a registered business tab and isolates its save in %s', async locale => {
  setPreferences({ locale });
  const patch = vi.fn(async () => settings);
  const client = { transport: 'http', bootstrap: vi.fn(async () => metadata), execute: vi.fn(), settings: vi.fn(async () => settings), patchSettings: patch } as unknown as AppClient;
  render(<Workspace client={client} administratorPage={props => <AdminMailSettingsPage {...props} />} />);
  const name = await screen.findByLabelText(locale === 'en' ? 'Site name' : '站点名称');
  await userEvent.clear(name); await userEvent.type(name, 'Unsaved site');
  await userEvent.click(screen.getByRole('tab', { name: locale === 'en' ? 'Business reports' : '业务报表' }));
  const retention = screen.getByLabelText(locale === 'en' ? 'Retention days' : '保留天数');
  await userEvent.clear(retention); await userEvent.type(retention, '60');
  await userEvent.click(screen.getByRole('button', { name: locale === 'en' ? 'Save settings' : '保存设置' }));
  await waitFor(() => expect(patch).toHaveBeenCalledWith({ changes: [{ key: 'reports.retention', value: '60' }] }));
  await userEvent.click(screen.getByRole('tab', { name: locale === 'en' ? 'Basic information' : '基础信息' }));
  expect(screen.getByLabelText(locale === 'en' ? 'Site name' : '站点名称')).toHaveValue('Unsaved site');
});

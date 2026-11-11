// Author: yunnuo <ymz@ebox.vip>
// Description: Locale and theme switches re-render the registration flow without rebuilding the
// form instance: field values and the mounted controls must survive preference changes.
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it, vi } from 'vitest';
import { Workspace } from '../App';
import type { AppClient, Bootstrap } from '@unicore/sdk';
import { setPreferences } from '@unicore/theme/preferences';

const metadata: Bootstrap = {
  profile: 'web-platform', version: '0.1.0', commit: 'dev', build_time: 'unknown', stage: 'M1', deployment_kind: 'development',
  installed: true, site_name: 'Unicore', admin_path: '/admin', home_enabled: false, identity_realm: 'user', current_user: undefined,
  capabilities: { execute: true, authentication: true, database: true, installation: true, settings: true, license: false, updater: false, features: { notes: true } },
} as unknown as Bootstrap;

function registerClient(): AppClient {
  return {
    transport: 'http',
    bootstrap: vi.fn().mockResolvedValue(metadata),
    web: {
      authPolicy: vi.fn().mockResolvedValue({ registration_enabled: true, email_verification_required: true, reset_enabled: true, login_captcha: false, register_captcha: false, email_login_enabled: false, human_check_enabled: false, phone_required: true }),
      captcha: vi.fn(),
      registerCode: vi.fn().mockResolvedValue({ challenge_id: 'c1', retry_after: 60, code_length: 6 }),
      login: vi.fn(), requestCode: vi.fn(), completeCode: vi.fn(),
      oidcInfo: vi.fn().mockResolvedValue({ enabled: false }),
    },
  } as unknown as AppClient;
}

beforeEach(() => { localStorage.clear(); window.history.replaceState(null, '', '/register'); });

it('keeps registration drafts and mounted controls across locale and theme switches', { timeout: 20000 }, async () => {
  render(<Workspace client={registerClient()} />);
  await screen.findByRole('heading', { name: '创建账号' }, { timeout: 10000 });
  await userEvent.type(await screen.findByLabelText('账号', { exact: true }), 'newmember');
  await userEvent.type(await screen.findByLabelText('邮箱', { exact: true }), 'newmember@other.test');
  await userEvent.type(await screen.findByLabelText('密码', { exact: true }), 'member-password-strong');
  await userEvent.type(await screen.findByLabelText('确认密码', { exact: true }), 'member-password-strong');
  await userEvent.type(await screen.findByLabelText('手机号', { exact: true }), '13800138000');
  const zhControls = { account: screen.getByLabelText('账号', { exact: true }), email: screen.getByLabelText('邮箱', { exact: true }), phone: screen.getByLabelText('手机号', { exact: true }) };

  // The same StorageEvent path the e2e uses: preferences arrive from another tab.
  const key = 'unicore.preferences.v1';
  localStorage.setItem(key, JSON.stringify({ ...JSON.parse(localStorage.getItem(key) ?? '{}'), locale: 'en', theme: 'dark' }));
  window.dispatchEvent(new StorageEvent('storage', { key }));
  await screen.findByRole('heading', { name: 'Create account' }, { timeout: 5000 });
  const enControls = { account: screen.getByLabelText('Account', { exact: true }), email: screen.getByLabelText('Email', { exact: true }) };
  expect(enControls.account).toHaveValue('newmember');
  expect(enControls.email).toHaveValue('newmember@other.test');
  expect(screen.getByLabelText('Password', { exact: true })).toHaveValue('member-password-strong');
  expect(screen.getByLabelText('Confirm password', { exact: true })).toHaveValue('member-password-strong');
  expect(screen.getByLabelText('Phone', { exact: true })).toHaveValue('13800138000');
  // Re-render, not remount: the mounted controls keep their DOM identity.
  expect(enControls.account).toBe(zhControls.account);
  expect(enControls.email).toBe(zhControls.email);

  localStorage.setItem(key, JSON.stringify({ ...JSON.parse(localStorage.getItem(key) ?? '{}'), locale: 'zh-CN', theme: 'light' }));
  window.dispatchEvent(new StorageEvent('storage', { key }));
  await screen.findByRole('heading', { name: '创建账号' }, { timeout: 5000 });
  expect(screen.getByLabelText('账号', { exact: true })).toHaveValue('newmember');
  expect(screen.getByLabelText('邮箱', { exact: true })).toHaveValue('newmember@other.test');
  expect(screen.getByLabelText('手机号', { exact: true })).toBe(zhControls.phone);
});

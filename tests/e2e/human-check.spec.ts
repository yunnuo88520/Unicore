// Author: yunnuo <ymz@ebox.vip>
// Description: Human verification switches fail closed until the provider is configured and reject unproven requests.
import { Buffer } from 'node:buffer';
import { test, expect } from './fixtures';

async function adminSession(context: import('@playwright/test').BrowserContext, instance: { url: string }) {
  const request = context.request;
  const captcha = (await (await request.get(`${instance.url}/api/v1/admin/auth/captcha`)).json()).data;
  const answer = [...Buffer.from(captcha.image.split(',')[1], 'base64').toString().matchAll(/>([0-9])<\/text>/g)].map(match => match[1]).join('');
  const auth = await request.post(`${instance.url}/api/v1/admin/auth/login`, { data: { username: 'admin', password: 'test-password-strong', captcha_id: captcha.id, captcha_answer: answer } });
  expect(auth.status()).toBe(200);
  return (await auth.json()).data as { csrf_token: string };
}

test('registration human verification fails closed and rejects unproven tokens', async ({ page, instance }) => {
  expect((await page.request.post(`${instance.url}/api/v1/install/complete`, { headers: { 'X-Bootstrap-Token': instance.token }, data: { profile: 'web-platform', database: { driver: 'sqlite', dsn: '' }, site_name: 'Unicore', base_url: instance.url, admin_username: 'admin', admin_email: 'admin@example.test', admin_password: 'test-password-strong' } })).status()).toBe(200);
  const admin = await page.context().browser()!.newContext();
  try {
    const csrf = (await adminSession(admin, instance)).csrf_token;
    const patch = (key: string, value: string) => admin.request.patch(`${instance.url}/api/v1/admin/settings`, { headers: { 'X-CSRF-Token': csrf }, data: { changes: [{ key, value }] } });
    for (const [key, value] of [['account.registration_enabled', 'true'], ['security.register_captcha', 'false'], ['security.human_check_enabled', 'true'], ['security.human_check_provider', 'turnstile']] as const) {
      expect((await patch(key, value)).status()).toBe(200);
    }
    // Enabled without credentials: the registration flow refuses to run at all.
    const unconfigured = await page.request.post(`${instance.url}/api/v1/auth/email/register`, { data: { username: 'humanmember', email: 'human@example.test', password: 'human-password-strong', captcha_id: '', captcha_answer: '' } });
    expect(unconfigured.status()).toBe(503);
    expect(((await unconfigured.json()) as { code: string }).code).toBe('HUMAN_CHECK_NOT_CONFIGURED');
    // Configured: a request without a real provider proof is rejected by the provider check.
    expect((await patch('security.turnstile_site_key', '0o0000000000000000')).status()).toBe(200);
    expect((await patch('security.turnstile_secret_key', '0x00000000000000000000000000000000')).status()).toBe(200);
    const rejected = await page.request.post(`${instance.url}/api/v1/auth/email/register`, { data: { username: 'humanmember', email: 'human@example.test', password: 'human-password-strong', captcha_id: '', captcha_answer: '', human_check_token: 'fake-proof' } });
    expect(rejected.status()).toBe(400);
    expect(((await rejected.json()) as { code: string }).code).toBe('HUMAN_CHECK_FAILED');
    // Turning the switch off restores the plain registration flow.
    expect((await patch('security.human_check_enabled', 'false')).status()).toBe(200);
    const allowed = await page.request.post(`${instance.url}/api/v1/auth/email/register`, { data: { username: 'humanmember', email: 'human@example.test', password: 'human-password-strong', captcha_id: '', captcha_answer: '' } });
    expect(allowed.status()).toBe(200);
  } finally {
    await admin.close();
  }
});

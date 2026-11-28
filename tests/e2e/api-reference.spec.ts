// Author: yunnuo <ymz@ebox.vip>
// Description: Public developer reference gating and menu separation on both real Web profiles and viewports.
import { test, expect, installPlatform, installStandalone, adminLogin, sdkClient, loginClient } from './fixtures';

for (const profile of ['web-platform', 'web-standalone'] as const) {
  test(`${profile} publishes an independent read-only reference without workspace authentication`, async ({ page, context, instance }) => {
    test.setTimeout(90000);
    await (profile === 'web-platform' ? installPlatform(instance) : installStandalone(instance));
    await context.clearCookies();
    const raw = await page.request.get(`${instance.url}/openapi.json`);
    expect(raw.status()).toBe(200);
    expect((await raw.json()).paths['/api/v1/admin/users']).toBeDefined();
    const privateAPI = await page.request.get(`${instance.url}/api/v1/admin/users`);
    expect(privateAPI.status()).toBe(profile === 'web-platform' ? 401 : 404);
    await page.goto(`${instance.url}/docs/api`);
    await expect(page).toHaveURL(`${instance.url}/api-docs`);
    await expect(page.getByRole('heading', { name: 'API 文档', exact: true, level: 1 })).toBeVisible();
    await expect(page.locator('.swagger-ui')).toBeVisible({ timeout: 30000 });
    await expect(page.locator('.sidebar')).toHaveCount(0);
    await expect(page.locator('.try-out__btn, .execute-wrapper')).toHaveCount(0);
    await page.getByRole('button', { name: '切换语言' }).click();
    await page.getByRole('menuitemradio', { name: 'English' }).click();
    await expect(page.getByRole('heading', { name: 'API reference', exact: true, level: 1 })).toBeVisible();
    await page.getByRole('button', { name: 'Change language' }).click();
    await page.getByRole('menuitemradio', { name: '中文' }).click();
    if (profile === 'web-platform') {
      await adminLogin(page, instance.url, 'admin', 'administrator-password-strong');
      await page.goto(`${instance.url}/admin/menus`);
      await expect(page.getByRole('heading', { name: '菜单配置', exact: true })).toBeVisible();
      await expect(page.locator('[data-node="api-docs"]')).toHaveCount(0);
      const api = sdkClient(instance.url); await loginClient(api, 'admin', 'administrator-password-strong');
      const before = await api.web.menuConfig();
      expect(before.pages.some(item => item.id === 'api-docs')).toBe(false);
      expect(before.nodes.some(item => item.route_id === 'api-docs')).toBe(false);
      const custom = { ...before.nodes.find(item => item.type === 'page')!, id: 'business-api-guide', route_id: undefined, parent_id: undefined, type: 'link' as const, url: 'https://example.test/business-api', label: 'Business API guide', operation_ids: [] };
      await api.web.saveMenuConfig({ version: before.version, sections: before.sections, nodes: [...before.nodes, custom] });
      const rolesBefore = await api.web.roles();
      await instance.restart();
      const after = await api.web.menuConfig();
      expect(after.nodes.find(item => item.id === custom.id)).toEqual(custom);
      expect(await api.web.roles()).toEqual(rolesBefore);
      await page.goto(`${instance.url}/admin/api-docs`);
      await expect(page.getByRole('heading', { name: '页面不存在', exact: true })).toBeVisible();
    }
  });

  test(`${profile} keeps developer documents unavailable when disabled`, async ({ page, instanceNoDocs }) => {
    await (profile === 'web-platform' ? installPlatform(instanceNoDocs) : installStandalone(instanceNoDocs));
    for (const path of ['/api-docs', '/openapi.json', '/docs/api']) {
      expect((await page.request.get(`${instanceNoDocs.url}${path}`)).status()).toBe(404);
    }
  });
}

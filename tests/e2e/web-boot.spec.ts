// Author: yunnuo <ymz@ebox.vip>
import { expect, installPlatform, installStandalone, test } from './fixtures';

for (const { entry, install, path } of [
  { entry: 'administrator', install: installPlatform, path: '/admin/note-management' },
  { entry: 'standalone', install: installStandalone, path: '/notes' },
]) {
  test(`${entry} startup fallback works with strict script CSP`, async ({ page, instance }) => {
    await install(instance);
    const violations: string[] = [];
    page.on('console', message => {
      if (message.type() === 'error' && message.text().includes('Content Security Policy')) violations.push(message.text());
    });
    // The startup fallback must work even when the application bundle cannot load.
    await page.route('**/assets/*.js', route => route.abort());
    await page.clock.install();
    const url = `${instance.url}${path}`;
    const response = await page.goto(url);
    expect(response?.status()).toBe(200);
    expect(response?.headers()['content-security-policy'].split(';').map(value => value.trim())).toContain("script-src 'self'");
    expect(violations).toEqual([]);
    const reload = page.getByRole('button', { name: '重新加载 Reload', exact: true });
    await expect(reload).toBeHidden();
    await page.clock.fastForward(8000);
    await expect(reload).toBeVisible();
    const navigation = page.waitForResponse(result => result.url() === url && result.request().isNavigationRequest());
    await reload.click();
    expect((await navigation).status()).toBe(200);
    await page.waitForLoadState();
    await expect(reload).toBeHidden();
    expect(violations).toEqual([]);
  });
}

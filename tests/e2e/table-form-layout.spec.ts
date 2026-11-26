// Author: yunnuo <ymz@ebox.vip>
// Description: Real platform forms keep actions visible while content scrolls, with bilingual table results at both viewport sizes.
import { mkdir } from 'node:fs/promises';
import { test, expect, installPlatform, adminLogin } from './fixtures';

for (const locale of ['zh-CN', 'en'] as const) {
  for (const theme of ['light', 'dark'] as const) {
    test(`entity drawers preserve fixed actions and table layout (${locale}, ${theme})`, async ({ page, instance }, info) => {
      await installPlatform(instance);
      await adminLogin(page, instance.url, 'admin', 'administrator-password-strong');
      await page.addInitScript(({ locale, theme }) => localStorage.setItem('unicore.preferences.v1', JSON.stringify({ locale, theme })), { locale, theme });
      await page.emulateMedia({ reducedMotion: 'reduce' });
      // A short desktop window exercises overflow with real field groups and help text.
      await page.setViewportSize({ width: info.project.name === 'mobile' ? 375 : 1280, height: 720 });
      await page.goto(`${instance.url}/admin/users`);
      const en = locale === 'en';
      const create = page.getByRole('button', { name: en ? 'Add User' : '新增用户', exact: true });
      await create.click();
      const drawer = page.getByRole('dialog', { name: en ? 'Add User' : '新增用户', exact: true });
      const username = drawer.getByRole('textbox', { name: en ? 'Account' : '账号', exact: true });
      await expect(username).toBeFocused();
      const body = drawer.locator('[data-slot="app-form-body"]');
      const footer = drawer.locator('[data-slot="app-form-footer"]');
      const submit = drawer.getByRole('button', { name: en ? 'Create User' : '创建用户', exact: true });
      const cancel = drawer.getByRole('button', { name: en ? 'Cancel' : '取消', exact: true });
      await expect(submit).toBeInViewport();
      await expect(cancel).toBeInViewport();
      const directory = `build/acceptance/table-form/${info.project.name}/${locale}-${theme}`;
      await mkdir(directory, { recursive: true });
      await page.screenshot({ path: `${directory}/user-drawer.png`, animations: 'disabled' });
      const heading = drawer.getByRole('heading', { name: en ? 'Add User' : '新增用户', exact: true });
      const before = { heading: await heading.boundingBox(), footer: await footer.boundingBox() };
      await body.evaluate(element => { element.scrollTop = element.scrollHeight; });
      await expect(submit).toBeInViewport();
      const after = { heading: await heading.boundingBox(), footer: await footer.boundingBox() };
      expect(after).toEqual(before);
      const bounds = await drawer.boundingBox();
      expect(bounds!.x).toBeGreaterThanOrEqual(0);
      expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(page.viewportSize()!.width);
      expect(await drawer.evaluate(element => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1);
      await page.screenshot({ path: `${directory}/user-drawer-scrolled.png`, animations: 'disabled' });
      await cancel.click();
      await expect(drawer).toHaveCount(0);
      await expect(create).toBeFocused();

      await create.click();
      await username.fill('layoutmember');
      await drawer.getByRole('textbox', { name: en ? 'Email' : '邮箱', exact: true }).fill('layoutmember@example.test');
      await drawer.getByLabel(en ? 'Initial password' : '初始密码', { exact: true }).fill('layout-member-password-strong');
      await submit.click();
      await expect(drawer).toHaveCount(0);
      const table = page.getByRole('table');
      await expect(table.getByText('layoutmember', { exact: true })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
      await page.screenshot({ path: `${directory}/users-table.png`, fullPage: true, animations: 'disabled' });
    });
  }
}

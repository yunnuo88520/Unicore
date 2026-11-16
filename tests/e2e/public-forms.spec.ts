// Author: yunnuo <ymz@ebox.vip>
// Description: Real installer and authentication regressions for visible fields and image CAPTCHA semantics.
import type { Locator } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { test, expect, captchaAnswer, sdkClient, loginClient } from './fixtures';
import english from '../../packages/web-ui/src/locales/en.json';

// Check the rendered idle field against its nearest painted canvas. This catches
// ancestor styles that erase both the input fill and its transparent border.
async function expectVisibleField(field: Locator) {
  await expect(field).toBeVisible();
  await expect.poll(() => field.evaluate(element => {
    const style = getComputedStyle(element);
    let parent = element.parentElement;
    while (parent) {
      const background = getComputedStyle(parent).backgroundColor;
      if (background !== 'rgba(0, 0, 0, 0)' && background !== 'transparent') {
        return style.backgroundColor !== background;
      }
      parent = parent.parentElement;
    }
    return false;
  }), { message: 'The idle input fill must remain distinguishable from its canvas.' }).toBe(true);
}

async function expectRaisedLabel(field: Locator) {
  await expect.poll(() => field.evaluate(element => {
    const input = element as HTMLInputElement;
    const label = input.labels?.[0];
    if (!label) return false;
    const labelBox = label.getBoundingClientRect();
    const inputBox = input.getBoundingClientRect();
    return labelBox.top < inputBox.top && labelBox.top + labelBox.height / 2 < inputBox.top + 4;
  }), { message: 'A filled field must keep its floating label above the entered text.' }).toBe(true);
}

for (const locale of ['zh-CN', 'en'] as const) for (const theme of ['light', 'dark'] as const) {
  test(`installer and auth fields stay readable in ${locale} ${theme}`, async ({ page, instance }, info) => {
    test.setTimeout(120000);
    const t = (message: string) => locale === 'en' ? (english as Record<string, string>)[message] ?? message : message;
    const field = (label: string) => page.getByLabel(t(label), { exact: true });
    const button = (label: string) => page.getByRole('button', { name: t(label), exact: true });
    const directory = `build/acceptance/public-forms/${info.project.name}/${locale}-${theme}`;
    await mkdir(directory, { recursive: true });
    await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
    await page.addInitScript(preferences => localStorage.setItem('unicore.preferences.v1', JSON.stringify(preferences)), { locale, theme });
    const capture = async (name: string) => {
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      const title = (await page.getByRole('heading', { level: 1 }).boundingBox())!;
      const controls = (await button('切换语言').boundingBox())!;
      const overlap = title.y < controls.y + controls.height && controls.y < title.y + title.height
        && title.x < controls.x + controls.width && controls.x < title.x + title.width;
      expect(overlap, 'Public controls must not cover the page title after step focus or scrolling.').toBe(false);
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({ path: `${directory}/${name}.png`, fullPage: true, animations: 'disabled' });
    };
    const checkSteps = async (count: number) => {
      const progress = page.getByRole('navigation', { name: t('安装步骤'), exact: true });
      const items = progress.getByRole('listitem');
      await expect(items).toHaveCount(count);
      const current = await items.evaluateAll(nodes => nodes.findIndex(node => node.getAttribute('aria-current') === 'step') + 1);
      await expect(progress.getByText(t('第 {{current}} 步，共 {{total}} 步').replace('{{current}}', String(current)).replace('{{total}}', String(count)), { exact: true })).toHaveCount(1);
      if (info.project.name === 'mobile') expect((await progress.boundingBox())!.height).toBeLessThan(110);
      const box = (await progress.getByRole('list').boundingBox())!;
      const first = (await items.first().boundingBox())!;
      const last = (await items.last().boundingBox())!;
      expect(Math.abs((first.x + first.width / 2 - box.x) - (box.x + box.width - last.x - last.width / 2))).toBeLessThan(2);
    };

    await page.goto(`${instance.url}/install`);
    await checkSteps(5);
    const token = field('一次性安装凭据');
    await expectVisibleField(token);
    await expect(token).toHaveAccessibleDescription(/32/);
    await capture('install-credentials-empty');
    await token.fill('short');
    await button('下一步').click();
    await expect(token).toHaveAttribute('aria-invalid', 'true');
    await expect(token).toHaveAccessibleDescription(/32/);
    await capture('install-credentials-error');
    await token.fill(instance.token);
    await token.blur();
    await expectRaisedLabel(token);
    await button('下一步').click();
    await expect(page.getByRole('radio', { name: t('多用户平台'), exact: true })).toBeChecked();
    await page.getByRole('radio', { name: t('单机模式'), exact: true }).check();
    await checkSteps(4);
    await page.getByRole('radio', { name: t('多用户平台'), exact: true }).check();
    await checkSteps(5);
    await capture('install-profile');
    await button('下一步').click();
    // The database driver renders as a dropdown select (form choices stay
    // dropdowns regardless of the option count).
    await expect(page.getByRole('combobox', { name: t('数据库类型') })).toContainText(t('MySQL · 在线部署推荐'));
    for (const label of ['数据库地址', '数据库端口', '数据库名', '数据库用户名', '数据库密码']) await expectVisibleField(field(label));
    for (const label of ['数据库地址', '数据库端口', '数据库名', '数据库用户名']) await expectRaisedLabel(field(label));
    expect((await field('数据库端口').boundingBox())!.width).toBeLessThanOrEqual(160);
    await capture('install-database');
    await page.getByRole('combobox', { name: t('数据库类型') }).click();await page.getByRole('option', { name: t('SQLite · 本机或小型测试'), exact: true }).click();
    await button('测试连接').click();
    await expect(page.getByText(t('连接测试成功'), { exact: true })).toBeVisible();
    await button('下一步').click();
    for (const label of ['站点名称', '管理员账号', '管理员邮箱', '管理员密码']) await expectVisibleField(field(label));
    await capture('install-admin-empty');
    await button('下一步').click();
    await expect(field('管理员账号')).toHaveAttribute('aria-invalid', 'true');
    await expect(field('管理员邮箱')).toHaveAttribute('aria-invalid', 'true');
    await capture('install-admin-error');
    await field('管理员账号').fill('admin');
    await field('管理员邮箱').fill('admin@example.test');
    await field('管理员密码').fill('administrator-password-strong');
    await field('管理员密码').blur();
    await expectRaisedLabel(field('管理员密码'));
    await capture('install-admin-filled');
    await button('下一步').click();
    await capture('install-confirm');
    await button('完成安装').click();
    await expect(page.getByRole('heading', { name: t('安装完成'), exact: true })).toBeVisible();
    await capture('install-complete');

    const admin = sdkClient(instance.url);
    await loginClient(admin, 'admin', 'administrator-password-strong');
    await admin.bootstrap();
    await admin.patchSettings({ changes: [{ key: 'account.registration_enabled', value: 'true' }] });
    await page.context().clearCookies();
    await page.goto(`${instance.url}/register`);
    for (const label of ['账号', '密码', '确认密码', '邮箱', '图形验证码']) await expectVisibleField(field(label));
    await capture('register-empty');

    for (const [realm, path] of [['user', '/login'], ['administrator', '/admin/login']] as const) {
      await page.context().clearCookies();
      await page.goto(`${instance.url}${path}`);
      for (const label of ['账号或邮箱', '密码', '图形验证码']) await expectVisibleField(field(label));
      const captcha = field('图形验证码');
      // Image challenges have one ordinary textbox. Email/TOTP retain their own OTP component.
      await expect(captcha).toHaveAttribute('maxlength', '6');
      await expect(captcha).toHaveAttribute('autocomplete', 'off');
      await expect(captcha).toHaveAttribute('inputmode', 'numeric');
      await expect(captcha).not.toHaveCSS('opacity', '0');
      const image = page.getByAltText(t('六位数字验证码，点击刷新'), { exact: true });
      await expect(image).toBeVisible();
      const inputBox = (await captcha.boundingBox())!;
      const refreshBox = (await button('刷新验证码').boundingBox())!;
      expect(Math.abs(inputBox.y - refreshBox.y)).toBeLessThan(2);
      expect(refreshBox.x).toBeGreaterThan(inputBox.x + inputBox.width);
      await capture(`${realm}-login-empty`);

      await field('账号或邮箱').fill('admin');
      await field('密码').fill('administrator-password-strong');
      await captcha.fill('12');
      await button('登录工作空间').click();
      await expect(captcha).toHaveAttribute('aria-invalid', 'true');
      await expect(captcha).toHaveAccessibleDescription(new RegExp(t('请输入 6 位图形验证码')));
      await capture(`${realm}-login-error`);
      const oldImage = await image.getAttribute('src');
      await button('刷新验证码').click();
      await expect(captcha).toHaveValue('');
      await expect(image).toBeVisible();
      await expect(image).not.toHaveAttribute('src', oldImage!);
      await captcha.fill(captchaAnswer((await image.getAttribute('src'))!));
      await captcha.blur();
      await expectRaisedLabel(captcha);
      await expectRaisedLabel(field('账号或邮箱'));
      await expectRaisedLabel(field('密码'));
      await capture(`${realm}-login-filled`);
      await button('登录工作空间').click();
      await expect(page.getByRole('heading', { name: t('工作台概览'), exact: true })).toBeVisible();
    }
  });
}

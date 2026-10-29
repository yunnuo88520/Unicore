// Author: yunnuo <ymz@ebox.vip>
// Description: Real Go UI validation of bilingual local appearance and responsive navigation.
import { mkdir } from 'node:fs/promises';
import { test, expect, installStandalone } from './fixtures';

const chinese = /[\u3400-\u9fff]/;
async function untranslated(page: import('@playwright/test').Page) {
  // User content, product names and release notes are authored data, not interface copy.
  return page.locator('body').evaluate(body => {
    const walk = document.createTreeWalker(body, NodeFilter.SHOW_TEXT);
    const found: string[] = [];
    while (walk.nextNode()) {
      const node = walk.currentNode as Text;
      if (!/[\u3400-\u9fff]/.test(node.textContent ?? '')) continue;
      const parent = node.parentElement;
      if (!parent || !parent.checkVisibility() || parent.closest('textarea,input,script,style,.update-notes,.note-body,.rich-surface')) continue;
      found.push(node.textContent!.trim());
    }
    return found;
  });
}
test('bilingual drafts, local drawer, persistence and responsive layouts', async ({ page, context, instance }, info) => {
  await installStandalone(instance);
  const failures: string[] = []; page.on('pageerror', error => failures.push(error.message));
  await page.goto(instance.url);
  await page.getByLabel('输入文本').fill('A draft retained across language changes.');
  await page.getByRole('button', { name: '切换语言', exact: true }).click();
  await page.getByRole('menuitemradio', { name: 'English', exact: true }).click();
  await expect(page.getByLabel('Input text')).toHaveValue('A draft retained across language changes.');
  await expect(page).toHaveTitle('Unicore · Workspace');
  expect(await untranslated(page)).toEqual([]);
  const another = await context.newPage(); await another.goto(instance.url);
  const trigger = page.getByRole('button', { name: 'Appearance', exact: true });
  await trigger.click();
  const drawer = page.getByRole('dialog', { name: 'Appearance', exact: true });
  await expect(drawer.getByRole('button', { name: 'Close appearance settings' })).toBeFocused();
  await drawer.locator('.preference-theme').getByRole('button', { name: 'Dark', exact: true }).click();
  const brandSwatch = await drawer.locator('.palette-brand').evaluate(element=>getComputedStyle(element).backgroundColor);
  await drawer.locator('.preference-accent').getByRole('button', { name: 'Ocean', exact: true }).click();
  await expect(drawer.locator('.palette-brand')).toHaveCSS('background-color',brandSwatch);
  await drawer.locator('.preference-radius').getByRole('button', { name: 'Round', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-accent', 'ocean');
  await expect(another.locator('html')).toHaveAttribute('data-accent', 'ocean');
  const directory = `build/acceptance/preferences/${info.project.name}`; await mkdir(directory, { recursive: true });
  await page.screenshot({ path: `${directory}/drawer-dark.png` });
  await page.keyboard.press('Escape'); await expect(drawer).toHaveCount(0); await expect(trigger).toBeFocused();
  await another.close(); await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.locator('html')).toHaveAttribute('data-radius', 'round');
  await trigger.click();
  for (const [section, value, attribute, expected] of [
    ['density', 'Larger text', 'density', 'large'], ['sidebar', 'Floating', 'sidebar', 'floating'],
    ['content', 'Centered', 'content', 'centered'],
  ]) {
    await drawer.locator(`.preference-${section}`).getByRole('button', { name: value, exact: true }).click();
    await expect(page.locator('html')).toHaveAttribute(attribute === 'dir' ? 'dir' : `data-${attribute}`, expected);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  await page.screenshot({ path: `${directory}/drawer-layout.png` });
  await drawer.getByRole('button', { name: 'Reset appearance', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await drawer.locator('.preference-layout').getByRole('button', { name: 'Full width', exact: true }).click();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Open navigation', exact: true }).click();
  await page.getByRole('button', { name: 'My notes', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'My notes.' })).toBeVisible();
  await trigger.click(); await drawer.getByRole('button', { name: 'Reset appearance', exact: true }).click(); await page.keyboard.press('Escape');
  for (const route of ['overview', 'lab', 'notes', 'site']) {
    await page.goto(`${instance.url}/#${route}`);
    await expect(page.locator('.state-card.error-state')).toHaveCount(0);
    expect(await untranslated(page)).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  await page.goto(instance.url); await expect(page.getByLabel('Input text')).toBeVisible();
  await page.screenshot({ path: `${directory}/workspace-light.png` });
  expect(failures).toEqual([]);
});

test('English administrator pages and public authentication share controls', async ({ page, browser, instance }, info) => {
  const installed = await page.request.post(`${instance.url}/api/v1/install/complete`, { headers: { 'X-Bootstrap-Token': instance.token }, data: { profile:'web-platform', database:{driver:'sqlite',dsn:''}, site_name:'Unicore', base_url:instance.url, admin_username:'admin', admin_email:'admin@example.test', admin_password:'test-password-strong' } });
  expect(installed.status()).toBe(200);
  await page.goto(`${instance.url}/admin`);
  await page.getByRole('button', { name:'切换语言', exact:true }).click(); await page.getByRole('menuitemradio', { name:'English', exact:true }).click();
  for (const route of ['users','administrators','roles','site','site?tab=branding','site?tab=security','site?tab=oidc','mail','mail-templates','storage','logs']) {
    await page.goto(`${instance.url}/admin#${route}`);
    await expect(page.locator('.page-heading h1')).toBeVisible();
    await expect(page.locator('[role=status]').filter({hasText:/Loading/})).toHaveCount(0);
    const leftovers = await untranslated(page);
    expect(leftovers, route).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), route).toBe(true);
  }
  await page.goto(`${instance.url}/admin#edition`); await expect(page.locator('.update-release')).not.toHaveCount(0);
  const other = await browser.newContext({ viewport:page.viewportSize()! });
  try {
    const user = await other.newPage(); await user.goto(`${instance.url}/login`);
    await user.getByRole('button',{name:'切换语言',exact:true}).click(); await user.getByRole('menuitemradio',{name:'English',exact:true}).click();
    await expect(user.getByRole('heading',{name:'Sign in to Unicore',exact:true})).toBeVisible();
    expect(await untranslated(user)).toEqual([]);
    await user.getByRole('button',{name:'Appearance',exact:true}).click(); await expect(user.getByRole('dialog')).toBeVisible();
    await user.screenshot({ path:`build/acceptance/preferences/${info.project.name}/login-drawer.png` });
  } finally { await other.close(); }
});

test('installation has the same persisted local language and theme controls', async ({ page, instance }) => {
  await page.goto(`${instance.url}/install`);
  await page.getByRole('button',{name:'切换语言',exact:true}).click(); await page.getByRole('menuitemradio',{name:'English',exact:true}).click();
  await expect(page.getByRole('heading',{name:'A starting point for your product'})).toBeVisible();
  expect(await untranslated(page)).toEqual([]);
  await page.getByRole('button',{name:'Appearance',exact:true}).click(); await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape'); await page.reload(); await expect(page.locator('html')).toHaveAttribute('lang','en');
});

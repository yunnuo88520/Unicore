// Author: yunnuo <ymz@ebox.vip>
// Description: Separate production-artifact gate; opt in only after rebuilding web assets and Go server.
import { test, expect } from './ui-system-fixtures';

test.skip(process.env.UNICORE_UI_SYSTEM_PRODUCTION !== '1', 'Rebuild production web assets and Go server, then set UNICORE_UI_SYSTEM_PRODUCTION=1.');

test('production build does not expose the development catalog', async ({ page, uiSystem }) => {
  await page.goto(`${uiSystem.productionURL}/ui-preview`);
  await expect(page.getByRole('heading', { level: 1, name: /页面不存在|Page not found/ })).toBeVisible();
  await expect(page.getByRole('heading', { name: /组件预览|Component preview/, exact: true })).toHaveCount(0);
  await expect(page.locator('[data-catalog-id]')).toHaveCount(0);
  await expect(page.getByTestId('catalog-category-base')).toHaveCount(0);
});

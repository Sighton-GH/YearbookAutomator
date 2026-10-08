import { test, expect } from '@playwright/test';
import { activate } from './helpers';
test('fictional sample loads eight students into People', async ({ page }) => {
  await activate(page);
  await page.getByRole('button', { name: 'Open help', exact: true }).click();
  await page.getByRole('button', { name: 'Load a sample project', exact: true }).click();
  await expect(page.locator('.people-card')).toHaveCount(8, { timeout: 60_000 });
  await expect(page.getByText('Avery Bennett', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('Sasha Vandermeer', { exact: true }).first()).toBeVisible();
  await expect(page.locator('.people-card')).toHaveCount(8);
});

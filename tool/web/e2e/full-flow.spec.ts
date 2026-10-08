import { test, expect } from '@playwright/test';
import { activate, uploadProject } from './helpers';
test('forty fictional students render three downloadable spreads', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('response', response => { if (response.status() >= 500) errors.push(`${response.status()} ${response.url()}`); });
  await activate(page); await uploadProject(page);
  await page.getByRole('button', { name: 'Style', exact: true }).click();
  await page.getByRole('button', { name: 'Generate', exact: true }).click();
  await page.getByRole('button', { name: 'Render all', exact: true }).click();
  if (await page.getByRole('button', { name: 'Render anyway', exact: true }).isVisible()) await page.getByRole('button', { name: 'Render anyway', exact: true }).click();
  await expect(page.getByText('Rendered spreads: 3', { exact: true })).toBeVisible({ timeout: 60_000 });
  for (const name of ['output_01.png', 'output_02.png', 'output_03.png']) await expect(page.getByText(name, { exact: true })).toBeVisible();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download all spreads', exact: true }).click();
  expect(await (await download).failure()).toBeNull();
  expect(errors).toEqual([]);
});

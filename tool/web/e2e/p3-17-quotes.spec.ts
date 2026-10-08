import { test, expect } from '@playwright/test';
import { activate, uploadProject } from './helpers';
test('empty quote uses a placeholder and explicit blank is available', async ({page}) => {
  await activate(page); await uploadProject(page);
  await page.getByText('José García', {exact:true}).first().click();
  const editor = page.locator('.pi-quote textarea');
  await editor.fill('');
  await expect(editor).toHaveValue('');
  await expect(page.getByText('Using the default quote', {exact:true})).toBeVisible();
  await page.getByLabel('No quote for this student').check();
  await expect(page.getByLabel('No quote for this student')).toBeChecked();
});

import { test, expect } from '@playwright/test';
import { activate } from './helpers';

test('fictional portrait crop, framing and print settings persist', async ({ page }) => {
  await activate(page);
  await page.getByRole('button', { name: 'Open help', exact: true }).click();
  await page.getByRole('button', { name: 'Load a sample project', exact: true }).click();
  await expect(page.locator('.people-card')).toHaveCount(8, { timeout: 60_000 });
  await page.locator('.people-card').first().click();
  await page.getByRole('button', { name: 'Adjust portrait', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Apply crop', exact: true })).toBeEnabled();
  await page.getByRole('dialog', { name: 'Adjust portrait' }).screenshot({ path: test.info().outputPath('f4-portrait-editor.png') });
  await page.getByRole('dialog', { name: 'Adjust portrait' }).locator('input[type=range]').fill('2');
  await page.getByRole('button', { name: 'Apply crop', exact: true }).click();


  await page.getByRole('button', { name: 'Style', exact: true }).click();
  await page.getByRole('button', { name: 'Generate', exact: true }).click();
  // Let the initial automatic preview finish before changing print settings.
  // Otherwise its in-flight defaults request can be mistaken for this rerender.
  await expect(page.getByRole('button', { name: 'Re-render preview', exact: true })).toBeEnabled({timeout:60000});
  await page.getByLabel('DPI (72 to 1200)', { exact: true }).fill('150');
  const portrait = page.getByRole('group', { name: 'Portrait shape', exact: true });
  await page.getByText('Portrait shape, border and shadow', { exact: true }).click();
  await portrait.getByRole('combobox', { name: 'Shape', exact: true }).selectOption('ellipse');
  await portrait.getByRole('spinbutton', { name: 'Border width (px)', exact: true }).fill('3');
  await portrait.getByLabel('Shadow', { exact: true }).check();
  const outgoing = page.waitForRequest(request => request.url().endsWith('/api/generation/generate') && request.method() === 'POST');
  await page.getByRole('button', { name: /^(Re-render preview|Render preview)$/ }).click();
  const payload = (await outgoing).postDataJSON();
  expect(payload.output_dpi).toBe(150);
  expect(payload.mugshot_shape).toBe('ellipse');
  expect(payload.mugshot_border_width).toBe(3);
  expect(payload.mugshot_shadow).toBeTruthy();
  await expect(page.getByRole('img', { name: 'preview', exact: true })).toBeVisible({timeout: 60_000});
  await expect(page.getByRole('button', { name: 'Re-render preview', exact: true })).toBeEnabled({timeout: 60000});
  await page.screenshot({ path: test.info().outputPath('f4-render-preview.png'), fullPage: true });
  await page.reload();
  await page.getByText('Portrait shape, border and shadow', { exact: true }).click();
  await expect(page.getByLabel('DPI (72 to 1200)', { exact: true })).toHaveValue('150');
  await expect(page.getByRole('group', { name: 'Portrait shape', exact: true }).getByRole('combobox', { name: 'Shape', exact: true })).toHaveValue('ellipse');
  await page.getByRole('button', { name: 'Template', exact: true }).click();
  await page.getByRole('checkbox', { name: 'Show safe area (preview only)', exact: true }).check({ force: true });
  await expect(page.getByRole('img', { name: 'Template with bleed and safe-area guides' })).toBeVisible();
  await page.screenshot({ path: test.info().outputPath('f4-safe-area.png') });
});

import { test, expect } from '@playwright/test';
import { activate, uploadProject } from './helpers';

test('F1: name colour set in Style shows up in the real-rendered test strip and survives reload', async ({ page }) => {
  await activate(page);
  await uploadProject(page);
  await page.getByRole('button', { name: 'Style', exact: true }).click();

  const name = page.getByTestId('text-style-name');
  await name.locator('summary').click();
  await name.getByLabel('Text colour hex').fill('#ff0000');
  await name.getByLabel('Outline width (px, 0 = none)').fill('0');
  await name.getByLabel('Smallest size allowed (pt)').fill('10');

  await page.getByRole('button', { name: 'Preview with real rendering' }).click();
  const img = page.getByTestId('style-strip-image');
  await expect(img).toBeVisible({ timeout: 90_000 });
  await expect(page.getByText('scaled down for preview')).toBeVisible();

  const redPixels = await img.evaluate((el) => {
    const image = el as HTMLImageElement;
    const c = document.createElement('canvas');
    c.width = image.naturalWidth;
    c.height = image.naturalHeight;
    const ctx = c.getContext('2d')!;
    ctx.drawImage(image, 0, 0);
    const d = ctx.getImageData(0, 0, c.width, c.height).data;
    let n = 0;
    for (let i = 0; i < d.length; i += 4) if (d[i] > 200 && d[i + 1] < 60 && d[i + 2] < 60) n++;
    return n;
  });
  expect(redPixels).toBeGreaterThan(50);

  // Persisted in the session: still red after a reload.
  await page.reload();
  await page.getByRole('button', { name: 'Style', exact: true }).click();
  const again = page.getByTestId('text-style-name');
  await again.locator('summary').click();
  await expect(again.getByLabel('Text colour hex')).toHaveValue('#ff0000');
});

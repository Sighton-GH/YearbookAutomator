import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { expect, type Page } from '@playwright/test';
export async function activate(page: Page) {
  const root = path.resolve('.e2e-data');
  const key = execFileSync('.venv/bin/python', ['-c', "from app.services import licensing; print(licensing.create_license(license_type='commercial', note='fictional-e2e'))"], {
    cwd: '../server', env: { ...process.env, YMGA_WORKSPACE_DATA_DIR: path.join(root, 'workspaces'), YMGA_LICENSE_STORE_DIR: path.join(root, 'licenses'), YMGA_LICENSE_SECRET: 'fictional-e2e-secret' }, encoding: 'utf8'
  }).trim();
  await page.goto('/');
  await page.getByLabel('License key', { exact: true }).fill(key);
  await page.getByRole('button', { name: 'Validate license', exact: true }).click();
  await page.getByRole('button', { name: 'Skip', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Parse template', exact: true })).toBeVisible();
}
export async function uploadProject(page: Page) {
  const project = path.resolve('.e2e-data/project');
  await page.locator('input[type=file]').nth(0).setInputFiles(path.join(project, 'annotated.png'));
  await page.locator('input[type=file]').nth(1).setInputFiles(path.join(project, 'clean.png'));
  await page.getByRole('button', { name: 'Parse template', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Continue to Uploads' }).first()).toBeEnabled({timeout: 60_000});
  await page.getByRole('button', { name: 'Continue to Uploads' }).first().click();
  await page.locator('input[type=file]').nth(0).setInputFiles(path.join(project, 'roster.csv'));
  await page.locator('input[type=file]').nth(1).setInputFiles(path.join(project, 'portraits.zip'));
  await page.locator('input[type=file]').nth(2).setInputFiles(path.join(project, 'quotes.csv'));
  await page.locator('input[type=file]').nth(3).setInputFiles(path.join(project, 'baby.zip'));
  const quotes = page.waitForResponse(r => r.url().includes('/mapping/upload-quotes-spreadsheet') && r.status() === 200);
  const babies = page.waitForResponse(r => r.url().includes('/mapping/upload-baby-zip') && r.status() === 200);
  await page.getByRole('button', { name: 'Process all uploads', exact: true }).click();
  const quoteData = await (await quotes).json();
  const babyData = await (await babies).json();
  expect(quoteData.people.filter((p: any) => p.quote).length).toBeGreaterThan(30);
  expect(babyData.people.filter((p: any) => p.baby_photo_filename).length).toBe(20);
  await expect(page.locator('.people-card-selectable').first()).toBeVisible({timeout: 60000});
  await page.getByRole('button', { name: 'People', exact: true }).click();
}

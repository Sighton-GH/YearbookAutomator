import {test, expect} from '@playwright/test';
import {activate, uploadProject} from './helpers';

// Mocks only the slow background-removal job so Stop, navigation and unmount can be raced deterministically.
async function mockSlowJob(page: import('@playwright/test').Page) {
  const seen = {started: 0, cancelled: [] as string[]};
  await page.route('**/api/mapping/remove-background', async route => {seen.started++; await route.fulfill({json: {job_id: `job-${seen.started}`, output_filename: 'never.png'}});});
  await page.route('**/api/mapping/remove-background-status*', route => route.fulfill({json: {job_id: 'job', workspace_id: 'w', kind: 'baby', mode: 'x', source_filename: 's', output_filename: '', progress: 20, status: 'running'}}));
  await page.route('**/api/mapping/remove-background-cancel', async route => {seen.cancelled.push(route.request().postData() ?? ''); await route.fulfill({json: {}});});
  return seen;
}
const babyNames = (page: import('@playwright/test').Page) => page.evaluate(() => {
  const stored = JSON.parse(localStorage.getItem('ymga.session.v1') || '{}');
  return ((stored.session || stored)?.people ?? []).map((p: {baby_photo_filename?: string | null}) => p.baby_photo_filename ?? null);
});

test('Stop cancels the running bulk job and leaves every baby photo untouched', async ({page}) => {
  await activate(page); await uploadProject(page);
  const seen = await mockSlowJob(page); const before = await babyNames(page);
  await page.getByRole('button', {name: 'Select all', exact: true}).click();
  await page.getByRole('button', {name: 'Remove baby photo backgrounds', exact: true}).click();
  await expect.poll(() => seen.started).toBe(1);
  await page.getByRole('button', {name: 'Stop queue', exact: true}).click();
  await expect(page.getByRole('status').filter({hasText: 'Queue stopped'})).toBeVisible();
  expect(seen.cancelled.length).toBeGreaterThan(0);
  expect(seen.started).toBe(1);
  expect(await babyNames(page)).toEqual(before);
});

test('leaving the People tab mid-queue cancels the job and starts no further students', async ({page}) => {
  await activate(page); await uploadProject(page);
  const seen = await mockSlowJob(page); const before = await babyNames(page);
  await page.getByRole('button', {name: 'Select all', exact: true}).click();
  await page.getByRole('button', {name: 'Remove baby photo backgrounds', exact: true}).click();
  await expect.poll(() => seen.started).toBe(1);
  await page.getByRole('button', {name:'Style',exact:true}).click();
  await expect.poll(() => seen.cancelled.length).toBeGreaterThan(0);
  await page.waitForTimeout(2500);
  expect(seen.started).toBe(1);
  await page.getByRole('button', {name:'People',exact:true}).click();
  await expect(page.getByRole('button', {name: 'Stop queue', exact: true})).toHaveCount(0);
  await expect(page.getByRole('button', {name: 'Remove baby photo backgrounds', exact: true})).toBeEnabled();
  expect(await babyNames(page)).toEqual(before);
});

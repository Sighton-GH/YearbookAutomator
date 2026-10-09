import {test,expect} from '@playwright/test';
import {activate,uploadProject} from './helpers';
test('pending shift survives People to Style navigation',async({page})=>{
 await activate(page);await uploadProject(page);
 await page.locator('.people-card-selectable').first().click();
 await page.getByLabel('Shift down').check();
 await page.waitForTimeout(500); await page.reload();
 // After a reload the app restores the session from the server; step clicks are ignored until then.
 await expect(page.getByText(/Session expires at/).first()).toBeVisible();
 await page.locator('.people-card-selectable').first().click();
 await expect(page.getByLabel('Shift down')).toBeChecked();
 // The step rail ignores clicks while the app is busy (aria-disabled); wait until each step is clickable.
 const goTo = async (name: string) => {
  const step = page.getByRole('button',{name,exact:true});
  // A click can still be dropped while the restored session settles, so retry until the step opens.
  await expect(async () => {
   await expect(step).not.toHaveAttribute('aria-disabled','true');
   await step.click();
   await expect(page.getByRole('heading',{name,level:2})).toBeVisible({timeout:2000});
  }).toPass({timeout:20000});
 };
 await goTo('Style');
 await goTo('People');
 await page.locator('.people-card-selectable').first().click();
 await expect(page.getByLabel('Shift down')).toBeChecked();
});

test('unprocessed ordinary uploads require a leave decision', async ({page}) => {
 await activate(page); await uploadProject(page);
 await page.getByRole('button',{name:'Uploads',exact:true}).click();
 const path = await import('node:path');
 await page.locator('input[type=file]').first().setInputFiles(path.resolve('.e2e-data/project/roster.csv'));
 await page.getByRole('button',{name:'People',exact:true}).click();
 await expect(page.getByRole('dialog',{name:'Leave without uploading?'})).toBeVisible();
 await page.getByRole('button',{name:'Stay here',exact:true}).first().click();
 await expect(page.getByRole('button',{name:'Process all uploads',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'People',exact:true}).click();
 await page.getByRole('button',{name:'Leave step',exact:true}).click();
 await expect(page.locator('.people-card-selectable').first()).toBeVisible();
});

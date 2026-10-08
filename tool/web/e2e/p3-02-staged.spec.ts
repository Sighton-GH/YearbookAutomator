import {test,expect} from '@playwright/test';
import {activate,uploadProject} from './helpers';
test('pending shift survives People to Style navigation',async({page})=>{
 await activate(page);await uploadProject(page);
 await page.locator('.people-card-selectable').first().click();
 await page.getByLabel('Shift down').check();
 await page.getByRole('button',{name:'Style',exact:true}).click();
 await page.getByRole('button',{name:'People',exact:true}).click();
 await page.locator('.people-card-selectable').first().click();
 await expect(page.getByLabel('Shift down')).toBeChecked();
});

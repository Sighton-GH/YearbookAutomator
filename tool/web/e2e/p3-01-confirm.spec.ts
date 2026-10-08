import {test,expect} from '@playwright/test';
import {activate,uploadProject} from './helpers';
test('missing content is named and Go back does not render spreads',async({page})=>{
 await activate(page);await uploadProject(page);
 await page.getByRole('button',{name:'Generate',exact:true}).click();
 await expect(page.getByRole('button',{name:'Render all',exact:true})).toBeEnabled({timeout:45000});
 await page.getByRole('button',{name:'Render all',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'Render with missing content?'});
 await expect(dialog).toContainText('Ana');
 await expect(dialog).toContainText('404 quote not found');
 await page.getByRole('button',{name:'Go back',exact:true}).first().click();
 await expect(dialog).not.toBeVisible();
 await expect(page.getByText('output_01.png',{exact:true})).not.toBeVisible();
});

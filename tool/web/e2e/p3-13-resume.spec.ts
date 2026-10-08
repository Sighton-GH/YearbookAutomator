import {test,expect} from '@playwright/test';
import {activate,uploadProject} from './helpers';
test('reload resumes current job then remaining spreads without another usage charge',async({page})=>{
 await activate(page);await uploadProject(page);
 await page.getByRole('button',{name:'Generate',exact:true}).click();
 await expect(page.getByRole('button',{name:'Render all',exact:true})).toBeEnabled({timeout:45000});
 await page.getByRole('button',{name:'Render all',exact:true}).click();
 await page.getByRole('button',{name:'Render anyway',exact:true}).click();
 await page.waitForFunction(()=>!!sessionStorage.getItem('ymga.inflightRender.v1'));
 await page.reload();
 await expect(page.getByText('Rendered spreads: 3',{exact:true})).toBeVisible({timeout:60000});
 for (const name of ['output_01.png','output_02.png','output_03.png']) await expect(page.getByText(name,{exact:true})).toBeVisible();
});

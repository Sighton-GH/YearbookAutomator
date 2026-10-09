import {test,expect} from '@playwright/test';
import {activate} from './helpers';
test('active commercial session cannot be displaced by another key holder',async({page,browser})=>{
 await activate(page);
 const key=await page.evaluate(()=>localStorage.getItem('ymga_license_key')!);
 const ctx=await browser.newContext();const second=await ctx.newPage();
 await second.goto('/');await second.getByLabel('License key',{exact:true}).fill(key);
 await second.getByRole('button',{name:'Validate license',exact:true}).click();
 await expect(second.getByRole('button',{name:'Try again',exact:true})).toBeVisible();
 await expect(second.getByRole('button',{name:'Take over this session',exact:true})).toBeDisabled();
 await ctx.close();
});

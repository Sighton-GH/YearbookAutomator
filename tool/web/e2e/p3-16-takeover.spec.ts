import {test,expect} from '@playwright/test';
import {activate} from './helpers';
test('commercial owner can move their lock to another device',async({page,browser})=>{
 await activate(page);
 const key=await page.evaluate(()=>localStorage.getItem('ymga_license_key')!);
 const ctx=await browser.newContext();const second=await ctx.newPage();
 await second.goto('/');await second.getByLabel('License key',{exact:true}).fill(key);
 await second.getByRole('button',{name:'Validate license',exact:true}).click();
 await expect(second.getByRole('button',{name:'Try again',exact:true})).toBeVisible();
 await second.getByRole('button',{name:'Take over this session',exact:true}).click();
 await second.getByRole('button',{name:'Take over',exact:true}).click();
 if (await second.getByRole('button',{name:'Skip',exact:true}).isVisible()) await second.getByRole('button',{name:'Skip',exact:true}).click();
 await expect(second.getByRole('button',{name:'Parse template',exact:true})).toBeVisible();
 await ctx.close();
});

import {test,expect} from '@playwright/test';
import {activate,uploadProject} from './helpers';
test('portrait reset baseline is saved across reload',async({page})=>{
 await activate(page);await uploadProject(page);
 await page.reload();
 const original=await page.evaluate(()=>JSON.parse(localStorage.getItem('ymga.session.v1')||'{}').originalPeople);
 expect(original).toHaveLength(40);
 expect(original[0].mugshot_filename).toBeTruthy();
});

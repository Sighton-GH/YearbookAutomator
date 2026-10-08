import {test,expect} from '@playwright/test';
import path from 'node:path';
import {activate,uploadProject} from './helpers';
test('editor uses each students ellipse or rectangle mask',async({page})=>{
 await activate(page);await uploadProject(page);
 const source=path.resolve('.e2e-data/project/portraits.zip');
 // Use an existing fictional portrait fixture extracted by the test setup below.
 const {execFileSync}=await import('node:child_process');
 execFileSync('python3',['-c',"import zipfile; z=zipfile.ZipFile('"+source+"'); open('.e2e-data/baby.png','wb').write(z.read(z.namelist()[0]))"]);
 for(let i=0;i<2;i++){
   await page.locator('.people-card-selectable').nth(i).click();
   await page.locator('.pi-section').filter({has:page.getByText('Baby photo',{exact:true})}).locator('input[type=file]').setInputFiles(path.resolve('.e2e-data/baby.png'));
   await page.getByTestId('baby-editor-clip').waitFor({state:'visible'});
   const clip=page.getByTestId('baby-editor-clip');
   await expect(clip).toHaveCSS('mask-image',/url\(.+baby-mask.+\)/);
   await page.screenshot({path:`test-results/p3-05-mask-${i}.png`});
   await page.getByRole('button',{name:'Close',exact:true}).click();
   if(await page.getByRole('dialog',{name:'Discard baby photo edits'}).isVisible()) await page.getByRole('button',{name:'Discard changes',exact:true}).click();
 }
});

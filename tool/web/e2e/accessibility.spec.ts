import {test,expect} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import fs from 'node:fs';
import {activate,uploadProject} from './helpers';
test('no serious or critical accessibility issues across populated steps', async({page}) => {
 await activate(page);
 const initial=await new AxeBuilder({page}).analyze();
 const results=[{step:'light-Template-upload',violations:initial.violations.filter(v=>['serious','critical'].includes(v.impact ?? ''))}];
 await page.getByRole('button',{name:'Switch to dark theme',exact:true}).click();
 const initialDark=await new AxeBuilder({page}).analyze();
 results.push({step:'dark-Template-upload',violations:initialDark.violations.filter(v=>['serious','critical'].includes(v.impact ?? ''))});
 await page.getByRole('button',{name:'Switch to light theme',exact:true}).click();
 await uploadProject(page);
 for(const theme of ['light','dark']) {
 if(theme === 'dark') await page.getByRole('button',{name:'Switch to dark theme',exact:true}).click();
 for(const step of ['Template','Uploads','People','Style','Generate']) {
  await page.getByRole('button',{name:step,exact:true}).click();
  if(step === 'Generate') { const cancel=page.getByRole('button',{name:'Cancel',exact:true}); if(await cancel.isVisible()) await cancel.click(); }
  await page.screenshot({path:test.info().outputPath(`yearbook-axe-final-${theme}-${step}.png`),fullPage:true});
  const scan=await new AxeBuilder({page}).analyze();
  results.push({step: `${theme}-${step}`,violations:scan.violations.filter(v => ['serious','critical'].includes(v.impact ?? ''))});
 }
 }
 fs.writeFileSync(test.info().outputPath('yearbook-axe.json'), JSON.stringify(results,null,2));
 expect(results.flatMap(r => r.violations.map(v => `${r.step}: ${v.id} ${v.nodes.map(n => n.target).join(';')}`))).toEqual([]);
});

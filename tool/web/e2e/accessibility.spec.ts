import {test,expect} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import fs from 'node:fs';
import {activate,uploadProject} from './helpers';
test('no serious or critical accessibility issues across populated steps', async({page}) => {
 await activate(page); await uploadProject(page);
 const results=[];
 for(const step of ['People','Style','Generate']) {
  await page.getByRole('button',{name:step,exact:true}).click();
  const scan=await new AxeBuilder({page}).analyze();
  results.push({step,violations:scan.violations.filter(v => ['serious','critical'].includes(v.impact ?? ''))});
 }
 fs.writeFileSync('/tmp/yearbook-axe.json', JSON.stringify(results,null,2));
 expect(results.flatMap(r => r.violations.map(v => `${r.step}: ${v.id} ${v.nodes.map(n => n.target).join(';')}`))).toEqual([]);
});

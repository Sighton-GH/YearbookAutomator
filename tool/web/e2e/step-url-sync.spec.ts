import {test,expect} from '@playwright/test';
import {activate,uploadProject} from './helpers';

// Regression: the URL -> step and step -> URL effects used to swap values forever when the
// server-restored step differed from ?step= (the page flickered between two steps).
test('deep-linked step survives workspace restore without flickering',async({page})=>{
 await activate(page); await uploadProject(page);
 await expect(page.getByRole('heading',{name:'People',level:2})).toBeVisible();
 await page.waitForTimeout(2000); // let the debounced session snapshot reach the server
 await page.goto('/?step=style');
 await expect(page.getByText(/Session expires at/).first()).toBeVisible();
 await expect(page.getByRole('heading',{name:'Style',level:2})).toBeVisible();
 const flips = await page.evaluate(() => new Promise<number>(res => {
  let n = 0; let last = document.querySelector('h2')?.textContent;
  const t = setInterval(() => { const h = document.querySelector('h2')?.textContent; if (h !== last) { n++; last = h; } }, 20);
  setTimeout(() => { clearInterval(t); res(n); }, 3000);
 }));
 expect(flips).toBe(0);
 await expect(page.getByRole('heading',{name:'Style',level:2})).toBeVisible();
 await expect(page).toHaveURL(/step=style/);
});

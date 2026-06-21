const { chromium } = require('playwright');
(async()=>{
  const browser = await chromium.launch({headless:true});
  const page = await browser.newPage();
  page.on('response', async (resp) => {
    const url = resp.url();
    if (url.includes('images-api.nasa.gov') || url.includes('/search')) {
      console.log('RESP', resp.status(), url);
    }
  });
  await page.goto('https://images.nasa.gov/', {waitUntil:'domcontentloaded'});
  await page.waitForTimeout(2000);
  console.log('TITLE', await page.title());
  console.log('INPUTS', JSON.stringify(await page.locator('input').evaluateAll(els => els.map((e,i)=>({i, type:e.type, placeholder:e.placeholder, name:e.name, aria:e.getAttribute('aria-label'), id:e.id}))), null, 2));
  const input = page.locator('input').first();
  await input.fill('Artemis II');
  await input.press('Enter');
  await page.waitForTimeout(6000);
  console.log('AFTER_URL', page.url());
  console.log('AFTER_TITLE', await page.title());
  console.log('BODY', (await page.locator('body').innerText()).slice(0,4000));
  const links = await page.locator('a').evaluateAll(els => els.map(a => ({text:(a.textContent||'').trim(), href:a.href})).filter(x=>x.href).slice(0,50));
  console.log('LINKS', JSON.stringify(links, null, 2));
  await browser.close();
})();
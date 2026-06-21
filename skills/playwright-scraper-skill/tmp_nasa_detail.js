const { chromium } = require('playwright');
const url = process.argv[2];
(async()=>{
  const browser = await chromium.launch({headless:true});
  const page = await browser.newPage();
  await page.goto(url, {waitUntil:'domcontentloaded'});
  await page.waitForTimeout(5000);
  console.log('TITLE', await page.title());
  console.log('BODY', (await page.locator('body').innerText()).slice(0,5000));
  const imgs = await page.locator('img').evaluateAll(els => els.map(img => ({src:img.src, alt:img.alt, w:img.naturalWidth, h:img.naturalHeight})).filter(x=>x.src));
  console.log('IMGS', JSON.stringify(imgs.slice(0,20), null, 2));
  const links = await page.locator('a').evaluateAll(els => els.map(a => ({text:(a.textContent||'').trim(), href:a.href})).filter(x=>x.href && /download|orig|jpg|jpeg|png/i.test(x.href + ' ' + x.text)).slice(0,20));
  console.log('DLINKS', JSON.stringify(links, null, 2));
  await browser.close();
})();
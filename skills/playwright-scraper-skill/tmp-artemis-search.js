const { chromium } = require('playwright');

(async() => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto('https://images.nasa.gov/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(3000);
  const input = page.locator('input').first();
  await input.fill('Artemis II');
  await input.press('Enter');
  await page.waitForTimeout(8000);
  console.log('URL:', page.url());
  console.log('TITLE:', await page.title());
  console.log('BODY:', (await page.locator('body').innerText()).slice(0, 8000));
  const links = await page.locator('a').evaluateAll(els => els.map(a => ({href:a.href, text:(a.textContent||'').trim()})).filter(x => x.href.includes('/details/') || x.href.includes('/asset/')).slice(0,50));
  console.log('LINKS:', JSON.stringify(links, null, 2));
  await browser.close();
})();

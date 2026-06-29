const { chromium } = require('playwright');
const query = process.argv.slice(2).join(' ') || 'Artemis II';
(async() => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto('https://images.nasa.gov/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(2000);
  const input = page.locator('input').first();
  await input.fill(query);
  await input.press('Enter');
  await page.waitForTimeout(7000);
  console.log('URL:', page.url());
  const links = await page.locator('a').evaluateAll(els => els.map(a => ({href:a.href, text:(a.textContent||'').replace(/\s+/g,' ').trim()})).filter(x => x.href.includes('/details/')).slice(0,80));
  console.log(JSON.stringify(links, null, 2));
  await browser.close();
})();

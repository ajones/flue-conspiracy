const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const url = 'https://images.nasa.gov/search-results?q=Artemis%20II&media=image';
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForTimeout(6000);

  for (let i = 0; i < 6; i++) {
    await page.mouse.wheel(0, 2200);
    await page.waitForTimeout(1500);
  }

  const items = await page.evaluate(() => {
    const map = new Map();
    const links = Array.from(document.querySelectorAll('a[href*="/details/"]'));
    for (const a of links) {
      const href = a.getAttribute('href') || '';
      const abs = href.startsWith('http') ? href : `https://images.nasa.gov${href}`;
      const title = (a.textContent || '').trim().replace(/\s+/g, ' ');
      if (!map.has(abs)) map.set(abs, { url: abs, title });
    }
    return Array.from(map.values());
  });

  console.log(JSON.stringify({ count: items.length, items }, null, 2));
  await browser.close();
})();

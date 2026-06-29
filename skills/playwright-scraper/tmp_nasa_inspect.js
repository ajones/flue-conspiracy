const { chromium } = require('playwright');
(async() => {
  const urls = [
    'https://images.nasa.gov/details/KSC-20250730-AU-LMM01-0001-Artemis_II_Crew_Media_Event_Press_Site_Bullpen-M15737',
    'https://images.nasa.gov/details/KSC-20260401-AU-LMM01-0001-Artemis_II_Live_Launch_Coverage_Pad_CS1',
    'https://images.nasa.gov/details/KSC-20260401-AU-LMM01-0001-Artemis_II_Live_Launch_Coverage_Gantry'
  ];
  const browser = await chromium.launch({ headless: true });
  for (const url of urls) {
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(4000);
    const data = await page.evaluate(() => ({
      title: document.title,
      downloadLinks: Array.from(document.querySelectorAll('a')).map(a => ({ text: a.innerText.trim(), href: a.href })).filter(x => /DOWNLOAD|\.jpg|\.jpeg|\.png/i.test(x.text) || /download|jpg|jpeg|png/i.test(x.href)),
      mediaEls: Array.from(document.querySelectorAll('img,video,audio,source')).map(el => ({ tag: el.tagName, src: el.currentSrc || el.src || el.getAttribute('src'), type: el.getAttribute('type'), poster: el.getAttribute('poster') })).filter(x => x.src || x.poster)
    }));
    console.log('\nURL', url);
    console.log(JSON.stringify(data, null, 2));
    await page.close();
  }
  await browser.close();
})();
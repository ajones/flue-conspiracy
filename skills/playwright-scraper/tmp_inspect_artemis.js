const { chromium } = require('playwright');
const urls=['https://images.nasa.gov/details/art002e009288','https://images.nasa.gov/details/art002e009289','https://images.nasa.gov/details/art002e009298'];
(async()=>{
 const browser=await chromium.launch({headless:true});
 for (const url of urls){
  const page=await browser.newPage();
  await page.goto(url,{waitUntil:'domcontentloaded',timeout:120000});
  await page.waitForTimeout(4000);
  const data=await page.evaluate(()=>{
    const text=(sel)=>document.querySelector(sel)?.textContent?.trim();
    const meta=[...document.querySelectorAll('meta')].map(m=>({name:m.name,property:m.property,content:m.content})).filter(m=>m.content);
    const imgs=[...document.querySelectorAll('img')].map(i=>({src:i.src,alt:i.alt})).slice(0,8);
    return {title:text('h1'), meta:meta.slice(0,20), imgs};
  });
  console.log('\nURL',url); console.log(JSON.stringify(data,null,2));
  await page.close();
 }
 await browser.close();
})();